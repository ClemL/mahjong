"use client";

import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";
import {
  DEAL_FLIGHT_MS,
  DEAL_MS,
  DEAL_STEP_MS,
  FLOWER_STEP_MS,
  type RoomView,
  WALL_BUILD_MS,
} from "@/game/room";
import type { Seat } from "@/game/tiles";

/** How long one tile takes to drop into the hand. */
const ENTRY_MS = 420;
/** How long a flower takes to rise out of the hand into the open row. */
const FLOWER_MS = 650;
/** Between the tiles of one stack of four, so the stack reads as four tiles. */
const WITHIN_STACK_MS = 45;
/** Without a table screen nothing waits for the deal, so it runs short. */
const QUICK_STEP_MS = 260;
const QUICK_FLOWER_MS = 420;

/**
 * When each of this seat's four stacks lands, in milliseconds from the deal:
 * three stacks of four tiles and a last single tile. With a table screen they
 * land when the table's deal reaches this seat's rack — dealer first, round
 * the table — so the phone fills as the table shows the stacks arriving.
 */
export function stackLandings(seat: Seat, dealer: Seat, withTable: boolean): number[] {
  const turn = (((seat - dealer) % 4) + 4) % 4;
  return [0, 1, 2, 3].map((k) =>
    withTable
      ? WALL_BUILD_MS + (k * 4 + turn) * DEAL_STEP_MS + DEAL_FLIGHT_MS
      : 200 + k * QUICK_STEP_MS,
  );
}

/** Which stack the tile in this place in the hand arrived in: four, four, four, then the rest. */
export function stackOf(slot: number): number {
  return Math.min(3, Math.floor(slot / 4));
}

/**
 * When an opening flower is laid down. With a table screen, at its turn in
 * the table's order — every seat's flowers, dealer first — once the deal is
 * done; without one, one after another as soon as this hand has landed.
 */
export function flowerLanding(order: number, ownIndex: number, withTable: boolean, lastStack: number): number {
  return withTable ? DEAL_MS + order * FLOWER_STEP_MS : lastStack + 400 + ownIndex * QUICK_FLOWER_MS;
}

function still(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The deal on a player's phone: their tiles drop into the hand a stack of
 * four at a time, then each opening flower rises out of it into the open row
 * in the order it is laid down. A flower drawn later rises as it arrives.
 *
 * Only a hand first seen before anything was thrown is dealt like this, so a
 * phone that reloads mid-hand does not replay it. The tiles are in the hand
 * all along — the animation only holds them out of sight — and a tap, the
 * table finishing or skipping its deal, or the first discard brings
 * everything straight in.
 */
export function useDealIn(view: RoomView, seat: Seat, root: RefObject<HTMLElement | null>, hidden: boolean) {
  const me = view.players[seat];
  const seen = useRef<{
    hand: number;
    started: number | null;
    order: Map<string, number>;
    flowers: Set<string>;
  }>({ hand: -1, started: null, order: new Map(), flowers: new Set() });
  if (seen.current.hand !== view.handNumber) {
    const fresh =
      view.phase === "action" &&
      view.players.every((p) => p.discards.length === 0 && p.melds.length === 0);
    const order = new Map<string, number>();
    for (let i = 0; i < 4; i++) {
      const s = ((view.dealer + i) % 4) as Seat;
      for (const t of view.players[s].flowers) order.set(t.id, order.size);
    }
    // With a table screen the deal is the table's: the phone starts its clock
    // where the table's is, and has nothing to show once the table is done.
    let started: number | null = fresh ? Date.now() : null;
    if (fresh && view.tablePresent) {
      const shown = DEAL_MS + order.size * FLOWER_STEP_MS;
      started = view.openingLeft > 0 ? Date.now() - Math.max(0, shown - view.openingLeft) : null;
    }
    // Flowers already out when a hand is first seen mid-play were laid down
    // before this phone was looking; only new ones rise.
    const flowers = new Set(started === null ? me.flowers.map((t) => t.id) : []);
    seen.current = { hand: view.handNumber, started, order, flowers };
  }

  const running = useRef<Animation[]>([]);
  const finish = useCallback(() => {
    // Over for good: the tiles turned up or redrawn later must not drop in again.
    seen.current.started = null;
    for (const a of running.current) {
      try {
        a.finish();
      } catch {
        // Already gone with its element.
      }
    }
    running.current = [];
  }, []);

  const withTable = view.tablePresent;
  const landings = stackLandings(seat, view.dealer, withTable);

  // The hand: every tile in it, face up or face down, placed by where it sits.
  useLayoutEffect(() => {
    const started = seen.current.started;
    const box = root.current;
    if (started === null || !box || still()) return;
    const elapsed = Date.now() - started;
    const tiles = box.querySelectorAll<HTMLElement>(".phone__hand .tile");
    tiles.forEach((el, slot) => {
      const stack = stackOf(slot);
      const within = slot < 12 ? slot % 4 : slot - 12;
      const delay = landings[stack] - ENTRY_MS + within * WITHIN_STACK_MS - elapsed;
      if (delay + ENTRY_MS <= 0 || typeof el.animate !== "function") return;
      running.current.push(
        el.animate(
          [
            { transform: "translateY(-140%) scale(0.7)", opacity: 0 },
            { transform: "translateY(6%) scale(1.04)", opacity: 1, offset: 0.75 },
            { transform: "none", opacity: 1 },
          ],
          { duration: ENTRY_MS, delay, fill: "backwards", easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        ),
      );
    });
    // Only when the hand's tiles are new elements: a fresh deal, or turned up.
  }, [view.handNumber, hidden]);

  // The flowers, each the first time it is seen.
  const flowerIds = me.flowers.map((t) => t.id).join();
  useLayoutEffect(() => {
    const box = root.current;
    if (!box) return;
    const { started, order, flowers } = seen.current;
    const elapsed = started === null ? 0 : Date.now() - started;
    const tiles = box.querySelectorAll<HTMLElement>(".phone__melds .phone__flowers .tile");
    me.flowers.forEach((flower, i) => {
      if (flowers.has(flower.id)) return;
      flowers.add(flower.id);
      const el = tiles[i];
      if (!el || still() || typeof el.animate !== "function") return;
      const opening = started !== null && order.has(flower.id);
      const at = opening ? flowerLanding(order.get(flower.id)!, i, withTable, landings[3]) - elapsed : FLOWER_MS;
      const delay = at - FLOWER_MS;
      if (delay + FLOWER_MS <= 0) return;
      running.current.push(
        el.animate(
          [
            { transform: "translateY(140%) scale(1.6)", opacity: 0, outline: "3px solid rgba(232, 196, 106, 0)" },
            { transform: "translateY(-12%) scale(1.3)", opacity: 1, outline: "3px solid rgba(232, 196, 106, 1)", offset: 0.6 },
            { transform: "none", opacity: 1, outline: "3px solid rgba(232, 196, 106, 0)" },
          ],
          { duration: FLOWER_MS, delay, fill: "backwards", easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        ),
      );
    });
  }, [flowerIds, view.handNumber]);

  // Once anyone has thrown, or the table has finished or skipped its deal,
  // play is under way: nothing is left waiting to arrive.
  const thrown = view.players.some((p) => p.discards.length > 0 || p.melds.length > 0);
  const tableDone = view.tablePresent && view.openingLeft === 0;
  useLayoutEffect(() => {
    if (thrown || tableDone) finish();
  }, [thrown, tableDone, finish]);

  return { finish };
}
