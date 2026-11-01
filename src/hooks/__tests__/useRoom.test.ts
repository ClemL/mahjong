// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_WRITE_MS, TABLE_IDLE_MS, type RoomView, newRoom, pauseTable, startPlay, viewFor } from "@/game/room";
import { endGame } from "@/game/engine";
import { CALM_POLL_MS, IDLE_AFTER_MS, IDLE_POLL_MS, POLL_MS, pollDelay, useRoom } from "../useRoom";

/** A room with Kris at East and a tablet, as the given device sees it. */
function viewAs(token: string | null, dealt: boolean, change?: (room: ReturnType<typeof newRoom>) => void): RoomView {
  const room = newRoom("TABLE1", undefined, 3);
  room.seats[0] = { kind: "human", name: "Kris", token: "tok-0", lastSeen: Date.now() };
  room.table = { token: "tok-table", lastSeen: Date.now() };
  if (dealt) startPlay(room);
  change?.(room);
  return viewFor(room, token);
}

describe("pollDelay", () => {
  it("keeps a hand being played up to the second, for the table and the players", () => {
    expect(pollDelay(viewAs("tok-0", true), 0)).toBe(POLL_MS);
    expect(pollDelay(viewAs("tok-table", true), 0)).toBe(POLL_MS);
  });

  it("calms down where nothing moves on its own", () => {
    expect(pollDelay(viewAs("tok-table", false), 0)).toBe(CALM_POLL_MS);
    expect(pollDelay(viewAs(null, true), 0)).toBe(CALM_POLL_MS);
    expect(pollDelay(viewAs("tok-0", true, (room) => void pauseTable(room)), 0)).toBe(CALM_POLL_MS);
    expect(pollDelay(viewAs("tok-0", true, (room) => void (room.state = endGame(room.state))), 0)).toBe(CALM_POLL_MS);
  });

  it("idles once nothing has changed and nobody has touched the device for a while", () => {
    expect(pollDelay(viewAs("tok-0", true), IDLE_AFTER_MS - 1)).toBe(POLL_MS);
    expect(pollDelay(viewAs("tok-0", true), IDLE_AFTER_MS)).toBe(IDLE_POLL_MS);
    expect(pollDelay(viewAs("tok-table", false), IDLE_AFTER_MS)).toBe(IDLE_POLL_MS);
  });

  it("idles slowly enough to save requests and quickly enough that the table is never taken for gone", () => {
    // The table writes its heartbeat on the first poll at least HEARTBEAT_WRITE_MS
    // after the last: an idle table's is never older than the two together.
    expect(IDLE_POLL_MS + HEARTBEAT_WRITE_MS).toBeLessThan(TABLE_IDLE_MS);
    expect(IDLE_POLL_MS / POLL_MS).toBeGreaterThan(15);
  });
});

describe("useRoom's pace", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls a gathering table calmly, slows right down when left alone, and wakes on a touch", async () => {
    vi.useFakeTimers();
    const lobby = viewAs("tok-table", false);
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/rooms/TABLE1?") || String(url) === "/api/rooms/TABLE1") polls += 1;
        // Only the first answer is a change; after that the table sits still.
        const body = polls === 1 ? lobby : { unchanged: true, version: lobby.version };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    renderHook(() => useRoom("TABLE1"));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    // One on arrival, then one every CALM_POLL_MS.
    expect(polls).toBe(1 + Math.floor(10_000 / CALM_POLL_MS));

    // Ten quiet minutes in, it idles.
    await act(() => vi.advanceTimersByTimeAsync(IDLE_AFTER_MS));
    const before = polls;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(polls - before).toBeLessThanOrEqual(Math.ceil(60_000 / IDLE_POLL_MS));

    // A touch asks at once, and the pace picks back up.
    const woken = polls;
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(polls).toBe(woken + 1);
    await act(() => vi.advanceTimersByTimeAsync(CALM_POLL_MS * 2));
    expect(polls).toBe(woken + 3);
  });
});
