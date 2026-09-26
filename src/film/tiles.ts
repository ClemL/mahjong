/**
 * Tiles, drawn rather than printed.
 *
 * A tile face is expensive — a dozen wobbled circles, an inked glyph, a carved
 * rim — and the film puts forty of them on screen at once. Each face is drawn
 * once into an offscreen canvas per boil variant and stamped from there, which
 * is what keeps a frame inside its budget.
 *
 * The film keeps its own tile codes rather than importing the engine's: it is a
 * picture of mahjong, not a view onto a game, and nothing here should ever be
 * able to drift with the rules.
 */

import { PALETTE } from "./paper";
import { type Pt, circle, ellipsePts, fill, hash, inkText, noise, rectPts, stroke } from "./rough";

export const TILE_W = 96;
export const TILE_H = 132;
const SS = 2; // sprite supersample
/**
 * Room around the sprite for its own shadow. Blurring a shadow per tile per
 * frame was the single most expensive thing the film did — forty tiles on
 * screen meant forty canvas filters — so it is baked in here once instead.
 */
const PAD = 16;

const RANKS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONORS: Record<string, string> = {
  we: "東",
  ws: "南",
  ww: "西",
  wn: "北",
  dr: "中",
  dg: "發",
  dw: "白",
  fa: "梅",
  fb: "蘭",
  fc: "菊",
  fd: "竹",
  sa: "春",
  sb: "夏",
  sc: "秋",
  sd: "冬",
};

const SUIT_INK: Record<string, string> = {
  m: PALETTE.blue,
  p: "#c2601f",
  b: PALETTE.jade,
};

/** Where the pips sit, as fractions of the face, per rank. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.31],
    [0.5, 0.69],
  ],
  3: [
    [0.28, 0.26],
    [0.5, 0.5],
    [0.72, 0.74],
  ],
  4: [
    [0.32, 0.31],
    [0.68, 0.31],
    [0.32, 0.69],
    [0.68, 0.69],
  ],
  5: [
    [0.29, 0.27],
    [0.71, 0.27],
    [0.5, 0.5],
    [0.29, 0.73],
    [0.71, 0.73],
  ],
  6: [
    [0.32, 0.24],
    [0.68, 0.24],
    [0.32, 0.5],
    [0.68, 0.5],
    [0.32, 0.76],
    [0.68, 0.76],
  ],
  7: [
    [0.28, 0.2],
    [0.5, 0.2],
    [0.72, 0.2],
    [0.33, 0.52],
    [0.67, 0.52],
    [0.33, 0.79],
    [0.67, 0.79],
  ],
  8: [
    [0.33, 0.19],
    [0.67, 0.19],
    [0.33, 0.4],
    [0.67, 0.4],
    [0.33, 0.61],
    [0.67, 0.61],
    [0.33, 0.82],
    [0.67, 0.82],
  ],
  9: [
    [0.26, 0.24],
    [0.5, 0.24],
    [0.74, 0.24],
    [0.26, 0.5],
    [0.5, 0.5],
    [0.74, 0.5],
    [0.26, 0.76],
    [0.5, 0.76],
    [0.74, 0.76],
  ],
};

function surface(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** The blank body: bone face, carved rim, a hint of thickness. */
function drawBody(ctx: CanvasRenderingContext2D, seed: number): void {
  const pts = rectPts(5, 5, TILE_W - 10, TILE_H - 10, 13);
  // The tile's depth, peeking out along the bottom and right.
  fill(ctx, rectPts(8, 10, TILE_W - 12, TILE_H - 12, 13), {
    color: "#cbb896",
    seed: seed + 4,
    amp: 1.1,
  });
  fill(ctx, pts, { color: PALETTE.bone, seed, amp: 1.2 });
  // A wash down the face so it is not a flat cut-out.
  const g = ctx.createLinearGradient(0, 0, TILE_W * 0.4, TILE_H);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(0.6, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(150,126,86,0.22)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
  ctx.restore();
  stroke(ctx, pts, {
    color: "rgba(70,58,40,0.85)",
    width: 2.4,
    amp: 1.2,
    seed: seed + 2,
    closed: true,
    step: 14,
  });
}

/** A dot: a ring with a bead in it, as the carving has. */
function drawDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number, tone: string): void {
  fill(ctx, ellipsePts(cx, cy, r, r, 16), { color: tone, seed, amp: 0.9, alpha: 0.2 });
  circle(ctx, cx, cy, r, { color: tone, width: 2.4, amp: 0.7, seed, passes: 2 });
  circle(ctx, cx, cy, r * 0.36, { color: tone, width: 1.8, amp: 0.5, seed: seed + 5, passes: 1 });
}

/** A length of bamboo: a segmented stick with a knot band. */
function drawStick(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, seed: number): void {
  const w = h * 0.34;
  const tone = SUIT_INK.b!;
  const pts = rectPts(cx - w / 2, cy - h / 2, w, h, w * 0.4);
  fill(ctx, pts, { color: tone, seed, amp: 0.7, alpha: 0.18 });
  stroke(ctx, pts, { color: tone, width: 2.2, amp: 0.6, seed, closed: true, step: 9 });
  for (const k of [-0.18, 0.18]) {
    stroke(
      ctx,
      [
        { x: cx - w / 2, y: cy + h * k },
        { x: cx + w / 2, y: cy + h * k },
      ],
      { color: tone, width: 1.7, amp: 0.5, seed: seed + 9 + k * 10, passes: 1, step: 12 },
    );
  }
}

function drawFace(ctx: CanvasRenderingContext2D, code: string, seed: number): void {
  drawBody(ctx, seed);
  const suit = code[0]!;
  const rank = Number(code.slice(1));

  if (suit === "m" && rank >= 1 && rank <= 9) {
    inkText(ctx, RANKS[rank]!, TILE_W / 2, TILE_H * 0.36, {
      size: TILE_H * 0.33,
      color: SUIT_INK.m!,
      seed,
      spread: 0.9,
    });
    inkText(ctx, "萬", TILE_W / 2, TILE_H * 0.71, {
      size: TILE_H * 0.29,
      color: PALETTE.redDeep,
      seed: seed + 3,
      spread: 0.9,
    });
    return;
  }

  if (suit === "p" && rank >= 1 && rank <= 9) {
    const r = rank === 1 ? TILE_W * 0.24 : rank <= 4 ? TILE_W * 0.15 : rank <= 6 ? TILE_W * 0.13 : TILE_W * 0.11;
    PIPS[rank]!.forEach(([fx, fy], i) => {
      drawDot(ctx, TILE_W * fx, TILE_H * fy, r, seed + i * 13, SUIT_INK.p!);
    });
    return;
  }

  if (suit === "b" && rank >= 1 && rank <= 9) {
    const h = rank === 1 ? TILE_H * 0.46 : rank <= 4 ? TILE_H * 0.24 : rank <= 6 ? TILE_H * 0.21 : TILE_H * 0.17;
    PIPS[rank]!.forEach(([fx, fy], i) => {
      drawStick(ctx, TILE_W * fx, TILE_H * fy, h, seed + i * 19);
    });
    return;
  }

  // Honours, dragons and bonus tiles are a single carved character.
  const glyph = HONORS[code];
  if (!glyph) return;
  const tone =
    code === "dr" ? PALETTE.red : code === "dg" ? PALETTE.jade : code.startsWith("w") ? PALETTE.ink : PALETTE.plum;

  if (code === "dw") {
    // White dragon carries no character at all — just its frame.
    const box = rectPts(TILE_W * 0.2, TILE_H * 0.18, TILE_W * 0.6, TILE_H * 0.64, 6);
    stroke(ctx, box, { color: PALETTE.blue, width: 3, amp: 1.2, seed, closed: true, step: 12 });
    stroke(
      ctx,
      [
        { x: TILE_W * 0.26, y: TILE_H * 0.26 },
        { x: TILE_W * 0.74, y: TILE_H * 0.74 },
      ],
      { color: PALETTE.blue, width: 2, amp: 1, seed: seed + 6, passes: 1, alpha: 0.4 },
    );
    return;
  }

  inkText(ctx, glyph, TILE_W / 2, TILE_H * 0.5, {
    size: TILE_H * 0.5,
    color: tone,
    seed,
    spread: 1.1,
  });
}

/** The green back of a tile. */
function drawBack(ctx: CanvasRenderingContext2D, seed: number): void {
  const pts = rectPts(5, 5, TILE_W - 10, TILE_H - 10, 13);
  fill(ctx, rectPts(8, 10, TILE_W - 12, TILE_H - 12, 13), { color: "#20513e", seed: seed + 4, amp: 1.1 });
  fill(ctx, pts, { color: "#3c8767", seed, amp: 1.2 });
  const inner = rectPts(14, 14, TILE_W - 28, TILE_H - 28, 8);
  stroke(ctx, inner, { color: "rgba(255,255,255,0.34)", width: 2, amp: 1.2, seed: seed + 7, closed: true, step: 14 });
  stroke(ctx, pts, { color: "rgba(20,44,34,0.9)", width: 2.4, amp: 1.2, seed: seed + 2, closed: true, step: 14 });
}

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(code: string, variant: number): HTMLCanvasElement {
  const key = `${code}:${variant}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const c = surface((TILE_W + PAD * 2) * SS, (TILE_H + PAD * 2) * SS);
  const g = c.getContext("2d")!;
  g.scale(SS, SS);
  g.save();
  g.filter = "blur(5px)";
  g.fillStyle = "rgba(59,44,25,0.34)";
  g.beginPath();
  g.roundRect(PAD + 4, PAD + 7, TILE_W, TILE_H, 13);
  g.fill();
  g.restore();
  g.translate(PAD, PAD);
  const seed = hash(code.charCodeAt(0) * 31 + (code.charCodeAt(1) ?? 0), variant) * 9000 + variant * 7;
  if (code === "back") drawBack(g, seed);
  else drawFace(g, code, seed);
  sprites.set(key, c);
  return c;
}

export interface TileOpts {
  /** 1 renders at TILE_W across. */
  scale?: number;
  rotate?: number;
  variant?: number;
  alpha?: number;
  /** Kept for callers; the shadow is baked into the sprite now. */
  lift?: number;
  /** Grey it out, for a tile that is out of play. */
  dim?: number;
}

/** Stamp a tile with its centre at (cx, cy). */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  code: string,
  cx: number,
  cy: number,
  opts: TileOpts = {},
): void {
  const { scale = 1, rotate = 0, variant = 0, alpha = 1, dim = 0 } = opts;
  const img = sprite(code, ((variant % 3) + 3) % 3);
  const w = TILE_W * scale;
  const h = TILE_H * scale;
  const pw = (TILE_W + PAD * 2) * scale;
  const ph = (TILE_H + PAD * 2) * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotate);
  ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
  if (dim > 0) {
    ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = "#6a5c44";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 13 * scale);
    ctx.fill();
  }
  ctx.restore();
}

/** Evenly spaced centres for a row of tiles, centred on cx. */
export function rowAt(cx: number, count: number, scale: number, gap = 8): number[] {
  const step = TILE_W * scale + gap;
  const start = cx - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/** A hand-lettered label on a ribbon, for naming a group of tiles. */
export function ribbon(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  seed: number,
  tone: string = PALETTE.mustard,
  size = 26,
): void {
  const w = Math.max(text.length * size * 0.62, size * 3) + 28;
  const h = size * 1.75;
  const pts: Pt[] = [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 + noise(seed, 1) * 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 + noise(seed, 2) * 2 },
  ];
  ctx.save();
  ctx.translate(2, 3);
  fill(ctx, pts, { color: "rgba(60,44,26,0.2)", seed: seed + 5, amp: 1.2 });
  ctx.restore();
  fill(ctx, pts, { color: tone, seed, amp: 1.6 });
  inkText(ctx, text, cx, cy + 1, { size, color: "#2a2018", seed: seed + 2, spread: 0.5, weight: 800 });
}
