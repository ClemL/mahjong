"use client";

import { type TileCode, rankOf, suitOf } from "@/game/tiles";

/**
 * Pip artwork for the Dots (筒) and Bamboo (索) suits.
 *
 * Both are drawn on a 0–100 square and inherit `currentColor`, so a tile keeps
 * its suit color and the artwork scales cleanly from the 22px pond size up to
 * the zoomed hand. Characters (萬) keep the traditional numeral-over-萬 face,
 * and honors keep their glyphs, so only these two suits need artwork.
 *
 * Traditional sets color individual pips (a red five, a green one bamboo). We
 * deliberately draw every pip in the suit color instead: the suits have to stay
 * apart at a glance, and a red pip would read as a Red Dragon.
 */

/** Circle centres for each Dots rank, in a 0–100 field. */
const DOT_LAYOUTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[50, 27], [50, 73]],
  3: [[24, 24], [50, 50], [76, 76]],
  4: [[31, 31], [69, 31], [31, 69], [69, 69]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[31, 20], [69, 20], [31, 50], [69, 50], [31, 80], [69, 80]],
  // Three slanted across the top, four squared below.
  7: [[24, 16], [50, 25], [76, 34], [31, 62], [69, 62], [31, 84], [69, 84]],
  8: [[34, 15], [66, 15], [34, 38], [66, 38], [34, 62], [66, 62], [34, 85], [66, 85]],
  9: [[22, 22], [50, 22], [78, 22], [22, 50], [50, 50], [78, 50], [22, 78], [50, 78], [78, 78]],
};

function dotRadius(rank: number): number {
  if (rank === 1) return 26;
  if (rank <= 3) return 17;
  if (rank === 4) return 15;
  if (rank === 5) return 13;
  if (rank <= 7) return 12.5;
  return 12;
}

function Dots({ rank }: { rank: number }) {
  const centres = DOT_LAYOUTS[rank] ?? [];
  const r = dotRadius(rank);
  return (
    <g>
      {centres.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill="currentColor" />
          <circle cx={cx} cy={cy} r={r * 0.46} fill="var(--tile-face)" />
        </g>
      ))}
    </g>
  );
}

/** Sticks per row for each Bamboo rank, top row first. */
const BAMBOO_ROWS: Record<number, number[]> = {
  1: [1],
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 1, 2],
  6: [3, 3],
  7: [1, 3, 3],
  8: [4, 4],
  9: [3, 3, 3],
};

/** One bamboo stick: a rounded stalk with a segment notch and a pair of leaves. */
function Stick({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={w * 0.42} fill="currentColor" />
      <rect
        x={x}
        y={y + h * 0.44}
        width={w}
        height={h * 0.12}
        fill="var(--tile-face)"
        opacity={0.9}
      />
      <circle cx={cx} cy={y + h * 0.12} r={w * 0.2} fill="var(--tile-face)" opacity={0.85} />
    </g>
  );
}

function Bamboo({ rank }: { rank: number }) {
  // A single bamboo is drawn as one tall stalk, standing in for the bird that
  // traditional sets use — a bird does not survive being shrunk to 22px.
  if (rank === 1) {
    return (
      <g>
        <Stick x={40} y={16} w={20} h={68} />
        <ellipse cx={26} cy={30} rx={13} ry={7} fill="currentColor" transform="rotate(-28 26 30)" />
        <ellipse cx={74} cy={30} rx={13} ry={7} fill="currentColor" transform="rotate(28 74 30)" />
      </g>
    );
  }

  const rows = BAMBOO_ROWS[rank] ?? [];
  const rowCount = rows.length;
  const stickH = rowCount === 2 ? 38 : rowCount === 3 ? 27 : 32;
  const gapY = rowCount === 2 ? 14 : 8;
  const totalH = rowCount * stickH + (rowCount - 1) * gapY;
  const startY = (100 - totalH) / 2;

  return (
    <g>
      {rows.map((count, rowIndex) => {
        const y = startY + rowIndex * (stickH + gapY);
        const w = count >= 4 ? 15 : 18;
        const gapX = count >= 4 ? 7 : 11;
        const totalW = count * w + (count - 1) * gapX;
        const startX = (100 - totalW) / 2;
        return rows[rowIndex] === 0 ? null : (
          <g key={rowIndex}>
            {Array.from({ length: count }, (_, i) => (
              <Stick key={i} x={startX + i * (w + gapX)} y={y} w={w} h={stickH} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Returns the pip artwork for a tile, or null when the tile uses a glyph face. */
export function TilePips({ code }: { code: TileCode }) {
  const suit = suitOf(code);
  if (suit !== "p" && suit !== "s") return null;
  const rank = rankOf(code);
  return (
    <svg className="tile__pips" viewBox="0 0 100 100" aria-hidden focusable="false">
      {suit === "p" ? <Dots rank={rank} /> : <Bamboo rank={rank} />}
    </svg>
  );
}

/** True when a tile is drawn with pip artwork rather than a glyph. */
export function hasPips(code: TileCode): boolean {
  const suit = suitOf(code);
  return suit === "p" || suit === "s";
}
