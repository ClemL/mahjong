"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
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

  // Set while a scanned seat code is being redeemed, so the seat picker does
  // not flash up on the way to the chair the scan already chose.
  const [joining, setJoining] = useState<Seat | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

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

  // A seat's QR carries which chair it belongs to and whatever name the table
  // typed into it. Redeem it once, then strip the parameters: a reload — or
  // the link being passed on to somebody else — must not sit anyone down
  // again.
  const redeemed = useRef(false);
  useEffect(() => {
    if (redeemed.current || !view || view.you.role !== "spectator") return;
    const url = new URL(window.location.href);
    const asked = url.searchParams.get("seat");
    if (asked === null) return;

    redeemed.current = true;
    const name = url.searchParams.get("name") ?? "";
    url.searchParams.delete("seat");
    url.searchParams.delete("name");
    window.history.replaceState(null, "", url.pathname + url.search);

    const seat = Number(asked);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      setJoinError("That code is not for a seat at this table");
      return;
    }
    setJoining(seat as Seat);
    void claim(seat as Seat, name)
      .catch((error: Error) => setJoinError(error.message))
      .finally(() => setJoining(null));
  }, [view, claim]);

  if (!view) {
    return (
      <main className="app">
        <div className="panel">{api.error ?? `Looking for room ${roomId}…`}</div>
      </main>
    );
  }

  if (view.you.role === "spectator") {
    if (joining !== null) {
      return (
        <main className="app">
          <div className="panel">Taking seat {joining + 1}…</div>
        </main>
      );
    }
    return (
      <main className="app">
        <SeatPicker
          view={view}
          busy={api.busy}
          error={joinError ?? api.error}
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
      <main className="app app--table app--paced">
        {view.canRegroup ? <RegroupBanner api={api} view={view} /> : null}
        <TableView api={api} view={view} sound={sound} />
        {api.error ? <p className="lobby__error">{api.error}</p> : null}
      </main>
    );
  }

  // A seated player. With a table device in the room the phone only carries
  // their own hand; without one it has to show the whole table.
  return (
    <main className="app app--paced">
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
