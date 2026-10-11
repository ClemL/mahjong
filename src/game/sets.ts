/**
 * Sets already sitting in a hand: three tiles that are a run or three of a
 * kind, ready to be laid down as one of the hand's four sets.
 *
 * A tile can only be in one set, so the hand is split the way that finds the
 * most sets — and among those, the way worth the most faan, then the one with
 * more triplets, since a triplet cannot be broken up to make room later.
 * Only the player's own concealed tiles are read, so this gives away nothing.
 */
import { DRAGONS, type Tile, type TileCode, WINDS, isFlower, isSuited, rankOf, suitOf } from "./tiles";
import type { RuleConfig } from "./rules";

export interface HandSet {
  type: "chow" | "pung";
  codes: TileCode[];
  /** The tiles in the hand that make it, in hand order. */
  tileIds: string[];
  /** Faan the set scores as it stands: an honor triplet that counts for this seat. */
  faan: number;
}

/** Faan a triplet of this tile is worth to a seat: dragons always, winds when they are the seat's or the round's. */
export function tripletFaan(
  code: TileCode,
  seatWind: TileCode,
  roundWind: TileCode,
  config: Pick<RuleConfig, "faan">,
): number {
  const per = config.faan.honorTriplet;
  if (DRAGONS.includes(code)) return per;
  if (!WINDS.includes(code)) return 0;
  return (code === seatWind ? per : 0) + (code === roundWind ? per : 0);
}

interface Split {
  sets: { type: "chow" | "pung"; codes: TileCode[] }[];
  faan: number;
  pungs: number;
}

function better(a: Split, b: Split | null): boolean {
  if (!b) return true;
  if (a.sets.length !== b.sets.length) return a.sets.length > b.sets.length;
  if (a.faan !== b.faan) return a.faan > b.faan;
  return a.pungs > b.pungs;
}

export function findSets(
  hand: Tile[],
  seatWind: TileCode,
  roundWind: TileCode,
  config: Pick<RuleConfig, "faan">,
): HandSet[] {
  const tiles = hand.filter((t) => !isFlower(t.code));
  const codes = [...new Set(tiles.map((t) => t.code))].sort();
  const counts = new Map<TileCode, number>();
  for (const t of tiles) counts.set(t.code, (counts.get(t.code) ?? 0) + 1);

  // Fourteen tiles at most, so a search over what is left is cheap once
  // remembered: the same remainder is reached by many orders of taking sets.
  const memo = new Map<string, Split>();
  const key = () => codes.map((c) => counts.get(c) ?? 0).join("");
  const search = (): Split => {
    const k = key();
    const known = memo.get(k);
    if (known) return known;
    const first = codes.find((c) => (counts.get(c) ?? 0) > 0);
    let best: Split | null = null;
    if (first === undefined) {
      best = { sets: [], faan: 0, pungs: 0 };
    } else {
      const take = (needed: TileCode[]) => needed.forEach((c) => counts.set(c, counts.get(c)! - 1));
      const give = (needed: TileCode[]) => needed.forEach((c) => counts.set(c, counts.get(c)! + 1));
      // The lowest tile left either starts a set or is left out of every set.
      if (counts.get(first)! >= 3) {
        const triple = [first, first, first];
        take(triple);
        const rest = search();
        give(triple);
        const faan = tripletFaan(first, seatWind, roundWind, config);
        const split = { sets: [{ type: "pung" as const, codes: triple }, ...rest.sets], faan: rest.faan + faan, pungs: rest.pungs + 1 };
        if (better(split, best)) best = split;
      }
      if (isSuited(first) && rankOf(first) <= 7) {
        const run = [first, `${suitOf(first)}${rankOf(first) + 1}`, `${suitOf(first)}${rankOf(first) + 2}`];
        if (run.every((c) => (counts.get(c) ?? 0) > 0)) {
          take(run);
          const rest = search();
          give(run);
          const split = { sets: [{ type: "chow" as const, codes: run }, ...rest.sets], faan: rest.faan, pungs: rest.pungs };
          if (better(split, best)) best = split;
        }
      }
      take([first]);
      const rest = search();
      give([first]);
      if (better(rest, best)) best = rest;
    }
    memo.set(k, best!);
    return best!;
  };

  const used = new Set<string>();
  return search().sets.map((set) => {
    const tileIds = set.codes.map((code) => {
      const tile = tiles.find((t) => t.code === code && !used.has(t.id))!;
      used.add(tile.id);
      return tile.id;
    });
    return {
      ...set,
      tileIds,
      faan: set.type === "pung" ? tripletFaan(set.codes[0], seatWind, roundWind, config) : 0,
    };
  });
}
