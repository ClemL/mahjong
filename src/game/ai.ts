/**
 * Computer opponents.
 *
 * Iteration 1: the AI plays at random. It draws, and unless it can declare a
 * legal win it discards a uniformly random tile from its concealed hand. Claims
 * on a discard are chosen uniformly at random from {pass, ...legal claims},
 * except that a winning claim is always taken.
 *
 * The `AiStrategy` interface is the seam for smarter opponents later on.
 */
import { isFlower, isTerminalOrHonor } from "./tiles";
import type { Seat, TileCode } from "./tiles";
import type { ClaimOption, GameState, KongOption } from "./engine";
import { kongOptions, selfDrawScore } from "./engine";
import { CODE_INDEX, type CountVector, countsFromCodes } from "./winning";
import type { Meld } from "./melds";
import { type RoutePlan, type Seating, bestPlan, comparePlans, routes } from "./plan";
import { acceptance, handShanten, seenCounts } from "./shanten";
import type { Rng } from "./rng";

export type AiTurnDecision =
  | { type: "win" }
  | { type: "kong"; option: KongOption }
  | { type: "discard"; tileId: string };

export interface AiStrategy {
  name: string;
  chooseTurnAction(state: GameState, seat: Seat, rng: Rng): AiTurnDecision;
  chooseClaim(state: GameState, seat: Seat, options: ClaimOption[], rng: Rng): ClaimOption | null;
}

/** Probability a random AI takes an offered kong on its own turn. */
const KONG_CHANCE = 0.5;

export const randomAi: AiStrategy = {
  name: "Random",

  chooseTurnAction(state, seat, rng) {
    if (selfDrawScore(state, seat)) return { type: "win" };

    const kongs: KongOption[] = kongOptions(state, seat);
    if (kongs.length > 0 && rng.next() < KONG_CHANCE) {
      return { type: "kong", option: rng.pick(kongs) };
    }

    const hand = state.players[seat].hand.filter((t) => !isFlower(t.code));
    // Guard: a hand should never be empty here, but never crash the table.
    if (hand.length === 0) {
      const any = state.players[seat].hand[0];
      return { type: "discard", tileId: any?.id ?? "" };
    }
    return { type: "discard", tileId: rng.pick(hand).id };
  },

  chooseClaim(_state, _seat, options, rng) {
    const win = options.find((o) => o.type === "win");
    if (win) return win;
    if (options.length === 0) return null;
    // Uniform over pass plus each legal claim.
    const index = rng.int(options.length + 1);
    return index === options.length ? null : options[index];
  },
};

// ---------------------------------------------------------------------------
// Greedy opponent
// ---------------------------------------------------------------------------

/** Concealed tile codes a seat holds, bonus tiles excluded. */
function concealedCodes(state: GameState, seat: Seat): TileCode[] {
  return state.players[seat].hand.filter((t) => !isFlower(t.code)).map((t) => t.code);
}

/** Everything this seat can see: its own hand, every meld, every discard. */
function visibleCounts(state: GameState, seat: Seat) {
  return seenCounts(
    concealedCodes(state, seat),
    state.players.flatMap((p) => p.melds.map((m) => m.tiles.map((t) => t.code))),
    state.players.map((p) => p.discards.map((t) => t.code)),
  );
}

/** The shanten this hand would wait at after its best discard. */
function bestWaitingShanten(codes: TileCode[], meldCount: number, melds: GameState["players"][number]["melds"]): number {
  const counts = countsFromCodes(codes);
  let best = 99;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    counts[i] -= 1;
    const value = handShanten(counts, melds);
    counts[i] += 1;
    if (value < best) best = value;
  }
  void meldCount;
  return best;
}

/**
 * Plays to finish its own hand: discards whatever leaves the hand closest to
 * ready, breaking ties on how many useful tiles are still live. It does not
 * read the discards for danger or steer towards scoring patterns — it is a
 * competent beginner, not a strong player.
 */
export const greedyAi: AiStrategy = {
  name: "Greedy",

  chooseTurnAction(state, seat, rng) {
    if (selfDrawScore(state, seat)) return { type: "win" };

    const player = state.players[seat];
    const codes = concealedCodes(state, seat);
    const counts = countsFromCodes(codes);
    const current = handShanten(counts, player.melds);

    // A kong is worth it when it costs the hand nothing.
    for (const kong of kongOptions(state, seat)) {
      if (kong.kind === "added") return { type: "kong", option: kong };
      const index = CODE_INDEX.get(kong.code);
      if (index === undefined) continue;
      counts[index] -= 4;
      const after = handShanten(counts, [...player.melds, { type: "kong", tiles: [], concealed: true }]);
      counts[index] += 4;
      if (after <= current) return { type: "kong", option: kong };
    }

    // Every discard is judged by the best route it leaves open: on a table
    // with a minimum, a quick hand that cannot be declared is worth nothing.
    const minFaan = state.config.minFaan;
    const seating = seatingOf(state, seat);
    let best: RoutePlan | null = null;
    let candidates: { id: string; code: TileCode }[] = [];
    const planByCode = new Map<TileCode, RoutePlan>();

    for (const tile of player.hand) {
      if (isFlower(tile.code)) continue;
      let plan = planByCode.get(tile.code);
      if (plan === undefined) {
        const index = CODE_INDEX.get(tile.code)!;
        counts[index] -= 1;
        plan = bestPlan(routes(counts, player.melds, seating), minFaan);
        counts[index] += 1;
        planByCode.set(tile.code, plan);
      }
      const order = best === null ? -1 : comparePlans(plan, best, minFaan);
      if (order < 0) {
        best = plan;
        candidates = [{ id: tile.id, code: tile.code }];
      } else if (order === 0) {
        candidates.push({ id: tile.id, code: tile.code });
      }
    }

    if (candidates.length === 0) {
      const fallback = player.hand[0];
      return { type: "discard", tileId: fallback?.id ?? "" };
    }

    // Among equally good discards, keep the hand closest to finished any
    // way at all, then the one with the most live outs.
    const seen = visibleCounts(state, seat);
    let bestKey: [number, number] = [99, -1];
    let finalists: typeof candidates = [];
    const keyByCode = new Map<TileCode, [number, number]>();
    for (const candidate of candidates) {
      let key = keyByCode.get(candidate.code);
      if (key === undefined) {
        const index = CODE_INDEX.get(candidate.code)!;
        counts[index] -= 1;
        key = [handShanten(counts, player.melds), acceptance(counts, player.melds, seen).count];
        counts[index] += 1;
        keyByCode.set(candidate.code, key);
      }
      const order = key[0] - bestKey[0] || bestKey[1] - key[1];
      if (order < 0) {
        bestKey = key;
        finalists = [candidate];
      } else if (order === 0) {
        finalists.push(candidate);
      }
    }

    // Still tied: let go of terminals and honors first, as a player would.
    const isolated = finalists.filter((c) => isTerminalOrHonor(c.code));
    const pool = isolated.length > 0 ? isolated : finalists;
    return { type: "discard", tileId: rng.pick(pool).id };
  },

  chooseClaim(state, seat, options) {
    const win = options.find((o) => o.type === "win");
    return win ?? plannedClaim(state, seat, options);
  },
};

/** What a seat's faan depends on beyond its tiles. */
function seatingOf(state: GameState, seat: Seat): Seating {
  return {
    seat,
    roundWind: state.roundWind,
    flowers: state.players[seat].flowers.map((t) => t.code),
    config: state.config,
  };
}

/**
 * The best plan a hand can play for once a claimed set is laid down. A chow
 * or pung is followed by a discard; a kong by a replacement draw, so its hand
 * is already the shape it waits in.
 */
function bestPlanAfter(
  claim: ClaimOption["type"],
  counts: CountVector,
  melds: Meld[],
  seating: Seating,
  minFaan: number,
): RoutePlan | null {
  if (claim === "kong") return bestPlan(routes(counts, melds, seating), minFaan);
  let best: RoutePlan | null = null;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    counts[i] -= 1;
    const plan = bestPlan(routes(counts, melds, seating), minFaan);
    counts[i] += 1;
    if (best === null || comparePlans(plan, best, minFaan) < 0) best = plan;
  }
  return best;
}

/**
 * The meld claim worth making, or null. A claim has to leave a route that
 * reaches the table's minimum, and get there sooner than the hand would
 * without it — so a concealed hand is not opened for a set that costs the
 * faan it was counting on, and a dragon is punged when it pays its way.
 */
export function plannedClaim(state: GameState, seat: Seat, options: ClaimOption[]): ClaimOption | null {
  const melds = options.filter((o) => o.type !== "win");
  if (melds.length === 0) return null;
  const minFaan = state.config.minFaan;
  const seating = seatingOf(state, seat);
  const player = state.players[seat];
  const now = bestPlan(routes(countsFromCodes(concealedCodes(state, seat)), player.melds, seating), minFaan);
  const nowOk = now.faan >= minFaan;

  let best: ClaimOption | null = null;
  let bestAfter: RoutePlan | null = null;
  for (const option of melds) {
    const used = new Set(option.tileIds);
    const remaining = player.hand.filter((t) => !used.has(t.id) && !isFlower(t.code)).map((t) => t.code);
    const meld: Meld = {
      type: option.type as Meld["type"],
      tiles: option.codes.map((code, i) => ({ id: `claim-${i}`, code })),
      concealed: false,
    };
    const after = bestPlanAfter(option.type, countsFromCodes(remaining), [...player.melds, meld], seating, minFaan);
    if (!after || after.faan < minFaan) continue;
    // Closer than before, or the first way to a hand that can be declared at all.
    const worth = nowOk ? after.shanten < now.shanten : after.shanten <= now.shanten + 1;
    if (!worth) continue;
    if (bestAfter === null || comparePlans(after, bestAfter, minFaan) < 0) {
      best = option;
      bestAfter = after;
    }
  }
  return best;
}

/**
 * The meld claim that leaves the hand closest to ready, or null when none of
 * them helps. Shared by the greedy opponent and by the rule that decides
 * whether a claim is worth interrupting the player for.
 */
export function bestImprovingClaim(
  state: GameState,
  seat: Seat,
  options: ClaimOption[],
): ClaimOption | null {
  const melds = options.filter((o) => o.type !== "win");
  if (melds.length === 0) return null;

  const player = state.players[seat];
  const before = handShanten(countsFromCodes(concealedCodes(state, seat)), player.melds);

  let best: ClaimOption | null = null;
  let bestAfter = before;
  for (const option of melds) {
    const used = new Set(option.tileIds);
    const remaining = player.hand
      .filter((t) => !used.has(t.id) && !isFlower(t.code))
      .map((t) => t.code);
    // Compare like with like: both sides are the shape the hand waits in.
    const after = bestWaitingShanten(remaining, player.melds.length + 1, [
      ...player.melds,
      { type: "pung", tiles: [], concealed: false },
    ]);
    if (after < bestAfter) {
      bestAfter = after;
      best = option;
    }
  }
  return best;
}

export const STRATEGIES = {
  greedy: greedyAi,
  random: randomAi,
} as const;

export type StrategyName = keyof typeof STRATEGIES;
