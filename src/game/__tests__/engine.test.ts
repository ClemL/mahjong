import { describe, expect, it } from "vitest";
import {
  type GameState,
  claimOptionsFor,
  createGame,
  discard,
  nextHand,
  resolveClaims,
  turnActions,
} from "../engine";
import { autoPlayHand } from "../controller";
import { createRng } from "../rng";
import { compareCodes, isFlower, rankOf } from "../tiles";
import type { Seat, Tile } from "../tiles";

function allAiGame(seed: number): GameState {
  const state = createGame({ seed });
  for (const p of state.players) p.isHuman = false;
  return state;
}

function allTiles(state: GameState): Tile[] {
  return [
    ...state.wall,
    ...state.players.flatMap((p) => [
      ...p.hand,
      ...p.melds.flatMap((m) => m.tiles),
      ...p.flowers,
      ...p.discards,
    ]),
  ];
}

function expectTileConservation(state: GameState): void {
  const tiles = allTiles(state);
  expect(tiles).toHaveLength(144);
  expect(new Set(tiles.map((t) => t.id)).size).toBe(144);
}

describe("dealing", () => {
  it("gives each player a legal opening hand", () => {
    const state = createGame({ seed: 12345 });
    expectTileConservation(state);
    for (const p of state.players) {
      const expected = p.seat === state.dealer ? 14 : 13;
      expect(p.hand).toHaveLength(expected);
      expect(p.hand.some((t) => isFlower(t.code))).toBe(false);
    }
    expect(state.turn).toBe(state.dealer);
    expect(state.drawnTileId).not.toBeNull();
  });

  it("is reproducible from a seed", () => {
    const a = createGame({ seed: 999 });
    const b = createGame({ seed: 999 });
    expect(a.players.map((p) => p.hand.map((t) => t.id))).toEqual(
      b.players.map((p) => p.hand.map((t) => t.id)),
    );
  });

  it("holds bonus tiles aside rather than in hand", () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame({ seed });
      const bonus = state.players.flatMap((p) => p.flowers);
      expect(bonus.every((t) => isFlower(t.code))).toBe(true);
      expect(state.players.flatMap((p) => p.hand).some((t) => isFlower(t.code))).toBe(false);
    }
  });
});

describe("claims", () => {
  it("offers a chow only to the player to the discarder's right", () => {
    const state = createGame({ seed: 42 });
    state.players[1].hand = [
      { id: "x1", code: "m2" },
      { id: "x2", code: "m3" },
    ];
    state.players[2].hand = [
      { id: "y1", code: "m2" },
      { id: "y2", code: "m3" },
    ];
    const tile: Tile = { id: "z", code: "m1" };
    const next = claimOptionsFor(state, 1, tile, 0, true);
    const notNext = claimOptionsFor(state, 2, tile, 0, false);
    expect(next.map((o) => o.type)).toContain("chow");
    expect(notNext.map((o) => o.type)).not.toContain("chow");
  });

  it("offers pung and kong to any seat", () => {
    const state = createGame({ seed: 42 });
    state.players[2].hand = [
      { id: "a", code: "p5" },
      { id: "b", code: "p5" },
      { id: "c", code: "p5" },
    ];
    const options = claimOptionsFor(state, 2, { id: "z", code: "p5" }, 0, false);
    expect(options.map((o) => o.type).sort()).toEqual(["kong", "pung"]);
  });

  it("gives a pung priority over a chow", () => {
    let state = createGame({ seed: 7 });
    for (const p of state.players) p.isHuman = false;
    state.turn = 0;
    state.phase = "action";
    state.drawnTileId = null;
    state.players[0].hand = [{ id: "d1", code: "m4" }];
    state.players[1].hand = [
      { id: "c1", code: "m5" },
      { id: "c2", code: "m6" },
    ];
    state.players[2].hand = [
      { id: "p1", code: "m4" },
      { id: "p2", code: "m4" },
    ];
    state.drawnTileId = "d1";
    state = discard(state, 0, "d1");
    expect(state.phase).toBe("claiming");
    state = resolveClaims(state, [
      { seat: 1, optionId: "chow:m5-m6" },
      { seat: 2, optionId: "pung:m4" },
    ]);
    expect(state.players[2].melds).toHaveLength(1);
    expect(state.players[1].melds).toHaveLength(0);
    expect(state.turn).toBe(2);
  });

  it("passes the turn along when everyone passes", () => {
    let state = createGame({ seed: 3 });
    for (const p of state.players) p.isHuman = false;
    const tile = state.players[0].hand[0];
    state = discard(state, 0, tile.id);
    if (state.phase === "claiming") {
      state = resolveClaims(
        state,
        state.pendingClaims.map((c) => ({ seat: c.seat, optionId: null })),
      );
    }
    expect(state.players[0].discards.map((t) => t.id)).toContain(tile.id);
    expectTileConservation(state);
  });
});

describe("turn actions", () => {
  it("offers a concealed kong when four identical tiles are held", () => {
    const state = createGame({ seed: 11 });
    const seat = state.dealer;
    state.players[seat].hand = [
      { id: "k1", code: "s3" },
      { id: "k2", code: "s3" },
      { id: "k3", code: "s3" },
      { id: "k4", code: "s3" },
    ];
    state.drawnTileId = "k4";
    const actions = turnActions(state, seat);
    expect(actions.kongs).toEqual([{ kind: "concealed", code: "s3", tileIds: ["k1", "k2", "k3", "k4"] }]);
  });

  it("refuses a second discard before the turn has passed on", () => {
    let state = createGame({ seed: 21 });
    for (const p of state.players) p.isHuman = false;
    const seat = state.dealer;
    const first = state.players[seat].hand[0];
    const second = state.players[seat].hand[1];
    state = discard(state, seat, first.id);
    // Everyone passes is not resolved yet, so the seat must not act again.
    expect(turnActions(state, seat).canDiscard).toBe(false);
    const after = discard(state, seat, second.id);
    expect(after.players[seat].discards).toHaveLength(1);
    expect(after.players[seat].hand.map((t) => t.id)).toContain(second.id);
  });

  it("does not allow a win below the faan minimum", () => {
    const state = createGame({ seed: 11 });
    const seat = state.dealer;
    // A complete but valueless hand: chows across three suits with a plain pair,
    // exposed, so neither the concealed-hand nor self-draw bonus applies.
    state.players[seat].hand = "m1 m2 m3 p4 p5 p6 s7 s8 s9 m5 m6 m7 p2 p2"
      .split(" ")
      .map((code, i) => ({ id: `h${i}`, code }));
    state.players[seat].flowers = [{ id: "f", code: "f2" }];
    state.drawnTileId = "h13";
    state.players[seat].melds = [];
    const actions = turnActions(state, seat);
    // All sequences (1) + self draw (1) = 2 faan, below the 3 faan minimum.
    expect(actions.canWin).toBe(false);
  });
});

describe("full hands", () => {
  it("plays 150 random hands to completion without breaking an invariant", () => {
    for (let seed = 0; seed < 150; seed++) {
      const rng = createRng(seed * 7919 + 13);
      const { state, steps } = autoPlayHand(allAiGame(seed), rng);
      expect(state.phase, `seed ${seed} stalled`).toBe("handOver");
      expect(steps).toBeLessThan(4000);
      expectTileConservation(state);

      for (const p of state.players) {
        const target = 13 - 3 * p.melds.length;
        expect([target, target + 1], `seat ${p.seat} hand size on seed ${seed}`).toContain(p.hand.length);
        expect(p.hand.some((t) => isFlower(t.code))).toBe(false);
        for (const m of p.melds) {
          expect(m.tiles).toHaveLength(m.type === "kong" ? 4 : 3);
          const codes = m.tiles.map((t) => t.code).sort(compareCodes);
          if (m.type === "chow") {
            expect(new Set(codes.map((c) => c[0])).size, `chow spans suits: ${codes}`).toBe(1);
            expect(rankOf(codes[1]) - rankOf(codes[0]), `chow not consecutive: ${codes}`).toBe(1);
            expect(rankOf(codes[2]) - rankOf(codes[1]), `chow not consecutive: ${codes}`).toBe(1);
          } else {
            expect(new Set(codes).size, `triplet not identical: ${codes}`).toBe(1);
          }
        }
      }

      const result = state.result!;
      expect(result.payments.reduce((a, b) => a + b, 0)).toBe(0);
      if (result.type === "win") {
        expect(result.score!.faan).toBeGreaterThanOrEqual(state.config.minFaan);
        expect(result.winner).not.toBeNull();
      }
      expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it("keeps the dealership when the dealer wins and passes it otherwise", () => {
    for (let seed = 200; seed < 260; seed++) {
      const rng = createRng(seed);
      const { state } = autoPlayHand(allAiGame(seed), rng);
      const before = state.dealer;
      const next = nextHand(state);
      if (next.phase === "gameOver") continue;
      const keeps = state.result!.dealerKeeps;
      expect(next.dealer).toBe(keeps ? before : ((before + 1) % 4) as Seat);
    }
  });

  it("completes a whole East round", () => {
    const rng = createRng(2024);
    let state = allAiGame(4242);
    let hands = 0;
    while (state.phase !== "gameOver" && hands < 200) {
      const played = autoPlayHand(state, rng);
      expect(played.state.phase).toBe("handOver");
      state = nextHand(played.state);
      for (const p of state.players) p.isHuman = false;
      hands += 1;
    }
    expect(state.phase).toBe("gameOver");
    expect(state.dealership).toBe(4);
    expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
