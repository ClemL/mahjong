"use client";

import { type TileCode, rankOf, suitOf } from "@/game/tiles";

/**
 * Pip artwork for the Dots (筒) and Bamboo (索) suits.
 *
 * Drawn on a 0–100 square, entirely in strokes and fills of `currentColor`, so
 * a tile keeps its suit color under any palette and the artwork stays crisp
 * from the 22px pond up to the zoomed hand. Nothing is filled with the tile's
 * face color: rings are strokes and stalks are separate segments, so the
 * suit's faint wash on the tile shows through the gaps instead of being
 * covered by a near-match.
 *
 * Characters (萬) and honors keep their glyph faces, which is already how
 * those tiles look on a real set.
 */

// ---------------------------------------------------------------------------
// Dots 筒
// ---------------------------------------------------------------------------

/** Circle centres per rank, in a 0–100 field. */
const DOT_LAYOUTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[50, 28], [50, 72]],
  3: [[24, 24], [50, 50], [76, 76]],
  4: [[31, 31], [69, 31], [31, 69], [69, 69]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[31, 20], [69, 20], [31, 50], [69, 50], [31, 80], [69, 80]],
  // Three slanted across the top, four squared below — the traditional seven.
  7: [[24, 16], [50, 25], [76, 34], [31, 62], [69, 62], [31, 84], [69, 84]],
  8: [[34, 15], [66, 15], [34, 38], [66, 38], [34, 62], [66, 62], [34, 85], [66, 85]],
  9: [[22, 22], [50, 22], [78, 22], [22, 50], [50, 50], [78, 50], [22, 78], [50, 78], [78, 78]],
};

function dotRadius(rank: number): number {
  if (rank === 1) return 27;
  if (rank <= 3) return 17;
  if (rank === 4) return 15;
  if (rank === 5) return 13.5;
  if (rank <= 7) return 12.5;
  return 12;
}

/** A single dot: an outer ring around a solid centre, as the tiles are carved. */
function Dot({ cx, cy, r, elaborate }: { cx: number; cy: number; r: number; elaborate?: boolean }) {
  const ring = Math.max(r * 0.26, 1.6);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - ring / 2} fill="none" stroke="currentColor" strokeWidth={ring} />
      {elaborate ? (
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.6}
          fill="none"
          stroke="currentColor"
          strokeWidth={ring * 0.55}
        />
      ) : null}
      <circle cx={cx} cy={cy} r={r * (elaborate ? 0.26 : 0.3)} fill="currentColor" />
    </g>
  );
}

function Dots({ rank }: { rank: number }) {
  const centres = DOT_LAYOUTS[rank] ?? [];
  const r = dotRadius(rank);
  return (
    <g>
      {centres.map(([cx, cy], i) => (
        <Dot key={i} cx={cx} cy={cy} r={r} elaborate={rank === 1} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Bamboo 索
// ---------------------------------------------------------------------------

/** Sticks per row for each rank, top row first. */
const BAMBOO_ROWS: Record<number, number[]> = {
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 1, 2],
  6: [3, 3],
  7: [1, 3, 3],
  8: [4, 4],
  9: [3, 3, 3],
};

/**
 * One cane: a stalk broken by node gaps. No leaves — at the sizes the six
 * through nine need, a leaf pair outgrows the stalk it sits on and the tile
 * starts to read as wheat. Most sets draw these as plain segmented bars.
 */
function Cane({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // A node only helps while each segment stays taller than it is wide;
  // split further and the cane reads as a stack of beads.
  const nodes = h >= 30 ? 1 : 0;
  const gap = nodes > 0 ? Math.max(h * 0.07, 1.4) : 0;
  const segment = (h - gap * nodes) / (nodes + 1);
  return (
    <g>
      {Array.from({ length: nodes + 1 }, (_, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * (segment + gap)}
          width={w}
          height={segment}
          rx={w * 0.3}
          fill="currentColor"
        />
      ))}
    </g>
  );
}

/**
 * One Bamboo is a bird on every traditional set. Drawn as a perched sparrow
 * with a fanned tail — enough shape to be recognisable at 22px, where a
 * faithful peacock would be mud.
 */
function BambooBird() {
  return (
    <g>
      {/* Tail, fanned up and to the right. */}
      <path d="M60 54 L96 22 L88 40 L98 42 L84 58 Z" fill="currentColor" />
      {/* Body. */}
      <path
        d="M62 58 C62 42 54 30 42 30 C30 30 22 41 22 54 C22 68 32 78 46 78 C56 78 62 70 62 58 Z"
        fill="currentColor"
      />
      {/* Wing, cut out of the body so it reads as a separate plane. */}
      <path
        d="M50 46 C44 48 38 55 36 66 C44 66 52 60 55 51 Z"
        fill="var(--tile-face)"
        opacity={0.55}
      />
      {/* Head and beak. */}
      <circle cx={36} cy={28} r={11} fill="currentColor" />
      <path d="M27 25 L14 30 L27 34 Z" fill="currentColor" />
      <circle cx={38} cy={26} r={2.6} fill="var(--tile-face)" />
      {/* Perch. */}
      <rect x={30} y={82} width={40} height={9} rx={4.5} fill="currentColor" />
      <path d="M44 78 L44 82 M56 78 L56 82" stroke="currentColor" strokeWidth={3} />
    </g>
  );
}

function Bamboo({ rank }: { rank: number }) {
  if (rank === 1) return <BambooBird />;

  const rows = BAMBOO_ROWS[rank] ?? [];
  const rowCount = rows.length;
  const caneH = rowCount === 2 ? 38 : rowCount === 3 ? 26 : 36;
  const gapY = rowCount === 2 ? 16 : 11;
  const totalH = rowCount * caneH + (rowCount - 1) * gapY;
  const startY = (100 - totalH) / 2;

  return (
    <g>
      {rows.map((count, rowIndex) => {
        const y = startY + rowIndex * (caneH + gapY);
        // Wider canes than the gaps between them, so the stalks read as bamboo
        // rather than as stems.
        const w = count >= 4 ? 10 : count === 3 ? 11 : 13;
        const gapX = count >= 4 ? 12 : count === 3 ? 16 : 22;
        const totalW = count * w + (count - 1) * gapX;
        const startX = (100 - totalW) / 2;
        return (
          <g key={rowIndex}>
            {Array.from({ length: count }, (_, i) => (
              <Cane key={i} x={startX + i * (w + gapX)} y={y} w={w} h={caneH} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Pip artwork for a tile, or null when the tile uses a glyph face. */
export function TilePips({ code }: { code: TileCode }) {
  const suit = suitOf(code);
  if (suit !== "p" && suit !== "s") return null;
  const rank = rankOf(code);
  return (
    <svg
      className="tile__pips"
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {suit === "p" ? <Dots rank={rank} /> : <Bamboo rank={rank} />}
    </svg>
  );
}

/** True when a tile is drawn with pip artwork rather than a glyph. */
export function hasPips(code: TileCode): boolean {
  const suit = suitOf(code);
  return suit === "p" || suit === "s";
}
