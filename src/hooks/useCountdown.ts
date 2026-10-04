"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left on a server deadline, counted down here: the view is only
 * re-sent when something at the table changes, so the number it carries goes
 * stale between polls. A fresh value from the server restarts the count.
 */
export function useCountdown(ms: number | null): number | null {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    setLeft(ms);
    if (ms === null) return;
    const ends = Date.now() + ms;
    const timer = setInterval(() => setLeft(Math.max(0, ends - Date.now())), 250);
    return () => clearInterval(timer);
  }, [ms]);
  return left;
}
