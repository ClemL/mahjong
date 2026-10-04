"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Tile, compareCodes, isHonor, sortTiles } from "@/game/tiles";

export type SortMode = "suits" | "honors" | "manual";

const MODE_KEY = "hk-mahjong.sort";
const ORDER_KEY = "hk-mahjong.order";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // An order that cannot be saved still holds for this session.
  }
}

function honorsFirst(tiles: Tile[]): Tile[] {
  return [...tiles].sort(
    (a, b) =>
      Number(!isHonor(a.code)) - Number(!isHonor(b.code)) ||
      compareCodes(a.code, b.code) ||
      a.id.localeCompare(b.id),
  );
}

export interface HandOrder {
  mode: SortMode;
  setMode: (mode: SortMode) => void;
  /** The hand in display order, minus a drawn tile that has not been placed. */
  tiles: Tile[];
  /** The tile just drawn, shown apart at the end until the player places it. */
  drawn: Tile | undefined;
  /** Take this order of tile ids as the player's own, switching to manual. */
  arrange: (ids: string[]) => void;
}

/**
 * How a player's hand is laid out on their phone. The server always sends it
 * sorted; this is presentation only, so it lives with the phone.
 *
 * Manual order is kept per hand: tiles the player has placed keep their
 * places, tiles that arrive later join at the right, and the order survives a
 * reload. Read during the first render — the hand only renders in the browser.
 */
export function useHandOrder(hand: Tile[], drawnId: string | null, handKey: string): HandOrder {
  const [mode, setModeState] = useState<SortMode>(() =>
    typeof window === "undefined" ? "suits" : read<SortMode>(MODE_KEY, "suits"),
  );
  const [manual, setManual] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = read<{ key: string; ids: string[] } | null>(ORDER_KEY, null);
    return stored?.key === handKey ? stored.ids : [];
  });

  const setMode = useCallback((next: SortMode) => {
    setModeState(next);
    write(MODE_KEY, next);
  }, []);

  const { tiles, drawn } = useMemo(() => {
    const drawnTile = hand.find((t) => t.id === drawnId);
    if (mode !== "manual") {
      const rest = hand.filter((t) => t.id !== drawnId);
      return { tiles: mode === "honors" ? honorsFirst(rest) : sortTiles(rest), drawn: drawnTile };
    }
    const byId = new Map(hand.map((t) => [t.id, t]));
    const kept = manual.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
    const keptIds = new Set(kept.map((t) => t.id));
    const placed = drawnTile !== undefined && keptIds.has(drawnTile.id);
    const fresh = sortTiles(hand.filter((t) => !keptIds.has(t.id) && t.id !== drawnId));
    return { tiles: [...kept, ...fresh], drawn: placed ? undefined : drawnTile };
  }, [hand, drawnId, mode, manual]);

  // Fold newly arrived tiles into the manual order once they are part of the
  // hand proper, so the next arrival does not reshuffle them.
  useEffect(() => {
    if (mode !== "manual") return;
    const ids = tiles.map((t) => t.id);
    if (ids.join() === manual.join()) return;
    setManual(ids);
    write(ORDER_KEY, { key: handKey, ids });
  }, [mode, tiles, manual, handKey]);

  const arrange = useCallback(
    (ids: string[]) => {
      // A drawn tile left at the very end has not been placed — it keeps its
      // spot apart, marked as the new arrival.
      const placed = drawnId !== null && ids[ids.length - 1] === drawnId ? ids.slice(0, -1) : ids;
      setManual(placed);
      write(ORDER_KEY, { key: handKey, ids: placed });
      setMode("manual");
    },
    [drawnId, handKey, setMode],
  );

  return { mode, setMode, tiles, drawn, arrange };
}
