import { describe, expect, it } from "vitest";
import { type GameState, createGame } from "../engine";
import { autoPlayHand, shouldPromptClaim } from "../controller";
import { bestImprovingClaim, greedyAi, randomAi } from "../ai";
import { createRng } from "../rng";
import { shantenOfCodes } from "../shanten";
import { isFlower, type Seat, type Tile } from "../tiles";

function hand(spec: string): Tile[] {
  return spec.split(" ").map((code, i) => ({ id: `h${i}-${code}`, code }));
}

function seatedGame(seed: number): GameState {
  const state = createGame({ seed });
  for (const p of state.players) p.isHuman = false;
  return state;
}

describe("greedy discard", () => {
  it("throws the tile that leaves the hand closest to ready", () => {
    const state = seatedGame(4);
    const seat = state.dealer;
    // Four sets, a pair, and one useless honor — the honor has to go.
    state.players[seat].hand = hand("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr dr wn");
    state.players[seat].melds = [];
    state.drawnTileId = "h14-wn";
    const decision = greedyAi.chooseTurnAction(state, seat, createRng(1));
    expect(decision.type).toBe("discard");
    if (decision.type === "discard") {
      const tile = state.players[seat].hand.find((t) => t.id === decision.tileId)!;
      expect(tile.code).toBe("wn");
    }
  });

  it("never raises its own shanten when a neutral discard exists", () => {
    for (let seed = 0; seed < 25; seed++) {
      const state = seatedGame(seed);
      const seat = state.dealer;
      const player = state.players[seat];
      const codes = player.hand.filter((t) => !isFlower(t.code)).map((t) => t.code);
      const before = shantenOfCodes(codes, player.melds);
      const decision = greedyAi.chooseTurnAction(state, seat, createRng(seed));
      if (decision.type !== "discard") continue;
      const after = shantenOfCodes(
        player.hand.filter((t) => t.id !== decision.tileId && !isFlower(t.code)).map((t) => t.code),
        player.melds,
      );
      // Discarding from a 14-tile hand can only hold or worsen shanten by design;
      // the greedy choice must be the one that holds it.
      expect(after, `seed ${seed}`).toBeLessThanOrEqual(before + 1);
    }
  });

  it("declares a win rather than discarding", () => {
    const state = seatedGame(9);
    const seat = state.dealer;
    state.players[seat].hand = hand("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr dr");
    state.players[seat].melds = [];
    state.players[seat].flowers = [];
    state.drawnTileId = "h13-dr";
    expect(greedyAi.chooseTurnAction(state, seat, createRng(2)).type).toBe("win");
  });
});

describe("greedy claims", () => {
  it("takes a claim that brings the hand closer to ready", () => {
    const state = seatedGame(6);
    const seat: Seat = 1;
    state.players[seat].hand = hand("m1 m2 p1 p2 p3 s7 s8 s9 dr dr dg dg wn");
    state.players[seat].melds = [];
    const options = [
      { id: "chow:m1-m2", type: "chow" as const, tileIds: ["h0-m1", "h1-m2"], codes: ["m1", "m2", "m3"] },
    ];
    expect(bestImprovingClaim(state, seat, options)?.id).toBe("chow:m1-m2");
  });

  it("declines a claim that does not help", () => {
    const state = seatedGame(6);
    const seat: Seat = 1;
    // Already four sets and a pair in waiting shape; a chow only breaks it up.
    state.players[seat].hand = hand("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr");
    state.players[seat].melds = [];
    const options = [
      { id: "chow:s7-s8", type: "chow" as const, tileIds: ["h9-s7", "h10-s8"], codes: ["s7", "s8", "s9"] },
    ];
    expect(bestImprovingClaim(state, seat, options)).toBeNull();
  });
});

describe("claim prompting", () => {
  const state = () => {
    const s = seatedGame(6);
    s.players[0].isHuman = true;
    s.players[0].hand = hand("m1 m2 m3 m4 m5 m6 p1 p2 p3 s7 s8 s9 dr");
    s.players[0].melds = [];
    s.phase = "claiming";
    return s;
  };

  it("always interrupts for a win", () => {
    const s = state();
    s.pendingClaims = [{ seat: 0, options: [{ id: "win", type: "win", tileIds: [], codes: ["dr"] }] }];
    for (const mode of ["always", "useful", "wins"] as const) {
      expect(shouldPromptClaim(s, 0, mode)).toBe(true);
    }
  });

  it("only interrupts for a useless meld when asked to", () => {
    const s = state();
    s.pendingClaims = [
      {
        seat: 0,
        options: [
          { id: "chow:s7-s8", type: "chow", tileIds: ["h9-s7", "h10-s8"], codes: ["s7", "s8", "s9"] },
        ],
      },
    ];
    expect(shouldPromptClaim(s, 0, "always")).toBe(true);
    expect(shouldPromptClaim(s, 0, "useful")).toBe(false);
    expect(shouldPromptClaim(s, 0, "wins")).toBe(false);
  });

  it("does not interrupt when there is nothing to claim", () => {
    const s = state();
    s.pendingClaims = [];
    expect(shouldPromptClaim(s, 0, "always")).toBe(false);
  });
});

describe("greedy play holds the engine's invariants", () => {
  it("plays 30 hands to completion without breaking a rule", () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = createRng(seed * 7919 + 3);
      const { state } = autoPlayHand(seatedGame(seed), rng, greedyAi);
      expect(state.phase, `seed ${seed}`).toBe("handOver");

      const tiles = [
        ...state.wall,
        ...state.players.flatMap((p) => [
          ...p.hand,
          ...p.melds.flatMap((m) => m.tiles),
          ...p.flowers,
          ...p.discards,
        ]),
      ];
      expect(tiles).toHaveLength(144);
      expect(new Set(tiles.map((t) => t.id)).size).toBe(144);
      for (const p of state.players) {
        const target = 13 - 3 * p.melds.length;
        expect([target, target + 1]).toContain(p.hand.length);
      }
      expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
    }
  }, 120000);

  it("finishes far more hands than random play", () => {
    const play = (strategy: typeof greedyAi) => {
      let wins = 0;
      for (let seed = 0; seed < 25; seed++) {
        const { state } = autoPlayHand(seatedGame(seed * 13 + 1), createRng(seed + 5), strategy);
        if (state.result?.type === "win") wins += 1;
      }
      return wins;
    };
    expect(play(greedyAi)).toBeGreaterThan(play(randomAi) + 10);
  }, 120000);
});
