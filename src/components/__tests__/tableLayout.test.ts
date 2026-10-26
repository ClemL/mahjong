import { describe, expect, it } from "vitest";
import { MIN_SIDE, type Placement, WIDE_RATIO, layoutTable, positionOf, splitTable } from "../tableLayout";

/** Screen rectangle a placed box covers once it is turned to face its seat. */
function footprint(p: Placement) {
  const sideways = Math.abs(p.rotate) === 90;
  const w = sideways ? p.h : p.w;
  const h = sideways ? p.w : p.h;
  return { left: p.cx - w / 2, right: p.cx + w / 2, top: p.cy - h / 2, bottom: p.cy + h / 2 };
}

function overlaps(a: Placement, b: Placement): boolean {
  const x = footprint(a);
  const y = footprint(b);
  return x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5;
}

const quiet = { revealed: [0, 0, 0, 0], groups: [0, 0, 0, 0] };

// Felt sizes left over on common tablets once the browser and the control bar
// have taken their share, plus a portrait tablet and a cramped laptop window.
const SCREENS: [string, number, number][] = [
  ["Galaxy Tab landscape", 1264, 700],
  ["iPad landscape", 1164, 720],
  ["iPad mini landscape", 1118, 660],
  ["portrait tablet", 784, 1160],
  ["laptop window", 1340, 590],
  // The square felts a widescreen tablet is given beside its side panel.
  ["Galaxy Tab, squared", 696, 696],
  ["iPad, squared", 804, 804],
  ["iPad mini, squared", 728, 728],
];

describe("table layout", () => {
  for (const [name, width, height] of SCREENS) {
    it(`fits four ponds of 24 without collisions on a ${name}`, () => {
      const layout = layoutTable({ width, height, capacity: 24, ...quiet });
      expect(layout.across.rows * layout.across.cols).toBeGreaterThanOrEqual(24);
      expect(layout.side.rows * layout.side.cols).toBeGreaterThanOrEqual(24);

      const boxes = [...layout.ponds, ...layout.racks, layout.console];
      for (let i = 0; i < boxes.length; i++) {
        const f = footprint(boxes[i]);
        expect(f.left).toBeGreaterThanOrEqual(-0.5);
        expect(f.top).toBeGreaterThanOrEqual(-0.5);
        expect(f.right).toBeLessThanOrEqual(width + 0.5);
        expect(f.bottom).toBeLessThanOrEqual(height + 0.5);
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i], boxes[j]), `boxes ${i} and ${j}`).toBe(false);
        }
      }
    });
  }

  it("draws discards larger than the hand tiles on a tablet", () => {
    // 48px is the largest tile anywhere else in the app.
    expect(layoutTable({ width: 1264, height: 700, capacity: 24, ...quiet }).tile).toBeGreaterThanOrEqual(48);
  });

  it("shrinks the discards rather than overflow a crowded pond", () => {
    const normal = layoutTable({ width: 1164, height: 720, capacity: 24, ...quiet });
    const crowded = layoutTable({ width: 1164, height: 720, capacity: 33, ...quiet });
    expect(crowded.tile).toBeLessThanOrEqual(normal.tile);
    expect(crowded.across.rows * crowded.across.cols).toBeGreaterThanOrEqual(33);
    expect(crowded.side.rows * crowded.side.cols).toBeGreaterThanOrEqual(33);
  });

  it("shrinks only the rack that is running out of room", () => {
    const layout = layoutTable({
      width: 1164,
      height: 720,
      capacity: 24,
      revealed: [0, 20, 3, 0],
      groups: [0, 6, 1, 0],
    });
    expect(layout.rackTiles[1]).toBeLessThan(layout.rackTiles[0]);
    expect(layout.rackTiles[2]).toBe(layout.rackTiles[0]);
  });
});

describe("the tablet's sizes", () => {
  // Cosy, normal, compact, extra compact: the capacity and rack scale TableTop passes for each.
  const sizes = [
    { capacity: 18, scale: 1 },
    { capacity: 24, scale: 1 },
    { capacity: 30, scale: 0.9 },
    { capacity: 42, scale: 0.8 },
  ];

  it.each(SCREENS)("draws the discards smaller at each step down, on %s", (name, width, height) => {
    const tiles = sizes.map(({ capacity, scale }) => layoutTable({ width, height, capacity, scale, ...quiet }).tile);
    // A window this short has no height for cosy to grow into; it is never smaller, though.
    if (name === "laptop window") expect(tiles[0]).toBeGreaterThanOrEqual(tiles[1]);
    else expect(tiles[0], `${tiles}`).toBeGreaterThan(tiles[1]);
    for (let i = 2; i < tiles.length; i++) expect(tiles[i], `${tiles}`).toBeLessThan(tiles[i - 1]);
  });

  it("keeps every box clear of the others at every size", () => {
    for (const [, width, height] of SCREENS) {
      for (const { capacity, scale } of sizes) {
        const layout = layoutTable({ width, height, capacity, scale, ...quiet });
        const boxes = [...layout.racks, ...layout.ponds, layout.console];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            // Racks meet at the corners by design; ponds and the console never touch anything.
            if (i < 4 && j < 4) continue;
            expect(overlaps(boxes[i], boxes[j]), `${width}x${height} capacity ${capacity}: ${i} and ${j}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("rotation", () => {
  it("moves every seat one edge clockwise per quarter turn", () => {
    // Positions run bottom, right, top, left.
    expect([0, 1, 2, 3].map((seat) => positionOf(seat, 0))).toEqual([0, 1, 2, 3]);
    // East goes from the bottom edge to the left one, South from right to bottom.
    expect([0, 1, 2, 3].map((seat) => positionOf(seat, 1))).toEqual([3, 0, 1, 2]);
    expect([0, 1, 2, 3].map((seat) => positionOf(seat, 4))).toEqual([0, 1, 2, 3]);
  });
});

// Whole table areas — the screen less the page's padding, bar included — in
// the CSS pixels each browser hands the page.
const WIDE: [string, number, number][] = [
  ["Galaxy Tab S9 in Chrome", 1248, 696],
  ["iPad in Safari", 1148, 804],
  ["iPad mini in Safari", 1101, 728],
  ["laptop window", 1408, 760],
  ["1080p monitor, full screen", 1888, 1064],
];
const SQUARE: [string, number, number][] = [
  // Opened out, the OnePlus Open's inner screen is 2440 x 2268.
  ["OnePlus Open in Chrome", 898, 764],
  ["OnePlus Open, full screen", 898, 848],
  ["Galaxy Z Fold in Chrome", 850, 720],
  ["square desktop window", 1168, 984],
];

describe("splitting a widescreen tablet", () => {
  for (const [name, width, height] of WIDE) {
    it(`squares the felt and keeps a side panel on a ${name}`, () => {
      const split = splitTable(width, height)!;
      expect(split).not.toBeNull();
      expect(split.felt).toBe(Math.floor(height));
      expect(split.side).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(split.felt + split.side).toBeLessThanOrEqual(width);
    });
  }

  for (const [name, width, height] of SQUARE) {
    it(`keeps the felt the full width on a ${name}`, () => {
      expect(width / height).toBeLessThan(WIDE_RATIO);
      expect(splitTable(width, height)).toBeNull();
    });
  }

  it("does not split before the table has been measured", () => {
    expect(splitTable(0, 0)).toBeNull();
  });

  it("does not leave a panel too narrow to hold anything", () => {
    // Wide enough by its shape, but the felt would leave a sliver.
    expect(splitTable(520, 300)).toBeNull();
  });
});
