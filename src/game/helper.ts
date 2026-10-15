/**
 * Sets the hand has started but not finished, and the tiles that would finish
 * each one: a pair waiting on its third, two tiles of a run waiting on either
 * end or the middle.
 *
 * Complete sets are taken out first, exactly as `findSets` splits them, so the
 * line under three finished tiles and this list never disagree about a tile.
 * Only the player's own tiles and what is already face up are read.
 */
import { type Tile, type TileCode, isFlower, isSuited, rankOf, suitOf } from "./tiles";
import type { RuleConfig } from "./rules";
import { findSets } from "./sets";
import { type OpenSeat, type Wait, seenCounts } from "./waits";

export interface PartialSet {
  /** A pair wants its third tile; a run wants the tile that closes it. */
  kind: "pair" | "run";
  codes: TileCode[];
  /** The tiles in the hand that make it. */
  tileIds: string[];
  /** Each tile that would finish it, with how many are still unseen. */
  needs: Wait[];
}

interface Partial {
  kind: PartialSet["kind"];
  codes: TileCode[];
  needs: TileCode[];
}

/** The tiles that turn two held tiles into a set, or none when the two cannot be one. */
function completers(a: TileCode, b: TileCode): TileCode[] {
  if (a === b) return [a];
  if (!isSuited(a) || suitOf(a) !== suitOf(b)) return [];
  const [lo, hi] = rankOf(a) < rankOf(b) ? [rankOf(a), rankOf(b)] : [rankOf(b), rankOf(a)];
  const suit = suitOf(a);
  if (hi - lo === 2) return [`${suit}${lo + 1}`];
  if (hi - lo !== 1) return [];
  return [lo - 1, hi + 1].filter((r) => r >= 1 && r <= 9).map((r) => `${suit}${r}`);
}

export function partialSets(
  hand: Tile[],
  seatWind: TileCode,
  roundWind: TileCode,
  config: Pick<RuleConfig, "faan">,
  seats: OpenSeat[],
): PartialSet[] {
  const used = new Set(findSets(hand, seatWind, roundWind, config).flatMap((s) => s.tileIds));
  const loose = hand.filter((t) => !isFlower(t.code) && !used.has(t.id));
  const seen = seenCounts(hand, seats);
  const left = (code: TileCode) => Math.max(0, 4 - (seen.get(code) ?? 0));

  const codes = [...new Set(loose.map((t) => t.code))].sort();
  const counts = new Map<TileCode, number>();
  for (const t of loose) counts.set(t.code, (counts.get(t.code) ?? 0) + 1);

  // The split with the most partial sets; among those, the one that can still
  // be finished by the most distinct unseen tiles, then the one with more
  // pairs, since a pair can also be the eyes. A dozen tiles at most, so a
  // plain search over the lowest tile left is quick.
  type Split = { parts: Partial[] };
  const live = (s: Split) => [...new Set(s.parts.flatMap((p) => p.needs))].reduce((n, c) => n + left(c), 0);
  const pairs = (s: Split) => s.parts.filter((p) => p.kind === "pair").length;
  const better = (a: Split, b: Split | null) => {
    if (!b) return true;
    if (a.parts.length !== b.parts.length) return a.parts.length > b.parts.length;
    if (live(a) !== live(b)) return live(a) > live(b);
    return pairs(a) > pairs(b);
  };
  const search = (): Split => {
    const first = codes.find((c) => (counts.get(c) ?? 0) > 0);
    if (first === undefined) return { parts: [] };
    counts.set(first, counts.get(first)! - 1);
    let best: Split | null = null;
    const partners = [first, ...codes.filter((c) => c > first)];
    for (const other of new Set(partners)) {
      if ((counts.get(other) ?? 0) === 0) continue;
      const needs = completers(first, other);
      if (needs.length === 0) continue;
      counts.set(other, counts.get(other)! - 1);
      const rest = search();
      counts.set(other, counts.get(other)! + 1);
      const part = { kind: first === other ? ("pair" as const) : ("run" as const), codes: [first, other], needs };
      const split = { parts: [part, ...rest.parts] };
      if (better(split, best)) best = split;
    }
    const skipped = search();
    if (better(skipped, best)) best = skipped;
    counts.set(first, counts.get(first)! + 1);
    return best!;
  };

  const taken = new Set<string>();
  return search().parts.map((part) => ({
    kind: part.kind,
    codes: part.codes,
    tileIds: part.codes.map((code) => {
      const tile = loose.find((t) => t.code === code && !taken.has(t.id))!;
      taken.add(tile.id);
      return tile.id;
    }),
    needs: part.needs.map((code) => ({ code, left: left(code) })),
  }));
}
