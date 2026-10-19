import { describe, expect, it } from "vitest";
import { PATTERN_TILE_LIMIT, patternTiles } from "../patternTiles";
import { DEFAULT_RULES } from "../rules";
import { type WinContext, scoreHand } from "../scoring";
import { arrangeWinningHand } from "../winning";
import type { Meld } from "../melds";
import type { Seat, Tile, TileCode } from "../tiles";

let uid = 0;
const tiles = (spec: string): Tile[] => spec.split(" ").map((code) => ({ id: `${code}#${uid++}`, code }));

function meld(type: Meld["type"], spec: string, concealed = false): Meld {
  return { type, tiles: tiles(spec), concealed, claimedFrom: concealed ? undefined : 3 };
}

/** Score a hand, then lay out its tiles the way the result does, and pair each pattern with its tiles. */
function ledger(
  concealed: string,
  options: Partial<Omit<WinContext, "concealed">> & { seat?: Seat } = {},
): [string, TileCode[] | null][] {
  const hand = tiles(concealed);
  const melds = options.melds ?? [];
  const flowers = options.flowers ?? [];
  const ctx: WinContext = {
    concealed: hand,
    melds,
    flowers,
    winningTile: hand[hand.length - 1].code,
    seat: 0,
    roundWind: "we",
    selfDrawn: false,
    robbingKong: false,
    onKongReplacement: false,
    onLastTile: false,
    config: DEFAULT_RULES,
    ...options,
  };
  const score = scoreHand(ctx);
  expect(score).not.toBeNull();
  const layout = arrangeWinningHand(hand.map((t) => t.code), melds);
  const shown = patternTiles(score!.patterns, {
    sets: [...melds.map((m) => ({ type: m.type, codes: m.tiles.map((t) => t.code) })), ...layout.sets],
    flowers: flowers.map((t) => t.code),
    winningTile: ctx.winningTile,
    seat: ctx.seat,
    roundWind: ctx.roundWind,
  });
  return score!.patterns.map((p, i) => [p.key, shown[i]]);
}

describe("the tiles behind each faan", () => {
  it("shows each dragon set, the seat's wind set and its own flower", () => {
    const rows = ledger("dg dg dg ws ws ws m1 m2 m3 p5 p5", {
      melds: [meld("pung", "dr dr dr")],
      flowers: tiles("f2"),
      seat: 1,
    });
    const dragons = rows.filter(([key]) => key === "dragonPung").map(([, shown]) => shown);
    expect(dragons).toEqual(expect.arrayContaining([["dr", "dr", "dr"], ["dg", "dg", "dg"]]));
    expect(dragons).toHaveLength(2);
    expect(rows).toContainEqual(["seatWind", ["ws", "ws", "ws"]]);
    expect(rows).toContainEqual(["ownFlower", ["f2"]]);
  });

  it("shows a double wind set against both of its patterns", () => {
    const rows = ledger("we we we m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s2");
    expect(rows).toContainEqual(["seatWind", ["we", "we", "we"]]);
    expect(rows).toContainEqual(["roundWind", ["we", "we", "we"]]);
  });

  it("shows a dragon kong in full, at the four-tile limit", () => {
    const rows = ledger("m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s2", { melds: [meld("kong", "dw dw dw dw")] });
    expect(rows).toContainEqual(["dragonPung", ["dw", "dw", "dw", "dw"]]);
    expect(PATTERN_TILE_LIMIT).toBe(4);
  });

  it("shows the winning tile for the way it was won", () => {
    const rows = ledger("m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s3 s4 p1 p1", {
      selfDrawn: true,
      onKongReplacement: true,
    });
    expect(rows).toContainEqual(["selfDraw", ["p1"]]);
    expect(rows).toContainEqual(["kongReplacement", ["p1"]]);
  });

  it("shows a complete set of flowers, and nothing for a pattern about the whole hand", () => {
    const rows = ledger("m1 m2 m3 m4 m5 m6 m7 m8 m9 m2 m3 m4 m5 m5", { flowers: tiles("f1 f2 f3 f4") });
    expect(rows).toContainEqual(["flowerSet", ["f1", "f2", "f3", "f4"]]);
    expect(rows).toContainEqual(["fullFlush", null]);
    expect(rows).toContainEqual(["concealedHand", null]);
  });

  it("shows nothing for a pattern that needs more than four tiles", () => {
    const rows = ledger("dr dr dr dg dg dg dw dw m1 m2 m3 p5 p5 p5");
    expect(rows).toContainEqual(["smallThreeDragons", null]);
    expect(rows.some(([key]) => key === "dragonPung")).toBe(false);
  });
});
