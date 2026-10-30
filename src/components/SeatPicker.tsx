"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type RoomView, openSeatName, robotName, seatedNames } from "@/game/room";
import { suggestName } from "@/game/names";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";
import { tableName } from "@/game/tables";

interface Props {
  view: RoomView;
  /** The chair a scanned code asked for, if it is still free to sit in, or the table a tablet came to open. */
  picked?: Seat | "table" | null;
  /**
   * `replace` takes over a table already open on another device. Resolves
   * true once seated, false if refused — the reason then comes in `error`.
   */
  onClaim: (seat: Seat | "table", name: string, replace?: boolean) => Promise<boolean>;
  /** Empty the room, table included. */
  onReset: () => void;
  busy: boolean;
  error: string | null;
}

/** Pick a seat and sit down. There is nothing else to get past. */
export function SeatPicker({ view, picked = null, onClaim, onReset, busy, error }: Props) {
  const taken = (seat: Seat) => view.players[seat].occupant.kind === "human";
  // What a chair is called if nobody types a name. People keep theirs when
  // they change chairs, so this is a default nobody is already using.
  const openName = (seat: Seat) => openSeatName(seatedNames(view.players.map((p) => p.occupant)), seat);
  // Somebody may have sat down there between the code being shown and scanned.
  const arrived = picked !== null && picked !== "table" && !taken(picked) ? picked : null;
  const [chosen, setChoice] = useState<Seat | "table" | null>(picked === "table" ? "table" : arrived);
  // From the tap until the chair is ours, so the chair filling with this
  // phone in it does not read as somebody else beating it there.
  const [sitting, setSitting] = useState(false);
  // Or while this phone was still typing a name: the chair is gone, and
  // sitting down would only be refused.
  const lost = !sitting && typeof chosen === "number" && taken(chosen) ? chosen : null;
  const choice = lost === null ? chosen : null;
  const takingOver = choice === "table" && view.tablePresent;

  // Arriving from a chair's code, naming yourself is all that is left to do.
  // Focused without scrolling, so the line saying whose chair it is stays in view.
  const nameBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (arrived !== null) nameBox.current?.focus({ preventScroll: true });
    // Only on arrival: a later tap on another chair is the person's own choice.
  }, []);
  const namesInUse = view.players
    .map((p) => p.occupant.name)
    .filter((n): n is string => n !== null);

  // The box starts empty and sitting down is still one tap: a chair nobody
  // names goes by a default (Calvin, Louis, Hanna, Clem) nobody else is using,
  // shown as the placeholder. The dice button offers a suggestion instead.
  const [name, setName] = useState("");
  const reroll = useMemo(
    () => () => setName(suggestName([...namesInUse, name])),
    [namesInUse, name],
  );

  return (
    <div className="lobby">
      <h1 className="lobby__title">Take a seat at {tableName(view.roomId)}</h1>
      {/* Dropping back here without a word reads as the app losing the seat. */}
      {view.tableTakenOver ? (
        <p className="lobby__warn" role="status">
          Another device took over the table, with the game as it stands. Choose Table to take it back, or pick a
          seat.
        </p>
      ) : null}
      {view.displacedFrom !== null ? (
        <p className="lobby__warn" role="status">
          {view.displacedByTable
            ? `The table gave seat ${view.displacedFrom + 1}, ${SEAT_NAMES[view.displacedFrom]}, to the computer.`
            : `Somebody else scanned the code for seat ${view.displacedFrom + 1}, ${SEAT_NAMES[view.displacedFrom]}, and took your place.`}{" "}
          Pick a seat to sit back down.
        </p>
      ) : null}
      {arrived !== null && choice === arrived ? (
        <p className="lobby__warn" role="status">
          {view.players[arrived].occupant.kind === "ai"
            ? `You are taking over ${view.players[arrived].occupant.name} at seat ${arrived + 1}, ${SEAT_NAMES[arrived]}, hand and all.`
            : `Seat ${arrived + 1}, ${SEAT_NAMES[arrived]}, is yours.`}{" "}
          Type your name and sit down.
        </p>
      ) : null}
      {lost !== null ? (
        <p className="lobby__warn" role="status">
          {view.players[lost].occupant.name} just sat down at {SEAT_NAMES[lost]}. Pick another seat.
        </p>
      ) : null}
      <p className="lobby__lead">
        Everyone here plays at the same table. Any seat still open when the table deals is played by
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
            {taken(seat) ? (
              <span className="seat-card__state">{view.players[seat].occupant.name}</span>
            ) : (
              // An empty chair goes by its own name; it is only Robot <name>
              // while the computer is actually playing it.
              <span className="seat-card__state seat-card__state--open">
                {view.players[seat].occupant.kind === "ai"
                  ? `${view.players[seat].occupant.name ?? robotName(seat)} — sit in`
                  : openName(seat)}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className={`seat-card seat-card--table${choice === "table" ? " seat-card--on" : ""}`}
          aria-pressed={choice === "table"}
          onClick={() => setChoice("table")}
        >
          <span className="seat-card__wind">🀄</span>
          <span className="seat-card__name">Table</span>
          <span className="seat-card__state">
            {view.tablePresent
              ? view.tableAway
                ? "Not seen lately · take over"
                : "Open elsewhere · take over"
              : "For the shared tablet"}
          </span>
        </button>
      </div>

      <form
        className="lobby__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice === null) return;
          setSitting(true);
          void onClaim(choice, name, takingOver).then((sat) => {
            if (!sat) setSitting(false);
          });
        }}
      >
        {takingOver ? (
          <p className="lobby__warn" role="status">
            {view.tableAway
              ? "The table is held by a device that has not been seen for over a minute."
              : "The table is open on another device right now."}{" "}
            Taking it over moves it here with the game as it stands — hands, scores and house rules — and that
            device goes back to choosing a seat.
          </p>
        ) : null}
        {choice !== null && choice !== "table" ? (
          <label className="field">
            <span className="field__label">Your name</span>
            <span className="field__row">
              <input
                className="field__input"
                value={name}
                ref={nameBox}
                maxLength={16}
                placeholder={openName(choice)}
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
        <button type="submit" className="btn btn--primary" disabled={choice === null || busy || sitting}>
          {takingOver ? "Take over the table" : choice === "table" ? "Open the table" : "Sit down"}
        </button>
      </form>

      {/* For a new group sitting down to what is left of the last one's game.
          A table stuck on a device that has gone is taken over above instead,
          which keeps the game. */}
      {view.tablePresent || view.seatedCount > 0 || view.started ? (
        <div className="lobby__reset">
          <span className="seat__meta">Starting over with new people?</span>
          <button
            type="button"
            className="btn btn--ghost btn--reset"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Reset ${tableName(view.roomId)}? Everyone at it — the players and the table screen — goes back to choosing a seat, and the scores and house rules go back to the defaults.`,
                )
              ) {
                onReset();
              }
            }}
          >
            Reset table
          </button>
        </div>
      ) : null}

      {error ? <p className="lobby__error">{error}</p> : null}
    </div>
  );
}
