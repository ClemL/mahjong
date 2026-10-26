"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/game/room";
import type { RoomApi } from "./useRoom";

/**
 * Tell the table whether this phone has take back on among its assists, so it
 * holds this seat's throws for a take back only when it should — and makes
 * nobody else wait out seconds they never asked for.
 *
 * Sent whenever what the table has on record differs from the setting: after
 * a change, or for a chair the table has not heard about yet. Checked again on
 * every new version of the room, so a send that failed is tried once more.
 */
export function useTakeBackAssist(view: RoomView, api: Pick<RoomApi, "act">, on: boolean): void {
  // Never having said is the same as off, so a phone with it off says nothing.
  const recorded = view.takeBack.assist ?? false;
  const sending = useRef<boolean | null>(null);
  const act = api.act;
  useEffect(() => {
    if (recorded === on) {
      sending.current = null;
      return;
    }
    if (sending.current === on) return;
    sending.current = on;
    void act({ type: "assist", takeBack: on }).finally(() => {
      sending.current = null;
    });
  }, [recorded, on, act, view.version]);
}
