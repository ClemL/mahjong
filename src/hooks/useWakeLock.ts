"use client";

import { useEffect, useState } from "react";

export type WakeLockState = "held" | "unsupported" | "denied" | "idle";

/**
 * Keeps the screen on while `active`.
 *
 * A tablet acting as the table will otherwise sleep in the middle of a hand.
 * The browser drops the lock whenever the page is hidden, so it is re-taken on
 * every return to visibility rather than requested once.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>("idle");

  useEffect(() => {
    if (!active) {
      setState("idle");
      return;
    }
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      // Safari only gained this in 16.4, so older iPads land here.
      setState("unsupported");
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setState("held");
        // Losing the lock to a tab switch is normal; visibility brings it back.
        sentinel.addEventListener("release", () => {
          if (!cancelled) setState("idle");
        });
      } catch {
        // Low battery or a browser policy can refuse it outright.
        if (!cancelled) setState("denied");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);

  return state;
}
