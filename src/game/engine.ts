/**
 * Hong Kong mahjong game engine.
 *
 * The engine is a pure state machine: every exported mutator takes a GameState
 * and returns a new one, so the React layer can keep history and the tests can
 * drive full hands without a UI.
 */
import {
  DRAGONS,
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
import { type PatternHit, type ScoreResult, scoreHand } from "./scoring";
import {
  DEFAULT_RULES,
  type RuleConfig,
  describeRounds,
  flowersInPlay,
  halfShare,
  liabilityInPlay,
  multipleWinnersInPlay,
  othersPayHalfInPlay,
  roundsInGame,
} from "./rules";
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
  /** What a win would score, so the claimant can see why before taking it. */
  score?: ScoreResult;
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
  /** Who paid a self-drawn win alone under 包, if anyone. */
  liable?: Seat | null;
  /**
   * The other players who won on the same discard, at a table that pays every
   * winner (雙響, 三響); `winner` is the first after the discarder.
   */
  others?: { winner: Seat; score: ScoreResult }[];
}

/** One completed hand, kept for the score history and end-of-round summary. */
export interface HandRecord {
  handNumber: number;
  roundWind: TileCode;
  dealer: Seat;
  type: "win" | "washout";
  winner: Seat | null;
  from: Seat | null;
  faan: number | null;
  value: number | null;
  payments: number[];
  /** Cumulative scores once this hand was settled. */
  scores: number[];
  /** The win's biggest pattern, to name the hand by. Absent from hands recorded before it was kept. */
  pattern?: { name: string; chinese: string } | null;
  /** The other players who won on the same discard, at a table that pays every winner. */
  alsoWon?: { winner: Seat; faan: number; value: number }[];
}

/** A move worth showing in a play log, with the tiles it involved. */
export interface PlayNote {
  kind: "discard" | "chow" | "pung" | "kong" | "win";
  /** The discard, the completed set, or the winning tile. */
  tiles: TileCode[];
  hand: number;
  /** Whose discard a claim or a win took. */
  from?: Seat;
}

export interface LogEntry {
  id: number;
  seat: Seat | null;
  text: string;
  play?: PlayNote;
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
  /**
   * Who has declared a win on the discard while others who could also win on
   * it are still being asked, at a table that pays every winner.
   */
  claimedWins?: Seat[];
  scores: number[];
  result: HandResult | null;
  /** Completed hands, oldest first. */
  history: HandRecord[];
  log: LogEntry[];
  logSeq: number;
}

export interface GameOptions {
  seed?: number;
  config?: RuleConfig;
  /** Seat controlled by the player. Defaults to East. */
  humanSeat?: Seat;
  /**
   * Deal the first hand straight away. A multiplayer room opens undealt and
   * waits in its lobby until everyone has sat down, so it passes `false`.
   */
  deal?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(
  state: GameState,
  seat: Seat | null,
  text: string,
  play?: Omit<PlayNote, "hand">,
): void {
  state.logSeq += 1;
  state.log.push(
    play
      ? { id: state.logSeq, seat, text, play: { ...play, hand: state.handNumber } }
      : { id: state.logSeq, seat, text },
  );
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
    history: [],
    log: [],
    logSeq: 0,
  };
  return options.deal === false ? state : startHand(state);
}

/** Deal a fresh hand with the current dealer and round wind. */
export function startHand(previous: GameState): GameState {
  const state = clone(previous);
  const rng = createRng(state.rngSeed ^ (state.handNumber * 0x9e3779b9));

  state.handNumber += 1;
  state.rngSeed = (state.rngSeed ^ (state.handNumber * 0x85ebca6b)) >>> 0;
  state.wall = shuffle(buildTileSet(flowersInPlay(state.config)), rng);
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
    ...(selfDrawn ? openingWin(state, seat, null) : {}),
    config: state.config,
  };
}

/**
 * 天糊 and 地糊 belong to the hand's first go-round, before anyone has claimed
 * a set or declared a kong. A claim always leaves a meld behind, and nobody
 * gets a second discard down before the go-round ends, so the table itself
 * says whether it is still untouched.
 */
function openingWin(state: GameState, seat: Seat, from: Seat | null): { heavenly: boolean; earthly: boolean } {
  const untouched = state.players.every((p) => p.melds.length === 0 && p.discards.length <= 1);
  if (!untouched) return { heavenly: false, earthly: false };
  const discarded = state.players.reduce((n, p) => n + p.discards.length, 0);
  if (from === null) {
    if (seat === state.dealer) return { heavenly: discarded === 0, earthly: false };
    return { heavenly: false, earthly: player(state, seat).discards.length === 0 };
  }
  // Off a discard, only the dealer's very first one — still in the pond here.
  return { heavenly: false, earthly: from === state.dealer && seat !== from && discarded === 1 };
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
    return { canDiscard: false, kongs: [], canWin: false, winScore: null };
  }
  const winScore = selfDrawScore(state, seat);
  return {
    canDiscard: true,
    kongs: kongOptions(state, seat),
    canWin: winScore !== null,
    winScore,
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
  log(state, seat, `${SEAT_NAMES[seat]} discards ${tileName(tile.code)}`, {
    kind: "discard",
    tiles: [tile.code],
  });

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
  log(state, seat, `${SEAT_NAMES[seat]} declares a concealed kong of ${tileName(code)}`, {
    kind: "kong",
    tiles: tiles.map((t) => t.code),
  });
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
  pung.claimedTileId = tiles[0].id;
  log(state, seat, `${SEAT_NAMES[seat]} adds to the kong of ${tileName(code)}`, {
    kind: "kong",
    tiles: pung.tiles.map((t) => t.code),
  });
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
  pung.claimedTileId = tile.id;
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
  // The wall is spent, so nobody can draw again: a pung or chow would only
  // hand the turn to someone with nothing left to draw, and a kong has no
  // replacement tile. The last discard can only be taken to win.
  const lastTile = state.wall.length === 0;
  const claims: PendingClaim[] = [];
  for (let step = 1; step <= 3; step++) {
    const seat = nextSeat(from, step);
    const options = claimOptionsFor(state, seat, tile, from, step === 1).filter(
      (o) => !lastTile || o.type === "win",
    );
    if (options.length > 0) claims.push({ seat, options });
  }
  return claims;
}

/** Only wins count when an added kong is exposed. */
function collectRobbingClaims(state: GameState, tile: Tile, from: Seat): PendingClaim[] {
  const claims: PendingClaim[] = [];
  for (let step = 1; step <= 3; step++) {
    const seat = nextSeat(from, step);
    const win = winOptionFor(state, seat, tile, from, true);
    if (win) claims.push({ seat, options: [win] });
  }
  return claims;
}

function winOptionFor(
  state: GameState,
  seat: Seat,
  tile: Tile,
  from: Seat,
  robbingKong: boolean,
): ClaimOption | null {
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
    ...openingWin(state, seat, from),
    config: state.config,
  };
  const score = scoreHand(ctx);
  if (!score || score.faan < state.config.minFaan) return null;
  return { id: `win`, type: "win", tileIds: [], codes: [tile.code], score };
}

/** Claim options for one seat. `isNext` allows chows. */
export function claimOptionsFor(
  state: GameState,
  seat: Seat,
  tile: Tile,
  from: Seat,
  isNext: boolean,
): ClaimOption[] {
  const p = player(state, seat);
  const options: ClaimOption[] = [];

  const win = winOptionFor(state, seat, tile, from, false);
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

/**
 * How strongly a claim holds against the others on the same discard: a win
 * over a pung or kong, those over a chow, and between two wins the seat that
 * plays first after the discarder.
 */
function claimRank(state: GameState, seat: Seat, option: ClaimOption): number {
  const from = state.lastDiscard?.from ?? seat;
  const distance = (((seat - from) % 4) + 4) % 4;
  return CLAIM_PRIORITY[option.type] * 4 - distance;
}

/**
 * Whose answer the discard is waiting on, and what they may claim now.
 *
 * Claims are asked one seat at a time, strongest first, so nobody is offered
 * a chow while someone else could still pung the tile out from under them.
 * A seat is offered every claim of its own that no other seat's remaining
 * claim outranks — a player who can both pung and chow sees both together.
 * Null when there is nothing left to ask.
 */
export function claimTurn(state: GameState): PendingClaim | null {
  if (state.phase !== "claiming") return null;
  let best: { seat: Seat; rank: number } | null = null;
  for (const claim of state.pendingClaims) {
    for (const option of claim.options) {
      const rank = claimRank(state, claim.seat, option);
      if (!best || rank > best.rank) best = { seat: claim.seat, rank };
    }
  }
  if (!best) return null;
  const asked = best.seat;
  const rivals = state.pendingClaims
    .filter((c) => c.seat !== asked)
    .flatMap((c) => c.options.map((o) => claimRank(state, c.seat, o)));
  const ceiling = rivals.length > 0 ? Math.max(...rivals) : -Infinity;
  const mine = state.pendingClaims.find((c) => c.seat === asked)!;
  return { seat: asked, options: mine.options.filter((o) => claimRank(state, asked, o) > ceiling) };
}

/**
 * The seat being asked turns down what it was offered. Anything lower it can
 * still claim waits for its turn to come round again; once nobody is left to
 * ask, the discard stands and play moves on.
 */
export function passClaim(previous: GameState, seat: Seat): GameState {
  const turn = claimTurn(previous);
  if (!turn || turn.seat !== seat) return previous;
  const state = clone(previous);
  const declined = new Set(turn.options.map((o) => o.id));
  state.pendingClaims = state.pendingClaims
    .map((c) => (c.seat === seat ? { ...c, options: c.options.filter((o) => !declined.has(o.id)) } : c))
    .filter((c) => c.options.length > 0);
  return state.pendingClaims.length > 0 ? state : resolveClaims(state, []);
}

/** Take a claim the seat was offered, or pass on all of them with null. */
export function answerClaim(previous: GameState, seat: Seat, optionId: string | null): GameState {
  const turn = claimTurn(previous);
  if (!turn || turn.seat !== seat) return previous;
  if (optionId === null) return passClaim(previous, seat);
  const option = turn.options.find((o) => o.id === optionId);
  if (!option) return previous;
  if (option.type === "win" && multipleWinnersInPlay(previous.config)) {
    // Every win on the tile is paid, so the others who could win on it are
    // still asked; a tile that wins a hand is nobody's for a set.
    const state = clone(previous);
    state.claimedWins = [...(state.claimedWins ?? []), seat];
    state.pendingClaims = state.pendingClaims
      .filter((c) => c.seat !== seat)
      .map((c) => ({ ...c, options: c.options.filter((o) => o.type === "win") }))
      .filter((c) => c.options.length > 0);
    return state.pendingClaims.length > 0 ? state : resolveClaims(state, []);
  }
  return resolveClaims(previous, [{ seat, optionId }]);
}

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

  taken.sort((a, b) => b.priority - a.priority || a.distance - b.distance);
  const declared = state.claimedWins ?? [];
  // A win already declared stands even if the table turned the rule off while
  // the others were still being asked.
  const winners = multipleWinnersInPlay(state.config) || declared.length > 0
    ? [...new Set([...declared, ...taken.filter((t) => t.option.type === "win").map((t) => t.seat)])]
    : taken[0]?.option.type === "win"
      ? [taken[0].seat]
      : [];
  state.claimedWins = [];
  if (winners.length > 0) return settleDiscardWins(state, winners, discarder, tile);

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

  const winner = taken[0];

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
    claimedTileId: tile.id,
  };
  claimer.melds.push(meld);
  sortHand(claimer);
  log(
    state,
    winner.seat,
    `${SEAT_NAMES[winner.seat]} claims ${tileName(tile.code)} for a ${winner.option.type}`,
    { kind: meld.type, tiles: meld.tiles.map((t) => t.code), from: discarder },
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

/**
 * Who pays a self-drawn win alone under 包: whoever fed the set that made a
 * third dragon set, or a fourth set of any kind — twelve tiles face up, a
 * fourth wind set included. The latest such feed is the one that counts, and
 * a concealed kong is nobody's feed.
 */
export function liableSeat(melds: Meld[]): Seat | null {
  let liable: Seat | null = null;
  let dragonSets = 0;
  for (const [index, meld] of melds.entries()) {
    const dragonSet = meld.type !== "chow" && DRAGONS.includes(meld.tiles[0].code);
    if (dragonSet) dragonSets += 1;
    if (meld.concealed || meld.claimedFrom === undefined) continue;
    if (index === 3 || (dragonSet && dragonSets === 3)) liable = meld.claimedFrom;
  }
  return liable;
}

/**
 * Settle a win, or several, on a discard (or a robbed kong's tile). Each
 * winner is paid by the discarder in full and, where the others pay half, by
 * each player who neither threw the tile nor won on it. The tile itself goes
 * to the first winner after the discarder; anyone else wins on it all the same.
 */
function settleDiscardWins(state: GameState, seats: Seat[], discarder: Seat, tile: Tile): GameState {
  const distance = (seat: Seat) => (((seat - discarder) % 4) + 4) % 4;
  const robbing = state.robbingKongTile !== null;
  const wins: { winner: Seat; score: ScoreResult }[] = [];
  for (const seat of [...seats].sort((a, b) => distance(a) - distance(b))) {
    const p = player(state, seat);
    const score = scoreHand({
      concealed: [...p.hand.filter((t) => !isFlower(t.code)), tile],
      melds: p.melds,
      flowers: p.flowers,
      winningTile: tile.code,
      seat,
      roundWind: state.roundWind,
      selfDrawn: false,
      robbingKong: robbing,
      onKongReplacement: false,
      onLastTile: state.lastTileInPlay,
      // Read before the tile leaves the pond, which is what makes it the first discard.
      ...openingWin(state, seat, discarder),
      config: state.config,
    });
    if (score) wins.push({ winner: seat, score });
  }

  // Out of wherever the tile sits: the discarder's pond, or the declarer's
  // hand when an added kong is being robbed.
  const source = player(state, discarder);
  if (robbing) source.hand = source.hand.filter((t) => t.id !== tile.id);
  else source.discards = source.discards.filter((t) => t.id !== tile.id);
  if (wins.length === 0) {
    state.phase = "action";
    return advanceTurn(state);
  }
  const first = player(state, wins[0].winner);
  first.hand.push(tile);
  sortHand(first);

  const payments = [0, 0, 0, 0];
  const winners = new Set(wins.map((w) => w.winner));
  for (const { winner, score } of wins) {
    payments[discarder] -= score.value;
    payments[winner] += score.value;
    if (!othersPayHalfInPlay(state.config)) continue;
    for (const p of state.players) {
      if (p.seat === discarder || winners.has(p.seat)) continue;
      payments[p.seat] -= halfShare(score.value);
      payments[winner] += halfShare(score.value);
    }
  }
  for (let i = 0; i < 4; i++) state.scores[i] += payments[i];

  state.result = {
    type: "win",
    winner: wins[0].winner,
    from: discarder,
    score: wins[0].score,
    payments,
    dealerKeeps: winners.has(state.dealer),
    liable: null,
    ...(wins.length > 1 ? { others: wins.slice(1) } : {}),
  };
  recordHand(state, wins[0].score);
  state.phase = "handOver";
  state.pendingClaims = [];
  state.robbingKongTile = null;
  for (const { winner, score } of wins) {
    log(state, winner, `${SEAT_NAMES[winner]} wins ${score.faan} faan (${score.value} points) off ${SEAT_NAMES[discarder]}`, {
      kind: "win",
      tiles: [tile.code],
      from: discarder,
    });
  }
  return state;
}

function settleWin(
  state: GameState,
  winner: Seat,
  from: Seat | null,
  score: ScoreResult,
  selfDrawn: boolean,
): void {
  const payments = [0, 0, 0, 0];
  const value = score.value;
  const liable = selfDrawn && liabilityInPlay(state.config) ? liableSeat(player(state, winner).melds) : null;
  if (liable !== null && liable !== winner) {
    payments[liable] -= value * 3;
    payments[winner] += value * 3;
  } else if (selfDrawn || from === null) {
    for (const p of state.players) {
      if (p.seat !== winner) {
        payments[p.seat] -= value;
        payments[winner] += value;
      }
    }
  } else {
    payments[from] -= value;
    payments[winner] += value;
    if (othersPayHalfInPlay(state.config)) {
      for (const p of state.players) {
        if (p.seat !== winner && p.seat !== from) {
          payments[p.seat] -= halfShare(value);
          payments[winner] += halfShare(value);
        }
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
    liable,
  };
  recordHand(state, score);
  state.phase = "handOver";
  state.pendingClaims = [];
  state.robbingKongTile = null;
  log(
    state,
    winner,
    `${SEAT_NAMES[winner]} wins ${score.faan} faan (${value} points) ${selfDrawn ? "self-drawn" : `off ${SEAT_NAMES[from!]}`}`,
    {
      kind: "win",
      tiles: !selfDrawn && state.lastDiscard ? [state.lastDiscard.tile.code] : [],
      from: selfDrawn ? undefined : (from ?? undefined),
    },
  );
}

/** Append the settled hand to the history. */
function recordHand(state: GameState, score: ScoreResult | null): void {
  const result = state.result;
  if (!result) return;
  const top = score?.patterns.reduce<PatternHit | null>((best, p) => (best && best.faan >= p.faan ? best : p), null);
  state.history.push({
    handNumber: state.handNumber,
    roundWind: state.roundWind,
    dealer: state.dealer,
    type: result.type,
    winner: result.winner,
    from: result.from,
    faan: score?.faan ?? null,
    value: score?.value ?? null,
    payments: [...result.payments],
    scores: [...state.scores],
    pattern: top ? { name: top.name, chinese: top.chinese } : null,
    ...(result.others
      ? { alsoWon: result.others.map((o) => ({ winner: o.winner, faan: o.score.faan, value: o.score.value })) }
      : {}),
  });
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
  recordHand(state, null);
  state.phase = "handOver";
  state.pendingClaims = [];
  state.robbingKongTile = null;
  state.drawnTileId = null;
  log(state, null, "The wall is exhausted — washed-out hand (流局)");
}

/** Change the table's faan minimum without disturbing the hand in progress. */
export function setMinFaan(previous: GameState, minFaan: number): GameState {
  const state = clone(previous);
  if (state.config.minFaan === minFaan) return previous;
  state.config = { ...state.config, minFaan };
  log(
    state,
    null,
    minFaan <= 0
      ? "Table minimum set to 0 faan — chicken hands may win"
      : `Table minimum set to ${minFaan} faan`,
  );
  return state;
}

/**
 * Play with or without the bonus tiles. The set is chosen as each hand is
 * dealt, so this is only taken between hands — never with flowers already out.
 */
export function setFlowers(previous: GameState, flowers: boolean): GameState {
  if (flowersInPlay(previous.config) === flowers) return previous;
  const state = clone(previous);
  state.config = { ...state.config, flowers };
  log(
    state,
    null,
    flowers ? "Flowers and Seasons are back in the set" : "Flowers and Seasons are taken out of the set",
  );
  return state;
}

/** Play with or without 包. Like the minimum, it is read when a hand is settled. */
export function setLiability(previous: GameState, liability: boolean): GameState {
  if (liabilityInPlay(previous.config) === liability) return previous;
  const state = clone(previous);
  state.config = { ...state.config, liability };
  log(state, null, liability ? "Liability (包) is in play" : "Liability (包) is switched off");
  return state;
}

/** Whether the others pay half of a discard win. Read when a hand is settled, like 包. */
export function setOthersPayHalf(previous: GameState, othersPayHalf: boolean): GameState {
  if (othersPayHalfInPlay(previous.config) === othersPayHalf) return previous;
  const state = clone(previous);
  state.config = { ...state.config, othersPayHalf };
  log(
    state,
    null,
    othersPayHalf
      ? "On a discard win the other two now pay half each"
      : "On a discard win the discarder now pays alone (出銃全包)",
  );
  return state;
}

/** Whether every player who can win on a discard is paid. Read when a discard is claimed. */
export function setMultipleWinners(previous: GameState, multipleWinners: boolean): GameState {
  if (multipleWinnersInPlay(previous.config) === multipleWinners) return previous;
  const state = clone(previous);
  state.config = { ...state.config, multipleWinners };
  log(
    state,
    null,
    multipleWinners
      ? "Everyone who can win on a discard is now paid (雙響)"
      : "Only the first after the discarder can now win on it (截糊)",
  );
  return state;
}

/**
 * Change how many wind rounds the game runs. It takes effect at the end of the
 * current round: a game already in its last round under the new length ends
 * there.
 */
export function setRounds(previous: GameState, rounds: number): GameState {
  if (roundsInGame(previous.config) === rounds) return previous;
  const state = clone(previous);
  state.config = { ...state.config, rounds };
  log(state, null, `The game now runs ${describeRounds(roundsInGame(state.config))}`);
  return state;
}

/**
 * End the game where it stands. A settled hand keeps its result; a hand still
 * being played is abandoned unscored, so the scores so far are the final ones.
 */
export function endGame(previous: GameState): GameState {
  if (previous.phase === "gameOver") return previous;
  const state = clone(previous);
  if (state.phase !== "handOver") {
    state.result = null;
    state.pendingClaims = [];
    state.robbingKongTile = null;
  }
  state.phase = "gameOver";
  log(state, null, "The game was ended early.");
  return state;
}

/** Move to the next hand, rotating the dealership and the round wind when required. */
export function nextHand(previous: GameState): GameState {
  let state = clone(previous);
  if (state.phase !== "handOver") return state;
  const keeps = state.result?.dealerKeeps ?? false;
  if (!keeps) {
    state.dealership += 1;
    state.dealer = nextSeat(state.dealer, 1);
  }
  if (state.dealership >= 4) {
    // Four dealerships brings the deal back to the first dealer, and the
    // round wind moves on — unless that was the game's last round.
    const round = WINDS.indexOf(state.roundWind);
    const name = SEAT_NAMES[round as Seat];
    if (round + 1 >= roundsInGame(state.config)) {
      state.phase = "gameOver";
      log(state, null, `The ${name} round is complete.`);
      return state;
    }
    state.roundWind = WINDS[round + 1];
    state.dealership = 0;
    log(state, null, `The ${name} round is complete; the ${SEAT_NAMES[(round + 1) as Seat]} round begins.`);
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
