/**
 * Geometry for the shared table screen.
 *
 * The felt is a rectangle of whatever shape the tablet happens to be. Along
 * each edge runs a rack for that seat; inside them, each seat's discards sit in
 * a block in front of its owner, and a console fills the middle. The discards
 * are what everyone is watching, so the tile size is solved for: the largest
 * tile at which all four ponds hold `capacity` discards without crowding the
 * console out.
 *
 * Pure arithmetic — no DOM — so it can be checked against real screen sizes
 * without a browser.
 */
import type { CSSProperties } from "react";

export interface TableLayoutInput {
  /** The felt's measured size, racks included. */
  width: number;
  height: number;
  /** Discards each pond must hold at the chosen size. */
  capacity: number;
  /** Per seat: the exposed tiles (melds and flowers) its rack carries. */
  revealed: readonly number[];
  /** Per seat: separate groups on its rack (each meld, plus one for flowers). */
  groups: readonly number[];
}

/** A box positioned by its centre, then rotated to face a seat. */
export interface Placement {
  cx: number;
  cy: number;
  /** Width and height in the box's own frame, before rotation. */
  w: number;
  h: number;
  rotate: number;
}

export interface PondShape {
  rows: number;
  cols: number;
}

export interface TableLayout {
  /** Discard tile width. */
  tile: number;
  /** Gap between discards. */
  gap: number;
  /** Rack thickness, and per seat the exposed-tile width inside it. */
  rack: number;
  rackTiles: [number, number, number, number];
  /** Width of the last discard shown in the console. */
  spotlight: number;
  /** Ponds facing the bottom/top seats and the left/right seats. */
  across: PondShape;
  side: PondShape;
  racks: [Placement, Placement, Placement, Placement];
  ponds: [Placement, Placement, Placement, Placement];
  console: Placement;
}

/** Tile height over width, as drawn by `.tile`. */
export const TILE_RATIO = 1.38;

const GAP = 3;
/** Room left between the racks and the ponds, and the ponds and the console. */
const MARGIN = 8;
/** The band on each side of the console that carries the seat winds. */
const CONSOLE_BAND = 24;
/** The line under the last discard naming who threw it. */
const CAPTION = 24;
const MIN_TILE = 20;
const MAX_TILE = 96;
const MAX_ROWS = 6;
/** A pond any wider stops reading as one player's pile and starts at their elbow. */
const MAX_COLS = 12;
const MAX_RACK_TILE = 34;
/** Wood showing around each rack, so the four never touch at the corners. */
const RACK_INSET = 5;
/** What a rack spends on wind, name and hand count before any tiles. */
const RACK_INFO = 240;

/** Height a row of discards takes, leaving room for the tile's drop shadow. */
function rowPitch(tile: number): number {
  return tile * (TILE_RATIO + 0.08) + GAP;
}

/** Length a row of `cols` discards takes. */
function rowLength(tile: number, cols: number): number {
  return cols * (tile + GAP) - GAP;
}

/**
 * Seat → screen rotation. Seat 0 sits at the bottom and play passes
 * counter-clockwise, so South is on the right, West across, North on the left.
 * Each box is drawn as its owner would read it and turned to face them.
 */
export const SEAT_ROTATION = [0, -90, 180, 90] as const;

interface Candidate {
  across: PondShape;
  side: PondShape;
  centerW: number;
  centerH: number;
}

/**
 * The best pond shapes for one tile size, or null if none fits. Two shapes
 * are tried: the across ponds fitting between the side ponds (which may then
 * run the full height), or the side ponds fitting between the across ponds.
 * A landscape tablet almost always wants the first.
 */
function fitPonds(tile: number, width: number, height: number, capacity: number): Candidate | null {
  const pitch = rowPitch(tile);
  const minInner = TILE_RATIO * tile * 1.3;
  const minW = Math.max(170, 2 * CONSOLE_BAND + minInner);
  const minH = Math.max(120, 2 * CONSOLE_BAND + CAPTION + minInner);
  let best: Candidate | null = null;

  for (let acrossRows = 1; acrossRows <= MAX_ROWS; acrossRows++) {
    for (let sideRows = 1; sideRows <= MAX_ROWS; sideRows++) {
      const across = { rows: acrossRows, cols: Math.ceil(capacity / acrossRows) };
      const side = { rows: sideRows, cols: Math.ceil(capacity / sideRows) };
      if (across.cols > MAX_COLS || side.cols > MAX_COLS) continue;
      const acrossDepth = acrossRows * pitch;
      const sideDepth = sideRows * pitch;
      const acrossLength = rowLength(tile, across.cols);
      const sideLength = rowLength(tile, side.cols);

      const acrossBetweenSides =
        acrossLength <= width - 2 * (sideDepth + MARGIN) && sideLength <= height;
      const sidesBetweenAcross =
        sideLength <= height - 2 * (acrossDepth + MARGIN) && acrossLength <= width;
      if (!acrossBetweenSides && !sidesBetweenAcross) continue;

      const centerW = width - 2 * (sideDepth + MARGIN);
      const centerH = height - 2 * (acrossDepth + MARGIN);
      if (centerW < minW || centerH < minH) continue;

      if (!best || centerW * centerH > best.centerW * best.centerH) {
        best = { across, side, centerW, centerH };
      }
    }
  }
  return best;
}

export function layoutTable({
  width,
  height,
  capacity,
  revealed,
  groups,
}: TableLayoutInput): TableLayout {
  const rack = Math.round(Math.min(84, Math.max(58, Math.min(width, height) * 0.1)));
  // The middle of the felt, inside the racks.
  const midW = Math.max(0, width - 2 * rack - 2 * MARGIN);
  const midH = Math.max(0, height - 2 * rack - 2 * MARGIN);

  let tile = MIN_TILE;
  let fit: Candidate | null = null;
  for (let t = MAX_TILE; t >= MIN_TILE; t -= 1) {
    fit = fitPonds(t, midW, midH, capacity);
    if (fit) {
      tile = t;
      break;
    }
  }
  // A screen too small for any of it still gets a table, just a cramped one.
  if (!fit) {
    const rows = 4;
    const shape = { rows, cols: Math.ceil(capacity / rows) };
    const depth = rows * rowPitch(tile);
    fit = {
      across: shape,
      side: shape,
      centerW: Math.max(0, midW - 2 * (depth + MARGIN)),
      centerH: Math.max(0, midH - 2 * (depth + MARGIN)),
    };
  }

  // Exposed tiles shrink only when that rack would otherwise overflow its edge.
  const fromHeight = (rack - 2 * RACK_INSET - 12) / (TILE_RATIO + 0.06);
  const rackTile = (seat: number): number => {
    const length = (seat % 2 === 0 ? width : height) - 2 * rack - 2 * RACK_INSET;
    const count = revealed[seat] ?? 0;
    const fromLength =
      count > 0 ? (length - RACK_INFO - (groups[seat] ?? 0) * 8) / count - 2 : MAX_RACK_TILE;
    return Math.floor(Math.max(16, Math.min(MAX_RACK_TILE, fromHeight, fromLength)));
  };

  // The spotlight may be turned either way, so it has to fit both directions.
  const inner = Math.min(fit.centerW - 2 * CONSOLE_BAND, fit.centerH - 2 * CONSOLE_BAND - CAPTION);
  const spotlight = Math.floor(Math.max(tile, Math.min(tile * 2.4, (inner - 8) / (TILE_RATIO + 0.04))));

  const cx = width / 2;
  const cy = height / 2;
  const pitch = rowPitch(tile);
  const acrossDepth = fit.across.rows * pitch;
  const sideDepth = fit.side.rows * pitch;
  const acrossLength = rowLength(tile, fit.across.cols);
  const sideLength = rowLength(tile, fit.side.cols);

  const across = width - 2 * rack - 2 * RACK_INSET;
  const along = height - 2 * rack - 2 * RACK_INSET;
  const depth = rack - 2 * RACK_INSET;
  const racks: TableLayout["racks"] = [
    { cx, cy: height - rack / 2, w: across, h: depth, rotate: SEAT_ROTATION[0] },
    { cx: width - rack / 2, cy, w: along, h: depth, rotate: SEAT_ROTATION[1] },
    { cx, cy: rack / 2, w: across, h: depth, rotate: SEAT_ROTATION[2] },
    { cx: rack / 2, cy, w: along, h: depth, rotate: SEAT_ROTATION[3] },
  ];

  const ponds: TableLayout["ponds"] = [
    {
      cx,
      cy: height - rack - MARGIN - acrossDepth / 2,
      w: acrossLength,
      h: acrossDepth,
      rotate: SEAT_ROTATION[0],
    },
    {
      cx: width - rack - MARGIN - sideDepth / 2,
      cy,
      w: sideLength,
      h: sideDepth,
      rotate: SEAT_ROTATION[1],
    },
    { cx, cy: rack + MARGIN + acrossDepth / 2, w: acrossLength, h: acrossDepth, rotate: SEAT_ROTATION[2] },
    { cx: rack + MARGIN + sideDepth / 2, cy, w: sideLength, h: sideDepth, rotate: SEAT_ROTATION[3] },
  ];

  return {
    tile,
    gap: GAP,
    rack,
    rackTiles: [rackTile(0), rackTile(1), rackTile(2), rackTile(3)],
    spotlight,
    across: fit.across,
    side: fit.side,
    racks,
    ponds,
    console: { cx, cy, w: Math.max(0, fit.centerW), h: Math.max(0, fit.centerH), rotate: 0 },
  };
}

/** Inline style for a placed box. */
export function placementStyle(p: Placement): CSSProperties {
  return {
    left: p.cx,
    top: p.cy,
    width: p.w,
    height: p.h,
    transform: `translate(-50%, -50%) rotate(${p.rotate}deg)`,
  };
}
