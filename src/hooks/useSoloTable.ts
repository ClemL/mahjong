"use client";

import { useMemo, useRef } from "react";
import { type RoomView, soloTableView } from "@/game/room";
import type { Seat, Tile } from "@/game/tiles";
import type { MahjongApi } from "./useMahjong";

type Played = { tile: Tile; from: Seat } | null;

/**
 * The solo game as the felt draws it. The engine forgets a discard as soon as
 * the next seat draws; the felt keeps it in the middle until the next one is
 * thrown, as a room does, so the newest discard of the hand is kept here.
 */
export function useSoloTable(api: MahjongApi): RoomView | null {
  const { state, humanSeat, awaitingClaim } = api;
  const kept = useRef<{ key: string | null; played: Played }>({ key: null, played: null });
  if (state) {
    const key = `${state.rngSeed}:${state.handNumber}`;
    const thrown = state.lastDiscard;
    if (kept.current.key !== key) {
      kept.current = { key, played: thrown };
    } else if (thrown && thrown.tile.id !== kept.current.played?.tile.id) {
      kept.current = { key, played: thrown };
    }
  }
  const played = kept.current.played;

  return useMemo(
    () => (state ? soloTableView(state, played, awaitingClaim ? [humanSeat] : []) : null),
    [state, played, awaitingClaim, humanSeat],
  );
}
