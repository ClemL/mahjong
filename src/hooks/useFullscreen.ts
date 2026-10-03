"use client";

import { useCallback, useEffect, useState } from "react";

/** `lock` is missing from the DOM typings: only Chromium on Android honours it. */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

export interface FullscreenApi {
  /** False on iPhone, which only goes full screen from the home screen. */
  supported: boolean;
  active: boolean;
  /** Must be called from inside a tap or click — browsers refuse it otherwise. */
  enter: () => void;
}

/**
 * Full screen, optionally pinned to landscape.
 *
 * Android only lets a page lock its orientation while it is full screen, so
 * the two are requested together. Where either is refused the caller's own
 * layout has to cope — the phone controller rotates itself with CSS.
 */
export function useFullscreen(orientation?: "landscape"): FullscreenApi {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(
      document.fullscreenEnabled === true &&
        typeof document.documentElement.requestFullscreen === "function",
    );
    const update = () => setActive(document.fullscreenElement !== null);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const enter = useCallback(() => {
    const root = document.documentElement;
    if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        if (orientation) return (screen.orientation as LockableOrientation).lock?.(orientation);
      })
      .catch(() => {
        // Refused, or no orientation lock on this device. Not an error.
      });
  }, [orientation]);

  return { supported, active, enter };
}
