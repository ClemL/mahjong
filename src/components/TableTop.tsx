"use client";

import { type CSSProperties, useRef } from "react";
import type { PublicPlayer, RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { useAppearance } from "@/hooks/useAppearance";
import { useCountdown } from "@/hooks/useCountdown";
import { useElementSize } from "@/hooks/useElementSize";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import { TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import { SettingsMenu } from "./SettingsMenu";
import { TableSettings } from "./TableSettings";
import type { SoundToggle } from "./TableView";
import {
  POSITION_ROTATION,
  type TableLayout,
  layoutTable,
  placementStyle,
  positionOf,
} from "./tableLayout";

const SEATS: Seat[] = [0, 1, 2, 3];

/** Ponds are sized for a full hand's worth from the start, so tiles do not shrink as it fills. */
const POND_CAPACITY = 24;

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

function occupantName(player: PublicPlayer): string {
  if (player.occupant.kind === "human") return player.occupant.name ?? "Player";
  return player.occupant.kind === "ai" ? "Computer" : "Open";
}

/** Who a seat is in a sentence: a person by name, the computer by its wind. */
function seatLabel(player: PublicPlayer): string {
  return player.occupant.kind === "human" ? occupantName(player) : SEAT_NAMES[player.seat];
}

function signed(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

/**
 * One seat's rack along its own edge, turned to read the right way up from
 * that chair: who is sitting there, how many tiles they hold, and everything
 * they have laid open.
 */
function Rack({
  player,
  view,
  layout,
  position,
}: {
  player: PublicPlayer;
  view: RoomView;
  layout: TableLayout;
  position: number;
}) {
  const seat = player.seat;
  const active = view.turn === seat && view.phase === "action";
  const deciding = view.awaitingClaimSeats.includes(seat);
  const score = view.scores[seat];
  // Only the seat to play has a clock running, and only when the table set one.
  const left = useCountdown(active ? view.turnDeadlineIn : null);
  const status = deciding
    ? "deciding…"
    : active
      ? left !== null
        ? `to play · ${Math.ceil(left / 1000)}s${view.turnExtended ? " · more time" : ""}`
        : "to play"
      : player.occupant.away
        ? "away"
        : null;
  const style: Vars = {
    ...placementStyle(layout.racks[position]),
    "--tile-sm": `${layout.rackTiles[position]}px`,
  };

  return (
    <section
      className={["rack", active ? "rack--active" : "", deciding ? "rack--deciding" : ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={`${SEAT_NAMES[seat]}: ${occupantName(player)}, ${player.handCount} tiles in hand`}
    >
      <span className="rack__wind" aria-hidden>
        {tileGlyph(seatWind(seat))}
      </span>
      <span className="rack__who">
        <span className="rack__name">
          <span className="rack__name-text">{occupantName(player)}</span>
          {view.dealer === seat ? <span className="seat__badge">Dealer</span> : null}
        </span>
        <span className="rack__meta">
          {SEAT_NAMES[seat]} ·{" "}
          <b className={score > 0 ? "seat__score--pos" : score < 0 ? "seat__score--neg" : ""}>
            {signed(score)}
          </b>
        </span>
      </span>
      {/* A tile back with the count on it: how close this seat is to going
          out is the thing people glance at most. */}
      <span className="rack__count" title={`${player.handCount} tiles in hand`}>
        {player.handCount}
      </span>
      <div className="rack__open">
        {player.melds.map((meld, i) => (
          <MeldRow key={i} meld={meld} />
        ))}
        {player.flowers.length > 0 ? (
          <span className="meld rack__flowers">
            {player.flowers.map((t) => (
              <TileFace key={t.id} code={t.code} size="sm" />
            ))}
          </span>
        ) : null}
      </div>
      {status ? <span className="rack__status">{status}</span> : null}
    </section>
  );
}

/** A seat's discards, laid in front of them and facing them. */
function Discards({
  player,
  layout,
  position,
  lastId,
}: {
  player: PublicPlayer;
  layout: TableLayout;
  position: number;
  lastId: string | undefined;
}) {
  const style: Vars = {
    ...placementStyle(layout.ponds[position]),
    "--tile-md": `${layout.tile}px`,
    gap: layout.gap,
  };
  return (
    <div className="discards" style={style} aria-label={`${SEAT_NAMES[player.seat]} discards`}>
      {player.discards.map((t) => (
        <TileFace
          key={t.id}
          code={t.code}
          size="md"
          // Drawn in the owner's frame, so "bottom" is always their side.
          entry="toss"
          tossFrom="bottom"
          justDiscarded={t.id === lastId}
        />
      ))}
    </div>
  );
}

/**
 * The middle of the table, like the console of an automatic table: each
 * seat's wind on its own side, lit for whoever is to play, and the tile just
 * thrown, turned to face the player who threw it. It is drawn the same size
 * as the ponds — the middle says which tile, not that it matters more.
 */
function Console({
  api,
  view,
  layout,
  position,
}: {
  api: RoomApi;
  view: RoomView;
  layout: TableLayout;
  position: (seat: Seat) => number;
}) {
  const style: Vars = {
    ...placementStyle(layout.console),
    "--tile-lg": `${layout.tile}px`,
  };
  const played = view.lastPlayed;
  // A claimed discard has left its pond for somebody's meld.
  const claimed =
    played !== null && !view.players[played.from].discards.some((t) => t.id === played.tile.id);
  const over = view.phase === "handOver" || view.phase === "gameOver";

  return (
    <div className={`console${over ? " console--over" : ""}`} style={style}>
      {over ? null : (
        SEATS.map((seat) => {
          const active = view.turn === seat && view.phase === "action";
          const deciding = view.awaitingClaimSeats.includes(seat);
          return (
            <span
              key={seat}
              className={[
                "console__wind",
                `console__wind--${position(seat)}`,
                active ? "console__wind--active" : "",
                deciding ? "console__wind--deciding" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={SEAT_NAMES[seat]}
            >
              {tileGlyph(seatWind(seat))}
            </span>
          );
        })
      )}

      {over ? (
        <div className="console__result" role="status">
          {view.result?.type === "win" && view.result.winner !== null && view.result.score ? (
            <>
              <strong className="console__headline">
                {seatLabel(view.players[view.result.winner])} wins
              </strong>
              <span>
                {view.result.score.faan} faan · {view.result.score.value} points
              </span>
              <span className="seat__meta">
                {view.result.from === null
                  ? "self-drawn 自摸"
                  : `off ${seatLabel(view.players[view.result.from])}`}
              </span>
            </>
          ) : (
            <strong className="console__headline">Washed-out hand 流局</strong>
          )}
          {view.phase === "handOver" ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={api.busy}
              onClick={() => void api.control({ type: "nextHand" })}
            >
              Next hand
            </button>
          ) : (
            <span className="seat__meta">Round complete — Restart to play again</span>
          )}
        </div>
      ) : (
        <div className="console__middle">
          {played ? (
            <>
              <span
                className="console__spot"
                key={played.tile.id}
                style={{ transform: `rotate(${POSITION_ROTATION[position(played.from)]}deg)` }}
              >
                <TileFace
                  code={played.tile.code}
                  size="lg"
                  entry="toss"
                  tossFrom="bottom"
                  dim={claimed}
                />
              </span>
              <span className="console__caption">
                {SEAT_NAMES[played.from]} · {tileName(played.tile.code)}
                {claimed ? " · claimed" : ""}
              </span>
            </>
          ) : (
            <span className="console__caption">
              {view.phase === "action" ? `${SEAT_NAMES[view.turn]} to play` : " "}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The shared tablet, drawn as the table itself. The felt is the screen: a
 * rack along each edge for the seat sitting there, every pond in front of its
 * owner, and the last discard in the middle. Concealed tiles are never on it —
 * the server does not send them to this device at all.
 */
export function TableTop({ api, view, sound }: { api: RoomApi; view: RoomView; sound?: SoundToggle }) {
  const wakeLock = useWakeLock(true);
  const appearance = useAppearance();
  const fullscreen = useFullscreen();
  const felt = useRef<HTMLDivElement>(null);
  const size = useElementSize(felt);

  const position = (seat: Seat) => positionOf(seat, view.settings.rotation);
  // The solver thinks in screen positions; the rack sizes come from whoever sits there.
  const bySeatAtPosition = <T,>(value: (seat: Seat) => T): T[] =>
    [0, 1, 2, 3].map((pos) => value(SEATS.find((seat) => position(seat) === pos)!));

  // A few thousand comparisons; cheaper to redo on each new view than to memoise.
  const layout = layoutTable({
    width: size.width,
    height: size.height,
    capacity: Math.max(POND_CAPACITY, ...view.players.map((p) => p.discards.length)),
    revealed: bySeatAtPosition((seat) => {
      const p = view.players[seat];
      return p.melds.reduce((n, m) => n + m.tiles.length, 0) + p.flowers.length;
    }),
    groups: bySeatAtPosition((seat) => {
      const p = view.players[seat];
      return p.melds.length + (p.flowers.length > 0 ? 1 : 0);
    }),
  });
  const lastId = view.lastPlayed?.tile.id;

  return (
    <div className="tabletop">
      <header className="tabletop__bar">
        <span className="tableview__code">Room {view.roomId}</span>
        <span className="stat__value">
          {tileGlyph(view.roundWind)} East · hand {view.handNumber}
        </span>
        <span className="seat__meta">{view.wallCount} tiles left</span>
        {wakeLock !== "held" ? (
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
          {view.phase === "handOver" ? (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={api.busy}
              onClick={() => void api.control({ type: "nextHand" })}
            >
              Next hand
            </button>
          ) : null}
          {view.awaitingClaimSeats.length > 0 ? (
            <button
              type="button"
              className="btn btn--sm"
              disabled={api.busy}
              onClick={() => void api.control({ type: "forcePass" })}
            >
              Skip waiting ({view.awaitingClaimSeats.length})
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--sm"
            disabled={api.busy}
            onClick={() => void api.control({ type: "redeal" })}
          >
            Redeal
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={api.busy}
            onClick={() => {
              if (confirm("Reset all scores and go back to the seating screen?")) {
                void api.control({ type: "restart" });
              }
            }}
          >
            Restart
          </button>
          {fullscreen.supported && !fullscreen.active ? (
            <button type="button" className="btn btn--sm btn--ghost" onClick={fullscreen.enter}>
              Full screen
            </button>
          ) : null}
          <SettingsMenu>
            <TableSettings api={api} view={view} sound={sound} appearance={appearance} />
          </SettingsMenu>
        </div>
      </header>

      <div className="felt" ref={felt}>
        {/* Nothing is placed until the felt has a size to solve against. */}
        {size.width > 0 ? (
          <>
            {SEATS.map((seat) => (
              <Rack
                key={seat}
                player={view.players[seat]}
                view={view}
                layout={layout}
                position={position(seat)}
              />
            ))}
            {SEATS.map((seat) => (
              <Discards
                key={seat}
                player={view.players[seat]}
                layout={layout}
                position={position(seat)}
                lastId={lastId}
              />
            ))}
            <Console api={api} view={view} layout={layout} position={position} />
          </>
        ) : null}
      </div>
    </div>
  );
}
