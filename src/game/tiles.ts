/**
 * Tile model for Hong Kong mahjong (144 tiles).
 *
 * A tile is identified by a short `TileCode`:
 *   m1..m9  Characters (萬 / man)
 *   p1..p9  Dots       (筒 / pin)
 *   s1..s9  Bamboo     (索 / sou)
 *   we ws ww wn   Winds   (東 南 西 北)
 *   dr dg dw      Dragons (中 發 白)
 *   f1..f4  Flowers (梅 蘭 菊 竹)  — f1 belongs to East, f2 South, f3 West, f4 North
 *   f5..f8  Seasons (春 夏 秋 冬)  — f5 belongs to East, f6 South, f7 West, f8 North
 *
 * Each of the 144 physical tiles also carries a unique `id` so the UI can track
 * individual tiles across the wall, hands, melds and discards.
 */

export type Suit = "m" | "p" | "s";
export type TileCode = string;

export interface Tile {
  /** Unique per physical tile, e.g. "m5#2". */
  id: string;
  code: TileCode;
}

export const SUITS: Suit[] = ["m", "p", "s"];
export const WINDS: TileCode[] = ["we", "ws", "ww", "wn"];
export const DRAGONS: TileCode[] = ["dr", "dg", "dw"];
export const HONORS: TileCode[] = [...WINDS, ...DRAGONS];
export const FLOWERS: TileCode[] = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];

/** The 34 distinct playable (non-bonus) tile codes, in display order. */
export const PLAYABLE_CODES: TileCode[] = [
  ...SUITS.flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${s}${r}`)),
  ...HONORS,
];

export const ALL_CODES: TileCode[] = [...PLAYABLE_CODES, ...FLOWERS];

export function isFlower(code: TileCode): boolean {
  return code[0] === "f";
}

export function isHonor(code: TileCode): boolean {
  return code[0] === "w" || code[0] === "d";
}

export function isSuited(code: TileCode): boolean {
  return code[0] === "m" || code[0] === "p" || code[0] === "s";
}

export function suitOf(code: TileCode): Suit | null {
  return isSuited(code) ? (code[0] as Suit) : null;
}

export function rankOf(code: TileCode): number {
  return isSuited(code) ? Number(code[1]) : 0;
}

/** Terminal = rank 1 or 9 of a suit. */
export function isTerminal(code: TileCode): boolean {
  return isSuited(code) && (rankOf(code) === 1 || rankOf(code) === 9);
}

/** 幺九: terminals and honors. */
export function isTerminalOrHonor(code: TileCode): boolean {
  return isTerminal(code) || isHonor(code);
}

/** The 13 tile codes used by Thirteen Orphans (十三么). */
export const THIRTEEN_ORPHAN_CODES: TileCode[] = [
  "m1", "m9", "p1", "p9", "s1", "s9", ...HONORS,
];

/** Seat (0 = East, 1 = South, 2 = West, 3 = North), advancing counter-clockwise. */
export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];

export function nextSeat(seat: Seat, step = 1): Seat {
  return (((seat + step) % 4) + 4) % 4 as Seat;
}

/** The wind tile code matching a seat. */
export function seatWind(seat: Seat): TileCode {
  return WINDS[seat];
}

/** The seat a bonus (flower/season) tile belongs to, or null if not a bonus tile. */
export function flowerOwner(code: TileCode): Seat | null {
  if (!isFlower(code)) return null;
  const n = Number(code.slice(1));
  return ((n - 1) % 4) as Seat;
}

const SORT_INDEX = new Map<TileCode, number>(ALL_CODES.map((c, i) => [c, i]));

export function compareCodes(a: TileCode, b: TileCode): number {
  return (SORT_INDEX.get(a) ?? 99) - (SORT_INDEX.get(b) ?? 99);
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => compareCodes(a.code, b.code) || a.id.localeCompare(b.id));
}

/** Build the full 144-tile set: 4 copies of each playable code + 1 of each bonus tile. */
export function buildTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const code of PLAYABLE_CODES) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ id: `${code}#${copy}`, code });
    }
  }
  for (const code of FLOWERS) {
    tiles.push({ id: `${code}#0`, code });
  }
  return tiles;
}

/** Count tiles by code. */
export function countCodes(tiles: Tile[]): Map<TileCode, number> {
  const counts = new Map<TileCode, number>();
  for (const t of tiles) counts.set(t.code, (counts.get(t.code) ?? 0) + 1);
  return counts;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const HONOR_GLYPHS: Record<string, string> = {
  we: "東", ws: "南", ww: "西", wn: "北",
  dr: "中", dg: "發", dw: "白",
};

const FLOWER_GLYPHS: Record<string, string> = {
  f1: "梅", f2: "蘭", f3: "菊", f4: "竹",
  f5: "春", f6: "夏", f7: "秋", f8: "冬",
};

const RANK_GLYPHS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const SUIT_GLYPHS: Record<Suit, string> = { m: "萬", p: "筒", s: "索" };

const HONOR_LABELS: Record<string, string> = {
  we: "East", ws: "South", ww: "West", wn: "North",
  dr: "Red", dg: "Green", dw: "White",
};

const FLOWER_LABELS: Record<string, string> = {
  f1: "Plum", f2: "Orchid", f3: "Chrys.", f4: "Bamboo",
  f5: "Spring", f6: "Summer", f7: "Autumn", f8: "Winter",
};

/** Large glyph shown on the tile face. */
export function tileGlyph(code: TileCode): string {
  if (isHonor(code)) return HONOR_GLYPHS[code];
  if (isFlower(code)) return FLOWER_GLYPHS[code];
  return RANK_GLYPHS[rankOf(code)];
}

/** Small suit mark under the glyph ("" for honors / bonus tiles). */
export function tileSuitGlyph(code: TileCode): string {
  const suit = suitOf(code);
  return suit ? SUIT_GLYPHS[suit] : "";
}

/** Latin label, e.g. "5m", "East", "Spring". */
export function tileLabel(code: TileCode): string {
  if (isHonor(code)) return HONOR_LABELS[code];
  if (isFlower(code)) return FLOWER_LABELS[code];
  return `${rankOf(code)}${code[0]}`;
}

/** Human-readable name for logs, e.g. "5 Characters", "Red Dragon". */
export function tileName(code: TileCode): string {
  if (isFlower(code)) return FLOWER_LABELS[code];
  if (code[0] === "w") return `${HONOR_LABELS[code]} Wind`;
  if (code[0] === "d") return `${HONOR_LABELS[code]} Dragon`;
  const suitName = { m: "Characters", p: "Dots", s: "Bamboo" }[suitOf(code)!];
  return `${rankOf(code)} ${suitName}`;
}

export const SEAT_NAMES = ["East", "South", "West", "North"] as const;
