"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClaimPrompt } from "@/game/controller";
import type { StrategyName } from "@/game/ai";
import { DEFAULT_RULES, MIN_FAAN_CHOICES } from "@/game/rules";
import { primeAudio } from "@/game/sound";

export type Speed = "slow" | "normal" | "fast";

/** The game options a player sets before sitting down, kept per device. */
export interface Preferences {
  minFaan: number;
  speed: Speed;
  showHints: boolean;
  muted: boolean;
  opponents: StrategyName;
  claimPrompt: ClaimPrompt;
}

export const DEFAULT_PREFERENCES: Preferences = {
  minFaan: DEFAULT_RULES.minFaan,
  speed: "normal",
  showHints: true,
  muted: false,
  opponents: "greedy",
  claimPrompt: "useful",
};

const STORAGE_KEY = "hk-mahjong.prefs";

/**
 * Stamped on every save. Builds before version 2 wrote their 0 faan default
 * alongside whatever was actually changed, so a minimum stored by one of them
 * is not a choice anybody made, and the current default replaces it.
 */
const PREFS_VERSION = 2;

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Anything stored by an older build, or tampered with, falls back field by field. */
export function normalizePreferences(raw: unknown): Preferences {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  return {
    minFaan:
      r.version === PREFS_VERSION
        ? pick(r.minFaan, MIN_FAAN_CHOICES as readonly number[], d.minFaan)
        : d.minFaan,
    speed: pick<Speed>(r.speed as Speed, ["slow", "normal", "fast"], d.speed),
    showHints: typeof r.showHints === "boolean" ? r.showHints : d.showHints,
    muted: typeof r.muted === "boolean" ? r.muted : d.muted,
    opponents: pick<StrategyName>(r.opponents as StrategyName, ["greedy", "random"], d.opponents),
    claimPrompt: pick<ClaimPrompt>(
      r.claimPrompt as ClaimPrompt,
      ["useful", "always", "wins"],
      d.claimPrompt,
    ),
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

/**
 * The settings surface shared by the start page and the solo game's drawer, so
 * the same panels drive both and a change in either is remembered by the other.
 */
export interface GameSettings {
  minFaan: number;
  setMinFaan: (value: number) => void;
  speed: Speed;
  setSpeed: (value: Speed) => void;
  showHints: boolean;
  setShowHints: (value: boolean) => void;
  muted: boolean;
  setMuted: (value: boolean) => void;
  opponents: StrategyName;
  setOpponents: (value: StrategyName) => void;
  claimPrompt: ClaimPrompt;
  setClaimPrompt: (value: ClaimPrompt) => void;
}

export interface PreferencesApi extends GameSettings {
  prefs: Preferences;
  /** False until the stored choices have been read, so nothing acts on the defaults by mistake. */
  loaded: boolean;
}

export function usePreferences(): PreferencesApi {
  // Defaults first so the server and first client render agree.
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(readPreferences());
    setLoaded(true);
  }, []);

  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      writePreferences(next);
      return next;
    });
  }, []);

  return {
    prefs,
    loaded,
    ...prefs,
    setMinFaan: useCallback((value: number) => set("minFaan", value), [set]),
    setSpeed: useCallback((value: Speed) => set("speed", value), [set]),
    setShowHints: useCallback((value: boolean) => set("showHints", value), [set]),
    setMuted: useCallback(
      (value: boolean) => {
        set("muted", value);
        if (!value) primeAudio();
      },
      [set],
    ),
    setOpponents: useCallback((value: StrategyName) => set("opponents", value), [set]),
    setClaimPrompt: useCallback((value: ClaimPrompt) => set("claimPrompt", value), [set]),
  };
}
