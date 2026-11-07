// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeScreenHint } from "../HomeScreenHint";

/** Safari in a tab on an iPhone says `standalone` is false; no other browser has it. */
function asIphoneSafari(standalone: boolean | undefined) {
  Object.defineProperty(navigator, "standalone", { configurable: true, value: standalone });
}

afterEach(() => {
  asIphoneSafari(undefined);
  window.localStorage.clear();
});

describe("HomeScreenHint", () => {
  it("tells Safari on an iPhone how to lose its bars, once, until it is put away", () => {
    asIphoneSafari(false);
    const { unmount } = render(<HomeScreenHint />);
    expect(screen.getByRole("note").textContent).toMatch(/Add to Home Screen/);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("note")).toBeNull();
    unmount();

    render(<HomeScreenHint />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says nothing once opened from the Home Screen, or in any other browser", () => {
    asIphoneSafari(true);
    const home = render(<HomeScreenHint />);
    expect(screen.queryByRole("note")).toBeNull();
    home.unmount();

    asIphoneSafari(undefined);
    render(<HomeScreenHint />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
