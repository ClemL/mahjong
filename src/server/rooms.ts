import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  type Room,
  type RoomView,
  drain,
  grantMoreTime,
  hasAnyPlayer,
  identify,
  isOpeningTurn,
  seatName,
  isHumanSeat,
  pendingHumanClaimants,
  mayDeal,
  mayRegroup,
  newRoom,
  normalizeRoom,
  notePlayed,
  openClaimWindow,
  resetRoom,
  returnToLobby,
  beginHand,
  startPlay,
  syncSeats,
  touch,
  viewFor,
  SPEED_LEVELS,
  type SpeedLevel,
  TURN_LIMITS,
} from "@/game/room";
import {
  claimTurn,
  declareAddedKong,
  declareConcealedKong,
  declareSelfDraw,
  discard,
  nextHand,
  setFlowers,
  setMinFaan,
  setRounds,
  startHand,
} from "@/game/engine";
import { ROUND_CHOICES } from "@/game/rules";
import type { Seat } from "@/game/tiles";
import { TABLES, findTable } from "@/game/tables";
import { RoomError } from "./errors";
import { roomStore } from "./store";

/**
 * Three fixed tables, no password.
 *
 * Rooms are not made up per game: there are Table 1, 2 and 3, and everyone
 * goes to one and takes a seat. Anyone who can reach the URL can sit down, so
 * this suits groups who already share the link and not much else — the rate
 * limiter is what stops seat-grabbing, not authentication.
 */
export const FIXED_ROOM_ID = TABLES[0].id;

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
 * Load a table, opening it the first time anyone arrives. It opens in its
 * lobby with nothing dealt, so everybody who turns up starts the same hand.
 * `create` is NX, so two people opening the page together cannot both win —
 * the loser simply reads what the winner wrote.
 */
async function load(id: string): Promise<Room> {
  const table = findTable(id);
  if (!table) throw new RoomError("No such table", 404);
  const existing = await roomStore().get(table.id);
  if (existing) return normalizeRoom(existing);
  await roomStore().create(newRoom(table.id));
  const room = await roomStore().get(table.id);
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
    notePlayed(room);
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

/**
 * Anyone who can reach the URL belongs at the table: there is one of them and
 * it is shared by whoever has the link. The rate limiter is what stops a
 * passer-by grabbing all four chairs, not authentication.
 */
async function admitted(input: { password?: string }): Promise<void> {
  if (!passwordMatches(input.password ?? "")) throw new RoomError("Wrong password", 401);
}

export async function claimSeat(
  id: string,
  input: { seat: Seat | "table"; password?: string; name?: string },
): Promise<{ token: string; view: RoomView }> {
  await admitted(input);
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
      name: seatName(input.name, input.seat),
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
  | { type: "claim"; optionId: string | null }
  | { type: "moreTime" }
  | { type: "leave" };

export async function act(id: string, token: string, action: PlayerAction): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    const who = identify(r, token);
    if (who.role !== "player" || who.seat === null) throw new RoomError("Not seated", 403);
    const seat = who.seat;
    const occupant = r.seats[seat];
    if (occupant.kind === "human") occupant.lastSeen = now;
    syncSeats(r);

    // Getting up mid-hand hands the chair to the computer, which carries on
    // from exactly where the person left it; in the lobby it is simply free.
    if (action.type === "leave") {
      r.seats[seat] = { kind: "open" };
      syncSeats(r, now);
      return;
    }

    if (action.type === "claim") {
      if (r.state.phase !== "claiming") throw new RoomError("Nothing to claim", 409);
      if (!r.state.pendingClaims.some((c) => c.seat === seat)) {
        throw new RoomError("You have no claim on this tile", 403);
      }
      // A stronger claim elsewhere is asked first; this seat's turn comes
      // only if that one is passed.
      const turn = claimTurn(r.state);
      if (turn?.seat !== seat) throw new RoomError("Another player is deciding first", 409);
      if (action.optionId && !turn.options.some((o) => o.id === action.optionId)) {
        throw new RoomError("That claim is not available", 409);
      }
      r.claimResponses[String(seat)] = action.optionId;
      return;
    }

    // Returns before the clock is restarted below: the extra time is added to
    // the turn already running, not a fresh one.
    if (action.type === "moreTime") {
      const refused = grantMoreTime(r, seat);
      if (refused) throw new RoomError(refused, 409);
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
    // The person moved: the computer's reply is paced from now, and so is
    // their own time limit if a kong hands the turn straight back to them.
    r.lastStepAt = now;
  });
  return viewFor(room, token);
}

/**
 * Empty the whole room — every chair and the table's own place — from the seat
 * picker, where nobody holds a token. It is the way back in when the table is
 * marked in use by a device that is no longer there.
 */
export async function resetTable(id: string): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    resetRoom(r, now, { keepTable: false });
  });
  return viewFor(room, null);
}

export type TableCommand =
  | { type: "deal" }
  | { type: "regroup" }
  | { type: "nextHand" }
  | { type: "restart" }
  | { type: "reset" }
  | { type: "redeal" }
  | { type: "minFaan"; value: number }
  | { type: "rounds"; value: number }
  | { type: "skipOpening" }
  | { type: "flowers"; value: boolean }
  | { type: "speed"; value: number }
  | { type: "turnLimit"; value: number }
  | { type: "rotate" }
  | { type: "freeSeat"; seat: Seat }
  | { type: "rename"; seat: Seat; name: string }
  | { type: "forcePass" };

/**
 * Commands the table device issues. The one exception is the opening deal,
 * which a seated player may press when there is no tablet in the room —
 * otherwise a group playing on phones alone could never start. A seated
 * player may also rename their own chair.
 */
export async function control(
  id: string,
  token: string,
  command: TableCommand,
): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    const isTable = r.table !== null && r.table.token === token;
    if (isTable) r.table!.lastSeen = now;
    else if (
      !(command.type === "deal" && mayDeal(r, token)) &&
      !(command.type === "regroup" && mayRegroup(r, token)) &&
      !(command.type === "rename" && identify(r, token).seat === command.seat)
    ) {
      throw new RoomError("Not the table", 403);
    }
    switch (command.type) {
      case "deal":
        if (r.started) throw new RoomError("The hand is already dealt", 409);
        if (!hasAnyPlayer(r)) throw new RoomError("Nobody has taken a seat yet", 409);
        startPlay(r, now);
        break;
      // Abandon a solo warm-up now that somebody has turned up: everyone back
      // to the seating screen, and the practice scores do not count.
      case "regroup": {
        if (!r.warmup) throw new RoomError("This is not a warm-up game", 409);
        const fresh = newRoom(r.id, r.state.config, Date.now());
        returnToLobby(r, fresh.state);
        syncSeats(r);
        break;
      }
      case "nextHand":
        if (r.state.phase !== "handOver") throw new RoomError("The hand is still running", 409);
        r.state = nextHand(r.state);
        beginHand(r, now);
        break;
      case "redeal":
        r.state = startHand({ ...r.state, phase: "handOver" });
        beginHand(r, now);
        break;
      case "restart": {
        // Everyone keeps their chair and the scores go back to zero, but the
        // tiles are not thrown again until somebody deals — the same gathering
        // screen the room opened on.
        const fresh = newRoom(r.id, r.state.config, Date.now());
        returnToLobby(r, fresh.state);
        syncSeats(r);
        break;
      }
      // Restart's bigger sibling: the chairs are emptied too, so everybody
      // has to sit down again.
      case "reset":
        resetRoom(r, Date.now());
        break;
      case "minFaan":
        r.state = setMinFaan(r.state, command.value);
        break;
      // The table has cut its deal short: play starts now instead of when the
      // deal would have finished. Anything later than the opening is not a
      // hold to cut, so it is left alone.
      case "skipOpening":
        if (r.started && isOpeningTurn(r.state) && r.lastStepAt > now) r.lastStepAt = now;
        break;
      // Like the minimum, it can change mid-game: it is read when a round ends.
      case "rounds":
        if (!(ROUND_CHOICES as readonly number[]).includes(command.value)) {
          throw new RoomError("No such game length", 400);
        }
        r.state = setRounds(r.state, command.value);
        break;
      // The tile set is fixed when a hand is dealt, so it can only change
      // between hands: before the first, or once one is over.
      case "flowers":
        if (r.started && r.state.phase !== "handOver" && r.state.phase !== "gameOver") {
          throw new RoomError("Flowers can be changed between hands", 409);
        }
        r.state = setFlowers(r.state, command.value === true);
        break;
      case "speed":
        if (!SPEED_LEVELS.some((s) => s.level === command.value)) {
          throw new RoomError("No such speed", 400);
        }
        r.settings.speed = command.value as SpeedLevel;
        break;
      case "turnLimit":
        if (!(TURN_LIMITS as readonly number[]).includes(command.value)) {
          throw new RoomError("No such time limit", 400);
        }
        r.settings.turnLimit = command.value;
        // A new limit starts counting now, not from when the turn began.
        r.lastStepAt = now;
        break;
      // A quarter turn clockwise, for a tablet set down at a different angle
      // to the chairs than the table assumed.
      case "rotate":
        r.settings.rotation = ((r.settings.rotation + 1) % 4) as 0 | 1 | 2 | 3;
        break;
      case "freeSeat":
        r.seats[command.seat] = { kind: "open" };
        syncSeats(r);
        break;
      case "rename": {
        const occupant = r.seats[command.seat];
        if (occupant?.kind !== "human") throw new RoomError("Nobody is sitting there", 409);
        occupant.name = seatName(command.name, command.seat);
        break;
      }
      case "forcePass":
        for (const seat of pendingHumanClaimants(r, now)) r.claimResponses[String(seat)] = null;
        break;
    }
  });
  return viewFor(room, token);
}

export { RoomError };
