import { describe, expect, it } from "vitest";
import { type WinContext, faanValue, scoreHand } from "../scoring";
import { DEFAULT_RULES } from "../rules";
import type { Tile, TileCode } from "../tiles";
import type { Meld } from "../melds";

let uid = 0;
const tiles = (spec: string): Tile[] =>
  spec.split(" ").map((code) => ({ id: `${code}#${uid++}`, code }));

function ctx(overrides: Partial<WinContext> & { concealed: Tile[] }): WinContext {
  return {
    melds: [],
    flowers: [],
    winningTile: overrides.concealed[overrides.concealed.length - 1].code,
    seat: 0,
    roundWind: "we",
    selfDrawn: false,
    robbingKong: false,
    onKongReplacement: false,
    onLastTile: false,
    config: DEFAULT_RULES,
    ...overrides,
  };
}

function keys(result: ReturnType<typeof scoreHand>): string[] {
  return (result?.patterns ?? []).map((p) => p.key).sort();
}

describe("scoreHand", () => {
  it("scores a concealed all-sequence hand at the 3 faan minimum", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m2 m3 m5 m6 m7 p4 p5 p6 s7 s8 s9 p2 p2") }));
    expect(keys(result)).toEqual(["allChows", "concealedHand", "noBonus"]);
    expect(result?.faan).toBe(3);
    expect(result?.value).toBe(8);
  });

  it("counts self draw instead of a concealed hand", () => {
    const result = scoreHand(
      ctx({ concealed: tiles("m1 m2 m3 m5 m6 m7 p4 p5 p6 s7 s8 s9 p2 p2"), selfDrawn: true }),
    );
    expect(keys(result)).toEqual(["allChows", "noBonus", "selfDraw"]);
  });

  it("scores a full flush of triplets and caps it at the limit", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m1 m1 m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5") }));
    expect(keys(result)).toContain("fullFlush");
    expect(result!.faan).toBeGreaterThan(DEFAULT_RULES.limitFaan);
    expect(result!.scoredFaan).toBe(10);
    expect(result!.value).toBe(128);
  });

  it("drops half flush when the hand is a full flush", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m2 m3 m4 m5 m6 m7 m8 m9 m1 m2 m3 m5 m5") }));
    expect(keys(result)).not.toContain("halfFlush");
    expect(keys(result)).toContain("fullFlush");
  });

  it("scores a half flush", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m2 m3 m4 m5 m6 m7 m8 m9 dr dr dr we we") }));
    expect(keys(result)).toContain("halfFlush");
    expect(keys(result)).toContain("dragonPung");
  });

  it("scores Big Three Dragons and suppresses the individual dragon triplets", () => {
    const result = scoreHand(ctx({ concealed: tiles("dr dr dr dg dg dg dw dw dw m1 m2 m3 p5 p5") }));
    expect(keys(result)).toEqual(["bigThreeDragons", "concealedHand", "noBonus"]);
    expect(result?.faan).toBe(10);
  });

  it("scores Small Three Dragons", () => {
    const result = scoreHand(ctx({ concealed: tiles("dr dr dr dg dg dg m1 m2 m3 p4 p5 p6 dw dw") }));
    expect(keys(result)).toContain("smallThreeDragons");
    expect(keys(result)).not.toContain("dragonPung");
  });

  it("scores Big Four Winds", () => {
    const result = scoreHand(ctx({ concealed: tiles("we we we ws ws ws ww ww ww wn wn wn m5 m5") }));
    expect(keys(result)).toContain("bigFourWinds");
    expect(keys(result)).not.toContain("seatWind");
  });

  it("counts seat wind and round wind separately for the same triplet", () => {
    const result = scoreHand(
      ctx({ concealed: tiles("we we we m1 m2 m3 p4 p5 p6 s7 s8 s9 p2 p2"), seat: 0, roundWind: "we" }),
    );
    expect(keys(result)).toContain("seatWind");
    expect(keys(result)).toContain("roundWind");
  });

  it("scores Thirteen Orphans", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m9 p1 p9 s1 s9 we ws ww wn dr dg dw dr") }));
    expect(keys(result)).toContain("thirteenOrphans");
    expect(result!.faan).toBeGreaterThanOrEqual(13);
  });

  it("scores Nine Gates", () => {
    const result = scoreHand(
      ctx({ concealed: tiles("s1 s1 s1 s2 s3 s4 s5 s6 s7 s8 s9 s9 s9 s5"), selfDrawn: true }),
    );
    expect(keys(result)).toContain("nineGates");
  });

  it("scores All Honors without double counting All Triplets", () => {
    const result = scoreHand(ctx({ concealed: tiles("we we we ws ws ws dr dr dr dg dg dg wn wn") }));
    expect(keys(result)).toContain("allHonors");
    expect(keys(result)).not.toContain("allPungs");
    expect(keys(result)).not.toContain("halfFlush");
  });

  it("scores All Terminals and Honors", () => {
    const result = scoreHand(ctx({ concealed: tiles("m1 m1 m1 p9 p9 p9 s1 s1 s1 dr dr dr we we") }));
    expect(keys(result)).toContain("terminalsAndHonors");
    expect(keys(result)).not.toContain("allPungs");
  });

  it("scores bonus tiles for the seat that owns them", () => {
    const base = tiles("m1 m2 m3 m5 m6 m7 p4 p5 p6 s7 s8 s9 p2 p2");
    const east = scoreHand(ctx({ concealed: base, seat: 0, flowers: tiles("f1 f6") }));
    expect(keys(east)).toContain("ownFlower");
    expect(keys(east)).not.toContain("ownSeason");
    const south = scoreHand(ctx({ concealed: base, seat: 1, flowers: tiles("f1 f6") }));
    expect(keys(south)).toContain("ownSeason");
    expect(keys(south)).not.toContain("ownFlower");
  });

  it("scores a complete set of flowers instead of the single flower", () => {
    const result = scoreHand(
      ctx({
        concealed: tiles("m1 m2 m3 m5 m6 m7 p4 p5 p6 s7 s8 s9 p2 p2"),
        flowers: tiles("f1 f2 f3 f4"),
      }),
    );
    expect(keys(result)).toContain("flowerSet");
    expect(keys(result)).not.toContain("ownFlower");
  });

  it("adds situational faan for robbing a kong on the last tile", () => {
    const result = scoreHand(
      ctx({
        concealed: tiles("m1 m2 m3 m5 m6 m7 p4 p5 p6 s7 s8 s9 p2 p2"),
        robbingKong: true,
        onLastTile: true,
      }),
    );
    expect(keys(result)).toContain("robbingKong");
    expect(keys(result)).toContain("lastTile");
  });

  it("scores All Melds Claimed when every set came off a discard", () => {
    const meld = (spec: string): Meld => ({
      type: spec.split(" ")[0] === spec.split(" ")[1] ? "pung" : "chow",
      tiles: tiles(spec),
      concealed: false,
      claimedFrom: 1,
    });
    const result = scoreHand(
      ctx({
        concealed: tiles("p2 p2"),
        melds: [meld("m1 m2 m3"), meld("m5 m6 m7"), meld("p4 p5 p6"), meld("s7 s8 s9")],
      }),
    );
    expect(keys(result)).toContain("allExposed");
    expect(keys(result)).not.toContain("concealedHand");
  });

  it("returns null for an incomplete hand", () => {
    expect(scoreHand(ctx({ concealed: tiles("m1 m2 m4 m5 m7 m8 p1 p2 p4 s7 s8 dr dr dg") }))).toBeNull();
  });

  it("picks the highest-scoring decomposition", () => {
    // Readable as three pungs (All Triplets, 3 faan) or as chows (1 faan).
    const result = scoreHand(ctx({ concealed: tiles("m1 m1 m1 m2 m2 m2 m3 m3 m3 s1 s1 s1 dr dr") }));
    expect(keys(result)).toContain("allPungs");
  });
});

describe("faanValue", () => {
  it("follows the Hong Kong doubling table", () => {
    const expected = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];
    expected.forEach((value, faan) => expect(faanValue(faan, DEFAULT_RULES)).toBe(value));
  });

  it("caps above the limit", () => {
    expect(faanValue(13, DEFAULT_RULES)).toBe(128);
    expect(faanValue(99, DEFAULT_RULES)).toBe(128);
  });
});
