"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { DEAL_FLIGHT_MS, DEAL_MS, DEAL_STACKS, DEAL_STEP_MS } from "@/game/room";
import type { Seat } from "@/game/tiles";
import { createRng } from "@/game/rng";
import { STARTING_CHIPS } from "@/game/rules";
import { POSITION_ROTATION, type TableLayout } from "./tableLayout";

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

function prefersStillness(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

/** True for `ms` after `key` first changes to a non-null value, then false. */
function useWindow(key: string | null, ms: number): boolean {
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
 * The deal, played out on the felt: stacks of tile backs leave the middle for
 * each rack in turn, dealer first — three rounds of four, then one each — so
 * thirteen tiles are seen arriving in front of every player.
 */
export function DealOverlay({
  dealKey,
  layout,
  dealer,
  position,
}: {
  dealKey: string | null;
  layout: TableLayout;
  dealer: Seat;
  position: (seat: Seat) => number;
}) {
  const live = useWindow(dealKey, DEAL_MS + 100);
  if (!live) return null;
  const from = layout.console;
  const stacks = Array.from({ length: DEAL_STACKS }, (_, i) => {
    const seat = ((dealer + (i % 4)) % 4) as Seat;
    const pos = position(seat);
    const rack = layout.racks[pos];
    return {
      i,
      size: i < 12 ? 4 : 1,
      style: {
        left: from.cx,
        top: from.cy,
        "--dx": `${rack.cx - from.cx}px`,
        "--dy": `${rack.cy - from.cy}px`,
        "--turn": `${POSITION_ROTATION[pos]}deg`,
        "--tile-w": `${Math.round(layout.tile * 0.8)}px`,
        animationDelay: `${i * DEAL_STEP_MS}ms`,
        animationDuration: `${DEAL_FLIGHT_MS}ms`,
      } as Vars,
    };
  });
  return (
    <div className="deal" aria-hidden>
      {stacks.map((s) => (
        <span key={s.i} className="deal__stack" style={s.style}>
          {Array.from({ length: s.size }, (_, k) => (
            <span key={k} className="tile tile--back deal__tile" />
          ))}
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

function confettiPieces(count: number, seed: number, spread: number, delay: number) {
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
        "--hue": CONFETTI_HUES[i % CONFETTI_HUES.length],
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
}: {
  count: number;
  seed: number;
  spread: number;
  /** Milliseconds before the first piece goes up. */
  delay?: number;
  style?: CSSProperties;
}) {
  const pieces = useMemo(
    () => confettiPieces(count, seed, spread, delay),
    [count, seed, spread, delay],
  );
  return (
    <span className="confetti" style={style} aria-hidden>
      {pieces.map((p) => (
        <span key={p.i} className="confetti__piece" style={p.style} />
      ))}
    </span>
  );
}

/** How long chips take to cross to the winner, the last one included. */
const CHIP_FLIGHT_MS = 900;
const CHIP_STEP_MS = 90;
const CELEBRATION_MS = 5200;

/**
 * The end of a won hand on the felt: chips leave every seat that pays and
 * cross to the winner's rack, then confetti goes up from it — more of it the
 * bigger the hand.
 */
export function WinOverlay({
  winKey,
  layout,
  winner,
  payments,
  faan,
  position,
}: {
  winKey: string | null;
  layout: TableLayout;
  winner: Seat | null;
  payments: number[];
  faan: number;
  position: (seat: Seat) => number;
}) {
  const live = useWindow(winKey, CELEBRATION_MS);
  if (!live || winner === null) return null;
  const to = layout.racks[position(winner)];
  const chips: { key: string; style: Vars }[] = [];
  let order = 0;
  for (let seat = 0; seat < 4; seat++) {
    const paid = -(payments[seat] ?? 0);
    if (seat === winner || paid <= 0) continue;
    const from = layout.racks[position(seat as Seat)];
    // One chip for every four points, so a big payment is a visibly longer stream.
    const n = Math.max(3, Math.min(14, Math.round(paid / 4)));
    for (let k = 0; k < n; k++) {
      chips.push({
        key: `${seat}-${k}`,
        style: {
          left: from.cx + ((k % 3) - 1) * 10,
          top: from.cy,
          "--dx": `${to.cx - from.cx}px`,
          "--dy": `${to.cy - from.cy}px`,
          animationDelay: `${order++ * CHIP_STEP_MS}ms`,
          animationDuration: `${CHIP_FLIGHT_MS}ms`,
        },
      });
    }
  }
  const landed = order * CHIP_STEP_MS + CHIP_FLIGHT_MS * 0.6;
  return (
    <div className="win-fx" aria-hidden>
      {chips.map((c) => (
        <span key={c.key} className="chip chip--flying" style={c.style} />
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
