"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "hk-mahjong.home-screen-hint";

/**
 * Whether this is Safari in a tab on an iPhone: the one browser here that can
 * neither hide its own bars nor go full screen. `navigator.standalone` exists
 * only on iOS, and is false in a tab; an iPad can go full screen, so it is
 * told nothing.
 */
export function needsHomeScreen(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === false && document.fullscreenEnabled !== true;
}

/**
 * Said once, until put away: on an iPhone the only way to play without
 * Safari's bars above and below the screen is from the Home Screen, where the
 * table opens as an app of its own.
 */
export function HomeScreenHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Storage blocked: say it, and let OK put it away for this visit.
    }
    setShow(!dismissed && needsHomeScreen());
  }, []);
  if (!show) return null;
  return (
    <div className="home-hint" role="note">
      <p className="home-hint__text">
        <strong>Play without Safari&apos;s bars:</strong> an iPhone does not let a web page hide them. Tap Share, then
        Add to Home Screen, and open Mahjong from there — it fills the screen. You pick your seat again the first
        time.
      </p>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
          } catch {
            // Put away for this visit only.
          }
        }}
      >
        OK
      </button>
    </div>
  );
}
