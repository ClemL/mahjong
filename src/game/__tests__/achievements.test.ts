import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  BIG_FISH_FAAN,
  CHOW_HOUND_CHOWS,
  type Earned,
  FLOWER_GARDEN_FLOWERS,
  HAT_TRICK_WINS,
  HURRIED_TIMES,
  PUNG_FU_PUNGS,
  QUICK_DRAW_TURNS,
  newlyEarned,
} from "../achievements";
import { type GameState, type HandRecord, endGame } from "../engine";
import { emptyStats } from "../gameStats";
import { newRoom, startPlay } from "../room";
import type { Seat } from "../tiles";

const PEOPLE = ["Kris", "Srini", null, "Teja"];

function game(): GameState {
  const room = newRoom("TEST", undefined, 11);
  startPlay(room, 1_000);
  return room.state;
}

function won(winner: Seat, faan: number, selfDrawn = false): HandRecord {
  return {
    handNumber: 1,
    roundWind: "we",
    dealer: 0,
    type: "win",
    winner,
    from: selfDrawn ? null : (((winner + 1) % 4) as Seat),
    faan,
    value: 8,
    payments: [0, 0, 0, 0],
    scores: [100, 100, 100, 100],
  };
}

const ids = (earned: Earned[]) => earned.map((e) => `${e.seat}:${e.id}`);

describe("achievements", () => {
  it("are earned for wins: the first, one off your own draw, a big one, and three", () => {
    const state = game();
    state.history = [won(0, 1)];
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).toEqual(["0:offTheMark"]);
    state.history = [won(0, 1, true), won(0, BIG_FISH_FAAN), ...Array(HAT_TRICK_WINS - 2).fill(won(0, 1))];
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).toEqual([
      "0:offTheMark",
      "0:selfMade",
      "0:bigFish",
      "0:hatTrick",
    ]);
  });

  it("count a second winner on the same discard as a win too", () => {
    const state = game();
    state.history = [{ ...won(0, 2), alsoWon: [{ winner: 1, faan: BIG_FISH_FAAN, value: 32 }] }];
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).toEqual(["0:offTheMark", "1:offTheMark", "1:bigFish"]);
  });

  it("are earned from the game's counts: sets claimed, quick turns and hurry-ups", () => {
    const state = game();
    const stats = emptyStats();
    stats.pungs[0] = PUNG_FU_PUNGS;
    stats.chows[1] = CHOW_HOUND_CHOWS;
    stats.kongs[3] = 1;
    stats.quick[0] = QUICK_DRAW_TURNS;
    stats.hurriesReceived[1] = HURRIED_TIMES;
    stats.hurriesSent[3] = HURRIED_TIMES;
    expect(ids(newlyEarned(state, stats, [], PEOPLE))).toEqual([
      "0:pungFu",
      "0:quickDraw",
      "1:chowHound",
      "1:takeYourTime",
      "3:kongGong",
      "3:backseatDriver",
    ]);
    // One short of each, nothing.
    stats.pungs[0] -= 1;
    expect(ids(newlyEarned(state, stats, [], PEOPLE))).not.toContain("0:pungFu");
  });

  it("are earned for a handful of flowers held at once", () => {
    const state = game();
    state.players[1].flowers = Array.from({ length: FLOWER_GARDEN_FLOWERS }, (_, i) => ({ id: `f${i}#0`, code: `f${i + 1}` }));
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).toEqual(["1:flowerGarden"]);
  });

  it("crown whoever finishes with the most chips, but only once the game is over", () => {
    let state = game();
    state.history = [won(3, 1)];
    state.scores = [90, 100, 100, 110];
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).not.toContain("3:topOfTheTable");
    state = endGame(state);
    expect(ids(newlyEarned(state, emptyStats(), [], PEOPLE))).toContain("3:topOfTheTable");
  });

  it("go only to people, each once a game, under the name they had", () => {
    const state = game();
    state.history = [won(2, 1), won(0, 1)];
    const first = newlyEarned(state, emptyStats(), [], PEOPLE);
    // Seat 2 is the computer's: nothing for it.
    expect(first).toEqual([{ id: "offTheMark", seat: 0, name: "Kris", hand: state.handNumber }]);
    expect(newlyEarned(state, emptyStats(), first, PEOPLE)).toEqual([]);
  });

  it("each say how they are earned, and have an icon and a title", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.icon && a.title && a.detail).toBeTruthy();
  });
});
