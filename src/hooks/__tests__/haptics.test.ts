import { describe, expect, it } from "vitest";
import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";
import { HAPTIC_PATTERNS, hapticCue } from "../useHaptics";
import { claimable, dealt, playerView } from "@/components/__tests__/fixtures";

/** The same view with only the fields under test changed. */
function changed(view: RoomView, change: Partial<RoomView>): RoomView {
  return { ...view, ...change };
}

describe("phone haptics", () => {
  it("buzzes when the turn arrives at this seat, and not again while it stays", () => {
    const room = dealt();
    const seat = room.state.turn as Seat;
    const mine = playerView(room, seat);
    expect(mine.actions?.canDiscard).toBe(true);
    const waiting = changed(mine, { turn: ((seat + 1) % 4) as Seat });
    expect(hapticCue(waiting, mine, seat)).toBe("turn");
    expect(hapticCue(mine, mine, seat)).toBeNull();
  });

  it("buzzes when a claim is offered to this seat", () => {
    const { room, claimer } = claimable();
    const offered = playerView(room, claimer);
    expect(offered.claim).not.toBeNull();
    expect(hapticCue(changed(offered, { claim: null }), offered, claimer)).toBe("claim");
  });

  it("buzzes for a turn already waiting when the controller opens, but not for a win", () => {
    const room = dealt();
    const seat = room.state.turn as Seat;
    expect(hapticCue(null, playerView(room, seat), seat)).toBe("turn");
    const other = ((seat + 1) % 4) as Seat;
    expect(hapticCue(null, playerView(room, other), other)).toBeNull();
    const result = { type: "win" as const, winner: other, from: seat, score: null, payments: [0, 0, 0, 0], dealerKeeps: false };
    expect(hapticCue(null, changed(playerView(room, other), { phase: "handOver", result }), other)).toBeNull();
  });

  it("buzzes for this seat's own win only", () => {
    const room = dealt();
    const seat = 2 as Seat;
    const playing = playerView(room, seat);
    const result = { type: "win" as const, winner: seat, from: 0 as Seat, score: null, payments: [0, 0, 0, 0], dealerKeeps: false };
    const won = changed(playing, { phase: "handOver", result });
    expect(hapticCue(playing, won, seat)).toBe("win");
    const lost = changed(playing, { phase: "handOver", result: { ...result, winner: 1 as Seat } });
    expect(hapticCue(playing, lost, seat)).toBeNull();
  });

  it("tells the three apart by rhythm", () => {
    const shapes = Object.values(HAPTIC_PATTERNS).map((p) => p.length);
    expect(new Set(shapes).size).toBe(3);
  });
});
