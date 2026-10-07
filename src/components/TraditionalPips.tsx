"use client";

import type { CSSProperties } from "react";
import { type TileCode, rankOf, suitOf } from "@/game/tiles";

/**
 * Pip artwork as a Hong Kong parlour set paints it: Dots and Bamboo in red,
 * green and blue rather than one suit ink, the One Bamboo as a colored bird,
 * the Eight Bamboo as a W over an M, and the Nine with its red middle column.
 *
 * The plain pip drawing in TilePips stays one color so it can follow the suit
 * palette; this one is fixed to the set's traditional inks. Its layouts match
 * the plain drawing's counts, so the shape alone still names the tile.
 */

type Ink = "r" | "g" | "b";

// The inks are CSS tokens so a theme could retune them; style, not the fill
// attribute, because presentation attributes do not resolve var().
const INK: Record<Ink, CSSProperties> = {
  r: { fill: "var(--trad-red)" },
  g: { fill: "var(--trad-green)" },
  b: { fill: "var(--trad-blue)" },
};
const FACE: CSSProperties = { fill: "var(--tile-face)" };

// ---------------------------------------------------------------------------
// Dots 筒
// ---------------------------------------------------------------------------

/** Centre and ink per dot, in a 0–100 field, read top-left to bottom-right. */
const DOTS: Record<number, [number, number, Ink][]> = {
  2: [[50, 28, "g"], [50, 72, "b"]],
  3: [[24, 24, "b"], [50, 50, "r"], [76, 76, "g"]],
  4: [[31, 31, "b"], [69, 31, "g"], [31, 69, "g"], [69, 69, "b"]],
  5: [[26, 26, "b"], [74, 26, "g"], [50, 50, "r"], [26, 74, "g"], [74, 74, "b"]],
  // Two green above four red, the six as every set paints it.
  6: [[31, 18, "g"], [69, 18, "g"], [31, 52, "r"], [69, 52, "r"], [31, 82, "r"], [69, 82, "r"]],
  7: [[24, 15, "g"], [50, 25, "g"], [76, 35, "g"], [31, 62, "r"], [69, 62, "r"], [31, 85, "r"], [69, 85, "r"]],
  8: [[34, 14, "b"], [66, 14, "b"], [34, 38, "b"], [66, 38, "b"], [34, 62, "b"], [66, 62, "b"], [34, 86, "b"], [66, 86, "b"]],
  // Blue, red and green rows.
  9: [[22, 20, "b"], [50, 20, "b"], [78, 20, "b"], [22, 50, "r"], [50, 50, "r"], [78, 50, "r"], [22, 80, "g"], [50, 80, "g"], [78, 80, "g"]],
};

function dotRadius(rank: number): number {
  if (rank <= 3) return 17;
  if (rank === 4) return 15.5;
  if (rank === 5) return 14;
  if (rank <= 7) return 12.5;
  return 12;
}

/** A coin: a solid band, a face-colored gap, a solid boss and a pierced centre. */
function Coin({ cx, cy, r, ink }: { cx: number; cy: number; r: number; ink: Ink }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} style={INK[ink]} />
      <circle cx={cx} cy={cy} r={r * 0.66} style={FACE} />
      <circle cx={cx} cy={cy} r={r * 0.46} style={INK[ink]} />
      <circle cx={cx} cy={cy} r={r * 0.15} style={FACE} />
    </g>
  );
}

/** The One Dot: a green band, a ring of blue beads, and a red flower at the heart. */
function BigDot() {
  const beads = 12;
  const petals = 6;
  return (
    <g>
      <circle cx={50} cy={50} r={36} style={INK.g} />
      <circle cx={50} cy={50} r={29} style={FACE} />
      {Array.from({ length: beads }, (_, i) => {
        const a = (i / beads) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 22} cy={50 + Math.sin(a) * 22} r={4.6} style={INK.b} />;
      })}
      <circle cx={50} cy={50} r={14} style={INK.r} />
      {Array.from({ length: petals }, (_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 7.5} cy={50 + Math.sin(a) * 7.5} r={3} style={FACE} />;
      })}
      <circle cx={50} cy={50} r={2.6} style={INK.g} />
    </g>
  );
}

function Dots({ rank }: { rank: number }) {
  if (rank === 1) return <BigDot />;
  const r = dotRadius(rank);
  return (
    <g>
      {(DOTS[rank] ?? []).map(([cx, cy, ink], i) => (
        <Coin key={i} cx={cx} cy={cy} r={r} ink={ink} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Bamboo 索
// ---------------------------------------------------------------------------

/** One stick: centre, length, tilt in degrees (positive leans right, "/") and ink. */
type Stick = [cx: number, cy: number, h: number, tilt: number, ink: Ink];

/** Sparse tiles get fatter canes, so the two and three do not look like wire. */
function stickWidth(rank: number): number {
  return rank <= 5 ? 12 : 10;
}

/** Builds a row of sticks of one length, spread evenly across the field. */
function row(cy: number, h: number, xs: number[], inks: Ink[], tilts: number[] = []): Stick[] {
  return xs.map((x, i) => [x, cy, h, tilts[i] ?? 0, inks[i]]);
}

const STICKS: Record<number, Stick[]> = {
  2: [...row(27, 38, [50], ["g"]), ...row(73, 38, [50], ["b"])],
  3: [...row(27, 38, [50], ["b"]), ...row(73, 38, [30, 70], ["g", "g"])],
  4: [...row(27, 38, [30, 70], ["b", "g"]), ...row(73, 38, [30, 70], ["g", "b"])],
  // Four corners with the red stick standing alone in the middle.
  5: [
    ...row(27, 38, [20, 80], ["g", "b"]),
    ...row(50, 38, [50], ["r"]),
    ...row(73, 38, [20, 80], ["b", "g"]),
  ],
  6: [...row(27, 38, [22, 50, 78], ["g", "g", "g"]), ...row(73, 38, [22, 50, 78], ["g", "g", "g"])],
  // The red stick crowns two green rows.
  7: [
    ...row(17, 26, [50], ["r"]),
    ...row(50, 26, [22, 50, 78], ["g", "g", "g"]),
    ...row(83, 26, [22, 50, 78], ["g", "g", "g"]),
  ],
  // A W over an M: the outer sticks stand upright and parallel, and only the
  // inner pair leans — together at the foot on top, at the head below.
  8: [
    ...row(27, 40, [14, 38, 62, 86], ["g", "g", "g", "g"], [0, -22, 22, 0]),
    ...row(73, 40, [14, 38, 62, 86], ["b", "b", "b", "b"], [0, 22, -22, 0]),
  ],
  // Three columns of three; the middle column is red.
  9: [
    ...row(17, 26, [22, 50, 78], ["g", "r", "g"]),
    ...row(50, 26, [22, 50, 78], ["g", "r", "g"]),
    ...row(83, 26, [22, 50, 78], ["g", "r", "g"]),
  ],
};

/**
 * A cane with knuckles at the ends and the middle, and a face-colored seam
 * down its length — the seam is what makes a painted stick read as bamboo
 * rather than a bar.
 */
function Cane({ stick: [cx, cy, h, tilt, ink], w }: { stick: Stick; w: number }) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const knuckle = w * 0.32;
  const knuckles = [y, cy - knuckle / 2, y + h - knuckle];
  return (
    <g transform={tilt ? `rotate(${tilt} ${cx} ${cy})` : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={w * 0.35} style={INK[ink]} />
      <rect x={cx - w * 0.07} y={y + knuckle} width={w * 0.14} height={h - knuckle * 2} style={FACE} />
      {knuckles.map((ky, i) => (
        <rect key={i} x={x - w * 0.15} y={ky} width={w * 1.3} height={knuckle} rx={knuckle / 2} style={INK[ink]} />
      ))}
    </g>
  );
}

/** The One Bamboo: the plain drawing's sparrow, painted green, red and blue. */
function Bird() {
  return (
    <g>
      <path d="M60 54 L96 22 L88 40 L98 42 L84 58 Z" style={INK.b} />
      <path
        d="M62 58 C62 42 54 30 42 30 C30 30 22 41 22 54 C22 68 32 78 46 78 C56 78 62 70 62 58 Z"
        style={INK.g}
      />
      <path d="M50 46 C44 48 38 55 36 66 C44 66 52 60 55 51 Z" style={INK.b} />
      <circle cx={36} cy={28} r={11} style={INK.r} />
      <path d="M27 25 L14 30 L27 34 Z" style={INK.r} />
      <circle cx={38} cy={26} r={2.6} style={FACE} />
      <rect x={30} y={82} width={40} height={9} rx={4.5} style={INK.g} />
      <path d="M44 78 L44 82 M56 78 L56 82" stroke="var(--trad-green)" strokeWidth={3} />
    </g>
  );
}

function Bamboo({ rank }: { rank: number }) {
  if (rank === 1) return <Bird />;
  return (
    <g>
      {(STICKS[rank] ?? []).map((stick, i) => (
        <Cane key={i} stick={stick} w={stickWidth(rank)} />
      ))}
    </g>
  );
}

/** Traditional pip artwork for a Dots or Bamboo tile, or null for any other. */
export function TraditionalPips({ code }: { code: TileCode }) {
  const suit = suitOf(code);
  if (suit !== "p" && suit !== "s") return null;
  const rank = rankOf(code);
  return (
    <svg
      className="tile__pips tile__pips--trad"
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {suit === "p" ? <Dots rank={rank} /> : <Bamboo rank={rank} />}
    </svg>
  );
}
