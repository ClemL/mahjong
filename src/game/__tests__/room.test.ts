import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAIM_WINDOW_MS,
  HEARTBEAT_WRITE_MS,
  SEAT_IDLE_MS,
  type Room,
  drain,
  identify,
  isHumanSeat,
  newRoom,
  pendingHumanClaimants,
  syncSeats,
  touch,
  viewFor,
} from "../room";
import { discard } from "../engine";
import type { Seat } from "../tiles";

function seat(room: Room, index: Seat, token: string, name = "Someone"): void {
  room.seats[index] = { kind: "human", name, token, lastSeen: Date.now() };
  syncSeats(room);
}

describe("seating", () => {
  let room: Room;
  beforeEach(() => {
    room = newRoom("TEST", undefined, 42);
  });

  it("starts with every seat open and none human to the engine", () => {
    expect(room.seats.every((s) => s.kind === "open")).toBe(true);
    expect(room.state.players.every((p) => !p.isHuman)).toBe(true);
  });

  it("identifies a player by their token and nobody else", () => {
    seat(room, 1, "tok-south");
    expect(identify(room, "tok-south")).toEqual({ role: "player", seat: 1 });
    expect(identify(room, "wrong")).toEqual({ role: "spectator", seat: null });
    expect(identify(room, null)).toEqual({ role: "spectator", seat: null });
  });

  it("identifies the table device", () => {
    room.table = { token: "tok-table", lastSeen: Date.now() };
    expect(identify(room, "tok-table")).toEqual({ role: "table", seat: null });
  });

  it("marks only claimed seats as human for the engine", () => {
    seat(room, 2, "tok-west");
    expect(isHumanSeat(room, 2)).toBe(true);
    expect(isHumanSeat(room, 0)).toBe(false);
    expect(room.state.players.map((p) => p.isHuman)).toEqual([false, false, true, false]);
  });
});

describe("redaction", () => {
  let room: Room;
  beforeEach(() => {
    room = newRoom("TEST", undefined, 7);
    seat(room, 0, "tok-east", "Kris");
    seat(room, 1, "tok-south", "Srini");
    room.table = { token: "tok-table", lastSeen: Date.now() };
  });

  it("shows a player their own tiles and nobody else's", () => {
    const view = viewFor(room, "tok-east");
    expect(view.you).toEqual({ role: "player", seat: 0 });
    const mine = view.players[0];
    expect(mine.hand.map((t) => t.code)).toEqual(room.state.players[0].hand.map((t) => t.code));
    for (const other of [1, 2, 3]) {
      expect(view.players[other].hand.every((t) => t.code === "back")).toBe(true);
      expect(view.players[other].handCount).toBe(room.state.players[other].hand.length);
    }
  });

  it("shows the table device nobody's tiles at all", () => {
    const view = viewFor(room, "tok-table");
    expect(view.you.role).toBe("table");
    for (const player of view.players) {
      expect(player.hand.every((t) => t.code === "back")).toBe(true);
    }
    // Counts, melds and flowers are public — concealed tiles are not.
    expect(view.players.map((p) => p.handCount)).toEqual(
      room.state.players.map((p) => p.hand.length),
    );
  });

  it("never sends the wall", () => {
    for (const token of ["tok-east", "tok-table", null]) {
      const view = viewFor(room, token);
      expect(view.wallCount).toBeGreaterThan(0);
      expect(JSON.stringify(view)).not.toContain('"wall"');
    }
  });

  it("gives a spectator no hand and no actions", () => {
    const view = viewFor(room, null);
    expect(view.you).toEqual({ role: "spectator", seat: null });
    expect(view.actions).toBeNull();
    expect(view.claim).toBeNull();
    expect(view.players.every((p) => p.hand.every((t) => t.code === "back"))).toBe(true);
  });

  it("only reveals the drawn tile to the seat holding it", () => {
    const dealer = room.state.dealer;
    room.state.turn = dealer;
    expect(viewFor(room, dealer === 0 ? "tok-east" : "tok-south").drawnTileId).toBe(
      dealer === 0 || dealer === 1 ? room.state.drawnTileId : null,
    );
    expect(viewFor(room, "tok-table").drawnTileId).toBeNull();
  });
});

describe("draining", () => {
  it("does not start play until somebody sits down", () => {
    const room = newRoom("TEST", undefined, 3);
    const before = JSON.stringify(room.state);
    // Otherwise a room plays itself out between being opened and anyone
    // joining, and the first to arrive finds a finished hand.
    expect(drain(room)).toBe(false);
    expect(JSON.stringify(room.state)).toBe(before);
  });

  it("plays the computer seats up to the first person's turn", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 2, "tok-west");
    drain(room);
    if (room.state.phase === "action") {
      expect(room.state.turn).toBe(2);
      expect(room.state.players.some((p) => p.discards.length > 0)).toBe(true);
    }
  });

  it("stops when it reaches a person's turn", () => {
    const room = newRoom("TEST", undefined, 11);
    seat(room, room.state.dealer, "tok");
    drain(room);
    expect(room.state.phase).not.toBe("handOver");
    expect(isHumanSeat(room, room.state.turn)).toBe(true);
  });

  it("waits for a person to answer a claim, then moves on when the window closes", () => {
    const room = newRoom("TEST", undefined, 21);
    // Seat everyone so a discard always needs answers from people.
    for (const s of [0, 1, 2, 3] as Seat[]) seat(room, s, `tok-${s}`);
    drain(room);

    // Drive to a discard by hand so a claim window opens.
    const dealer = room.state.dealer;
    const tile = room.state.players[dealer].hand[0];
    room.state = discard(room.state, dealer, tile.id);
    if (room.state.phase !== "claiming") return; // nothing claimable on this deal
    room.claimDeadline = Date.now() + CLAIM_WINDOW_MS;

    const waiting = pendingHumanClaimants(room);
    expect(waiting.length).toBeGreaterThan(0);
    drain(room, Date.now());
    expect(room.state.phase).toBe("claiming");

    // Past the deadline the unanswered seats are treated as passes.
    drain(room, Date.now() + CLAIM_WINDOW_MS + 1);
    expect(room.state.phase).not.toBe("claiming");
  });

  it("records a claim answer and resolves once everyone has replied", () => {
    const room = newRoom("TEST", undefined, 33);
    for (const s of [0, 1, 2, 3] as Seat[]) seat(room, s, `tok-${s}`);
    drain(room);
    const dealer = room.state.dealer;
    room.state = discard(room.state, dealer, room.state.players[dealer].hand[0].id);
    if (room.state.phase !== "claiming") return;
    for (const claimant of pendingHumanClaimants(room)) {
      room.claimResponses[String(claimant)] = null;
    }
    drain(room);
    expect(room.state.phase).not.toBe("claiming");
  });
});

describe("presence", () => {
  it("treats a quiet seat as away and lets the computer play it", () => {
    const room = newRoom("TEST", undefined, 4);
    seat(room, 0, "tok-east");
    const now = Date.now();
    expect(isHumanSeat(room, 0, now)).toBe(true);
    // Long enough without a word and the table stops waiting.
    const later = now + SEAT_IDLE_MS + 1;
    expect(isHumanSeat(room, 0, later)).toBe(false);
    expect(viewFor(room, "tok-east", later).players[0].occupant.away).toBe(true);
  });

  it("keeps the seat, so coming back reclaims it", () => {
    const room = newRoom("TEST", undefined, 4);
    seat(room, 0, "tok-east", "Kris");
    const later = Date.now() + SEAT_IDLE_MS + 1;
    expect(room.seats[0].kind).toBe("human");
    expect(touch(room, "tok-east", later)).toBe(true);
    expect(isHumanSeat(room, 0, later)).toBe(true);
    expect(viewFor(room, "tok-east", later).players[0].occupant.name).toBe("Kris");
  });

  it("only writes a heartbeat once it has gone stale", () => {
    const room = newRoom("TEST", undefined, 4);
    const now = Date.now();
    room.seats[0] = { kind: "human", name: "Kris", token: "tok", lastSeen: now };
    // A poll a second later is not worth a write.
    expect(touch(room, "tok", now + 1000)).toBe(false);
    expect(touch(room, "tok", now + HEARTBEAT_WRITE_MS + 1)).toBe(true);
  });

  it("ignores an unknown token", () => {
    const room = newRoom("TEST", undefined, 4);
    seat(room, 0, "tok-east");
    expect(touch(room, "someone-else", Date.now())).toBe(false);
    expect(touch(room, null, Date.now())).toBe(false);
  });

  it("plays on when everyone has wandered off", () => {
    const room = newRoom("TEST", undefined, 12);
    seat(room, 0, "tok-east");
    const later = Date.now() + SEAT_IDLE_MS + 1;
    // Nobody is present, but the game has started, so it does not freeze.
    expect(drain(room, later)).toBe(true);
    expect(["handOver", "gameOver"]).toContain(room.state.phase);
  });

  it("does not wait on an absent seat's claim", () => {
    const room = newRoom("TEST", undefined, 21);
    for (const s of [0, 1, 2, 3] as Seat[]) seat(room, s, `tok-${s}`);
    drain(room);
    const dealer = room.state.dealer;
    room.state = discard(room.state, dealer, room.state.players[dealer].hand[0].id);
    if (room.state.phase !== "claiming") return;
    const later = Date.now() + SEAT_IDLE_MS + 1;
    expect(pendingHumanClaimants(room, later)).toEqual([]);
  });
});
