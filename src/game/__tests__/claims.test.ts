import { describe, expect, it } from "vitest";
import {
  type GameState,
  answerClaim,
  claimTurn,
  createGame,
  declareAddedKong,
  discard,
  passClaim,
} from "../engine";
import type { Seat, Tile } from "../tiles";

const FILLER = ["m1", "m9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"];

/** Thirteen tiles: the codes given, made up with honors and terminals that claim nothing. */
function hand(seat: number, codes: string[]): Tile[] {
  return [...codes, ...FILLER].slice(0, 13).map((code, i) => ({ id: `${code}#t${seat}${i}`, code }));
}

/** East holds a 5 Dots and is about to throw it; each other seat holds what it is given. */
function table(seats: Partial<Record<Seat, string[] | Tile[]>>, wall?: number): GameState {
  const state = createGame({ seed: 7, humanSeat: 0 });
  state.config = { ...state.config, minFaan: 0 };
  for (const seat of [1, 2, 3] as Seat[]) {
    const given = seats[seat] ?? [];
    state.players[seat].hand =
      given.length > 0 && typeof given[0] !== "string" ? (given as Tile[]) : hand(seat, given as string[]);
    state.players[seat].melds = [];
  }
  state.players[0].hand = [...hand(0, []), { id: "p5#x", code: "p5" }];
  state.players[0].melds = [];
  state.turn = 0;
  state.phase = "action";
  state.lastDiscard = null;
  state.drawnTileId = null;
  if (wall !== undefined) {
    state.wall = state.wall.slice(0, wall);
    state.lastTileInPlay = wall === 0;
  }
  return discard(state, 0, "p5#x");
}

/** West waits on 5 Dots for the pair: a complete hand once it arrives. */
const WEST_WINS: Tile[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "dr", "dr", "dr", "p5"].map(
  (code, i) => ({ id: `${code}#w${i}`, code }),
);

describe("the last tile", () => {
  it("can still be taken to win", () => {
    const state = table({ 2: WEST_WINS }, 0);
    expect(claimTurn(state)).toEqual({ seat: 2, options: [expect.objectContaining({ type: "win" })] });
  });

  it("cannot be ponged or chowed, with nothing left to draw", () => {
    const state = table({ 1: ["p4", "p6"], 3: ["p5", "p5"] }, 0);
    expect(state.pendingClaims).toEqual([]);
    expect(state.phase).toBe("action");
  });

  it("can be ponged and chowed while the wall lasts", () => {
    const state = table({ 1: ["p4", "p6"], 3: ["p5", "p5"] });
    expect(state.pendingClaims.flatMap((c) => c.options.map((o) => o.type)).sort()).toEqual(["chow", "pung"]);
  });
});

describe("claim order", () => {
  it("asks the pung before the chow when they belong to different players", () => {
    const state = table({ 1: ["p4", "p6"], 3: ["p5", "p5"] });
    expect(claimTurn(state)).toEqual({ seat: 3, options: [expect.objectContaining({ type: "pung" })] });

    const passed = passClaim(state, 3);
    expect(claimTurn(passed)).toEqual({ seat: 1, options: [expect.objectContaining({ type: "chow" })] });
  });

  it("never offers the chow once the pung is taken", () => {
    const taken = answerClaim(table({ 1: ["p4", "p6"], 3: ["p5", "p5"] }), 3, "pung:p5");
    expect(taken.phase).toBe("action");
    expect(taken.turn).toBe(3);
    expect(taken.players[1].melds).toEqual([]);
  });

  it("offers one player's pung and chow together", () => {
    const state = table({ 1: ["p4", "p6", "p5", "p5"] });
    expect(claimTurn(state)?.seat).toBe(1);
    expect(claimTurn(state)?.options.map((o) => o.type).sort()).toEqual(["chow", "pung"]);
  });

  it("asks a win before anything else", () => {
    const state = table({ 1: ["p4", "p6"], 2: WEST_WINS, 3: ["p5", "p5"] });
    expect(claimTurn(state)).toEqual({ seat: 2, options: [expect.objectContaining({ type: "win" })] });
    expect(claimTurn(passClaim(state, 2))?.seat).toBe(3);
  });

  it("holds back a seat's chow while another seat's pung is still open", () => {
    // South can win on the 5 Dots or chow it; North can pung it.
    const south: Tile[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "p4", "p6", "dr", "dr"].map(
      (code, i) => ({ id: `${code}#s${i}`, code }),
    );
    const state = table({ 1: south, 3: ["p5", "p5"] });
    expect(claimTurn(state)).toEqual({ seat: 1, options: [expect.objectContaining({ type: "win" })] });

    const southPassedWin = passClaim(state, 1);
    expect(claimTurn(southPassedWin)).toEqual({ seat: 3, options: [expect.objectContaining({ type: "pung" })] });

    const northPassed = passClaim(southPassedWin, 3);
    expect(claimTurn(northPassed)).toEqual({ seat: 1, options: [expect.objectContaining({ type: "chow" })] });
  });

  it("moves play on once every claim has been passed", () => {
    let state = table({ 1: ["p4", "p6"], 3: ["p5", "p5"] });
    for (let i = 0; i < 4 && state.phase === "claiming"; i++) state = passClaim(state, claimTurn(state)!.seat);
    expect(state.phase).toBe("action");
    expect(state.turn).toBe(1);
    expect(state.drawnTileId).not.toBeNull();
  });

  it("ignores an answer from a seat that is not being asked", () => {
    const state = table({ 1: ["p4", "p6"], 3: ["p5", "p5"] });
    expect(answerClaim(state, 1, state.pendingClaims.find((c) => c.seat === 1)!.options[0].id)).toBe(state);
    expect(passClaim(state, 1)).toBe(state);
  });
});

describe("robbing the kong", () => {
  // The robbed tile stands in as the discard while the kong is open to robbing,
  // so the log names it like any other tile won on.
  it("wins on the tile added to a pung, and logs that tile as the one won on", () => {
    const state = createGame({ seed: 7, humanSeat: 0 });
    state.config = { ...state.config, minFaan: 0 };
    const pung = ["p5#a", "p5#b", "p5#c"].map((id) => ({ id, code: "p5" }));
    // East has a pung of 5 Dots out and has just drawn the fourth.
    state.players[0].melds = [{ type: "pung", tiles: pung, concealed: false, claimedFrom: 2 }];
    state.players[0].hand = [...hand(0, []).slice(0, 10), { id: "p5#d", code: "p5" }];
    // West waits on 4-6 of dots for its last set.
    state.players[2].hand = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "dr", "dr", "p4", "p6"].map(
      (code, i) => ({ id: `${code}#r${i}`, code }),
    );
    for (const seat of [1, 3] as Seat[]) state.players[seat].hand = hand(seat, []);
    state.turn = 0;
    state.phase = "action";
    state.lastDiscard = null;
    state.drawnTileId = "p5#d";

    const exposed = declareAddedKong(state, 0, "p5");
    const asked = claimTurn(exposed);
    expect(asked?.seat).toBe(2);
    const won = answerClaim(exposed, 2, asked!.options.find((o) => o.type === "win")!.id);
    expect(won.result?.winner).toBe(2);
    expect(won.result?.score?.patterns.map((p) => p.key)).toContain("robbingKong");
    expect(won.log.at(-1)?.play).toMatchObject({ kind: "win", tiles: ["p5"] });
  });
});
