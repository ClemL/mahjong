import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAIM_BEAT_MS,
  CLAIM_MORE_TIME_MS,
  CLAIM_WINDOW_MS,
  DEAL_MS,
  DEFAULT_ROOM_SETTINGS,
  FLOWER_STEP_MS,
  HEARTBEAT_WRITE_MS,
  HURRY_COOLDOWN_MS,
  HURRY_FLASH_MS,
  HURRY_GRACE_MS,
  MORE_TIME_MS,
  OPENING_TURN_BONUS_MS,
  SEAT_IDLE_MS,
  type Room,
  drain,
  extendClaim,
  grantMoreTime,
  hurryUp,
  identify,
  isHumanSeat,
  mayDeal,
  mayRegroup,
  newRoom,
  noteActing,
  dealShowMs,
  normalizeRoom,
  pendingHumanClaimants,
  replaceWithComputer,
  returnToLobby,
  robotName,
  robotVersion,
  shouldRegroup,
  sitDown,
  startPlay,
  pauseTable,
  resumeTable,
  TABLE_IDLE_MS,
  openTable,
  TAKE_BACK_MS,
  noteDiscard,
  takeBackDiscard,
  takeBackRefusal,
  syncSeats,
  touch,
  viewFor,
} from "../room";
import { createGame, discard } from "../engine";
import type { Seat } from "../tiles";

function seat(room: Room, index: Seat, token: string, name = "Someone"): void {
  room.seats[index] = { kind: "human", name, token, lastSeen: Date.now() };
  syncSeats(room);
}

/**
 * The turn on the table already under way: stamped from when its deal was
 * shown, and past the first moments nobody may hurry it in. Returns the
 * first moment it may be.
 */
function underway(room: Room): number {
  noteActing(room, room.lastStepAt);
  return room.lastStepAt + HURRY_GRACE_MS;
}

/** A room past its lobby, which is where most of these tests start. */
function dealt(id: string, seed: number, seats: Seat[]): Room {
  const room = newRoom(id, undefined, seed);
  for (const s of seats) seat(room, s, `tok-${s}`);
  startPlay(room);
  return room;
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
    seat(room, 0, "tok-0", "Kris");
    seat(room, 1, "tok-south", "Srini");
    room.table = { token: "tok-table", lastSeen: Date.now() };
    startPlay(room);
  });

  it("shows a player their own tiles and nobody else's", () => {
    const view = viewFor(room, "tok-0");
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

  it("shows every hand to everyone once the hand is over, and never before", () => {
    for (const token of ["tok-0", "tok-table", null]) {
      expect(viewFor(room, token).players[1].hand.every((t) => t.code === "back")).toBe(true);
    }
    room.state = { ...room.state, phase: "handOver" };
    for (const token of ["tok-0", "tok-table", null]) {
      const view = viewFor(room, token);
      for (const player of view.players) {
        expect(player.hand.map((t) => t.code)).toEqual(
          room.state.players[player.seat].hand.map((t) => t.code),
        );
      }
      expect(JSON.stringify(view)).not.toContain('"wall"');
    }
  });

  it("never sends the wall", () => {
    for (const token of ["tok-0", "tok-table", null]) {
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
    expect(viewFor(room, dealer === 0 ? "tok-0" : "tok-south").drawnTileId).toBe(
      dealer === 0 || dealer === 1 ? room.state.drawnTileId : null,
    );
    expect(viewFor(room, "tok-table").drawnTileId).toBeNull();
  });

  it("names the drawn tile to everyone once the hand is over, when every hand is face up", () => {
    const drawn = room.state.drawnTileId;
    expect(drawn).not.toBeNull();
    room.state = { ...room.state, phase: "handOver" };
    for (const token of ["tok-0", "tok-south", "tok-table", null]) {
      expect(viewFor(room, token).drawnTileId).toBe(drawn);
    }
  });
});

describe("the deal on the table screen", () => {
  it("tells every view how long the table is still showing the deal", () => {
    const room = newRoom("DEAL", undefined, 9);
    seat(room, 0, "tok-0");
    room.table = { token: "tok-table", lastSeen: Date.now() };
    const now = Date.now();
    startPlay(room, now);
    const flowers = room.state.players.reduce((n, p) => n + p.flowers.length, 0);
    expect(viewFor(room, "tok-0", now).openingLeft).toBe(DEAL_MS + flowers * FLOWER_STEP_MS);
    expect(viewFor(room, "tok-table", now + 1000).openingLeft).toBe(DEAL_MS + flowers * FLOWER_STEP_MS - 1000);
    // Done showing it: nothing left to wait for.
    expect(viewFor(room, "tok-0", room.lastStepAt + 1).openingLeft).toBe(0);
  });

  it("is 0 without a table screen, which shows no deal", () => {
    const room = newRoom("DEAL", undefined, 9);
    seat(room, 0, "tok-0");
    startPlay(room);
    expect(viewFor(room, "tok-0").openingLeft).toBe(0);
  });
});

describe("the felt's deal", () => {
  const state = createGame({ seed: 11, humanSeat: 0 });

  it("holds the deal as long as the felt takes to show it", () => {
    const flowers = state.players.reduce((n, p) => n + p.flowers.length, 0);
    expect(dealShowMs(state)).toBe(DEAL_MS + flowers * FLOWER_STEP_MS);
  });
});

describe("lobby", () => {
  it("deals nothing until somebody deals", () => {
    const room = newRoom("TEST", undefined, 3);
    expect(room.started).toBe(false);
    expect(room.state.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(room.state.wall).toHaveLength(0);
  });

  it("does not start play while people are still arriving", () => {
    const room = newRoom("TEST", undefined, 5);
    // The whole point: whoever connects first must not kick off a hand that
    // the computer then plays on everyone else's behalf while they join.
    seat(room, 2, "tok-west");
    expect(drain(room)).toBe(false);
    expect(room.state.players.every((p) => p.discards.length === 0)).toBe(true);

    for (const s of [0, 1, 3] as Seat[]) seat(room, s, `tok-${s}`);
    expect(room.state.players.every((p) => p.hand.length === 0)).toBe(true);
  });

  it("deals everyone a full hand when play starts", () => {
    const room = newRoom("TEST", undefined, 5);
    for (const s of [0, 1, 2, 3] as Seat[]) seat(room, s, `tok-${s}`);
    startPlay(room);
    expect(room.started).toBe(true);
    expect(room.state.handNumber).toBe(1);
    // The dealer draws first, so one seat is holding fourteen.
    expect(room.state.players.map((p) => p.hand.length + p.melds.length * 3).sort()).toEqual([
      13, 13, 13, 14,
    ]);
    expect(room.state.players.every((p) => p.discards.length === 0)).toBe(true);
  });

  it("lets only the table deal: phones alone never start a game", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 0, "tok-0");
    expect(mayDeal(room, "tok-0")).toBe(false);
    expect(mayDeal(room, "nobody")).toBe(false);

    room.table = { token: "tok-table", lastSeen: Date.now() };
    expect(mayDeal(room, "tok-table")).toBe(true);
    expect(mayDeal(room, "tok-0")).toBe(false);
  });

  it("gives the tablet the deal before anyone sits, and takes it back after", () => {
    const room = newRoom("TEST", undefined, 5);
    room.table = { token: "tok-table", lastSeen: Date.now() };
    // Holding the deal is a role, so the empty table still shows the button —
    // greyed out, with the seat count saying why.
    expect(mayDeal(room, "tok-table")).toBe(true);
    seat(room, 0, "tok-0");
    startPlay(room);
    expect(mayDeal(room, "tok-table")).toBe(false);
  });

  it("marks a hand dealt to one person as a warm-up, and a real table not", () => {
    const solo = newRoom("TEST", undefined, 5);
    seat(solo, 0, "tok-0");
    startPlay(solo);
    expect(solo.warmup).toBe(true);

    const full = dealt("TEST", 5, [0, 1]);
    expect(full.warmup).toBe(false);
  });

  it("offers the table a regroup once somebody joins the warm-up, and not before", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 0, "tok-0");
    room.table = { token: "tok-table", lastSeen: Date.now() };
    startPlay(room);
    expect(shouldRegroup(room)).toBe(false);
    expect(viewFor(room, "tok-table").canRegroup).toBe(false);

    seat(room, 2, "tok-2");
    expect(shouldRegroup(room)).toBe(true);
    expect(viewFor(room, "tok-table").canRegroup).toBe(true);
    // The phones see no offer; the button is the table's.
    expect(viewFor(room, "tok-0").canRegroup).toBe(false);
    expect(viewFor(room, "tok-2").canRegroup).toBe(false);
  });

  it("never lets a player regroup a real four-person game", () => {
    const room = dealt("TEST", 5, [0, 1, 2, 3]);
    expect(room.warmup).toBe(false);
    expect(mayRegroup(room, "tok-0")).toBe(false);
    expect(shouldRegroup(room)).toBe(false);
  });

  it("gives the regroup to the table alone", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 0, "tok-0");
    room.table = { token: "tok-table", lastSeen: Date.now() };
    startPlay(room);
    seat(room, 1, "tok-1");
    expect(mayRegroup(room, "tok-table")).toBe(true);
    expect(mayRegroup(room, "tok-0")).toBe(false);
  });

  it("clears the warm-up on the way back to the lobby", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 0, "tok-0");
    startPlay(room);
    returnToLobby(room, newRoom("TEST", undefined, 9).state);
    expect(room.warmup).toBe(false);
    expect(room.started).toBe(false);
    expect(mayRegroup(room, "tok-0")).toBe(false);
  });

  it("reports open seats as open until the deal, and computer-played after", () => {
    const room = newRoom("TEST", undefined, 5);
    seat(room, 0, "tok-0");
    expect(viewFor(room, "tok-0").players[1].occupant.kind).toBe("open");
    startPlay(room);
    expect(viewFor(room, "tok-0").players[1].occupant.kind).toBe("ai");
  });
});

describe("handing a chair to the computer", () => {
  it("names the computer after the person it replaces, once", () => {
    expect(robotVersion("Kris")).toBe("Robot Kris");
    expect(robotVersion("Robot Kris")).toBe("Robot Kris");
    expect(robotVersion("MrRobot")).toBe("MrRobot");
    expect(robotVersion("robot")).toBe("robot");
  });

  it("takes a person out mid-hand, and the computer plays on under their name", () => {
    const room = dealt("TEST", 7, [0, 1]);
    room.seats[1] = { kind: "human", name: "Kris", token: "tok-1", lastSeen: Date.now() };
    expect(replaceWithComputer(room, 1)).toBeNull();

    expect(room.seats[1]).toEqual({ kind: "ai", name: "Robot Kris" });
    expect(room.state.players[1].isHuman).toBe(false);
    expect(viewFor(room, "tok-0").players[1].occupant).toEqual({ kind: "ai", name: "Robot Kris", away: false });
    // Nobody can take an empty or computer chair "out".
    expect(replaceWithComputer(room, 1)).toBe("Nobody is sitting there");
    expect(replaceWithComputer(room, 2)).toBe("Nobody is sitting there");
  });

  it("tells the phone it was the table, and shows it no tiles", () => {
    const room = dealt("TEST", 7, [0, 1]);
    replaceWithComputer(room, 1);

    const theirs = viewFor(room, "tok-1");
    expect(theirs.you).toEqual({ role: "spectator", seat: null });
    expect(theirs.displacedFrom).toBe(1);
    expect(theirs.displacedByTable).toBe(true);
    expect(theirs.players.every((p) => p.hand.every((t) => t.code === "back"))).toBe(true);
    // Only that phone hears about it.
    expect(viewFor(room, "tok-0").displacedFrom).toBeNull();
    expect(viewFor(room, "tok-0").displacedByTable).toBe(false);
    expect(viewFor(room, null).displacedByTable).toBe(false);
  });

  it("stops waiting on a claim the person it replaced had not answered", () => {
    const room = dealt("TEST", 21, [0, 1, 2, 3]);
    drain(room);
    const dealer = room.state.dealer;
    room.state = discard(room.state, dealer, room.state.players[dealer].hand[0].id);
    if (room.state.phase !== "claiming") return; // nothing claimable on this deal
    const [asked] = pendingHumanClaimants(room);
    expect(asked).toBeDefined();

    replaceWithComputer(room, asked);
    expect(pendingHumanClaimants(room)).not.toContain(asked);
  });

  it("keeps the computer's name in the lobby, and lets somebody sit back in", () => {
    const room = newRoom("TEST", undefined, 42);
    seat(room, 2, "tok-2", "Steven");
    replaceWithComputer(room, 2);
    expect(viewFor(room, null).players[2].occupant).toEqual({ kind: "ai", name: "Robot Steven", away: false });

    expect(sitDown(room, 2, { token: "tok-new", name: "James" })).toBeNull();
    expect(viewFor(room, "tok-new").you).toEqual({ role: "player", seat: 2 });
    expect(room.state.players[2].isHuman).toBe(true);
  });
});

describe("draining", () => {
  it("does not start play until somebody sits down", () => {
    const room = newRoom("TEST", undefined, 3);
    startPlay(room);
    const before = JSON.stringify(room.state);
    // A dealt room with every chair freed has nobody left to play for.
    expect(drain(room)).toBe(false);
    expect(JSON.stringify(room.state)).toBe(before);
  });

  it("plays the computer seats up to the first person's turn", () => {
    const room = dealt("TEST", 5, [2]);
    // Computer turns are paced; ten seconds covers two of them at the default
    // speed and stays inside seat 2's own time limit.
    drain(room, room.lastStepAt + 10_000);
    if (room.state.phase === "action") {
      expect(room.state.turn).toBe(2);
      expect(room.state.players.some((p) => p.discards.length > 0)).toBe(true);
    }
  });

  it("stops when it reaches a person's turn", () => {
    const room = newRoom("TEST", undefined, 11);
    seat(room, 0, "tok");
    startPlay(room);
    seat(room, room.state.dealer, "tok");
    drain(room);
    expect(room.state.phase).not.toBe("handOver");
    expect(isHumanSeat(room, room.state.turn)).toBe(true);
  });

  it("waits for a person to answer a claim, then moves on when the window closes", () => {
    // Seat everyone so a discard always needs answers from people.
    const room = dealt("TEST", 21, [0, 1, 2, 3]);
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

  it("asks one person at a time and moves on once each has passed", () => {
    const room = dealt("TEST", 33, [0, 1, 2, 3]);
    drain(room);
    const dealer = room.state.dealer;
    room.state = discard(room.state, dealer, room.state.players[dealer].hand[0].id);
    if (room.state.phase !== "claiming") return;
    for (let i = 0; i < 4 && room.state.phase === "claiming"; i++) {
      const asked = pendingHumanClaimants(room);
      expect(asked).toHaveLength(1);
      room.claimResponses[String(asked[0])] = null;
      drain(room);
    }
    expect(room.state.phase).not.toBe("claiming");
  });
});

describe("presence", () => {
  it("treats a quiet seat as away and lets the computer play it", () => {
    const room = dealt("TEST", 4, [0]);
    const now = Date.now();
    expect(isHumanSeat(room, 0, now)).toBe(true);
    // Long enough without a word and the table stops waiting.
    const later = now + SEAT_IDLE_MS + 1;
    expect(isHumanSeat(room, 0, later)).toBe(false);
    expect(viewFor(room, "tok-0", later).players[0].occupant.away).toBe(true);
  });

  it("keeps the seat, so coming back reclaims it", () => {
    const room = dealt("TEST", 4, [0]);
    (room.seats[0] as { name: string }).name = "Kris";
    const later = Date.now() + SEAT_IDLE_MS + 1;
    expect(room.seats[0].kind).toBe("human");
    expect(touch(room, "tok-0", later)).toBe(true);
    expect(isHumanSeat(room, 0, later)).toBe(true);
    expect(viewFor(room, "tok-0", later).players[0].occupant.name).toBe("Kris");
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
    const room = dealt("TEST", 4, [0]);
    expect(touch(room, "someone-else", Date.now())).toBe(false);
    expect(touch(room, null, Date.now())).toBe(false);
  });

  it("plays on when everyone has wandered off", () => {
    const room = dealt("TEST", 12, [0]);
    const later = Date.now() + SEAT_IDLE_MS + 1;
    // Nobody is present, but the game has started, so it does not freeze.
    expect(drain(room, later)).toBe(true);
    expect(["handOver", "gameOver"]).toContain(room.state.phase);
  });

  it("counts the turns the computer plays for someone away, and tells only them", () => {
    const room = dealt("TEST", 12, [0, 1]);
    const later = Date.now() + SEAT_IDLE_MS + 1;
    // South is still here; East, the dealer, has wandered off.
    touch(room, "tok-1", later);
    drain(room, later);
    expect(room.state.turn === 1 || room.state.phase !== "action").toBe(true);
    expect(room.stoodIn[0]).toBeGreaterThan(0);
    expect(viewFor(room, "tok-0", later).stoodIn).toBe(room.stoodIn[0]);
    expect(viewFor(room, "tok-1", later).stoodIn).toBe(room.stoodIn[1]);
    expect(viewFor(room, "table", later).stoodIn).toBe(0);
    expect(viewFor(room, null, later).stoodIn).toBe(0);
  });

  it("starts the count again for whoever sits in the chair next", () => {
    const room = dealt("TEST", 12, [0, 1]);
    room.stoodIn[0] = 3;
    room.seats[0] = { kind: "open" };
    sitDown(room, 0, { token: "tok-new", name: "Thanh" });
    expect(viewFor(room, "tok-new").stoodIn).toBe(0);
  });

  it("does not wait on an absent seat's claim", () => {
    const room = dealt("TEST", 21, [0, 1, 2, 3]);
    drain(room);
    const dealer = room.state.dealer;
    room.state = discard(room.state, dealer, room.state.players[dealer].hand[0].id);
    if (room.state.phase !== "claiming") return;
    const later = Date.now() + SEAT_IDLE_MS + 1;
    expect(pendingHumanClaimants(room, later)).toEqual([]);
  });
});

/** How many discards this hand has seen, claimed ones included. */
function discardsMade(room: Room): number {
  return room.state.log.filter((entry) => / discards /.test(entry.text)).length;
}

describe("pacing", () => {
  it("waits the table's pace before each computer turn", () => {
    const room = dealt("TEST", 5, [2]);
    room.settings.speed = 1;
    const t0 = room.lastStepAt;
    expect(room.state.players[room.state.turn].isHuman).toBe(false);

    drain(room, t0 + 3_999);
    expect(discardsMade(room)).toBe(0);
    drain(room, t0 + 4_000);
    expect(discardsMade(room)).toBe(1);
    // One turn per four seconds, however often the table is asked.
    drain(room, t0 + 4_500);
    drain(room, t0 + 7_999);
    expect(discardsMade(room)).toBe(1);
  });

  it("plays a backlog out at the same pace rather than all at once", () => {
    const room = dealt("TEST", 5, [2]);
    room.settings.speed = 5;
    const t0 = room.lastStepAt;
    drain(room, t0 + 400);
    expect(discardsMade(room)).toBe(1);
    expect(room.lastStepAt).toBe(t0 + 400);
  });

  it("leaves a computer's claimed set on show for a beat before it plays on", () => {
    const room = dealt("TEST", 5, [2]);
    room.settings.speed = 5;
    room.settings.turnLimit = 1;
    let t = room.lastStepAt;
    const claimedNow = () => {
      const id = room.lastPlayed?.tile.id;
      return room.state.players.find(
        (p) => p.seat !== 2 && p.melds.some((m) => m.claimedTileId === id),
      );
    };
    while (!claimedNow() && room.state.phase !== "handOver") {
      t += 100;
      drain(room, t);
    }
    expect(claimedNow()).toBeDefined();
    const made = discardsMade(room);

    // The claimed discard was thrown at most 100ms ago; a fast table would
    // otherwise play on 400ms after it.
    drain(room, t + CLAIM_BEAT_MS - 200);
    expect(discardsMade(room)).toBe(made);
    drain(room, t + CLAIM_BEAT_MS + 400);
    expect(discardsMade(room)).toBe(made + 1);
  });

  it("keeps the newest discard after the next player has drawn", () => {
    const room = dealt("TEST", 5, [2]);
    room.settings.speed = 5;
    drain(room, room.lastStepAt + 400);
    const view = viewFor(room, "tok-2");
    expect(view.lastPlayed).not.toBeNull();
    expect(view.lastPlayed!.from).toBe(room.state.dealer);
    expect(room.state.log.some((e) => e.text.includes("discards"))).toBe(true);
  });
});

describe("turn limit", () => {
  it("discards the drawn tile for a person whose time runs out", () => {
    const room = dealt("TEST", 5, [0]);
    room.settings.turnLimit = 15;
    expect(room.state.turn).toBe(0);
    const drawn = room.state.drawnTileId;
    const t0 = room.lastStepAt;

    // The dealer's first turn of a hand carries an extra minute.
    const limit = 15_000 + OPENING_TURN_BONUS_MS;
    expect(viewFor(room, "tok-0", t0 + 5_000).turnDeadlineIn).toBe(limit - 5_000);
    drain(room, t0 + limit - 1);
    expect(room.state.players[0].discards).toHaveLength(0);
    drain(room, t0 + limit);
    expect(room.state.players[0].discards.map((t) => t.id)).toContain(drawn);
  });

  it("gives only the opening turn of a hand the extra minute", () => {
    const room = dealt("TEST", 5, [0, 1]);
    room.settings.turnLimit = 15;
    const t0 = room.lastStepAt;
    expect(viewFor(room, "tok-0", t0).turnDeadlineIn).toBe(15_000 + OPENING_TURN_BONUS_MS);
    // Seat 0 runs out of time; the table discards for them and seat 1 is up
    // with the ordinary limit.
    drain(room, t0 + 15_000 + OPENING_TURN_BONUS_MS);
    drain(room, t0 + 15_000 + OPENING_TURN_BONUS_MS + CLAIM_WINDOW_MS);
    expect(room.state.players[0].discards).toHaveLength(1);
    if (room.state.turn === 1 && room.state.phase === "action") {
      expect(viewFor(room, "tok-1", room.lastStepAt).turnDeadlineIn).toBe(15_000);
    }
  });

  it("waits as long as it takes when there is no limit", () => {
    const room = dealt("TEST", 5, [0]);
    room.settings.turnLimit = 0;
    // Short of the five minutes after which a silent seat counts as away.
    drain(room, room.lastStepAt + SEAT_IDLE_MS - 1);
    expect(room.state.players[0].discards).toHaveLength(0);
    expect(viewFor(room, "tok-0").turnDeadlineIn).toBeNull();
  });

  it("adds extra time to the turn once, visible to the table", () => {
    const room = dealt("TEST", 5, [0]);
    room.settings.turnLimit = 15;
    room.table = { token: "table", lastSeen: Date.now() };
    const t0 = room.lastStepAt;

    expect(grantMoreTime(room, 0)).toBeNull();
    expect(grantMoreTime(room, 0)).toMatch(/already/);
    const limit = 15_000 + OPENING_TURN_BONUS_MS;
    expect(viewFor(room, "tok-0", t0).turnDeadlineIn).toBe(limit + MORE_TIME_MS);
    expect(viewFor(room, "table", t0).turnExtended).toBe(true);

    drain(room, t0 + limit);
    expect(room.state.players[0].discards).toHaveLength(0);
    drain(room, t0 + limit + MORE_TIME_MS);
    expect(room.state.players[0].discards).toHaveLength(1);
    // The grant belonged to that turn and lapsed with it.
    expect(viewFor(room, "table").turnExtended).toBe(false);
  });

  it("refuses extra time off turn or with no limit", () => {
    const room = dealt("TEST", 5, [0, 2]);
    room.settings.turnLimit = 15;
    expect(grantMoreTime(room, 2)).toMatch(/not your turn/);
    room.settings.turnLimit = 0;
    expect(grantMoreTime(room, 0)).toMatch(/no turn limit/);
    expect(room.moreTime).toBeNull();
  });

  it("never shows a deadline on a computer's turn", () => {
    const room = dealt("TEST", 5, [2]);
    expect(viewFor(room, "tok-2").turnDeadlineIn).toBeNull();
  });
});

describe("more time on a claim", () => {
  /** Kris has thrown 4 Characters and Srini, holding 2, 3, 5 and 6, can chow it two ways — or one. */
  function asked(ways: 1 | 2): Room {
    const room = dealt("TEST", 5, [0, 1]);
    const chow = (id: string, codes: string[]) => ({ id, type: "chow" as const, tileIds: [], codes });
    const options = [chow("low", ["m2", "m3", "m4"]), chow("high", ["m4", "m5", "m6"])].slice(0, ways);
    room.state = {
      ...room.state,
      phase: "claiming",
      lastDiscard: { tile: { id: "thrown-m4", code: "m4" }, from: 0 },
      pendingClaims: [{ seat: 1, options }],
    };
    room.claimDeadline = Date.now() + CLAIM_WINDOW_MS;
    return room;
  }

  it("is offered with two sets to choose between, and adds to the window once", () => {
    const room = asked(2);
    const deadline = room.claimDeadline!;
    expect(viewFor(room, "tok-1").claim).toMatchObject({ allowance: CLAIM_WINDOW_MS, canExtend: true });
    expect(extendClaim(room, 1)).toBeNull();
    expect(room.claimDeadline).toBe(deadline + CLAIM_MORE_TIME_MS);
    expect(viewFor(room, "tok-1").claim).toMatchObject({
      allowance: CLAIM_WINDOW_MS + CLAIM_MORE_TIME_MS,
      canExtend: false,
    });
    expect(extendClaim(room, 1)).toMatch(/already have extra time/);
  });

  it("is not offered with only one way to claim, nor to anyone not being asked", () => {
    const room = asked(1);
    expect(viewFor(room, "tok-1").claim?.canExtend).toBe(false);
    expect(extendClaim(room, 1)).toMatch(/choosing between sets/);
    expect(extendClaim(asked(2), 0)).toMatch(/nothing for you to decide/);
  });

  it("lapses with the tile: the next discard can be given more time again", () => {
    const room = asked(2);
    expect(extendClaim(room, 1)).toBeNull();
    room.state = { ...room.state, lastDiscard: { tile: { id: "next-m4", code: "m4" }, from: 0 } };
    expect(viewFor(room, "tok-1").claim?.canExtend).toBe(true);
  });
});

describe("hurry up", () => {
  it("flashes only the person the table is waiting on, once, and briefly", () => {
    const room = dealt("TEST", 5, [0, 2]);
    expect(room.state.turn).toBe(0);
    const t0 = underway(room);
    expect(hurryUp(room, 2, t0)).toBeNull();
    const view = viewFor(room, "tok-0", t0 + 100);
    expect(view.hurry).toEqual({ seat: 0, by: "Someone", id: t0 });
    // Everyone may see the nudge was sent; only seat 0 is asked to act on it.
    expect(viewFor(room, "tok-2", t0 + 100).hurry?.seat).toBe(0);
    expect(viewFor(room, "tok-0", t0 + HURRY_FLASH_MS).hurry).toBeNull();
  });

  it("refuses hurrying yourself, the computer, or twice in a row", () => {
    const room = dealt("TEST", 5, [0, 2]);
    const t0 = underway(room);
    expect(hurryUp(room, 0, t0)).toMatch(/your move/);
    expect(hurryUp(room, 2, t0)).toBeNull();
    expect(hurryUp(room, 2, t0 + 1000)).toMatch(/just been hurried/);
    expect(hurryUp(room, 2, t0 + HURRY_COOLDOWN_MS)).toBeNull();

    const robots = dealt("TEST", 5, [2]);
    // Seat 0 is the computer's, so nobody is holding anything up.
    expect(hurryUp(robots, 2)).toMatch(/Nobody/);
  });

  it("tells every seat the table is resting, and for how long, so only one hurry-up is out at a time", () => {
    const room = dealt("TEST", 5, [0, 1, 2]);
    const t0 = underway(room);
    expect(viewFor(room, "tok-1", t0).hurryCooldown).toBeNull();
    expect(hurryUp(room, 2, t0)).toBeNull();
    for (const token of ["tok-0", "tok-1", "tok-2", null]) {
      expect(viewFor(room, token, t0 + 4_000).hurryCooldown).toEqual({
        seat: 0,
        by: 2,
        left: HURRY_COOLDOWN_MS - 4_000,
      });
    }
    // Someone else at the table is refused for as long as the view says.
    expect(hurryUp(room, 1, t0 + 4_000)).toMatch(/just been hurried/);
    expect(viewFor(room, "tok-1", t0 + HURRY_COOLDOWN_MS).hurryCooldown).toBeNull();
    expect(hurryUp(room, 1, t0 + HURRY_COOLDOWN_MS)).toBeNull();
  });

  it("stops flashing once its target has moved", () => {
    const room = dealt("TEST", 5, [0, 2]);
    const t0 = underway(room);
    expect(hurryUp(room, 2, t0)).toBeNull();
    const tile = room.state.players[0].hand[0];
    room.state = discard(room.state, 0, tile.id);
    expect(viewFor(room, "tok-0", t0 + 100).hurry).toBeNull();
  });

  it("leaves every turn its first three seconds, and says how long is left", () => {
    const room = dealt("TEST", 5, [0, 2]);
    const t0 = Date.now();
    drain(room, t0);
    expect(room.acting?.since).toBe(t0);
    for (const token of ["tok-0", "tok-2", "tok-table", null]) {
      expect(viewFor(room, token, t0 + 1_000).hurryGraceLeft).toBe(HURRY_GRACE_MS - 1_000);
    }
    expect(hurryUp(room, 2, t0)).toMatch(/only just started/);
    expect(hurryUp(room, 2, t0 + HURRY_GRACE_MS - 1)).toMatch(/only just started/);
    // A refused nudge does not rest the table: the first one that is allowed goes through.
    expect(viewFor(room, "tok-2", t0 + HURRY_GRACE_MS).hurryGraceLeft).toBe(0);
    expect(hurryUp(room, 2, t0 + HURRY_GRACE_MS)).toBeNull();
  });

  it("starts the count again for each new turn, and only once the deal has been shown", () => {
    const room = dealt("TEST", 5, [0, 1, 2]);
    // The table is still showing the deal: the dealer's turn has not begun.
    room.lastStepAt = Date.now() + 5_000;
    const shown = room.lastStepAt;
    drain(room, shown - 5_000);
    expect(hurryUp(room, 2, shown + HURRY_GRACE_MS - 1)).toMatch(/only just started/);
    expect(hurryUp(room, 2, shown + HURRY_GRACE_MS)).toBeNull();

    // The dealer throws and nobody claims: the next seat's wait counts from its draw.
    const t1 = shown + 60_000;
    room.state = discard(room.state, 0, room.state.players[0].hand[0].id);
    room.lastStepAt = t1;
    drain(room, t1);
    expect(room.state.turn).toBe(1);
    expect(viewFor(room, "tok-2", t1).hurryGraceLeft).toBe(HURRY_GRACE_MS);
    expect(hurryUp(room, 2, t1 + 1_000)).toMatch(/only just started/);
    expect(hurryUp(room, 2, t1 + HURRY_GRACE_MS)).toBeNull();
  });

  it("forgets the last game's turns on the way back to the lobby", () => {
    const room = dealt("TEST", 5, [0, 2]);
    underway(room);
    returnToLobby(room, newRoom("TEST", undefined, 5).state);
    expect(room.acting).toBeNull();
  });

  it("is filled in on a room stored before it existed", () => {
    const room = newRoom("TEST", undefined, 1) as Partial<Room>;
    delete room.hurry;
    delete room.acting;
    delete room.claimExtension;
    room.settings = { speed: 2, turnLimit: 30, rotation: 0 } as Room["settings"];
    const normal = normalizeRoom(room as Room);
    expect(normal.claimExtension).toBeNull();
    expect(normal.settings.difficulty).toBe("normal");
    expect(normal.hurry).toBeNull();
    expect(normal.acting).toBeNull();
  });
});

describe("the deal", () => {
  it("holds play while the tablet shows the deal and the opening flowers", () => {
    const room = newRoom("TEST", undefined, 5);
    room.seats[0] = { kind: "human", name: "Someone", token: "tok-0", lastSeen: Date.now() };
    room.table = { token: "table", lastSeen: Date.now() };
    const now = Date.now();
    startPlay(room, now);
    const flowers = room.state.players.reduce((n, p) => n + p.flowers.length, 0);
    expect(room.lastStepAt).toBe(now + DEAL_MS + flowers * FLOWER_STEP_MS);
  });

  it("does not hold play for a deal no table screen is showing", () => {
    const room = newRoom("TEST", undefined, 5);
    room.seats[0] = { kind: "human", name: "Someone", token: "tok-0", lastSeen: Date.now() };
    const now = Date.now();
    startPlay(room, now);
    expect(room.lastStepAt).toBe(now);
  });

  it("names the computer's seats after their chairs", () => {
    const room = dealt("TEST", 5, [0]);
    const view = viewFor(room, "tok-0");
    expect(view.players.map((p) => p.occupant.name)).toEqual([
      "Someone",
      robotName(1),
      robotName(2),
      robotName(3),
    ]);
    expect(robotName(1)).toBe("Robot Louis");
  });
});

describe("room settings", () => {
  it("fills in settings for a room stored before they existed", () => {
    const room = newRoom("TEST", undefined, 5) as Partial<Room> & Room;
    delete (room as Partial<Room>).settings;
    delete (room as Partial<Room>).lastPlayed;
    normalizeRoom(room);
    expect(room.settings).toEqual(DEFAULT_ROOM_SETTINGS);
    expect(room.lastPlayed).toBeNull();
  });
});

describe("claim order at the table", () => {
  /** A discard of 5 Dots that South can chow and West can pung, both people. */
  function chowAgainstPung(): Room {
    const room = dealt("TEST", 5, [0, 1, 2]);
    const filler = ["m1", "m9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"];
    const hand = (seat: number, codes: string[]) =>
      [...codes, ...filler].slice(0, 13).map((code, i) => ({ id: `${code}#t${seat}${i}`, code }));
    const state = room.state;
    state.players[0].hand = [...hand(0, []), { id: "p5#x", code: "p5" }];
    state.players[1].hand = hand(1, ["p4", "p6"]);
    state.players[2].hand = hand(2, ["p5", "p5"]);
    state.players[3].hand = hand(3, []);
    for (const p of state.players) p.melds = [];
    state.turn = 0;
    state.phase = "action";
    state.lastDiscard = null;
    state.drawnTileId = null;
    room.state = discard(state, 0, "p5#x");
    drain(room);
    return room;
  }

  it("puts the pung to its holder first, and keeps the chow from the next seat until it is passed", () => {
    const room = chowAgainstPung();
    expect(pendingHumanClaimants(room)).toEqual([2]);
    expect(viewFor(room, "tok-2").claim?.options.map((o) => o.type)).toEqual(["pung"]);
    expect(viewFor(room, "tok-1").claim).toBeNull();
    expect(viewFor(room, "tok-1").awaitingClaimSeats).toEqual([2]);

    room.claimResponses["2"] = null;
    drain(room);
    expect(pendingHumanClaimants(room)).toEqual([1]);
    expect(viewFor(room, "tok-1").claim?.options.map((o) => o.type)).toEqual(["chow"]);
  });

  it("tells the next who can win that someone already has, at a table that pays every winner", () => {
    const room = dealt("TEST", 5, [0, 1, 2]);
    const tiles = (prefix: string, spec: string) => spec.split(" ").map((code, i) => ({ id: `${prefix}${i}`, code }));
    const state = room.state;
    state.config = { ...state.config, multipleWinners: true };
    for (const p of state.players) {
      p.melds = [];
      p.flowers = [];
    }
    state.players[0].hand = tiles("e", "m5 p9 s9");
    state.players[1].hand = tiles("s", "m1 m2 m3 m4 m6 p1 p2 p3 s1 s2 s3 dr dr");
    state.players[2].hand = tiles("w", "m3 m4 p4 p5 p6 s4 s5 s6 wn wn wn dg dg");
    state.players[3].hand = tiles("n", "p1 p9 s1 s9 we ws ww dr dg dw m1 m9 p5");
    state.turn = 0;
    state.phase = "action";
    state.lastDiscard = null;
    state.drawnTileId = "e0";
    room.state = discard(state, 0, "e0");
    drain(room);
    expect(viewFor(room, "tok-1").claim?.declared).toEqual([]);
    // What the win would score goes to the one who could take it, and nobody else.
    expect(viewFor(room, "tok-1").claim?.options.find((o) => o.type === "win")?.score?.faan).toBeGreaterThan(0);
    expect(viewFor(room, "table").claim).toBeNull();
    expect(viewFor(room, "tok-0").claim).toBeNull();

    room.claimResponses["1"] = "win";
    drain(room);
    const west = viewFor(room, "tok-2").claim;
    expect(west?.declared).toEqual([1]);
    expect(west?.options.map((o) => o.type)).toEqual(["win"]);

    room.claimResponses["2"] = "win";
    drain(room);
    expect(room.state.phase).toBe("handOver");
    expect(viewFor(room, "table").result?.others?.map((o) => o.winner)).toEqual([2]);
  });

  it("never asks about the chow once the pung is taken", () => {
    const room = chowAgainstPung();
    room.claimResponses["2"] = "pung:p5";
    drain(room);
    expect(room.state.phase).toBe("action");
    expect(room.state.turn).toBe(2);
    expect(room.state.players[2].melds.map((m) => m.type)).toEqual(["pung"]);
  });
});

describe("taking back a discard", () => {
  /** East, a person, throws their first tile; South, also a person, could claim it. */
  function thrown(now = Date.now()) {
    const room = dealt("TEST", 9, [0, 1]);
    room.lastStepAt = now - 5_000;
    const before = room.state;
    const tile = before.players[0].hand.find((t) => !t.code.startsWith("f"))!;
    room.state = discard(before, 0, tile.id);
    noteDiscard(room, 0, before, now);
    return { room, before, tile, now };
  }

  it("puts the tile back in the hand and the table back as it was", () => {
    const { room, before, tile, now } = thrown();
    expect(viewFor(room, "tok-0", now).takeBackIn).toBe(TAKE_BACK_MS);
    expect(viewFor(room, "tok-1", now).takeBackIn).toBe(0);
    expect(viewFor(room, "table", now).takeBackIn).toBe(0);
    // The table as it was is the server's alone: no view carries it.
    expect(JSON.stringify(viewFor(room, "tok-0", now))).not.toContain('"before"');

    expect(takeBackDiscard(room, 0, now + 1_000)).toBeNull();
    expect(room.state).toBe(before);
    expect(room.state.players[0].hand.some((t) => t.id === tile.id)).toBe(true);
    expect(room.state.phase).toBe("action");
    expect(room.state.turn).toBe(0);
    // The turn clock carries on from when the turn began, not from the take-back.
    expect(room.lastStepAt).toBe(now - 5_000);
    expect(room.takeBack).toBeNull();
  });

  it("holds the next draw and any claim until the moment has passed, then moves on from there", () => {
    const { room, tile, now } = thrown();
    room.seats[1] = { kind: "open" };
    syncSeats(room, now);
    drain(room, now + 500);
    expect(room.state.lastDiscard?.tile.id).toBe(tile.id);

    drain(room, now + TAKE_BACK_MS);
    expect(room.takeBack).toBeNull();
    expect(room.lastStepAt).toBeGreaterThanOrEqual(now + TAKE_BACK_MS);
    expect(takeBackRefusal(room, 0, now + TAKE_BACK_MS)).not.toBeNull();
  });

  it("is refused once the moment has passed, to anyone else, or once somebody has claimed it", () => {
    const late = thrown();
    expect(takeBackDiscard(late.room, 0, late.now + TAKE_BACK_MS)).toBe("Too late to take it back");
    const other = thrown();
    expect(takeBackDiscard(other.room, 1, other.now)).toBe("There is no discard of yours to take back");
    const claimed = thrown();
    claimed.room.claimResponses["1"] = "pung";
    expect(takeBackDiscard(claimed.room, 0, claimed.now)).toBe("Somebody has claimed it");
    // Passing on it is not a claim.
    const passed = thrown();
    passed.room.claimResponses["1"] = null;
    expect(takeBackDiscard(passed.room, 0, passed.now)).toBeNull();
  });

  it("is never offered at a table that has it switched off", () => {
    const room = dealt("TEST", 9, [0, 1]);
    room.settings.takeBack = false;
    const before = room.state;
    room.state = discard(before, 0, before.players[0].hand[0].id);
    noteDiscard(room, 0, before);
    expect(room.takeBack).toBeNull();
    expect(viewFor(room, "tok-0").takeBackIn).toBe(0);
  });
});

describe("taking the table over", () => {
  it("refuses a second table unless it is taking over, then tells the first device why it lost it", () => {
    const room = dealt("TEST", 3, [0, 1]);
    const now = Date.now();
    expect(openTable(room, "tablet-a", {}, now)).toBeNull();
    expect(openTable(room, "tablet-b", {}, now)).toBe("The table is already in use");
    expect(viewFor(room, "tablet-a", now).you.role).toBe("table");

    const scores = [...room.state.scores];
    const hand = room.state.handNumber;
    expect(openTable(room, "tablet-b", { replace: true }, now)).toBeNull();
    // The game carries on as it stood, on the new device.
    expect(room.started).toBe(true);
    expect(room.state.handNumber).toBe(hand);
    expect(room.state.scores).toEqual(scores);
    expect(viewFor(room, "tablet-b", now).you.role).toBe("table");
    const old = viewFor(room, "tablet-a", now);
    expect(old.you.role).toBe("spectator");
    expect(old.tableTakenOver).toBe(true);
    expect(old.displacedFrom).toBeNull();
    // Nobody else is told they lost anything.
    expect(viewFor(room, null, now).tableTakenOver).toBe(false);
    expect(viewFor(room, "tok-0", now).tableTakenOver).toBe(false);
  });

  it("says when the device holding the table has not been seen for a while", () => {
    const room = dealt("TEST", 3, [0]);
    const now = Date.now();
    openTable(room, "tablet", {}, now);
    expect(viewFor(room, null, now + TABLE_IDLE_MS).tableAway).toBe(false);
    expect(viewFor(room, null, now + TABLE_IDLE_MS + 1).tableAway).toBe(true);
    room.table = null;
    expect(viewFor(room, null, now + TABLE_IDLE_MS + 1).tableAway).toBe(false);
  });
});

describe("pausing the table", () => {
  it("is only for a hand in play", () => {
    const room = newRoom("TEST", undefined, 3);
    expect(pauseTable(room)).toBe("There is no hand in play to pause");
    const live = dealt("TEST", 3, [0]);
    expect(pauseTable(live)).toBeNull();
    expect(pauseTable(live)).toBe("The table is already paused");
  });

  it("stops everything, and every clock stands where it was", () => {
    const room = dealt("TEST", 12, [0]);
    const start = Date.now();
    room.lastStepAt = start;
    expect(pauseTable(room, start + 4_000)).toBeNull();
    const before = { ...room.state };
    const frozen = viewFor(room, "tok-0", start + 4_000);
    expect(frozen.paused).toBe(true);
    // Long after any computer turn or time limit would have come due, nothing has moved.
    expect(drain(room, start + SEAT_IDLE_MS / 2)).toBe(false);
    expect(room.state.turn).toBe(before.turn);
    expect(room.state.log.length).toBe(before.log.length);
    const later = viewFor(room, "tok-0", start + 120_000);
    expect(later.turnDeadlineIn).toBe(frozen.turnDeadlineIn);
    expect(later.hurryGraceLeft).toBe(frozen.hurryGraceLeft);
  });

  it("picks up with the time that was left, however long it lasted", () => {
    const room = dealt("TEST", 12, [0]);
    const start = Date.now();
    room.lastStepAt = start;
    const left = viewFor(room, "tok-0", start + 4_000).turnDeadlineIn;
    pauseTable(room, start + 4_000);
    resumeTable(room, start + 64_000);
    expect(room.paused).toBeNull();
    expect(room.lastStepAt).toBe(start + 60_000);
    expect(viewFor(room, "tok-0", start + 64_000).turnDeadlineIn).toBe(left);
  });

  it("will not take a discard back while paused", () => {
    const room = dealt("TEST", 9, [0, 1]);
    const now = Date.now();
    const before = room.state;
    room.state = discard(before, 0, before.players[0].hand.find((t) => !t.code.startsWith("f"))!.id);
    noteDiscard(room, 0, before, now);
    pauseTable(room, now);
    expect(takeBackRefusal(room, 0, now)).toBe("The table is paused");
    expect(viewFor(room, "tok-0", now).takeBackIn).toBe(0);
  });
});
