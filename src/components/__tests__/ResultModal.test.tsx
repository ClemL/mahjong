// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type GameState, createGame } from "@/game/engine";
import type { ScoreResult } from "@/game/scoring";
import type { Seat } from "@/game/tiles";
import { ResultModal } from "../ResultModal";

const score: ScoreResult = { faan: 3, scoredFaan: 3, patterns: [], value: 8, limitReached: false };

/** A solo hand just settled: South won, off East's discard when `from` is 0, with these payments. */
function settled(from: Seat | null, payments: number[]): GameState {
  const state = createGame({ seed: 3, humanSeat: 0 });
  state.phase = "handOver";
  state.result = { type: "win", winner: 1, from, score, payments, dealerKeeps: false, liable: null };
  return state;
}

const total = () => screen.getByText(/faan →/).textContent;

describe("ResultModal", () => {
  it("says what the others paid when they paid half of a discard win", () => {
    render(<ResultModal state={settled(0, [-8, 16, -4, -4])} onNextHand={() => {}} onNewGame={() => {}} />);
    expect(total()).toBe("3 faan → 8 points from the discarder, 4 from each of the others");
  });

  it("names the discarder alone when nobody else paid", () => {
    render(<ResultModal state={settled(0, [-8, 8, 0, 0])} onNextHand={() => {}} onNewGame={() => {}} />);
    expect(total()).toBe("3 faan → 8 points from the discarder");
  });

  it("keeps a self-drawn win to each payer", () => {
    render(<ResultModal state={settled(null, [-8, 24, -8, -8])} onNextHand={() => {}} onNewGame={() => {}} />);
    expect(total()).toBe("3 faan → 8 points each payer");
  });
});
