import { describe, expect, it } from "vitest";
import type { HandRecord } from "../engine";
import { summarizeGame } from "../summary";
import { STARTING_CHIPS } from "../rules";

let hand = 0;
function record(partial: Partial<HandRecord> & Pick<HandRecord, "payments" | "scores">): HandRecord {
  hand += 1;
  return {
    handNumber: hand,
    roundWind: "we",
    dealer: 0,
    type: "win",
    winner: null,
    from: null,
    faan: null,
    value: null,
    ...partial,
  };
}

describe("a finished game's summary", () => {
  const history: HandRecord[] = [
    record({ winner: 1, from: 0, faan: 4, value: 16, payments: [-16, 32, -8, -8], scores: [-16, 32, -8, -8] }),
    record({ type: "washout", payments: [0, 0, 0, 0], scores: [-16, 32, -8, -8] }),
    record({ winner: 2, from: null, faan: 6, value: 32, payments: [-32, -32, 96, -32], scores: [-48, 0, 88, -40] }),
    record({ winner: 3, from: 0, faan: 6, value: 32, payments: [-32, -16, -16, 64], scores: [-80, -16, 72, 24] }),
  ];
  const summary = summarizeGame(history);

  it("counts the wins, the self-draws, the winning tiles thrown and the washouts", () => {
    expect(summary.hands).toBe(4);
    expect(summary.wins).toEqual([0, 1, 1, 1]);
    expect(summary.selfDraws).toBe(1);
    expect(summary.thrown).toEqual([2, 0, 0, 0]);
    expect(summary.washouts).toBe(1);
  });

  it("keeps the earlier of two equally big hands", () => {
    expect(summary.biggest?.winner).toBe(2);
    expect(summary.biggest?.faan).toBe(6);
  });

  it("tracks everyone's chips from the start, one point per hand", () => {
    expect(summary.chips[0]).toEqual([0, -16, -16, -48, -80].map((score) => STARTING_CHIPS + score));
    expect(summary.chips.every((line) => line.length === history.length + 1)).toBe(true);
  });

  it("ranks by final chips, a tie sharing the higher place", () => {
    expect(summary.standings).toEqual([2, 3, 1, 0]);
    expect(summary.place).toEqual([4, 3, 1, 2]);
    const tied = summarizeGame([record({ winner: 1, from: 0, payments: [0, 0, 0, 0], scores: [-8, 8, 8, -8] })]);
    expect(tied.standings).toEqual([1, 2, 0, 3]);
    expect(tied.place).toEqual([3, 1, 1, 3]);
  });

  it("has nothing to say about a game nobody won a hand of", () => {
    const empty = summarizeGame([]);
    expect(empty.biggest).toBeNull();
    expect(empty.chips).toEqual([[STARTING_CHIPS], [STARTING_CHIPS], [STARTING_CHIPS], [STARTING_CHIPS]]);
  });
});
