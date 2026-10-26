"use client";

import { useCallback, useState } from "react";

/**
 * A per-device display choice kept in localStorage, like sound or the
 * controller's density: what one screen shows is that screen's business.
 *
 * Read during the first render, as `useCompactLayout` does, so the screen does
 * not paint once with the default and then jump. Both screens that use it only
 * render after the room view has arrived in the browser, never on the server.
 */
export function useLocalSetting<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // A choice that cannot be saved still applies for this session.
      }
    },
    [key],
  );

  return [value, set];
}

/**
 * Like `useLocalSetting`, but null until the player has chosen, so the default
 * can follow something only known later — who is sitting in the seat.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[]): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return allowed.includes(stored as T) ? (stored as T) : null;
    } catch {
      return null;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // A choice that cannot be saved still applies for this session.
      }
    },
    [key],
  );

  return [value, set];
}

export type OnOff = "on" | "off";
const ON_OFF: readonly OnOff[] = ["on", "off"];

/** What the tablet draws besides the game itself. */
export interface TabletDisplay {
  /** Light the discard area of the seat whose turn it is. */
  turnGlow: OnOff;
  setTurnGlow: (value: OnOff) => void;
  /** The wall of tiles still to be drawn, faint under everything else. */
  wall: OnOff;
  setWall: (value: OnOff) => void;
  /** Claims and wins called out loud, as the players would at a real table. */
  callouts: OnOff;
  setCallouts: (value: OnOff) => void;
}

export function useTabletDisplay(): TabletDisplay {
  const [turnGlow, setTurnGlow] = useLocalSetting<OnOff>("hk-mahjong.turn-glow", "on", ON_OFF);
  const [wall, setWall] = useLocalSetting<OnOff>("hk-mahjong.wall", "on", ON_OFF);
  const [callouts, setCallouts] = useLocalSetting<OnOff>("hk-mahjong.callouts", "on", ON_OFF);
  return { turnGlow, setTurnGlow, wall, setWall, callouts, setCallouts };
}

/** The panes beside a squared felt, each of which the tablet can close. */
export const SIDE_PANES = ["round", "scores", "scoring", "join", "settings"] as const;
export type SidePane = (typeof SIDE_PANES)[number];

const HIDDEN_PANES_KEY = "hk-mahjong.side-hidden";

/**
 * Which side-panel panes this tablet has closed. A per-screen choice that
 * outlives the game: a table that never wants the scoring rules up should not
 * have to close them again every evening.
 */
export function useHiddenPanes(): {
  hidden: SidePane[];
  hide: (pane: SidePane) => void;
  showAll: () => void;
} {
  const [hidden, setHidden] = useState<SidePane[]>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(HIDDEN_PANES_KEY) : null;
      return SIDE_PANES.filter((pane) => (stored ?? "").split(",").includes(pane));
    } catch {
      return [];
    }
  });

  const save = useCallback((next: SidePane[]) => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_PANES_KEY, next.join(","));
    } catch {
      // A choice that cannot be saved still applies for this session.
    }
  }, []);

  return {
    hidden,
    hide: useCallback((pane: SidePane) => save([...hidden.filter((p) => p !== pane), pane]), [hidden, save]),
    showAll: useCallback(() => save([]), [save]),
  };
}

export type PhoneSize = "compact" | "standard" | "comfy";

/** What the phone shows besides the hand and its choices. */
export interface PhoneDisplay {
  playLog: OnOff;
  setPlayLog: (value: OnOff) => void;
  size: PhoneSize;
  setSize: (value: PhoneSize) => void;
  /** The hand run out to the edges of the screen, its tiles scaled up to fill it. */
  stretch: OnOff;
  setStretch: (value: OnOff) => void;
  /** A buzz when it is your turn, a claim is offered, or you win. */
  vibrate: OnOff;
  setVibrate: (value: OnOff) => void;
  /** A line under three tiles in the hand that already make a set — one of the assists. */
  setHints: OnOff;
  setSetHints: (value: OnOff) => void;
  /** The hurry-up button, and this screen flashing when someone presses theirs. */
  hurry: OnOff;
  setHurry: (value: OnOff) => void;
  /** The ♿ button that lists what finishes each set the hand has started. */
  helper: OnOff;
  setHelper: (value: OnOff) => void;
}

/** Players whose seat has the assists on until they say otherwise, lower-cased. */
const ASSISTED = new Set(["zaid", "lucy"]);

/**
 * The assists — set hints, hurry up and the helper — start off for everyone
 * but the players in `ASSISTED`. A choice made in settings always wins.
 */
export function assistsDefault(name: string | null | undefined): OnOff {
  return ASSISTED.has(name?.trim().toLowerCase() ?? "") ? "on" : "off";
}

/** `name` is whoever holds this phone's seat, which sets the assists' default. */
export function usePhoneDisplay(name?: string | null): PhoneDisplay {
  const [playLog, setPlayLog] = useLocalSetting<OnOff>("hk-mahjong.play-log", "on", ON_OFF);
  const [size, setSize] = useLocalSetting<PhoneSize>("hk-mahjong.ui-size", "standard", [
    "compact",
    "standard",
    "comfy",
  ]);
  const [vibrate, setVibrate] = useLocalSetting<OnOff>("hk-mahjong.vibrate", "on", ON_OFF);
  const [stretch, setStretch] = useLocalSetting<OnOff>("hk-mahjong.hand-stretch", "off", ON_OFF);
  const [setHintsChoice, setSetHints] = useStoredChoice<OnOff>("hk-mahjong.set-hints", ON_OFF);
  const [hurryChoice, setHurry] = useStoredChoice<OnOff>("hk-mahjong.hurry", ON_OFF);
  const [helperChoice, setHelper] = useStoredChoice<OnOff>("hk-mahjong.helper", ON_OFF);
  const setHints = setHintsChoice ?? assistsDefault(name);
  const hurry = hurryChoice ?? assistsDefault(name);
  const helper = helperChoice ?? assistsDefault(name);
  return {
    playLog,
    setPlayLog,
    size,
    setSize,
    stretch,
    setStretch,
    vibrate,
    setVibrate,
    setHints,
    setSetHints,
    hurry,
    setHurry,
    helper,
    setHelper,
  };
}
