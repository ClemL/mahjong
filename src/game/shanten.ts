/**
 * Shanten — how many tile changes a hand is from completion.
 *
 * -1 is a won hand, 0 is ready (聽牌), 1 means one useful draw away, and so on.
 * This is what lets an opponent choose a discard on purpose instead of at
 * random, and what lets the table decide whether a claim is worth interrupting
 * the player for.
 */
import { PLAYABLE_CODES, type TileCode, isFlower } from "./tiles";
import type { Meld } from "./melds";
import { CODE_INDEX, type CountVector, countsFromCodes, emptyCounts } from "./winning";

/**
 * A block a group of tiles can contribute: complete sets, partial sets, and
 * whether a pair is among them.
 */
interface GroupState {
  sets: number;
  partials: number;
  pair: boolean;
}

/**
 * Suits are independent of one another, so each group of nine (or the seven
 * honors) is enumerated separately and cached on its own counts. A candidate
 * discard changes exactly one group, which makes the other three free.
 */
const groupCache = new Map<string, GroupState[]>();

function enumerateGroup(slice: number[], allowRuns: boolean): GroupState[] {
  const key = (allowRuns ? "r" : "h") + slice.join("");
  const cached = groupCache.get(key);
  if (cached) return cached;

  const seen = new Set<number>();
  const states: GroupState[] = [];
  const len = slice.length;
  const work = [...slice];

  const record = (sets: number, partials: number, pair: boolean): void => {
    const id = (sets * 8 + partials) * 2 + (pair ? 1 : 0);
    if (seen.has(id)) return;
    seen.add(id);
    states.push({ sets, partials, pair });
  };

  const visit = (i: number, sets: number, partials: number, pair: boolean): void => {
    if (sets + partials > 5) return;
    if (i >= len) {
      record(sets, partials, pair);
      return;
    }
    if (work[i] === 0) {
      visit(i + 1, sets, partials, pair);
      return;
    }
    if (work[i] >= 3) {
      work[i] -= 3;
      visit(i, sets + 1, partials, pair);
      work[i] += 3;
    }
    if (allowRuns && i + 2 < len && work[i + 1] > 0 && work[i + 2] > 0) {
      work[i] -= 1;
      work[i + 1] -= 1;
      work[i + 2] -= 1;
      visit(i, sets + 1, partials, pair);
      work[i] += 1;
      work[i + 1] += 1;
      work[i + 2] += 1;
    }
    if (work[i] >= 2) {
      work[i] -= 2;
      visit(i, sets, partials + 1, true);
      work[i] += 2;
    }
    if (allowRuns && i + 1 < len && work[i + 1] > 0) {
      work[i] -= 1;
      work[i + 1] -= 1;
      visit(i, sets, partials + 1, pair);
      work[i] += 1;
      work[i + 1] += 1;
    }
    if (allowRuns && i + 2 < len && work[i + 2] > 0) {
      work[i] -= 1;
      work[i + 2] -= 1;
      visit(i, sets, partials + 1, pair);
      work[i] += 1;
      work[i + 2] += 1;
    }
    work[i] -= 1;
    visit(i, sets, partials, pair);
    work[i] += 1;
  };

  visit(0, 0, 0, false);
  if (groupCache.size > 40000) groupCache.clear();
  groupCache.set(key, states);
  return states;
}

/**
 * Shanten for the standard four-sets-and-a-pair shape.
 *
 * Blocks are counted as `8 - 2×sets - partials`, where a hand may hold at most
 * five blocks in total. A hand holding five blocks with no pair among them
 * costs one extra step, since one of those blocks has to become the pair.
 */
export function standardShanten(counts: CountVector, meldCount: number): number {
  const groups = [
    enumerateGroup(counts.slice(0, 9), true),
    enumerateGroup(counts.slice(9, 18), true),
    enumerateGroup(counts.slice(18, 27), true),
    enumerateGroup(counts.slice(27, 34), false),
  ];

  // Combine the groups with a small table over (sets, partials, pair).
  const encode = (sets: number, partials: number, pair: boolean) =>
    (sets * 8 + partials) * 2 + (pair ? 1 : 0);
  let reachable = new Set<number>([encode(Math.min(meldCount, 4), 0, false)]);

  for (const group of groups) {
    const next = new Set<number>();
    for (const id of reachable) {
      const pair = (id & 1) === 1;
      const rest = id >> 1;
      const sets = Math.floor(rest / 8);
      const partials = rest % 8;
      for (const state of group) {
        const totalSets = sets + state.sets;
        const totalPartials = partials + state.partials;
        if (totalSets + totalPartials > 5) continue;
        if (totalSets > 4) continue;
        next.add(encode(totalSets, totalPartials, pair || state.pair));
      }
    }
    reachable = next;
  }

  let best = 8;
  for (const id of reachable) {
    const pair = (id & 1) === 1;
    const rest = id >> 1;
    const sets = Math.floor(rest / 8);
    const partials = rest % 8;
    let value = 8 - 2 * sets - partials;
    if (sets + partials === 5 && !pair) value += 1;
    if (value < best) best = value;
  }
  return best;
}

/** Shanten for Thirteen Orphans, which only a fully concealed hand can reach. */
export function thirteenOrphansShanten(counts: CountVector): number {
  const orphans = ["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"];
  let kinds = 0;
  let hasPair = false;
  for (const code of orphans) {
    const n = counts[CODE_INDEX.get(code)!];
    if (n > 0) kinds += 1;
    if (n >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

/** The best shanten across every hand shape this ruleset scores. */
export function handShanten(counts: CountVector, melds: Meld[]): number {
  const standard = standardShanten(counts, melds.length);
  if (melds.length > 0) return standard;
  return Math.min(standard, thirteenOrphansShanten(counts));
}

export function shantenOfCodes(codes: TileCode[], melds: Meld[]): number {
  return handShanten(countsFromCodes(codes.filter((c) => !isFlower(c))), melds);
}

/**
 * Tiles that would reduce the hand's shanten, with how many copies are still
 * unseen. Only tiles the player can actually still draw are counted, so a
 * wait on a tile all four of which are already exposed scores zero.
 */
export function acceptance(
  counts: CountVector,
  melds: Meld[],
  seen: CountVector,
): { tiles: TileCode[]; count: number } {
  const current = handShanten(counts, melds);
  const tiles: TileCode[] = [];
  let count = 0;
  for (let i = 0; i < 34; i++) {
    const remaining = 4 - seen[i];
    if (remaining <= 0 || counts[i] >= 4) continue;
    counts[i] += 1;
    const next = handShanten(counts, melds);
    counts[i] -= 1;
    if (next < current) {
      tiles.push(PLAYABLE_CODES[i]);
      count += remaining;
    }
  }
  return { tiles, count };
}

/** Count vector of every tile this seat can see: hands aside, all of it. */
export function seenCounts(
  ownHand: TileCode[],
  melds: TileCode[][],
  discards: TileCode[][],
): CountVector {
  const seen = emptyCounts();
  const add = (code: TileCode) => {
    const i = CODE_INDEX.get(code);
    if (i !== undefined) seen[i] += 1;
  };
  ownHand.forEach(add);
  for (const meld of melds) meld.forEach(add);
  for (const pile of discards) pile.forEach(add);
  return seen;
}
