"use client";

import { useMemo, useState } from "react";
import type { RoomView } from "@/game/room";
import { suggestName } from "@/game/names";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";

interface Props {
  view: RoomView;
  onClaim: (seat: Seat | "table", name: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}

/** Pick a seat and sit down. There is nothing else to get past. */
export function SeatPicker({ view, onClaim, busy, error }: Props) {
  const [choice, setChoice] = useState<Seat | "table" | null>(null);

  const taken = (seat: Seat) => view.players[seat].occupant.kind === "human";
  const namesInUse = view.players
    .map((p) => p.occupant.name)
    .filter((n): n is string => n !== null);

  // Arrive with a name already in the box, so sitting down is one tap. It is
  // seeded once per visit rather than per render, or every keystroke elsewhere
  // in the form would deal a new one.
  const [name, setName] = useState(() => suggestName(namesInUse));
  const reroll = useMemo(
    () => () => setName(suggestName([...namesInUse, name])),
    [namesInUse, name],
  );

  return (
    <div className="lobby">
      <h1 className="lobby__title">Take a seat</h1>
      <p className="lobby__lead">
        Everyone plays at the same table. Any seat still open when the table deals is played by
        the computer, and the tablet in the middle takes the Table seat.
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
          if (choice !== null) void onClaim(choice, name);
        }}
      >
        {choice !== null && choice !== "table" ? (
          <label className="field">
            <span className="field__label">Your name</span>
            <span className="field__row">
              <input
                className="field__input"
                value={name}
                maxLength={16}
                placeholder={`Seat ${(choice as number) + 1}`}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                title="Suggest another name"
                aria-label="Suggest another name"
                onClick={reroll}
              >
                ↻
              </button>
            </span>
          </label>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={choice === null || busy}>
          {choice === "table" ? "Open the table" : "Sit down"}
        </button>
      </form>

      {error ? <p className="lobby__error">{error}</p> : null}
    </div>
  );
}
