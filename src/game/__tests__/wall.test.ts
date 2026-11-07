import { describe, expect, it } from "vitest";
import { type GameState, createGame, liveTiles, setPlayOutWall } from "../engine";
import { autoPlayHand } from "../controller";
import { createRng } from "../rng";
import { DEAD_WALL_TILES, type RuleConfig, ruleNotes } from "../rules";

function allAiGame(seed: number, config: Partial<RuleConfig> = {}): GameState {
  const state = createGame({ seed });
  state.config = { ...state.config, ...config };
  for (const p of state.players) p.isHuman = false;
  return state;
}

/** Every tile in the game, wherever it is: none may be lost or doubled. */
function tilesInGame(state: GameState): number {
  return (
    state.wall.length +
    state.players.reduce(
      (n, p) => n + p.hand.length + p.flowers.length + p.discards.length + p.melds.reduce((m, x) => m + x.tiles.length, 0),
      0,
    )
  );
}

/** A minimum no hand can reach, so every hand runs to the end of the wall. */
const NOBODY_WINS: Partial<RuleConfig> = { minFaan: 99 };

describe("the end of the wall", () => {
  it("plays out every tile by default before a hand washes out", () => {
    let washouts = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { state } = autoPlayHand(allAiGame(seed, NOBODY_WINS), createRng(seed * 31 + 7));
      expect(state.phase).toBe("handOver");
      if (state.result?.type !== "washout") continue;
      washouts += 1;
      expect(state.wall, `seed ${seed}`).toHaveLength(0);
    }
    expect(washouts).toBeGreaterThan(0);
  });

  it("leaves a dead wall standing when the table does not play out every tile", () => {
    let washouts = 0;
    for (let seed = 0; seed < 20; seed++) {
      const config = seed % 2 === 0 ? { ...NOBODY_WINS, playOutWall: false } : { playOutWall: false };
      const { state } = autoPlayHand(allAiGame(seed, config), createRng(seed * 31 + 7));
      expect(state.phase, `seed ${seed} stalled`).toBe("handOver");
      expect(tilesInGame(state)).toBe(144);
      // Nobody ever drew into the dead wall, whoever won or washed out.
      expect(state.wall.length, `seed ${seed}`).toBeGreaterThanOrEqual(DEAD_WALL_TILES);
      if (state.result?.type !== "washout") continue;
      washouts += 1;
      expect(state.wall, `seed ${seed}`).toHaveLength(DEAD_WALL_TILES);
      expect(liveTiles(state)).toBe(0);
      expect(state.lastTileInPlay).toBe(true);
      expect(state.log.at(-1)?.text).toMatch(/dead wall/);
    }
    expect(washouts).toBeGreaterThan(0);
  });

  it("can be switched between hands or mid-hand, counts from the next draw, and the rules say which", () => {
    const game = allAiGame(3);
    expect(liveTiles(game)).toBe(game.wall.length);
    const off = setPlayOutWall(game, false);
    expect(off.config.playOutWall).toBe(false);
    expect(liveTiles(off)).toBe(game.wall.length - DEAD_WALL_TILES);
    expect(ruleNotes(off.config).find((n) => n.title === "End of the wall")?.body).toMatch(/dead wall/);
    expect(setPlayOutWall(off, false)).toBe(off);
    const on = setPlayOutWall(off, true);
    expect(liveTiles(on)).toBe(game.wall.length);
    expect(ruleNotes(on.config).find((n) => n.title === "End of the wall")?.body).toMatch(/Every tile/);
  });

  it("counts a table saved before the option existed as playing out every tile", () => {
    const state = allAiGame(5);
    delete (state.config as Partial<RuleConfig>).playOutWall;
    expect(liveTiles(state)).toBe(state.wall.length);
  });
});
