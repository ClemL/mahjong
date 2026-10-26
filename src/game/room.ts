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
  nextHand,
  resolveClaims,
  startHand,
  turnActions,
} from "./engine";
import { needsTurnAdvance, stepAiTurn } from "./controller";
import { type Difficulty, greedyAi, strategyFor } from "./ai";
import { SEAT_NAMES, type Seat, type Tile, type TileCode, isFlower } from "./tiles";
import type { Meld } from "./melds";
import type { RuleConfig } from "./rules";
import { createRng } from "./rng";
import { HEARTBEAT_WRITE_MS, SEAT_IDLE_MS } from "./presence";

/** How long a seat has to answer a claim before it is treated as a pass. */
export const CLAIM_WINDOW_MS = 20_000;
/** What asking for more time adds to a claim with several sets to choose between. Once a discard. */
export const CLAIM_MORE_TIME_MS = 20_000;
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

/** A person's name as the computer plays it on: Robot Kris — but never Robot Robot Kris. */
export function robotVersion(name: string): string {
  return /robot/i.test(name) ? name : `Robot ${name}`;
}

/** Seconds a person may take over a discard before the table makes it; 0 is no limit. */
export const TURN_LIMITS = [0, 15, 30, 60, 120] as const;

/** What one "more time" request adds to a person's turn. One per turn. */
export const MORE_TIME_MS = 30_000;

/** How long a hurry-up flashes the screen of the person it is aimed at. */
export const HURRY_FLASH_MS = 2_400;
/**
 * How long after one hurry-up the next is refused. A nudge, not a siren: the
 * table can ask once and then has to let them think.
 */
export const HURRY_COOLDOWN_MS = 10_000;
/**
 * How far into a turn before anyone may hurry it: long enough to see what has
 * come and start to think.
 */
export const HURRY_GRACE_MS = 3_000;
/**
 * How long a person has to take back the tile they just threw. The table
 * waits it out before anyone draws or a claim is settled, which is why it is
 * held only for the people who have take back on.
 */
export const TAKE_BACK_MS = 5_000;

/**
 * Take back is one of a phone's assists, off unless that phone turns it on —
 * but always on for anyone sitting as Louis, whatever their assists say.
 */
export function alwaysTakesBack(name: string | null | undefined): boolean {
  return name?.trim().toLowerCase() === "louis";
}

export interface RoomSettings {
  speed: SpeedLevel;
  /** Seconds; one of TURN_LIMITS. */
  turnLimit: number;
  /** Quarter turns clockwise the table screen is drawn at. */
  rotation: 0 | 1 | 2 | 3;
  /** How well the computer plays the seats nobody has taken. */
  difficulty: Difficulty;
  /** Whether a person may take back a discard in the moment after throwing it. */
  takeBack: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  speed: 2,
  turnLimit: 30,
  rotation: 0,
  difficulty: "normal",
  takeBack: true,
};

export function turnMs(speed: SpeedLevel): number {
  return SPEED_LEVELS.find((s) => s.level === speed)?.turnMs ?? 1500;
}

export { HEARTBEAT_WRITE_MS, SEAT_IDLE_MS };

/** A seat is empty, played by the computer, or held by a person. */
export type Occupant =
  | { kind: "open" }
  /** Named when the computer took the chair over from somebody. */
  | { kind: "ai"; name?: string }
  | {
      kind: "human";
      name: string;
      token: string;
      lastSeen: number;
      /** Take back switched on among this person's assists, as their phone last said. */
      takeBack?: boolean;
    };

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
  /** The claim given more time: whose, and on which discard, so it lapses with that tile. */
  claimExtension: { seat: Seat; discard: string } | null;
  /**
   * Seat tokens taken over — by somebody scanning that chair's code, by the
   * table handing the chair to the computer, or by another device taking the
   * table itself over — newest last, so the device that lost its place can be
   * told why rather than just dropping back to the seat picker.
   */
  displaced: { token: string; seat: Seat | "table"; byTable?: boolean }[];
  /** The last hurry-up: who it was aimed at, who sent it, and when. */
  hurry: { seat: Seat; by: Seat; at: number } | null;
  /**
   * When the table started waiting on the person it is waiting on now, and
   * for which move, so a hurry-up can leave every turn a moment first.
   */
  acting: { key: string; since: number } | null;
  /**
   * Turns the computer finished for each chair while the person in it was
   * away or out of time, since they last moved themselves, so their phone can
   * say so when they look again.
   */
  stoodIn: number[];
  /**
   * The people who have said they are ready for the next hand, while one is
   * settled. Once every person at the table has, it is dealt without waiting
   * for the table to press Next hand.
   */
  ready: Seat[];
  /**
   * The look the table was dealt with — its felt, tile faces, body, backs and
   * suit colours — which each phone takes on once per deal. `id` tells one
   * deal's look from the next.
   */
  look: (TableLook & { id: number }) | null;
  /**
   * A person's discard that can still be taken back: the table as it was
   * before the throw, kept here on the server and never sent to anyone.
   */
  takeBack: {
    seat: Seat;
    tileId: string;
    until: number;
    before: GameState;
    lastStepAt: number;
    lastPlayed: Room["lastPlayed"];
  } | null;
}

export type Role = "player" | "table" | "spectator";

/**
 * The table's appearance as the room carries it. Kept as plain strings here:
 * the appearance module owns which values are allowed, and the service checks
 * them before they are stored.
 */
export interface TableLook {
  theme: string;
  suits: string;
  tiles: string;
  body: string;
  backs: string;
}

export interface PublicPlayer {
  seat: Seat;
  /** Concealed tiles are a count for everyone but their owner. */
  handCount: number;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  /** Where a tile thrown into this pond was taken by someone else, and by whom: the table leaves a space. */
  taken: { at: number; by: Seat }[];
  occupant: { kind: Occupant["kind"]; name: string | null; away: boolean };
}

export interface RoomView {
  roomId: string;
  version: number;
  /** False while the room is still gathering; no tiles have been dealt. */
  started: boolean;
  /** Whether this viewer may deal: only the table device. */
  canDeal: boolean;
  /** True while a warm-up against the computer is running: dealt with one person seated. */
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
  /** That chair was handed to the computer by the table, rather than scanned by somebody. */
  displacedByTable: boolean;
  /** This viewer was the table until another device took it over. */
  tableTakenOver: boolean;
  tablePresent: boolean;
  /** The table is held by a device that has not looked in for a while. */
  tableAway: boolean;
  /** Seats still waiting to answer the discard on the table. */
  awaitingClaimSeats: Seat[];
  claim: {
    options: ClaimOption[];
    deadlineIn: number;
    /** The whole window, extra time included, for drawing how much is left. */
    allowance: number;
    /** Several sets to choose between and no extra time asked for yet. */
    canExtend: boolean;
    /** Who has already declared a win on this tile, at a table that pays every winner. */
    declared: Seat[];
  } | null;
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
  /**
   * How much longer the table screen is showing this hand's deal, in ms; 0
   * once it has finished or been skipped, or with no table screen. Phones
   * deal their own hands in time with it.
   */
  openingLeft: number;
  /**
   * A hurry-up still flashing: aimed at `seat`, sent by `by`, `id` naming this
   * one so a screen flashes once per nudge however often it polls. Null once
   * it has played out or its target has moved.
   */
  hurry: { seat: Seat; by: string; id: number } | null;
  /**
   * The table resting after a hurry-up: at whom it was aimed, who sent it, and
   * how long until another is taken, in ms. Every seat sees it, so every Hurry
   * up button waits it out, not only the sender's. Null once another would be.
   */
  hurryCooldown: { seat: Seat; by: Seat; left: number } | null;
  /**
   * How long, in ms, until the person the table is waiting on may be hurried:
   * nobody is in the first moments of their turn. 0 once they may.
   */
  hurryGraceLeft: number;
  /**
   * The person the table is waiting on has been hurried during this wait, and
   * by whom; null once they move, or if nobody has hurried them.
   */
  hurried: { seat: Seat; by: Seat } | null;
  /** Turns the computer finished for this viewer's chair since they last moved; 0 for anyone not seated. */
  stoodIn: number;
  /** How long this viewer has left to take back the tile they just threw, in ms; 0 when they cannot. */
  takeBackIn: number;
  /**
   * Whether the table holds this viewer's throws for a take back, and what
   * their phone last said about the assist (null until it has said anything).
   * Both false and null for anyone not seated.
   */
  takeBack: { on: boolean; assist: boolean | null };
  /** Who has said they are ready for the next hand, while a hand is settled. */
  ready: Seat[];
  /** The people at the table still to say they are ready, while a hand is settled. */
  readyWaiting: Seat[];
  /** The look the table was dealt with, for phones to take on once per deal. */
  look: (TableLook & { id: number }) | null;
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
    claimExtension: null,
    displaced: [],
    hurry: null,
    acting: null,
    stoodIn: [0, 0, 0, 0],
    ready: [],
    look: null,
    takeBack: null,
  };
}

/** Fill in fields added since a stored room was written. */
export function normalizeRoom(room: Room): Room {
  room.settings = { ...DEFAULT_ROOM_SETTINGS, ...(room.settings ?? {}) };
  room.lastStepAt ??= room.updatedAt ?? Date.now();
  room.lastPlayed ??= null;
  room.moreTime ??= null;
  room.claimExtension ??= null;
  room.displaced ??= [];
  room.hurry ??= null;
  room.acting ??= null;
  room.stoodIn ??= [0, 0, 0, 0];
  room.ready ??= [];
  room.look ??= null;
  room.takeBack ??= null;
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
  room.stoodIn = [0, 0, 0, 0];
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
  // Only the tablet animates the deal; with it gone, the phones go straight in.
  if (!room.table) return 0;
  return dealShowMs(room.state);
}

/** A hand has just been dealt: the clock starts once the table has shown it. */
export function beginHand(room: Room, now = Date.now()): void {
  room.lastStepAt = now + openingHoldMs(room);
  room.ready = [];
}

/** Deal the next hand — or, after the last, go to the final scores. */
export function dealNextHand(room: Room, now = Date.now()): void {
  room.state = nextHand(room.state);
  beginHand(room, now);
}

/** The people the table would wait on to be ready: seated, and not away. */
function readyNeeded(room: Room, now: number): Seat[] {
  return ([0, 1, 2, 3] as Seat[]).filter((seat) => isHumanSeat(room, seat, now));
}

/** Who at the table has still to say they are ready, while a hand is settled. */
export function readyWaiting(room: Room, now = Date.now()): Seat[] {
  if (!room.started || room.state.phase !== "handOver") return [];
  return readyNeeded(room, now).filter((seat) => !room.ready.includes(seat));
}

/**
 * Every person at the table has said they are ready. The computer's seats
 * are always ready, and somebody who has wandered off is not waited for —
 * but a table with nobody present is not dealt on its own.
 */
export function everyoneReady(room: Room, now = Date.now()): boolean {
  if (!room.started || room.state.phase !== "handOver") return false;
  const needed = readyNeeded(room, now);
  return needed.length > 0 && needed.every((seat) => room.ready.includes(seat));
}

/** Say this seat is ready for the next hand, or why it cannot be. */
export function markReady(room: Room, seat: Seat): string | null {
  if (room.state.phase !== "handOver") return "There is no hand to be ready for";
  if (!room.ready.includes(seat)) room.ready = [...room.ready, seat];
  return null;
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
  room.takeBack = null;
  room.ready = [];
  // A new game numbers its hands and moves from the start again, so an old
  // stamp could pass for the first turn of the next.
  room.acting = null;
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

/** Two or more sets to make from one discard: more than a glance to choose between. */
function choosingBetweenSets(options: ClaimOption[]): boolean {
  return options.filter((o) => o.type !== "win").length >= 2;
}

/** Whether `seat` has had its extra time on the discard it is deciding on now. */
function claimExtended(room: Room, seat: Seat): boolean {
  const grant = room.claimExtension;
  return grant !== null && grant.seat === seat && grant.discard === room.state.lastDiscard?.tile.id;
}

/**
 * More time to answer a discard, or why not: only for the seat being asked,
 * only when it has several sets to choose between, and once a discard.
 */
export function extendClaim(room: Room, seat: Seat, now = Date.now()): string | null {
  const turn = claimTurn(room.state);
  if (room.state.phase !== "claiming" || turn?.seat !== seat || String(seat) in room.claimResponses) {
    return "There is nothing for you to decide";
  }
  if (!choosingBetweenSets(turn.options)) return "More time is for choosing between sets";
  if (claimExtended(room, seat)) return "You already have extra time on this tile";
  room.claimDeadline = (room.claimDeadline ?? now + CLAIM_WINDOW_MS) + CLAIM_MORE_TIME_MS;
  room.claimExtension = { seat, discard: room.state.lastDiscard!.tile.id };
  return null;
}

/**
 * The person the table is waiting on right now, if it is waiting on one: the
 * seat being asked about a discard, or else the seat on turn.
 */
export function actingHumanSeat(room: Room, now = Date.now()): Seat | null {
  if (!room.started) return null;
  const state = room.state;
  if (state.phase === "claiming") return pendingHumanClaimants(room, now)[0] ?? null;
  // A discard waiting to be passed on is not the next person's move yet.
  if (state.phase === "action" && state.lastDiscard === null && isHumanSeat(room, state.turn, now)) {
    return state.turn;
  }
  return null;
}

/**
 * One move of one person: every turn follows a logged move — a discard, a
 * claim, a kong — so the log's count tells a seat's turn from its next one.
 */
function actingKey(state: GameState, seat: Seat): string {
  return `${state.handNumber}:${state.phase}:${seat}:${state.logSeq}`;
}

/** Stamp the moment the table starts waiting on someone new; true when it has. */
export function noteActing(room: Room, now = Date.now()): boolean {
  const seat = actingHumanSeat(room, now);
  const key = seat === null ? null : actingKey(room.state, seat);
  if ((room.acting?.key ?? null) === key) return false;
  room.acting = key === null ? null : { key, since: now };
  return true;
}

/** How long until the person the table is waiting on may be hurried; 0 once they may, or with nobody to hurry. */
export function hurryGraceLeft(room: Room, now = Date.now()): number {
  const seat = actingHumanSeat(room, now);
  if (seat === null) return 0;
  // A wait not stamped yet has only just begun.
  const noted = room.acting?.key === actingKey(room.state, seat) ? room.acting.since : now;
  // A turn held for the deal, or for a claimed tile to cross the table, starts when that ends.
  return Math.max(0, Math.max(noted, room.lastStepAt) + HURRY_GRACE_MS - now);
}

/**
 * Nudge whoever the table is waiting on, or say why not. Nobody hurries
 * themselves or the computer, nobody is hurried in the first moments of their
 * turn, and one nudge has to settle before the next.
 */
export function hurryUp(room: Room, by: Seat, now = Date.now()): string | null {
  const seat = actingHumanSeat(room, now);
  if (seat === null) return "Nobody is holding up the table";
  if (seat === by) return "It is your move";
  if (hurryGraceLeft(room, now) > 0) return "Their turn has only just started";
  if (room.hurry && now - room.hurry.at < HURRY_COOLDOWN_MS) return "They have just been hurried";
  room.hurry = { seat, by, at: now };
  return null;
}

/**
 * The hurry-up aimed at whoever the table is waiting on now, if it was sent
 * during this wait. Unlike the flash it lasts until they move, so everyone
 * waiting can see they have already been asked, and by whom.
 */
export function hurriedThisWait(room: Room, now = Date.now()): { seat: Seat; by: Seat } | null {
  const hurry = room.hurry;
  const seat = actingHumanSeat(room, now);
  if (!hurry || seat === null || hurry.seat !== seat) return null;
  const since = room.acting?.key === actingKey(room.state, seat) ? room.acting.since : now;
  return hurry.at >= since ? { seat, by: hurry.by } : null;
}

/** The name a chair shows: what was typed, trimmed to fit a seat card, or the chair's default. */
export function seatName(name: string | undefined, seat: Seat): string {
  return (name ?? "").trim().slice(0, 16) || DEFAULT_NAMES[seat];
}

/** How many taken-over tokens a room remembers; older ones just see the seat picker. */
const DISPLACED_KEPT = 8;

/**
 * How long the table device can go without a heartbeat before it is shown as
 * not seen lately. Its heartbeat is written every `HEARTBEAT_WRITE_MS` at most,
 * so this leaves room for two of them.
 */
export const TABLE_IDLE_MS = 60_000;

/**
 * Make a device the table. A table already open elsewhere is refused unless
 * `replace` is set: then this device takes it over, game and all, and the one
 * that had it is told so the next time it looks. That is how a tablet gets
 * back to its own game after losing its claim — another browser, cleared
 * storage, a different tablet — without resetting the table.
 */
export function openTable(room: Room, token: string, { replace = false } = {}, now = Date.now()): string | null {
  if (room.table) {
    if (!replace) return "The table is already in use";
    room.displaced = [...room.displaced, { token: room.table.token, seat: "table" as const }].slice(-DISPLACED_KEPT);
  }
  room.table = { token, lastSeen: now };
  return null;
}

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
  room.stoodIn[seat] = 0;
  syncSeats(room, now);
  return null;
}

/**
 * Take a person out of their chair and let the computer play it on under
 * their name, so the table still reads as the same four players. Their phone
 * is told why the next time it looks, and anybody can sit back in.
 */
export function replaceWithComputer(room: Room, seat: Seat, now = Date.now()): string | null {
  const occupant = room.seats[seat];
  if (occupant?.kind !== "human") return "Nobody is sitting there";
  room.displaced = [...room.displaced, { token: occupant.token, seat, byTable: true }].slice(-DISPLACED_KEPT);
  room.seats[seat] = { kind: "ai", name: robotVersion(occupant.name) };
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
 * Somebody turned up while a warm-up was running. The table offers to deal
 * everyone in rather than leaving them to watch the computer play.
 */
export function shouldRegroup(room: Room): boolean {
  return room.started && room.warmup && seatedCount(room) > 1;
}

/**
 * Who may abandon a warm-up and go back to the seating screen: the table, and
 * only while it is still the warm-up, so this can never reset a real game.
 */
export function mayRegroup(room: Room, token: string | null): boolean {
  if (!room.started || !room.warmup) return false;
  return identify(room, token).role === "table";
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
  // Everyone has said they are ready: the next hand without waiting for the table.
  if (everyoneReady(room, now)) {
    dealNextHand(room, now);
    changed = true;
  }
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
  const strategy = strategyFor(room.settings.difficulty);
  // A turn the table finished for somebody who has a chair: a discard made or
  // a hand won in their name.
  const playedFor = (seat: Seat, before: GameState) => {
    if (room.seats[seat].kind !== "human") return;
    const after = room.state;
    const threw = after.lastDiscard?.from === seat && after.lastDiscard.tile.id !== before.lastDiscard?.tile.id;
    const won =
      before.phase !== "handOver" &&
      after.result?.type === "win" &&
      (after.result.winner === seat || (after.result.others ?? []).some((o) => o.winner === seat));
    if (threw || won) room.stoodIn[seat] += 1;
  };

  for (let guard = 0; guard < 400; guard += 1) {
    const state = room.state;
    if (state.phase === "handOver" || state.phase === "gameOver") break;

    // Nobody draws and no claim is settled while the tile can still be taken
    // back; after that the table moves on as if it had been thrown then.
    const hold = room.takeBack;
    if (hold) {
      const live = state.lastDiscard?.tile.id === hold.tileId;
      if (live && now < hold.until) break;
      if (live) room.lastStepAt = Math.max(room.lastStepAt, hold.until);
      room.takeBack = null;
      changed = true;
    }

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
          optionId = strategy.chooseClaim(state, turn.seat, turn.options, rng)?.id ?? null;
        }
      }
      // People were being waited on: the computer's next move is paced from
      // when the window closed, not from the discard that opened it.
      if (room.claimDeadline !== null) {
        room.lastStepAt = Math.max(room.lastStepAt, Math.min(now, room.claimDeadline));
      }
      const taken = state.lastDiscard?.tile.id;
      move(turn ? answerClaim(state, turn.seat, optionId) : resolveClaims(state, []));
      if (turn && room.claimResponses[String(turn.seat)] === undefined) playedFor(turn.seat, state);
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
      playedFor(state.turn, state);
      room.lastStepAt = due;
      openWindow();
      continue;
    }

    // The computer's turn, at the table's pace.
    const due = room.lastStepAt + pace;
    if (now < due) break;
    const next = stepAiTurn(state, rng, strategy);
    if (next === state) break;
    move(next);
    playedFor(state.turn, state);
    room.lastStepAt = due;
    openWindow();
  }

  if (noteActing(room, now)) changed = true;
  room.rngCalls += 1;
  return changed;
}

/**
 * Who holds the deal: the tablet. A game needs it as the table, so phones
 * alone never deal — there would be no screen showing the ponds.
 *
 * This is a question of role, not of readiness: the tablet holds the deal from
 * the moment it is set down, so it can show the button greyed out with the
 * seat count beside it rather than nothing at all. Whether there is anybody to
 * deal *to* is checked when the command actually arrives.
 */
export function mayDeal(room: Room, token: string | null): boolean {
  if (room.started) return false;
  return identify(room, token).role === "table";
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
  // Handed to the computer by the table: the computer's whether or not a hand is dealt.
  if (occupant.kind === "ai" && occupant.name) return { kind: "ai", name: occupant.name, away: false };
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
      taken: p.taken ?? [],
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
      const extended = claimExtended(room, asked.seat);
      claim = {
        options: asked.options,
        deadlineIn: Math.max(0, (room.claimDeadline ?? now + CLAIM_WINDOW_MS) - now),
        allowance: CLAIM_WINDOW_MS + (extended ? CLAIM_MORE_TIME_MS : 0),
        canExtend: !extended && choosingBetweenSets(asked.options),
        declared: state.claimedWins ?? [],
      };
    }
  }

  const actions =
    you.role === "player" && you.seat !== null ? turnActions(state, you.seat) : null;
  const displaced =
    you.role === "spectator" && token ? room.displaced.filter((d) => d.token === token).pop() : undefined;

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
    // Settled, every hand is face up: the drawn tile is the self-drawn winner, shown to all.
    drawnTileId: settled || (you.role === "player" && you.seat === state.turn) ? state.drawnTileId : null,
    players,
    scores: state.scores,
    result: state.result,
    history: state.history,
    log: state.log,
    config: state.config,
    you,
    displacedFrom: displaced && displaced.seat !== "table" ? displaced.seat : null,
    displacedByTable: displaced?.byTable === true,
    tableTakenOver: displaced?.seat === "table",
    tablePresent: room.table !== null,
    tableAway: room.table !== null && now - room.table.lastSeen > TABLE_IDLE_MS,
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
    openingLeft:
      room.started && room.table !== null && isOpeningTurn(state)
        ? Math.max(0, room.lastStepAt - now)
        : 0,
    hurry:
      room.hurry &&
      now - room.hurry.at < HURRY_FLASH_MS &&
      actingHumanSeat(room, now) === room.hurry.seat
        ? {
            seat: room.hurry.seat,
            by: occupantSummary(room.seats[room.hurry.by], room.hurry.by, playing, now).name ?? SEAT_NAMES[room.hurry.by],
            id: room.hurry.at,
          }
        : null,
    hurryCooldown:
      room.hurry && now - room.hurry.at < HURRY_COOLDOWN_MS
        ? { seat: room.hurry.seat, by: room.hurry.by, left: room.hurry.at + HURRY_COOLDOWN_MS - now }
        : null,
    hurryGraceLeft: hurryGraceLeft(room, now),
    hurried: hurriedThisWait(room, now),
    stoodIn: you.role === "player" && you.seat !== null ? room.stoodIn[you.seat] : 0,
    takeBackIn: you.seat !== null && takeBackRefusal(room, you.seat, now) === null ? room.takeBack!.until - now : 0,
    takeBack:
      you.role === "player" && you.seat !== null
        ? { on: takesBack(room, you.seat), assist: assistChoice(room.seats[you.seat]) }
        : { on: false, assist: null },
    ready: room.started && state.phase === "handOver" ? room.ready : [],
    readyWaiting: readyWaiting(room, now),
    look: room.look,
  };
}

function assistChoice(occupant: Occupant): boolean | null {
  return occupant.kind === "human" && occupant.takeBack !== undefined ? occupant.takeBack : null;
}

/**
 * Whether the table holds this seat's throws for a take back: the table
 * allows it, and the person in the chair has it on among their assists or is
 * Louis, who always has it.
 */
export function takesBack(room: Room, seat: Seat): boolean {
  const occupant = room.seats[seat];
  if (!room.settings.takeBack || occupant.kind !== "human") return false;
  return occupant.takeBack === true || alwaysTakesBack(occupant.name);
}

/** Record whether this seat's phone has take back on among its assists. */
export function setTakeBackAssist(room: Room, seat: Seat, on: boolean): void {
  const occupant = room.seats[seat];
  if (occupant.kind !== "human") return;
  occupant.takeBack = on;
  // Switched off mid-throw, the tile it was holding goes on its way.
  if (!takesBack(room, seat) && room.takeBack?.seat === seat) room.takeBack = null;
}

/**
 * Why this seat cannot take its discard back right now, or null if it can:
 * its own tile, still the last thing to happen, in time, and nobody has
 * claimed it.
 */
export function takeBackRefusal(room: Room, seat: Seat, now = Date.now()): string | null {
  const hold = room.takeBack;
  if (!room.settings.takeBack) return "This table does not take discards back";
  if (!takesBack(room, seat)) return "Take back is not on for you";
  if (!hold || hold.seat !== seat || room.state.lastDiscard?.tile.id !== hold.tileId) {
    return "There is no discard of yours to take back";
  }
  if (now >= hold.until) return "Too late to take it back";
  if (Object.values(room.claimResponses).some((answer) => answer !== null)) return "Somebody has claimed it";
  return null;
}

/** Remember a person's discard for the moment it can be taken back. */
export function noteDiscard(room: Room, seat: Seat, before: GameState, now = Date.now()): void {
  room.takeBack =
    takesBack(room, seat) && room.state.lastDiscard?.from === seat
      ? {
          seat,
          tileId: room.state.lastDiscard.tile.id,
          until: now + TAKE_BACK_MS,
          before,
          lastStepAt: room.lastStepAt,
          lastPlayed: room.lastPlayed,
        }
      : null;
}

/** Put the tile back in the hand and the table back as it was before it was thrown. */
export function takeBackDiscard(room: Room, seat: Seat, now = Date.now()): string | null {
  const refused = takeBackRefusal(room, seat, now);
  if (refused) return refused;
  const hold = room.takeBack!;
  room.state = hold.before;
  room.lastStepAt = hold.lastStepAt;
  room.lastPlayed = hold.lastPlayed;
  room.claimResponses = {};
  room.claimDeadline = null;
  room.takeBack = null;
  return null;
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
