"use client";

import { use, useCallback } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useRoomSound } from "@/hooks/useRoomSound";
import { SeatPicker } from "@/components/SeatPicker";
import { PhoneView } from "@/components/PhoneView";
import { TableView } from "@/components/TableView";
import { FullRoomView } from "@/components/FullRoomView";
import { primeAudio } from "@/game/sound";
import type { Seat } from "@/game/tiles";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const roomId = id.toUpperCase();
  const api = useRoom(roomId);
  const { view } = api;
  const sound = useRoomSound(view);

  const claim = useCallback(
    async (seat: Seat | "table", name: string) => {
      const response = await fetch(`/api/rooms/${roomId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat, name }),
      });
      const body = (await response.json()) as { token?: string; error?: string };
      if (response.ok && body.token) {
        primeAudio();
        api.setToken(body.token);
      }
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
          onClaim={async (seat, name) => {
            try {
              await claim(seat, name);
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
      <main className="app app--table app--paced">
        <TableView api={api} view={view} sound={sound} />
        {api.error ? <p className="lobby__error">{api.error}</p> : null}
      </main>
    );
  }

  // A seated player. With a table device in the room the phone only carries
  // their own hand; without one it has to show the whole table.
  return (
    <main className="app app--paced">
      {view.tablePresent ? (
        <PhoneView api={api} view={view} sound={sound} />
      ) : (
        <FullRoomView api={api} view={view} sound={sound} />
      )}
      {api.error ? <p className="lobby__error">{api.error}</p> : null}
    </main>
  );
}
