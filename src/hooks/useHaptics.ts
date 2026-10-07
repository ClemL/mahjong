"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";

export type HapticCue = "turn" | "claim" | "win";

/**
 * Buzz patterns, in milliseconds of vibration and pause. Each is told apart
 * by its rhythm, not its strength, which most phones cannot vary.
 */
export const HAPTIC_PATTERNS: Record<HapticCue, number[]> = {
  turn: [35],
  claim: [25, 70, 25],
  win: [70, 50, 70, 50, 160],
};

function yourTurn(view: RoomView, seat: Seat): boolean {
  return view.turn === seat && view.phase === "action" && Boolean(view.actions?.canDiscard);
}

/**
 * What, if anything, the phone should buzz for between two views of the
 * table. Only moments that need this player's hands: their turn arriving, a
 * claim offered to them, and their own win. Everything else at the table is
 * the tablet's to show.
 *
 * With no view before — the controller has just opened, as it does at the
 * deal — a turn or a claim already waiting still buzzes, since that is
 * exactly when nobody is looking. A win does not: that is a page reloaded
 * after the fact.
 */
export function hapticCue(before: RoomView | null, after: RoomView, seat: Seat): HapticCue | null {
  const won =
    before !== null &&
    after.phase === "handOver" &&
    before.phase !== "handOver" &&
    after.result?.type === "win" &&
    after.result.winner === seat;
  if (won) return "win";
  if (after.claim && !before?.claim) return "claim";
  if (yourTurn(after, seat) && !(before && yourTurn(before, seat))) return "turn";
  return null;
}

/** Whether this browser can vibrate the phone at all. iPhones cannot. */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * A short buzz when the table needs this player, so a phone lying face down
 * or held at a glance still says so. Derived by comparing views, like the
 * sounds, so the game itself knows nothing of it.
 */
export function useHaptics(view: RoomView | null, enabled: boolean): void {
  const previous = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!view || !enabled || !canVibrate()) return;
    const seat = view.you.seat;
    if (seat === null) return;
    const cue = hapticCue(before, view, seat);
    if (!cue) return;
    try {
      navigator.vibrate(HAPTIC_PATTERNS[cue]);
    } catch {
      // A buzz is a courtesy; a browser that refuses it changes nothing.
    }
  }, [view, enabled]);
}
