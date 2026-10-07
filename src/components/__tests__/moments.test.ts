import { describe, expect, it } from "vitest";
import type { HandResult, LogEntry } from "@/game/engine";
import type { PatternHit, ScoreResult } from "@/game/scoring";
import { signatureMoment, winningTileOf } from "../moments";

function hit(key: string, faan: number, chinese = key): PatternHit {
  return { key, chinese, name: key, faan } as PatternHit;
}

function won(patterns: PatternHit[], { limit = false, from = 1 as number | null } = {}): HandResult {
  const faan = patterns.reduce((n, p) => n + p.faan, 0);
  const score: ScoreResult = { faan, scoredFaan: faan, patterns, value: 8, limitReached: limit };
  return { type: "win", winner: 0, from: from as HandResult["from"], score, payments: [8, -8, 0, 0], dealerKeeps: true };
}

describe("signature moments", () => {
  it("leaves an ordinary win to the chips and confetti", () => {
    expect(signatureMoment(won([hit("selfDraw", 1), hit("allChows", 1)]))).toBeNull();
    expect(signatureMoment(null)).toBeNull();
    expect(
      signatureMoment({ type: "washout", winner: null, from: null, score: null, payments: [0, 0, 0, 0], dealerKeeps: false }),
    ).toBeNull();
  });

  it("names each of the retold wins", () => {
    expect(signatureMoment(won([hit("kongReplacement", 1)]))?.kind).toBe("kongBlossom");
    expect(signatureMoment(won([hit("robbingKong", 1)]))?.kind).toBe("robbing");
    expect(signatureMoment(won([hit("lastTile", 1)], { from: null }))).toMatchObject({
      kind: "seaMoon",
      chinese: "海底撈月",
    });
    expect(signatureMoment(won([hit("lastTile", 1)], { from: 2 }))).toMatchObject({
      kind: "riverFish",
      chinese: "河底撈魚",
    });
  });

  it("puts a limit hand above everything else, naming what made it", () => {
    const moment = signatureMoment(
      won([hit("kongReplacement", 1), hit("thirteenOrphans", 13, "十三么")], { limit: true }),
    );
    expect(moment).toMatchObject({ kind: "limit", chinese: "滿糊", detail: "十三么 thirteenOrphans" });
  });

  it("reads the winning tile off the play log", () => {
    const log: LogEntry[] = [
      { id: 1, seat: 2, text: "", play: { kind: "discard", tiles: ["p5"], hand: 1 } },
      { id: 2, seat: 0, text: "", play: { kind: "win", tiles: ["p5"], hand: 1, from: 2 } },
    ];
    expect(winningTileOf(log)).toBe("p5");
    expect(winningTileOf([{ id: 3, seat: 0, text: "", play: { kind: "win", tiles: [], hand: 1 } }])).toBeNull();
    expect(winningTileOf([])).toBeNull();
  });
});
