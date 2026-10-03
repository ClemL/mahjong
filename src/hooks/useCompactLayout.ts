"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "hk-mahjong.compact";

export interface CompactLayout {
  compact: boolean;
  setCompact: (value: boolean) => void;
}

/**
 * Whether this phone's controller uses the dense layout. A per-device choice,
 * like sound: a small phone wants it, a large one may not.
 *
 * Read during the first render rather than after it, so the controller does not
 * paint once in the roomy layout and then jump. That is safe because the
 * controller only renders after the room view has arrived in the browser —
 * never on the server.
 */
export function useCompactLayout(): CompactLayout {
  const [compact, setCompactState] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const setCompact = useCallback((value: boolean) => {
    setCompactState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // A preference that cannot be saved still applies for this session.
    }
  }, []);

  return { compact, setCompact };
}
