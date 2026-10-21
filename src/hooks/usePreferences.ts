"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RULES, MIN_FAAN_CHOICES, ROUND_CHOICES } from "@/game/rules";

/**
 * The house rules this device sets on a table it opens in tablet mode, kept
 * per device. Once tiles are out, the table's own settings are the ones used.
 */
export interface Preferences {
  minFaan: number;
  /** Wind rounds in a game: 1, 2 or 4. */
  rounds: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  minFaan: DEFAULT_RULES.minFaan,
  rounds: DEFAULT_RULES.rounds,
};

const STORAGE_KEY = "hk-mahjong.prefs";

/**
 * Stamped on every save. Builds before version 2 wrote their 0 faan default
 * alongside whatever was actually changed, so a minimum stored by one of them
 * is not a choice anybody made, and the current default replaces it. Version 3
 * did the same for the one-round game length when the default became all four,
 * and version 4 for the 3 faan minimum when the default became 1.
 */
const PREFS_VERSION = 4;

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Anything stored by an older build, or tampered with, falls back field by field. */
export function normalizePreferences(raw: unknown): Preferences {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  return {
    minFaan:
      typeof r.version === "number" && r.version >= 4
        ? pick(r.minFaan, MIN_FAAN_CHOICES as readonly number[], d.minFaan)
        : d.minFaan,
    rounds:
      typeof r.version === "number" && r.version >= 3
        ? pick(r.rounds, ROUND_CHOICES as readonly number[], d.rounds)
        : d.rounds,
  };
}

export function readPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
  } catch {
    // A preference that cannot be saved still applies for this session.
  }
}

/** The house-rule defaults the start page sets. */
export interface GameSettings {
  minFaan: number;
  setMinFaan: (value: number) => void;
  rounds: number;
  setRounds: (value: number) => void;
}

export function usePreferences(): GameSettings {
  // Defaults first so the server and first client render agree.
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(readPreferences());
  }, []);

  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      writePreferences(next);
      return next;
    });
  }, []);

  return {
    ...prefs,
    setMinFaan: useCallback((value: number) => set("minFaan", value), [set]),
    setRounds: useCallback((value: number) => set("rounds", value), [set]),
  };
}
