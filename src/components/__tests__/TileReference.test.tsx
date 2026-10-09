// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TileReference } from "../TileReference";
import { DEFAULT_APPEARANCE } from "@/game/appearance";

const api = () => ({ appearance: DEFAULT_APPEARANCE, set: vi.fn(), reset: vi.fn() });

describe("TileReference", () => {
  it("shows one of every tile, flowers and seasons included", () => {
    render(<TileReference api={api()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show every tile" }));
    const dialog = screen.getByRole("dialog", { name: "Every tile" });
    expect(dialog.querySelectorAll(".tile")).toHaveLength(42);
    expect(within(dialog).getAllByText("Red Dragon").length).toBeGreaterThan(0);
    const seasons = within(dialog).getByRole("region", { name: "Seasons" });
    expect(within(seasons).getAllByText("Winter").length).toBeGreaterThan(0);
    expect(within(seasons).getByText("Winter North")).toBeTruthy();
  });

  it("switches the face from inside the sheet", () => {
    const appearance = api();
    render(<TileReference api={appearance} />);
    fireEvent.click(screen.getByRole("button", { name: "Show every tile" }));
    fireEvent.click(screen.getByRole("button", { name: /Western/ }));
    expect(appearance.set).toHaveBeenCalledWith("tiles", "western");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
