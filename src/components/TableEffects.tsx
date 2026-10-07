"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { DEAL_FLIGHT_MS, DEAL_STACKS, DEAL_STEP_MS, WALL_BUILD_MS } from "@/game/room";
import type { Seat, TileCode } from "@/game/tiles";
import { createRng } from "@/game/rng";
import { STARTING_CHIPS } from "@/game/rules";
import { POSITION_ROTATION, type TableLayout } from "./tableLayout";
import { TileFace } from "./TileView";
import type { Moment } from "./moments";

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

function prefersStillness(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

/** True for `ms` after `key` first changes to a non-null value, then false. */
export function useWindow(key: string | null, ms: number): boolean {
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (key === null || prefersStillness()) return;
    setLive(key);
    const timer = window.setTimeout(() => setLive((current) => (current === key ? null : current)), ms);
    return () => window.clearTimeout(timer);
  }, [key, ms]);
  return key !== null && live === key;
}

/** A seat's chips: what it sat down with plus everything won and lost since. */
export function chipsOf(score: number): number {
  return STARTING_CHIPS + score;
}

/** A small pile of chips with the count beside it, taller the more there is. */
export function ChipStack({ count, label }: { count: number; label?: string }) {
  // One disc per twenty chips, at least one, at most six, so the pile reads at a glance.
  const discs = Math.max(1, Math.min(6, Math.ceil(Math.max(0, count) / 20)));
  return (
    <span className="chipstack" title={label ?? `${count} chips`}>
      <span className="chipstack__pile" aria-hidden>
        {Array.from({ length: discs }, (_, i) => (
          <span key={i} className="chipstack__disc" style={{ "--i": i } as Vars} />
        ))}
      </span>
      <span className="chipstack__count">{count}</span>
      <span className="sr-only"> chips</span>
    </span>
  );
}

/**
 * The deal, played out on the felt once the wall is built: cubes of tile
 * backs — two stacks of two, as they are lifted off a wall — leave it for each
 * rack in turn, dealer first, three rounds of four and then one each, so
 * thirteen tiles are seen arriving in front of every player.
 */
export function DealOverlay({
  live,
  layout,
  dealer,
  position,
  origin,
}: {
  live: boolean;
  layout: TableLayout;
  dealer: Seat;
  position: (seat: Seat) => number;
  /** Where on the felt the ith stack is taken from. */
  origin: (stack: number) => { x: number; y: number };
}) {
  if (!live) return null;
  const tile = Math.round(layout.tile * 0.8);
  const stacks = Array.from({ length: DEAL_STACKS }, (_, i) => {
    const seat = ((dealer + (i % 4)) % 4) as Seat;
    const pos = position(seat);
    const rack = layout.racks[pos];
    const from = origin(i);
    return {
      i,
      cube: i < 12,
      style: {
        left: from.x,
        top: from.y,
        "--dx": `${rack.cx - from.x}px`,
        "--dy": `${rack.cy - from.y}px`,
        "--turn": `${POSITION_ROTATION[pos]}deg`,
        "--tile-w": `${tile}px`,
        "--lift": `${Math.round(tile * 0.3)}px`,
        animationDelay: `${WALL_BUILD_MS + i * DEAL_STEP_MS}ms`,
        animationDuration: `${DEAL_FLIGHT_MS}ms`,
      } as Vars,
    };
  });
  return (
    <div className="deal" aria-hidden>
      {stacks.map((s) => (
        <span key={s.i} className={s.cube ? "deal__stack deal__stack--cube" : "deal__stack"} style={s.style}>
          {s.cube ? (
            <>
              <span className="deal__layer">
                <span className="tile tile--back deal__tile" />
                <span className="tile tile--back deal__tile" />
              </span>
              <span className="deal__layer deal__layer--top">
                <span className="tile tile--back deal__tile" />
                <span className="tile tile--back deal__tile" />
              </span>
            </>
          ) : (
            <span className="tile tile--back deal__tile" />
          )}
        </span>
      ))}
    </div>
  );
}

/** Confetti pieces for a win of this many faan: a bigger hand, a bigger burst. */
export function confettiCount(faan: number): number {
  return Math.max(16, Math.min(180, Math.round(faan * 16)));
}

const CONFETTI_HUES = [44, 4, 150, 205, 285, 330];
/** Plum-blossom pinks and a white, for the flower that opens on a kong. */
const PETAL_HUES = [330, 340, 350, 0, 320];

function confettiPieces(count: number, seed: number, spread: number, delay: number, petals: boolean) {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = rng.next() * Math.PI * 2;
    const reach = spread * (0.35 + rng.next() * 0.65);
    return {
      i,
      style: {
        "--cx": `${Math.cos(angle) * reach}px`,
        "--cy": `${Math.sin(angle) * reach - spread * 0.25}px`,
        "--fall": `${spread * (0.4 + rng.next() * 0.5)}px`,
        "--spin": `${Math.round((rng.next() - 0.5) * 1440)}deg`,
        "--hue": petals ? PETAL_HUES[i % PETAL_HUES.length] : CONFETTI_HUES[i % CONFETTI_HUES.length],
        animationDelay: `${delay + Math.round(rng.next() * 400)}ms`,
        width: `${6 + Math.round(rng.next() * 6)}px`,
        height: `${4 + Math.round(rng.next() * 6)}px`,
      } as Vars,
    };
  });
}

/** A burst of confetti from a point; the caller places it. */
export function Confetti({
  count,
  seed,
  spread,
  delay = 0,
  style,
  petals = false,
}: {
  count: number;
  seed: number;
  spread: number;
  /** Milliseconds before the first piece goes up. */
  delay?: number;
  style?: CSSProperties;
  /** Blossom petals instead of paper. */
  petals?: boolean;
}) {
  const pieces = useMemo(
    () => confettiPieces(count, seed, spread, delay, petals),
    [count, seed, spread, delay, petals],
  );
  return (
    <span className="confetti" style={style} aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className={petals ? "confetti__piece confetti__piece--petal" : "confetti__piece"}
          style={p.style}
        />
      ))}
    </span>
  );
}

/** How long one chip takes to cross the table. */
const CHIP_FLIGHT_MS = 1900;
/** The gap between one chip leaving a seat and the next. */
const CHIP_STEP_MS = 170;
/** How long the confetti takes to go up and come down, its stragglers included. */
const CONFETTI_MS = 3000;

/** Chips in one seat's stream: one for every four points, so a big payment is a visibly longer stream. */
function chipsFor(paid: number): number {
  return Math.max(3, Math.min(14, Math.round(paid / 4)));
}

/** How long a won hand's chips and confetti take, from the settle to the last piece down. */
export function winFxMs(payments: number[], winner: Seat | null): number {
  if (winner === null) return 0;
  let last = 0;
  let payer = 0;
  for (let seat = 0; seat < 4; seat++) {
    const paid = -(payments[seat] ?? 0);
    if (seat === winner || paid <= 0) continue;
    last = Math.max(last, payer * 60 + (chipsFor(paid) - 1) * CHIP_STEP_MS);
    payer++;
  }
  return Math.round(last + CHIP_FLIGHT_MS * 0.6 + CONFETTI_MS + 400);
}

/**
 * The end of a won hand on the felt: chips leave every seat that pays and
 * cross to the winner's rack, then confetti goes up from it — more of it the
 * bigger the hand. The felt decides how long it is live (`winFxMs`), so it
 * can be cut short.
 */
export function WinOverlay({
  live,
  layout,
  winner,
  payments,
  faan,
  position,
}: {
  live: boolean;
  layout: TableLayout;
  winner: Seat | null;
  payments: number[];
  faan: number;
  position: (seat: Seat) => number;
}) {
  const chips: { key: string; style: Vars }[] = [];
  let last = 0;
  if (winner !== null) {
    const to = layout.racks[position(winner)];
    let payer = 0;
    for (let seat = 0; seat < 4; seat++) {
      const paid = -(payments[seat] ?? 0);
      if (seat === winner || paid <= 0) continue;
      const from = layout.racks[position(seat as Seat)];
      // Every seat that pays starts at once, a beat apart, so the streams
      // cross the table together rather than one after another.
      const n = chipsFor(paid);
      for (let k = 0; k < n; k++) {
        const delay = payer * 60 + k * CHIP_STEP_MS;
        last = Math.max(last, delay);
        chips.push({
          key: `${seat}-${k}`,
          style: {
            left: from.cx + ((k % 3) - 1) * 10,
            top: from.cy,
            "--dx": `${to.cx - from.cx}px`,
            "--dy": `${to.cy - from.cy}px`,
            animationDelay: `${delay}ms`,
            animationDuration: `${CHIP_FLIGHT_MS}ms`,
          },
        });
      }
      payer++;
    }
  }
  const landed = last + CHIP_FLIGHT_MS * 0.6;
  if (!live || winner === null) return null;
  const to = layout.racks[position(winner)];
  return (
    <div className="win-fx" aria-hidden>
      {chips.map((c) => (
        <span key={c.key} className="chip-coin chip-coin--flying" style={c.style} />
      ))}
      <Confetti
        count={confettiCount(faan)}
        seed={(winner + 1) * 7919 + Math.round(faan) * 31}
        spread={Math.min(layout.console.w, layout.console.h) * 0.9 + 40}
        delay={Math.round(landed)}
        style={{ left: to.cx, top: to.cy }}
      />
    </div>
  );
}

/** How long a signature moment holds the felt. */
export const MOMENT_MS = 2800;

/**
 * A retold win's own moment, over everything else on the felt for a few
 * seconds: its name, said large, and a sign of what happened — petals for a
 * flower on the kong, the robbed tile snatched across the table, a moon or a
 * ripple for the last tile, rays for a limit hand. The result sheet under it
 * carries the same names for anyone who looks away.
 */
export function MomentOverlay({
  moment,
  live,
  layout,
  winner,
  robbedFrom,
  tile,
  position,
}: {
  moment: Moment | null;
  live: boolean;
  layout: TableLayout;
  winner: Seat | null;
  /** For a robbed kong: whose kong it was. */
  robbedFrom: Seat | null;
  /** The tile won on, where it is known. */
  tile: TileCode | null;
  position: (seat: Seat) => number;
}) {
  if (!live || !moment || winner === null) return null;
  const to = layout.racks[position(winner)];
  const centre = { x: layout.console.cx, y: layout.console.cy };
  const reach = Math.min(layout.console.w, layout.console.h);
  const from = robbedFrom !== null ? layout.racks[position(robbedFrom)] : null;

  return (
    <div className={`moment moment--${moment.kind}`} style={{ "--ms": `${MOMENT_MS}ms` } as Vars}>
      {moment.kind === "kongBlossom" ? (
        <Confetti
          petals
          count={70}
          seed={(winner + 1) * 4409}
          spread={reach * 0.8 + 60}
          style={{ left: to.cx, top: to.cy }}
        />
      ) : null}
      {moment.kind === "robbing" && from && tile ? (
        <span
          className="moment__snatch"
          style={
            {
              left: from.cx,
              top: from.cy,
              "--dx": `${to.cx - from.cx}px`,
              "--dy": `${to.cy - from.cy}px`,
              "--tile-md": `${layout.tile}px`,
            } as Vars
          }
          aria-hidden
        >
          <TileFace code={tile} size="md" />
        </span>
      ) : null}
      {moment.kind === "seaMoon" ? (
        <span className="moment__moon" style={{ left: centre.x, top: centre.y, "--r": `${reach * 0.32}px` } as Vars} aria-hidden />
      ) : null}
      {moment.kind === "riverFish" ? (
        <span className="moment__ripples" style={{ left: centre.x, top: centre.y, "--r": `${reach * 0.5}px` } as Vars} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : null}
      {moment.kind === "limit" ? (
        <span className="moment__rays" style={{ left: centre.x, top: centre.y, "--r": `${reach * 0.9}px` } as Vars} aria-hidden />
      ) : null}
      <div className="moment__card" role="status" style={{ left: centre.x, top: centre.y }}>
        <span className="moment__chinese" lang="zh-Hant">
          {moment.chinese}
        </span>
        <span className="moment__name">{moment.name}</span>
        {moment.detail ? <span className="moment__detail">{moment.detail}</span> : null}
      </div>
    </div>
  );
}
