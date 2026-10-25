"use client";

import { useEffect } from "react";
import { validAppearance } from "@/game/appearance";
import type { RoomView } from "@/game/room";
import type { AppearanceApi } from "./useAppearance";

/** The last table look this phone took on, as `<room>:<deal>`. */
const ADOPTED_KEY = "hk-mahjong.look-adopted";

/**
 * Take on the look the table was dealt with — its felt, tile faces, body,
 * backs and suit colours — once per deal. Each new game starts every phone
 * matching the table; whatever a player changes after that is theirs until
 * the next deal.
 */
export function useTableLook(view: RoomView, appearance: Pick<AppearanceApi, "replace">): void {
  const look = view.look;
  const stamp = look ? `${view.roomId}:${look.id}` : null;
  const replace = appearance.replace;
  useEffect(() => {
    if (!look || !stamp) return;
    try {
      if (window.localStorage.getItem(ADOPTED_KEY) === stamp) return;
      window.localStorage.setItem(ADOPTED_KEY, stamp);
    } catch {
      // Without storage it is taken on at every visit, which is still the table's look.
    }
    replace(validAppearance(look));
    // Only a new deal brings a new look.
  }, [stamp]);
}
