import {
  type Seat,
  type Tile,
  type TileCode,
  isSuited,
  rankOf,
  suitOf,
} from "./tiles";

export type MeldType = "chow" | "pung" | "kong";

export interface Meld {
  type: MeldType;
  /** Tiles in the meld: 3 for chow/pung, 4 for kong. */
  tiles: Tile[];
  /** True for a concealed kong (暗槓) or a set still hidden in hand. */
  concealed: boolean;
  /** Seat the claimed tile came from (undefined for concealed kongs). */
  claimedFrom?: Seat;
  /** True when a kong was upgraded from an existing exposed pung (加槓). */
  fromAddedKong?: boolean;
}

/** Codes of a meld, sorted for chows. */
export function meldCodes(meld: Meld): TileCode[] {
  return meld.tiles.map((t) => t.code);
}

/** A kong occupies four tiles but counts as one set of three when checking a hand's shape. */
export function meldIsSet(meld: Meld): boolean {
  return meld.type === "chow" || meld.type === "pung" || meld.type === "kong";
}

/** All distinct chow shapes that `code` can complete, as pairs of the other two codes. */
export function chowPartners(code: TileCode): [TileCode, TileCode][] {
  if (!isSuited(code)) return [];
  const suit = suitOf(code)!;
  const rank = rankOf(code);
  const shapes: [number, number][] = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  return shapes
    .filter(([a, b]) => a >= 1 && b <= 9)
    .map(([a, b]) => [`${suit}${a}`, `${suit}${b}`] as [TileCode, TileCode]);
}

/** Pick `count` tiles matching `code` out of `tiles`; returns null if there aren't enough. */
export function takeTiles(tiles: Tile[], code: TileCode, count: number): Tile[] | null {
  const picked = tiles.filter((t) => t.code === code).slice(0, count);
  return picked.length === count ? picked : null;
}

export function removeTiles(tiles: Tile[], toRemove: Tile[]): Tile[] {
  const ids = new Set(toRemove.map((t) => t.id));
  return tiles.filter((t) => !ids.has(t.id));
}
