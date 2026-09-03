import {
  PLAYABLE_CODES,
  THIRTEEN_ORPHAN_CODES,
  type Tile,
  type TileCode,
  isTerminalOrHonor,
  suitOf,
} from "./tiles";
import type { Meld } from "./melds";

/** Index of each playable code inside a 34-slot count vector. */
export const CODE_INDEX = new Map<TileCode, number>(PLAYABLE_CODES.map((c, i) => [c, i]));

export type CountVector = number[];

export function emptyCounts(): CountVector {
  return new Array(34).fill(0);
}

export function countsFromCodes(codes: TileCode[]): CountVector {
  const counts = emptyCounts();
  for (const code of codes) {
    const i = CODE_INDEX.get(code);
    if (i !== undefined) counts[i] += 1;
  }
  return counts;
}

export function countsFromTiles(tiles: Tile[]): CountVector {
  return countsFromCodes(tiles.map((t) => t.code));
}

/** A set formed from concealed tiles during decomposition. */
export interface ConcealedSet {
  type: "chow" | "pung";
  codes: TileCode[];
}

export interface Decomposition {
  sets: ConcealedSet[];
  pair: TileCode;
}

function isChowStart(index: number): boolean {
  return index < 27 && index % 9 <= 6;
}

/**
 * Enumerate every way the concealed tiles can be split into `setsNeeded` sets
 * plus exactly one pair. Returns an empty array when no such split exists.
 */
export function decompose(counts: CountVector, setsNeeded: number): Decomposition[] {
  const results: Decomposition[] = [];
  const sets: ConcealedSet[] = [];
  const work = [...counts];

  const search = (needed: number, pair: TileCode | null): void => {
    let i = -1;
    for (let k = 0; k < 34; k++) {
      if (work[k] > 0) {
        i = k;
        break;
      }
    }
    if (i === -1) {
      if (needed === 0 && pair !== null) results.push({ sets: sets.map((s) => ({ ...s })), pair });
      return;
    }
    if (needed === 0 && pair !== null) return; // leftovers cannot be used

    const code = PLAYABLE_CODES[i];

    if (pair === null && work[i] >= 2) {
      work[i] -= 2;
      search(needed, code);
      work[i] += 2;
    }
    if (needed > 0 && work[i] >= 3) {
      work[i] -= 3;
      sets.push({ type: "pung", codes: [code, code, code] });
      search(needed - 1, pair);
      sets.pop();
      work[i] += 3;
    }
    if (needed > 0 && isChowStart(i) && work[i + 1] > 0 && work[i + 2] > 0) {
      work[i] -= 1;
      work[i + 1] -= 1;
      work[i + 2] -= 1;
      sets.push({
        type: "chow",
        codes: [PLAYABLE_CODES[i], PLAYABLE_CODES[i + 1], PLAYABLE_CODES[i + 2]],
      });
      search(needed - 1, pair);
      sets.pop();
      work[i] += 1;
      work[i + 1] += 1;
      work[i + 2] += 1;
    }
  };

  search(setsNeeded, null);
  return results;
}

/** 十三么 — the thirteen terminals/honors plus a duplicate of any one of them. */
export function isThirteenOrphans(codes: TileCode[]): boolean {
  if (codes.length !== 14) return false;
  if (!codes.every(isTerminalOrHonor)) return false;
  const distinct = new Set(codes);
  if (distinct.size !== 13) return false;
  return THIRTEEN_ORPHAN_CODES.every((c) => distinct.has(c));
}

/** 九蓮寶燈 — a concealed 1112345678999 in one suit plus any extra tile of that suit. */
export function isNineGates(codes: TileCode[]): boolean {
  if (codes.length !== 14) return false;
  const suit = suitOf(codes[0]);
  if (!suit) return false;
  if (!codes.every((c) => suitOf(c) === suit)) return false;
  const counts = countsFromCodes(codes);
  const base = CODE_INDEX.get(`${suit}1`)!;
  const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  let extras = 0;
  for (let r = 0; r < 9; r++) {
    const diff = counts[base + r] - pattern[r];
    if (diff < 0) return false;
    extras += diff;
  }
  return extras === 1;
}

export type SpecialHand = "thirteenOrphans" | "nineGates";

export interface HandShape {
  /** Standard 4-sets-and-a-pair decompositions (empty for special hands). */
  decompositions: Decomposition[];
  special: SpecialHand | null;
}

/**
 * Determine whether `concealed` (including the winning tile) plus `melds`
 * forms a complete hand. Returns null when the hand is not complete.
 */
export function analyzeShape(concealed: TileCode[], melds: Meld[]): HandShape | null {
  const allConcealed = melds.every((m) => m.concealed);
  if (melds.length === 0 && allConcealed) {
    if (isThirteenOrphans(concealed)) return { decompositions: [], special: "thirteenOrphans" };
    if (isNineGates(concealed)) return { decompositions: [], special: "nineGates" };
  }
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0) return null;
  const decompositions = decompose(countsFromCodes(concealed), setsNeeded);
  if (decompositions.length === 0) return null;
  return { decompositions, special: null };
}

/** True when adding `tile` to the concealed tiles completes the hand's shape. */
export function completesHand(concealed: TileCode[], melds: Meld[], tile: TileCode): boolean {
  return analyzeShape([...concealed, tile], melds) !== null;
}

/** Every tile code that would complete the hand ("waits" / 聽牌). */
export function waitingTiles(concealed: TileCode[], melds: Meld[]): TileCode[] {
  return PLAYABLE_CODES.filter((code) => completesHand(concealed, melds, code));
}
