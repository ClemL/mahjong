import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  type Room,
  type RoomView,
  drain,
  extendClaim,
  grantMoreTime,
  hurryUp,
  hasAnyPlayer,
  identify,
  isOpeningTurn,
  dealNextHand,
  markReady,
  setTakeBackAssist,
  seatName,
  sitDown,
  moveSeat,
  takeBackDiscard,
  replaceWithComputer,
  isHumanSeat,
  pendingHumanClaimants,
  newRoom,
  normalizeRoom,
  notePlayed,
  noteDiscard,
  openClaimWindow,
  openTable,
  pauseTable,
  resumeTable,
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
  endGame,
  setFlowers,
  setLiability,
  setMultipleWinners,
  setOthersPayHalf,
  setMinFaan,
  setRounds,
  startHand,
} from "@/game/engine";
import { ROUND_CHOICES } from "@/game/rules";
import { validAppearance } from "@/game/appearance";
import { DIFFICULTIES, type Difficulty } from "@/game/ai";
import { SEAT_NAMES, type Seat } from "@/game/tiles";
import { TABLES, findTable } from "@/game/tables";
import { type GameRecord, gameRecord } from "@/game/history";
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
    const wasOver = room.state.phase === "gameOver";
    apply(room, now);
    notePlayed(room);
    drain(room, now);
    room.version = expected + 1;
    room.updatedAt = now;
    if (await roomStore().compareAndSet(room, expected)) {
      await keepIfFinished(room, wasOver, now);
      return room;
    }
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
  const wasOver = room.state.phase === "gameOver";
  const advanced = drain(room, now);
  if (advanced || beat) {
    const expected = room.version;
    // A bare heartbeat must not bump the version, or every client would think
    // the table changed and re-render on someone else's poll.
    if (advanced) room.version = expected + 1;
    room.updatedAt = now;
    if (await roomStore().compareAndSet(room, expected)) await keepIfFinished(room, wasOver, now);
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
  input: { seat: Seat | "table"; password?: string; name?: string; replace?: boolean },
): Promise<{ token: string; view: RoomView }> {
  await admitted(input);
  const token = randomUUID();
  const room = await mutate(id, (r, now) => {
    if (input.seat === "table") {
      const refused = openTable(r, token, { replace: input.replace }, now);
      if (refused) throw new RoomError(refused, 409);
      return;
    }
    const refused = sitDown(r, input.seat, { token, name: input.name, replace: input.replace }, now);
    if (refused) throw new RoomError(refused, 409);
  });
  return { token, view: viewFor(room, token) };
}

export type PlayerAction =
  | { type: "discard"; tileId: string }
  | { type: "kong"; kind: "concealed" | "added"; code: string }
  | { type: "win" }
  | { type: "claim"; optionId: string | null }
  | { type: "moreTime" }
  | { type: "hurry" }
  | { type: "takeBack" }
  | { type: "assist"; takeBack: boolean }
  | { type: "ready" }
  | { type: "leave" };

export async function act(id: string, token: string, action: PlayerAction): Promise<RoomView> {
  const room = await mutate(id, (r, now) => {
    const who = identify(r, token);
    if (who.role !== "player" || who.seat === null) throw new RoomError("Not seated", 403);
    const seat = who.seat;
    const occupant = r.seats[seat];
    if (occupant.kind === "human") occupant.lastSeen = now;

    // A phone saying which assists it has on is not a move: it must not
    // clear the note of what the computer played while they were away.
    if (action.type === "assist") {
      setTakeBackAssist(r, seat, action.takeBack === true);
      return;
    }

    // They are back and moving for themselves, so whatever the computer did meanwhile is old news.
    r.stoodIn[seat] = 0;
    syncSeats(r);

    // Paused, the hand waits for the table: nothing is played, asked for or nudged.
    if (r.paused && action.type !== "leave") throw new RoomError("The table is paused", 409);

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
      // Asked while a discard is up, it is time to choose between the sets it would make.
      const refused = r.state.phase === "claiming" ? extendClaim(r, seat, now) : grantMoreTime(r, seat);
      if (refused) throw new RoomError(refused, 409);
      return;
    }

    if (action.type === "hurry") {
      const refused = hurryUp(r, seat, now);
      if (refused) throw new RoomError(refused, 409);
      return;
    }

    if (action.type === "takeBack") {
      const refused = takeBackDiscard(r, seat, now);
      if (refused) throw new RoomError(refused, 409);
      return;
    }

    // The last of them to say so deals the next hand: `mutate` drains the
    // room after this, and draining deals once everyone is ready.
    if (action.type === "ready") {
      const refused = markReady(r, seat);
      if (refused) throw new RoomError(refused, 409);
      return;
    }

    if (r.state.turn !== seat || r.state.phase !== "action") {
      throw new RoomError("It is not your turn", 409);
    }
    switch (action.type) {
      case "discard": {
        const before = r.state;
        r.state = discard(r.state, seat, action.tileId);
        noteDiscard(r, seat, before, now);
        openClaimWindow(r, now);
        break;
      }
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
  /** `look` is the table's appearance, which each phone takes on for the game. */
  | { type: "deal"; look?: unknown }
  | { type: "regroup" }
  | { type: "nextHand" }
  | { type: "restart" }
  | { type: "endGame" }
  | { type: "reset" }
  | { type: "redeal" }
  | { type: "minFaan"; value: number }
  | { type: "rounds"; value: number }
  | { type: "skipOpening" }
  | { type: "flowers"; value: boolean }
  | { type: "liability"; value: boolean }
  | { type: "othersPayHalf"; value: boolean }
  | { type: "multipleWinners"; value: boolean }
  | { type: "takeBack"; value: boolean }
  | { type: "speed"; value: number }
  | { type: "difficulty"; value: string }
  | { type: "turnLimit"; value: number }
  | { type: "rotate" }
  | { type: "freeSeat"; seat: Seat }
  | { type: "replaceWithComputer"; seat: Seat }
  | { type: "rename"; seat: Seat; name: string }
  | { type: "moveSeat"; seat: Seat; step: 1 | -1 }
  | { type: "forcePass" }
  | { type: "pause"; value: boolean };

/**
 * Commands the table device issues. A seated player may only rename their own
 * chair or move it; the deal, like every rule, belongs to the table.
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
      !(command.type === "rename" && identify(r, token).seat === command.seat) &&
      !(command.type === "moveSeat" && identify(r, token).seat === command.seat)
    ) {
      throw new RoomError("Not the table", 403);
    }
    // Moving the hand on, or ending it, picks a paused table back up first.
    if (["nextHand", "redeal", "endGame", "skipOpening"].includes(command.type)) resumeTable(r, now);
    switch (command.type) {
      case "pause":
        if (command.value === true) {
          const refused = pauseTable(r, now);
          if (refused) throw new RoomError(refused, 409);
        } else resumeTable(r, now);
        break;
      case "deal":
        if (r.started) throw new RoomError("The hand is already dealt", 409);
        if (!hasAnyPlayer(r)) throw new RoomError("Nobody has taken a seat yet", 409);
        if (command.look !== undefined) r.look = { ...validAppearance(command.look), id: now };
        startPlay(r, now);
        break;
      // Abandon a warm-up now that somebody has turned up: everyone back
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
        dealNextHand(r, now);
        break;
      case "redeal":
        r.state = startHand({ ...r.state, phase: "handOver" });
        beginHand(r, now);
        break;
      // The final scores now, the hand in play if any left unscored.
      case "endGame":
        if (!r.started) throw new RoomError("No game is being played", 409);
        if (r.state.phase === "gameOver") throw new RoomError("The game is already over", 409);
        r.state = endGame(r.state);
        r.claimResponses = {};
        r.claimDeadline = null;
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
      // Read when a hand is settled, so it can change at any point.
      case "liability":
        r.state = setLiability(r.state, command.value === true);
        break;
      case "othersPayHalf":
        r.state = setOthersPayHalf(r.state, command.value === true);
        break;
      case "multipleWinners":
        r.state = setMultipleWinners(r.state, command.value === true);
        break;
      case "speed":
        if (!SPEED_LEVELS.some((s) => s.level === command.value)) {
          throw new RoomError("No such speed", 400);
        }
        r.settings.speed = command.value as SpeedLevel;
        break;
      case "difficulty":
        if (!(DIFFICULTIES as readonly string[]).includes(command.value)) {
          throw new RoomError("No such difficulty", 400);
        }
        r.settings.difficulty = command.value as Difficulty;
        break;
      case "takeBack":
        r.settings.takeBack = command.value === true;
        if (!r.settings.takeBack) r.takeBack = null;
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
      case "replaceWithComputer": {
        const refused = replaceWithComputer(r, command.seat, now);
        if (refused) throw new RoomError(refused, 409);
        break;
      }
      case "rename": {
        const occupant = r.seats[command.seat];
        if (occupant?.kind !== "human") throw new RoomError("Nobody is sitting there", 409);
        occupant.name = seatName(command.name, command.seat);
        break;
      }
      case "moveSeat": {
        if (command.step !== 1 && command.step !== -1) throw new RoomError("No such seat", 400);
        const refused = moveSeat(r, command.seat, command.step);
        if (refused) throw new RoomError(refused, 409);
        break;
      }
      case "forcePass":
        for (const seat of pendingHumanClaimants(r, now)) r.claimResponses[String(seat)] = null;
        break;
    }
  });
  return viewFor(room, token);
}

/**
 * Keep a game for the table's history if this write is the one that ended it.
 * A game ends on the table's command, or when the last hand's Ready deals on —
 * from any player's move or poll — so it is checked wherever a room is
 * written, and only by the write that won, so it is never kept twice.
 */
async function keepIfFinished(room: Room, wasOver: boolean, now: number): Promise<void> {
  if (wasOver || room.state.phase !== "gameOver" || room.state.history.length === 0) return;
  await roomStore().addGame(room.id, finishedGame(room, now));
}

/** The game just over, as the table's history will keep it. */
function finishedGame(room: Room, now: number): GameRecord {
  const seen = viewFor(room, null, now);
  return gameRecord({
    // A new game is dealt from a new seed, so the seed names the game.
    id: `g${room.state.rngSeed}`,
    endedAt: now,
    endedEarly: room.state.dealership < 4,
    history: room.state.history,
    players: seen.players.map((p) => ({
      name: p.occupant.name ?? SEAT_NAMES[p.seat],
      human: p.occupant.kind === "human",
    })),
  });
}

/** The games this table has finished, newest first. Names and scores only: nothing about any hand. */
export async function listGames(id: string): Promise<GameRecord[]> {
  const table = findTable(id);
  if (!table) throw new RoomError("No such table", 404);
  return roomStore().games(table.id);
}

export { RoomError };
