"use client";

import { type RefObject, useEffect, useLayoutEffect, useState } from "react";

type Size = { width: number; height: number };

/** Sub-pixel jitter while the browser chrome animates would otherwise re-solve the whole table every frame. */
const settle = (previous: Size, width: number, height: number): Size =>
  Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1 ? previous : { width, height };

/** The live content-box size of an element; zero until it has been measured. */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measured once before the first paint, so what depends on the size is not
  // drawn one way and then redrawn another. Layout sizes, not the screen box:
  // held upright, the page is turned on its side.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const width = element.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
    const height = element.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0");
    if (width > 0 && height > 0) setSize((previous) => settle(previous, width, height));
  }, [ref]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) => settle(previous, width, height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
