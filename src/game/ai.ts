/**
 * Computer opponents.
 *
 * Iteration 1: the AI plays at random. It draws, and unless it can declare a
 * legal win it discards a uniformly random tile from its concealed hand. Claims
 * on a discard are chosen uniformly at random from {pass, ...legal claims},
 * except that a winning claim is always taken.
 *
 * The `AiStrategy` interface is the seam for smarter opponents later on.
 */
import { isFlower } from "./tiles";
import type { Seat } from "./tiles";
import type { ClaimOption, GameState, KongOption } from "./engine";
import { kongOptions, selfDrawScore } from "./engine";
import type { Rng } from "./rng";

export type AiTurnDecision =
  | { type: "win" }
  | { type: "kong"; option: KongOption }
  | { type: "discard"; tileId: string };

export interface AiStrategy {
  name: string;
  chooseTurnAction(state: GameState, seat: Seat, rng: Rng): AiTurnDecision;
  chooseClaim(state: GameState, seat: Seat, options: ClaimOption[], rng: Rng): ClaimOption | null;
}

/** Probability a random AI takes an offered kong on its own turn. */
const KONG_CHANCE = 0.5;

export const randomAi: AiStrategy = {
  name: "Random",

  chooseTurnAction(state, seat, rng) {
    if (selfDrawScore(state, seat)) return { type: "win" };

    const kongs: KongOption[] = kongOptions(state, seat);
    if (kongs.length > 0 && rng.next() < KONG_CHANCE) {
      return { type: "kong", option: rng.pick(kongs) };
    }

    const hand = state.players[seat].hand.filter((t) => !isFlower(t.code));
    // Guard: a hand should never be empty here, but never crash the table.
    if (hand.length === 0) {
      const any = state.players[seat].hand[0];
      return { type: "discard", tileId: any?.id ?? "" };
    }
    return { type: "discard", tileId: rng.pick(hand).id };
  },

  chooseClaim(_state, _seat, options, rng) {
    const win = options.find((o) => o.type === "win");
    if (win) return win;
    if (options.length === 0) return null;
    // Uniform over pass plus each legal claim.
    const index = rng.int(options.length + 1);
    return index === options.length ? null : options[index];
  },
};

export const STRATEGIES: Record<string, AiStrategy> = {
  random: randomAi,
};
