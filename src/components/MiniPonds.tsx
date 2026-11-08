"use client";

import { type CSSProperties, Fragment } from "react";
import type { PublicPlayer } from "@/game/room";
import {
  SEAT_NAMES,
  type Seat,
  type Tile,
  isHonor,
  seatWind,
  sortTiles,
  suitOf,
  tileGlyph,
  tileName,
} from "@/game/tiles";
import type { PondOrder } from "@/hooks/useLocalSetting";
import { TileFace } from "./TileView";

const ORDERS: { value: PondOrder; label: string }[] = [
  { value: "thrown", label: "As thrown" },
  { value: "sorted", label: "By suit" },
  { value: "pooled", label: "By tile" },
];

/** The four rows of the pooled view: one a suit, then the honours together. */
const GROUPS = [
  { key: "m", glyph: "萬", name: "Characters", holds: (t: Tile) => suitOf(t.code) === "m" },
  { key: "p", glyph: "筒", name: "Dots", holds: (t: Tile) => suitOf(t.code) === "p" },
  { key: "s", glyph: "索", name: "Bamboo", holds: (t: Tile) => suitOf(t.code) === "s" },
  { key: "z", glyph: "字", name: "Honours", holds: (t: Tile) => isHonor(t.code) },
] as const;

/** The space between one tile and the next kind in a pooled row, in tile widths, as ponds.css draws it. */
const KIND_BREAK = 0.3;

/** Each pooled row's tiles, ordered by suit and number so every copy of a tile sits together. */
function pooledRows(players: PublicPlayer[]): Tile[][] {
  const all = sortTiles(players.flatMap((p) => p.discards));
  return GROUPS.map((group) => all.filter(group.holds));
}

/** How many tiles wide the longest row is, breaks and claimed spaces included, which sets the tile size. */
function longestRow(players: PublicPlayer[], order: PondOrder, pooled: Tile[][] | null): number {
  if (pooled) {
    return Math.max(
      1,
      ...pooled.map((tiles) => tiles.length + KIND_BREAK * Math.max(0, new Set(tiles.map((t) => t.code)).size - 1)),
    );
  }
  return Math.max(1, ...players.map((p) => p.discards.length + (order === "thrown" ? (p.taken?.length ?? 0) : 0)));
}

/**
 * Everyone's discards, for a phone that wants them in hand rather than
 * looking up at the table. As thrown, each pond keeps its order and the spaces
 * where tiles were claimed, as on the table. With the helper on, two more
 * orders count what has gone: by suit, each person's pond is laid out by suit
 * and number; by tile, nobody's name is kept, and every discard at the table
 * is pooled into a row a suit, each tile beside its copies.
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
  /** Present when the player may sort the discards — the helper is on. Without it they stay as thrown. */
  onOrder?: (order: PondOrder) => void;
  nameOf: (seat: Seat) => string;
  /** Present when the ponds were opened over the controls, to put them away again. */
  onClose?: () => void;
}) {
  const shown: PondOrder = onOrder ? order : "thrown";
  const pooled = shown === "pooled" ? pooledRows(players) : null;
  const seats = [0, 1, 2, 3].map((step) => ((you + step) % 4) as Seat);
  return (
    <section
      className={onClose ? "minipond minipond--sheet" : "minipond"}
      aria-label="Everyone's discards"
      data-order={shown}
      style={{ "--most": longestRow(players, shown, pooled) } as CSSProperties}
    >
      <header className="minipond__head">
        <h2 className="minipond__title">Discards</h2>
        {onOrder ? (
          <div className="minipond__order" role="group" aria-label="Discard order">
            {ORDERS.map((o) => (
              <button
                key={o.value}
                type="button"
                className="minipond__order-btn"
                aria-pressed={shown === o.value}
                onClick={() => onOrder(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
        {onClose ? (
          <button type="button" className="minipond__close" aria-label="Close the discards" onClick={onClose}>
            ×
          </button>
        ) : null}
      </header>
      <ol className="minipond__rows">
        {pooled
          ? pooled.map((tiles, i) => (
              <SuitRow key={GROUPS[i].key} group={GROUPS[i]} tiles={tiles} newestId={newestId} />
            ))
          : seats.map((seat) => (
              <PondRow
                key={seat}
                player={players[seat]}
                mine={seat === you}
                newestId={newestId}
                order={shown}
                nameOf={nameOf}
              />
            ))}
      </ol>
    </section>
  );
}

function PondTile({ tile, newestId, className = "" }: { tile: Tile; newestId: string | null; className?: string }) {
  return (
    <span
      className={["minipond__tile", tile.id === newestId ? "minipond__tile--newest" : "", className].filter(Boolean).join(" ")}
    >
      <TileFace code={tile.code} size="sm" />
    </span>
  );
}

/** One suit's discards from everyone at the table, each tile together with its copies. */
function SuitRow({
  group,
  tiles,
  newestId,
}: {
  group: (typeof GROUPS)[number];
  tiles: Tile[];
  newestId: string | null;
}) {
  // Read out as counts, which is what the row is for: "2 × 5 Dots".
  const kinds = [...new Set(tiles.map((t) => t.code))];
  const said = `${group.name} discarded: ${
    tiles.length === 0
      ? "none yet"
      : kinds
          .map((code) => {
            const copies = tiles.filter((t) => t.code === code);
            const newest = copies.some((t) => t.id === newestId) ? " (newest)" : "";
            return `${copies.length > 1 ? `${copies.length} × ` : ""}${tileName(code)}${newest}`;
          })
          .join(", ")
  }`;
  return (
    <li className="minipond__row minipond__row--suit">
      <span className="sr-only">{said}</span>
      <span className="minipond__who" aria-hidden>
        <span className="minipond__wind">{group.glyph}</span>
        <span className="minipond__name">{group.name}</span>
      </span>
      <span className="minipond__tiles" aria-hidden>
        {tiles.length === 0 ? <span className="minipond__none">—</span> : null}
        {tiles.map((t, i) => (
          <PondTile
            key={t.id}
            tile={t}
            newestId={newestId}
            className={i > 0 && tiles[i - 1].code !== t.code ? "minipond__tile--kind" : ""}
          />
        ))}
      </span>
    </li>
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
    order !== "thrown"
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
            <PondTile tile={t} newestId={newestId} />
          </Fragment>
        ))}
        {gapsAt(tiles.length)}
      </span>
    </li>
  );
}
