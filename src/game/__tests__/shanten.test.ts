import { describe, expect, it } from "vitest";
import {
  acceptance,
  handShanten,
  seenCounts,
  shantenOfCodes,
  standardShanten,
  thirteenOrphansShanten,
} from "../shanten";
import { countsFromCodes, emptyCounts } from "../winning";
import type { Meld } from "../melds";
import type { Tile, TileCode } from "../tiles";

const codes = (spec: string): TileCode[] => spec.split(" ");
const sh = (spec: string, melds = 0) => standardShanten(countsFromCodes(codes(spec)), melds);

function meld(spec: string): Meld {
  const tiles: Tile[] = spec.split(" ").map((code, i) => ({ id: `${code}#${i}`, code }));
  return { type: tiles[0].code === tiles[1].code ? "pung" : "chow", tiles, concealed: false };
}

describe("standardShanten", () => {
  it("reports -1 for a completed hand", () => {
    expect(sh("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr dr")).toBe(-1);
    expect(sh("m1 m1 m1 p5 p5 p5 s9 s9 s9 we we we dg dg")).toBe(-1);
  });

  it("reports 0 for a ready hand", () => {
    // 4 sets and a lone tile — waiting to pair it.
    expect(sh("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr")).toBe(0);
    // 3 sets, a pair and a partial run — waiting on both ends.
    expect(sh("m1 m2 m3 m4 m5 m6 p1 p2 p3 dr dr s7 s8")).toBe(0);
    // Shanpon: two pairs with three sets.
    expect(sh("m1 m2 m3 m4 m5 m6 p1 p2 p3 dr dr dg dg")).toBe(0);
  });

  it("charges an extra step for five blocks with no pair", () => {
    // Three sets and two partial runs, nothing paired.
    expect(sh("m1 m2 m3 m4 m5 m6 p1 p2 p3 s2 s4 s6 s8")).toBe(1);
  });

  it("counts exposed melds as completed sets", () => {
    // Two melds plus two sets and a pair in hand is a completed hand.
    expect(sh("m1 m2 m3 p1 p2 p3 dr dr", 2)).toBe(-1);
    expect(sh("m1 m2 m3 p1 p2 p3 dr", 2)).toBe(0);
  });

  it("grows with a scattered hand", () => {
    expect(sh("m1 m4 m7 p2 p5 p8 s3 s6 s9 we ws ww dr")).toBeGreaterThanOrEqual(5);
  });

  it("never exceeds the 8 ceiling", () => {
    expect(sh("m1")).toBeLessThanOrEqual(8);
    expect(standardShanten(emptyCounts(), 0)).toBe(8);
  });

  it("agrees with a brute-force count on random hands", () => {
    // A hand at shanten n must have some tile whose draw yields n-1.
    let seed = 99;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 60; trial++) {
      const pool: TileCode[] = [];
      for (const c of ["m", "p", "s"])
        for (let r = 1; r <= 9; r++) for (let k = 0; k < 4; k++) pool.push(`${c}${r}`);
      for (const c of ["we", "ws", "ww", "wn", "dr", "dg", "dw"])
        for (let k = 0; k < 4; k++) pool.push(c);
      const hand: TileCode[] = [];
      for (let i = 0; i < 13; i++) hand.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);

      const counts = countsFromCodes(hand);
      const current = standardShanten(counts, 0);
      if (current <= -1) continue;
      let improved = false;
      for (let i = 0; i < 34; i++) {
        if (counts[i] >= 4) continue;
        counts[i] += 1;
        if (standardShanten(counts, 0) === current - 1) improved = true;
        counts[i] -= 1;
        if (improved) break;
      }
      expect(improved, `no tile improves a ${current}-shanten hand: ${hand.join(" ")}`).toBe(true);
    }
  });
});

describe("thirteenOrphansShanten", () => {
  it("is -1 when complete", () => {
    expect(thirteenOrphansShanten(countsFromCodes(codes("m1 m9 p1 p9 s1 s9 we ws ww wn dr dg dw dr")))).toBe(-1);
  });

  it("is 0 with all thirteen and no duplicate", () => {
    expect(thirteenOrphansShanten(countsFromCodes(codes("m1 m9 p1 p9 s1 s9 we ws ww wn dr dg dw")))).toBe(0);
  });

  it("is far away for a normal hand", () => {
    expect(thirteenOrphansShanten(countsFromCodes(codes("m2 m3 m4 p5 p6 p7 s2 s3 s4 m5 m6 m7 p2")))).toBeGreaterThan(9);
  });
});

describe("handShanten", () => {
  it("takes the better of the standard and orphan shapes", () => {
    const orphanish = codes("m1 m9 p1 p9 s1 s9 we ws ww wn dr dg m5");
    expect(handShanten(countsFromCodes(orphanish), [])).toBe(1);
  });

  it("ignores the orphan shape once a meld is exposed", () => {
    const orphanish = codes("m1 m9 p1 p9 s1 s9 we ws ww wn");
    const withMeld = handShanten(countsFromCodes(orphanish), [meld("m2 m3 m4")]);
    expect(withMeld).toBeGreaterThan(2);
  });

  it("matches shantenOfCodes and drops bonus tiles", () => {
    const hand = codes("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr");
    expect(shantenOfCodes([...hand, "f1"], [])).toBe(0);
  });
});

describe("acceptance", () => {
  it("finds both ends of an open wait", () => {
    const hand = countsFromCodes(codes("m1 m2 m3 m4 m5 m6 p1 p2 p3 dr dr s7 s8"));
    const seen = seenCounts(codes("m1 m2 m3 m4 m5 m6 p1 p2 p3 dr dr s7 s8"), [], []);
    const result = acceptance(hand, [], seen);
    expect(result.tiles).toEqual(["s6", "s9"]);
    expect(result.count).toBe(8);
  });

  it("discounts tiles that are already all visible", () => {
    const hand = codes("m1 m2 m3 m4 m5 m6 p1 p2 p3 dr dr s7 s8");
    const seen = seenCounts(hand, [], [["s9", "s9", "s9", "s9"]]);
    const result = acceptance(countsFromCodes(hand), [], seen);
    expect(result.tiles).toEqual(["s6"]);
    expect(result.count).toBe(4);
  });
});
