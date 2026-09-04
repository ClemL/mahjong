"use client";

import { useEffect, useState } from "react";

/**
 * True on touch input. Used to decide where a confirmation step is worth the
 * extra tap: a mis-click with a mouse is cheap, a stray touch on a phone you
 * are holding throws a tile you needed.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}
