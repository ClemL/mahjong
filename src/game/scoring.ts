/**
 * Hong Kong (old style) scoring — 番 (faan) patterns and the payout table.
 *
 * Hong Kong scoring is a house-rules affair; the exact table used here is
 * documented in RULES (see src/game/rules.ts) and surfaced in the app so a
 * player can see precisely what is being counted.
 */
import {
  DRAGONS,
  type Seat,
  type Tile,
  type TileCode,
  WINDS,
  isHonor,
  isTerminal,
  isTerminalOrHonor,
  seatWind,
  suitOf,
} from "./tiles";
import type { Meld } from "./melds";
import { type Decomposition, analyzeShape } from "./winning";
import type { RuleConfig } from "./rules";

export interface PatternHit {
  key: string;
  chinese: string;
  name: string;
  faan: number;
}

export interface ScoreResult {
  /** Raw faan before the limit is applied. */
  faan: number;
  /** Faan actually used for payment (capped at the configured limit). */
  scoredFaan: number;
  patterns: PatternHit[];
  /** Point value of the hand for a single payer. */
  value: number;
  limitReached: boolean;
}

export interface WinContext {
  /** Concealed tiles including the winning tile. */
  concealed: Tile[];
  melds: Meld[];
  flowers: Tile[];
  winningTile: TileCode;
  seat: Seat;
  roundWind: TileCode;
  selfDrawn: boolean;
  /** 搶槓 — won by robbing an added kong. */
  robbingKong: boolean;
  /** 槓上開花 — won on a kong replacement tile. */
  onKongReplacement: boolean;
  /** 海底撈月 / 河底撈魚 — won on the very last tile of the wall. */
  onLastTile: boolean;
  config: RuleConfig;
}

interface SetUnit {
  type: "chow" | "pung" | "kong";
  codes: TileCode[];
  concealed: boolean;
}

const FLOWER_SET = ["f1", "f2", "f3", "f4"];
const SEASON_SET = ["f5", "f6", "f7", "f8"];

function unitsFor(decomposition: Decomposition, melds: Meld[]): { sets: SetUnit[]; pair: TileCode } {
  const sets: SetUnit[] = melds.map((m) => ({
    type: m.type,
    codes: m.tiles.map((t) => t.code),
    concealed: m.concealed,
  }));
  for (const s of decomposition.sets) {
    sets.push({ type: s.type, codes: s.codes, concealed: true });
  }
  return { sets, pair: decomposition.pair };
}

function allTileCodes(sets: SetUnit[], pair: TileCode): TileCode[] {
  return [...sets.flatMap((s) => s.codes), pair, pair];
}

function scoreFlowers(ctx: WinContext, hits: PatternHit[]): void {
  const codes = ctx.flowers.map((t) => t.code);
  const hasAllFlowers = FLOWER_SET.every((c) => codes.includes(c));
  const hasAllSeasons = SEASON_SET.every((c) => codes.includes(c));

  if (hasAllFlowers && hasAllSeasons) {
    hits.push({ key: "allEightBonus", chinese: "八仙過海", name: "All Eight Bonus Tiles", faan: ctx.config.faan.allEightBonus });
    return;
  }
  if (hasAllFlowers) {
    hits.push({ key: "flowerSet", chinese: "一台花 (花)", name: "Complete Set of Flowers", faan: ctx.config.faan.bonusSet });
  }
  if (hasAllSeasons) {
    hits.push({ key: "seasonSet", chinese: "一台花 (季)", name: "Complete Set of Seasons", faan: ctx.config.faan.bonusSet });
  }
  if (hasAllFlowers && hasAllSeasons) return;

  const ownFlower = FLOWER_SET[ctx.seat];
  const ownSeason = SEASON_SET[ctx.seat];
  if (!hasAllFlowers && codes.includes(ownFlower)) {
    hits.push({ key: "ownFlower", chinese: "正花", name: "Own Flower", faan: 1 });
  }
  if (!hasAllSeasons && codes.includes(ownSeason)) {
    hits.push({ key: "ownSeason", chinese: "正花", name: "Own Season", faan: 1 });
  }
  if (codes.length === 0) {
    hits.push({ key: "noBonus", chinese: "無花", name: "No Bonus Tiles", faan: ctx.config.faan.noBonus });
  }
}

function scoreSituational(ctx: WinContext, hits: PatternHit[], melds: Meld[]): void {
  const f = ctx.config.faan;
  if (ctx.selfDrawn) {
    hits.push({ key: "selfDraw", chinese: "自摸", name: "Self Draw", faan: f.selfDraw });
  }
  const fullyConcealed = melds.every((m) => m.concealed);
  if (fullyConcealed && !ctx.selfDrawn) {
    hits.push({ key: "concealedHand", chinese: "門前清", name: "Concealed Hand", faan: f.concealedHand });
  }
  const allExposed = melds.length === 4 && melds.every((m) => !m.concealed);
  if (allExposed && !ctx.selfDrawn) {
    hits.push({ key: "allExposed", chinese: "全求人", name: "All Melds Claimed", faan: f.allExposed });
  }
  if (ctx.onKongReplacement) {
    hits.push({ key: "kongReplacement", chinese: "槓上開花", name: "Win on Kong Replacement", faan: f.kongReplacement });
  }
  if (ctx.robbingKong) {
    hits.push({ key: "robbingKong", chinese: "搶槓", name: "Robbing the Kong", faan: f.robbingKong });
  }
  if (ctx.onLastTile) {
    hits.push({
      key: "lastTile",
      chinese: ctx.selfDrawn ? "海底撈月" : "河底撈魚",
      name: "Win on the Last Tile",
      faan: f.lastTile,
    });
  }
}

/** Score one decomposition of the hand. Returns the patterns found. */
function scoreDecomposition(ctx: WinContext, decomposition: Decomposition): PatternHit[] {
  const f = ctx.config.faan;
  const { sets, pair } = unitsFor(decomposition, ctx.melds);
  const tiles = allTileCodes(sets, pair);
  const hits: PatternHit[] = [];

  const suits = new Set(tiles.map(suitOf).filter(Boolean) as string[]);
  const hasHonor = tiles.some(isHonor);
  const triplets = sets.filter((s) => s.type !== "chow");
  const allPungs = triplets.length === 4;
  const allChows = sets.every((s) => s.type === "chow");

  // --- Structural patterns -------------------------------------------------
  if (allChows) {
    hits.push({ key: "allChows", chinese: "平糊", name: "All Sequences", faan: f.allChows });
  }
  if (allPungs) {
    hits.push({ key: "allPungs", chinese: "對對糊", name: "All Triplets", faan: f.allPungs });
  }
  if (sets.filter((s) => s.type === "kong").length === 4) {
    hits.push({ key: "fourKongs", chinese: "十八羅漢", name: "Four Kongs", faan: f.fourKongs });
  }

  // --- Suit purity ---------------------------------------------------------
  if (suits.size === 0) {
    hits.push({ key: "allHonors", chinese: "字一色", name: "All Honors", faan: f.allHonors });
  } else if (suits.size === 1 && !hasHonor) {
    hits.push({ key: "fullFlush", chinese: "清一色", name: "Full Flush", faan: f.fullFlush });
  } else if (suits.size === 1 && hasHonor) {
    hits.push({ key: "halfFlush", chinese: "混一色", name: "Half Flush", faan: f.halfFlush });
  }

  // --- Terminals -----------------------------------------------------------
  if (allPungs && tiles.every(isTerminalOrHonor)) {
    if (!hasHonor) {
      hits.push({ key: "allTerminals", chinese: "清幺九", name: "All Terminals", faan: f.allTerminals });
    } else if (suits.size > 0) {
      hits.push({
        key: "terminalsAndHonors",
        chinese: "混幺九",
        name: "All Terminals and Honors",
        faan: f.terminalsAndHonors,
      });
    }
  }

  // --- Dragons -------------------------------------------------------------
  const dragonPungs = triplets.filter((s) => DRAGONS.includes(s.codes[0]));
  const pairIsDragon = DRAGONS.includes(pair);
  if (dragonPungs.length === 3) {
    hits.push({ key: "bigThreeDragons", chinese: "大三元", name: "Big Three Dragons", faan: f.bigThreeDragons });
  } else if (dragonPungs.length === 2 && pairIsDragon) {
    hits.push({ key: "smallThreeDragons", chinese: "小三元", name: "Small Three Dragons", faan: f.smallThreeDragons });
  } else {
    for (const _ of dragonPungs) {
      hits.push({ key: "dragonPung", chinese: "三元牌", name: "Dragon Triplet", faan: f.honorTriplet });
    }
  }

  // --- Winds ---------------------------------------------------------------
  const windPungs = triplets.filter((s) => WINDS.includes(s.codes[0]));
  const pairIsWind = WINDS.includes(pair);
  if (windPungs.length === 4) {
    hits.push({ key: "bigFourWinds", chinese: "大四喜", name: "Big Four Winds", faan: f.bigFourWinds });
  } else if (windPungs.length === 3 && pairIsWind) {
    hits.push({ key: "smallFourWinds", chinese: "小四喜", name: "Small Four Winds", faan: f.smallFourWinds });
  } else {
    const own = seatWind(ctx.seat);
    for (const w of windPungs) {
      if (w.codes[0] === own) {
        hits.push({ key: "seatWind", chinese: "門風", name: "Seat Wind Triplet", faan: f.honorTriplet });
      }
      if (w.codes[0] === ctx.roundWind) {
        hits.push({ key: "roundWind", chinese: "圈風", name: "Round Wind Triplet", faan: f.honorTriplet });
      }
    }
  }

  scoreSituational(ctx, hits, ctx.melds);
  scoreFlowers(ctx, hits);
  return applyExclusions(hits);
}

/** Drop patterns that are implied by a higher one, so nothing is counted twice. */
function applyExclusions(hits: PatternHit[]): PatternHit[] {
  const keys = new Set(hits.map((h) => h.key));
  const drop = new Set<string>();

  if (keys.has("bigThreeDragons")) {
    drop.add("smallThreeDragons");
    drop.add("dragonPung");
  }
  if (keys.has("smallThreeDragons")) drop.add("dragonPung");
  if (keys.has("bigFourWinds")) {
    drop.add("smallFourWinds");
    drop.add("seatWind");
    drop.add("roundWind");
  }
  if (keys.has("smallFourWinds")) {
    drop.add("seatWind");
    drop.add("roundWind");
  }
  if (keys.has("allHonors")) {
    drop.add("halfFlush");
    drop.add("allPungs");
    drop.add("terminalsAndHonors");
  }
  if (keys.has("fullFlush")) drop.add("halfFlush");
  if (keys.has("allTerminals")) {
    drop.add("allPungs");
    drop.add("terminalsAndHonors");
  }
  if (keys.has("terminalsAndHonors")) drop.add("allPungs");
  if (keys.has("allEightBonus")) {
    drop.add("flowerSet");
    drop.add("seasonSet");
    drop.add("ownFlower");
    drop.add("ownSeason");
  }
  if (keys.has("flowerSet")) drop.add("ownFlower");
  if (keys.has("seasonSet")) drop.add("ownSeason");

  return hits.filter((h) => !drop.has(h.key));
}

function totalFaan(hits: PatternHit[]): number {
  return hits.reduce((sum, h) => sum + h.faan, 0);
}

/** Points a single payer owes for a hand of `faan`. */
export function faanValue(faan: number, config: RuleConfig): number {
  const table = config.payoutTable;
  const capped = Math.min(faan, config.limitFaan);
  return table[Math.min(capped, table.length - 1)];
}

/**
 * Score a completed hand, taking the best-scoring decomposition.
 * Returns null when the tiles do not form a winning hand at all.
 */
export function scoreHand(ctx: WinContext): ScoreResult | null {
  const concealedCodes = ctx.concealed.map((t) => t.code);
  const shape = analyzeShape(concealedCodes, ctx.melds);
  if (!shape) return null;

  const f = ctx.config.faan;
  let best: PatternHit[] | null = null;

  if (shape.special) {
    const hits: PatternHit[] =
      shape.special === "thirteenOrphans"
        ? [{ key: "thirteenOrphans", chinese: "十三么", name: "Thirteen Orphans", faan: f.thirteenOrphans }]
        : [{ key: "nineGates", chinese: "九蓮寶燈", name: "Nine Gates", faan: f.nineGates }];
    scoreSituational(ctx, hits, ctx.melds);
    scoreFlowers(ctx, hits);
    best = applyExclusions(hits);
  } else {
    for (const decomposition of shape.decompositions) {
      const hits = scoreDecomposition(ctx, decomposition);
      if (!best || totalFaan(hits) > totalFaan(best)) best = hits;
    }
  }

  if (!best) return null;
  const faan = totalFaan(best);
  const scoredFaan = Math.min(faan, ctx.config.limitFaan);
  return {
    faan,
    scoredFaan,
    patterns: best,
    value: faanValue(faan, ctx.config),
    limitReached: faan >= ctx.config.limitFaan,
  };
}

/** Terminal/honor helper re-exported for tests. */
export { isTerminal, isTerminalOrHonor };
