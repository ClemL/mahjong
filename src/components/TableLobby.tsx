"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { MIN_FAAN_CHOICES } from "@/game/rules";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";
import { QrCode } from "./QrCode";

/** Where each seat sits relative to the tablet lying on the table. */
const EDGE: Record<Seat, string> = { 0: "bottom", 1: "right", 2: "top", 3: "left" };

/**
 * The gathering screen.
 *
 * This is the tablet everyone is already looking at while they sit down, so it
 * carries the two things that matter before a hand exists: how to join, and who
 * has. Nothing is dealt until somebody presses Deal, which is what stops the
 * first phone to connect from starting a hand the computer then plays on
 * everyone else's behalf.
 */
export function TableLobby({ api, view }: { api: RoomApi; view: RoomView }) {
  // The join link has to be built in the browser — a statically exported page
  // has no idea what host it will be served from.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const joinUrl =
    origin && view.joinKey
      ? `${origin}/room/${view.roomId}?k=${encodeURIComponent(view.joinKey)}`
      : null;

  const seats: Seat[] = [0, 1, 2, 3];
  const seated = seats.filter((s) => view.players[s].occupant.kind === "human");
  const open = 4 - seated.length;
  // The tablet is the screen people scan; a phone belongs to somebody who is
  // already in, so there the code folds away behind an invite.
  const isTable = view.you.role === "table";

  const joinPanel = (
    <div className="gather__join">
      {joinUrl ? (
        <>
          <QrCode value={joinUrl} label={`Join room ${view.roomId}`} />
          <span className="gather__url">
            {joinUrl.replace(/^https?:\/\//, "").split("?")[0]}
          </span>
          <span className="gather__hint">
            No camera? Open that address and enter the table password.
          </span>
        </>
      ) : (
        <p className="gather__hint">Preparing the join code…</p>
      )}
    </div>
  );

  return (
    <div className="gather">
      <header className="gather__head">
        <div>
          <span className="gather__label">Room code</span>
          <span className="gather__code">{view.roomId}</span>
        </div>
        <p className="gather__lead">
          {isTable
            ? "Scan to take a seat. Nothing is dealt until everyone is down and the table deals."
            : view.canDeal
              ? "Deal once everyone is down. Seats left open are played by the computer."
              : "You are in. The table deals once everyone is down."}
        </p>
      </header>

      <div className={`gather__body${isTable ? "" : " gather__body--seats"}`}>
        {isTable ? joinPanel : null}

        <div className="gather__seats">
          {seats.map((seat) => {
            const occupant = view.players[seat].occupant;
            const here = occupant.kind === "human";
            return (
              <div
                key={seat}
                className={`gather__seat${here ? " gather__seat--here" : ""}`}
                aria-live="polite"
              >
                <span className="gather__wind">{tileGlyph(seatWind(seat))}</span>
                <span className="gather__seatname">
                  {here ? occupant.name : "Waiting…"}
                </span>
                <span className="gather__seatmeta">
                  Seat {seat + 1} · {SEAT_NAMES[seat]} · {EDGE[seat]} edge
                </span>
                {/* Joined state must not rest on the colour of the card alone. */}
                <span className="gather__state">{here ? "✓ Seated" : "Open"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isTable ? null : (
        <details className="gather__invite">
          <summary>Invite someone else</summary>
          {joinPanel}
        </details>
      )}

      <footer className="gather__foot">
        {/* The table setting belongs to whoever deals; everyone else just sees
            what it is once the hand starts. */}
        {view.canDeal ? (
          <label className="field">
            <span className="field__label">Min faan</span>
            <select
              className="field__select"
              value={view.config.minFaan}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "minFaan", value: Number(e.target.value) })}
            >
              {MIN_FAAN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <span className="gather__count">
          {seated.length} of 4 seated
          {seated.length > 0 && open > 0
            ? ` · ${open} ${open === 1 ? "seat" : "seats"} will be played by the computer`
            : ""}
          {/* Nobody should have to sit and watch a seating screen because a
              friend is running late. Start a game now; it is dropped the moment
              they arrive. */}
          {view.canDeal && seated.length === 1
            ? " · start one now and the table regroups when somebody joins"
            : ""}
        </span>

        {view.canDeal ? (
          <button
            type="button"
            className="btn btn--primary btn--deal"
            disabled={api.busy || seated.length === 0}
            onClick={() => void api.control({ type: "deal" })}
          >
            {/* Waiting alone, the honest label for dealing is what it does. */}
            {seated.length === 1 ? "Play the computer" : "Deal"}
          </button>
        ) : (
          <span className="gather__hint">
            {view.tablePresent
              ? "The table deals when everyone is ready."
              : "Take a seat to start the hand."}
          </span>
        )}
      </footer>
    </div>
  );
}
