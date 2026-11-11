"use client";

import { type PointerEvent, type RefObject, useEffect, useRef } from "react";
import { intoFrame, screenAngle } from "@/components/screenFrame";

/** How far a finger travels before it is read as a scroll or as a sideways swipe. */
const SLOP = 8;
/** How much of a fling's speed is left after each millisecond. */
const FRICTION = 0.997;
/** Below this many pixels a millisecond, a fling has stopped. */
const STOPPED = 0.02;
/** How far back the finger's last moves are read for the speed it was let go at. */
const RECENT_MS = 100;

interface Touch {
  id: number;
  x: number;
  y: number;
  angle: number;
  top: number;
  mode: "press" | "scroll" | "swipe";
  trail: { y: number; t: number }[];
}

/**
 * Scrolls `ref` up and down under a finger, in the element's own frame.
 *
 * The controller's sheets take every direction of a touch themselves
 * (`touch-action: none`), because a sideways swipe across them turns the
 * screen, and held upright the whole page is turned on its side — where the
 * browser's own up and down would be across the glass. So the browser cannot
 * scroll them: this does, reading the finger the way the page is turned. A
 * movement that starts sideways is left alone for the swipe. A mouse wheel
 * scrolls natively and is not touched.
 */
export function useFrameScroll<T extends HTMLElement>(ref: RefObject<T | null>) {
  const touch = useRef<Touch | null>(null);
  const fling = useRef<number | null>(null);
  const stopFling = () => {
    if (fling.current !== null) cancelAnimationFrame(fling.current);
    fling.current = null;
  };
  useEffect(() => stopFling, []);

  const onPointerDown = (e: PointerEvent<T>) => {
    // A finger on a moving list stops it, as it does a native one.
    stopFling();
    const el = ref.current;
    if (!el || e.pointerType === "mouse") return;
    touch.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      angle: screenAngle(el),
      top: el.scrollTop,
      mode: "press",
      trail: [],
    };
  };

  const onPointerMove = (e: PointerEvent<T>) => {
    const t = touch.current;
    const el = ref.current;
    if (!t || !el || t.id !== e.pointerId) return;
    const moved = intoFrame(e.clientX - t.x, e.clientY - t.y, t.angle);
    if (t.mode === "press") {
      if (Math.max(Math.abs(moved.x), Math.abs(moved.y)) < SLOP) return;
      t.mode = Math.abs(moved.y) > Math.abs(moved.x) ? "scroll" : "swipe";
    }
    if (t.mode !== "scroll") return;
    // A scroll that drifts sideways must not also turn the screen.
    e.stopPropagation();
    el.scrollTop = t.top - moved.y;
    t.trail.push({ y: moved.y, t: e.timeStamp });
    while (t.trail.length > 2 && e.timeStamp - t.trail[0].t > RECENT_MS) t.trail.shift();
  };

  const onPointerEnd = (e: PointerEvent<T>) => {
    const t = touch.current;
    const el = ref.current;
    if (!t || t.id !== e.pointerId) return;
    touch.current = null;
    if (!el || t.mode !== "scroll" || e.type === "pointercancel" || t.trail.length < 2) return;
    const first = t.trail[0];
    const last = t.trail[t.trail.length - 1];
    if (last.t - first.t <= 0) return;
    // Let go while moving, a list carries on and slows, as a native one does:
    // it is the finger's own movement continuing, not an animation of ours.
    let speed = -(last.y - first.y) / (last.t - first.t);
    if (Math.abs(speed) < STOPPED * 5) return;
    // Kept apart from scrollTop, which rounds: a slow glide would otherwise
    // read as having stopped.
    let at = el.scrollTop;
    const end = el.scrollHeight - el.clientHeight;
    let then = performance.now();
    const step = (now: number) => {
      const dt = Math.max(0, now - then);
      then = now;
      at = Math.min(end, Math.max(0, at + speed * dt));
      el.scrollTop = at;
      speed *= FRICTION ** dt;
      // Stopped, or come up against either end.
      if (Math.abs(speed) < STOPPED || at <= 0 || at >= end) {
        fling.current = null;
        return;
      }
      fling.current = requestAnimationFrame(step);
    };
    fling.current = requestAnimationFrame(step);
  };

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
