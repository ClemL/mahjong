"use client";

import type { PublicPlayer, RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { MIN_FAAN_CHOICES } from "@/game/rules";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { TileBack, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import { useWakeLock } from "@/hooks/useWakeLock";

/** Where each seat sits relative to the tablet lying on the table. */
const EDGE: Record<Seat, string> = {
  0: "bottom",
  1: "right",
  2: "top",
  3: "left",
};

function SeatBlock({
  player,
  view,
  edge,
}: {
  player: PublicPlayer;
  view: RoomView;
  edge: string;
}) {
  const seat = player.seat;
  const active = view.turn === seat && view.phase === "action";
  const deciding = view.awaitingClaimSeats.includes(seat);
  const score = view.scores[seat];
  return (
    <section
      className={[
        "tseat",
        `tseat--${edge}`,
        active ? "tseat--active" : "",
        deciding ? "tseat--deciding" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="tseat__head">
        <span className="tseat__wind">{tileGlyph(seatWind(seat))}</span>
        <span className="tseat__name">
          {player.occupant.kind === "human"
            ? player.occupant.name
            : player.occupant.kind === "ai"
              ? "Computer"
              : "Open"}
        </span>
        {player.occupant.away ? (
          <span className="tseat__away" title="No response — the computer is playing this seat">
            away
          </span>
        ) : null}
        <span className="tseat__seatno">Seat {seat + 1} · {SEAT_NAMES[seat]}</span>
        {view.dealer === seat ? <span className="seat__badge">Dealer</span> : null}
        <span
          className={`tseat__score${score > 0 ? " seat__score--pos" : score < 0 ? " seat__score--neg" : ""}`}
        >
          {score > 0 ? `+${score}` : score}
        </span>
      </header>

      <div className="tseat__hand" aria-label={`${player.handCount} tiles in hand`}>
        {Array.from({ length: player.handCount }, (_, i) => (
          <TileBack key={i} size="sm" />
        ))}
        <span className="tseat__count">{player.handCount}</span>
      </div>

      {player.melds.length > 0 ? (
        <div className="seat__row">
          {player.melds.map((m, i) => (
            <MeldRow key={i} meld={m} />
          ))}
        </div>
      ) : null}

      {player.flowers.length > 0 ? (
        <div className="seat__row tseat__flowers">
          {player.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" />
          ))}
        </div>
      ) : null}

      {deciding ? <span className="tseat__deciding">deciding…</span> : null}
    </section>
  );
}

/**
 * The shared tablet. It shows the pond, everyone's melds, flowers and scores,
 * and which seat belongs on which edge — never anyone's concealed tiles, which
 * the server does not send here at all.
 */
export interface SoundToggle {
  muted: boolean;
  setMuted: (value: boolean) => void;
}

export function TableView({
  api,
  view,
  sound,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
}) {
  const lastId = view.lastDiscard?.tile.id;
  const seats: Seat[] = [0, 1, 2, 3];
  // Only the shared table holds the screen awake; a phone in a pocket should
  // be allowed to sleep.
  const wakeLock = useWakeLock(view.you.role === "table");

  return (
    <div className="tableview">
      <header className="tableview__bar">
        <span className="tableview__code">Room {view.roomId}</span>
        <span className="stat__value">
          {tileGlyph(view.roundWind)} East · hand {view.handNumber}
        </span>
        <span className="seat__meta">{view.wallCount} tiles left</span>
        <span className="seat__meta">
          {view.phase === "handOver"
            ? "Hand over"
            : view.phase === "gameOver"
              ? "Round complete"
              : `${SEAT_NAMES[view.turn]} to play`}
        </span>
        {view.you.role === "table" && wakeLock !== "held" ? (
          <span className="tableview__wake" title="This device may sleep during a hand">
            {wakeLock === "unsupported"
              ? "Screen may sleep — this browser cannot keep it awake"
              : wakeLock === "denied"
                ? "Screen may sleep — the browser refused to keep it awake"
                : "Screen lock pending…"}
          </span>
        ) : null}
        <span className="topbar__spacer" />
        <div className="actions">
          <label className="field">
            <span className="field__label">Min faan</span>
            <select
              className="field__select"
              value={view.config.minFaan}
              onChange={(e) => void api.control({ type: "minFaan", value: Number(e.target.value) })}
            >
              {MIN_FAAN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {view.phase === "handOver" ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={api.busy}
              onClick={() => void api.control({ type: "nextHand" })}
            >
              Next hand
            </button>
          ) : null}
          {view.awaitingClaimSeats.length > 0 ? (
            <button
              type="button"
              className="btn"
              disabled={api.busy}
              onClick={() => void api.control({ type: "forcePass" })}
            >
              Skip waiting ({view.awaitingClaimSeats.length})
            </button>
          ) : null}
          {sound ? (
            <button
              type="button"
              className="btn btn--ghost"
              aria-pressed={!sound.muted}
              onClick={() => sound.setMuted(!sound.muted)}
            >
              {sound.muted ? "Sound off" : "Sound on"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={api.busy}
            onClick={() => void api.control({ type: "redeal" })}
          >
            Redeal
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={api.busy}
            onClick={() => {
              if (confirm("Restart the game and reset all scores?")) {
                void api.control({ type: "restart" });
              }
            }}
          >
            Restart
          </button>
        </div>
      </header>

      <div className="tableview__grid">
        {seats.map((seat) => (
          <SeatBlock key={seat} player={view.players[seat]} view={view} edge={EDGE[seat]} />
        ))}

        <div className="tableview__pond">
          <div className="pond__center">
            <span className="pond__round">{tileGlyph(view.roundWind)}</span>
            <span className="pond__wall">{view.wallCount} left</span>
          </div>
          {seats.map((seat) => (
            <div className="pond__group" key={seat}>
              <span className="pond__group-label">
                Seat {seat + 1} · {SEAT_NAMES[seat]}
              </span>
              <div
                className={`pond__row${view.players[seat].discards.length === 0 ? " pond__row--empty" : ""}`}
              >
                {view.players[seat].discards.length === 0 ? (
                  <span className="seat__meta">—</span>
                ) : (
                  view.players[seat].discards.map((t) => (
                    <TileFace
                      key={t.id}
                      code={t.code}
                      size="sm"
                      entry="toss"
                      tossFrom={
                        (["bottom", "right", "top", "left"] as const)[seat]
                      }
                      justDiscarded={t.id === lastId}
                      dim={t.id !== lastId}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {view.result && view.phase !== "action" ? (
        <div className="tableview__result">
          {view.result.type === "washout" ? (
            <strong>Washed-out hand 流局</strong>
          ) : (
            <>
              <strong>
                {SEAT_NAMES[view.result.winner!]} wins — {view.result.score!.faan} faan,{" "}
                {view.result.score!.value} points
              </strong>
              <span className="seat__meta">
                {view.result.from === null
                  ? "self-drawn 自摸"
                  : `off ${SEAT_NAMES[view.result.from]}`}
                {view.lastDiscard ? ` · ${tileName(view.lastDiscard.tile.code)}` : ""}
              </span>
            </>
          )}
        </div>
      ) : null}

      <footer className="tableview__seating">
        <span className="seat__meta">Seating —</span>
        {seats.map((seat) => (
          <span className="tableview__seatinfo" key={seat}>
            <b>Seat {seat + 1}</b> {SEAT_NAMES[seat]} · {EDGE[seat]} edge
            {view.players[seat].occupant.kind === "human"
              ? ` · ${view.players[seat].occupant.name}`
              : view.players[seat].occupant.kind === "ai"
                ? " · computer"
                : " · open"}
          </span>
        ))}
      </footer>
    </div>
  );
}
