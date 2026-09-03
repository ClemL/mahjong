/**
 * Glue between the pure engine and whoever is driving it (React, or a test
 * harness). Everything here is deterministic given an `Rng`.
 */
import type { Seat } from "./tiles";
import {
  type ClaimDecision,
  type GameState,
  advanceTurn,
  declareAddedKong,
  declareConcealedKong,
  declareSelfDraw,
  discard,
  resolveClaims,
} from "./engine";
import { type AiStrategy, randomAi } from "./ai";
import type { Rng } from "./rng";

/** True when the discard is settled and the next player still has to draw. */
export function needsTurnAdvance(state: GameState): boolean {
  return state.phase === "action" && state.lastDiscard !== null && state.drawnTileId === null;
}

/** Seats waiting on a claim decision. */
export function claimingSeats(state: GameState): Seat[] {
  return state.pendingClaims.map((c) => c.seat);
}

/** Seat controlled by the player, or null when every seat is an AI. */
export function humanSeat(state: GameState): Seat | null {
  return state.players.find((p) => p.isHuman)?.seat ?? null;
}

/** True when the human is being asked to claim a discard. */
export function awaitingHumanClaim(state: GameState): boolean {
  const seat = humanSeat(state);
  return seat !== null && state.phase === "claiming" && claimingSeats(state).includes(seat);
}

/** Perform one action for the AI whose turn it is. */
export function stepAiTurn(
  state: GameState,
  rng: Rng,
  strategy: AiStrategy = randomAi,
): GameState {
  if (state.phase !== "action") return state;
  const seat = state.turn;
  if (state.players[seat].isHuman) return state;
  if (state.drawnTileId === null && state.lastDiscard !== null) return advanceTurn(state);

  const decision = strategy.chooseTurnAction(state, seat, rng);
  switch (decision.type) {
    case "win":
      return declareSelfDraw(state, seat);
    case "kong":
      return decision.option.kind === "concealed"
        ? declareConcealedKong(state, seat, decision.option.code)
        : declareAddedKong(state, seat, decision.option.code);
    case "discard":
      return discard(state, seat, decision.tileId);
  }
}

/** Claim decisions for every AI seat with pending options. */
export function aiClaimDecisions(
  state: GameState,
  rng: Rng,
  strategy: AiStrategy = randomAi,
): ClaimDecision[] {
  return state.pendingClaims
    .filter((c) => !state.players[c.seat].isHuman)
    .map((c) => ({
      seat: c.seat,
      optionId: strategy.chooseClaim(state, c.seat, c.options, rng)?.id ?? null,
    }));
}

/** Resolve a claim round, folding in the human's answer when there is one. */
export function resolveWithAi(
  state: GameState,
  rng: Rng,
  humanDecision?: ClaimDecision,
  strategy: AiStrategy = randomAi,
): GameState {
  const decisions = aiClaimDecisions(state, rng, strategy);
  if (humanDecision) decisions.push(humanDecision);
  return resolveClaims(state, decisions);
}

/**
 * Advance the table by one observable beat. Returns the same state when the
 * game is waiting on the human (or the hand is over).
 */
export function stepTable(state: GameState, rng: Rng, strategy: AiStrategy = randomAi): GameState {
  if (state.phase === "handOver" || state.phase === "gameOver") return state;

  if (state.phase === "claiming") {
    if (awaitingHumanClaim(state)) return state;
    return resolveWithAi(state, rng, undefined, strategy);
  }
  if (needsTurnAdvance(state)) return advanceTurn(state);
  if (state.players[state.turn].isHuman) return state;
  return stepAiTurn(state, rng, strategy);
}

/**
 * Play a hand to completion with every seat driven by the AI.
 * Used by the test suite to fuzz the rules engine.
 */
export function autoPlayHand(
  initial: GameState,
  rng: Rng,
  strategy: AiStrategy = randomAi,
  maxSteps = 4000,
): { state: GameState; steps: number } {
  let state = initial;
  let steps = 0;
  while (state.phase !== "handOver" && state.phase !== "gameOver" && steps < maxSteps) {
    const before = state;
    state = stepTable(state, rng, strategy);
    steps += 1;
    if (state === before) break;
  }
  return { state, steps };
}
