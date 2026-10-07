"use client";

import type { CSSProperties, ReactNode } from "react";
import { type TileCode, isFlower } from "@/game/tiles";

/**
 * Bonus tiles as a Hong Kong set paints them: a flower or seasonal motif with
 * the tile's number, 1 to 4, in the corner. The number is what play actually
 * reads — it names the seat the tile belongs to — so it is drawn large; the
 * flowers count in red and the seasons in blue, as on most sets, and the
 * motif alone still tells the two groups apart.
 */

const ink = (token: string): CSSProperties => ({ fill: `var(--trad-${token})` });
const line = (token: string, width: number): CSSProperties => ({
  fill: "none",
  stroke: `var(--trad-${token})`,
  strokeWidth: width,
  strokeLinecap: "round",
});

/** A five-petalled blossom: plum and peach share the shape, not the color. */
function Blossom({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <g>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={cx + Math.cos(a) * r * 0.55} cy={cy + Math.sin(a) * r * 0.55} r={r * 0.5} style={ink(color)} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.28} style={ink("yellow")} />
    </g>
  );
}

/** A slender pointed leaf from (x, y), pointing along `angle` degrees. */
function Leaf({ x, y, angle, length, width, color = "green" }: {
  x: number; y: number; angle: number; length: number; width: number; color?: string;
}) {
  return (
    <path
      d={`M0 0 Q${length / 2} ${-width} ${length} 0 Q${length / 2} ${width} 0 0 Z`}
      transform={`translate(${x} ${y}) rotate(${angle})`}
      style={ink(color)}
    />
  );
}

// 梅 Plum: a dark branch carrying red blossoms.
function Plum() {
  return (
    <g>
      <path d="M18 92 C30 70 40 62 52 52 C62 44 70 32 84 22" style={line("brown", 5)} />
      <path d="M44 58 C38 48 36 40 38 30" style={line("brown", 3.5)} />
      <Blossom cx={66} cy={38} r={15} color="red" />
      <Blossom cx={38} cy={30} r={12} color="red" />
      <Blossom cx={30} cy={74} r={11} color="red" />
      <circle cx={84} cy={20} r={4} style={ink("red")} />
    </g>
  );
}

// 蘭 Orchid: long arching leaves and a purple bloom.
function Orchid() {
  return (
    <g>
      <path d="M50 94 C40 70 24 52 10 46" style={line("green", 3.5)} />
      <path d="M50 94 C52 66 60 46 80 30" style={line("green", 3.5)} />
      <path d="M50 94 C46 74 44 58 46 38" style={line("green", 3)} />
      <path d="M50 94 C60 78 74 70 92 70" style={line("green", 3)} />
      <g transform="translate(58 42)">
        <Leaf x={0} y={0} angle={-100} length={22} width={7} color="purple" />
        <Leaf x={0} y={0} angle={-20} length={20} width={7} color="purple" />
        <Leaf x={0} y={0} angle={-170} length={20} width={7} color="purple" />
        <Leaf x={0} y={0} angle={70} length={14} width={6} color="pink" />
        <circle r={3.5} style={ink("yellow")} />
      </g>
    </g>
  );
}

/** A many-petalled head, as the chrysanthemum and the lotus are drawn. */
function Rays({ cx, cy, r, count, color, centre }: {
  cx: number; cy: number; r: number; count: number; color: string; centre: string;
}) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <Leaf key={i} x={cx} y={cy} angle={(i / count) * 360} length={r} width={r * 0.22} color={color} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.3} style={ink(centre)} />
    </g>
  );
}

// 菊 Chrysanthemum: a golden head on a leafy stem.
function Chrysanthemum() {
  return (
    <g>
      <path d="M50 96 C50 80 52 66 54 52" style={line("green", 3.5)} />
      <Leaf x={51} y={82} angle={-150} length={24} width={8} />
      <Leaf x={52} y={72} angle={-30} length={24} width={8} />
      <Rays cx={54} cy={40} r={26} count={18} color="orange" centre="yellow" />
      <Rays cx={54} cy={40} r={15} count={12} color="yellow" centre="orange" />
    </g>
  );
}

// 竹 Bamboo: a jointed stalk with sprays of leaves.
function BambooPlant() {
  return (
    <g>
      {[[44, 96, 70], [44, 66, 40], [44, 36, 12]].map(([x, y0, y1], i) => (
        <rect key={i} x={x - 5} y={y1} width={10} height={y0 - y1 - 3} rx={3} style={ink("green")} />
      ))}
      <Leaf x={49} y={40} angle={-30} length={34} width={6} />
      <Leaf x={49} y={42} angle={0} length={30} width={6} />
      <Leaf x={49} y={44} angle={25} length={26} width={5} />
      <Leaf x={39} y={68} angle={200} length={30} width={6} />
      <Leaf x={39} y={70} angle={170} length={26} width={5} />
      <Leaf x={49} y={14} angle={-50} length={22} width={5} />
    </g>
  );
}

// 春 Spring: pink peach blossom on a budding branch.
function Spring() {
  return (
    <g>
      <path d="M86 90 C70 74 58 66 46 54 C36 44 28 30 20 18" style={line("brown", 4.5)} />
      <Leaf x={62} y={70} angle={-80} length={16} width={5} />
      <Leaf x={36} y={42} angle={190} length={16} width={5} />
      <Blossom cx={50} cy={40} r={15} color="pink" />
      <Blossom cx={70} cy={58} r={12} color="pink" />
      <Blossom cx={26} cy={66} r={10} color="pink" />
      <circle cx={20} cy={16} r={4} style={ink("pink")} />
    </g>
  );
}

// 夏 Summer: a lotus over its round pad.
function Summer() {
  return (
    <g>
      <ellipse cx={50} cy={80} rx={40} ry={12} style={ink("green")} />
      <path d="M50 80 L50 68" style={line("green", 3)} />
      {[-60, -30, 0, 30, 60].map((a) => (
        <Leaf key={a} x={50} y={66} angle={-90 + a} length={a === 0 ? 40 : 34} width={11} color={Math.abs(a) === 30 ? "red" : "pink"} />
      ))}
      <circle cx={50} cy={60} r={5} style={ink("yellow")} />
    </g>
  );
}

/** A seven-lobed maple leaf, drawn as lobes from its stalk. */
function Maple({ x, y, size, angle, color }: { x: number; y: number; size: number; angle: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      {[-120, -80, -40, 0, 40, 80, 120].map((a) => (
        <Leaf key={a} x={0} y={0} angle={a - 90} length={Math.abs(a) > 90 ? size * 0.55 : Math.abs(a) > 30 ? size * 0.85 : size} width={size * 0.22} color={color} />
      ))}
      <path d={`M0 0 L0 ${size * 0.6}`} style={line("brown", 2.5)} />
    </g>
  );
}

// 秋 Autumn: falling maple leaves.
function Autumn() {
  return (
    <g>
      <Maple x={46} y={44} size={30} angle={-10} color="red" />
      <Maple x={74} y={78} size={18} angle={25} color="orange" />
      <Maple x={22} y={82} size={14} angle={-35} color="orange" />
    </g>
  );
}

// 冬 Winter: a snowflake over a sprig of pine.
function Winter() {
  const arms = 6;
  return (
    <g>
      <path d="M14 92 L86 72" style={line("brown", 4)} />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 22 + i * 7.5;
        const y = 90 - i * 2.1;
        return (
          <g key={i}>
            <path d={`M${x} ${y} l-5 -10`} style={line("green", 2.4)} />
            <path d={`M${x} ${y} l5 -10`} style={line("green", 2.4)} />
          </g>
        );
      })}
      <g transform="translate(50 38)">
        {Array.from({ length: arms }, (_, i) => (
          <g key={i} transform={`rotate(${(i / arms) * 360})`}>
            <path d="M0 0 L0 -28" style={line("blue", 3.5)} />
            <path d="M0 -16 l-7 -7 M0 -16 l7 -7" style={line("blue", 2.6)} />
            <path d="M0 -24 l-4 -4 M0 -24 l4 -4" style={line("blue", 2.2)} />
          </g>
        ))}
        <circle r={4} style={ink("blue")} />
      </g>
    </g>
  );
}

const ART: Record<string, () => ReactNode> = {
  f1: Plum,
  f2: Orchid,
  f3: Chrysanthemum,
  f4: BambooPlant,
  f5: Spring,
  f6: Summer,
  f7: Autumn,
  f8: Winter,
};

/** Painted bonus tile art and its corner number, or null for any other tile. */
export function TraditionalFlower({ code }: { code: TileCode }) {
  if (!isFlower(code)) return null;
  const n = Number(code.slice(1));
  const Art = ART[code];
  return (
    <>
      <svg
        className="tile__flower"
        viewBox="0 0 100 100"
        aria-hidden
        focusable="false"
        shapeRendering="geometricPrecision"
      >
        <Art />
      </svg>
      <span className={`tile__flower-num tile__flower-num--${n <= 4 ? "flower" : "season"}`} aria-hidden>
        {((n - 1) % 4) + 1}
      </span>
    </>
  );
}
