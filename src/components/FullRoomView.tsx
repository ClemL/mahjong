"use client";

import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { PhoneView } from "./PhoneView";
import { TableView } from "./TableView";

/**
 * What a player sees when no tablet is acting as the table: the shared view
 * and their own hand on one screen, since nothing else is showing the pond.
 * Table controls stay hidden — those belong to the table device.
 */
export function FullRoomView({ api, view }: { api: RoomApi; view: RoomView }) {
  const readOnlyTable: RoomApi = { ...api, control: async () => {}, busy: true };
  return (
    <div className="fullroom">
      <div className="fullroom__table">
        <TableView api={readOnlyTable} view={view} />
      </div>
      <PhoneView api={api} view={view} />
    </div>
  );
}
