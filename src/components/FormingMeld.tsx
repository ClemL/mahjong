"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Meld } from "@/game/melds";
import { TileFace } from "./TileView";

const MELD_NAME: Record<Meld["type"], string> = {
  chow: "Chow 上",
  pung: "Pung 碰",
  kong: "Kong 槓",
};

/** How long the set takes to form in the middle of the phone before it goes to its place. */
export const FORMING_MS = 1_500;
/** How long it is then marked where it landed among the open sets. */
const LANDED_MS = 2_500;

export interface Forming {
  key: string;
  /** Where the set sits among the open sets. */
  index: number;
  meld: Meld;
  /** Done forming and marked in its place. */
  landed: boolean;
  land: () => void;
}

function signature(meld: Meld): string {
  return `${meld.type}:${meld.tiles.map((t) => t.id).join(",")}`;
}

function stillScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * A set this hand has just made — a claimed chow, pung or kong, a kong
 * declared from the hand, or a pung grown into one — found by comparing the
 * open sets with how they were. Sets already laid out when the phone first
 * looks, or at a new deal, were made before anyone was watching and are left
 * alone. Without motion it is only marked where it lands.
 */
export function useFormingMeld(melds: Meld[], hand: number): Forming | null {
  const seen = useRef<{ hand: number; sigs: string[] } | null>(null);
  const [current, setCurrent] = useState<Omit<Forming, "land"> | null>(null);
  const sigs = melds.map(signature);
  const joined = sigs.join("|");

  useEffect(() => {
    const before = seen.current;
    seen.current = { hand, sigs };
    if (!before || before.hand !== hand) {
      setCurrent(null);
      return;
    }
    const index = sigs.findIndex((sig) => !before.sigs.includes(sig));
    if (index < 0) return;
    setCurrent({ key: `${hand}:${sigs[index]}`, index, meld: melds[index], landed: stillScreen() });
  }, [hand, joined]);

  // Marked in its place for a moment, then just one of the sets.
  useEffect(() => {
    if (!current?.landed) return;
    const timer = window.setTimeout(() => setCurrent(null), LANDED_MS);
    return () => window.clearTimeout(timer);
  }, [current?.key, current?.landed]);

  if (!current) return null;
  return {
    ...current,
    land: () => setCurrent((c) => (c && c.key === current.key ? { ...c, landed: true } : c)),
  };
}

/**
 * The set forming in the middle of the phone: the tiles from the hand rise to
 * meet the claimed one, which drops in from the table, the set is named, and
 * the whole of it then shrinks away towards the open sets.
 */
export function FormingMeld({ meld, onDone }: { meld: Meld; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), FORMING_MS);
    return () => window.clearTimeout(timer);
  }, []);

  let fromHand = 0;
  return (
    <div className="phone__forming" aria-hidden>
      <div className={`forming forming--${meld.type}`}>
        <span className="forming__tag">{MELD_NAME[meld.type]}</span>
        {meld.tiles.map((t) => {
          const taken = t.id === meld.claimedTileId;
          const order = taken ? 0 : fromHand++;
          return (
            <span
              key={t.id}
              className={taken ? "forming__tile forming__tile--taken" : "forming__tile forming__tile--hand"}
              style={{ "--i": order } as CSSProperties}
            >
              <TileFace code={t.code} size="lg" />
            </span>
          );
        })}
      </div>
    </div>
  );
}
