"use client";

import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicPlayer, RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import type { Meld } from "@/game/melds";
import { SEAT_NAMES, type Seat, roundName, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { useAppearance } from "@/hooks/useAppearance";
import { useCountdown } from "@/hooks/useCountdown";
import { useElementSize } from "@/hooks/useElementSize";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import { type TabletDisplay, useTabletDisplay } from "@/hooks/useLocalSetting";
import { TileFace } from "./TileView";
import { TableResult } from "./TableResult";
import {
  ChipStack,
  DealOverlay,
  MOMENT_MS,
  MomentOverlay,
  WinOverlay,
  chipsOf,
  useWindow,
  winFxMs,
} from "./TableEffects";
import { signatureMoment, winningTileOf } from "./moments";
import { TableWall, WallDraws, headPoint, wallBreak, wallGeometry } from "./TableWall";
import { DEAL_MS, FLOWER_STEP_MS } from "@/game/room";
import { flowersInPlay } from "@/game/rules";
import { MeldRow, bonusClass, isFreshClaim } from "./SeatPanel";
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

/** A deal shown without its opening flowers being laid down one by one. */
const NO_FLOWERS = new Map<string, number>();

/** Under this much time left, the rack's clock starts to pulse. */
const URGENT_MS = 5000;

/** Ponds are sized for a full hand's worth from the start, so tiles do not shrink as it fills. */
const POND_CAPACITY = 24;

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Who sits in a chair: a person's name, the computer's Robot name, or nobody yet. */
function occupantName(player: PublicPlayer): string {
  return player.occupant.name ?? (player.occupant.kind === "open" ? "Open" : SEAT_NAMES[player.seat]);
}

/**
 * The opening flowers of a hand, in the order the table lays them down —
 * dealer first, round the table — and the hand they belong to. Only a hand
 * first seen before anything was thrown gets them, so a tablet reloaded mid-hand
 * does not replay the start.
 */
function useOpening(view: RoomView): {
  dealKey: string | null;
  flowerOrder: Map<string, number>;
  live: boolean;
} {
  const seen = useRef<{ hand: number; dealKey: string | null; flowerOrder: Map<string, number> }>({
    hand: -1,
    dealKey: null,
    flowerOrder: new Map(),
  });
  if (seen.current.hand !== view.handNumber) {
    const fresh =
      view.phase === "action" &&
      view.players.every((p) => p.discards.length === 0 && p.melds.length === 0);
    const flowerOrder = new Map<string, number>();
    if (fresh) {
      for (let i = 0; i < 4; i++) {
        const seat = ((view.dealer + i) % 4) as Seat;
        for (const t of view.players[seat].flowers) flowerOrder.set(t.id, flowerOrder.size);
      }
    }
    seen.current = { hand: view.handNumber, dealKey: fresh ? `deal-${view.handNumber}` : null, flowerOrder };
  }
  // The deal and the opening flowers together, the time the room holds play for.
  const live = useWindow(
    seen.current.dealKey,
    DEAL_MS + seen.current.flowerOrder.size * FLOWER_STEP_MS + 700,
  );
  return { ...seen.current, live };
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
  flowerOrder,
}: {
  player: PublicPlayer;
  view: RoomView;
  layout: TableLayout;
  position: number;
  flowerOrder: Map<string, number>;
}) {
  const seat = player.seat;
  const active = view.turn === seat && view.phase === "action";
  // The hand is only ever sent face up once it is over.
  const shown = player.hand.some((t) => t.code !== "back");
  const winner = view.result?.type === "win" && view.result.winner === seat;
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
      className={[
        "rack",
        active ? "rack--active" : "",
        deciding ? "rack--deciding" : "",
        winner ? "rack--winner" : "",
      ]
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
          {SEAT_NAMES[seat]} · <ChipStack count={chipsOf(score)} />
        </span>
      </span>
      {/* A tile back with the count on it: how close this seat is to going
          out is the thing people glance at most. */}
      <span className="rack__count" title={`${player.handCount} tiles in hand`}>
        {player.handCount}
      </span>
      <div className="rack__open">
        {shown ? (
          <span
            className={`meld rack__hand${winner ? " rack__hand--winner" : ""}`}
            aria-label={`${occupantName(player)}'s hand`}
          >
            {player.hand.map((t) => (
              <TileFace key={t.id} code={t.code} size="sm" />
            ))}
          </span>
        ) : null}
        {player.melds.map((meld, i) => (
          <MeldRow key={i} meld={meld} fresh={isFreshClaim(meld, view.lastPlayed?.tile.id)} />
        ))}
        {player.flowers.length > 0 ? (
          <span className="meld rack__flowers">
            {player.flowers.map((t) => {
              const order = flowerOrder.get(t.id);
              // An opening flower waits for the deal, then is laid down in its turn.
              return order === undefined ? (
                <TileFace key={t.id} code={t.code} size="sm" className={bonusClass(t.code, player)} />
              ) : (
                <span
                  key={t.id}
                  className="flower-in"
                  style={{ animationDelay: `${DEAL_MS + order * FLOWER_STEP_MS}ms` }}
                >
                  <TileFace code={t.code} size="sm" className={bonusClass(t.code, player)} />
                </span>
              );
            })}
          </span>
        ) : null}
      </div>
      {status ? <span className="rack__status">{status}</span> : null}
      {left !== null && view.turnAllowance > 0 ? (
        // The clock drawn along the rack, to read from across the table; the
        // seconds stay in the pill above for anyone close enough.
        <span
          className={left <= URGENT_MS ? "rack__clock rack__clock--urgent" : "rack__clock"}
          style={{ "--left": Math.max(0, Math.min(1, left / view.turnAllowance)) } as Vars}
          aria-hidden
        />
      ) : null}
    </section>
  );
}

/**
 * A person plays from a phone in their hand; the computer plays from its rack.
 * Away is ignored on purpose: a tile already arriving would change how it
 * arrives halfway through.
 */
function playsFromPhone(player: PublicPlayer): boolean {
  return player.occupant.kind === "human";
}

/**
 * A seat's discards, laid in front of them and facing them. The newest tile
 * on the table stays in the middle until the next one is thrown or it is
 * claimed, so it is left out here while it is there.
 */
function Discards({
  player,
  layout,
  position,
  centreId,
  lit,
}: {
  player: PublicPlayer;
  layout: TableLayout;
  position: number;
  centreId: string | null;
  lit: boolean;
}) {
  const style: Vars = {
    ...placementStyle(layout.ponds[position]),
    "--tile-md": `${layout.tile}px`,
    gap: layout.gap,
  };
  return (
    <div
      className={lit ? "discards discards--turn" : "discards"}
      style={style}
      data-seat={player.seat}
      aria-label={`${SEAT_NAMES[player.seat]} discards`}
    >
      {player.discards
        .filter((t) => t.id !== centreId)
        .map((t) => (
          <TileFace key={t.id} code={t.code} size="md" />
        ))}
    </div>
  );
}

/**
 * When the next tile is thrown, the one it replaces in the middle crosses to
 * its owner's pond, so the eye can follow it there rather than finding it
 * already filed away.
 */
function usePondArrival(
  felt: RefObject<HTMLDivElement | null>,
  view: RoomView,
  position: (seat: Seat) => number,
) {
  const previous = useRef<{ id: string; from: Seat; hand: number } | null>(null);
  const played = view.lastPlayed;
  const key = played ? played.tile.id : null;
  const latest = useRef({ view, position });
  latest.current = { view, position };

  useLayoutEffect(() => {
    const before = previous.current;
    const { view, position } = latest.current;
    previous.current = view.lastPlayed
      ? { id: view.lastPlayed.tile.id, from: view.lastPlayed.from, hand: view.handNumber }
      : null;
    const root = felt.current;
    if (!root || !before || !key || before.id === key || before.hand !== view.handNumber) return;
    // A claimed tile went to a set instead; the claim flight shows that.
    if (!view.players[before.from].discards.some((t) => t.id === before.id)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const pond = root.querySelector<HTMLElement>(`.discards[data-seat="${before.from}"]`);
    const target = pond?.lastElementChild as HTMLElement | null;
    const middle = root.querySelector<HTMLElement>(".console__middle");
    const duration = parseFloat(getComputedStyle(root).getPropertyValue("--anim-gather"));
    if (!target || !middle || !(duration > 0) || typeof target.animate !== "function") return;

    const box = root.getBoundingClientRect();
    const a = middle.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const turn = POSITION_ROTATION[position(before.from)];
    const ghost = target.cloneNode(true) as HTMLElement;
    ghost.classList.add("tile--flying");
    ghost.style.setProperty("--tile-w", `${target.offsetWidth}px`);
    ghost.style.left = `${a.left + a.width / 2 - box.left - target.offsetWidth / 2}px`;
    ghost.style.top = `${a.top + a.height / 2 - box.top - target.offsetHeight / 2}px`;
    root.appendChild(ghost);
    target.style.visibility = "hidden";

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const animation = ghost.animate(
      [
        { transform: `translate(0, 0) rotate(${turn}deg)` },
        { transform: `translate(${dx}px, ${dy}px) rotate(${turn}deg)` },
      ],
      { duration, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" },
    );
    const land = () => {
      ghost.remove();
      target.style.visibility = "";
    };
    animation.onfinish = land;
    animation.oncancel = land;
  }, [felt, key]);
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
  view,
  layout,
  position,
  sheetOpen,
}: {
  view: RoomView;
  layout: TableLayout;
  position: (seat: Seat) => number;
  /** The full result is laid over the felt, so the middle need not repeat it through it. */
  sheetOpen: boolean;
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
        // The full account is laid over the felt; the middle keeps the gist
        // for when that is put aside.
        <div className="console__result" role="status" hidden={sheetOpen}>
          {view.result?.type === "win" && view.result.winner !== null ? (
            <>
              <strong className="console__headline">
                {occupantName(view.players[view.result.winner])} wins
              </strong>
              {view.result.score ? (
                <span className="seat__meta">{view.result.score.scoredFaan} faan</span>
              ) : null}
            </>
          ) : (
            <strong className="console__headline">Washed-out hand 流局</strong>
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
                {occupantName(view.players[played.from])} · {tileName(played.tile.code)}
                {taker
                  ? ` · ${MELD_VERB[taker.meld.type]} by ${occupantName(view.players[taker.seat])}`
                  : claimed
                    ? " · claimed"
                    : ""}
              </span>
            </>
          ) : (
            <span className="console__caption">
              {view.phase === "action" ? `${occupantName(view.players[view.turn])} to play` : " "}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Whether the hand's result is laid over the felt. It can be put aside to look
 * at the table, and the next hand brings it back.
 */
export function useResultSheet(view: RoomView) {
  const [asideHand, setAsideHand] = useState<number | null>(null);
  const settled = (view.phase === "handOver" || view.phase === "gameOver") && view.result !== null;
  return {
    open: settled && asideHand !== view.handNumber,
    /** Settled, with the sheet put aside — the way back to it is the caller's. */
    aside: settled && asideHand === view.handNumber,
    hide: () => setAsideHand(view.handNumber),
    show: () => setAsideHand(null),
  };
}

export type ResultSheet = ReturnType<typeof useResultSheet>;

/**
 * The cloth and everything on it: a rack along each edge for the seat sitting
 * there, every pond in front of its owner, the wall, the last discard in the
 * middle, and the deal, the claims and the win played out across it. It draws
 * a table's view, so concealed tiles are never on it.
 */
export function Felt({
  view,
  display,
  sheet,
  onNextHand,
  onSkipDeal,
  busy = false,
}: {
  view: RoomView;
  display: TabletDisplay;
  sheet: ResultSheet;
  onNextHand: () => void;
  /** The deal has been skipped here; whoever holds play for it should stop. */
  onSkipDeal?: () => void;
  busy?: boolean;
}) {
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
    // A hand turned face up at the end needs room on its rack too.
    revealed: bySeatAtPosition((seat) => {
      const p = view.players[seat];
      const shown = p.hand.some((t) => t.code !== "back") ? p.hand.length : 0;
      return p.melds.reduce((n, m) => n + m.tiles.length, 0) + p.flowers.length + shown;
    }),
    groups: bySeatAtPosition((seat) => {
      const p = view.players[seat];
      const shown = p.hand.some((t) => t.code !== "back") ? 1 : 0;
      return p.melds.length + (p.flowers.length > 0 ? 1 : 0) + shown;
    }),
  });
  const over = view.phase === "handOver" || view.phase === "gameOver";
  // The tile in the middle; it joins its pond when the next one is thrown.
  const centreId = !over && view.lastPlayed ? view.lastPlayed.tile.id : null;
  useClaimFlight(felt, view, position);
  usePondArrival(felt, view, position);
  const opening = useOpening(view);
  const won = over && view.result?.type === "win" ? view.result : null;
  const winKey = won ? `win-${view.handNumber}` : null;
  // Whichever ceremony was skipped, by its key: a deal or a win, never a later one.
  const [skipped, setSkipped] = useState<string | null>(null);
  const dealSkipped = opening.dealKey !== null && skipped === opening.dealKey;
  const winSkipped = winKey !== null && skipped === winKey;
  const opened = opening.live && !dealSkipped;
  const dealing = useWindow(opening.dealKey, DEAL_MS + 100) && !dealSkipped;
  const winLive = useWindow(winKey, winFxMs(won?.payments ?? [], won?.winner ?? null)) && !winSkipped;
  const moment = signatureMoment(won);
  const momentLive = useWindow(moment ? winKey : null, MOMENT_MS) && !winSkipped;
  const wall = wallGeometry(layout, flowersInPlay(view.config) ? 144 : 136, view.handNumber);
  const brk = wallBreak(wall, position(view.dealer), view.handNumber);
  // A screen that does not animate the deal has nothing to wait for: the hold
  // the room keeps for it is let go as soon as the hand is seen.
  const skipRef = useRef(onSkipDeal);
  skipRef.current = onSkipDeal;
  useEffect(() => {
    if (opening.dealKey === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) skipRef.current?.();
  }, [opening.dealKey]);
  const skip = () => {
    if (opened) {
      setSkipped(opening.dealKey);
      onSkipDeal?.();
    } else if (winKey) {
      setSkipped(winKey);
    }
  };

  return (
    <div className="felt" ref={felt}>
      {/* Nothing is placed until the felt has a size to solve against. */}
      {size.width > 0 ? (
        <>
          <TableWall
            geometry={wall}
            brk={brk}
            view={view}
            opening={opened}
            hidden={display.wall === "off"}
          />
          {SEATS.map((seat) => (
            <Rack
              key={seat}
              player={view.players[seat]}
              view={view}
              layout={layout}
              position={position(seat)}
              flowerOrder={dealSkipped ? NO_FLOWERS : opening.flowerOrder}
            />
          ))}
          {SEATS.map((seat) => (
            <Discards
              key={seat}
              player={view.players[seat]}
              layout={layout}
              position={position(seat)}
              centreId={centreId}
              lit={
                display.turnGlow === "on" &&
                ((view.phase === "action" && view.turn === seat) ||
                  view.awaitingClaimSeats.includes(seat))
              }
            />
          ))}
          <Console view={view} layout={layout} position={position} sheetOpen={sheet.open} />
          <DealOverlay
            live={dealing}
            layout={layout}
            dealer={view.dealer}
            position={position}
            origin={(i) => headPoint(wall, brk, i < 12 ? i * 4 : 48 + (i - 12))}
          />
          <WallDraws
            geometry={wall}
            brk={brk}
            view={view}
            rackCentre={(seat) => {
              const r = layout.racks[position(seat)];
              return { x: r.cx, y: r.cy };
            }}
            enabled={display.wall === "on" && !opened}
          />
          {/* A moment has the felt to itself; the sheet follows it, or a skip. */}
          {sheet.open && !momentLive ? (
            <TableResult
              view={view}
              name={(seat) => occupantName(view.players[seat])}
              tile={Math.round(Math.min(40, Math.max(26, layout.tile * 1.05)))}
              onHide={sheet.hide}
              onNextHand={onNextHand}
              busy={busy}
            />
          ) : null}
          <WinOverlay
            live={winLive}
            layout={layout}
            winner={won?.winner ?? null}
            payments={won?.payments ?? []}
            faan={won?.score?.scoredFaan ?? 0}
            position={position}
          />
          <MomentOverlay
            moment={moment}
            live={momentLive}
            layout={layout}
            winner={won?.winner ?? null}
            robbedFrom={moment?.kind === "robbing" ? (won?.from ?? null) : null}
            tile={moment?.kind === "robbing" ? winningTileOf(view.log) : null}
            position={position}
          />
          {opened || winLive || momentLive ? (
            // Seen it before: the deal, or a win's chips and confetti, can be cut short.
            <button
              type="button"
              className="felt__skip"
              onClick={skip}
              aria-label={opened ? "Skip the deal" : "Skip the celebration"}
            >
              Skip ⏭
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * The shared tablet, drawn as the table itself: the felt under a bar of the
 * table's own controls. Concealed tiles are never on it — the server does not
 * send them to this device at all.
 */
export function TableTop({ api, view, sound }: { api: RoomApi; view: RoomView; sound?: SoundToggle }) {
  const wakeLock = useWakeLock(true);
  const appearance = useAppearance();
  const fullscreen = useFullscreen();
  const display = useTabletDisplay();
  const sheet = useResultSheet(view);

  return (
    <div className="tabletop">
      <header className="tabletop__bar">
        <span className="tableview__code">{tableName(view.roomId)}</span>
        <span className="stat__value">
          {tileGlyph(view.roundWind)} {roundName(view.roundWind)} · hand {view.handNumber}
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
          {sheet.aside ? (
            <button type="button" className="btn btn--sm" onClick={sheet.show}>
              Result
            </button>
          ) : null}
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
            <TableSettings
              api={api}
              view={view}
              sound={sound}
              appearance={appearance}
              display={display}
            />
          </SettingsMenu>
        </div>
      </header>

      <Felt
        view={view}
        display={display}
        sheet={sheet}
        onNextHand={() => void api.control({ type: "nextHand" })}
        onSkipDeal={() => void api.control({ type: "skipOpening" })}
        busy={api.busy}
      />
    </div>
  );
}
