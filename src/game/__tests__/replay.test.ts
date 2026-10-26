import { describe, expect, it } from "vitest";
import { autoPlayHand } from "../controller";
import { createGame } from "../engine";
import { replaySteps } from "../replay";
import { createRng } from "../rng";

describe("replaying a hand from its log", () => {
  it("ends with every pond and set exactly as the hand left them, over many hands", () => {
    let claims = 0;
    for (let seed = 0; seed < 60; seed++) {
      const game = createGame({ seed: seed * 977 + 13 });
      for (const p of game.players) p.isHuman = false;
      const { state } = autoPlayHand(game, createRng(seed * 31 + 7));
      const steps = replaySteps(state.log, state.handNumber);
      const last = steps[steps.length - 1];
      const result = state.result!;
      // Off a discard, the replay leaves the tile won on where it was thrown, ringed.
      const wonOff = result.type === "win" && result.from !== null && last.marked !== null ? result.from : null;
      for (const p of state.players) {
        const pond = p.discards.map((t) => t.code);
        expect(last.ponds[p.seat]).toEqual(wonOff === p.seat ? [...pond, last.ponds[p.seat].at(-1)] : pond);
        expect(last.sets[p.seat].map((m) => [m.kind, m.tiles])).toEqual(
          p.melds.map((m) => [m.type, m.tiles.map((t) => t.code).sort()]).map(([k, t]) => [k, t]),
        );
        claims += p.melds.filter((m) => !m.concealed).length;
      }
      expect(steps[0].ponds.every((pond) => pond.length === 0)).toBe(true);
    }
    // The hands played did lay sets down, so the claims were replayed too.
    expect(claims).toBeGreaterThan(20);
  });

  it("rings the tile each discard put down", () => {
    const game = createGame({ seed: 5 });
    for (const p of game.players) p.isHuman = false;
    const { state } = autoPlayHand(game, createRng(5));
    const discard = replaySteps(state.log, state.handNumber).find((s) => s.play?.kind === "discard")!;
    expect(discard.marked).toEqual({ seat: discard.seat, index: 0 });
  });
});
