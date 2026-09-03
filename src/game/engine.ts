/**
 * Hong Kong mahjong game engine.
 *
 * The engine is a pure state machine: every exported mutator takes a GameState
 * and returns a new one, so the React layer can keep history and the tests can
 * drive full hands without a UI.
 */
import {
  SEAT_NAMES,
  type Seat,
  type Tile,
  type TileCode,
  WINDS,
  buildTileSet,
  flowerOwner,
  isFlower,
  nextSeat,
  seatWind,
  sortTiles,
  tileName,
} from "./tiles";
import { type Meld, chowPartners, removeTiles, takeTiles } from "./melds";
import { analyzeShape, waitingTiles } from "./winning";
import { type ScoreResult, scoreHand } from "./scoring";
import { DEFAULT_RULES, type RuleConfig } from "./rules";
import { createRng, shuffle } from "./rng";

export type Phase = "action" | "claiming" | "handOver" | "gameOver";

export interface PlayerState {
  seat: Seat;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  isHuman: boolean;
}

export interface ClaimOption {
  id: string;
  type: "chow" | "pung" | "kong" | "win";
  /** Tiles from the claimer's own hand that complete the meld. */
  tileIds: string[];
  /** Codes of the resulting meld, for display. */
  codes: TileCode[];
}

export interface PendingClaim {
  seat: Seat;
  options: ClaimOption[];
}

export interface HandResult {
  type: "win" | "washout";
  winner: Seat | null;
  /** Discarder, or null for a self-drawn win. */
  from: Seat | null;
  score: ScoreResult | null;
  /** Point delta applied to each seat. */
  payments: number[];
  dealerKeeps: boolean;
}

export interface LogEntry {
  id: number;
  seat: Seat | null;
  text: string;
}

export interface GameState {
  config: RuleConfig;
  rngSeed: number;
  players: PlayerState[];
  wall: Tile[];
  dealer: Seat;
  roundWind: TileCode;
  /** Dealerships completed in this round, 0–3. */
  dealership: number;
  handNumber: number;
  turn: Seat;
  phase: Phase;
  /** Tile most recently drawn by the turn player, if any. */
  drawnTileId: string | null;
  /** True when that draw was a kong replacement (槓上開花 eligibility). */
  drawWasReplacement: boolean;
  /** True once the wall has been emptied — enables 海底 / 河底. */
  lastTileInPlay: boolean;
  lastDiscard: { tile: Tile; from: Seat } | null;
  pendingClaims: PendingClaim[];
  /** Set while an added kong is exposed to being robbed. */
  robbingKongTile: Tile | null;
  scores: number[];
  result: HandResult | null;
  log: LogEntry[];
  logSeq: number;
}

export interface GameOptions {
  seed?: number;
  config?: RuleConfig;
  /** Seat controlled by the player. Defaults to East. */
  humanSeat?: Seat;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(state: GameState, seat: Seat | null, text: string): void {
  state.logSeq += 1;
  state.log.push({ id: state.logSeq, seat, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

function player(state: GameState, seat: Seat): PlayerState {
  return state.players[seat];
}

function sortHand(p: PlayerState): void {
  p.hand = sortTiles(p.hand);
}

/** Draw from the front of the live wall. */
function drawFront(state: GameState): Tile | null {
  const tile = state.wall.shift() ?? null;
  if (state.wall.length === 0) state.lastTileInPlay = true;
  return tile;
}

/** Draw a kong replacement from the back of the wall. */
function drawBack(state: GameState): Tile | null {
  const tile = state.wall.pop() ?? null;
  if (state.wall.length === 0) state.lastTileInPlay = true;
  return tile;
}

/**
 * Reveal any bonus tiles in a player's hand, replacing each from the back of
 * the wall. Returns false if the wall ran out mid-replacement.
 */
function replaceFlowers(state: GameState, seat: Seat): boolean {
  const p = player(state, seat);
  for (;;) {
    const flower = p.hand.find((t) => isFlower(t.code));
    if (!flower) return true;
    p.hand = p.hand.filter((t) => t.id !== flower.id);
    p.flowers.push(flower);
    log(state, seat, `${SEAT_NAMES[seat]} reveals ${tileName(flower.code)}`);
    const replacement = drawBack(state);
    if (!replacement) return false;
    p.hand.push(replacement);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(options: GameOptions = {}): GameState {
  const humanSeat = options.humanSeat ?? 0;
  const state: GameState = {
    config: options.config ?? DEFAULT_RULES,
    rngSeed: options.seed ?? Math.floor(Math.random() * 0xffffffff),
    players: ([0, 1, 2, 3] as Seat[]).map((seat) => ({
      seat,
      hand: [],
      melds: [],
      flowers: [],
      discards: [],
      isHuman: seat === humanSeat,
    })),
    wall: [],
    dealer: 0,
    roundWind: WINDS[0],
    dealership: 0,
    handNumber: 0,
    turn: 0,
    phase: "action",
    drawnTileId: null,
    drawWasReplacement: false,
    lastTileInPlay: false,
    lastDiscard: null,
    pendingClaims: [],
    robbingKongTile: null,
    scores: [0, 0, 0, 0],
    result: null,
    log: [],
    logSeq: 0,
  };
  return startHand(state);
}

/** Deal a fresh hand with the current dealer and round wind. */
export function startHand(previous: GameState): GameState {
  const state = clone(previous);
  const rng = createRng(state.rngSeed ^ (state.handNumber * 0x9e3779b9));

  state.handNumber += 1;
  state.rngSeed = (state.rngSeed ^ (state.handNumber * 0x85ebca6b)) >>> 0;
  state.wall = shuffle(buildTileSet(), rng);
  state.phase = "action";
  state.drawnTileId = null;
  state.drawWasReplacement = false;
  state.lastTileInPlay = false;
  state.lastDiscard = null;
  state.pendingClaims = [];
  state.robbingKongTile = null;
  state.result = null;
  state.turn = state.dealer;

  for (const p of state.players) {
    p.hand = [];
    p.melds = [];
    p.flowers = [];
    p.discards = [];
  }

  // Deal 13 tiles to each player, starting with the dealer.
  for (let round = 0; round < 13; round++) {
    for (let i = 0; i < 4; i++) {
      const seat = nextSeat(state.dealer, i);
      const tile = drawFront(state);
      if (tile) player(state, seat).hand.push(tile);
    }
  }
  for (let i = 0; i < 4; i++) {
    const seat = nextSeat(state.dealer, i);
    replaceFlowers(state, seat);
    sortHand(player(state, seat));
  }

  log(
    state,
    null,
    `Hand ${state.handNumber} — ${SEAT_NAMES[state.dealer]} deals, ${SEAT_NAMES[WINDS.indexOf(state.roundWind) as Seat]} round`,
  );

  // The dealer takes the 14th tile and opens play.
  drawTile(state, state.dealer, false);
  return state;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Mutating draw used internally; `replacement` marks a kong replacement draw. */
function drawTile(state: GameState, seat: Seat, replacement: boolean): void {
  const tile = replacement ? drawBack(state) : drawFront(state);
  if (!tile) {
    endInWashout(state);
    return;
  }
  const p = player(state, seat);
  p.hand.push(tile);
  state.turn = seat;
  state.drawnTileId = tile.id;
  state.drawWasReplacement = replacement;
  state.phase = "action";

  if (isFlower(tile.code)) {
    if (!replaceFlowers(state, seat)) {
      endInWashout(state);
      return;
    }
    // The tile actually held is the last replacement drawn.
    state.drawnTileId = p.hand[p.hand.length - 1]?.id ?? null;
    state.drawWasReplacement = true;
  }
  sortHand(p);
}

/** Advance to the next seat and draw. Exported for the turn loop. */
export function advanceTurn(previous: GameState): GameState {
  const state = clone(previous);
  if (state.phase !== "action" && state.phase !== "claiming") return state;
  if (state.wall.length === 0) {
    endInWashout(state);
    return state;
  }
  const seat = nextSeat(state.turn, 1);
  state.lastDiscard = null;
  state.pendingClaims = [];
  drawTile(state, seat, false);
  return state;
}

// ---------------------------------------------------------------------------
// Available actions for the player in turn
// ---------------------------------------------------------------------------

export interface KongOption {
  kind: "concealed" | "added";
  code: TileCode;
  tileIds: string[];
}

export interface TurnActions {
  canDiscard: boolean;
  kongs: KongOption[];
  canWin: boolean;
  winScore: ScoreResult | null;
  /** Tile codes that would complete the hand after the best discard, if any. */
  waits: TileCode[];
}

/** Kongs the seat may declare on its own turn. */
export function kongOptions(state: GameState, seat: Seat): KongOption[] {
  const p = player(state, seat);
  const options: KongOption[] = [];
  const counts = new Map<TileCode, Tile[]>();
  for (const t of p.hand) {
    if (isFlower(t.code)) continue;
    const list = counts.get(t.code) ?? [];
    list.push(t);
    counts.set(t.code, list);
  }
  for (const [code, tiles] of counts) {
    if (tiles.length === 4) {
      options.push({ kind: "concealed", code, tileIds: tiles.map((t) => t.id) });
    } else if (tiles.length >= 1 && p.melds.some((m) => m.type === "pung" && m.tiles[0].code === code)) {
      options.push({ kind: "added", code, tileIds: [tiles[0].id] });
    }
  }
  return options;
}

function buildWinContext(
  state: GameState,
  seat: Seat,
  winningTile: TileCode,
  selfDrawn: boolean,
  robbingKong: boolean,
) {
  const p = player(state, seat);
  return {
    concealed: p.hand.filter((t) => !isFlower(t.code)),
    melds: p.melds,
    flowers: p.flowers,
    winningTile,
    seat,
    roundWind: state.roundWind,
    selfDrawn,
    robbingKong,
    onKongReplacement: selfDrawn && state.drawWasReplacement,
    onLastTile: state.lastTileInPlay,
    config: state.config,
  };
}

/** Score a self-drawn win for `seat` as the hand currently stands, or null. */
export function selfDrawScore(state: GameState, seat: Seat): ScoreResult | null {
  const p = player(state, seat);
  const drawn = p.hand.find((t) => t.id === state.drawnTileId);
  if (!drawn) return null;
  const result = scoreHand(buildWinContext(state, seat, drawn.code, true, false));
  if (!result || result.faan < state.config.minFaan) return null;
  return result;
}

export function turnActions(state: GameState, seat: Seat): TurnActions {
  // A settled discard still sitting on the table means this seat has already
  // acted and the turn has yet to pass on.
  if (state.phase !== "action" || state.turn !== seat || state.lastDiscard !== null) {
    return { canDiscard: false, kongs: [], canWin: false, winScore: null, waits: [] };
  }
  const p = player(state, seat);
  const winScore = selfDrawScore(state, seat);
  return {
    canDiscard: true,
    kongs: kongOptions(state, seat),
    canWin: winScore !== null,
    winScore,
    waits: waitingTiles(
      p.hand.filter((t) => !isFlower(t.code)).map((t) => t.code),
      p.melds,
    ),
  };
}

/** Tile codes that would complete this seat's hand if it discarded `tileId`. */
export function waitsAfterDiscard(state: GameState, seat: Seat, tileId: string): TileCode[] {
  const p = player(state, seat);
  const remaining = p.hand.filter((t) => t.id !== tileId && !isFlower(t.code)).map((t) => t.code);
  return waitingTiles(remaining, p.melds);
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export function discard(previous: GameState, seat: Seat, tileId: string): GameState {
  const state = clone(previous);
  if (state.phase !== "action" || state.turn !== seat || state.lastDiscard !== null)
    return state;
  const p = player(state, seat);
  const tile = p.hand.find((t) => t.id === tileId);
  if (!tile) return state;

  p.hand = p.hand.filter((t) => t.id !== tileId);
  sortHand(p);
  p.discards.push(tile);
  state.lastDiscard = { tile, from: seat };
  state.drawnTileId = null;
  state.drawWasReplacement = false;
  log(state, seat, `${SEAT_NAMES[seat]} discards ${tileName(tile.code)}`);

  state.pendingClaims = collectClaims(state, tile, seat);
  state.phase = state.pendingClaims.length > 0 ? "claiming" : "action";
  return state;
}

export function declareConcealedKong(previous: GameState, seat: Seat, code: TileCode): GameState {
  const state = clone(previous);
  if (state.phase !== "action" || state.turn !== seat || state.lastDiscard !== null)
    return state;
  const p = player(state, seat);
  const tiles = takeTiles(p.hand, code, 4);
  if (!tiles) return state;
  p.hand = removeTiles(p.hand, tiles);
  p.melds.push({ type: "kong", tiles, concealed: true });
  log(state, seat, `${SEAT_NAMES[seat]} declares a concealed kong of ${tileName(code)}`);
  drawTile(state, seat, true);
  return state;
}

export function declareAddedKong(previous: GameState, seat: Seat, code: TileCode): GameState {
  const state = clone(previous);
  if (state.phase !== "action" || state.turn !== seat || state.lastDiscard !== null)
    return state;
  const p = player(state, seat);
  const pung = p.melds.find((m) => m.type === "pung" && m.tiles[0].code === code);
  const tiles = takeTiles(p.hand, code, 1);
  if (!pung || !tiles) return state;

  // The tile is exposed before the kong completes, so it can be robbed.
  const robbers = collectRobbingClaims(state, tiles[0], seat);
  if (robbers.length > 0) {
    state.robbingKongTile = tiles[0];
    state.lastDiscard = { tile: tiles[0], from: seat };
    state.pendingClaims = robbers;
    state.phase = "claiming";
    log(state, seat, `${SEAT_NAMES[seat]} adds to the kong of ${tileName(code)}`);
    return state;
  }

  p.hand = removeTiles(p.hand, tiles);
  pung.type = "kong";
  pung.tiles.push(tiles[0]);
  pung.fromAddedKong = true;
  log(state, seat, `${SEAT_NAMES[seat]} adds to the kong of ${tileName(code)}`);
  drawTile(state, seat, true);
  return state;
}

/** Complete an added kong that nobody robbed. */
function finishAddedKong(state: GameState, seat: Seat, tile: Tile): void {
  const p = player(state, seat);
  const pung = p.melds.find((m) => m.type === "pung" && m.tiles[0].code === tile.code);
  if (!pung) return;
  p.hand = removeTiles(p.hand, [tile]);
  pung.type = "kong";
  pung.tiles.push(tile);
  pung.fromAddedKong = true;
  state.robbingKongTile = null;
  state.lastDiscard = null;
  state.pendingClaims = [];
  drawTile(state, seat, true);
}

export function declareSelfDraw(previous: GameState, seat: Seat): GameState {
  const state = clone(previous);
  const score = selfDrawScore(state, seat);
  if (!score) return state;
  settleWin(state, seat, null, score, true);
  return state;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** Everything the other three seats could do with `tile` discarded by `from`. */
export function collectClaims(state: GameState, tile: Tile, from: Seat): PendingClaim[] {
  const claims: PendingClaim[] = [];
  for (let step = 1; step <= 3; step++) {
    const seat = nextSeat(from, step);
    const options = claimOptionsFor(state, seat, tile, from, step === 1);
    if (options.length > 0) claims.push({ seat, options });
  }
  return claims;
}

/** Only wins count when an added kong is exposed. */
function collectRobbingClaims(state: GameState, tile: Tile, from: Seat): PendingClaim[] {
  const claims: PendingClaim[] = [];
  for (let step = 1; step <= 3; step++) {
    const seat = nextSeat(from, step);
    const win = winOptionFor(state, seat, tile, true);
    if (win) claims.push({ seat, options: [win] });
  }
  return claims;
}

function winOptionFor(state: GameState, seat: Seat, tile: Tile, robbingKong: boolean): ClaimOption | null {
  const p = player(state, seat);
  const concealed = p.hand.filter((t) => !isFlower(t.code));
  const codes = [...concealed.map((t) => t.code), tile.code];
  if (!analyzeShape(codes, p.melds)) return null;
  const ctx = {
    concealed: [...concealed, tile],
    melds: p.melds,
    flowers: p.flowers,
    winningTile: tile.code,
    seat,
    roundWind: state.roundWind,
    selfDrawn: false,
    robbingKong,
    onKongReplacement: false,
    onLastTile: state.lastTileInPlay,
    config: state.config,
  };
  const score = scoreHand(ctx);
  if (!score || score.faan < state.config.minFaan) return null;
  return { id: `win`, type: "win", tileIds: [], codes: [tile.code] };
}

/** Claim options for one seat. `isNext` allows chows. */
export function claimOptionsFor(
  state: GameState,
  seat: Seat,
  tile: Tile,
  _from: Seat,
  isNext: boolean,
): ClaimOption[] {
  const p = player(state, seat);
  const options: ClaimOption[] = [];

  const win = winOptionFor(state, seat, tile, false);
  if (win) options.push(win);

  const matching = p.hand.filter((t) => t.code === tile.code);
  if (matching.length >= 3) {
    options.push({
      id: `kong:${tile.code}`,
      type: "kong",
      tileIds: matching.slice(0, 3).map((t) => t.id),
      codes: [tile.code, tile.code, tile.code, tile.code],
    });
  }
  if (matching.length >= 2) {
    options.push({
      id: `pung:${tile.code}`,
      type: "pung",
      tileIds: matching.slice(0, 2).map((t) => t.id),
      codes: [tile.code, tile.code, tile.code],
    });
  }
  if (isNext) {
    for (const [a, b] of chowPartners(tile.code)) {
      const ta = p.hand.find((t) => t.code === a);
      const tb = p.hand.find((t) => t.code === b && t.id !== ta?.id);
      if (ta && tb) {
        options.push({
          id: `chow:${a}-${b}`,
          type: "chow",
          tileIds: [ta.id, tb.id],
          codes: [a, b, tile.code].sort(),
        });
      }
    }
  }
  return options;
}

const CLAIM_PRIORITY: Record<ClaimOption["type"], number> = { win: 3, kong: 2, pung: 2, chow: 1 };

export interface ClaimDecision {
  seat: Seat;
  optionId: string | null;
}

/**
 * Resolve a round of claims. `decisions` must cover every seat in
 * `state.pendingClaims`; a null optionId is a pass.
 */
export function resolveClaims(previous: GameState, decisions: ClaimDecision[]): GameState {
  const state = clone(previous);
  if (state.phase !== "claiming" || !state.lastDiscard) return state;
  const discarder = state.lastDiscard.from;
  const tile = state.lastDiscard.tile;

  type Taken = { seat: Seat; option: ClaimOption; priority: number; distance: number };
  const taken: Taken[] = [];
  for (const decision of decisions) {
    if (!decision.optionId) continue;
    const pending = state.pendingClaims.find((c) => c.seat === decision.seat);
    const option = pending?.options.find((o) => o.id === decision.optionId);
    if (!option) continue;
    const distance = (((decision.seat - discarder) % 4) + 4) % 4;
    taken.push({ seat: decision.seat, option, priority: CLAIM_PRIORITY[option.type], distance });
  }

  if (taken.length === 0) {
    if (state.robbingKongTile) {
      finishAddedKong(state, discarder, state.robbingKongTile);
      return state;
    }
    state.pendingClaims = [];
    state.phase = "action";
    if (state.wall.length === 0) {
      endInWashout(state);
      return state;
    }
    return advanceTurn(state);
  }

  taken.sort((a, b) => b.priority - a.priority || a.distance - b.distance);
  const winner = taken[0];

  if (winner.option.type === "win") {
    const p = player(state, winner.seat);
    // Move the winning tile out of wherever it currently sits: the discarder's
    // pond, or the declarer's hand when an added kong is being robbed.
    const source = player(state, discarder);
    if (state.robbingKongTile) {
      source.hand = source.hand.filter((t) => t.id !== tile.id);
    } else {
      source.discards = source.discards.filter((t) => t.id !== tile.id);
    }
    p.hand.push(tile);
    sortHand(p);
    const robbing = state.robbingKongTile !== null;
    const score = scoreHand({
      concealed: p.hand.filter((t) => !isFlower(t.code)),
      melds: p.melds,
      flowers: p.flowers,
      winningTile: tile.code,
      seat: winner.seat,
      roundWind: state.roundWind,
      selfDrawn: false,
      robbingKong: robbing,
      onKongReplacement: false,
      onLastTile: state.lastTileInPlay,
      config: state.config,
    });
    if (!score) {
      p.hand = p.hand.filter((t) => t.id !== tile.id);
      state.phase = "action";
      return advanceTurn(state);
    }
    settleWin(state, winner.seat, discarder, score, false);
    return state;
  }

  // A meld claim: take the discard out of the discarder's pond.
  const discarderState = player(state, discarder);
  discarderState.discards = discarderState.discards.filter((t) => t.id !== tile.id);

  const claimer = player(state, winner.seat);
  const fromHand = claimer.hand.filter((t) => winner.option.tileIds.includes(t.id));
  claimer.hand = removeTiles(claimer.hand, fromHand);
  const meld: Meld = {
    type: winner.option.type as "chow" | "pung" | "kong",
    tiles: sortTiles([...fromHand, tile]),
    concealed: false,
    claimedFrom: discarder,
  };
  claimer.melds.push(meld);
  sortHand(claimer);
  log(
    state,
    winner.seat,
    `${SEAT_NAMES[winner.seat]} claims ${tileName(tile.code)} for a ${winner.option.type}`,
  );

  state.lastDiscard = null;
  state.pendingClaims = [];
  state.robbingKongTile = null;
  state.turn = winner.seat;
  state.phase = "action";

  if (meld.type === "kong") {
    drawTile(state, winner.seat, true);
  } else {
    state.drawnTileId = null;
    state.drawWasReplacement = false;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

function settleWin(
  state: GameState,
  winner: Seat,
  from: Seat | null,
  score: ScoreResult,
  selfDrawn: boolean,
): void {
  const payments = [0, 0, 0, 0];
  const value = score.value;
  if (selfDrawn || from === null) {
    for (const p of state.players) {
      if (p.seat !== winner) {
        payments[p.seat] -= value;
        payments[winner] += value;
      }
    }
  } else if (state.config.discarderPaysAll) {
    payments[from] -= value;
    payments[winner] += value;
  } else {
    payments[from] -= value;
    payments[winner] += value;
    for (const p of state.players) {
      if (p.seat !== winner && p.seat !== from) {
        const half = Math.ceil(value / 2);
        payments[p.seat] -= half;
        payments[winner] += half;
      }
    }
  }

  for (let i = 0; i < 4; i++) state.scores[i] += payments[i];
  state.result = {
    type: "win",
    winner,
    from,
    score,
    payments,
    dealerKeeps: winner === state.dealer,
  };
  state.phase = "handOver";
  state.pendingClaims = [];
  state.robbingKongTile = null;
  log(
    state,
    winner,
    `${SEAT_NAMES[winner]} wins ${score.faan} faan (${value} points) ${selfDrawn ? "self-drawn" : `off ${SEAT_NAMES[from!]}`}`,
  );
}

function endInWashout(state: GameState): void {
  state.result = {
    type: "washout",
    winner: null,
    from: null,
    score: null,
    payments: [0, 0, 0, 0],
    dealerKeeps: state.config.dealerKeepsOnWashout,
  };
  state.phase = "handOver";
  state.pendingClaims = [];
  state.robbingKongTile = null;
  state.drawnTileId = null;
  log(state, null, "The wall is exhausted — washed-out hand (流局)");
}

/** Move to the next hand, rotating the dealership when required. */
export function nextHand(previous: GameState): GameState {
  let state = clone(previous);
  if (state.phase !== "handOver") return state;
  const keeps = state.result?.dealerKeeps ?? false;
  if (!keeps) {
    state.dealership += 1;
    state.dealer = nextSeat(state.dealer, 1);
  }
  if (state.dealership >= 4) {
    state.phase = "gameOver";
    log(state, null, "The East round is complete.");
    return state;
  }
  state = startHand(state);
  return state;
}

// ---------------------------------------------------------------------------
// Derived views for the UI
// ---------------------------------------------------------------------------

export function handSizeTarget(p: PlayerState): number {
  return 13 - 3 * p.melds.length;
}

export function seatLabel(state: GameState, seat: Seat): string {
  const wind = seatWind(seat);
  const isDealer = state.dealer === seat;
  return `${SEAT_NAMES[seat]}${isDealer ? " (dealer)" : ""}${wind === state.roundWind ? "" : ""}`;
}

export { log as appendLog };
