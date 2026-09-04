"use client";

import { useState } from "react";
import type { RoomView } from "@/game/room";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";

interface Props {
  view: RoomView;
  onClaim: (seat: Seat | "table", password: string, name: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}

/** Pick a seat, then prove you belong at the table. */
export function SeatPicker({ view, onClaim, busy, error }: Props) {
  const [choice, setChoice] = useState<Seat | "table" | null>(null);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const taken = (seat: Seat) => view.players[seat].occupant.kind === "human";

  return (
    <div className="lobby">
      <h1 className="lobby__title">
        Room <span className="lobby__code">{view.roomId}</span>
      </h1>
      <p className="lobby__lead">
        Take a seat. Any seat still open when play starts is filled by the computer.
      </p>

      <div className="lobby__seats">
        {([0, 1, 2, 3] as Seat[]).map((seat) => (
          <button
            key={seat}
            type="button"
            className={`seat-card${choice === seat ? " seat-card--on" : ""}`}
            disabled={taken(seat)}
            aria-pressed={choice === seat}
            onClick={() => setChoice(seat)}
          >
            <span className="seat-card__wind">{tileGlyph(seatWind(seat))}</span>
            <span className="seat-card__name">{SEAT_NAMES[seat]}</span>
            <span className="seat-card__state">
              {taken(seat)
                ? view.players[seat].occupant.name
                : view.players[seat].occupant.kind === "ai"
                  ? "Computer — sit in"
                  : "Open"}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`seat-card seat-card--table${choice === "table" ? " seat-card--on" : ""}`}
          disabled={view.tablePresent}
          aria-pressed={choice === "table"}
          onClick={() => setChoice("table")}
        >
          <span className="seat-card__wind">🀄</span>
          <span className="seat-card__name">Table</span>
          <span className="seat-card__state">
            {view.tablePresent ? "In use" : "For the shared tablet"}
          </span>
        </button>
      </div>

      <form
        className="lobby__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice !== null) void onClaim(choice, password, name);
        }}
      >
        {choice !== null && choice !== "table" ? (
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="field__input"
              value={name}
              maxLength={16}
              placeholder={`Seat ${(choice as number) + 1}`}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : null}
        <label className="field">
          <span className="field__label">Table password</span>
          <input
            className="field__input"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={choice === null || busy}>
          {choice === "table" ? "Open the table" : "Sit down"}
        </button>
      </form>

      {error ? <p className="lobby__error">{error}</p> : null}
    </div>
  );
}
