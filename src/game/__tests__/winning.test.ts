import { describe, expect, it } from "vitest";
import {
  analyzeShape,
  completesHand,
  countsFromCodes,
  decompose,
  isNineGates,
  isThirteenOrphans,
  waitingTiles,
} from "../winning";
import type { Meld } from "../melds";
import type { Tile, TileCode } from "../tiles";

const t = (code: TileCode, n = 0): Tile => ({ id: `${code}#${n}`, code });

function pungMeld(code: TileCode): Meld {
  return { type: "pung", tiles: [t(code, 0), t(code, 1), t(code, 2)], concealed: false, claimedFrom: 1 };
}

describe("decompose", () => {
  it("finds a four-chow hand with a pair", () => {
    const codes = "m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr dr".split(" ");
    const results = decompose(countsFromCodes(codes), 4);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].pair).toBe("dr");
  });

  it("finds an all-triplet hand", () => {
    const codes = "m1 m1 m1 p5 p5 p5 s9 s9 s9 we we we dg dg".split(" ");
    const results = decompose(countsFromCodes(codes), 4);
    expect(results).toHaveLength(1);
    expect(results[0].sets.every((s) => s.type === "pung")).toBe(true);
  });

  it("returns every decomposition of an ambiguous hand", () => {
    // 111 222 333 can be read as three pungs or three identical chows.
    const codes = "m1 m1 m1 m2 m2 m2 m3 m3 m3 s1 s2 s3 dr dr".split(" ");
    const results = decompose(countsFromCodes(codes), 4);
    const shapes = results.map((r) => r.sets.filter((s) => s.type === "chow").length).sort();
    expect(shapes).toEqual([1, 4]);
  });

  it("rejects an incomplete hand", () => {
    const codes = "m1 m2 m4 m5 m7 m8 p1 p2 p4 s7 s8 dr dr dg".split(" ");
    expect(decompose(countsFromCodes(codes), 4)).toHaveLength(0);
  });

  it("respects the number of sets still needed when melds are exposed", () => {
    const codes = "m1 m2 m3 p1 p2 p3 s5 s5".split(" ");
    expect(decompose(countsFromCodes(codes), 2)).toHaveLength(1);
    expect(decompose(countsFromCodes(codes), 4)).toHaveLength(0);
  });
});

describe("special hands", () => {
  it("recognizes Thirteen Orphans", () => {
    const codes = "m1 m9 p1 p9 s1 s9 we ws ww wn dr dg dw dr".split(" ");
    expect(isThirteenOrphans(codes)).toBe(true);
  });

  it("rejects Thirteen Orphans missing a terminal", () => {
    const codes = "m1 m1 p1 p9 s1 s9 we ws ww wn dr dg dw dr".split(" ");
    expect(isThirteenOrphans(codes)).toBe(false);
  });

  it("recognizes Nine Gates", () => {
    const codes = "m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m5".split(" ");
    expect(isNineGates(codes)).toBe(true);
  });

  it("rejects Nine Gates spanning two suits", () => {
    const codes = "m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 p5".split(" ");
    expect(isNineGates(codes)).toBe(false);
  });
});

describe("analyzeShape", () => {
  it("completes a hand around exposed melds", () => {
    const melds = [pungMeld("dr"), pungMeld("we")];
    const concealed = "m1 m2 m3 p4 p5 p6 s8 s8".split(" ");
    expect(analyzeShape(concealed, melds)).not.toBeNull();
  });

  it("only treats a concealed hand as a special hand", () => {
    const melds = [pungMeld("dr")];
    const codes = "m1 m9 p1 p9 s1 s9 we ws ww wn dr dg dw dr".split(" ");
    expect(analyzeShape(codes, melds)?.special ?? null).toBeNull();
  });
});

describe("waits", () => {
  it("finds both ends of an open wait", () => {
    const concealed = "m1 m2 m3 p4 p5 p6 s7 s8 s9 we we m4 m5".split(" ");
    expect(waitingTiles(concealed, [])).toEqual(["m3", "m6"]);
  });

  it("finds a pair wait", () => {
    const concealed = "m1 m2 m3 p4 p5 p6 s7 s8 s9 we we we dg".split(" ");
    expect(waitingTiles(concealed, [])).toEqual(["dg"]);
  });

  it("agrees with completesHand", () => {
    const concealed = "m1 m2 m3 p4 p5 p6 s7 s8 s9 we we we dg".split(" ");
    expect(completesHand(concealed, [], "dg")).toBe(true);
    expect(completesHand(concealed, [], "dr")).toBe(false);
  });
});
