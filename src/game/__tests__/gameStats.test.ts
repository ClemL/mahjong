import { describe, expect, it } from "vitest";
import type { LogEntry } from "../engine";
import { QUICK_TURN_MS, addTurn, countPlays, emptyStats, leaders, noteHurry, publicStats, uncountTurn } from "../gameStats";

const play = (id: number, seat: 0 | 1 | 2 | 3, kind: NonNullable<LogEntry["play"]>["kind"]): LogEntry => ({
  id,
  seat,
  text: "",
  play: { kind, tiles: [], hand: 1 },
});

describe("game stats", () => {
  it("counts each claimed set once, by whoever made it, whoever's turn it was", () => {
    const stats = emptyStats();
    const log = [play(1, 0, "discard"), play(2, 1, "pung"), play(3, 2, "chow"), play(4, 2, "chow"), play(5, 3, "kong")];
    countPlays(stats, log);
    countPlays(stats, log);
    expect(stats.pungs).toEqual([0, 1, 0, 0]);
    expect(stats.chows).toEqual([0, 0, 2, 0]);
    expect(stats.kongs).toEqual([0, 0, 0, 1]);
    // Only what comes after is counted next time.
    countPlays(stats, [...log, play(6, 1, "pung"), { id: 7, seat: null, text: "Hand 2" }]);
    expect(stats.pungs).toEqual([0, 2, 0, 0]);
    expect(stats.logSeen).toBe(7);
  });

  it("times turns, counts the quick ones, and lets a kong add time without ending the turn", () => {
    const stats = emptyStats();
    addTurn(stats, 1, QUICK_TURN_MS, true);
    addTurn(stats, 1, 12_000, false);
    addTurn(stats, 1, 4_000, true);
    expect(stats.turnMs[1]).toBe(QUICK_TURN_MS + 16_000);
    expect(stats.turns[1]).toBe(2);
    expect(stats.quick[1]).toBe(1);
  });

  it("uncounts a turn whose discard was taken back, keeping the time spent", () => {
    const stats = emptyStats();
    addTurn(stats, 2, 1_000, true);
    uncountTurn(stats, 2);
    expect(stats).toMatchObject({ turns: [0, 0, 0, 0], quick: [0, 0, 0, 0], turnMs: [0, 0, 1_000, 0] });
    // Only the turn just counted, and only for its own seat.
    addTurn(stats, 2, 1_000, true);
    uncountTurn(stats, 3);
    expect(stats.turns[2]).toBe(1);
  });

  it("counts hurry-ups both ways, and keeps its bookkeeping off the wire", () => {
    const stats = emptyStats();
    noteHurry(stats, 0, 3);
    noteHurry(stats, 0, 3);
    expect(stats.hurriesSent).toEqual([2, 0, 0, 0]);
    expect(stats.hurriesReceived).toEqual([0, 0, 0, 2]);
    expect(Object.keys(publicStats(stats))).not.toContain("logSeen");
    expect(Object.keys(publicStats(stats))).not.toContain("lastTurn");
  });

  it("names everyone level at the top, and nobody when nobody has any", () => {
    expect(leaders([1, 3, 3, 0])).toEqual({ seats: [1, 2], count: 3 });
    expect(leaders([0, 0, 0, 0])).toEqual({ seats: [], count: 0 });
  });
});
