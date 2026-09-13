"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useRoomSound } from "@/hooks/useRoomSound";
import { SeatPicker } from "@/components/SeatPicker";
import { PhoneView } from "@/components/PhoneView";
import { TableView } from "@/components/TableView";
import { TableLobby } from "@/components/TableLobby";
import { FullRoomView } from "@/components/FullRoomView";
import { ResumeGate } from "@/components/ResumeGate";
import { RegroupBanner } from "@/components/RegroupBanner";
import { primeAudio } from "@/game/sound";
import type { Seat } from "@/game/tiles";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const roomId = id.toUpperCase();
  const api = useRoom(roomId);
  const { view } = api;
  const sound = useRoomSound(view);

  // The key a scanned join link carries. It is read once and then stripped from
  // the address bar, so it does not sit in history or get shared by accident
  // when somebody passes the URL along.
  const [joinKey, setJoinKey] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const key = url.searchParams.get("k");
    if (!key) return;
    setJoinKey(key);
    url.searchParams.delete("k");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  const claim = useCallback(
    async (seat: Seat | "table", password: string, name: string) => {
      const response = await fetch(`/api/rooms/${roomId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat, password, key: joinKey, name }),
      });
      const body = (await response.json()) as { token?: string; error?: string };
      if (response.ok && body.token) {
        primeAudio();
        api.setToken(body.token);
      }
      else throw new Error(body.error ?? "Could not take that seat");
    },
    [roomId, api, joinKey],
  );

  if (!view) {
    return (
      <main className="app">
        <div className="panel">{api.error ?? `Looking for room ${roomId}…`}</div>
      </main>
    );
  }

  if (view.you.role === "spectator") {
    return (
      <main className="app">
        <SeatPicker
          view={view}
          busy={api.busy}
          error={api.error}
          scanned={joinKey !== null}
          onClaim={async (seat, password, name) => {
            try {
              await claim(seat, password, name);
            } catch (error) {
              // Surfaced by the picker through the hook's error channel.
              console.error(error);
            }
          }}
        />
      </main>
    );
  }

  // Nothing is dealt yet: everyone sees the gathering screen, and whoever holds
  // the deal — the tablet, or a player when there is no tablet — sees the button.
  if (!view.started) {
    return (
      <main className={view.you.role === "table" ? "app app--table" : "app"}>
        <TableLobby api={api} view={view} />
        {api.error ? <p className="lobby__error">{api.error}</p> : null}
      </main>
    );
  }

  if (view.you.role === "table") {
    return (
      <main className="app app--table">
        {view.canRegroup ? <RegroupBanner api={api} view={view} /> : null}
        <TableView api={api} view={view} sound={sound} />
        {api.error ? <p className="lobby__error">{api.error}</p> : null}
      </main>
    );
  }

  // A seated player. With a table device in the room the phone only carries
  // their own hand; without one it has to show the whole table.
  return (
    <main className="app">
      {view.canRegroup ? <RegroupBanner api={api} view={view} /> : null}
      {view.tablePresent ? (
        <PhoneView api={api} view={view} sound={sound} />
      ) : (
        <FullRoomView api={api} view={view} sound={sound} />
      )}
      {api.stale ? (
        <ResumeGate
          seat={view.you.seat}
          onResume={() => {
            primeAudio();
            api.resume();
          }}
        />
      ) : null}
      {api.error ? <p className="lobby__error">{api.error}</p> : null}
    </main>
  );
}
