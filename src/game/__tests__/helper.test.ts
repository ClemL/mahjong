import { describe, expect, it } from "vitest";
import { partialSets } from "../helper";
import { DEFAULT_RULES } from "../rules";
import type { Tile } from "../tiles";

const hand = (codes: string): Tile[] => codes.split(" ").map((code, i) => ({ id: `${code}#${i}`, code }));
const parts = (codes: string, discards: string[] = []) =>
  partialSets(hand(codes), "ws", "we", DEFAULT_RULES, [
    { discards: discards.map((code, i) => ({ id: `d${i}`, code })), melds: [] },
  ]).map((p) => `${p.kind}:${p.codes.join("")}>${p.needs.map((w) => `${w.code}x${w.left}`).join(",")}`);

describe("sets the hand has started", () => {
  it("names what finishes a pair, an open run, an edge and a gap", () => {
    expect(parts("dr dr")).toEqual(["pair:drdr>drx2"]);
    expect(parts("m4 m5")).toEqual(["run:m4m5>m3x4,m6x4"]);
    expect(parts("p1 p2")).toEqual(["run:p1p2>p3x4"]);
    expect(parts("s3 s5")).toEqual(["run:s3s5>s4x4"]);
  });

  it("leaves finished sets and lone tiles out", () => {
    expect(parts("m1 m2 m3 p5 p5 p5 wn dr s1 s9")).toEqual([]);
    expect(parts("m1 m2 m3 m5 m6 dg")).toEqual(["run:m5m6>m4x4,m7x4"]);
  });

  it("counts only the copies still unseen", () => {
    expect(parts("m4 m5", ["m3", "m3", "m6"])).toEqual(["run:m4m5>m3x2,m6x3"]);
  });

  it("splits loose tiles into as many partial sets as they make", () => {
    // 2-3-5: one partial either way, and 2-3 is open on both ends.
    expect(parts("s2 s3 s5")).toEqual(["run:s2s3>s1x4,s4x4"]);
    // 1-2-3 is a set already, leaving a lone 1.
    expect(parts("p1 p1 p2 p3")).toEqual([]);
    // 4-4-6-6: two pairs, not a 4-6 gap.
    expect(parts("m4 m4 m6 m6")).toEqual(["pair:m4m4>m4x2", "pair:m6m6>m6x2"]);
  });

  it("names each tile once, and leaves flowers out", () => {
    const found = partialSets(hand("m2 m2 m3 f1 f2"), "we", "we", DEFAULT_RULES, []);
    const ids = found.flatMap((p) => p.tileIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.startsWith("f"))).toBe(false);
  });

  it("reads a fourteen-tile hand of loose tiles quickly", () => {
    const started = performance.now();
    parts("m1 m2 m4 m5 m7 m8 p1 p3 p5 p7 p9 s2 s4 s6");
    expect(performance.now() - started).toBeLessThan(100);
  });
});
