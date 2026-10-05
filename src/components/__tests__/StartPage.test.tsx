// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartPage } from "../StartPage";
import { normalizePreferences, readPreferences } from "@/hooks/usePreferences";

// The film pulls in a canvas renderer jsdom cannot run; only the button matters here.
vi.mock("../FilmPlayer", () => ({ FilmDialog: () => null }));
// The footer fetches the changelog, which would muddy the reset request assertions.
vi.mock("../BuildFooter", () => ({ BuildFooter: () => null }));

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

  it("resets the multiplayer table only once confirmed", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    window.localStorage.setItem("hk-mahjong.room.TABLE", "tok-old");
    render(<StartPage />);

    const reset = screen.getByRole("button", { name: "Reset multiplayer table" });
    fireEvent.click(reset);
    expect(fetch).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(reset);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/table is empty/));
    expect(fetch).toHaveBeenCalledWith("/api/rooms/TABLE/reset", { method: "POST" });
    expect(window.localStorage.getItem("hk-mahjong.room.TABLE")).toBeNull();
  });
});

describe("normalizePreferences", () => {
  it("keeps valid choices and replaces anything else with the default", () => {
    expect(
      normalizePreferences({ version: 2, minFaan: 5, speed: "warp", showHints: false, opponents: "random" }),
    ).toEqual({
      minFaan: 5,
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
  });
});
