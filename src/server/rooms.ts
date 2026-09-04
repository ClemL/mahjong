import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  type Room,
  type RoomView,
  drain,
  identify,
  isHumanSeat,
  newRoom,
  openClaimWindow,
  syncSeats,
  touch,
  viewFor,
} from "@/game/room";
import {
  declareAddedKong,
  declareConcealedKong,
  declareSelfDraw,
  discard,
  nextHand,
  setMinFaan,
  startHand,
} from "@/game/engine";
import type { Seat } from "@/game/tiles";
import { RoomError } from "./errors";
import { roomStore } from "./store";

/**
 * One table, no password.
 *
 * There is a single room rather than a code per game: everyone goes to the
 * same place and takes a seat. Anyone who can reach the URL can sit down, so
 * this suits a group who already share the link and not much else — the rate
 * limiter is what stops seat-grabbing, not authentication.
 */
export const FIXED_ROOM_ID = "TABLE";

/** Flip to true, and set MAHJONG_ROOM_PASSWORD, to ask for a password again. */
const REQUIRE_PASSWORD = false;

/** Constant-time comparison, so the shared password cannot be probed by timing. */
function passwordMatches(supplied: string): boolean {
  if (!REQUIRE_PASSWORD) return true;
  const expected = process.env.MAHJONG_ROOM_PASSWORD ?? "";
  if (!expected) throw new RoomError("Multiplayer is not configured on this deployment", 503);
  const a = Buffer.from(supplied.padEnd(64).slice(0, 64));
  const b = Buffer.from(expected.padEnd(64).slice(0, 64));
  return timingSafeEqual(a, b);
}

/** Whether a seat still has to be unlocked with the shared password. */
export function passwordRequired(): boolean {
  return REQUIRE_PASSWORD;
}

export function multiplayerEnabled(): boolean {
  return !REQUIRE_PASSWORD || Boolean(process.env.MAHJONG_ROOM_PASSWORD);
}

/**
 * Load the one room, dealing a fresh table the first time anyone arrives.
 * `create` is NX, so two people opening the page together cannot both win —
 * the loser simply reads what the winner wrote.
 */
async function load(id: string): Promise<Room> {
  if (id.toUpperCase() !== FIXED_ROOM_ID) throw new RoomError("No such room", 404);
  const existing = await roomStore().get(FIXED_ROOM_ID);
  if (existing) return existing;
  await roomStore().create(newRoom(FIXED_ROOM_ID));
  const room = await roomStore().get(FIXED_ROOM_ID);
  if (!room) throw new RoomError("Could not open the table", 500);
  return room;
}

/**
 * Apply a change and write it back, retrying from fresh state if someone
 * else's write landed first.
 */
async function mutate(
  id: string,
  apply: (room: Room, now: number) => void,
  attempts = 4,
): Promise<Room> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const room = await load(id);
    const expected = room.version;
    const now = Date.now();
    apply(room, now);
    drain(room, now);
    room.version = expected + 1;
    room.updatedAt = now;
    if (await roomStore().compareAndSet(room, expected)) return room;
  }
  throw new RoomError("The room changed while you were acting — try again", 409);
}

export async function readRoom(id: string, token: string | null): Promise<RoomView> {
  const room = await load(id);
  const now = Date.now();
  // A poll is also a heartbeat, and the moment a lapsed claim window gets
  // noticed — so a table nobody is touching still moves on. The heartbeat is
  // only written when it has gone stale, so polling once a second does not
  // turn into a write once a second.
  const beat = touch(room, token, now);
  const advanced = drain(room, now);
  if (advanced || beat) {
    const expected = room.version;
    // A bare heartbeat must not bump the version, or every client would think
    // the table changed and re-render on someone else's poll.
    if (advanced) room.version = expected + 1;
    room.updatedAt = now;
    await roomStore().compareAndSet(room, expected);
  }
  return viewFor(room, token, now);
}

export async function claimSeat(
  id: string,
  input: { seat: Seat | "table"; password: string; name?: string },
): Promise<{ token: string; view: RoomView }> {
  if (!passwordMatches(input.password)) throw new RoomError("Wrong password", 401);
  const token = randomUUID();
  const room = await mutate(id, (r, now) => {
    if (input.seat === "table") {
      if (r.table) throw new RoomError("The table is already in use", 409);
      r.table = { token, lastSeen: now };
      return;
    }
    const occupant = r.seats[input.seat];
    if (occupant.kind === "human") throw new RoomError("That seat is taken", 409);
    r.seats[input.seat] = {
      kind: "human",
      name: (input.name ?? "").trim().slice(0, 16) || `Seat ${input.seat + 1}`,
      token,
      lastSeen: now,
    };
    syncSeats(r);
  });
  return { token, view: viewFor(room, token) };
}

export type PlayerAction =
  | { type: "discard"; tileId: string }
  | { type: "kong"; kind: "concealed" | "added"; code: string }
  | { type: "win" }
  | { type: "claim"; optionId: string | null };

export async function act(id: string, token: string, action: PlayerAction): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    const who = identify(r, token);
    if (who.role !== "player" || who.seat === null) throw new RoomError("Not seated", 403);
    const seat = who.seat;
    const occupant = r.seats[seat];
    if (occupant.kind === "human") occupant.lastSeen = now;
    syncSeats(r);

    if (action.type === "claim") {
      if (r.state.phase !== "claiming") throw new RoomError("Nothing to claim", 409);
      const pending = r.state.pendingClaims.find((c) => c.seat === seat);
      if (!pending) throw new RoomError("You have no claim on this tile", 403);
      if (action.optionId && !pending.options.some((o) => o.id === action.optionId)) {
        throw new RoomError("That claim is not available", 409);
      }
      r.claimResponses[String(seat)] = action.optionId;
      return;
    }

    if (r.state.turn !== seat || r.state.phase !== "action") {
      throw new RoomError("It is not your turn", 409);
    }
    switch (action.type) {
      case "discard":
        r.state = discard(r.state, seat, action.tileId);
        openClaimWindow(r, now);
        break;
      case "kong":
        r.state =
          action.kind === "concealed"
            ? declareConcealedKong(r.state, seat, action.code)
            : declareAddedKong(r.state, seat, action.code);
        openClaimWindow(r, now);
        break;
      case "win":
        r.state = declareSelfDraw(r.state, seat);
        break;
    }
  });
  return viewFor(room, token);
}

export type TableCommand =
  | { type: "nextHand" }
  | { type: "restart" }
  | { type: "redeal" }
  | { type: "minFaan"; value: number }
  | { type: "freeSeat"; seat: Seat }
  | { type: "forcePass" };

/** Commands only the table device may issue. */
export async function control(
  id: string,
  token: string,
  command: TableCommand,
): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    if (!r.table || r.table.token !== token) throw new RoomError("Not the table", 403);
    r.table.lastSeen = now;
    switch (command.type) {
      case "nextHand":
        if (r.state.phase !== "handOver") throw new RoomError("The hand is still running", 409);
        r.state = nextHand(r.state);
        break;
      case "redeal":
        r.state = startHand({ ...r.state, phase: "handOver" });
        break;
      case "restart": {
        const seats = r.seats;
        const table = r.table;
        const fresh = newRoom(r.id, r.state.config);
        r.state = fresh.state;
        r.seats = seats;
        r.table = table;
        r.claimResponses = {};
        r.claimDeadline = null;
        syncSeats(r);
        break;
      }
      case "minFaan":
        r.state = setMinFaan(r.state, command.value);
        break;
      case "freeSeat":
        r.seats[command.seat] = { kind: "open" };
        syncSeats(r);
        break;
      case "forcePass":
        for (const claim of r.state.pendingClaims) {
          if (isHumanSeat(r, claim.seat) && !(String(claim.seat) in r.claimResponses)) {
            r.claimResponses[String(claim.seat)] = null;
          }
        }
        break;
    }
  });
  return viewFor(room, token);
}

export { RoomError };
