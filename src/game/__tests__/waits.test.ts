import { describe, expect, it } from "vitest";
import { bestReadyDiscard, liveTiles, seenCounts, standingWaits } from "../waits";
import type { Meld } from "../melds";
import type { Tile, TileCode } from "../tiles";

let serial = 0;
const tile = (code: TileCode): Tile => ({ id: `${code}#${serial++}`, code });
const tiles = (codes: string): Tile[] => codes.split(" ").map((c) => tile(c as TileCode));
const pung = (code: TileCode): Meld => ({
  type: "pung",
  tiles: [tile(code), tile(code), tile(code)],
  concealed: false,
  claimedFrom: 1,
});
const quiet = { discards: [] as Tile[], melds: [] as Meld[] };

/** 123m 456m 789p, a red dragon pair, and 4-5 of dots: wins on 3 or 6 of dots. */
const TWO_SIDED = "m1 m2 m3 m4 m5 m6 p7 p8 p9 dr dr p4 p5";
/** 123m 456m 789p 111s and a lone red dragon: wins only on its pair. */
const SINGLE = "m1 m2 m3 m4 m5 m6 p7 p8 p9 s1 s1 s1 dr";

describe("waits with what is left of them", () => {
  it("counts every copy the player can see: own hand, ponds, open sets", () => {
    const seen = seenCounts(tiles("p3 p3"), [
      { discards: tiles("p3"), melds: [] },
      { discards: [], melds: [pung("p6")] },
    ]);
    expect(seen.get("p3")).toBe(3);
    expect(seen.get("p6")).toBe(3);
    expect(seen.get("m1")).toBeUndefined();
  });

  it("names a two-sided wait with four of each still out", () => {
    const waits = standingWaits(tiles(TWO_SIDED), [], [quiet]);
    expect(waits).toEqual([
      { code: "p3", left: 4 },
      { code: "p6", left: 4 },
    ]);
    expect(liveTiles(waits)).toBe(8);
  });

  it("takes away whatever has been thrown or laid open", () => {
    const waits = standingWaits(tiles(TWO_SIDED), [], [
      { discards: tiles("p3 p3"), melds: [] },
      { discards: [], melds: [pung("p6")] },
    ]);
    expect(waits).toEqual([
      { code: "p3", left: 2 },
      { code: "p6", left: 1 },
    ]);
  });

  it("counts the copies in the player's own hand as seen", () => {
    expect(standingWaits(tiles(SINGLE), [], [quiet])).toEqual([{ code: "dr", left: 3 }]);
  });

  it("says a wait is dead when every copy is accounted for", () => {
    const waits = standingWaits(tiles(SINGLE), [], [{ discards: tiles("dr dr dr"), melds: [] }]);
    expect(waits).toEqual([{ code: "dr", left: 0 }]);
  });

  it("finds nothing for a hand that is not ready", () => {
    expect(standingWaits(tiles("m1 m4 m7 p2 p5 p8 s3 s6 s9 we ws ww wn"), [], [quiet])).toEqual([]);
  });

  it("counts sets already laid down as part of the hand", () => {
    // One pung open and ten concealed tiles: 123m 456m 789p and a lone 4 of dots.
    const waits = standingWaits(tiles("m1 m2 m3 m4 m5 m6 p7 p8 p9 p4"), [pung("s1")], [quiet]);
    expect(waits).toEqual([{ code: "p4", left: 3 }]);
  });

  it("picks the discard that leaves the most tiles to win on", () => {
    // Throwing the north wind leaves the two-sided wait (eight tiles);
    // throwing a red dragon leaves a 4-5 of dots short of a pair and nothing.
    const best = bestReadyDiscard(tiles(`${TWO_SIDED} wn`), [], [quiet]);
    expect(best?.tile.code).toBe("wn");
    expect(best?.waits.map((w) => w.code)).toEqual(["p3", "p6"]);
  });

  it("prefers a live wait to a dead one", () => {
    // 111s laid open, 123m 456m 789p and 4-5 of dots in hand: throw the 4 to
    // wait on a pair of 5s, or the 5 to wait on a pair of 4s. Three 5s are
    // already in the ponds.
    const hand = tiles("m1 m2 m3 m4 m5 m6 p7 p8 p9 p4 p5");
    const best = bestReadyDiscard(hand, [pung("s1")], [{ discards: tiles("p5 p5 p5"), melds: [] }]);
    expect(best?.tile.code).toBe("p5");
    expect(best?.waits).toEqual([{ code: "p4", left: 3 }]);
  });

  it("returns null when no discard leaves the hand ready", () => {
    expect(bestReadyDiscard(tiles("m1 m4 m7 p2 p5 p8 s3 s6 s9 we ws ww wn dr"), [], [quiet])).toBeNull();
  });
});
