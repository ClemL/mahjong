"use client";

import { useEffect, useRef, useState } from "react";
import { HURRY_FLASH_MS, type RoomView } from "@/game/room";
import { canVibrate } from "./useHaptics";

/** A long, insistent buzz: unlike any of the turn cues. */
const HURRY_PATTERN = [120, 80, 120, 80, 120];

/**
 * Who has just told this seat to hurry up, while the screen should be flashing
 * for it. Each nudge flashes and buzzes once, however many polls carry it.
 *
 * Neither waits on this phone's own Hurry up setting: that is the button for
 * hurrying others, and a player who never turned it on is still the one the
 * table is waiting for. Only the Vibrate setting silences the buzz.
 */
export function useHurryFlash(view: RoomView, vibrate: boolean): string | null {
  const [by, setBy] = useState<string | null>(null);
  const shown = useRef<number | null>(null);
  const hurry = view.hurry;
  const id = hurry !== null && hurry.seat === view.you.seat ? hurry.id : null;
  const from = hurry?.by ?? null;
  // Keyed on the nudge's id, not the view: every poll is a new view object,
  // and a timer reset by each one would never let the flash end.
  useEffect(() => {
    // The move was made or the nudge has lapsed.
    if (id === null) {
      setBy(null);
      return;
    }
    if (shown.current === id) return;
    shown.current = id;
    if (vibrate && canVibrate()) {
      try {
        navigator.vibrate(HURRY_PATTERN);
      } catch {
        // A buzz is a courtesy; the flash still says it.
      }
    }
    setBy(from);
    const timer = window.setTimeout(() => setBy(null), HURRY_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [id]);
  return by;
}
