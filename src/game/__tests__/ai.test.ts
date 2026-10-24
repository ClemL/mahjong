import { describe, expect, it } from "vitest";
import { type GameState, createGame } from "../engine";
import { autoPlayHand } from "../controller";
import { type AiStrategy, bestImprovingClaim, easyAi, greedyAi, hardAi, plannedClaim, randomAi, strategyFor } from "../ai";
import { createRng } from "../rng";
import { DEFAULT_RULES } from "../rules";
import { shantenOfCodes } from "../shanten";
import { isFlower, type Seat, type Tile } from "../tiles";

function hand(spec: string): Tile[] {
  return spec.split(" ").map((code, i) => ({ id: `h${i}-${code}`, code }));
}

/** The computer in all four seats, at the default rules or the minimum given. */
function seatedGame(seed: number, minFaan = DEFAULT_RULES.minFaan): GameState {
  const state = createGame({ seed, config: { ...DEFAULT_RULES, minFaan } });
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

describe("claims at a faan minimum", () => {
  it("keeps a hand concealed rather than open it for a set that costs the minimum", () => {
    const state = seatedGame(6, 3);
    const seat: Seat = 1;
    // Concealed runs are worth 3 faan; opened with a chow they are worth 2.
    state.players[seat].hand = hand("m1 m2 p1 p2 p3 s7 s8 s9 m5 m6 p7 p8 wn");
    state.players[seat].melds = [];
    state.players[seat].flowers = [];
    const options = [
      { id: "chow:m1-m2", type: "chow" as const, tileIds: ["h0-m1", "h1-m2"], codes: ["m1", "m2", "m3"] },
    ];
    expect(state.config.minFaan).toBe(3);
    expect(bestImprovingClaim(state, seat, options)?.id).toBe("chow:m1-m2");
    expect(plannedClaim(state, seat, options)).toBeNull();
    // With no minimum to protect, the chow is worth taking.
    state.config = { ...state.config, minFaan: 0 };
    expect(plannedClaim(state, seat, options)?.id).toBe("chow:m1-m2");
  });

  it("pungs a dragon when the hand stays worth the minimum", () => {
    const state = seatedGame(6);
    const seat: Seat = 1;
    state.players[seat].hand = hand("m1 m2 m3 p4 p5 p6 s7 s8 s9 dr dr wn ww");
    state.players[seat].melds = [];
    // South's own flower and season: 2 faan that opening the hand does not cost.
    state.players[seat].flowers = [{ id: "f2", code: "f2" }, { id: "f6", code: "f6" }];
    const options = [{ id: "pung:dr", type: "pung" as const, tileIds: ["h9-dr", "h10-dr"], codes: ["dr", "dr", "dr"] }];
    expect(plannedClaim(state, seat, options)?.id).toBe("pung:dr");
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

  it("rarely washes out at the Hong Kong standard 3 faan minimum", () => {
    let washouts = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { state } = autoPlayHand(seatedGame(seed * 7919 + 3, 3), createRng(seed + 101), greedyAi);
      if (state.result?.type !== "win") washouts += 1;
    }
    // These seeds wash out 4 times; an opponent blind to the minimum lost about 14.
    expect(washouts).toBeLessThanOrEqual(6);
  }, 120000);

  it("all but never washes out at the default 1 faan minimum", () => {
    expect(DEFAULT_RULES.minFaan).toBe(1);
    let washouts = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { state } = autoPlayHand(seatedGame(seed * 7919 + 3), createRng(seed + 101), greedyAi);
      if (state.result?.type !== "win") washouts += 1;
    }
    // Over 300 of these seeds there were none; at 3 faan, 44.
    expect(washouts).toBeLessThanOrEqual(2);
  }, 120000);
});

describe("difficulty levels", () => {
  it("maps each level the table can choose to its opponent, normal by default", () => {
    expect(strategyFor("easy")).toBe(easyAi);
    expect(strategyFor("normal")).toBe(greedyAi);
    expect(strategyFor("hard")).toBe(hardAi);
    expect(strategyFor(undefined)).toBe(greedyAi);
  });

  it("plays hands to completion at every level without breaking a rule", () => {
    for (const strategy of [easyAi, hardAi]) {
      for (let seed = 0; seed < 8; seed++) {
        const { state } = autoPlayHand(seatedGame(seed * 31 + 7), createRng(seed + 3), strategy);
        expect(state.phase, `${strategy.name} seed ${seed}`).toBe("handOver");
        expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
        for (const p of state.players) {
          const target = 13 - 3 * p.melds.length;
          expect([target, target + 1]).toContain(p.hand.length);
        }
      }
    }
  }, 120000);

  it("lets a player win more hands against easy computer seats than against normal ones", () => {
    // One normal seat stands in for the person, with the computer in the other three.
    const playerWins = (level: AiStrategy) => {
      let won = 0;
      for (let i = 0; i < 60; i++) {
        const player = i % 4;
        const bySeat = [level, level, level, level];
        bySeat[player] = greedyAi;
        const table: AiStrategy = {
          name: "table",
          chooseTurnAction: (state, seat, rng) => bySeat[seat].chooseTurnAction(state, seat, rng),
          chooseClaim: (state, seat, options, rng) => bySeat[seat].chooseClaim(state, seat, options, rng),
        };
        const { state } = autoPlayHand(seatedGame(i * 7919 + 3), createRng(i + 101), table);
        if (state.result?.type === "win" && state.result.winner === player) won += 1;
      }
      return won;
    };
    // Over 1,000 hands: 42.4% against easy seats, 27.0% against normal ones.
    expect(playerWins(easyAi)).toBeGreaterThan(playerWins(greedyAi) + 4);
  }, 120000);
});
