/**
 * The collage surface.
 *
 * Everything in the film is a scrap of paper laid on another scrap of paper:
 * torn edges, a shadow a few pixels down and right, a grain over the whole
 * frame. The grain and the fibres are built once into offscreen canvases,
 * because they are the only part of a frame expensive enough to be worth
 * keeping.
 */

import { type Pt, densify, fill, hash, lerp, noise, rectPts, stroke } from "./rough";

export const PALETTE = {
  paper: "#f3e9d4",
  paperWarm: "#ecdfc2",
  paperDeep: "#ddcba6",
  paperCool: "#e2e7dc",
  paperPink: "#efd9cf",
  ink: "#2e2823",
  inkSoft: "#6a5f52",
  red: "#bf4536",
  redDeep: "#8e2f26",
  jade: "#3f7d60",
  jadeDeep: "#27523f",
  teal: "#2f6b75",
  mustard: "#d59a2c",
  blue: "#3c5f8a",
  plum: "#7a4a68",
  bone: "#faf3e2",
} as const;

export type PaperTone = keyof typeof PALETTE;

let grainCache: HTMLCanvasElement | null = null;
let fibreCache: HTMLCanvasElement | null = null;

function surface(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Speckle, tileable, built once. */
function grain(): HTMLCanvasElement {
  if (grainCache) return grainCache;
  const size = 256;
  const c = surface(size, size);
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const v = hash(i, 17);
    const dark = v < 0.5;
    const a = Math.pow(Math.abs(v - 0.5) * 2, 2.4) * (dark ? 46 : 30);
    const tone = dark ? 60 : 255;
    img.data[i * 4] = tone;
    img.data[i * 4 + 1] = tone;
    img.data[i * 4 + 2] = dark ? 48 : 250;
    img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  grainCache = c;
  return c;
}

/** Short pale fibres, the kind you see in handmade stock held to the light. */
function fibres(): HTMLCanvasElement {
  if (fibreCache) return fibreCache;
  const size = 512;
  const c = surface(size, size);
  const g = c.getContext("2d")!;
  g.lineCap = "round";
  for (let i = 0; i < 420; i += 1) {
    const x = hash(i, 3) * size;
    const y = hash(i, 4) * size;
    const a = hash(i, 5) * Math.PI;
    const len = 6 + hash(i, 6) * 22;
    const pale = hash(i, 7) > 0.45;
    g.strokeStyle = pale ? "rgba(255,252,240,0.5)" : "rgba(90,74,54,0.22)";
    g.lineWidth = 0.6 + hash(i, 8) * 0.9;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    g.quadraticCurveTo(x, y + noise(i, 9) * 3, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  fibreCache = c;
  return c;
}

let sheetCache: HTMLCanvasElement | null = null;
let finishCache: HTMLCanvasElement | null = null;

/**
 * The sheet, painted once.
 *
 * It is a dozen full-frame gradient and pattern fills and it never changes, so
 * repainting it sixty times a second was costing the film all of its frame
 * budget — the first cut ran at four frames a second. Baked here and stamped
 * with one drawImage instead.
 */
export function paperBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!sheetCache || sheetCache.width !== w || sheetCache.height !== h) {
    const c = surface(w, h);
    paintSheet(c.getContext("2d")!, w, h);
    sheetCache = c;
  }
  ctx.drawImage(sheetCache, 0, 0, w, h);
}

function paintSheet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const wash = ctx.createLinearGradient(0, 0, w * 0.35, h);
  wash.addColorStop(0, "#faf3e2");
  wash.addColorStop(0.55, "#f5ecd6");
  wash.addColorStop(1, "#eee0c4");
  ctx.save();
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // Damp blooms, so the sheet is never flat.
  for (let i = 0; i < 7; i += 1) {
    const cx = hash(i, 21) * w;
    const cy = hash(i, 22) * h;
    const r = (0.18 + hash(i, 23) * 0.3) * Math.max(w, h);
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const warm = hash(i, 24) > 0.5;
    bloom.addColorStop(0, warm ? "rgba(206,178,126,0.16)" : "rgba(255,250,235,0.2)");
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);
  }

  const fib = ctx.createPattern(fibres(), "repeat");
  if (fib) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = fib;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  const gr = ctx.createPattern(grain(), "repeat");
  if (gr) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/**
 * Darkened corners and speckle over the finished frame, so the drawing and the
 * paper share one surface. Both are static, so they are baked into a single
 * layer and multiplied over the frame in one call.
 */
export function finish(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vignetteStrength = 0.13,
  grainAlpha = 0.14,
): void {
  if (!finishCache || finishCache.width !== w || finishCache.height !== h) {
    const c = surface(w, h);
    const g = c.getContext("2d")!;
    const vg = g.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, `rgba(52,38,22,${vignetteStrength})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    const gr = g.createPattern(grain(), "repeat");
    if (gr) {
      g.globalAlpha = grainAlpha;
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    finishCache = c;
  }
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(finishCache, 0, 0, w, h);
  ctx.restore();
}

/**
 * The outline of a torn scrap: a rectangle whose edges were pulled apart
 * rather than cut, with the odd deeper nick where the fibres gave way.
 */
export function tornPts(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  rough = 3.4,
): Pt[] {
  const base = densify(rectPts(x, y, w, h), 15, true);
  return base.map((p, i) => {
    const nick = hash(seed, i * 3 + 88) > 0.9 ? 2.6 : 1;
    return {
      x: p.x + noise(seed, i * 2) * rough * nick,
      y: p.y + noise(seed, i * 2 + 1) * rough * nick,
    };
  });
}

export interface ScrapOpts {
  tone?: string;
  seed?: number;
  /** How far the scrap floats above what is under it. */
  lift?: number;
  rough?: number;
  outline?: string | null;
  alpha?: number;
  /** The pale crushed fibre along a torn edge. */
  deckle?: boolean;
}

/** Paste a torn rectangle of paper down. */
export function scrap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: ScrapOpts = {},
): Pt[] {
  const {
    tone = PALETTE.paperWarm,
    seed = 5,
    lift = 5,
    rough = 3.4,
    outline = null,
    alpha = 1,
    deckle = true,
  } = opts;
  const pts = tornPts(x, y, w, h, seed, rough);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (lift > 0) {
    // Two offset passes stand in for a blur: a scrap is one of very few large
    // elements in a frame, but a real filter here still showed up in the
    // profile.
    ctx.save();
    ctx.translate(lift * 0.6, lift);
    fill(ctx, pts, { color: "rgba(60,44,26,0.2)", seed: seed + 31, amp: 1.4 });
    ctx.translate(-lift * 0.25, -lift * 0.4);
    fill(ctx, pts, { color: "rgba(60,44,26,0.16)", seed: seed + 32, amp: 1.4 });
    ctx.restore();
  }
  fill(ctx, pts, { color: tone, seed, amp: 1.3 });
  if (deckle) {
    // A hair of lighter paper just inside the tear catches the light.
    stroke(ctx, pts, {
      color: "rgba(255,250,236,0.6)",
      width: 1.6,
      amp: 1.1,
      seed: seed + 3,
      passes: 1,
      closed: true,
      step: 16,
    });
  }
  if (outline) {
    stroke(ctx, pts, { color: outline, width: 2, amp: 1.5, seed: seed + 11, closed: true });
  }
  ctx.restore();
  return pts;
}

/** A strip of tape holding something down. */
export function tape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  angle: number,
  seed: number,
  tint = "rgba(214,196,150,0.72)",
): void {
  const h = w * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const pts: Pt[] = [];
  const steps = 8;
  // The short ends are torn; the long edges are the roll's own clean edge.
  for (let i = 0; i <= steps; i += 1) pts.push({ x: -w / 2 + (w * i) / steps, y: -h / 2 + noise(seed, i) * 0.9 });
  for (let i = 0; i <= 3; i += 1) pts.push({ x: w / 2 + noise(seed, 40 + i) * 3.2, y: -h / 2 + (h * i) / 3 });
  for (let i = steps; i >= 0; i -= 1) pts.push({ x: -w / 2 + (w * i) / steps, y: h / 2 + noise(seed, 60 + i) * 0.9 });
  for (let i = 3; i >= 0; i -= 1) pts.push({ x: -w / 2 + noise(seed, 80 + i) * 3.2, y: -h / 2 + (h * i) / 3 });
  ctx.save();
  ctx.translate(1.5, 2.5);
  ctx.filter = "blur(2px)";
  fill(ctx, pts, { color: "rgba(60,44,26,0.22)", seed: seed + 9, amp: 0.8 });
  ctx.restore();
  fill(ctx, pts, { color: tint, seed, amp: 0.8 });
  ctx.globalAlpha = 0.5;
  stroke(ctx, [{ x: -w / 2, y: -h / 2 + 1 }, { x: w / 2, y: -h / 2 + 1 }], {
    color: "rgba(255,255,255,0.7)",
    width: 1.2,
    amp: 0.5,
    seed,
    passes: 1,
  });
  ctx.restore();
}

/** A soft crayon smudge — used to pick something out without an outline. */
export function smudge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  seed: number,
  alpha = 0.3,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${Math.max(3, rx * 0.16)}px)`;
  for (let i = 0; i < 3; i += 1) {
    const g = ctx.createRadialGradient(
      cx + noise(seed + i, 1) * rx * 0.2,
      cy + noise(seed + i, 2) * ry * 0.2,
      0,
      cx,
      cy,
      lerp(rx, ry, 0.5) * (1 + i * 0.18),
    );
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (1 + i * 0.2), ry * (1 + i * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
