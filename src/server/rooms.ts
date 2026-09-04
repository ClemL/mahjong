import "server-only";

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  type Room,
  type RoomView,
  drain,
  identify,
  isHumanSeat,
  newRoom,
  openClaimWindow,
  syncSeats,
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
import { roomStore } from "./store";

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Ambiguous characters are left out so a code can be read off a screen aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode(length = 4): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Constant-time comparison, so the shared password cannot be probed by timing. */
function passwordMatches(supplied: string): boolean {
  const expected = process.env.MAHJONG_ROOM_PASSWORD ?? "";
  if (!expected) throw new RoomError("Multiplayer is not configured on this deployment", 503);
  const a = Buffer.from(supplied.padEnd(64).slice(0, 64));
  const b = Buffer.from(expected.padEnd(64).slice(0, 64));
  return timingSafeEqual(a, b);
}

export function multiplayerEnabled(): boolean {
  return Boolean(process.env.MAHJONG_ROOM_PASSWORD);
}

async function load(id: string): Promise<Room> {
  const room = await roomStore().get(id.toUpperCase());
  if (!room) throw new RoomError("No such room", 404);
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

export async function createRoom(password: string): Promise<{ id: string }> {
  if (!passwordMatches(password)) throw new RoomError("Wrong password", 401);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newRoomCode();
    if (await roomStore().create(newRoom(id))) return { id };
  }
  throw new RoomError("Could not allocate a room code", 500);
}

export async function readRoom(id: string, token: string | null): Promise<RoomView> {
  const room = await load(id);
  // Reading is also when a lapsed claim window gets noticed, so a table nobody
  // is touching still moves on.
  const now = Date.now();
  if (drain(room, now)) {
    const expected = room.version;
    room.version = expected + 1;
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
