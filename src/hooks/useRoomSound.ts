"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/game/room";
import { type SoundName, playSound, primeAudio } from "@/game/sound";

const STORAGE_KEY = "hk-mahjong.muted";

/**
 * Table cues for a polled room.
 *
 * The single-player table derives its sounds by diffing consecutive engine
 * states; a room does the same over consecutive views, which is all the
 * information a poll carries anyway. This is what makes the shared tablet
 * audible — a clack when someone discards, a distinct cue for a claim, a run
 * of notes on a win.
 */
export function useRoomSound(view: RoomView | null): {
  muted: boolean;
  setMuted: (value: boolean) => void;
} {
  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const previous = useRef<RoomView | null>(null);

  useEffect(() => {
    try {
      setMutedState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable; the default (audible) stands.
    }
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // A preference that cannot be saved still applies for this session.
    }
    if (!value) primeAudio();
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!view || !before || mutedRef.current) return;
    // A fresh deal is not an event anyone needs announced.
    if (view.handNumber !== before.handNumber) return;

    const melds = (v: RoomView) => v.players.reduce((n, p) => n + p.melds.length, 0);
    const kongs = (v: RoomView) =>
      v.players.reduce((n, p) => n + p.melds.filter((m) => m.type === "kong").length, 0);

    let cue: SoundName | null = null;
    if (view.phase === "handOver" && before.phase !== "handOver") {
      cue = view.result?.type === "win" ? "win" : "washout";
    } else if (kongs(view) > kongs(before)) {
      cue = "kong";
    } else if (melds(view) > melds(before)) {
      cue = "claim";
    } else if (view.lastDiscard && view.lastDiscard.tile.id !== before.lastDiscard?.tile.id) {
      cue = "discard";
    } else if (view.drawnTileId && view.drawnTileId !== before.drawnTileId) {
      cue = "draw";
    }
    if (cue) playSound(cue);
  }, [view]);

  return { muted, setMuted };
}
