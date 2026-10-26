import { describe, expect, it } from "vitest";
import type { HandRecord } from "../engine";
import { type GameRecord, gameRecord, statsByName } from "../history";

let n = 0;
function hand(partial: Partial<HandRecord> & Pick<HandRecord, "payments" | "scores">): HandRecord {
  n += 1;
  return { handNumber: n, roundWind: "we", dealer: 0, type: "win", winner: null, from: null, faan: null, value: null, ...partial };
}

const people = (...names: string[]) => names.map((name) => ({ name, human: !name.startsWith("Robot") }));

describe("a finished game, as the table keeps it", () => {
  it("records everyone's place, chips, wins, winners thrown and best hand", () => {
    const record = gameRecord({
      id: "g1",
      endedAt: 1000,
      endedEarly: false,
      players: people("Kris", "Srini", "Robot Hanna", "James"),
      history: [
        hand({ winner: 1, from: 0, faan: 4, value: 16, payments: [-16, 32, -8, -8], scores: [-16, 32, -8, -8], pattern: { name: "All Triplets", chinese: "對對糊" } }),
        hand({ winner: 3, from: 0, faan: 6, value: 32, payments: [-32, -16, -16, 64], scores: [-48, 16, -24, 56] }),
      ],
    });
    expect(record.hands).toBe(2);
    expect(record.players.map((p) => [p.name, p.place, p.chips, p.wins, p.thrown, p.bestFaan])).toEqual([
      ["James", 1, 156, 1, 0, 6],
      ["Srini", 2, 116, 1, 0, 4],
      ["Robot Hanna", 3, 76, 0, 0, 0],
      ["Kris", 4, 52, 0, 2, 0],
    ]);
    expect(record.biggest).toEqual({ name: "James", faan: 6, pattern: null });
    expect(record.players.find((p) => p.name === "Robot Hanna")?.human).toBe(false);
  });
});

describe("each person's record across games", () => {
  const game = (id: string, endedAt: number, rows: [string, number, number, number][]): GameRecord => ({
    id,
    endedAt,
    hands: 4,
    endedEarly: false,
    players: rows.map(([name, place, chips, bestFaan], seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      name,
      human: !name.startsWith("Robot"),
      chips,
      place,
      wins: place === 1 ? 2 : 0,
      thrown: place === 4 ? 1 : 0,
      bestFaan,
    })),
    biggest: null,
  });

  it("adds up games, firsts, average place and chips by name, whatever the case it was typed in", () => {
    const stats = statsByName([
      game("a", 1, [["Kris", 1, 140, 5], ["Srini", 2, 110, 3], ["Robot Hanna", 3, 90, 0], ["James", 4, 60, 0]]),
      game("b", 2, [["srini", 1, 150, 8], ["kris ", 2, 120, 2], ["James", 3, 80, 1], ["Robot Clem", 4, 50, 0]]),
    ]);
    expect(stats.map((s) => [s.name, s.games, s.firsts, s.averagePlace, s.net, s.bestFaan])).toEqual([
      ["kris", 2, 1, 1.5, 60, 5],
      ["srini", 2, 1, 1.5, 60, 8],
      ["James", 2, 0, 3.5, -60, 1],
    ]);
  });

  it("leaves out the computer's chairs and games ended before a hand was played", () => {
    const empty = { ...game("c", 3, [["Thanh", 1, 100, 0], ["Robot Louis", 1, 100, 0], ["Robot Hanna", 1, 100, 0], ["Robot Clem", 1, 100, 0]]), hands: 0 };
    expect(statsByName([empty])).toEqual([]);
  });
});
