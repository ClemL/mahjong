import { describe, expect, it } from "vitest";
import { findSets, tripletFaan } from "../sets";
import { DEFAULT_RULES } from "../rules";
import type { Tile } from "../tiles";

const hand = (codes: string): Tile[] => codes.split(" ").map((code, i) => ({ id: `${code}#${i}`, code }));
const sets = (codes: string, seat = "ws", round = "we") =>
  findSets(hand(codes), seat, round, DEFAULT_RULES).map((s) => `${s.type}:${s.codes.join("")}:${s.faan}`);

describe("sets already in a hand", () => {
  it("finds runs and triplets, and nothing in loose tiles", () => {
    expect(sets("m1 m2 m3 p5 p5 p5 s2 s4 dr wn")).toEqual(["chow:m1m2m3:0", "pung:p5p5p5:0"]);
    expect(sets("m1 m4 m7 p2 p5 p8 s3 s6 s9 we ws ww wn")).toEqual([]);
  });

  it("splits a hand the way that finds the most sets", () => {
    // 1-1-1-2-3: a triplet and nothing, or a run and a pair — one set either
    // way, and the triplet wins the tie.
    expect(sets("m1 m1 m1 m2 m3")).toEqual(["pung:m1m1m1:0"]);
    // 2-3-4-4-5-6: two runs beat a triplet-less split that finds one.
    expect(sets("p2 p3 p4 p4 p5 p6")).toEqual(["chow:p2p3p4:0", "chow:p4p5p6:0"]);
    // 3-3-3-4-5: the run would leave 3-3, the triplet leaves 4-5; one set, triplet first.
    expect(sets("s3 s3 s3 s4 s5")).toEqual(["pung:s3s3s3:0"]);
  });

  it("scores honor triplets for this seat: dragons, the seat wind, the round wind, both", () => {
    expect(sets("dr dr dr")).toEqual(["pung:drdrdr:1"]);
    expect(sets("ws ws ws", "ws", "we")).toEqual(["pung:wswsws:1"]);
    expect(sets("we we we", "ws", "we")).toEqual(["pung:wewewe:1"]);
    expect(sets("we we we", "we", "we")).toEqual(["pung:wewewe:2"]);
    expect(sets("wn wn wn", "ws", "we")).toEqual(["pung:wnwnwn:0"]);
    expect(tripletFaan("p5", "we", "we", DEFAULT_RULES)).toBe(0);
  });

  it("names each tile once, and leaves flowers out", () => {
    const found = findSets(hand("m2 m2 m2 m2 m3 m4 f1"), "we", "we", DEFAULT_RULES);
    const ids = found.flatMap((s) => s.tileIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.startsWith("f1"))).toBe(false);
    expect(found.map((s) => s.type)).toEqual(["pung", "chow"]);
  });

  it("reads a whole fourteen-tile hand quickly", () => {
    const started = performance.now();
    expect(sets("m1 m1 m1 m2 m2 m2 m3 m3 m3 p7 p8 p9 dr dr")).toHaveLength(4);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
