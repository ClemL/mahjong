"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/game/room";
import type { PlayerAction, TableCommand } from "@/server/rooms";

const POLL_MS = 1100;

export interface RoomApi {
  view: RoomView | null;
  error: string | null;
  busy: boolean;
  token: string | null;
  setToken: (token: string | null) => void;
  act: (action: PlayerAction) => Promise<void>;
  control: (command: TableCommand) => Promise<void>;
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
  const versionRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (tokenRef.current) params.set("token", tokenRef.current);
        if (versionRef.current) params.set("since", String(versionRef.current));
        const response = await fetch(`/api/rooms/${roomId}?${params}`, { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setError(body.error ?? "Lost the room");
        } else {
          const body = (await response.json()) as RoomView | { unchanged: true; version: number };
          if (!cancelled) {
            setError(null);
            if (!("unchanged" in body)) {
              versionRef.current = body.version;
              setView(body);
            }
          }
        }
      } catch {
        if (!cancelled) setError("Connection lost — retrying");
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
    setToken,
    act: useCallback((action: PlayerAction) => send("action", { action }), [send]),
    control: useCallback((command: TableCommand) => send("control", { command }), [send]),
    refresh: useCallback(() => setNonce((n) => n + 1), []),
  };
}
