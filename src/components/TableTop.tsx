"use client";

import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react";
import type { PublicPlayer, RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import type { Meld } from "@/game/melds";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { useAppearance } from "@/hooks/useAppearance";
import { useCountdown } from "@/hooks/useCountdown";
import { useElementSize } from "@/hooks/useElementSize";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import { TileFace } from "./TileView";
import { MeldRow, isFreshClaim } from "./SeatPanel";
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
      data-seat={seat}
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
          <MeldRow key={i} meld={meld} fresh={isFreshClaim(meld, view.lastPlayed?.tile.id)} />
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

/**
 * A person plays from a phone in their hand; the computer plays from its rack.
 * Away is ignored on purpose: the class swaps the pond's animation, and a
 * swap would replay every tile already in it.
 */
function playsFromPhone(player: PublicPlayer): boolean {
  return player.occupant.kind === "human";
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
    <div
      className={playsFromPhone(player) ? "discards from-phone" : "discards"}
      style={style}
      aria-label={`${SEAT_NAMES[player.seat]} discards`}
    >
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

const MELD_VERB: Record<Meld["type"], string> = {
  chow: "chowed",
  pung: "punged",
  kong: "konged",
};

/** Who took a discard, and into which set. */
function claimantOf(view: RoomView, tileId: string): { seat: Seat; meld: Meld } | null {
  for (const player of view.players) {
    const meld = player.melds.find((m) => m.claimedTileId === tileId);
    if (meld) return { seat: player.seat, meld };
  }
  return null;
}

/** Turn by the short way round, so a tile never spins a full circle in flight. */
function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * When a discard is claimed, fly a copy of it from the middle of the table to
 * the set it now completes, turning to face its new owner, so everyone sees
 * which tile went where. The set's own tile waits out the flight in CSS
 * (`--anim-flight`) and appears as the copy lands.
 */
function useClaimFlight(
  felt: RefObject<HTMLDivElement | null>,
  view: RoomView,
  position: (seat: Seat) => number,
) {
  const flown = useRef<string | null>(null);
  const played = view.lastPlayed;
  const taker = played ? claimantOf(view, played.tile.id) : null;
  const key = played && taker ? played.tile.id : null;
  // Read through a ref so a fresh poll mid-flight does not re-run the effect.
  const latest = useRef({ played, taker, position });
  latest.current = { played, taker, position };

  useLayoutEffect(() => {
    const root = felt.current;
    const { played, taker, position } = latest.current;
    if (!root || !key || !played || !taker || flown.current === key) return;
    flown.current = key;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spot = root.querySelector<HTMLElement>(".console__spot");
    const source = spot?.querySelector<HTMLElement>(".tile");
    const target = root.querySelector<HTMLElement>(
      `.rack[data-seat="${taker.seat}"] .meld--fresh .meld__taken`,
    );
    const duration = parseFloat(getComputedStyle(root).getPropertyValue("--anim-flight"));
    if (!spot || !source || !target || !(duration > 0) || typeof source.animate !== "function") {
      return;
    }
    // The set's copy stays hidden until the flying one lands on it.
    target.style.visibility = "hidden";
    const reveal = () => {
      target.style.visibility = "";
    };

    const fly = () => {
      if (!root.isConnected || !target.isConnected) return reveal();
      const box = root.getBoundingClientRect();
      // The spot is not animated, so it is where the thrown tile comes to rest.
      const a = spot.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const from = POSITION_ROTATION[position(played.from)];
      const turn = shortestTurn(from, POSITION_ROTATION[position(taker.seat)]);
      // offsetWidth is the untransformed size; the rects are the rotated boxes.
      const scale = target.offsetWidth / source.offsetWidth;

      const ghost = source.cloneNode(true) as HTMLElement;
      ghost.className = ghost.className
        .split(" ")
        .filter((c) => !c.startsWith("tile--toss") && c !== "tile--dim")
        .concat("tile--flying")
        .join(" ");
      ghost.style.setProperty("--tile-w", `${source.offsetWidth}px`);
      ghost.style.left = `${a.left + a.width / 2 - box.left - source.offsetWidth / 2}px`;
      ghost.style.top = `${a.top + a.height / 2 - box.top - source.offsetHeight / 2}px`;
      root.appendChild(ghost);

      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const animation = ghost.animate(
        [
          { transform: `translate(0, 0) rotate(${from}deg) scale(1)`, offset: 0 },
          // Lift off the table first, so the eye catches it before it moves.
          { transform: `translate(0, 0) rotate(${from}deg) scale(1.35)`, offset: 0.18 },
          {
            transform: `translate(${dx}px, ${dy}px) rotate(${from + turn}deg) scale(${scale})`,
            offset: 1,
          },
        ],
        { duration, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" },
      );
      // The middle keeps a faded copy, so it still says which tile was thrown.
      spot.animate([{ opacity: 1 }, { opacity: 0.35 }], {
        duration: duration * 0.3,
        fill: "forwards",
      });
      const land = () => {
        ghost.remove();
        reveal();
      };
      animation.onfinish = land;
      animation.oncancel = land;
    };

    // A computer claim arrives with the discard itself: let the throw land in
    // the middle first, so the tile is seen arriving before it is seen taken.
    Promise.all(source.getAnimations().map((anim) => anim.finished))
      .catch(() => undefined)
      .then(fly);
  }, [felt, key]);
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
  const taker = claimed ? claimantOf(view, played.tile.id) : null;
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
                className={
                  playsFromPhone(view.players[played.from])
                    ? "console__spot from-phone"
                    : "console__spot"
                }
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
                {taker
                  ? ` · ${MELD_VERB[taker.meld.type]} by ${SEAT_NAMES[taker.seat]}`
                  : claimed
                    ? " · claimed"
                    : ""}
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
  useClaimFlight(felt, view, position);

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
