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
  type PendingClaim,
  type Phase,
  type TurnActions,
  advanceTurn,
  createGame,
  resolveClaims,
  turnActions,
} from "./engine";
import { needsTurnAdvance, stepAiTurn } from "./controller";
import { greedyAi } from "./ai";
import { SEAT_NAMES, type Seat, type Tile, type TileCode } from "./tiles";
import type { Meld } from "./melds";
import type { RuleConfig } from "./rules";
import { createRng } from "./rng";

/** How long a seat has to answer a claim before it is treated as a pass. */
export const CLAIM_WINDOW_MS = 20_000;

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
  seats: Occupant[];
  table: TableDevice | null;
  state: GameState;
  /** Claim answers collected for the discard currently on the table. */
  claimResponses: Record<string, string | null>;
  claimDeadline: number | null;
  rngSeed: number;
  rngCalls: number;
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
  occupant: { kind: Occupant["kind"]; name: string | null };
}

export interface RoomView {
  roomId: string;
  version: number;
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
  tablePresent: boolean;
  /** Seats still waiting to answer the discard on the table. */
  awaitingClaimSeats: Seat[];
  claim: { options: ClaimOption[]; deadlineIn: number } | null;
  actions: TurnActions | null;
}

const HIDDEN: TileCode = "back";

export function newRoom(id: string, config?: RuleConfig, seed = Date.now()): Room {
  const state = createGame({ seed, config, humanSeat: 0 });
  // Every seat starts as a person's to claim; whatever is still open when play
  // runs is filled by the computer.
  for (const p of state.players) p.isHuman = false;
  return {
    id,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    seats: [{ kind: "open" }, { kind: "open" }, { kind: "open" }, { kind: "open" }],
    table: null,
    state,
    claimResponses: {},
    claimDeadline: null,
    rngSeed: seed ^ 0x5bf03635,
    rngCalls: 0,
  };
}

/** A seat a person is sitting in; open seats are played by the computer. */
export function isHumanSeat(room: Room, seat: Seat): boolean {
  return room.seats[seat].kind === "human";
}

/** Mirror seat occupancy onto the engine, which decides who it may step. */
export function syncSeats(room: Room): void {
  for (let seat = 0; seat < 4; seat++) {
    room.state.players[seat].isHuman = isHumanSeat(room, seat as Seat);
  }
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

/** Seats that still owe an answer on the discard currently on the table. */
export function pendingHumanClaimants(room: Room): Seat[] {
  if (room.state.phase !== "claiming") return [];
  return room.state.pendingClaims
    .map((c: PendingClaim) => c.seat)
    .filter((seat) => isHumanSeat(room, seat) && !(String(seat) in room.claimResponses));
}

/**
 * Advance the table as far as it can go without a person's input: resolve a
 * claim round once everyone has answered or the window has closed, pass the
 * turn on, and play any computer seats.
 */
export function drain(room: Room, now = Date.now()): boolean {
  syncSeats(room);
  // Nobody has sat down yet, so there is no game to advance. Without this a
  // room plays itself out between being created and anyone joining, and the
  // first person to arrive finds a finished hand.
  if (!room.seats.some((s) => s.kind === "human")) return false;
  const rng = createRng(room.rngSeed);
  for (let i = 0; i < room.rngCalls; i++) rng.next();

  let changed = false;
  for (let guard = 0; guard < 400; guard += 1) {
    const state = room.state;
    if (state.phase === "handOver" || state.phase === "gameOver") break;

    if (state.phase === "claiming") {
      const waiting = pendingHumanClaimants(room);
      const expired = room.claimDeadline !== null && now >= room.claimDeadline;
      if (waiting.length > 0 && !expired) break;

      const decisions = state.pendingClaims.map((c) => {
        const recorded = room.claimResponses[String(c.seat)];
        if (recorded !== undefined) return { seat: c.seat, optionId: recorded };
        if (isHumanSeat(room, c.seat)) return { seat: c.seat, optionId: null };
        const choice = greedyAi.chooseClaim(state, c.seat, c.options, rng);
        return { seat: c.seat, optionId: choice?.id ?? null };
      });
      room.state = resolveClaims(state, decisions);
      room.claimResponses = {};
      room.claimDeadline = null;
      changed = true;
      continue;
    }

    if (needsTurnAdvance(state)) {
      room.state = advanceTurn(state);
      changed = true;
      continue;
    }

    if (isHumanSeat(room, state.turn)) break;

    const next = stepAiTurn(state, rng, greedyAi);
    if (next === state) break;
    room.state = next;
    changed = true;

    // A fresh discard opens a new claim window for the people at the table.
    if (room.state.phase === "claiming" && pendingHumanClaimants(room).length > 0) {
      room.claimDeadline = now + CLAIM_WINDOW_MS;
    }
  }

  room.rngCalls += 1;
  return changed;
}

/** Open a claim window if the current discard needs one. */
export function openClaimWindow(room: Room, now = Date.now()): void {
  if (room.state.phase === "claiming" && pendingHumanClaimants(room).length > 0) {
    room.claimDeadline = now + CLAIM_WINDOW_MS;
  }
}

/**
 * An unclaimed seat is reported as computer-played once the game is running,
 * because that is what it is — but it stays claimable, so a latecomer can sit
 * down and take it over.
 */
function occupantSummary(occupant: Occupant, playing: boolean): PublicPlayer["occupant"] {
  if (occupant.kind === "human") return { kind: "human", name: occupant.name };
  return { kind: playing ? "ai" : "open", name: null };
}

/** Opaque stand-ins for tiles the viewer is not entitled to see. */
function hiddenTiles(seat: number, count: number): Tile[] {
  return Array.from({ length: count }, (_, i) => ({ id: `hidden:${seat}:${i}`, code: HIDDEN }));
}

/**
 * The room as one viewer is allowed to see it. Concealed hands and the wall
 * never leave the server: a player sees only their own tiles, and the table
 * device — a screen everyone can see — sees none of them.
 */
export function viewFor(room: Room, token: string | null, now = Date.now()): RoomView {
  const you = identify(room, token);
  const state = room.state;

  const playing = room.seats.some((occupant) => occupant.kind === "human");
  const players: PublicPlayer[] = state.players.map((p) => {
    const own = you.role === "player" && you.seat === p.seat;
    return {
      seat: p.seat,
      handCount: p.hand.length,
      hand: own ? p.hand : hiddenTiles(p.seat, p.hand.length),
      melds: p.melds,
      flowers: p.flowers,
      discards: p.discards,
      occupant: occupantSummary(room.seats[p.seat], playing),
    };
  });

  let claim: RoomView["claim"] = null;
  if (you.role === "player" && you.seat !== null && state.phase === "claiming") {
    const pending = state.pendingClaims.find((c) => c.seat === you.seat);
    const answered = String(you.seat) in room.claimResponses;
    if (pending && !answered) {
      claim = {
        options: pending.options,
        deadlineIn: Math.max(0, (room.claimDeadline ?? now) - now),
      };
    }
  }

  const actions =
    you.role === "player" && you.seat !== null ? turnActions(state, you.seat) : null;

  return {
    roomId: room.id,
    version: room.version,
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
    tablePresent: room.table !== null,
    awaitingClaimSeats: pendingHumanClaimants(room),
    claim,
    actions,
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
