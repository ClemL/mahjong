"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

/** How long a tile takes to slide to its new place. */
const SLIDE_MS = 220;

/**
 * Slides the tiles in a row to their new places when it is rearranged — a
 * sort, the drawn tile joining the hand, a discard closing the gap — instead
 * of letting them jump. Every tile's place is remembered after each render;
 * one that has moved starts from where it was and glides to where it is now.
 *
 * Places are layout offsets, not screen boxes, so a tile already moving or
 * lifted measures where it belongs, and a row turned on its side still slides
 * along itself. `enabled` false keeps measuring without moving anything, for
 * while a finger is placing tiles itself.
 */
export function useFlip(container: RefObject<HTMLElement | null>, enabled = true): void {
  const places = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) {
      places.current.clear();
      return;
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-tile-id]")) {
      const id = el.dataset.tileId;
      if (!id) continue;
      const at = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, at);
      const was = places.current.get(id);
      if (!was || !enabled || still || typeof el.animate !== "function") continue;
      const dx = was.x - at.x;
      const dy = was.y - at.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      // Added to whatever the tile is already doing — a hover lift, an armed
      // tile raised — rather than replacing it.
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: SLIDE_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
        composite: "add",
      });
    }
    places.current = next;
  });
}
