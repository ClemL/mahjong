"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  STORAGE_KEY,
  applyAppearance,
  normalizeAppearance,
} from "@/game/appearance";

export interface AppearanceApi {
  appearance: Appearance;
  set: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void;
  reset: () => void;
}

export function useAppearance(): AppearanceApi {
  // Start from the defaults so the server and first client render agree; the
  // inline head script has already put any stored choice on the element, so
  // there is no flash while this catches up.
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setAppearance(normalizeAppearance(JSON.parse(raw)));
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — the
      // defaults are already applied.
    }
  }, []);

  const persist = useCallback((next: Appearance) => {
    setAppearance(next);
    applyAppearance(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A preference that cannot be saved is still applied for this session.
    }
  }, []);

  const set = useCallback(
    <K extends keyof Appearance>(key: K, value: Appearance[K]) => {
      persist({ ...appearance, [key]: value });
    },
    [appearance, persist],
  );

  const reset = useCallback(() => persist(DEFAULT_APPEARANCE), [persist]);

  return { appearance, set, reset };
}
