"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { DEAL_MS, DEAL_STACKS, DEAL_STEP_MS, FLOWER_STEP_MS, type RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";
import type { TableLayout } from "./tableLayout";

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

const TILES = 144;
const STACKS = TILES / 2;
const PER_SIDE = STACKS / 4;
/** Screen positions round the wall clockwise, from the top: tiles are taken in this order. */
const SIDES = [2, 1, 0, 3] as const;
/** A face-down tile's depth across the wall, in tile widths. */
const DEPTH = 1.35;

export interface WallStack {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which screen edge's wall it belongs to. */
  position: number;
}

export interface WallGeometry {
  /** Tile width along the wall. */
  tile: number;
  stacks: WallStack[];
}

/**
 * The square of four walls, eighteen stacks of two to a side, laid in the
 * middle of the felt inside the racks. Each wall overlaps the next at one end,
 * as the walls of a real table do, so the square closes.
 */
export function wallGeometry(layout: TableLayout): WallGeometry {
  const half = layout.rack / 2;
  const left = layout.racks[3].cx + half;
  const right = layout.racks[1].cx - half;
  const top = layout.racks[2].cy + half;
  const bottom = layout.racks[0].cy - half;
  const side = Math.max(0, Math.min(right - left, bottom - top) * 0.92);
  const t = side / (PER_SIDE + DEPTH);
  const d = t * DEPTH;
  const x0 = layout.console.cx - side / 2;
  const y0 = layout.console.cy - side / 2;
  const x1 = x0 + side;
  const y1 = y0 + side;

  const stacks: WallStack[] = [];
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < PER_SIDE; k++) {
      const position = SIDES[s];
      if (s === 0) stacks.push({ x: x0 + k * t, y: y0, w: t, h: d, position });
      else if (s === 1) stacks.push({ x: x1 - d, y: y0 + k * t, w: d, h: t, position });
      else if (s === 2) stacks.push({ x: x1 - (k + 1) * t, y: y1 - d, w: t, h: d, position });
      else stacks.push({ x: x0, y: y1 - (k + 1) * t, w: d, h: t, position });
    }
  }
  return { tile: t, stacks };
}

/**
 * Where the wall is broken for this hand: in front of the dealer, a dice
 * throw along. The dice are not part of the game here, so the count comes from
 * the hand number — the same on every screen and every reload.
 */
export function wallBreak(dealerPosition: number, handNumber: number): number {
  const dice = 2 + ((handNumber * 7) % 11);
  return SIDES.indexOf(dealerPosition as (typeof SIDES)[number]) * PER_SIDE + dice;
}

/** The stack and layer of the nth tile taken from the live end. */
function headTile(brk: number, n: number): { stack: number; top: boolean } {
  return { stack: (brk + Math.floor(n / 2)) % STACKS, top: n % 2 === 0 };
}

/** The stack and layer of the mth replacement tile, taken from the other end. */
function tailTile(brk: number, m: number): { stack: number; top: boolean } {
  return { stack: (((brk - 1 - Math.floor(m / 2)) % STACKS) + STACKS) % STACKS, top: m % 2 === 0 };
}

/**
 * How many tiles have left each end of the wall. Every flower and every kong
 * was replaced from the back; everything else came from the front.
 */
export function wallTaken(view: RoomView): { head: number; tail: number } {
  const tail = view.players.reduce(
    (n, p) => n + p.flowers.length + p.melds.filter((m) => m.type === "kong").length,
    0,
  );
  const taken = Math.max(0, TILES - view.wallCount);
  return { head: Math.max(0, taken - tail), tail: Math.min(tail, taken) };
}

export function stackCentre(geometry: WallGeometry, stack: number): { x: number; y: number } {
  const s = geometry.stacks[stack];
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

/** Where the nth tile from the live end sits, for the deal to leave from. */
export function headPoint(geometry: WallGeometry, brk: number, n: number) {
  return stackCentre(geometry, headTile(brk, n).stack);
}

/** When the deal takes the nth tile from the live end. */
function dealDelay(n: number): number {
  // Twelve stacks of four, then one tile a stack.
  const stack = n < 48 ? Math.floor(n / 4) : 12 + (n - 48);
  return Math.min(stack, DEAL_STACKS - 1) * DEAL_STEP_MS;
}

/**
 * The tiles still to be drawn, faint under everything else. While the deal is
 * being shown, the tiles it took are still there and disappear as each stack
 * leaves; the opening replacements go as their flowers are laid down.
 */
export function TableWall({
  geometry,
  brk,
  view,
  dealing,
}: {
  geometry: WallGeometry;
  brk: number;
  view: RoomView;
  dealing: boolean;
}) {
  const { head, tail } = wallTaken(view);
  // Per stack and layer: undefined is still there, a number is when it goes, null is gone.
  const leaves: (number | null | undefined)[][] = Array.from({ length: STACKS }, () => [
    undefined,
    undefined,
  ]);
  for (let n = 0; n < Math.min(head, TILES); n++) {
    const { stack, top } = headTile(brk, n);
    leaves[stack][top ? 1 : 0] = dealing ? dealDelay(n) : null;
  }
  for (let m = 0; m < Math.min(tail, TILES - head); m++) {
    const { stack, top } = tailTile(brk, m);
    leaves[stack][top ? 1 : 0] = dealing ? DEAL_MS + m * FLOWER_STEP_MS : null;
  }

  const lift = geometry.tile * 0.22;
  return (
    <div className="wall" aria-hidden>
      {geometry.stacks.map((s, i) => {
        const [bottom, top] = leaves[i];
        if (bottom === null && top === null) return null;
        const style: Vars = { left: s.x, top: s.y, width: s.w, height: s.h, "--lift": `${lift}px` };
        return (
          <span key={i} className="wall__stack" style={style}>
            {[bottom, top].map((leave, layer) =>
              leave === null ? null : (
                <span
                  key={layer}
                  className={[
                    "wall__tile",
                    layer === 1 ? "wall__tile--top" : "",
                    leave !== undefined ? "wall__tile--leaving" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={leave !== undefined ? { animationDelay: `${leave}ms` } : undefined}
                />
              ),
            )}
          </span>
        );
      })}
    </div>
  );
}

interface Flight {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

/**
 * A tile leaving the wall for the hand that drew it. Draws are worked out from
 * how far each end of the wall has moved since the last view, so a poll that
 * covers several computer turns still sends each tile to the seat that took it,
 * latest first, working back round the table.
 */
export function WallDraws({
  geometry,
  brk,
  view,
  rackCentre,
  enabled,
}: {
  geometry: WallGeometry;
  brk: number;
  view: RoomView;
  rackCentre: (seat: Seat) => { x: number; y: number };
  enabled: boolean;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seen = useRef<{ hand: number; head: number; tail: number } | null>(null);
  const next = useRef(0);
  const { head, tail } = wallTaken(view);
  const latest = useRef({ geometry, brk, view, rackCentre });
  latest.current = { geometry, brk, view, rackCentre };

  useEffect(() => {
    const before = seen.current;
    seen.current = { hand: view.handNumber, head, tail };
    if (!enabled || !before || before.hand !== view.handNumber) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const { geometry, brk, view: v, rackCentre } = latest.current;
    const taken: { stack: number }[] = [];
    for (let n = before.head; n < head; n++) taken.push(headTile(brk, n));
    for (let m = before.tail; m < tail; m++) taken.push(tailTile(brk, m));
    if (taken.length === 0 || taken.length > 8) return;
    const added = taken.map((t, i) => {
      // The newest draw is the seat on turn; earlier ones were the seats before it.
      const seat = (((v.turn - (taken.length - 1 - i)) % 4) + 4) % 4;
      return {
        id: next.current++,
        from: stackCentre(geometry, t.stack),
        to: rackCentre(seat as Seat),
        delay: i * 180,
      };
    });
    setFlights((f) => [...f, ...added]);
  }, [view.handNumber, head, tail, enabled]);

  return (
    <div className="wall-draws" aria-hidden>
      {flights.map((f) => (
        <span
          key={f.id}
          className="wall-draw"
          style={
            {
              left: f.from.x,
              top: f.from.y,
              width: geometry.tile,
              height: geometry.tile * DEPTH,
              "--dx": `${f.to.x - f.from.x}px`,
              "--dy": `${f.to.y - f.from.y}px`,
              animationDelay: `${f.delay}ms`,
            } as Vars
          }
          onAnimationEnd={() => setFlights((all) => all.filter((x) => x.id !== f.id))}
        />
      ))}
    </div>
  );
}
