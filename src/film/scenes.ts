/**
 * The twelve scenes.
 *
 * Each one draws from a single number: how many seconds into itself it is.
 * Nothing accumulates between frames, which is what lets the scrubber land
 * anywhere in the film and get exactly the frame that belongs there.
 */

import { PALETTE, paperBackground, scrap, smudge, tape, tornPts } from "./paper";
import { TILE_H, TILE_W, drawTile, ribbon, rowAt } from "./tiles";
import {
  type Pt,
  arrow,
  circle,
  clamp01,
  easeBack,
  easeInOut,
  easeOut,
  ellipsePts,
  fill,
  hash,
  inkText,
  lerp,
  noise,
  pulse,
  rectPts,
  span,
  stroke,
} from "./rough";

/**
 * The frame is 2:1 — a wide cinema shape, and one whose centre line falls on
 * 900, which is where every scene in this file composes from.
 */
export const W = 1800;
export const H = 900;
/** Everything readable lives above the subtitle band. */
export const SAFE_H = 752;

export interface Env {
  /** Seconds into the whole film. */
  t: number;
  /** Which wobble this frame uses. */
  boil: number;
  /** Set when the viewer asked for less movement. */
  calm: boolean;
}

export interface Scene {
  start: number;
  end: number;
  draw: (ctx: CanvasRenderingContext2D, local: number, env: Env) => void;
}

// ----------------------------------------------------------------- helpers

/** A slow drift, so a held shot still breathes. Stilled for reduced motion. */
function camera(
  ctx: CanvasRenderingContext2D,
  env: Env,
  local: number,
  opts: { zoom?: number; zoomTo?: number; px?: number; py?: number; dur?: number } = {},
): void {
  const { zoom = 1, zoomTo = zoom, px = 0, py = 0, dur = 20 } = opts;
  if (env.calm) return;
  const k = easeInOut(clamp01(local / dur));
  const z = lerp(zoom, zoomTo, k);
  const sway = Math.sin(local * 0.31) * 3;
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2 + lerp(0, px, k) + sway, -H / 2 + lerp(0, py, k) + Math.cos(local * 0.27) * 2);
}

/** An original cut-paper person: a head, a pair of shoulders, no face. */
function figure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tone: string,
  seed: number,
  env: Env,
): void {
  const bob = env.calm ? 0 : Math.sin(env.t * 1.1 + seed) * 1.6 * s;
  ctx.save();
  ctx.translate(x, y + bob);
  const body: Pt[] = [
    { x: -26 * s, y: 46 * s },
    { x: -20 * s, y: 6 * s },
    { x: -9 * s, y: -6 * s },
    { x: 9 * s, y: -6 * s },
    { x: 20 * s, y: 6 * s },
    { x: 26 * s, y: 46 * s },
  ];
  ctx.save();
  ctx.translate(2.5 * s, 4 * s);
  fill(ctx, body, { color: "rgba(60,44,26,0.22)", seed: seed + 2, amp: 1.4 });
  ctx.restore();
  fill(ctx, body, { color: tone, seed, amp: 1.8 });
  stroke(ctx, body, { color: PALETTE.ink, width: 2 * s, amp: 1.4, seed: seed + 1, closed: true, step: 14 });
  const head = ellipsePts(0, -26 * s, 17 * s, 18.5 * s, 18);
  ctx.save();
  ctx.translate(2.5 * s, 4 * s);
  fill(ctx, head, { color: "rgba(60,44,26,0.22)", seed: seed + 6, amp: 1.2 });
  ctx.restore();
  fill(ctx, head, { color: PALETTE.paperPink, seed: seed + 3, amp: 1.4 });
  stroke(ctx, head, { color: PALETTE.ink, width: 2 * s, amp: 1.2, seed: seed + 4, closed: true, step: 12 });
  ctx.restore();
}

/** A curly brace under a group of tiles. */
function brace(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  seed: number,
  color: string = PALETTE.teal,
): void {
  const mid = (x1 + x2) / 2;
  stroke(
    ctx,
    [
      { x: x1, y },
      { x: x1 + 8, y: y + 9 },
      { x: mid - 10, y: y + 11 },
      { x: mid, y: y + 20 },
      { x: mid + 10, y: y + 11 },
      { x: x2 - 8, y: y + 9 },
      { x: x2, y },
    ],
    { color, width: 2.6, amp: 1.2, seed, step: 22 },
  );
}

/** A red seal, pressed on at an angle. */
function stamp(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  seed: number,
  size = 62,
  k = 1,
): void {
  if (k <= 0) return;
  const s = lerp(1.5, 1, easeOut(k));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12 + noise(seed, 1) * 0.04);
  ctx.scale(s, s);
  ctx.globalAlpha = clamp01(k * 1.4);
  const box = rectPts(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44, 8);
  fill(ctx, box, { color: PALETTE.red, seed, amp: 2.4, alpha: 0.92 });
  // Ink never takes evenly on a seal.
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = clamp01(k) * 0.25;
    ctx.fillStyle = "rgba(243,233,212,0.9)";
    ctx.beginPath();
    ctx.ellipse(
      noise(seed + i, 3) * size * 0.6,
      noise(seed + i, 4) * size * 0.6,
      size * 0.16,
      size * 0.09,
      hash(seed + i, 5) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = clamp01(k);
  inkText(ctx, text, 0, 2, { size: size * 0.95, color: "#f7eddb", seed: seed + 7, spread: 0.8, weight: 800 });
  ctx.restore();
}

/** An abstract scan-code patch. Decorative only — it encodes nothing. */
function codePatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number): void {
  const n = 9;
  const cell = size / n;
  fill(ctx, rectPts(x - 3, y - 3, size + 6, size + 6, 3), { color: "#fbf6ea", seed, amp: 1 });
  ctx.save();
  ctx.fillStyle = PALETTE.ink;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const corner = (r < 3 && c < 3) || (r < 3 && c > n - 4) || (r > n - 4 && c < 3);
      const edge = r === 0 || c === 0 || r === 2 || c === 2;
      const on = corner ? (r === 1 && c === 1) || edge : hash(seed + r * 31, c * 17) > 0.52;
      if (!on) continue;
      ctx.globalAlpha = 0.86 + hash(seed + r, c) * 0.14;
      ctx.fillRect(x + c * cell + 0.4, y + r * cell + 0.4, cell - 0.8, cell - 0.8);
    }
  }
  ctx.restore();
}

/** A phone, lying on the table. */
function phone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  rot: number,
  seed: number,
  lit: boolean,
): void {
  const h = w * 2.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const body = rectPts(-w / 2, -h / 2, w, h, w * 0.17);
  ctx.save();
  ctx.translate(3, 5);
  fill(ctx, body, { color: "rgba(50,38,22,0.26)", seed: seed + 2, amp: 1.2 });
  ctx.restore();
  fill(ctx, body, { color: "#3a3630", seed, amp: 1.2 });
  const screen = rectPts(-w / 2 + w * 0.08, -h / 2 + w * 0.12, w * 0.84, h - w * 0.24, w * 0.1);
  fill(ctx, screen, { color: lit ? "#2f6d53" : "#1a1a18", seed: seed + 3, amp: 1 });
  if (lit) {
    for (let i = 0; i < 5; i += 1) {
      drawTile(ctx, ["m3", "p5", "b2", "we", "dr"][i]!, -w * 0.3 + i * (w * 0.15), h * 0.24, {
        scale: w * 0.0016,
        variant: seed + i,
        lift: 1,
      });
    }
  }
  stroke(ctx, body, { color: "rgba(20,18,14,0.9)", width: 1.8, amp: 1, seed: seed + 5, closed: true, step: 14 });
  ctx.restore();
}

/** A soft label with a leader line, for pointing at a thing. */
function callout(
  ctx: CanvasRenderingContext2D,
  text: string,
  from: Pt,
  to: Pt,
  seed: number,
  k: number,
  color: string = PALETTE.teal,
  size = 27,
): void {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(k);
  const end = { x: lerp(from.x, to.x, easeOut(k)), y: lerp(from.y, to.y, easeOut(k)) };
  arrow(ctx, [from, { x: lerp(from.x, to.x, 0.55), y: lerp(from.y, to.y, 0.4) }, end], {
    color,
    width: 2.4,
    amp: 1.6,
    seed,
    head: 13,
    step: 24,
  });
  inkText(ctx, text, from.x, from.y - 22, { size, color, seed: seed + 3, spread: 0.6, weight: 800 });
  ctx.restore();
}

/** Tiles falling in, staggered, with a little overshoot as they land. */
function dropRow(
  ctx: CanvasRenderingContext2D,
  codes: string[],
  cx: number,
  y: number,
  scale: number,
  local: number,
  from: number,
  each: number,
  env: Env,
  gap = 8,
): number[] {
  const xs = rowAt(cx, codes.length, scale, gap);
  codes.forEach((code, i) => {
    const k = span(local, from + i * each, from + i * each + 0.55);
    if (k <= 0) return;
    const e = easeBack(k);
    drawTile(ctx, code, xs[i]!, y - (1 - e) * 120, {
      scale,
      variant: env.boil + i,
      alpha: clamp01(k * 2),
      rotate: (1 - k) * noise(i, 3) * 0.5 + noise(i + 90, 4) * 0.02,
      lift: 6 * scale + (1 - e) * 10,
    });
  });
  return xs;
}

// ------------------------------------------------------------------ scenes

/** 1. Title. */
const title: Scene = {
  start: 0,
  end: 14,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.06, zoomTo: 1, dur: 13 });

    // Tiles scatter in around the edge.
    const ring = ["m1", "p5", "b3", "we", "dr", "m9", "p2", "b7", "dg", "ws", "b5", "p8"];
    ring.forEach((code, i) => {
      const a = (i / ring.length) * Math.PI * 2 + 0.3;
      const rx = 620 + noise(i, 1) * 40;
      const ry = 330 + noise(i, 2) * 30;
      const k = span(local, 0.9 + i * 0.13, 1.9 + i * 0.13);
      if (k <= 0) return;
      const e = easeBack(k);
      drawTile(ctx, code, W / 2 + Math.cos(a) * rx * e, H / 2 - 40 + Math.sin(a) * ry * e, {
        scale: 0.52,
        rotate: noise(i, 5) * 0.42,
        variant: env.boil + i,
        alpha: clamp01(k * 2),
        lift: 7,
      });
    });

    // The brush mark, revealed downward as if being painted.
    const reveal = span(local, 0.6, 2.9);
    if (reveal > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 180, W, easeOut(reveal) * 260);
      ctx.clip();
      inkText(ctx, "麻雀", W / 2, 322, {
        size: 216,
        color: PALETTE.ink,
        seed: env.boil,
        spread: 2.4,
        stamps: 4,
        weight: 800,
      });
      ctx.restore();
    }

    const sub = span(local, 2.6, 3.8);
    if (sub > 0) {
      ctx.save();
      ctx.globalAlpha = sub;
      inkText(ctx, "HONG KONG MAHJONG", W / 2, 452, {
        size: 52,
        color: PALETTE.redDeep,
        seed: env.boil + 4,
        spread: 1,
        weight: 800,
        font: "ui-serif, Georgia, 'Times New Roman', serif",
      });
      const rule = span(local, 3.2, 4.4);
      stroke(
        ctx,
        [
          { x: W / 2 - 250 * rule, y: 492 },
          { x: W / 2 + 250 * rule, y: 492 },
        ],
        { color: PALETTE.redDeep, width: 3, amp: 1.6, seed: env.boil, step: 28 },
      );
      ctx.restore();
    }

    const tag = span(local, 8.0, 9.2);
    if (tag > 0) {
      ctx.save();
      ctx.globalAlpha = tag;
      inkText(ctx, "a game of four winds, in one hundred and forty-four tiles", W / 2, 546, {
        size: 28,
        color: PALETTE.inkSoft,
        seed: env.boil + 9,
        spread: 0.6,
        weight: 500,
        font: "ui-serif, Georgia, 'Times New Roman', serif",
      });
      ctx.restore();
    }
  },
};

const WINDS = ["East", "South", "West", "North"];
const WIND_GLYPH = ["東", "南", "西", "北"];

/** 2. The table, the seats, the wall. */
const table: Scene = {
  start: 14,
  end: 32,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.07, zoomTo: 1, py: -6, dur: 17 });
    const cx = 900;
    const cy = 378;
    const hw = 360;
    const hh = 215;

    const cloth = span(local, 0, 0.9);
    if (cloth > 0) {
      ctx.save();
      ctx.globalAlpha = cloth;
      const e = easeOut(cloth);
      const felt = tornPts(cx - hw * e, cy - hh * e, hw * 2 * e, hh * 2 * e, 21, 7);
      ctx.save();
      ctx.translate(6, 11);
      ctx.filter = "blur(7px)";
      fill(ctx, felt, { color: "rgba(50,38,22,0.38)", seed: 22, amp: 2 });
      ctx.restore();
      fill(ctx, felt, { color: PALETTE.jadeDeep, seed: 21, amp: 2.4 });
      // An inner panel of lighter felt, so the table is not one flat shape.
      fill(ctx, tornPts(cx - (hw - 26) * e, cy - (hh - 22) * e, (hw - 26) * 2 * e, (hh - 22) * 2 * e, 23, 5), {
        color: PALETTE.jade,
        seed: 23,
        amp: 2,
        alpha: 0.42,
      });
      ctx.restore();
    }

    // Four seats, each with a wind.
    const seats: [number, number, number][] = [
      [cx, cy + 270, 0],
      [cx + 430, cy, 1],
      [cx, cy - 252, 2],
      [cx - 430, cy, 3],
    ];
    seats.forEach(([x, y, i]) => {
      const k = span(local, 0.7 + i * 0.35, 1.5 + i * 0.35);
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp01(k * 1.6);
      figure(ctx, x, y, lerp(0.7, 1.22, easeBack(k)), [PALETTE.mustard, PALETTE.teal, PALETTE.plum, PALETTE.blue][i]!, 40 + i * 7, env);
      const lab = span(local, 3.0 + i * 0.4, 3.8 + i * 0.4);
      if (lab > 0) {
        ctx.globalAlpha = clamp01(lab);
        const ly = i === 2 ? y - 82 : y + 82;
        inkText(ctx, WIND_GLYPH[i]!, x, ly, { size: 44, color: PALETTE.ink, seed: env.boil + i, spread: 1.1 });
        inkText(ctx, WINDS[i]!.toUpperCase(), x, ly + 32, {
          size: 18,
          color: PALETTE.inkSoft,
          seed: env.boil + i + 5,
          spread: 0.4,
          weight: 700,
        });
      }
      ctx.restore();
    });

    // The wall: face-down tiles stacked round the inside of the table.
    const wallK = span(local, 4.4, 9.6);
    if (wallK > 0) {
      const per = 11;
      const ix = hw - 78;
      const iy = hh - 62;
      const sides: [number, number, number, number, number][] = [
        [cx - ix, cy + iy, 1, 0, 0],
        [cx + ix, cy - iy, 0, 1, 1],
        [cx + ix, cy - iy, -1, 0, 2],
        [cx - ix, cy + iy, 0, -1, 3],
      ];
      sides.forEach(([sx, sy, dx, dy, si]) => {
        for (let i = 0; i < per; i += 1) {
          const idx = si * per + i;
          const k = span(wallK, idx / (per * 4 + 3), idx / (per * 4 + 3) + 0.1);
          if (k <= 0) continue;
          const stepX = (ix * 2) / (per - 1);
          const stepY = (iy * 2) / (per - 1);
          drawTile(ctx, "back", sx + dx * i * stepX, sy + dy * i * stepY, {
            scale: dx !== 0 ? 0.4 : 0.36,
            rotate: dx !== 0 ? 0 : Math.PI / 2,
            variant: env.boil + idx,
            alpha: clamp01(k * 2),
            lift: 4,
          });
        }
      });
      const lab = span(local, 8.0, 8.9);
      if (lab > 0 && local < 10.9) {
        ctx.save();
        ctx.globalAlpha = clamp01(lab) * clamp01((10.9 - local) * 2.5);
        ribbon(ctx, "face down, stacked into a wall", cx, cy, env.boil, PALETTE.paperDeep, 25);
        ctx.restore();
      }
    }

    // East deals: the wall is broken and tiles fan toward the seats.
    const deal = span(local, 11.4, 15.8);
    if (deal > 0) {
      for (let i = 0; i < 14; i += 1) {
        const k = span(deal, i * 0.05, i * 0.05 + 0.4);
        if (k <= 0) continue;
        const seatIdx = i % 4;
        const [tx, ty] = [
          [cx, cy + 176],
          [cx + 268, cy],
          [cx, cy - 172],
          [cx - 268, cy],
        ][seatIdx]!;
        const e = easeOut(k);
        drawTile(ctx, "back", lerp(cx - 230, tx, e), lerp(cy + 152, ty, e), {
          scale: 0.38,
          rotate: e * (1.6 + noise(i, 2)),
          variant: env.boil + i,
          alpha: clamp01((1 - k) * 3),
          lift: 9,
        });
      }
      const lab = span(local, 12.8, 13.7);
      if (lab > 0 && local < 17.4) {
        ctx.save();
        ctx.globalAlpha = clamp01(lab) * clamp01((17.4 - local) * 1.6);
        inkText(ctx, "East deals", cx, cy, { size: 40, color: PALETTE.redDeep, seed: env.boil, spread: 1, weight: 800 });
        ctx.restore();
      }
    }
  },
};

/** 3. The three suits, one to nine, four copies each. */
const suits: Scene = {
  start: 32,
  end: 68,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1, zoomTo: 1.03, py: -10, dur: 34 });
    // The rows clear away before the next beat, or the stacks land on top of
    // ninety tiles and nobody can read either.
    const rows = clamp01(1 - span(local, 18.6, 19.6));
    if (rows > 0) {
      ctx.save();
      ctx.globalAlpha = rows;
      const defs: [string, string, string, number][] = [
        ["m", "Characters", "萬", 0],
        ["p", "Dots", "筒", 1],
        ["b", "Bamboo", "索", 2],
      ];
      defs.forEach(([prefix, name, glyph, i]) => {
        const y = 196 + i * 190;
        const from = 2.4 + i * 3.5;
        const codes = Array.from({ length: 9 }, (_, n) => `${prefix}${n + 1}`);
        const xs = dropRow(ctx, codes, 900, y, 0.62, local, from, 0.085, env, 10);

        const lab = span(local, from - 0.5, from + 0.3);
        if (lab > 0) {
          ctx.save();
          ctx.globalAlpha = rows * lab;
          inkText(ctx, glyph, 268, y - 12, { size: 66, color: PALETTE.ink, seed: env.boil + i, spread: 1.3 });
          inkText(ctx, name, 268, y + 40, {
            size: 25,
            color: PALETTE.inkSoft,
            seed: env.boil + i + 3,
            spread: 0.5,
            weight: 700,
          });
          ctx.restore();
        }

        const run = span(local, from + 1.2, from + 2.2);
        if (run > 0 && xs.length > 0) {
          stroke(
            ctx,
            [
              { x: xs[0]! - 34, y: y + 56 },
              { x: lerp(xs[0]! - 34, xs[8]! + 34, run), y: y + 56 + noise(i, 9) * 2 },
            ],
            { color: PALETTE.mustard, width: 3.4, amp: 1.5, seed: env.boil + i, step: 30 },
          );
        }
      });
      ctx.restore();
    }

    // One tile, fanned into the four copies of it that exist.
    const four = span(local, 19.6, 23.6);
    if (four > 0 && local < 24.8) {
      ctx.save();
      ctx.globalAlpha = clamp01(four * 3) * clamp01((24.8 - local) * 2);
      for (let c = 0; c < 4; c += 1) {
        const k = span(local, 19.7 + c * 0.3, 20.5 + c * 0.3);
        if (k <= 0) continue;
        const e = easeBack(k);
        drawTile(ctx, "m5", 900 + (c - 1.5) * 168 * e, 352, {
          scale: 1.02,
          variant: env.boil + c,
          rotate: (c - 1.5) * 0.045 + noise(c, 3) * 0.02,
          alpha: clamp01(k * 2),
          lift: 10,
        });
      }
      const x4 = span(local, 21.4, 22.3);
      if (x4 > 0) ribbon(ctx, "four of every single tile", 900, 560, env.boil, PALETTE.mustard, 31);
      ctx.restore();
    }

    // The running count.
    const count = span(local, 25.2, 27.0);
    if (count > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(count * 2);
      const n = Math.round(lerp(0, 108, easeOut(count)));
      inkText(ctx, `${n}`, 900, 330, { size: 168, color: PALETTE.redDeep, seed: env.boil, spread: 2, weight: 800 });
      inkText(ctx, "tiles in the three suits", 900, 442, {
        size: 31,
        color: PALETTE.inkSoft,
        seed: env.boil + 2,
        spread: 0.5,
        weight: 600,
      });
      const more = span(local, 29.4, 30.4);
      if (more > 0) {
        ctx.globalAlpha = clamp01(more);
        inkText(ctx, "+ 36 more", 900, 528, {
          size: 38,
          color: PALETTE.mustard,
          seed: env.boil + 5,
          spread: 0.7,
          weight: 800,
        });
      }
      ctx.restore();
    }
  },
};

/** 4. Winds and dragons. */
const honours: Scene = {
  start: 68,
  end: 90,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.02, zoomTo: 1, dur: 20 });

    // Four winds, in a row. The compass was already made in scene two, and a
    // second one here only collided with its own labels.
    const windHead = span(local, 0.2, 1.0);
    if (windHead > 0) {
      ctx.save();
      ctx.globalAlpha = windHead;
      inkText(ctx, "the four winds", 900, 118, {
        size: 33,
        color: PALETTE.inkSoft,
        seed: env.boil,
        spread: 0.6,
        weight: 700,
      });
      ctx.restore();
    }
    const wxs = rowAt(900, 4, 0.82, 44);
    ["we", "ws", "ww", "wn"].forEach((code, i) => {
      const k = span(local, 0.6 + i * 0.4, 1.3 + i * 0.4);
      if (k <= 0) return;
      const e = easeBack(k);
      drawTile(ctx, code, wxs[i]!, 248 - (1 - e) * 70, {
        scale: 0.82,
        variant: env.boil + i,
        alpha: clamp01(k * 2),
        rotate: noise(i, 7) * 0.05,
        lift: 9,
      });
      const lab = span(local, 3.2 + i * 0.35, 3.9 + i * 0.35);
      if (lab > 0) {
        ctx.save();
        ctx.globalAlpha = lab;
        inkText(ctx, WINDS[i]!, wxs[i]!, 344, {
          size: 24,
          color: PALETTE.inkSoft,
          seed: env.boil + i,
          spread: 0.5,
          weight: 700,
        });
        ctx.restore();
      }
    });

    // Three dragons, well clear of the winds.
    const dHead = span(local, 9.8, 10.7);
    if (dHead > 0) {
      ctx.save();
      ctx.globalAlpha = dHead;
      inkText(ctx, "three dragons", 900, 432, {
        size: 33,
        color: PALETTE.inkSoft,
        seed: env.boil + 8,
        spread: 0.6,
        weight: 700,
      });
      ctx.restore();
    }
    const dxs = rowAt(900, 3, 0.82, 64);
    const names = ["red", "green", "white"];
    const tones = [PALETTE.red, PALETTE.jade, PALETTE.blue];
    ["dr", "dg", "dw"].forEach((code, i) => {
      const k = span(local, 10.0 + i * 0.4, 10.7 + i * 0.4);
      if (k <= 0) return;
      const e = easeBack(k);
      drawTile(ctx, code, dxs[i]!, 562 - (1 - e) * 70, {
        scale: 0.82,
        variant: env.boil + i + 4,
        alpha: clamp01(k * 2),
        rotate: noise(i + 20, 3) * 0.05,
        lift: 9,
      });
      const lab = span(local, 12.8 + i * 0.35, 13.5 + i * 0.35);
      if (lab > 0) {
        ctx.save();
        ctx.globalAlpha = lab;
        inkText(ctx, names[i]!, dxs[i]!, 658, { size: 24, color: tones[i]!, seed: env.boil + i, spread: 0.5, weight: 700 });
        ctx.restore();
      }
    });

    const rule = span(local, 18.2, 19.2);
    if (rule > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(rule);
      ribbon(ctx, "no runs — only sets of the same tile", 900, 722, env.boil, PALETTE.paperDeep, 26);
      ctx.restore();
    }
  },
};

/** 5. Flowers and seasons. */
const flowers: Scene = {
  start: 90,
  end: 102,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1, zoomTo: 1.05, dur: 12 });
    const codes = ["fa", "fb", "fc", "fd", "sa", "sb", "sc", "sd"];
    codes.forEach((code, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const k = span(local, 0.3 + i * 0.16, 1.3 + i * 0.16);
      if (k <= 0) return;
      const e = easeOut(k);
      // They flutter down rather than drop.
      const sway = Math.sin(k * 7 + i) * (1 - e) * 60;
      drawTile(ctx, code, 640 + col * 174 + sway, 236 + row * 216 - (1 - e) * 220, {
        scale: 0.74,
        rotate: (1 - e) * (noise(i, 3) * 1.4) + noise(i, 8) * 0.06,
        variant: env.boil + i,
        alpha: clamp01(k * 2),
        lift: 8,
      });
    });

    const lab = span(local, 2.0, 3.0);
    if (lab > 0) {
      ctx.save();
      ctx.globalAlpha = lab;
      inkText(ctx, "flowers", 430, 236, { size: 30, color: PALETTE.plum, seed: env.boil, spread: 0.6, weight: 700 });
      inkText(ctx, "seasons", 430, 452, { size: 30, color: PALETTE.plum, seed: env.boil + 2, spread: 0.6, weight: 700 });
      ctx.restore();
    }

    const bonus = span(local, 6.4, 7.6);
    if (bonus > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(bonus);
      for (let i = 0; i < 4; i += 1) {
        const k = span(local, 6.4 + i * 0.22, 7.6 + i * 0.22);
        if (k <= 0) continue;
        inkText(ctx, "+1", 640 + i * 174, 148 - easeOut(k) * 26, {
          size: 34,
          color: PALETTE.mustard,
          seed: env.boil + i,
          spread: 0.6,
          weight: 800,
        });
      }
      ribbon(ctx, "set aside · draw again", 900, 642, env.boil, PALETTE.paperDeep, 27);
      ctx.restore();
    }
  },
};

const HAND13 = ["m2", "m3", "m4", "p5", "p5", "p5", "b7", "b8", "b9", "we", "we", "we", "dg"];

/** 6. Thirteen tiles, and what they have to add up to. */
const hand: Scene = {
  start: 102,
  end: 130,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.04, zoomTo: 1, py: 10, dur: 26 });

    const you = span(local, 0.1, 0.9);
    if (you > 0) {
      ctx.save();
      ctx.globalAlpha = you;
      figure(ctx, 210, 300, 1.5, PALETTE.mustard, 40, env);
      inkText(ctx, "you", 210, 404, { size: 26, color: PALETTE.inkSoft, seed: env.boil, spread: 0.5, weight: 700 });
      ctx.restore();
    }

    const xs = dropRow(ctx, HAND13, 900, 368, 0.6, local, 0.5, 0.075, env, 8);

    const hidden = span(local, 3.6, 4.6);
    if (hidden > 0 && xs.length > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(hidden);
      callout(
        ctx,
        "only you see these",
        { x: 900, y: 196 },
        { x: 900, y: 286 },
        env.boil,
        hidden,
        PALETTE.teal,
        26,
      );
      ctx.restore();
    }

    // The groups, braced underneath.
    const groups: [number, number, string, string][] = [
      [0, 2, "run", PALETTE.teal],
      [3, 5, "triplet", PALETTE.teal],
      [6, 8, "run", PALETTE.teal],
      [9, 11, "triplet", PALETTE.teal],
      [12, 12, "needs a pair", PALETTE.red],
    ];
    groups.forEach(([a, b, label, color], gi) => {
      const k = span(local, 13.4 + gi * 0.85, 14.2 + gi * 0.85);
      if (k <= 0 || xs.length === 0) return;
      ctx.save();
      ctx.globalAlpha = clamp01(k);
      const w = (TILE_W * 0.6) / 2 + 6;
      brace(ctx, xs[a]! - w, xs[b]! + w, 456, env.boil + gi, color);
      inkText(ctx, label, (xs[a]! + xs[b]!) / 2, 500, {
        size: 22,
        color,
        seed: env.boil + gi,
        spread: 0.4,
        weight: 700,
      });
      ctx.restore();
    });

    // The fourteenth tile arrives and pairs the lonely dragon.
    const win = span(local, 19.0, 20.4);
    if (win > 0 && xs.length > 0) {
      const e = easeOut(win);
      drawTile(ctx, "dg", lerp(1760, xs[12]! + 68, e), lerp(190, 368, e), {
        scale: 0.6,
        rotate: (1 - e) * 0.7,
        variant: env.boil + 3,
        alpha: clamp01(win * 2),
        lift: 10,
      });
      if (win > 0.85) {
        ctx.save();
        ctx.globalAlpha = clamp01((win - 0.85) * 6);
        smudge(ctx, xs[12]! + 34, 368, 96, 100, PALETTE.mustard, 9, 0.5);
        ctx.restore();
      }
    }

    const sum = span(local, 22.0, 23.2);
    if (sum > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(sum);
      ribbon(ctx, "4 sets  +  1 pair  =  14 tiles", 900, 612, env.boil, PALETTE.mustard, 33);
      ctx.restore();
    }
  },
};

/** 7. Chow, pung, kong. */
const sets: Scene = {
  start: 130,
  end: 164,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1, zoomTo: 1.03, dur: 32 });
    const blocks: [string[], string, string, number][] = [
      [["b3", "b4", "b5"], "CHOW", "three in a row, one suit", 0],
      [["ww", "ww", "ww"], "PUNG", "three of the same tile", 1],
      [["p6", "p6", "p6", "p6"], "KONG", "four of the same — draw a bonus tile", 2],
    ];
    blocks.forEach(([codes, name, note, i]) => {
      const from = 0.6 + i * 5.6;
      const y = 214 + i * 182;
      if (local < from - 0.4) return;
      const shown = span(local, from - 0.4, from + 0.2);
      ctx.save();
      ctx.globalAlpha = clamp01(shown);
      const xs = dropRow(ctx, codes, 880, y, 0.6, local, from, 0.16, env, 10);

      const lab = span(local, from + 0.9, from + 1.6);
      if (lab > 0) {
        ctx.globalAlpha = clamp01(lab);
        inkText(ctx, name, 400, y - 10, { size: 46, color: PALETTE.redDeep, seed: env.boil + i, spread: 1, weight: 800 });
        inkText(ctx, note, 400, y + 34, {
          size: 21,
          color: PALETTE.inkSoft,
          seed: env.boil + i + 2,
          spread: 0.4,
          weight: 600,
        });
      }

      // A chow gets an arrow along the run; a pung gets equals signs.
      if (i === 0 && xs.length === 3) {
        const k = span(local, from + 1.4, from + 2.4);
        if (k > 0) {
          ctx.globalAlpha = clamp01(k);
          arrow(
            ctx,
            [
              { x: xs[0]!, y: y - 58 },
              { x: lerp(xs[0]!, xs[2]!, easeOut(k)), y: y - 58 },
            ],
            { color: PALETTE.teal, width: 2.6, amp: 1.4, seed: env.boil, head: 12, step: 26 },
          );
        }
      }
      if (i === 1 && xs.length === 3) {
        const k = span(local, from + 1.4, from + 2.2);
        if (k > 0) {
          ctx.globalAlpha = clamp01(k);
          for (let j = 0; j < 2; j += 1) {
            inkText(ctx, "=", (xs[j]! + xs[j + 1]!) / 2, y, {
              size: 30,
              color: PALETTE.teal,
              seed: env.boil + j,
              spread: 0.5,
            });
          }
        }
      }
      if (i === 2 && xs.length === 4) {
        const k = span(local, from + 1.6, from + 2.8);
        if (k > 0) {
          const e = easeOut(k);
          drawTile(ctx, "back", lerp(1760, xs[3]! + 96, e), lerp(150, y, e), {
            scale: 0.6,
            rotate: (1 - e) * 0.9,
            variant: env.boil,
            alpha: clamp01(k * 2),
            lift: 9,
          });
          if (k > 0.8) {
            ctx.globalAlpha = clamp01((k - 0.8) * 5);
            inkText(ctx, "+1", xs[3]! + 96, y - 76, {
              size: 30,
              color: PALETTE.mustard,
              seed: env.boil,
              spread: 0.5,
              weight: 800,
            });
          }
        }
      }
      ctx.restore();
    });

    const total = span(local, 19.4, 20.8);
    if (total > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(total);
      ribbon(ctx, "any four of these  +  a pair", 880, 686, env.boil, PALETTE.mustard, 31);
      ctx.restore();
    }
  },
};

/** 8. Draw one, throw one, round to the right. */
const turn: Scene = {
  start: 164,
  end: 188,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.03, zoomTo: 1, dur: 22 });
    const cx = 900;
    const cy = 356;

    const felt = tornPts(cx - 360, cy - 268, 720, 536, 55, 6);
    ctx.save();
    ctx.translate(4, 8);
    ctx.filter = "blur(5px)";
    fill(ctx, felt, { color: "rgba(50,38,22,0.3)", seed: 56, amp: 2 });
    ctx.restore();
    fill(ctx, felt, { color: PALETTE.jadeDeep, seed: 55, amp: 2.2 });

    // Four hands of backs.
    const hands: [number, number, number, number][] = [
      [cx, cy + 212, 0, 0],
      [cx + 300, cy, Math.PI / 2, 1],
      [cx, cy - 212, 0, 2],
      [cx - 300, cy, Math.PI / 2, 3],
    ];
    hands.forEach(([hx, hy, rot, i]) => {
      for (let j = 0; j < 7; j += 1) {
        const off = (j - 3) * (rot === 0 ? 44 : 30);
        drawTile(ctx, "back", hx + (rot === 0 ? off : 0), hy + (rot === 0 ? 0 : off), {
          scale: 0.38,
          rotate: rot,
          variant: env.boil + i * 7 + j,
          lift: 4,
        });
      }
    });

    // The arrow that says which way play goes.
    const dir = span(local, 0.6, 2.4);
    if (dir > 0) {
      const steps = 26;
      const pts: Pt[] = [];
      for (let i = 0; i <= steps * easeOut(dir); i += 1) {
        const a = -Math.PI / 2 + (i / steps) * Math.PI * 1.55;
        pts.push({ x: cx + Math.cos(a) * 172, y: cy + Math.sin(a) * 146 });
      }
      if (pts.length > 2) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        arrow(ctx, pts, { color: PALETTE.mustard, width: 4, amp: 1.6, seed: env.boil, head: 18, step: 26 });
        ctx.restore();
      }
    }

    // Three turns: a tile drawn from the wall, a tile thrown into the middle.
    const pond: { x: number; y: number; code: string }[] = [];
    const order = [0, 1, 2];
    order.forEach((seat) => {
      const from = 4.2 + seat * 4.6;
      const [hx, hy] = hands[seat]!;
      const draw = span(local, from, from + 1.3);
      if (draw > 0 && draw < 1) {
        const e = easeOut(draw);
        drawTile(ctx, "back", lerp(cx - 330, hx, e), lerp(cy - 250, hy, e), {
          scale: 0.4,
          rotate: e * 1.2,
          variant: env.boil,
          lift: 10,
        });
      }
      const toss = span(local, from + 1.4, from + 2.6);
      const code = ["m7", "p3", "b6"][seat]!;
      if (toss > 0) {
        const e = easeOut(toss);
        const tx = cx + (seat - 1) * 86;
        const ty = cy + 40 + (seat % 2) * 60;
        drawTile(ctx, code, lerp(hx, tx, e), lerp(hy, ty, e), {
          scale: 0.44,
          rotate: e * (1.4 + noise(seat, 2)) * 0.6,
          variant: env.boil + seat,
          lift: lerp(16, 5, e),
        });
        if (toss >= 1) pond.push({ x: tx, y: ty, code });
      }
      const lab = span(local, from + 0.2, from + 1.0);
      if (lab > 0 && local < from + 3.4) {
        ctx.save();
        ctx.globalAlpha = clamp01(lab) * clamp01((from + 3.4 - local) * 2);
        inkText(ctx, seat === 0 ? "draw" : "", hx - 150, hy - 40, {
          size: 26,
          color: PALETTE.mustard,
          seed: env.boil,
          spread: 0.5,
          weight: 700,
        });
        ctx.restore();
      }
    });

    const keep = span(local, 11.6, 12.8);
    if (keep > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(keep);
      ribbon(ctx, "13 in hand, always", cx, cy + 300, env.boil, PALETTE.paperDeep, 27);
      ctx.restore();
    }
  },
};

/** 9. Claiming a discard. */
const claim: Scene = {
  start: 188,
  end: 212,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1, zoomTo: 1.06, py: 18, dur: 22 });

    // Your hand, with two West winds waiting.
    const mine = ["m2", "m3", "ww", "ww", "p7", "p8", "b4", "b5"];
    const xs = rowAt(820, mine.length, 0.6, 9);

    // Painted first: a wash over the tiles would bury the very pair it is
    // drawing attention to.
    const spot = span(local, 3.4, 4.4);
    if (spot > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(spot) * (0.26 + pulse(((local - 3.4) % 1.5) / 1.5) * 0.26);
      smudge(ctx, (xs[2]! + xs[3]!) / 2, 560, 112, 92, PALETTE.mustard, 5, 0.8);
      ctx.restore();
    }

    const lifted = local >= 8.4;
    mine.forEach((code, i) => {
      // Once the set goes down these two are no longer in the hand.
      if (lifted && (i === 2 || i === 3)) return;
      drawTile(ctx, code, xs[i]!, 560, { scale: 0.6, variant: env.boil + i, lift: 6 });
    });

    // Somebody throws the third one out.
    const thrown = span(local, 0.8, 2.2);
    if (thrown > 0) {
      const e = easeOut(thrown);
      drawTile(ctx, "ww", lerp(900, 880, e), lerp(120, 300, e), {
        scale: 0.6,
        rotate: (1 - e) * 1.4,
        variant: env.boil,
        lift: lerp(20, 7, e),
      });
      if (thrown > 0.6) {
        ctx.save();
        ctx.globalAlpha = clamp01((thrown - 0.6) * 3);
        inkText(ctx, "South throws it away", 880, 214, {
          size: 24,
          color: PALETTE.inkSoft,
          seed: env.boil,
          spread: 0.5,
          weight: 600,
        });
        ctx.restore();
      }
    }

    // The call.
    const call = span(local, 5.0, 5.9);
    if (call > 0 && local < 12.5) {
      ctx.save();
      const e = easeBack(call);
      ctx.globalAlpha = clamp01(call * 2) * clamp01((12.5 - local) * 1.5);
      ctx.translate(470, 420);
      ctx.rotate(-0.14);
      ctx.scale(e, e);
      const bub = [
        { x: -150, y: -58 },
        { x: 150, y: -64 },
        { x: 156, y: 52 },
        { x: -40, y: 56 },
        { x: -86, y: 104 },
        { x: -76, y: 54 },
        { x: -156, y: 48 },
      ];
      ctx.save();
      ctx.translate(4, 7);
      ctx.filter = "blur(4px)";
      fill(ctx, bub, { color: "rgba(50,38,22,0.3)", seed: 71, amp: 2 });
      ctx.restore();
      fill(ctx, bub, { color: PALETTE.bone, seed: 70, amp: 2.4 });
      stroke(ctx, bub, { color: PALETTE.ink, width: 3, amp: 1.8, seed: 72, closed: true, step: 18 });
      inkText(ctx, "PUNG!", 0, -4, { size: 62, color: PALETTE.red, seed: env.boil, spread: 1.2, weight: 800 });
      ctx.restore();
    }

    // The set goes down face up.
    const meld = span(local, 8.4, 9.8);
    if (meld > 0) {
      const e = easeOut(meld);
      const targets = rowAt(1286, 3, 0.6, 9);
      [0, 1, 2].forEach((j) => {
        const fromX = j === 2 ? 880 : xs[2 + j]!;
        const fromY = j === 2 ? 300 : 560;
        drawTile(ctx, "ww", lerp(fromX, targets[j]!, e), lerp(fromY, 656, e), {
          scale: 0.6,
          variant: env.boil + j,
          rotate: noise(j, 4) * 0.04,
          lift: lerp(14, 5, e),
        });
      });
      if (meld > 0.8) {
        ctx.save();
        ctx.globalAlpha = clamp01((meld - 0.8) * 5);
        inkText(ctx, "face up — everyone can see it", 1290, 764, {
          size: 22,
          color: PALETTE.inkSoft,
          seed: env.boil,
          spread: 0.4,
          weight: 600,
        });
        ctx.restore();
      }
    }

    // Play jumps to you.
    const jump = span(local, 15.0, 16.6);
    if (jump > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(jump);
      arrow(
        ctx,
        [
          { x: 880, y: 250 },
          { x: lerp(880, 560, easeOut(jump)), y: 340 },
          { x: lerp(880, 470, easeOut(jump)), y: 470 },
        ],
        { color: PALETTE.red, width: 3.4, amp: 1.8, seed: env.boil, head: 16, step: 26 },
      );
      inkText(ctx, "your turn now", 560, 236, {
        size: 26,
        color: PALETTE.red,
        seed: env.boil,
        spread: 0.5,
        weight: 800,
      });
      ctx.restore();
    }

    const trade = span(local, 20.6, 21.6);
    if (trade > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(trade);
      ribbon(ctx, "claimed sets score less", 560, 700, env.boil, PALETTE.paperDeep, 26);
      ctx.restore();
    }
  },
};

/** 10. Faan. */
const scoring: Scene = {
  start: 212,
  end: 238,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1, zoomTo: 1.04, py: -8, dur: 24 });

    const card = span(local, 0.2, 1.2);
    if (card > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(card);
      scrap(ctx, 470, 120, 860, 560, { tone: PALETTE.bone, seed: 81, lift: 9, rough: 4 });
      tape(ctx, 470, 128, 120, -0.36, 83);
      tape(ctx, 1330, 128, 120, 0.4, 84);
      inkText(ctx, "faan", 900, 190, { size: 46, color: PALETTE.redDeep, seed: env.boil, spread: 1, weight: 800 });
      inkText(ctx, "what the hand is worth", 900, 234, {
        size: 22,
        color: PALETTE.inkSoft,
        seed: env.boil + 2,
        spread: 0.4,
        weight: 600,
      });
      ctx.restore();
    }

    const rows: [string, string, number][] = [
      ["All runs, no triplets", "1", 0],
      ["All one suit", "3", 1],
      ["All triplets", "3", 2],
      ["Self-drawn", "1", 3],
      ["Concealed hand", "1", 4],
      ["Your own flower", "1", 5],
    ];
    let running = 0;
    rows.forEach(([name, faan, i]) => {
      const k = span(local, 2.6 + i * 1.5, 3.3 + i * 1.5);
      if (k <= 0) return;
      running += Number(faan);
      const y = 292 + i * 58;
      ctx.save();
      ctx.globalAlpha = clamp01(k);
      ctx.translate((1 - easeOut(k)) * -40, 0);
      inkText(ctx, name, 560, y, {
        size: 27,
        color: PALETTE.ink,
        seed: env.boil + i,
        spread: 0.4,
        weight: 600,
        align: "left",
      });
      stroke(
        ctx,
        [
          { x: 560, y: y + 22 },
          { x: 1180, y: y + 22 },
        ],
        { color: "rgba(110,94,70,0.4)", width: 1.4, amp: 1, seed: env.boil + i, passes: 1, step: 34 },
      );
      inkText(ctx, faan, 1224, y, {
        size: 34,
        color: PALETTE.redDeep,
        seed: env.boil + i,
        spread: 0.6,
        weight: 800,
        align: "right",
      });
      ctx.restore();
    });

    const tot = span(local, 12.4, 13.6);
    if (tot > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(tot);
      const n = Math.round(lerp(0, running, easeOut(tot)));
      inkText(ctx, `${n} faan`, 1224, 648, {
        size: 44,
        color: PALETTE.redDeep,
        seed: env.boil,
        spread: 1,
        weight: 800,
        align: "right",
      });
      ctx.restore();
    }

    const cap = span(local, 19.2, 20.4);
    if (cap > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(cap);
      ribbon(ctx, "more faan → more points, up to the limit", 900, 730, env.boil, PALETTE.mustard, 26);
      ctx.restore();
    }
  },
};

/** 11. The win. */
const winning: Scene = {
  start: 238,
  end: 250,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.05, zoomTo: 1, dur: 11 });
    const groups = [
      ["m2", "m3", "m4"],
      ["p5", "p5", "p5"],
      ["b7", "b8", "b9"],
      ["we", "we", "we"],
      ["dg", "dg"],
    ];
    let x = 404;
    groups.forEach((g, gi) => {
      g.forEach((code, j) => {
        const k = span(local, 0.2 + gi * 0.24 + j * 0.05, 0.9 + gi * 0.24 + j * 0.05);
        if (k > 0) {
          drawTile(ctx, code, x, 330 - (1 - easeBack(k)) * 60, {
            scale: 0.6,
            variant: env.boil + gi * 3 + j,
            alpha: clamp01(k * 2),
            rotate: noise(gi * 3 + j, 2) * 0.03,
            lift: 7,
          });
        }
        x += 68;
      });
      x += 26;
    });

    stamp(ctx, "糊", 900, 540, env.boil, 76, span(local, 3.0, 3.9));

    // Paper confetti.
    const cel = span(local, 3.2, 3.6);
    if (cel > 0 && !env.calm) {
      const age = local - 3.2;
      ctx.save();
      for (let i = 0; i < 60; i += 1) {
        const a = hash(i, 1) * Math.PI * 2;
        const sp = 150 + hash(i, 2) * 420;
        const px = 900 + Math.cos(a) * sp * age;
        const py = 540 + Math.sin(a) * sp * age * 0.6 + age * age * 120;
        if (py > H + 60) continue;
        ctx.globalAlpha = clamp01(1.6 - age * 0.45);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(age * (2 + hash(i, 3) * 5) * (hash(i, 4) > 0.5 ? 1 : -1));
        ctx.fillStyle = [PALETTE.red, PALETTE.mustard, PALETTE.jade, PALETTE.teal, PALETTE.plum][i % 5]!;
        const s = 6 + hash(i, 5) * 11;
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
      }
      ctx.restore();
    }

    const again = span(local, 7.6, 8.8);
    if (again > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(again);
      inkText(ctx, "shuffle, and again", 900, 672, {
        size: 30,
        color: PALETTE.inkSoft,
        seed: env.boil,
        spread: 0.5,
        weight: 600,
      });
      ctx.restore();
    }
  },
};

/** 12. The app, and an invitation. */
const play: Scene = {
  start: 250,
  end: 278,
  draw(ctx, local, env) {
    camera(ctx, env, local, { zoom: 1.04, zoomTo: 1, dur: 26 });
    const cx = 900;
    const cy = 352;

    // A tablet lying in the middle of the table.
    const tab = span(local, 0.2, 1.4);
    if (tab > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(tab);
      const e = easeBack(tab);
      const w = 520 * e;
      const h = 360 * e;
      const body = rectPts(cx - w / 2, cy - h / 2, w, h, 16);
      ctx.save();
      ctx.translate(5, 9);
      ctx.filter = "blur(5px)";
      fill(ctx, body, { color: "rgba(50,38,22,0.34)", seed: 91, amp: 1.6 });
      ctx.restore();
      fill(ctx, body, { color: "#3a3630", seed: 90, amp: 1.4 });
      fill(ctx, rectPts(cx - w / 2 + 14, cy - h / 2 + 14, w - 28, h - 28, 10), {
        color: PALETTE.jadeDeep,
        seed: 92,
        amp: 1.2,
      });
      ctx.restore();
    }

    // Four seat cards with their own codes.
    const cards = span(local, 1.6, 3.0);
    if (cards > 0) {
      for (let i = 0; i < 4; i += 1) {
        const k = span(local, 1.6 + i * 0.22, 2.4 + i * 0.22);
        if (k <= 0) continue;
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = cx - 118 + col * 236;
        const y = cy - 76 + row * 152;
        ctx.save();
        ctx.globalAlpha = clamp01(k);
        fill(ctx, rectPts(x - 104, y - 62, 208, 124, 10), { color: "rgba(255,250,235,0.1)", seed: 93 + i, amp: 1 });
        stroke(ctx, rectPts(x - 104, y - 62, 208, 124, 10), {
          color: "rgba(230,220,190,0.55)",
          width: 1.8,
          amp: 1.2,
          seed: 94 + i,
          closed: true,
          step: 18,
        });
        inkText(ctx, WIND_GLYPH[i]!, x - 62, y, { size: 40, color: "#e8dfc6", seed: env.boil + i, spread: 0.8 });
        codePatch(ctx, x + 6, y - 42, 84, 200 + i * 13);
        ctx.restore();
      }
    }

    // Phones around it, lighting up one by one.
    const spots: [number, number, number][] = [
      [cx, cy + 300, 0.04],
      [cx + 430, cy + 40, -1.5],
      [cx, cy - 300, 3.1],
      [cx - 430, cy + 40, 1.5],
    ];
    spots.forEach(([px, py, rot], i) => {
      const k = span(local, 8.4 + i * 0.7, 9.4 + i * 0.7);
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp01(k);
      phone(ctx, px, py - (1 - easeBack(k)) * 40, 92, rot, 120 + i * 9, k > 0.85);
      ctx.restore();
    });

    const scan = span(local, 12.6, 13.8);
    if (scan > 0 && local < 19) {
      ctx.save();
      ctx.globalAlpha = clamp01(scan) * clamp01((19 - local) * 1.2);
      callout(
        ctx,
        "scan your own chair",
        { x: cx - 300, y: 150 },
        { x: cx - 130, y: cy - 60 },
        env.boil,
        scan,
        PALETTE.mustard,
        27,
      );
      ctx.restore();
    }

    // End card.
    const end = span(local, 19.6, 21.2);
    if (end > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(end);
      // A fresh sheet, not a wash: at 94% the tablet underneath still showed
      // through the title and read as a mistake.
      ctx.save();
      ctx.globalAlpha = clamp01(end);
      paperBackground(ctx, W, H);
      ctx.restore();
      inkText(ctx, "麻雀", cx, 268, {
        size: 132,
        color: PALETTE.ink,
        seed: env.boil,
        spread: 2,
        stamps: 4,
        weight: 800,
      });
      inkText(ctx, "HONG KONG MAHJONG", cx, 372, {
        size: 44,
        color: PALETTE.redDeep,
        seed: env.boil + 3,
        spread: 0.9,
        weight: 800,
        font: "ui-serif, Georgia, 'Times New Roman', serif",
      });
      const line = span(local, 20.4, 21.6);
      stroke(
        ctx,
        [
          { x: cx - 230 * line, y: 410 },
          { x: cx + 230 * line, y: 410 },
        ],
        { color: PALETTE.redDeep, width: 3, amp: 1.5, seed: env.boil, step: 28 },
      );
      const cta = span(local, 21.4, 22.6);
      if (cta > 0) {
        ctx.globalAlpha = clamp01(cta);
        inkText(ctx, "Take a seat.", cx, 480, {
          size: 40,
          color: PALETTE.ink,
          seed: env.boil + 6,
          spread: 0.7,
          weight: 700,
          font: "ui-serif, Georgia, 'Times New Roman', serif",
        });
      }
      const tiles = span(local, 22.0, 23.4);
      if (tiles > 0) {
        ["m1", "p5", "b9", "we", "dr"].forEach((code, i) => {
          const k = span(local, 22.0 + i * 0.12, 22.7 + i * 0.12);
          if (k <= 0) return;
          drawTile(ctx, code, cx - 260 + i * 130, 612 - (1 - easeBack(k)) * 50, {
            scale: 0.62,
            variant: env.boil + i,
            alpha: clamp01(k * 2),
            rotate: noise(i, 3) * 0.08,
            lift: 8,
          });
        });
      }
      ctx.restore();
    }
  },
};

export const SCENES: Scene[] = [
  title,
  table,
  suits,
  honours,
  flowers,
  hand,
  sets,
  turn,
  claim,
  scoring,
  winning,
  play,
];
