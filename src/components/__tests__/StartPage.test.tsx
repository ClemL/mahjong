// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartPage } from "../StartPage";
import { normalizePreferences, readPreferences } from "@/hooks/usePreferences";

// The film pulls in a canvas renderer jsdom cannot run; only the button matters here.
vi.mock("../FilmPlayer", () => ({ FilmDialog: () => null }));
// The footer fetches the changelog, which would muddy the reset request assertions.
vi.mock("../BuildFooter", () => ({ BuildFooter: () => null }));

/** What each table answers a tokenless look with; enough for the picker's status line. */
function tableStatuses(views: Record<string, object>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response("{}", { status: 200 });
    const id = url.split("/").pop()!;
    return new Response(JSON.stringify(views[id] ?? { error: "No such table" }), {
      status: views[id] ? 200 : 404,
    });
  });
}

const EMPTY = { started: false, seatedCount: 0, tablePresent: false };

beforeEach(() => {
  vi.stubGlobal("fetch", tableStatuses({ TABLE: EMPTY, TABLE2: EMPTY, TABLE3: EMPTY }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("StartPage", () => {
  it("offers the three ways in", () => {
    render(<StartPage />);
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/Play solo/)).toBe("/solo");
    expect(href(/Multiplayer/)).toBe("/room/TABLE");
    expect(href(/Tablet mode/)).toBe("/room/TABLE?seat=table");
  });

  it("remembers the house minimum for the next game", () => {
    render(<StartPage />);
    fireEvent.change(screen.getByLabelText(/Min faan/), { target: { value: "3" } });
    expect(readPreferences().minFaan).toBe(3);
  });

  it("resets the chosen table only once confirmed", async () => {
    const fetch = tableStatuses({ TABLE: EMPTY, TABLE2: EMPTY, TABLE3: EMPTY });
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    window.localStorage.setItem("hk-mahjong.room.TABLE", "tok-old");
    render(<StartPage />);
    const posts = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST");

    const reset = screen.getByRole("button", { name: "Reset Table 1" });
    fireEvent.click(reset);
    expect(posts()).toEqual([]);

    confirm.mockReturnValue(true);
    fireEvent.click(reset);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Table 1 is empty/));
    expect(posts()).toEqual([["/api/rooms/TABLE/reset", { method: "POST" }]]);
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE")).toBeNull();
  });

  it("points Multiplayer, Tablet mode and Reset at the chosen table", async () => {
    const fetch = tableStatuses({ TABLE: EMPTY, TABLE2: EMPTY, TABLE3: EMPTY });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("confirm", () => true);
    window.localStorage.setItem("hk-mahjong.room.TABLE", "tok-one");
    window.localStorage.setItem("hk-mahjong.room.TABLE2", "tok-two");
    render(<StartPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Table 2/ }));
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/Multiplayer/)).toBe("/room/TABLE2");
    expect(href(/Tablet mode/)).toBe("/room/TABLE2?seat=table");
    expect(window.localStorage.getItem("hk-mahjong.table")).toBe("TABLE2");

    fireEvent.click(screen.getByRole("button", { name: "Reset Table 2" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Table 2 is empty/));
    expect(fetch).toHaveBeenCalledWith("/api/rooms/TABLE2/reset", { method: "POST" });
    // Only the seat at the table that was reset is forgotten.
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE2")).toBeNull();
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE")).toBe("tok-one");
  });

  it("comes back to the table this device chose last", () => {
    window.localStorage.setItem("hk-mahjong.table", "TABLE3");
    render(<StartPage />);
    expect(screen.getByRole("link", { name: /Multiplayer/ }).getAttribute("href")).toBe("/room/TABLE3");
    expect(screen.getByRole("button", { name: /^Table 3/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says who is already at each table", async () => {
    vi.stubGlobal(
      "fetch",
      tableStatuses({
        TABLE: { started: true, seatedCount: 3, tablePresent: true },
        TABLE2: { started: false, seatedCount: 1, tablePresent: false },
        TABLE3: EMPTY,
      }),
    );
    render(<StartPage />);
    const status = (name: RegExp) => screen.getByRole("button", { name }).textContent;
    await waitFor(() => expect(status(/^Table 1/)).toMatch(/In play · 3 players/));
    await waitFor(() => expect(status(/^Table 2/)).toMatch(/1 player waiting/));
    await waitFor(() => expect(status(/^Table 3/)).toMatch(/Empty/));
  });
});

describe("normalizePreferences", () => {
  it("keeps valid choices and replaces anything else with the default", () => {
    expect(
      normalizePreferences({ version: 2, minFaan: 5, speed: "warp", showHints: false, opponents: "random" }),
    ).toEqual({
      minFaan: 5,
      rounds: 1,
      speed: "normal",
      showHints: false,
      muted: false,
      opponents: "random",
      claimPrompt: "useful",
    });
    expect(normalizePreferences(null).minFaan).toBe(3);
    // An older build saved its 0 default with every change; that is not a choice to keep.
    expect(normalizePreferences({ minFaan: 0, muted: true }).minFaan).toBe(3);
    expect(normalizePreferences({ version: 2, minFaan: 0 }).minFaan).toBe(0);
    expect(normalizePreferences({ version: 2, minFaan: 4 }).minFaan).toBe(3);
    // A game runs one, two or four wind rounds; anything else is the one-round default.
    expect(normalizePreferences({ rounds: 2 }).rounds).toBe(2);
    expect(normalizePreferences({ rounds: 3 }).rounds).toBe(1);
  });
});
