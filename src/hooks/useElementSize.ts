"use client";

import { type RefObject, useEffect, useState } from "react";

/** The live content-box size of an element; zero until it has been measured. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Sub-pixel jitter while the browser chrome animates would otherwise
      // re-solve the whole table every frame.
      setSize((previous) =>
        Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1
          ? previous
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
