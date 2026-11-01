"use client";

import { Fragment } from "react";
import type { PublicPlayer } from "@/game/room";
import { SEAT_NAMES, type Seat, type Tile, seatWind, sortTiles, tileGlyph, tileName } from "@/game/tiles";
import type { PondOrder } from "@/hooks/useLocalSetting";
import { TileFace } from "./TileView";

const ORDERS: { value: PondOrder; label: string }[] = [
  { value: "thrown", label: "As thrown" },
  { value: "sorted", label: "By suit" },
];

/**
 * Everyone's discards, small, for a phone that wants them in hand rather than
 * looking up at the table. As thrown, each pond keeps its order and the spaces
 * where tiles were claimed, as on the table; by suit, each is laid out by suit
 * and number, which is how you count what has gone.
 *
 * One row a person, starting with you and going round in the order of play,
 * so the person whose discards you can chow is always the last row.
 */
export function MiniPonds({
  players,
  you,
  newestId,
  order,
  onOrder,
  nameOf,
  onClose,
}: {
  players: PublicPlayer[];
  you: Seat;
  /** The newest discard at the table, marked wherever it lies. */
  newestId: string | null;
  order: PondOrder;
  onOrder: (order: PondOrder) => void;
  nameOf: (seat: Seat) => string;
  /** Present when the ponds were opened over the controls, to put them away again. */
  onClose?: () => void;
}) {
  const seats = [0, 1, 2, 3].map((step) => ((you + step) % 4) as Seat);
  return (
    <section
      className={onClose ? "minipond minipond--sheet" : "minipond"}
      aria-label="Everyone's discards"
      data-order={order}
    >
      <header className="minipond__head">
        <h2 className="minipond__title">Discards</h2>
        <div className="minipond__order" role="group" aria-label="Discard order">
          {ORDERS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="minipond__order-btn"
              aria-pressed={order === o.value}
              onClick={() => onOrder(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {onClose ? (
          <button type="button" className="minipond__close" aria-label="Close the discards" onClick={onClose}>
            ×
          </button>
        ) : null}
      </header>
      <ol className="minipond__rows">
        {seats.map((seat) => (
          <PondRow
            key={seat}
            player={players[seat]}
            mine={seat === you}
            newestId={newestId}
            order={order}
            nameOf={nameOf}
          />
        ))}
      </ol>
    </section>
  );
}

function PondRow({
  player,
  mine,
  newestId,
  order,
  nameOf,
}: {
  player: PublicPlayer;
  mine: boolean;
  newestId: string | null;
  order: PondOrder;
  nameOf: (seat: Seat) => string;
}) {
  const seat = player.seat;
  const name = nameOf(seat);
  const tiles = order === "sorted" ? sortTiles(player.discards) : player.discards;
  // Only the order thrown has a place for a claimed tile to have left.
  const gapsAt = (i: number) =>
    order === "sorted"
      ? null
      : (player.taken ?? [])
          .map((gap, n) => ({ ...gap, n }))
          .filter((gap) => gap.at === i)
          .map((gap) => (
            <span
              key={`gap-${gap.n}`}
              className="minipond__gap"
              title={`Taken by ${nameOf(gap.by)}`}
            >
              {tileGlyph(seatWind(gap.by))}
            </span>
          ));
  const tile = (t: Tile) => (
    <span key={t.id} className={t.id === newestId ? "minipond__tile minipond__tile--newest" : "minipond__tile"}>
      <TileFace code={t.code} size="sm" />
    </span>
  );
  // Read out whole, since the tiles themselves are drawn for the eye.
  const taken = player.taken?.length ?? 0;
  const said = `${mine ? "Your" : `${name}'s`} discards, ${SEAT_NAMES[seat]}: ${
    tiles.length === 0
      ? "none yet"
      : tiles.map((t) => `${tileName(t.code)}${t.id === newestId ? " (newest)" : ""}`).join(", ")
  }${taken > 0 ? `; ${taken} taken by others` : ""}`;

  return (
    <li className={mine ? "minipond__row minipond__row--mine" : "minipond__row"}>
      <span className="sr-only">{said}</span>
      <span className="minipond__who" aria-hidden>
        <span className="minipond__wind">{tileGlyph(seatWind(seat))}</span>
        <span className="minipond__name">{mine ? "You" : name}</span>
      </span>
      <span className="minipond__tiles" aria-hidden>
        {tiles.length === 0 ? <span className="minipond__none">—</span> : null}
        {tiles.map((t, i) => (
          <Fragment key={t.id}>
            {gapsAt(i)}
            {tile(t)}
          </Fragment>
        ))}
        {gapsAt(tiles.length)}
      </span>
    </li>
  );
}
