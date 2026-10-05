import { describe, expect, it } from "vitest";
import { bestPlan, comparePlans, pungShanten, routes } from "../plan";
import { DEFAULT_RULES } from "../rules";
import type { Meld } from "../melds";
import { countsFromCodes } from "../winning";

const counts = (spec: string) => countsFromCodes(spec.split(" "));
const seating = { seat: 1 as const, roundWind: "we", flowers: [], config: DEFAULT_RULES };
const chow = (codes: string): Meld => ({
  type: "chow",
  tiles: codes.split(" ").map((code, i) => ({ id: `c${i}`, code })),
  concealed: false,
});

describe("pungShanten", () => {
  it("counts a hand of triplets and a pair as finished, and one short as ready", () => {
    expect(pungShanten(counts("m1 m1 m1 p2 p2 p2 s3 s3 s3 we we we dr dr"), 0)).toBe(-1);
    expect(pungShanten(counts("m1 m1 m1 p2 p2 p2 s3 s3 s3 we we dr dr"), 0)).toBe(0);
    expect(pungShanten(counts("m1 m1 p2 p2 s3 s3 we we dr dr dg dg wn"), 0)).toBe(3);
  });
});

describe("routes", () => {
  it("prices a flush, all triplets and all runs on top of what the hand already holds", () => {
    // Bonus tiles in play and none held (1), still concealed (1).
    const plans = routes(counts("m1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p1 dr dr"), [], seating);
    const faan = Object.fromEntries(plans.map((p) => [p.route.kind === "flush" ? `flush-${p.route.suit}` : p.route.kind, p.faan]));
    expect(faan).toEqual({ any: 2, "flush-m": 5, "flush-p": 5, "flush-s": 5, pungs: 5, chows: 3 });
  });

  it("closes the routes an open set has already ruled out", () => {
    const plans = routes(counts("m4 m5 m6 m7 m8 m9 p1 p1 dr dr"), [chow("m1 m2 m3")], seating);
    const kinds = plans.map((p) => (p.route.kind === "flush" ? `flush-${p.route.suit}` : p.route.kind));
    expect(kinds).toEqual(["any", "flush-m", "chows"]);
    // Opened, the hand is no longer worth the concealed faan.
    expect(plans.find((p) => p.route.kind === "any")!.faan).toBe(1);
  });

  it("counts a dragon triplet, and the seat's own wind in its own round twice", () => {
    const east = { ...seating, seat: 0 as const };
    const any = (spec: string) => routes(counts(spec), [], east)[0].faan;
    expect(any("m1 m2 m3 p4 p5 p6 s7 s8 s9 dr dr dr m5")).toBe(3);
    expect(any("m1 m2 m3 p4 p5 p6 s7 s8 s9 we we we m5")).toBe(4);
  });
});

describe("choosing a plan", () => {
  it("prefers a hand that can be declared, then the nearer, then the richer", () => {
    const cheapNear = { route: { kind: "any" as const }, shanten: 0, faan: 2 };
    const richFar = { route: { kind: "pungs" as const }, shanten: 2, faan: 5 };
    const richNear = { route: { kind: "chows" as const }, shanten: 1, faan: 3 };
    expect(comparePlans(richFar, cheapNear, 3)).toBeLessThan(0);
    expect(bestPlan([cheapNear, richFar, richNear], 3)).toBe(richNear);
    // With no minimum, nearest wins.
    expect(bestPlan([cheapNear, richFar, richNear], 0)).toBe(cheapNear);
  });
});
