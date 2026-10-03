import { describe, expect, it } from "vitest";
import { type Placement, layoutTable } from "../tableLayout";

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
