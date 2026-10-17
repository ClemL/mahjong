// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createGame, nextHand } from "@/game/engine";
import { autoPlayHand } from "@/game/controller";
import { createRng } from "@/game/rng";
import { SOLO_SAVE_KEY, clearSavedGame, describeSavedGame, readSavedGame, writeSavedGame } from "../soloSave";

afterEach(() => window.localStorage.clear());

describe("the saved solo game", () => {
  it("comes back exactly as it was left, mid-hand", () => {
    let state = createGame({ seed: 9 });
    for (const p of state.players) p.isHuman = false;
    state = autoPlayHand(state, createRng(2), undefined, 30).state;
    writeSavedGame(state);
    expect(readSavedGame()).toEqual(state);
  });

  it("is cleared once the game is over, since there is nothing to resume", () => {
    const state = createGame({ seed: 9 });
    writeSavedGame(state);
    writeSavedGame({ ...state, phase: "gameOver" });
    expect(window.localStorage.getItem(SOLO_SAVE_KEY)).toBeNull();
    expect(readSavedGame()).toBeNull();
  });

  it("drops a save it cannot play rather than crashing the table", () => {
    window.localStorage.setItem(SOLO_SAVE_KEY, "{not json");
    expect(readSavedGame()).toBeNull();
    window.localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify({ version: 1, state: { players: [] } }));
    expect(readSavedGame()).toBeNull();
    window.localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify({ version: 99, state: createGame({ seed: 1 }) }));
    expect(readSavedGame()).toBeNull();
    expect(window.localStorage.getItem(SOLO_SAVE_KEY)).toBeNull();
  });

  it("can be thrown away", () => {
    writeSavedGame(createGame({ seed: 4 }));
    clearSavedGame();
    expect(readSavedGame()).toBeNull();
  });

  it("describes where the game stands", () => {
    let state = createGame({ seed: 5 });
    for (const p of state.players) p.isHuman = false;
    state = nextHand(autoPlayHand(state, createRng(1)).state);
    state.scores = [-8, 8, 0, 0];
    expect(describeSavedGame(state)).toBe(`East round, hand ${state.handNumber} · you are -8`);
    expect(describeSavedGame({ ...state, scores: [0, 0, 0, 0] })).toMatch(/you are level$/);
  });
});
