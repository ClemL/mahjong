"use client";

import { useEffect, useState } from "react";
import type { GameRecord } from "@/game/history";

/**
 * The games a table has finished, fetched while something is showing them.
 * `refresh` changing — a game just ending — reads them again.
 */
export function useTableGames(roomId: string, enabled: boolean, refresh: unknown): GameRecord[] | null {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`/api/rooms/${roomId}/games`)
      .then((response) => (response.ok ? response.json() : { games: [] }))
      .then((body: { games?: GameRecord[] }) => {
        if (live) setGames(body.games ?? []);
      })
      .catch(() => {
        if (live) setGames([]);
      });
    return () => {
      live = false;
    };
  }, [roomId, enabled, refresh]);
  return games;
}
