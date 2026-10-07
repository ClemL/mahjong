/**
 * What a ready hand is waiting on, and how many of each winning tile are
 * still out there to be drawn or thrown.
 *
 * Only what the player can see is counted — their own hand, every pond, every
 * set laid open — so the same numbers come out of the engine's full state or
 * a phone's redacted view, and they give nothing away that the table has not
 * already shown.
 */
import { type Tile, type TileCode, isFlower } from "./tiles";
import type { Meld } from "./melds";
import { waitingTiles } from "./winning";

/** The public part of a seat: what anyone at the table can see of it. */
export interface OpenSeat {
  discards: Tile[];
  melds: Meld[];
}

/** One tile a ready hand wins on, and how many of it the player has not seen. */
export interface Wait {
  code: TileCode;
  left: number;
}

/** Copies of each tile the player has seen: their own hand, every pond, every laid-open set. */
export function seenCounts(hand: Tile[], seats: OpenSeat[]): Map<TileCode, number> {
  const seen = new Map<TileCode, number>();
  const add = (tile: Tile) => seen.set(tile.code, (seen.get(tile.code) ?? 0) + 1);
  for (const tile of hand) add(tile);
  for (const seat of seats) {
    for (const tile of seat.discards) add(tile);
    // A concealed kong shows its face in the middle two tiles, so its tile is public too.
    for (const meld of seat.melds) for (const tile of meld.tiles) add(tile);
  }
  return seen;
}

/** The winning tiles of a hand that is one short, each with how many are still unseen. */
export function waitsWithCounts(
  concealed: TileCode[],
  melds: Meld[],
  seen: Map<TileCode, number>,
): Wait[] {
  return waitingTiles(concealed, melds).map((code) => ({
    code,
    left: Math.max(0, 4 - (seen.get(code) ?? 0)),
  }));
}

/** How many tiles in all a set of waits can still win on. */
export function liveTiles(waits: Wait[]): number {
  return waits.reduce((n, w) => n + w.left, 0);
}

/** A hand waiting as it stands, between turns. Empty unless it is ready. */
export function standingWaits(hand: Tile[], melds: Meld[], seats: OpenSeat[]): Wait[] {
  const concealed = hand.filter((t) => !isFlower(t.code)).map((t) => t.code);
  return waitsWithCounts(concealed, melds, seenCounts(hand, seats));
}

/**
 * On a turn: the discard that leaves the hand ready on the most tiles still
 * unseen, and what it would then be waiting on. Null when no discard leaves
 * it ready. Ties go to the first such tile in the hand.
 */
export function bestReadyDiscard(
  hand: Tile[],
  melds: Meld[],
  seats: OpenSeat[],
): { tile: Tile; waits: Wait[] } | null {
  // The thrown tile lands in a pond, where it is still seen; counting it from
  // the hand comes to the same thing.
  const seen = seenCounts(hand, seats);
  let best: { tile: Tile; waits: Wait[] } | null = null;
  const tried = new Set<TileCode>();
  for (const tile of hand) {
    if (isFlower(tile.code) || tried.has(tile.code)) continue;
    tried.add(tile.code);
    const rest = hand.filter((t) => t.id !== tile.id && !isFlower(t.code)).map((t) => t.code);
    const waits = waitsWithCounts(rest, melds, seen);
    if (waits.length === 0) continue;
    if (!best || liveTiles(waits) > liveTiles(best.waits)) best = { tile, waits };
  }
  return best;
}
