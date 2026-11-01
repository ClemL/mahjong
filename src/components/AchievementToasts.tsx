"use client";

import { useEffect, useRef, useState } from "react";
import { type Earned, achievement } from "@/game/achievements";
import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";

/** How long a toast stays up. */
export const TOAST_MS = 4500;
/** At most this many at once; an older one gives way. */
const MAX_SHOWN = 3;

type Shown = { key: string; earned: Earned };

/**
 * Small pop-ups for achievements as they are earned, read off the room view:
 * the newest entries in its list since this screen last looked. A screen that
 * has just opened, or come back, shows none of the ones it missed — they are
 * on the final scores. `mine` keeps a phone to its own player's.
 */
export function AchievementToasts({ view, mine }: { view: RoomView; mine?: Seat }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const seen = useRef<{ game: number; count: number } | null>(null);
  const list = view.achievements;

  useEffect(() => {
    const before = seen.current;
    seen.current = { game: view.gameId, count: list.length };
    if (before === null) return;
    // A new game's list starts again from nothing.
    const from = before.game === view.gameId ? before.count : 0;
    const fresh = list
      .map((earned, i) => ({ key: `${view.gameId}:${i}`, earned }))
      .slice(from)
      .filter(({ earned }) => mine === undefined || earned.seat === mine);
    if (fresh.length > 0) setShown((current) => [...current, ...fresh].slice(-MAX_SHOWN));
  }, [list, view.gameId, mine]);

  return (
    <div className="toasts" aria-live="polite">
      {shown.map(({ key, earned }) => (
        <Toast
          key={key}
          earned={earned}
          yours={mine !== undefined}
          onDone={() => setShown((current) => current.filter((s) => s.key !== key))}
        />
      ))}
    </div>
  );
}

function Toast({ earned, yours, onDone }: { earned: Earned; yours: boolean; onDone: () => void }) {
  const a = achievement(earned.id);
  // The latest onDone, so a re-render does not restart the clock.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="toast">
      <span className="toast__icon" aria-hidden>
        {a.icon}
      </span>
      <span className="toast__text">
        <span className="toast__kicker">{yours ? "Achievement" : `${earned.name} earned`}</span>
        <span className="toast__title">{a.title}</span>
        <span className="toast__detail">{a.detail}</span>
      </span>
    </div>
  );
}
