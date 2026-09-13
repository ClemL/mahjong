"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/game/room";
import { SEAT_IDLE_MS } from "@/game/presence";
import type { PlayerAction, TableCommand } from "@/server/rooms";

const POLL_MS = 1100;

export interface RoomApi {
  view: RoomView | null;
  error: string | null;
  busy: boolean;
  token: string | null;
  /** True when this device was asleep long enough for the table to give up on it. */
  stale: boolean;
  setToken: (token: string | null) => void;
  act: (action: PlayerAction) => Promise<void>;
  control: (command: TableCommand) => Promise<void>;
  resume: () => void;
  refresh: () => void;
}

function storageKey(roomId: string): string {
  return `hk-mahjong.room.${roomId}`;
}

/**
 * Keeps one room view fresh by polling its version. The server answers with a
 * bare `unchanged` marker when nothing has moved, so the steady state costs a
 * few dozen bytes a second rather than a whole table.
 */
export function useRoom(roomId: string): RoomApi {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const versionRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // When the last poll actually completed. A locked phone stops polling, so a
  // long gap here means the table has been playing this seat without us.
  const seenAtRef = useRef(Date.now());
  const seatedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(roomId));
      if (stored) {
        tokenRef.current = stored;
        setTokenState(stored);
      }
    } catch {
      // Private browsing: the seat simply has to be claimed again.
    }
  }, [roomId]);

  const setToken = useCallback(
    (next: string | null) => {
      tokenRef.current = next;
      setTokenState(next);
      versionRef.current = 0;
      try {
        if (next) window.localStorage.setItem(storageKey(roomId), next);
        else window.localStorage.removeItem(storageKey(roomId));
      } catch {
        // Not fatal — the token stays in memory for this session.
      }
      setNonce((n) => n + 1);
    },
    [roomId],
  );

  const resume = useCallback(() => {
    seenAtRef.current = Date.now();
    setStale(false);
    // Back from who knows how long away — take the whole table, not a diff.
    versionRef.current = 0;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    /**
     * Stop rather than quietly catching up. Polling again would clear the away
     * flag on the server and hand the seat back mid-turn, with no sign that the
     * computer had been discarding your tiles in the meantime.
     */
    const wentAway = () => seatedRef.current && Date.now() - seenAtRef.current > SEAT_IDLE_MS;

    const poll = async () => {
      if (wentAway()) {
        setStale(true);
        return;
      }
      let reached = false;
      try {
        const params = new URLSearchParams();
        if (tokenRef.current) params.set("token", tokenRef.current);
        if (versionRef.current) params.set("since", String(versionRef.current));
        const response = await fetch(`/api/rooms/${roomId}?${params}`, { cache: "no-store" });
        reached = true;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setError(body.error ?? "Lost the room");
        } else {
          const body = (await response.json()) as RoomView | { unchanged: true; version: number };
          if (!cancelled) {
            setError(null);
            if (!("unchanged" in body)) {
              versionRef.current = body.version;
              seatedRef.current = body.you.role === "player";
              setView(body);
            }
          }
        }
      } catch {
        if (!cancelled) setError("Connection lost — retrying");
      }
      if (cancelled) return;
      // Only a poll that landed counts as being present — a phone that is awake
      // but off the network has had its seat played for it just the same.
      if (reached) seenAtRef.current = Date.now();
      timer = setTimeout(poll, POLL_MS);
    };

    // A phone coming out of a lock screen may not run its pending timer for a
    // while, and the answer matters the instant the screen lights up.
    const onVisible = () => {
      if (document.visibilityState === "visible" && wentAway()) setStale(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId, nonce]);

  const send = useCallback(
    async (path: string, payload: Record<string, unknown>) => {
      if (!tokenRef.current) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/rooms/${roomId}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: tokenRef.current, ...payload }),
        });
        const body = (await response.json()) as RoomView & { error?: string };
        if (!response.ok) {
          setError(body.error ?? "That did not work");
        } else {
          setError(null);
          versionRef.current = body.version;
          setView(body);
        }
      } catch {
        setError("Could not reach the table");
      } finally {
        setBusy(false);
      }
    },
    [roomId],
  );

  return {
    view,
    error,
    busy,
    token,
    stale,
    resume,
    setToken,
    act: useCallback((action: PlayerAction) => send("action", { action }), [send]),
    control: useCallback((command: TableCommand) => send("control", { command }), [send]),
    refresh: useCallback(() => setNonce((n) => n + 1), []),
  };
}
