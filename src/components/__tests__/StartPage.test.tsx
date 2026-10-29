// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
/** A table's row, status line and all. */
const tableRow = (name: RegExp) => screen.getByRole("radio", { name }).closest("label")!;

describe("StartPage", () => {
  it("offers the two ways in, both at a table, and no game on this device alone", () => {
    render(<StartPage />);
    expect(href(/^Sit down at Table 1$/)).toBe("/room/TABLE");
    expect(href(/^Be Table 1 on this screen$/)).toBe("/room/TABLE?seat=table");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).not.toContain("/solo");
  });

  it("remembers the house minimum for the next game", () => {
    render(<StartPage />);
    fireEvent.click(screen.getByRole("tab", { name: "House rules" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Min faan" })).getByRole("button", { name: /^3/ }));
    expect(readPreferences().minFaan).toBe(3);
  });

  it("opens a tablet on the look, a phone on its layout, and then whichever tab was open last", () => {
    const { unmount } = render(<StartPage />);
    expect(screen.getByRole("tab", { name: "Table & tiles" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Tile faces");
    unmount();

    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-height: 560px") }));
    const phone = render(<StartPage />);
    expect(screen.getByRole("tab", { name: "This phone" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(screen.getByRole("group", { name: "Phone layout" })).getByRole("button", { name: /Compact/ }));
    expect(window.localStorage.getItem("hk-mahjong.compact")).toBe("1");

    // The arrow keys walk the tabs, and the one left open is the one that opens next time.
    fireEvent.keyDown(screen.getByRole("tab", { name: "This phone" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Table & tiles" }).getAttribute("aria-selected")).toBe("true");
    phone.unmount();
    render(<StartPage />);
    expect(screen.getByRole("tab", { name: "Table & tiles" }).getAttribute("aria-selected")).toBe("true");
  });

  it("sets the look from swatches, each named and marked when chosen", () => {
    render(<StartPage />);
    const themes = screen.getByRole("group", { name: "Table color" });
    fireEvent.click(within(themes).getByRole("button", { name: "Midnight" }));
    expect(document.documentElement.dataset.theme).toBe("midnight");
    expect(within(themes).getByRole("button", { name: "Midnight" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(screen.getByRole("group", { name: "Tile backs" })).getByRole("button", { name: "Crimson" }));
    expect(document.documentElement.dataset.backs).toBe("crimson");
    expect(screen.getByRole("img", { name: /^Preview of the Midnight table/ })).toBeTruthy();
  });

  it("resets the chosen table only once confirmed", async () => {
    const fetch = tableStatuses({ TABLE: EMPTY, TABLE2: EMPTY, TABLE3: EMPTY });
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    window.localStorage.setItem("hk-mahjong.room.TABLE", "tok-old");
    render(<StartPage />);
    const posts = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST");

    const reset = screen.getByRole("button", { name: /^Reset Table 1/ });
    fireEvent.click(reset);
    expect(posts()).toEqual([]);

    confirm.mockReturnValue(true);
    fireEvent.click(reset);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Table 1 is empty/));
    expect(posts()).toEqual([["/api/rooms/TABLE/reset", { method: "POST" }]]);
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE")).toBeNull();
  });

  it("points both ways in and Reset at the chosen table", async () => {
    const fetch = tableStatuses({ TABLE: EMPTY, TABLE2: EMPTY, TABLE3: EMPTY });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("confirm", () => true);
    window.localStorage.setItem("hk-mahjong.room.TABLE", "tok-one");
    window.localStorage.setItem("hk-mahjong.room.TABLE2", "tok-two");
    render(<StartPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Table 2" }));
    expect(href(/^Sit down at Table 2$/)).toBe("/room/TABLE2");
    expect(href(/^Be Table 2 on this screen$/)).toBe("/room/TABLE2?seat=table");
    expect(window.localStorage.getItem("hk-mahjong.table")).toBe("TABLE2");

    fireEvent.click(screen.getByRole("button", { name: /^Reset Table 2/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Table 2 is empty/));
    expect(fetch).toHaveBeenCalledWith("/api/rooms/TABLE2/reset", { method: "POST" });
    // Only the seat at the table that was reset is forgotten.
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE2")).toBeNull();
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE")).toBe("tok-one");
  });

  it("comes back to the table this device chose last", () => {
    window.localStorage.setItem("hk-mahjong.table", "TABLE3");
    render(<StartPage />);
    expect(href(/^Sit down at/)).toBe("/room/TABLE3");
    expect((screen.getByRole("radio", { name: "Table 3" }) as HTMLInputElement).checked).toBe(true);
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
    await waitFor(() => expect(tableRow(/^Table 1/).textContent).toMatch(/In play · 3 players/));
    await waitFor(() => expect(tableRow(/^Table 2/).textContent).toMatch(/1 player waiting · no table screen/));
    await waitFor(() => expect(tableRow(/^Table 3/).textContent).toMatch(/Empty/));
    // The status is read out with the radio, not only shown beside it.
    expect(screen.getByRole("radio", { name: "Table 1" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Table 1" })).toHaveProperty("checked", true);
  });
});

describe("normalizePreferences", () => {
  it("keeps valid choices and replaces anything else with the default", () => {
    // Fields a solo game used to store are dropped.
    expect(normalizePreferences({ version: 4, minFaan: 5, speed: "warp", opponents: "random" })).toEqual({
      minFaan: 5,
      rounds: 4,
    });
    expect(normalizePreferences(null).minFaan).toBe(1);
    // Older builds saved their default minimum with every change — 0, later 3.
    // That is not a choice to keep, so the current default replaces it.
    expect(normalizePreferences({ minFaan: 0, muted: true }).minFaan).toBe(1);
    expect(normalizePreferences({ version: 3, minFaan: 3, rounds: 2 })).toEqual({ minFaan: 1, rounds: 2 });
    expect(normalizePreferences({ version: 4, minFaan: 0 }).minFaan).toBe(0);
    expect(normalizePreferences({ version: 4, minFaan: 4 }).minFaan).toBe(1);
    // A game runs one, two or four wind rounds; anything else is the all-four default.
    expect(normalizePreferences({ version: 3, rounds: 2 }).rounds).toBe(2);
    expect(normalizePreferences({ version: 3, rounds: 3 }).rounds).toBe(4);
    // Builds before version 3 saved the old one-round default with every change.
    expect(normalizePreferences({ version: 2, rounds: 1 }).rounds).toBe(4);
  });
});
