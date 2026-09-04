"use client";

import { use, useCallback } from "react";
import { useRoom } from "@/hooks/useRoom";
import { SeatPicker } from "@/components/SeatPicker";
import { PhoneView } from "@/components/PhoneView";
import { TableView } from "@/components/TableView";
import { FullRoomView } from "@/components/FullRoomView";
import type { Seat } from "@/game/tiles";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const roomId = id.toUpperCase();
  const api = useRoom(roomId);
  const { view } = api;

  const claim = useCallback(
    async (seat: Seat | "table", password: string, name: string) => {
      const response = await fetch(`/api/rooms/${roomId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat, password, name }),
      });
      const body = (await response.json()) as { token?: string; error?: string };
      if (response.ok && body.token) api.setToken(body.token);
      else throw new Error(body.error ?? "Could not take that seat");
    },
    [roomId, api],
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

  if (view.you.role === "table") {
    return (
      <main className="app app--table">
        <TableView api={api} view={view} />
        {api.error ? <p className="lobby__error">{api.error}</p> : null}
      </main>
    );
  }

  // A seated player. With a table device in the room the phone only carries
  // their own hand; without one it has to show the whole table.
  return (
    <main className="app">
      {view.tablePresent ? <PhoneView api={api} view={view} /> : <FullRoomView api={api} view={view} />}
      {api.error ? <p className="lobby__error">{api.error}</p> : null}
    </main>
  );
}
