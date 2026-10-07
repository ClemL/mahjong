/**
 * Multiplayer room model.
 *
 * A room owns one `GameState` plus who is sitting where. Everything here is
 * pure: the HTTP layer loads a room, calls into this module, and writes the
 * result back, which keeps the rules of seating and redaction testable without
 * a network or a store.
 */
import {
  type ClaimOption,
  type GameState,
  type HandRecord,
  type HandResult,
  type LogEntry,
  type Phase,
  type TurnActions,
  advanceTurn,
  answerClaim,
  claimTurn,
  createGame,
  discard,
  resolveClaims,
  startHand,
  turnActions,
} from "./engine";
import { needsTurnAdvance, stepAiTurn } from "./controller";
import { greedyAi } from "./ai";
import { SEAT_NAMES, type Seat, type Tile, type TileCode, isFlower } from "./tiles";
import type { Meld } from "./melds";
import type { RuleConfig } from "./rules";
import { createRng } from "./rng";
import { HEARTBEAT_WRITE_MS, SEAT_IDLE_MS } from "./presence";

/** How long a seat has to answer a claim before it is treated as a pass. */
export const CLAIM_WINDOW_MS = 20_000;
/** The least a claimed set is left on show before its owner plays on. */
export const CLAIM_BEAT_MS = 2_500;

/**
 * How long each computer turn takes, slowest first. A whole round of three
 * computer seats at the slowest pace is twelve seconds — long enough to watch
 * every tile land.
 */
export const SPEED_LEVELS = [
  { level: 1, label: "Very slow", turnMs: 4000 },
  { level: 2, label: "Slow", turnMs: 2500 },
  { level: 3, label: "Normal", turnMs: 1500 },
  { level: 4, label: "Fast", turnMs: 800 },
  { level: 5, label: "Very fast", turnMs: 400 },
] as const;

export type SpeedLevel = (typeof SPEED_LEVELS)[number]["level"];

/**
 * The tablet opens each hand on screen: the tiles are pushed out of the middle
 * into the four walls, then dealt from the wall — 13 tiles to every seat in
 * cubes of four — and the opening flowers are laid down one at a time. Play
 * holds until it has finished, so nobody's first move lands on top of it.
 */
export const WALL_BUILD_MS = 2400;
export const DEAL_STEP_MS = 300;
/** Sixteen stacks: three rounds of four tiles to each seat, then one each. */
export const DEAL_STACKS = 16;
/** How long one stack takes to reach its rack. */
export const DEAL_FLIGHT_MS = 850;
/** When the last stack of the deal lands, counted from the moment the hand is dealt. */
export const DEAL_MS = WALL_BUILD_MS + DEAL_STEP_MS * (DEAL_STACKS - 1) + DEAL_FLIGHT_MS;
export const FLOWER_STEP_MS = 700;

/**
 * The first turn of a hand runs longer: everyone is looking at their tiles
 * for the first time, the dealer included.
 */
export const OPENING_TURN_BONUS_MS = 60_000;

/** Who sits in each chair when nobody typed a name. */
export const DEFAULT_NAMES = ["Calvin", "Louis", "Hanna", "Clem"] as const;

/** A computer seat goes by the chair's name, so it reads as a player and not a slot. */
export function robotName(seat: Seat): string {
  return `Robot ${DEFAULT_NAMES[seat]}`;
}

/** Seconds a person may take over a discard before the table makes it; 0 is no limit. */
export const TURN_LIMITS = [0, 15, 30, 60, 120] as const;

/** What one "more time" request adds to a person's turn. One per turn. */
export const MORE_TIME_MS = 30_000;

export interface RoomSettings {
  speed: SpeedLevel;
  /** Seconds; one of TURN_LIMITS. */
  turnLimit: number;
  /** Quarter turns clockwise the table screen is drawn at. */
  rotation: 0 | 1 | 2 | 3;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { speed: 2, turnLimit: 30, rotation: 0 };

export function turnMs(speed: SpeedLevel): number {
  return SPEED_LEVELS.find((s) => s.level === speed)?.turnMs ?? 1500;
}

export { HEARTBEAT_WRITE_MS, SEAT_IDLE_MS };

/** A seat is empty, played by the computer, or held by a person. */
export type Occupant =
  | { kind: "open" }
  | { kind: "ai" }
  | { kind: "human"; name: string; token: string; lastSeen: number };

export interface TableDevice {
  token: string;
  lastSeen: number;
}

export interface Room {
  id: string;
  /** Bumped on every mutation; clients poll against it. */
  version: number;
  createdAt: number;
  updatedAt: number;
  /**
   * False until somebody deals. A room waits in its lobby while people arrive
   * rather than starting the moment the first phone connects.
   */
  started: boolean;
  /**
   * True when the hand was dealt with only one person at the table — a game
   * against the computer while waiting for someone to show up. It is a real
   * game, but the table offers to regroup once a second person sits down.
   */
  warmup: boolean;
  seats: Occupant[];
  table: TableDevice | null;
  state: GameState;
  /** Claim answers collected for the discard currently on the table. */
  claimResponses: Record<string, string | null>;
  claimDeadline: number | null;
  rngSeed: number;
  rngCalls: number;
  settings: RoomSettings;
  /**
   * When the table last moved. Computer turns are paced from it and a
   * person's turn limit runs from it. It is the time a move was due rather
   * than when a poll happened to notice, so a backlog plays out at the same
   * pace however often the table is asked.
   */
  lastStepAt: number;
  /**
   * The newest discard, kept after the engine has moved on: the engine clears
   * its own copy the moment the next player draws, which with the computer
   * playing is before anyone could have seen it.
   */
  lastPlayed: { tile: Tile; from: Seat; hand: number } | null;
  /**
   * The turn that has been given more time, named by the `lastStepAt` it
   * started from. Every move moves `lastStepAt`, so the grant lapses on its own
   * when the turn ends and nothing has to remember to clear it.
   */
  moreTime: { seat: Seat; from: number } | null;
  /**
   * Seat tokens taken over by somebody scanning that chair's code, newest
   * last, so the phone that lost its chair can be told why rather than just
   * dropping back to the seat picker.
   */
  displaced: { token: string; seat: Seat }[];
}

export type Role = "player" | "table" | "spectator";

export interface PublicPlayer {
  seat: Seat;
  /** Concealed tiles are a count for everyone but their owner. */
  handCount: number;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  occupant: { kind: Occupant["kind"]; name: string | null; away: boolean };
}

export interface RoomView {
  roomId: string;
  version: number;
  /** False while the room is still gathering; no tiles have been dealt. */
  started: boolean;
  /** Whether this viewer may deal: the table, or any player with no tablet. */
  canDeal: boolean;
  /** True while a solo game against the computer is running. */
  warmup: boolean;
  /** Somebody new has sat down mid-warm-up, and this viewer can deal them in. */
  canRegroup: boolean;
  /** People with a name on a chair, however many of them are looking. */
  seatedCount: number;
  phase: Phase;
  turn: Seat;
  dealer: Seat;
  roundWind: TileCode;
  handNumber: number;
  dealership: number;
  wallCount: number;
  lastDiscard: { tile: Tile; from: Seat } | null;
  drawnTileId: string | null;
  players: PublicPlayer[];
  scores: number[];
  result: HandResult | null;
  history: HandRecord[];
  log: LogEntry[];
  config: RuleConfig;
  you: { role: Role; seat: Seat | null };
  /** The chair this viewer held until somebody else scanned its code, if that happened. */
  displacedFrom: Seat | null;
  tablePresent: boolean;
  /** Seats still waiting to answer the discard on the table. */
  awaitingClaimSeats: Seat[];
  claim: { options: ClaimOption[]; deadlineIn: number } | null;
  actions: TurnActions | null;
  settings: RoomSettings;
  /** The newest discard this hand, still shown after the next player draws. */
  lastPlayed: { tile: Tile; from: Seat } | null;
  /** Time left for the person whose turn it is, when the table has a limit. */
  turnDeadlineIn: number | null;
  /** The person on turn has already had their extra time this turn. */
  turnExtended: boolean;
  /** The whole of the current turn's time, extra time and the opening minute included; 0 is no limit. */
  turnAllowance: number;
}

const HIDDEN: TileCode = "back";

export function newRoom(id: string, config?: RuleConfig, seed = Date.now()): Room {
  // No tiles yet. The room opens in its lobby and deals when someone says so,
  // which is the only way four people arriving one at a time all start the
  // same hand.
  const state = createGame({ seed, config, humanSeat: 0, deal: false });
  // Every seat starts as a person's to claim; whatever is still open when play
  // runs is filled by the computer.
  for (const p of state.players) p.isHuman = false;
  return {
    id,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    started: false,
    warmup: false,
    seats: [{ kind: "open" }, { kind: "open" }, { kind: "open" }, { kind: "open" }],
    table: null,
    state,
    claimResponses: {},
    claimDeadline: null,
    rngSeed: seed ^ 0x5bf03635,
    rngCalls: 0,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    lastStepAt: Date.now(),
    lastPlayed: null,
    moreTime: null,
    displaced: [],
  };
}

/** Fill in fields added since a stored room was written. */
export function normalizeRoom(room: Room): Room {
  room.settings = { ...DEFAULT_ROOM_SETTINGS, ...(room.settings ?? {}) };
  room.lastStepAt ??= room.updatedAt ?? Date.now();
  room.lastPlayed ??= null;
  room.moreTime ??= null;
  room.displaced ??= [];
  return room;
}

/** Remember the discard on the table, if it is a new one. */
export function notePlayed(room: Room): void {
  const discardNow = room.state.lastDiscard;
  if (discardNow && discardNow.tile.id !== room.lastPlayed?.tile.id) {
    room.lastPlayed = { ...discardNow, hand: room.state.handNumber };
  }
}

/**
 * Deal the first hand and let the table run. Seats still open at this moment
 * are played by the computer, and a latecomer can still sit into one.
 */
export function startPlay(room: Room, now = Date.now()): void {
  room.started = true;
  room.warmup = seatedCount(room) < 2;
  room.claimResponses = {};
  room.claimDeadline = null;
  room.state = startHand(room.state);
  beginHand(room, now);
  syncSeats(room, now);
}

/** How long the felt takes to build the wall, deal this hand and lay down its opening flowers. */
export function dealShowMs(state: GameState): number {
  const flowers = state.players.reduce((n, p) => n + p.flowers.length, 0);
  return DEAL_MS + flowers * FLOWER_STEP_MS;
}

/** How long the table needs to show a fresh deal and its opening flowers. */
export function openingHoldMs(room: Room): number {
  // Only the tablet animates the deal; phones on their own go straight in.
  if (!room.table) return 0;
  return dealShowMs(room.state);
}

/** A hand has just been dealt: the clock starts once the table has shown it. */
export function beginHand(room: Room, now = Date.now()): void {
  room.lastStepAt = now + openingHoldMs(room);
}

/** No tile has been thrown yet this hand: the dealer's first turn. */
export function isOpeningTurn(state: GameState): boolean {
  return (
    state.phase === "action" &&
    state.turn === state.dealer &&
    state.players.every((p) => p.discards.length === 0 && p.melds.every((m) => m.concealed))
  );
}

/** Back to the gathering screen with the same people, ready to deal again. */
export function returnToLobby(room: Room, state: GameState): void {
  room.started = false;
  room.warmup = false;
  room.state = state;
  room.claimResponses = {};
  room.claimDeadline = null;
}

/**
 * A clean table: every chair emptied — so every phone holding a seat token is
 * back at the seat picker — scores and house rules at their defaults, nothing
 * dealt. A tablet resetting its own table keeps its place; a reset from the
 * seat picker frees the table too, which is how a table left signed in on a
 * device that has gone away is taken back.
 */
export function resetRoom(room: Room, seed = Date.now(), { keepTable = true } = {}): void {
  const fresh = newRoom(room.id, undefined, seed);
  if (!keepTable) room.table = null;
  room.seats = fresh.seats;
  room.rngSeed = fresh.rngSeed;
  room.rngCalls = 0;
  room.settings = fresh.settings;
  room.lastPlayed = null;
  room.displaced = [];
  returnToLobby(room, fresh.state);
}

/** Whether the seat on turn has had its extra time for this turn. */
export function turnExtended(room: Room): boolean {
  const grant = room.moreTime;
  return grant !== null && grant.seat === room.state.turn && grant.from === room.lastStepAt;
}

/** How long the current person's turn runs, extra time included; 0 is no limit. */
export function turnAllowanceMs(room: Room): number {
  const limit = room.settings.turnLimit * 1000;
  if (limit <= 0) return 0;
  return (
    limit +
    (turnExtended(room) ? MORE_TIME_MS : 0) +
    (isOpeningTurn(room.state) ? OPENING_TURN_BONUS_MS : 0)
  );
}

/**
 * Give the seat on turn one helping of extra time, or say why not. Only a
 * limited turn can be extended, and only once.
 */
export function grantMoreTime(room: Room, seat: Seat): string | null {
  if (room.state.turn !== seat || room.state.phase !== "action") return "It is not your turn";
  if (room.settings.turnLimit <= 0) return "This table has no turn limit";
  if (turnExtended(room)) return "You already have extra time this turn";
  room.moreTime = { seat, from: room.lastStepAt };
  return null;
}

/** The name a chair shows: what was typed, trimmed to fit a seat card, or the chair's default. */
export function seatName(name: string | undefined, seat: Seat): string {
  return (name ?? "").trim().slice(0, 16) || DEFAULT_NAMES[seat];
}

/** How many taken-over tokens a room remembers; older ones just see the seat picker. */
const DISPLACED_KEPT = 8;

/**
 * Put a person in a chair. An occupied chair is refused unless `replace` is
 * set, which is what scanning a taken chair's code does: whoever was there is
 * put out, and their phone is told so the next time it looks.
 */
export function sitDown(
  room: Room,
  seat: Seat,
  input: { token: string; name?: string; replace?: boolean },
  now = Date.now(),
): string | null {
  const occupant = room.seats[seat];
  if (occupant.kind === "human") {
    if (!input.replace) return "That seat is taken";
    room.displaced = [...room.displaced, { token: occupant.token, seat }].slice(-DISPLACED_KEPT);
  }
  room.seats[seat] = { kind: "human", name: seatName(input.name, seat), token: input.token, lastSeen: now };
  syncSeats(room, now);
  return null;
}

/** The chair one step round from `seat`: +1 is the next wind on, -1 the one before. */
export function neighbourSeat(seat: Seat, step: 1 | -1): Seat {
  return ((seat + step + 4) % 4) as Seat;
}

/**
 * Move a seated person one chair over before the deal. If the chair is taken
 * the two trade places. A name that was only ever the chair's default follows
 * the chair, so nobody ends up called after the seat they just left.
 */
export function moveSeat(room: Room, seat: Seat, step: 1 | -1): string | null {
  if (room.started) return "Seats can only be swapped before the deal";
  const from = room.seats[seat];
  if (from.kind !== "human") return "Nobody is sitting there";
  const to = neighbourSeat(seat, step);
  const other = room.seats[to];
  const rename = (occupant: Occupant, was: Seat, now: Seat): Occupant =>
    occupant.kind === "human" && occupant.name === DEFAULT_NAMES[was]
      ? { ...occupant, name: DEFAULT_NAMES[now] }
      : occupant;
  room.seats[to] = rename(from, seat, to);
  room.seats[seat] = rename(other, to, seat);
  syncSeats(room);
  return null;
}

/** True when a seated player has gone quiet for long enough to be counted away. */
export function isAway(occupant: Occupant, now: number): boolean {
  return occupant.kind === "human" && now - occupant.lastSeen > SEAT_IDLE_MS;
}

/** A seat the table should actually wait for: taken, and someone is there. */
export function isHumanSeat(room: Room, seat: Seat, now = Date.now()): boolean {
  const occupant = room.seats[seat];
  return occupant.kind === "human" && !isAway(occupant, now);
}

/** How many chairs have a person's name on them, present or not. */
export function seatedCount(room: Room): number {
  return room.seats.filter((occupant) => occupant.kind === "human").length;
}

/** True once anybody has taken a seat, whether or not they are still present. */
export function hasAnyPlayer(room: Room): boolean {
  return seatedCount(room) > 0;
}

/**
 * Somebody turned up while a solo game was running. The table offers to deal
 * everyone in rather than leaving them to watch the computer play.
 */
export function shouldRegroup(room: Room): boolean {
  return room.started && room.warmup && seatedCount(room) > 1;
}

/**
 * Who may abandon a warm-up and go back to the seating screen. The table
 * always may; a lone player may too, because a solo game usually has no tablet
 * in it — but only while it is still the warm-up they started, so this can
 * never reset a real four-person game.
 */
export function mayRegroup(room: Room, token: string | null): boolean {
  if (!room.started || !room.warmup) return false;
  const who = identify(room, token);
  return who.role === "table" || (room.table === null && who.role === "player");
}

/** Mirror seat occupancy onto the engine, which decides who it may step. */
export function syncSeats(room: Room, now = Date.now()): void {
  for (let seat = 0; seat < 4; seat++) {
    room.state.players[seat].isHuman = isHumanSeat(room, seat as Seat, now);
  }
}

/**
 * Record that a token's owner is still there. Returns true when the stamp was
 * old enough to be worth persisting, so a poll every second does not become a
 * write every second.
 */
export function touch(room: Room, token: string | null, now = Date.now()): boolean {
  if (!token) return false;
  if (room.table && room.table.token === token) {
    if (now - room.table.lastSeen < HEARTBEAT_WRITE_MS) return false;
    room.table.lastSeen = now;
    return true;
  }
  for (const occupant of room.seats) {
    if (occupant.kind === "human" && occupant.token === token) {
      const wasAway = isAway(occupant, now);
      if (!wasAway && now - occupant.lastSeen < HEARTBEAT_WRITE_MS) return false;
      occupant.lastSeen = now;
      return true;
    }
  }
  return false;
}

export function identify(room: Room, token: string | null): { role: Role; seat: Seat | null } {
  if (!token) return { role: "spectator", seat: null };
  if (room.table && room.table.token === token) return { role: "table", seat: null };
  for (let seat = 0; seat < 4; seat++) {
    const occupant = room.seats[seat];
    if (occupant.kind === "human" && occupant.token === token) {
      return { role: "player", seat: seat as Seat };
    }
  }
  return { role: "spectator", seat: null };
}

/**
 * The person the discard is waiting on, if it is waiting on a person at all.
 * Claims are asked one seat at a time, strongest first, so this is never more
 * than one seat — a chow is not put to anyone while a pung is still open.
 */
export function pendingHumanClaimants(room: Room, now = Date.now()): Seat[] {
  const turn = claimTurn(room.state);
  if (!turn) return [];
  const answered = String(turn.seat) in room.claimResponses;
  return isHumanSeat(room, turn.seat, now) && !answered ? [turn.seat] : [];
}

/**
 * What the table throws for someone whose time ran out: the tile they just
 * drew, which leaves the hand exactly as they were holding it, or failing
 * that the discard the computer would make.
 */
function autoDiscardChoice(state: GameState, seat: Seat, rng: ReturnType<typeof createRng>): string | null {
  const hand = state.players[seat].hand;
  if (state.drawnTileId && hand.some((t) => t.id === state.drawnTileId)) return state.drawnTileId;
  const decision = greedyAi.chooseTurnAction(state, seat, rng);
  if (decision.type === "discard" && hand.some((t) => t.id === decision.tileId)) return decision.tileId;
  return hand.find((t) => !isFlower(t.code))?.id ?? null;
}

/**
 * Advance the table as far as it can go without a person's input: resolve a
 * claim round once everyone has answered or the window has closed, pass the
 * turn on, play computer seats one at a time at the table's pace, and discard
 * for a person whose time limit has run out. Moves that are not due yet wait
 * for a later call — every poll is one.
 */
export function drain(room: Room, now = Date.now()): boolean {
  syncSeats(room, now);
  // Nothing is dealt until somebody deals, so there is nothing to advance.
  // This is what lets four people arrive one at a time and still start the
  // same hand together, instead of the first phone to connect kicking off a
  // game the computer then plays on everyone else's behalf.
  if (!room.started) return false;
  // A table where everyone has wandered off still plays on; one whose seats
  // have all been freed has nobody left to play for.
  if (!hasAnyPlayer(room)) return false;
  const rng = createRng(room.rngSeed);
  for (let i = 0; i < room.rngCalls; i++) rng.next();

  let changed = false;
  const move = (next: GameState) => {
    room.state = next;
    notePlayed(room);
    changed = true;
  };
  // A fresh discard opens a new claim window for the people at the table.
  const openWindow = () => {
    if (room.state.phase === "claiming" && pendingHumanClaimants(room, now).length > 0) {
      room.claimDeadline = now + CLAIM_WINDOW_MS;
    }
  };
  const pace = turnMs(room.settings.speed);

  for (let guard = 0; guard < 400; guard += 1) {
    const state = room.state;
    if (state.phase === "handOver" || state.phase === "gameOver") break;

    if (state.phase === "claiming") {
      const turn = claimTurn(state);
      let optionId: string | null = null;
      if (turn) {
        const recorded = room.claimResponses[String(turn.seat)];
        if (recorded !== undefined) {
          optionId = recorded;
        } else if (isHumanSeat(room, turn.seat, now)) {
          // Each person gets a window of their own, from the moment the
          // call becomes theirs — not from the discard, which may have been
          // put to somebody else first.
          if (room.claimDeadline === null) {
            room.claimDeadline = now + CLAIM_WINDOW_MS;
            changed = true;
          }
          if (now < room.claimDeadline) break;
        } else {
          optionId = greedyAi.chooseClaim(state, turn.seat, turn.options, rng)?.id ?? null;
        }
      }
      // People were being waited on: the computer's next move is paced from
      // when the window closed, not from the discard that opened it.
      if (room.claimDeadline !== null) {
        room.lastStepAt = Math.max(room.lastStepAt, Math.min(now, room.claimDeadline));
      }
      const taken = state.lastDiscard?.tile.id;
      move(turn ? answerClaim(state, turn.seat, optionId) : resolveClaims(state, []));
      room.claimResponses = {};
      room.claimDeadline = null;
      // A claim is a move of its own: the table shows the discard landing and
      // then crossing to its new set, so the claimant's next discard waits a
      // further beat rather than arriving on top of it — never less than the
      // table needs to show it, however fast the table is set.
      if (taken && room.state.players.some((p) => p.melds.some((m) => m.claimedTileId === taken))) {
        room.lastStepAt += Math.max(pace, CLAIM_BEAT_MS);
      }
      continue;
    }

    if (needsTurnAdvance(state)) {
      move(advanceTurn(state));
      continue;
    }

    if (isHumanSeat(room, state.turn, now)) {
      // A person's turn waits for them — unless the table has a time limit
      // and it has run out, in which case the table discards for them.
      const allowance = turnAllowanceMs(room);
      if (allowance <= 0) break;
      const due = room.lastStepAt + allowance;
      if (now < due) break;
      const tileId = autoDiscardChoice(state, state.turn, rng);
      if (!tileId) break;
      const next = discard(state, state.turn, tileId);
      if (next.lastDiscard?.tile.id !== tileId) break;
      move(next);
      room.lastStepAt = due;
      openWindow();
      continue;
    }

    // The computer's turn, at the table's pace.
    const due = room.lastStepAt + pace;
    if (now < due) break;
    const next = stepAiTurn(state, rng, greedyAi);
    if (next === state) break;
    move(next);
    room.lastStepAt = due;
    openWindow();
  }

  room.rngCalls += 1;
  return changed;
}

/**
 * Who holds the deal. The tablet is the shared screen everyone is looking at,
 * so it holds the button — but a group playing on phones alone still needs
 * someone able to press it.
 *
 * This is a question of role, not of readiness: the tablet holds the deal from
 * the moment it is set down, so it can show the button greyed out with the
 * seat count beside it rather than nothing at all. Whether there is anybody to
 * deal *to* is checked when the command actually arrives.
 */
export function mayDeal(room: Room, token: string | null): boolean {
  if (room.started) return false;
  const who = identify(room, token);
  return who.role === "table" || (room.table === null && who.role === "player");
}

/** Open a claim window if the current discard needs one. */
export function openClaimWindow(room: Room, now = Date.now()): void {
  if (room.state.phase === "claiming" && pendingHumanClaimants(room, now).length > 0) {
    room.claimDeadline = now + CLAIM_WINDOW_MS;
  }
}

/**
 * An unclaimed seat is reported as computer-played once the game is running,
 * because that is what it is — but it stays claimable, so a latecomer can sit
 * down and take it over.
 */
function occupantSummary(
  occupant: Occupant,
  seat: Seat,
  playing: boolean,
  now: number,
): PublicPlayer["occupant"] {
  if (occupant.kind === "human") {
    return { kind: "human", name: occupant.name, away: isAway(occupant, now) };
  }
  return playing
    ? { kind: "ai", name: robotName(seat), away: false }
    : { kind: "open", name: null, away: false };
}

/** Opaque stand-ins for tiles the viewer is not entitled to see. */
function hiddenTiles(seat: number, count: number): Tile[] {
  return Array.from({ length: count }, (_, i) => ({ id: `hidden:${seat}:${i}`, code: HIDDEN }));
}

/**
 * The room as one viewer is allowed to see it. Concealed hands and the wall
 * never leave the server while a hand is live: a player sees only their own
 * tiles, and the table device — a screen everyone can see — sees none of them.
 * When the hand is over, every hand is shown to everyone.
 */
export function viewFor(room: Room, token: string | null, now = Date.now()): RoomView {
  const you = identify(room, token);
  const state = room.state;

  // Before the deal an unclaimed seat is genuinely open; after it, it is the
  // computer's, though still claimable by a latecomer.
  const playing = room.started;
  // Once a hand is settled every hand goes face up, as at a real table: there
  // is nothing left to hide, and the winner's tiles are what everyone wants to see.
  const settled = state.phase === "handOver" || state.phase === "gameOver";
  const players: PublicPlayer[] = state.players.map((p) => {
    const own = (you.role === "player" && you.seat === p.seat) || settled;
    return {
      seat: p.seat,
      handCount: p.hand.length,
      hand: own ? p.hand : hiddenTiles(p.seat, p.hand.length),
      melds: p.melds,
      flowers: p.flowers,
      discards: p.discards,
      occupant: occupantSummary(room.seats[p.seat], p.seat, playing, now),
    };
  });

  // Only the seat being asked sees its claims: everyone else's turn to be
  // asked comes after, if the stronger claims are passed.
  let claim: RoomView["claim"] = null;
  const asked = claimTurn(state);
  if (you.role === "player" && asked && asked.seat === you.seat) {
    const answered = String(you.seat) in room.claimResponses;
    if (!answered) {
      claim = {
        options: asked.options,
        deadlineIn: Math.max(0, (room.claimDeadline ?? now + CLAIM_WINDOW_MS) - now),
      };
    }
  }

  const actions =
    you.role === "player" && you.seat !== null ? turnActions(state, you.seat) : null;

  return {
    roomId: room.id,
    version: room.version,
    started: room.started,
    canDeal: mayDeal(room, token),
    warmup: room.warmup,
    canRegroup: shouldRegroup(room) && mayRegroup(room, token),
    seatedCount: seatedCount(room),
    phase: state.phase,
    turn: state.turn,
    dealer: state.dealer,
    roundWind: state.roundWind,
    handNumber: state.handNumber,
    dealership: state.dealership,
    wallCount: state.wall.length,
    lastDiscard: state.lastDiscard,
    drawnTileId: you.role === "player" && you.seat === state.turn ? state.drawnTileId : null,
    players,
    scores: state.scores,
    result: state.result,
    history: state.history,
    log: state.log,
    config: state.config,
    you,
    displacedFrom:
      you.role === "spectator" && token
        ? (room.displaced.filter((d) => d.token === token).pop()?.seat ?? null)
        : null,
    tablePresent: room.table !== null,
    awaitingClaimSeats: pendingHumanClaimants(room, now),
    claim,
    actions,
    settings: room.settings,
    lastPlayed:
      room.lastPlayed && room.lastPlayed.hand === state.handNumber
        ? { tile: room.lastPlayed.tile, from: room.lastPlayed.from }
        : null,
    turnDeadlineIn:
      room.started &&
      room.settings.turnLimit > 0 &&
      state.phase === "action" &&
      state.lastDiscard === null &&
      isHumanSeat(room, state.turn, now)
        ? Math.max(0, room.lastStepAt + turnAllowanceMs(room) - now)
        : null,
    turnExtended: turnExtended(room),
    turnAllowance: turnAllowanceMs(room),
  };
}

/**
 * A solo game as the felt draws it: the table device's view of a game the
 * browser runs for itself. The redaction is the table's — no concealed tile on
 * the cloth until the hand is settled — because the player's own tiles are
 * drawn in their hand below the felt, not on it.
 *
 * The engine forgets a discard as soon as the next seat draws, so the caller
 * keeps the newest one (`lastPlayed`), as a room does.
 */
export function soloTableView(
  state: GameState,
  lastPlayed: { tile: Tile; from: Seat } | null,
  awaitingClaimSeats: Seat[],
): RoomView {
  const settled = state.phase === "handOver" || state.phase === "gameOver";
  return {
    roomId: "solo",
    version: 0,
    started: true,
    canDeal: false,
    warmup: false,
    canRegroup: false,
    seatedCount: 1,
    phase: state.phase,
    turn: state.turn,
    dealer: state.dealer,
    roundWind: state.roundWind,
    handNumber: state.handNumber,
    dealership: state.dealership,
    wallCount: state.wall.length,
    lastDiscard: state.lastDiscard,
    drawnTileId: null,
    players: state.players.map((p) => ({
      seat: p.seat,
      handCount: p.hand.length,
      hand: settled ? p.hand : hiddenTiles(p.seat, p.hand.length),
      melds: p.melds,
      flowers: p.flowers,
      discards: p.discards,
      // Named as the score panel names it; a bare "You" would have the felt
      // say "You wins" and "Off You's discard".
      occupant: p.isHuman
        ? { kind: "human", name: `${SEAT_NAMES[p.seat]} (you)`, away: false }
        : { kind: "ai", name: null, away: false },
    })),
    scores: state.scores,
    result: state.result,
    history: state.history,
    log: state.log,
    config: state.config,
    you: { role: "table", seat: null },
    displacedFrom: null,
    tablePresent: false,
    awaitingClaimSeats,
    claim: null,
    actions: null,
    settings: { ...DEFAULT_ROOM_SETTINGS, turnLimit: 0 },
    lastPlayed,
    turnDeadlineIn: null,
    turnExtended: false,
    turnAllowance: 0,
  };
}

/** Where each seat should physically sit, for the table to display. */
export function seatingOrder(): { seat: Seat; name: string; position: string }[] {
  return ([0, 1, 2, 3] as Seat[]).map((seat) => ({
    seat,
    name: SEAT_NAMES[seat],
    // Play passes to the right, so the winds run counter-clockwise around the
    // tablet from whichever side East takes.
    position: ["Bottom of the table", "Right of the table", "Top of the table", "Left of the table"][seat],
  }));
}

export { HIDDEN as HIDDEN_TILE_CODE };
