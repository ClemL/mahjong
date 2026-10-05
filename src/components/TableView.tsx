"use client";

import type { PublicPlayer, RoomView } from "@/game/room";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { TileBack, TileFace } from "./TileView";
import { MeldRow, isFreshClaim } from "./SeatPanel";

/** Where each seat sits relative to the tablet lying on the table. */
const EDGE: Record<Seat, "top" | "right" | "bottom" | "left"> = {
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
  edge: "top" | "right" | "bottom" | "left";
}) {
  const seat = player.seat;
  const lastId = view.lastDiscard?.tile.id;
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
            <MeldRow key={i} meld={m} fresh={isFreshClaim(m, view.lastPlayed?.tile.id)} />
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

      {/* This player's pond, on the edge of their block facing the middle —
          where their tiles would actually land at a real table. */}
      <div className={`tpond tpond--${edge}`}>
        {player.discards.length === 0 ? (
          <span className="seat__meta">no discards yet</span>
        ) : (
          player.discards.map((t) => (
            <TileFace
              key={t.id}
              code={t.code}
              size="sm"
              entry="toss"
              tossFrom={edge}
              justDiscarded={t.id === lastId}
              dim={t.id !== lastId}
            />
          ))
        )}
      </div>
    </section>
  );
}

export interface SoundToggle {
  muted: boolean;
  setMuted: (value: boolean) => void;
}

/**
 * The whole table on one screen, for a phone when no tablet is acting as the
 * table: the ponds, everyone's melds, flowers and scores — never anyone's
 * concealed tiles, which the server does not send. It only mirrors the table;
 * the tablet's own screen is `TableTop`.
 */
export function TableView({ view }: { view: RoomView }) {
  const seats: Seat[] = [0, 1, 2, 3];

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
      </header>

      <div className="tableview__grid">
        {seats.map((seat) => (
          <SeatBlock key={seat} player={view.players[seat]} view={view} edge={EDGE[seat]} />
        ))}

        <div className="tableview__middle">
          <span className="pond__round">{tileGlyph(view.roundWind)}</span>
          <span className="pond__wall">{view.wallCount} tiles left</span>
          <span className="seat__meta">
            {view.phase === "handOver"
              ? "hand over"
              : view.phase === "gameOver"
                ? "round complete"
                : `${SEAT_NAMES[view.turn]} to play`}
          </span>
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
