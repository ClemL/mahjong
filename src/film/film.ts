/**
 * The projector.
 *
 * `renderFrame` is a pure function of time: hand it a second and it paints the
 * frame that belongs there, with no memory of the frame before. That is what
 * makes the scrubber exact, and what lets the poster be drawn by asking for
 * one particular second.
 */

import { finish, paperBackground } from "./paper";
import { H, SCENES, type Scene, W } from "./scenes";
import { RUNTIME } from "./script";
import { boil, clamp01, easeInOut, fill, lerp, noise, type Pt } from "./rough";

export { W, H } from "./scenes";
export { RUNTIME } from "./script";

/** How long a sheet takes to slide across, in seconds. */
const WIPE = 0.85;

function sceneAt(t: number): Scene {
  let found = SCENES[0]!;
  for (const s of SCENES) if (t >= s.start) found = s;
  return found;
}

/** The torn edge of the sheet that sweeps between scenes. */
function sheetEdge(x: number, seed: number): Pt[] {
  const pts: Pt[] = [{ x: -40, y: -40 }];
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    const y = (i / steps) * (H + 80) - 40;
    const nick = noise(seed, i * 3) * 26 + noise(seed + 5, i) * 9;
    pts.push({ x: x + nick, y });
  }
  pts.push({ x: -40, y: H + 40 });
  return pts;
}

function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, t: number, calm: boolean): void {
  ctx.save();
  paperBackground(ctx, W, H);
  ctx.save();
  scene.draw(ctx, t - scene.start, { t, boil: boil(t), calm });
  ctx.restore();
  ctx.restore();
}

export interface FrameOpts {
  /** Honour a reduced-motion preference: no drift, no confetti, a slower boil. */
  calm?: boolean;
}

/**
 * Paint the whole frame for time `t` into a context already scaled so that
 * (0, 0)–(W, H) is the visible film.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, t: number, opts: FrameOpts = {}): void {
  const calm = opts.calm ?? false;
  const time = Math.max(0, Math.min(RUNTIME, t));
  const scene = sceneAt(time);

  // Is a sheet sliding over right now?
  const sinceStart = time - scene.start;
  const index = SCENES.indexOf(scene);
  const previous = index > 0 ? SCENES[index - 1]! : null;
  const wiping = previous !== null && sinceStart < WIPE;

  if (wiping) {
    const k = clamp01(sinceStart / WIPE);
    const seed = Math.round(scene.start);
    if (k < 0.5) {
      // The old scene, being covered from the left.
      drawScene(ctx, previous, time, calm);
      const x = lerp(-80, W + 80, easeInOut(k * 2));
      ctx.save();
      ctx.beginPath();
      const e = sheetEdge(x, seed);
      ctx.moveTo(e[0]!.x, e[0]!.y);
      for (const p of e) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.clip();
      paperBackground(ctx, W, H);
      ctx.restore();
      // A shadow travelling with the leading edge.
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.filter = "blur(9px)";
      fill(ctx, [...sheetEdge(x + 16, seed), { x: -40, y: H + 40 }], { color: "#3a2b18", seed, amp: 2 });
      ctx.restore();
    } else {
      // The new scene, being uncovered to the right.
      drawScene(ctx, scene, time, calm);
      const x = lerp(-80, W + 80, easeInOut((k - 0.5) * 2));
      ctx.save();
      ctx.beginPath();
      const e = sheetEdge(x, seed + 3);
      ctx.moveTo(W + 60, -40);
      for (let i = e.length - 1; i >= 1; i -= 1) ctx.lineTo(e[i]!.x, e[i]!.y);
      ctx.lineTo(W + 60, H + 40);
      ctx.closePath();
      ctx.clip();
      paperBackground(ctx, W, H);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.filter = "blur(9px)";
      fill(
        ctx,
        [...sheetEdge(x - 16, seed + 3).slice(1), { x: W + 60, y: H + 40 }, { x: W + 60, y: -40 }],
        { color: "#3a2b18", seed, amp: 2 },
      );
      ctx.restore();
    }
  } else {
    drawScene(ctx, scene, time, calm);
  }

  finish(ctx, W, H);
}

/** A still worth showing before anyone presses play. */
export const POSTER_TIME = 25.4;
