import { describe, expect, it } from "vitest";
import { type GameState, createGame } from "../engine";
import { stepTable } from "../controller";
import { createRng } from "../rng";
import { type ReplayFrame, frameOf, readyOn, recordFrame } from "../replay";

/** Plays a whole hand with the computer in every seat, recording as the hook does. */
function recordHand(seed: number): { frames: ReplayFrame[]; states: GameState[] } {
  let state = createGame({ seed });
  for (const p of state.players) p.isHuman = false;
  const rng = createRng(seed);
  const states = [state];
  let frames = recordFrame([], state);
  for (let step = 0; step < 4000 && state.phase !== "handOver"; step++) {
    const next = stepTable(state, rng);
    if (next === state) break;
    state = next;
    states.push(state);
    // Seen twice, as a render can see the same state twice: still one frame.
    frames = recordFrame(recordFrame(frames, state), state);
  }
  return { frames, states };
}

describe("hand replay", () => {
  it("keeps a frame per logged move, from the deal to the end of the hand", () => {
    const { frames, states } = recordHand(14);
    const last = states[states.length - 1];
    expect(frames[0].seq).toBe(states[0].logSeq);
    expect(frames[frames.length - 1].over).toBe(true);
    expect(frames[frames.length - 1].seq).toBe(last.logSeq);
    expect(new Set(frames.map((f) => f.seq)).size).toBe(frames.length);
    // Every discard of the hand is a move of its own.
    const discards = last.log.filter((e) => e.id > states[0].logSeq && / discards /.test(e.text)).length;
    expect(frames.filter((f) => / discards /.test(f.text)).length).toBe(discards);
  });

  it("holds every tile of the hand in each frame", () => {
    const { frames } = recordHand(23);
    for (const frame of frames) {
      const held = frame.players.reduce(
        (n, p) => n + p.hand.length + p.discards.length + p.flowers.length + p.melds.reduce((m, x) => m + x.tiles.length, 0),
        0,
      );
      expect(held + frame.wall).toBe(144);
    }
  });

  it("takes nothing from the state it can change later", () => {
    const state = createGame({ seed: 3 });
    const frame = frameOf(state);
    state.players[0].hand.length = 0;
    expect(frame.players[0].hand.length).toBeGreaterThan(0);
  });

  it("says what a ready hand was waiting on", () => {
    const frame = frameOf(createGame({ seed: 3 }));
    frame.players[1].hand = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "dr", "dr", "dr", "p5"];
    expect(readyOn(frame, 1)).toEqual(["p5"]);
    // Fourteen tiles is a hand still to throw, not one waiting.
    frame.players[1].hand = [...frame.players[1].hand, "p5"];
    expect(readyOn(frame, 1)).toEqual([]);
  });
});
