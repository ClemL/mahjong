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
}

export function useTabletDisplay(): TabletDisplay {
  const [turnGlow, setTurnGlow] = useLocalSetting<OnOff>("hk-mahjong.turn-glow", "on", ON_OFF);
  const [wall, setWall] = useLocalSetting<OnOff>("hk-mahjong.wall", "on", ON_OFF);
  return { turnGlow, setTurnGlow, wall, setWall };
}

export type PhoneSize = "compact" | "standard" | "comfy";

/** What the phone shows besides the hand and its choices. */
export interface PhoneDisplay {
  playLog: OnOff;
  setPlayLog: (value: OnOff) => void;
  size: PhoneSize;
  setSize: (value: PhoneSize) => void;
}

export function usePhoneDisplay(): PhoneDisplay {
  const [playLog, setPlayLog] = useLocalSetting<OnOff>("hk-mahjong.play-log", "on", ON_OFF);
  const [size, setSize] = useLocalSetting<PhoneSize>("hk-mahjong.ui-size", "standard", [
    "compact",
    "standard",
    "comfy",
  ]);
  return { playLog, setPlayLog, size, setSize };
}
