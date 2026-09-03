import { describe, expect, it } from "vitest";
import {
  ALL_CODES,
  PLAYABLE_CODES,
  buildTileSet,
  flowerOwner,
  isTerminalOrHonor,
  nextSeat,
  seatWind,
  sortTiles,
  tileName,
} from "../tiles";

describe("tile set", () => {
  it("contains 144 tiles", () => {
    expect(buildTileSet()).toHaveLength(144);
  });

  it("has 34 playable codes and 42 codes overall", () => {
    expect(PLAYABLE_CODES).toHaveLength(34);
    expect(ALL_CODES).toHaveLength(42);
  });

  it("gives every tile a unique id", () => {
    const ids = new Set(buildTileSet().map((t) => t.id));
    expect(ids.size).toBe(144);
  });

  it("has exactly four copies of each playable code and one of each bonus tile", () => {
    const counts = new Map<string, number>();
    for (const t of buildTileSet()) counts.set(t.code, (counts.get(t.code) ?? 0) + 1);
    for (const code of PLAYABLE_CODES) expect(counts.get(code)).toBe(4);
    for (let i = 1; i <= 8; i++) expect(counts.get(`f${i}`)).toBe(1);
  });
});

describe("helpers", () => {
  it("maps bonus tiles to their owning seat", () => {
    expect(flowerOwner("f1")).toBe(0);
    expect(flowerOwner("f4")).toBe(3);
    expect(flowerOwner("f5")).toBe(0);
    expect(flowerOwner("f8")).toBe(3);
    expect(flowerOwner("m1")).toBeNull();
  });

  it("advances seats counter-clockwise and wraps", () => {
    expect(nextSeat(0)).toBe(1);
    expect(nextSeat(3)).toBe(0);
    expect(nextSeat(2, 3)).toBe(1);
  });

  it("maps seats to wind tiles", () => {
    expect(seatWind(0)).toBe("we");
    expect(seatWind(3)).toBe("wn");
  });

  it("identifies terminals and honors", () => {
    expect(isTerminalOrHonor("m1")).toBe(true);
    expect(isTerminalOrHonor("m9")).toBe(true);
    expect(isTerminalOrHonor("m5")).toBe(false);
    expect(isTerminalOrHonor("dr")).toBe(true);
  });

  it("sorts tiles into suit then honor order", () => {
    const tiles = [
      { id: "a", code: "dr" },
      { id: "b", code: "s1" },
      { id: "c", code: "m5" },
      { id: "d", code: "p2" },
    ];
    expect(sortTiles(tiles).map((t) => t.code)).toEqual(["m5", "p2", "s1", "dr"]);
  });

  it("names tiles for the log", () => {
    expect(tileName("m5")).toBe("5 Characters");
    expect(tileName("we")).toBe("East Wind");
    expect(tileName("dg")).toBe("Green Dragon");
    expect(tileName("f5")).toBe("Spring");
  });
});
