"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  DEAL_MS,
  DEAL_STACKS,
  DEAL_STEP_MS,
  FLOWER_STEP_MS,
  type RoomView,
  WALL_BUILD_MS,
} from "@/game/room";
import type { Seat } from "@/game/tiles";
import type { TableLayout } from "./tableLayout";

/** Custom properties are not in React's style typing. */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Screen positions round the wall clockwise, from the top: tiles are taken in this order. */
const SIDES = [2, 1, 0, 3] as const;
/** A face-down tile's depth across the wall, in tile widths. */
const DEPTH = 1.35;
/** The square of walls sits turned on the felt, as it does on a real table. */
const TURN_DEG = 20;
/** How far a wall's bounding box grows when it is turned that far. */
const TURN_SPREAD =
  Math.cos((TURN_DEG * Math.PI) / 180) + Math.sin((TURN_DEG * Math.PI) / 180);
/** When the stacks of each wall are pushed out of the middle into place. */
const BUILD_STEP_MS = 75;
const BUILD_FLIGHT_MS = 900;

export interface WallStack {
  /** Centre on the felt. */
  cx: number;
  cy: number;
  /** Size before it is turned: along the wall, then across it. */
  w: number;
  h: number;
  /** Degrees it is turned: the wall's own turn, give or take a hand's slip. */
  rot: number;
  /** Which screen edge's wall it belongs to. */
  position: number;
  /** Where along its wall it sits, from the end it is built from. */
  index: number;
}

export interface WallGeometry {
  /** Tile width along the wall. */
  tile: number;
  stacks: WallStack[];
  /** The middle of the square, where the tiles are pushed out from. */
  centre: { x: number; y: number };
}

/** A repeatable 0..1 from a seed: the same slips on every screen and every redraw. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The square of four walls laid in the middle of the felt inside the racks,
 * two tiles high, turned twenty degrees and built by hand: no two stacks quite
 * in line. Each wall overlaps the next at one end, as on a real table, so the
 * square closes. Without bonus tiles each wall is a stack shorter.
 */
export function wallGeometry(layout: TableLayout, tiles = 144, hand = 0): WallGeometry {
  const perSide = tiles / 8;
  const half = layout.rack / 2;
  const left = layout.racks[3].cx + half;
  const right = layout.racks[1].cx - half;
  const top = layout.racks[2].cy + half;
  const bottom = layout.racks[0].cy - half;
  // Sized so the square still fits between the racks once it is turned.
  const side = Math.max(0, (Math.min(right - left, bottom - top) * 0.98) / TURN_SPREAD);
  const t = side / (perSide + DEPTH);
  const d = t * DEPTH;
  const cx = layout.console.cx;
  const cy = layout.console.cy;
  const x0 = cx - side / 2;
  const y0 = cy - side / 2;
  const x1 = x0 + side;
  const y1 = y0 + side;
  const angle = (TURN_DEG * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const stacks: WallStack[] = [];
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < perSide; k++) {
      const position = SIDES[s];
      // The upright square first, then turned about its middle.
      let bx: number;
      let by: number;
      let along: number;
      if (s === 0) [bx, by, along] = [x0 + (k + 0.5) * t, y0 + d / 2, 0];
      else if (s === 1) [bx, by, along] = [x1 - d / 2, y0 + (k + 0.5) * t, 90];
      else if (s === 2) [bx, by, along] = [x1 - (k + 0.5) * t, y1 - d / 2, 0];
      else [bx, by, along] = [x0 + d / 2, y1 - (k + 0.5) * t, 90];
      const seed = hand * 997 + s * 31 + k;
      const slip = { x: (jitter(seed) - 0.5) * t * 0.14, y: (jitter(seed + 0.5) - 0.5) * t * 0.14 };
      const rx = bx - cx + slip.x;
      const ry = by - cy + slip.y;
      stacks.push({
        cx: cx + rx * cos - ry * sin,
        cy: cy + rx * sin + ry * cos,
        w: t,
        h: d,
        rot: TURN_DEG + along + (jitter(seed + 0.25) - 0.5) * 5,
        position,
        index: k,
      });
    }
  }
  return { tile: t, stacks, centre: { x: cx, y: cy } };
}

/**
 * Where the wall is broken for this hand: in front of the dealer, a dice
 * throw along. The dice are not part of the game here, so the count comes from
 * the hand number — the same on every screen and every reload.
 */
export function wallBreak(geometry: WallGeometry, dealerPosition: number, handNumber: number): number {
  const perSide = geometry.stacks.length / 4;
  const dice = 2 + ((handNumber * 7) % 11);
  return SIDES.indexOf(dealerPosition as (typeof SIDES)[number]) * perSide + dice;
}

/** The stack and layer of the nth tile taken from the live end. */
function headTile(stacks: number, brk: number, n: number): { stack: number; top: boolean } {
  return { stack: (brk + Math.floor(n / 2)) % stacks, top: n % 2 === 0 };
}

/** The stack and layer of the mth replacement tile, taken from the other end. */
function tailTile(stacks: number, brk: number, m: number): { stack: number; top: boolean } {
  return { stack: (((brk - 1 - Math.floor(m / 2)) % stacks) + stacks) % stacks, top: m % 2 === 0 };
}

/**
 * How many tiles have left each end of the wall. Every flower and every kong
 * was replaced from the back; everything else came from the front.
 */
export function wallTaken(view: RoomView, tiles: number): { head: number; tail: number } {
  const tail = view.players.reduce(
    (n, p) => n + p.flowers.length + p.melds.filter((m) => m.type === "kong").length,
    0,
  );
  const taken = Math.max(0, tiles - view.wallCount);
  return { head: Math.max(0, taken - tail), tail: Math.min(tail, taken) };
}

export function stackCentre(geometry: WallGeometry, stack: number): { x: number; y: number } {
  const s = geometry.stacks[stack];
  return { x: s.cx, y: s.cy };
}

/** Where the nth tile from the live end sits, for the deal to leave from. */
export function headPoint(geometry: WallGeometry, brk: number, n: number) {
  return stackCentre(geometry, headTile(geometry.stacks.length, brk, n).stack);
}

/** When the deal takes the nth tile from the live end, once the wall is built. */
function dealDelay(n: number): number {
  // Twelve cubes of four, then one tile a stack.
  const stack = n < 48 ? Math.floor(n / 4) : 12 + (n - 48);
  return WALL_BUILD_MS + Math.min(stack, DEAL_STACKS - 1) * DEAL_STEP_MS;
}

/** Where a stack starts before it is pushed out to its place: a heap in the middle. */
function heapOffset(geometry: WallGeometry, i: number, hand: number) {
  const s = geometry.stacks[i];
  const r = geometry.tile * 3.2 * Math.sqrt(jitter(hand * 131 + i));
  const a = jitter(hand * 71 + i * 3.7) * Math.PI * 2;
  return {
    x: geometry.centre.x + Math.cos(a) * r - s.cx,
    y: geometry.centre.y + Math.sin(a) * r - s.cy,
    spin: (jitter(hand * 17 + i) - 0.5) * 300,
  };
}

/**
 * The tiles still to be drawn, faint under everything else. When a hand opens
 * the wall is built first — every stack pushed out of a heap in the middle to
 * its place, the four walls at once — then the deal takes its tiles stack by
 * stack and the opening replacements go as their flowers are laid down.
 */
export function TableWall({
  geometry,
  brk,
  view,
  opening,
  hidden,
}: {
  geometry: WallGeometry;
  brk: number;
  view: RoomView;
  /** The hand is being opened on screen: build, deal, flowers. */
  opening: boolean;
  /** Turned off in the table's settings: shown while it is built and dealt from, then gone. */
  hidden: boolean;
}) {
  const stacks = geometry.stacks.length;
  const { head, tail } = wallTaken(view, stacks * 2);
  // Per stack and layer: undefined is still there, a number is when it goes, null is gone.
  const leaves: (number | null | undefined)[][] = Array.from({ length: stacks }, () => [
    undefined,
    undefined,
  ]);
  for (let n = 0; n < Math.min(head, stacks * 2); n++) {
    const { stack, top } = headTile(stacks, brk, n);
    leaves[stack][top ? 1 : 0] = opening ? dealDelay(n) : null;
  }
  for (let m = 0; m < Math.min(tail, stacks * 2 - head); m++) {
    const { stack, top } = tailTile(stacks, brk, m);
    leaves[stack][top ? 1 : 0] = opening ? DEAL_MS + m * FLOWER_STEP_MS : null;
  }

  const lift = geometry.tile * 0.22;
  return (
    <div
      className={["wall", opening ? "wall--opening" : "", hidden && !opening ? "wall--hidden" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {geometry.stacks.map((s, i) => {
        const [bottom, top] = leaves[i];
        if (bottom === null && top === null) return null;
        const heap = opening ? heapOffset(geometry, i, view.handNumber) : null;
        const style: Vars = {
          left: s.cx,
          top: s.cy,
          "--w": `${s.w}px`,
          "--h": `${s.h}px`,
          "--rot": `${s.rot}deg`,
          "--lift": `${lift}px`,
        };
        if (heap) {
          style["--heap-x"] = `${heap.x}px`;
          style["--heap-y"] = `${heap.y}px`;
          style["--heap-spin"] = `${heap.spin}deg`;
          style.animationDelay = `${s.index * BUILD_STEP_MS}ms`;
          style.animationDuration = `${BUILD_FLIGHT_MS}ms`;
        }
        return (
          <span key={i} className={heap ? "wall__stack wall__stack--building" : "wall__stack"} style={style}>
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
  const { head, tail } = wallTaken(view, geometry.stacks.length * 2);
  const latest = useRef({ geometry, brk, view, rackCentre });
  latest.current = { geometry, brk, view, rackCentre };

  useEffect(() => {
    const before = seen.current;
    seen.current = { hand: view.handNumber, head, tail };
    if (!enabled || !before || before.hand !== view.handNumber) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const { geometry, brk, view: v, rackCentre } = latest.current;
    const taken: { stack: number }[] = [];
    const stacks = geometry.stacks.length;
    for (let n = before.head; n < head; n++) taken.push(headTile(stacks, brk, n));
    for (let m = before.tail; m < tail; m++) taken.push(tailTile(stacks, brk, m));
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
