/**
 * Routes to a hand that is worth enough to win.
 *
 * A table with a faan minimum will not let a hand win just because it is
 * complete, so an opponent that only counts shanten finishes cheap hands it
 * cannot declare and the wall runs out. Each route here is a way of getting
 * the faan — a flush, all triplets, staying concealed, the honor sets and
 * bonus tiles already held — with how far the hand is from finishing along
 * it, so a discard or a claim can be judged by both.
 */
import type { Meld } from "./melds";
import { type RuleConfig, flowersInPlay } from "./rules";
import { handShanten, standardShanten } from "./shanten";
import { DRAGONS, type Seat, type Suit, SUITS, type TileCode, isHonor, seatWind, suitOf } from "./tiles";
import { CODE_INDEX, type CountVector } from "./winning";

export type Route =
  | { kind: "any" }
  | { kind: "flush"; suit: Suit }
  | { kind: "pungs" }
  | { kind: "chows" };

export interface RoutePlan {
  route: Route;
  /** Distance to a finished hand along this route; -1 is finished. */
  shanten: number;
  /** What the finished hand would be expected to score. */
  faan: number;
}

/** Who is playing the hand and under which rules — what the faan depends on beyond the tiles. */
export interface Seating {
  seat: Seat;
  roundWind: TileCode;
  flowers: TileCode[];
  config: RuleConfig;
}

const SUIT_OFFSET: Record<Suit, number> = { m: 0, p: 9, s: 18 };

/**
 * Shanten for a hand of triplets only (對對糊): every pair or triplet held is
 * a step, and one pair is the eyes.
 */
export function pungShanten(counts: CountVector, meldCount: number): number {
  const need = 4 - meldCount;
  let triplets = 0;
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 3) triplets += 1;
    else if (counts[i] === 2) pairs += 1;
  }
  const sets = Math.min(triplets, need);
  // A triplet beyond what is needed can still serve as the eyes.
  const partials = Math.min(pairs + (triplets - sets), need - sets + 1);
  return 2 * need - 2 * sets - partials;
}

/** Faan the hand carries whichever way it finishes: bonus tiles and the honor triplets already made. */
function settledFaan(counts: CountVector, melds: Meld[], seating: Seating): number {
  const { config } = seating;
  let faan = 0;
  if (flowersInPlay(config)) {
    const own = [`f${seating.seat + 1}`, `f${seating.seat + 5}`];
    faan += seating.flowers.filter((code) => own.includes(code)).length;
    if (seating.flowers.length === 0) faan += config.faan.noBonus;
  }
  const held = (code: TileCode) =>
    counts[CODE_INDEX.get(code)!] >= 3 ||
    melds.some((m) => m.type !== "chow" && m.tiles[0]?.code === code);
  // The seat's own wind in its own round counts twice, as it scores.
  for (const code of [...DRAGONS, seatWind(seating.seat), seating.roundWind]) {
    if (held(code)) faan += config.faan.honorTriplet;
  }
  return faan;
}

/** The counts with every suit but one taken away: the tiles a flush in that suit would keep. */
function flushCounts(counts: CountVector, suit: Suit): CountVector {
  const kept = [...counts];
  for (const other of SUITS) {
    if (other === suit) continue;
    for (let r = 0; r < 9; r++) kept[SUIT_OFFSET[other] + r] = 0;
  }
  return kept;
}

/** Every route still open to the hand, with how far off it is and what it would be worth. */
export function routes(counts: CountVector, melds: Meld[], seating: Seating): RoutePlan[] {
  const f = seating.config.faan;
  const base = settledFaan(counts, melds, seating) + (melds.every((m) => m.concealed) ? f.concealedHand : 0);
  const plans: RoutePlan[] = [{ route: { kind: "any" }, shanten: handShanten(counts, melds), faan: base }];

  const meldCodes = melds.flatMap((m) => m.tiles.map((t) => t.code));
  for (const suit of SUITS) {
    if (!meldCodes.every((code) => isHonor(code) || suitOf(code) === suit)) continue;
    plans.push({
      route: { kind: "flush", suit },
      shanten: handShanten(flushCounts(counts, suit), melds),
      faan: base + f.halfFlush,
    });
  }

  if (melds.every((m) => m.type !== "chow")) {
    plans.push({ route: { kind: "pungs" }, shanten: pungShanten(counts, melds.length), faan: base + f.allPungs });
  }
  if (melds.every((m) => m.type === "chow")) {
    plans.push({
      route: { kind: "chows" },
      shanten: standardShanten(counts, melds.length, false),
      faan: base + f.allChows,
    });
  }
  return plans;
}

/**
 * Which of two plans is the better one to play for: one that reaches the
 * minimum beats one that does not; among those that do, the closer to
 * finished, then the richer; among those that do not, the richer, then the
 * closer. Negative when `a` is better.
 */
export function comparePlans(a: RoutePlan, b: RoutePlan, minFaan: number): number {
  const aOk = a.faan >= minFaan;
  const bOk = b.faan >= minFaan;
  if (aOk !== bOk) return aOk ? -1 : 1;
  if (aOk) return a.shanten - b.shanten || b.faan - a.faan;
  return b.faan - a.faan || a.shanten - b.shanten;
}

/** The plan to play for among several. */
export function bestPlan(plans: RoutePlan[], minFaan: number): RoutePlan {
  return plans.reduce((best, plan) => (comparePlans(plan, best, minFaan) < 0 ? plan : best));
}
