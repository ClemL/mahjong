import { describe, expect, it } from "vitest";
import {
  type GameState,
  answerClaim,
  claimTurn,
  createGame,
  declareSelfDraw,
  discard,
  liableSeat,
  selfDrawScore,
  setLiability,
} from "../engine";
import type { Meld } from "../melds";
import { DEFAULT_RULES, type RuleConfig, ruleNotes } from "../rules";
import type { Seat, Tile } from "../tiles";

let uid = 0;
const tiles = (codes: string): Tile[] => codes.split(" ").map((code) => ({ id: `${code}#${uid++}`, code }));

/** A complete hand: three runs, a dragon pung and a pair. */
const COMPLETE = "m1 m2 m3 m4 m5 m6 m7 m8 m9 dr dr dr p5 p5";

/** A game with every hand emptied, waiting for each test to lay out its own. */
function blank(config: Partial<RuleConfig> = {}): GameState {
  const state = createGame({ seed: 11, humanSeat: 0 });
  state.config = { ...state.config, minFaan: 0, ...config };
  for (const p of state.players) {
    p.hand = tiles("s1 s9 we ws ww wn dg dw m1 m9 p1 p9 s5");
    p.melds = [];
    p.flowers = [];
    p.discards = [];
  }
  state.lastDiscard = null;
  state.pendingClaims = [];
  return state;
}

/** `seat` on turn holding `codes`, the last of them just drawn. */
function onTurn(state: GameState, seat: Seat, codes: string): GameState {
  state.players[seat].hand = tiles(codes);
  state.turn = seat;
  state.phase = "action";
  state.drawnTileId = state.players[seat].hand[state.players[seat].hand.length - 1].id;
  state.drawWasReplacement = false;
  return state;
}

const keys = (state: GameState) => state.result?.score?.patterns.map((p) => p.key) ?? [];

describe("天糊 Heavenly Hand", () => {
  it("is the dealer winning on the tiles dealt", () => {
    const state = onTurn(blank(), 0, COMPLETE);
    const score = selfDrawScore(state, 0);
    expect(score?.patterns.map((p) => p.key)).toContain("heavenlyHand");
    expect(score?.limitReached).toBe(true);
    expect(keys(declareSelfDraw(state, 0))).toContain("heavenlyHand");
  });

  it("is gone once anyone has discarded", () => {
    const state = onTurn(blank(), 0, COMPLETE);
    state.players[3].discards = tiles("s2");
    expect(selfDrawScore(state, 0)?.patterns.map((p) => p.key)).not.toContain("heavenlyHand");
  });

  it("is gone once the dealer has declared a kong", () => {
    const state = onTurn(blank(), 0, "m1 m2 m3 m4 m5 m6 m7 m8 m9 p5 p5");
    state.players[0].melds = [{ type: "kong", tiles: tiles("dr dr dr dr"), concealed: true }];
    expect(selfDrawScore(state, 0)?.patterns.map((p) => p.key)).not.toContain("heavenlyHand");
  });
});

describe("地糊 Earthly Hand", () => {
  /** East, the dealer, throws a 5 Dots as the first discard of the hand. */
  function dealerThrows(prepare: (state: GameState) => void = () => {}, config: Partial<RuleConfig> = {}) {
    const state = onTurn(blank(config), 0, "s1 s9 we ws ww wn dg dw m1 m9 p1 p9 s5 p5");
    state.players[2].hand = tiles("m1 m2 m3 m4 m5 m6 m7 m8 m9 dr dr dr p5");
    prepare(state);
    return discard(state, 0, state.players[0].hand.find((t) => t.code === "p5")!.id);
  }

  it("is winning on the dealer's first discard", () => {
    const state = dealerThrows();
    const turn = claimTurn(state);
    expect(turn?.seat).toBe(2);
    expect(keys(answerClaim(state, 2, "win"))).toContain("earthlyHand");
  });

  it("is offered under any minimum, since it scores the limit", () => {
    const state = dealerThrows(() => {}, { minFaan: 5 });
    expect(claimTurn(state)?.options.map((o) => o.type)).toContain("win");
  });

  it("is not the dealer's second discard", () => {
    const state = dealerThrows((s) => {
      s.players[0].discards = tiles("s2");
    });
    expect(keys(answerClaim(state, 2, "win"))).not.toContain("earthlyHand");
  });

  it("is not a discard after someone has claimed a set", () => {
    const state = dealerThrows((s) => {
      s.players[1].melds = [{ type: "pung", tiles: tiles("s3 s3 s3"), concealed: false, claimedFrom: 0 }];
    });
    expect(keys(answerClaim(state, 2, "win"))).not.toContain("earthlyHand");
  });

  it("is self-drawing on your first draw, before anyone has claimed", () => {
    const state = onTurn(blank(), 1, COMPLETE);
    state.players[0].discards = tiles("s2");
    expect(selfDrawScore(state, 1)?.patterns.map((p) => p.key)).toContain("earthlyHand");
  });

  it("is not a self-draw on your second turn", () => {
    const state = onTurn(blank(), 1, COMPLETE);
    state.players[0].discards = tiles("s2");
    state.players[1].discards = tiles("s3");
    expect(selfDrawScore(state, 1)?.patterns.map((p) => p.key)).not.toContain("earthlyHand");
  });

  it("scores the default for a table saved before the pattern existed", () => {
    const old = { ...DEFAULT_RULES.faan } as Partial<typeof DEFAULT_RULES.faan>;
    delete old.earthlyHand;
    const state = onTurn(blank({ faan: old as typeof DEFAULT_RULES.faan }), 1, COMPLETE);
    state.players[0].discards = tiles("s2");
    const hit = selfDrawScore(state, 1)?.patterns.find((p) => p.key === "earthlyHand");
    expect(hit?.faan).toBe(13);
  });
});

/** A claimed set of `code`, fed by `from`. */
function fed(type: Meld["type"], codes: string, from: Seat): Meld {
  return { type, tiles: tiles(codes), concealed: false, claimedFrom: from };
}

describe("包 liability", () => {
  it("falls on whoever fed the third dragon set", () => {
    expect(liableSeat([fed("pung", "dr dr dr", 1), fed("pung", "dg dg dg", 2), fed("pung", "dw dw dw", 3)])).toBe(3);
  });

  it("falls on whoever fed the fourth set, a chow included", () => {
    const melds = [
      fed("pung", "s1 s1 s1", 1),
      fed("chow", "m1 m2 m3", 3),
      fed("pung", "p9 p9 p9", 2),
      fed("chow", "m4 m5 m6", 3),
    ];
    expect(liableSeat(melds)).toBe(3);
    expect(liableSeat(melds.slice(0, 3))).toBeNull();
  });

  it("moves to the latest feed when there is more than one", () => {
    const melds = [
      fed("pung", "dr dr dr", 1),
      fed("pung", "dg dg dg", 1),
      fed("pung", "dw dw dw", 2),
      fed("chow", "m1 m2 m3", 0),
    ];
    expect(liableSeat(melds)).toBe(0);
  });

  it("is nobody's when the set that would trigger it is a concealed kong", () => {
    const kong: Meld = { type: "kong", tiles: tiles("m7 m7 m7 m7"), concealed: true };
    expect(liableSeat([fed("pung", "s1 s1 s1", 1), fed("chow", "m1 m2 m3", 3), fed("pung", "p9 p9 p9", 2), kong])).toBeNull();
    expect(liableSeat([fed("pung", "dr dr dr", 1), fed("pung", "dg dg dg", 2), fed("pung", "dw dw dw", 3), kong])).toBe(3);
  });

  /** South has four sets out, North fed the last, and South self-draws the pair. */
  function twelveDown(config: Partial<RuleConfig> = {}): GameState {
    const state = onTurn(blank(config), 1, "p5 p5");
    state.players[1].melds = [
      fed("pung", "s1 s1 s1", 0),
      fed("chow", "m1 m2 m3", 0),
      fed("pung", "p9 p9 p9", 2),
      fed("pung", "s7 s7 s7", 3),
    ];
    state.players[0].discards = tiles("s2 s3");
    return state;
  }

  it("makes the feeder pay all three shares of a self-drawn win", () => {
    const after = declareSelfDraw(twelveDown(), 1);
    const value = after.result!.score!.value;
    expect(after.result?.liable).toBe(3);
    expect(after.result?.payments).toEqual([0, 3 * value, 0, -3 * value]);
  });

  it("leaves a self-draw to all three when the table has switched it off", () => {
    const after = declareSelfDraw(twelveDown({ liability: false }), 1);
    const value = after.result!.score!.value;
    expect(after.result?.liable).toBeNull();
    expect(after.result?.payments).toEqual([-value, 3 * value, -value, -value]);
  });

  it("leaves a win off a discard to the discarder", () => {
    const state = onTurn(blank(), 0, "s1 s9 we ws ww wn dg dw m1 m9 p1 p9 s5 p5");
    state.players[1].hand = tiles("p5");
    state.players[1].melds = twelveDown().players[1].melds;
    state.players[0].discards = tiles("s2 s3");
    const thrown = discard(state, 0, state.players[0].hand.find((t) => t.code === "p5")!.id);
    const after = answerClaim(thrown, 1, "win");
    const value = after.result!.score!.value;
    expect(after.result?.payments).toEqual([-value, value, 0, 0]);
    expect(after.result?.liable).toBeNull();
  });

  it("can be switched off and on between moves, and the rules say which", () => {
    const off = setLiability(blank(), false);
    expect(off.config.liability).toBe(false);
    expect(ruleNotes(off.config).find((n) => n.title.startsWith("Liability"))?.body).toMatch(/does not play/);
    const on = setLiability(off, true);
    expect(on.config.liability).toBe(true);
    expect(setLiability(on, true)).toBe(on);
  });

  it("counts a table saved before the option existed as playing it", () => {
    const state = twelveDown();
    delete (state.config as Partial<RuleConfig>).liability;
    expect(declareSelfDraw(state, 1).result?.liable).toBe(3);
  });
});
