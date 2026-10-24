import { vi } from "vitest";
import { discard } from "@/game/engine";
import {
  CLAIM_WINDOW_MS,
  HURRY_GRACE_MS,
  type Room,
  type RoomView,
  drain,
  newRoom,
  noteActing,
  notePlayed,
  pendingHumanClaimants,
  startPlay,
  syncSeats,
  viewFor,
} from "@/game/room";
import type { Seat } from "@/game/tiles";
import type { RoomApi } from "@/hooks/useRoom";
import type { SoundToggle } from "@/hooks/useRoomSound";

export const NAMES = ["Kris", "Srini", "Steven", "James"];

export function sit(room: Room, seat: Seat, name = NAMES[seat]): void {
  room.seats[seat] = { kind: "human", name, token: `tok-${seat}`, lastSeen: Date.now() };
  syncSeats(room);
}

/** A room still gathering, with a tablet acting as the table. */
export function lobby(seats: Seat[] = [], withTable = true): Room {
  const room = newRoom("TEST", undefined, 42);
  for (const s of seats) sit(room, s);
  if (withTable) room.table = { token: "tok-table", lastSeen: Date.now() };
  return room;
}

/** A dealt hand with the computer moved on until a person has to act. */
export function dealt(seats: Seat[] = [0, 1, 2, 3], seed = 42, withTable = true): Room {
  const room = newRoom("TEST", undefined, seed);
  for (const s of seats) sit(room, s);
  if (withTable) room.table = { token: "tok-table", lastSeen: Date.now() };
  startPlay(room);
  drain(room);
  return room;
}

/**
 * A hand where the dealer's first discard leaves `claimer` a claim to answer.
 * Deals are searched by seed because whether a discard is claimable depends
 * on what was dealt.
 */
export function claimable(): { room: Room; claimer: Seat } {
  for (let seed = 1; seed < 500; seed++) {
    const room = dealt([0, 1, 2, 3], seed);
    const dealer = room.state.dealer;
    if (room.state.phase !== "action" || room.state.turn !== dealer) continue;
    for (const tile of room.state.players[dealer].hand) {
      const next = discard(room.state, dealer, tile.id);
      if (next.phase !== "claiming") continue;
      room.state = next;
      // As the room does after every move: the table shows the newest discard.
      notePlayed(room);
      room.claimDeadline = Date.now() + CLAIM_WINDOW_MS;
      const waiting = pendingHumanClaimants(room);
      if (waiting.length > 0) return { room, claimer: waiting[0] };
    }
  }
  throw new Error("no claimable deal in the first 500 seeds");
}

/**
 * The turn on the table already under way: its deal shown and its first
 * moments, when nobody may hurry it, gone.
 */
export function underway(room: Room, now = Date.now()): void {
  const since = now - HURRY_GRACE_MS;
  room.lastStepAt = since;
  room.acting = null;
  noteActing(room, since);
}

export function tableView(room: Room): RoomView {
  return viewFor(room, "tok-table");
}

export function playerView(room: Room, seat: Seat): RoomView {
  return viewFor(room, `tok-${seat}`);
}

export function fakeApi(view: RoomView, busy = false): RoomApi {
  return {
    view,
    error: null,
    busy,
    token: null,
    stale: false,
    setToken: vi.fn(),
    act: vi.fn(async () => {}),
    control: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    resetTable: vi.fn(async () => {}),
    resume: vi.fn(),
    refresh: vi.fn(),
  };
}

export const sound: SoundToggle = { muted: false, setMuted: () => {} };
