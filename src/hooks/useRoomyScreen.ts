"use client";

import { useEffect, useState } from "react";

/**
 * The short side, in CSS pixels, from which a screen has room to keep the
 * table's discards beside the hand. A phone held sideways is 320–430 tall; a
 * foldable opened out, like a OnePlus Open, or a tablet is 700 and more.
 */
export const ROOMY_SHORT_SIDE = 560;

function roomy(): boolean {
  return Math.min(window.innerWidth, window.innerHeight) >= ROOMY_SHORT_SIDE;
}

/**
 * Whether this screen is a foldable opened out or a tablet rather than a
 * phone. Read from the window's short side, which is the controller's height
 * whichever way up the screen is held: the controller fills it and is turned
 * to lie sideways.
 */
export function useRoomyScreen(): boolean {
  const [value, setValue] = useState(() => typeof window !== "undefined" && roomy());
  useEffect(() => {
    // A foldable folds and unfolds with the page open.
    const update = () => setValue(roomy());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return value;
}
