/**
 * Hand-drawn primitives.
 *
 * Every line in the film is drawn twice with a little noise pushed into it, so
 * it reads as a pen that was held rather than a path that was computed. The
 * noise is a pure function of a seed, which is what lets the whole film be
 * rendered from a timestamp alone: scrub anywhere and you get the same frame.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Deterministic value in [0, 1) from a pair of numbers. */
export function hash(a: number, b = 0): number {
  let h = Math.imul((Math.round(a * 1013) ^ Math.round(b * 1619)) >>> 0, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Deterministic value in [-1, 1). */
export function noise(seed: number, i: number): number {
  return hash(seed, i) * 2 - 1;
}

/**
 * Which wobble to use right now.
 *
 * Hand-drawn animation is shot "on twos" — a new drawing every second or third
 * frame — and the tiny differences between those drawings are what make the
 * line look alive. Sampling the seed at 8fps while everything else moves at
 * screen rate gives the same boil without the jerk.
 */
export const BOIL_FPS = 8;

export function boil(t: number, offset = 0): number {
  return Math.floor(t * BOIL_FPS) + offset * 1000;
}

export const TAU = Math.PI * 2;

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Progress through [a, b], clamped. */
export function span(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}

export function easeOut(k: number): number {
  return 1 - Math.pow(1 - k, 3);
}

export function easeIn(k: number): number {
  return k * k * k;
}

export function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Overshoots and settles — a scrap dropped onto the table. */
export function easeBack(k: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

/** Rises and falls again over [0, 1]; for a beat that appears and leaves. */
export function pulse(k: number): number {
  return Math.sin(clamp01(k) * Math.PI);
}

/** Split long runs so the wobble has somewhere to show. */
export function densify(pts: Pt[], step = 18, closed = false): Pt[] {
  const out: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const cuts = Math.max(1, Math.round(d / step));
    for (let c = 0; c < cuts; c += 1) {
      const k = c / cuts;
      out.push({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
    }
  }
  if (!closed) out.push(pts[pts.length - 1]!);
  return out;
}

/** A polyline drawn as curves through its own midpoints, so corners soften. */
function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean): void {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last.x, last.y);
  if (closed) ctx.closePath();
}

function wobble(pts: Pt[], amp: number, seed: number, closed: boolean): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => {
    // Ends move less than the middle, the way a hand anchors a stroke.
    const edge = closed ? 1 : Math.min(1, Math.min(i, n - 1 - i) / 2 + 0.35);
    return {
      x: p.x + noise(seed, i * 2) * amp * edge,
      y: p.y + noise(seed, i * 2 + 1) * amp * edge,
    };
  });
}

export interface StrokeOpts {
  color?: string;
  width?: number;
  amp?: number;
  seed?: number;
  passes?: number;
  closed?: boolean;
  alpha?: number;
  step?: number;
  cap?: CanvasLineCap;
}

/** The workhorse: a wobbled, double-drawn outline. */
export function stroke(ctx: CanvasRenderingContext2D, raw: Pt[], opts: StrokeOpts = {}): void {
  const {
    color = "#2b2622",
    width = 2.2,
    amp = 1.6,
    seed = 1,
    passes = 2,
    closed = false,
    alpha = 1,
    step = 18,
    cap = "round",
  } = opts;
  if (raw.length < 2) return;
  const base = densify(raw, step, closed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  for (let p = 0; p < passes; p += 1) {
    // The second pass is lighter and thinner: one confident line, one searching.
    ctx.globalAlpha = alpha * (p === 0 ? 1 : 0.5);
    ctx.lineWidth = width * (p === 0 ? 1 : 0.72);
    ctx.beginPath();
    tracePath(ctx, wobble(base, amp, seed + p * 131.7, closed), closed);
    ctx.stroke();
  }
  ctx.restore();
}

export interface FillOpts {
  color?: string;
  amp?: number;
  seed?: number;
  alpha?: number;
  step?: number;
  /** Nudge the colour off its outline, the way a child colours past the line. */
  slip?: number;
}

export function fill(ctx: CanvasRenderingContext2D, raw: Pt[], opts: FillOpts = {}): void {
  const { color = "#d9cdb4", amp = 2.2, seed = 7, alpha = 1, step = 22, slip = 0 } = opts;
  if (raw.length < 3) return;
  const base = densify(raw, step, true);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.translate(noise(seed, 91) * slip, noise(seed, 92) * slip);
  ctx.beginPath();
  tracePath(ctx, wobble(base, amp, seed, true), true);
  ctx.fill();
  ctx.restore();
}

/** Pencil shading: parallel strokes clipped to a shape. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  raw: Pt[],
  opts: { angle?: number; gap?: number; seed?: number; color?: string; width?: number; alpha?: number } = {},
): void {
  const { angle = -0.6, gap = 9, seed = 3, color = "#2b2622", width = 1.1, alpha = 0.26 } = opts;
  if (raw.length < 3) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of raw) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + gap;

  ctx.save();
  ctx.beginPath();
  tracePath(ctx, densify(raw, 20, true), true);
  ctx.clip();
  ctx.globalAlpha = alpha;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let line = 0;
  for (let d = -reach; d <= reach; d += gap) {
    const mx = cx + -sin * d;
    const my = cy + cos * d;
    stroke(
      ctx,
      [
        { x: mx - cos * reach, y: my - sin * reach },
        { x: mx + cos * reach, y: my + sin * reach },
      ],
      { color, width, amp: 1.3, seed: seed + line * 17.3, passes: 1, step: 26 },
    );
    line += 1;
  }
  ctx.restore();
}

/** Corner points of a rounded rectangle, ready to wobble. */
export function rectPts(x: number, y: number, w: number, h: number, r = 0): Pt[] {
  if (r <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const k = Math.min(r, w / 2, h / 2);
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [x + w - k, y + k, -Math.PI / 2],
    [x + w - k, y + h - k, 0],
    [x + k, y + h - k, Math.PI / 2],
    [x + k, y + k, Math.PI],
  ];
  for (const [ccx, ccy, a0] of corners) {
    for (let s = 0; s <= 4; s += 1) {
      const a = a0 + (s / 4) * (Math.PI / 2);
      pts.push({ x: ccx + Math.cos(a) * k, y: ccy + Math.sin(a) * k });
    }
  }
  return pts;
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, steps = 22): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * TAU;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** A circle drawn in one go, overshooting where the pen came back round. */
export function circle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  opts: StrokeOpts = {},
): void {
  const seed = opts.seed ?? 1;
  const over = 0.22 + hash(seed, 5) * 0.3;
  const from = hash(seed, 6) * TAU;
  const steps = 26;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + (i / steps) * (TAU + over);
    const rr = r * (1 + noise(seed, i) * 0.012);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  stroke(ctx, pts, { ...opts, closed: false, step: Math.max(8, r / 2) });
}

/** An arrow with a hand-drawn head. */
export function arrow(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  opts: StrokeOpts & { head?: number } = {},
): void {
  const { head = 14, ...rest } = opts;
  stroke(ctx, pts, rest);
  const b = pts[pts.length - 1]!;
  const a = pts[pts.length - 2] ?? pts[0]!;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const wing = 0.42;
  stroke(
    ctx,
    [
      { x: b.x - Math.cos(ang - wing) * head, y: b.y - Math.sin(ang - wing) * head },
      b,
      { x: b.x - Math.cos(ang + wing) * head, y: b.y - Math.sin(ang + wing) * head },
    ],
    { ...rest, step: 30 },
  );
}

/** Ink text: stamped a few times so the edges thicken like a wet nib. */
export function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size: number;
    font?: string;
    color?: string;
    seed?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    weight?: number | string;
    alpha?: number;
    spread?: number;
    stamps?: number;
  },
): void {
  const {
    size,
    font = "'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Hiragino Sans',ui-sans-serif,sans-serif",
    color = "#2b2622",
    seed = 1,
    align = "center",
    baseline = "middle",
    weight = 700,
    alpha = 1,
    spread = 0.7,
    stamps = 3,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  for (let s = 0; s < stamps; s += 1) {
    ctx.globalAlpha = alpha * (s === 0 ? 1 : 0.3);
    ctx.fillText(text, x + noise(seed + s, 1) * spread, y + noise(seed + s, 2) * spread);
  }
  ctx.restore();
}

export function measureInk(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  weight: number | string = 700,
  font = "'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Hiragino Sans',ui-sans-serif,sans-serif",
): number {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}
