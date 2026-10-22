// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "@/game/appearance";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { PhoneDisplay, TabletDisplay } from "@/hooks/useLocalSetting";
import { TableSettings } from "../TableSettings";
import { PhoneSettings } from "../PhoneSettings";
import { NAMES, dealt, fakeApi, lobby, sound, tableView } from "./fixtures";

const appearance: AppearanceApi = { appearance: DEFAULT_APPEARANCE, set: vi.fn(), reset: vi.fn() };

function tabletDisplay(): TabletDisplay {
  return { turnGlow: "on", setTurnGlow: vi.fn(), wall: "on", setWall: vi.fn() };
}

function phoneDisplay(): PhoneDisplay {
  return {
    playLog: "on",
    setPlayLog: vi.fn(),
    size: "standard",
    setSize: vi.fn(),
    vibrate: "on",
    setVibrate: vi.fn(),
    setHints: "on",
    setSetHints: vi.fn(),
    hurry: "off",
    setHurry: vi.fn(),
    helper: "on",
    setHelper: vi.fn(),
  };
}

describe("the table's settings", () => {
  it("opens on the house rules, says what is in force, and sends each rule to the room", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    render(<TableSettings api={api} view={view} sound={sound} appearance={appearance} display={tabletDisplay()} />);

    expect(screen.getByRole("tab", { name: /^House rules/ }).getAttribute("aria-selected")).toBe("true");
    for (const rule of ["Min 1 faan", "All four winds", "Flowers in", "包 Liability", "Others pay half"]) {
      expect(screen.getAllByText(rule).length).toBeGreaterThan(0);
    }

    fireEvent.click(within(screen.getByRole("group", { name: "Minimum faan" })).getByRole("button", { name: /^5/ }));
    expect(api.control).toHaveBeenCalledWith({ type: "minFaan", value: 5 });
    fireEvent.click(screen.getByRole("button", { name: /Discarder only/ }));
    expect(api.control).toHaveBeenCalledWith({ type: "othersPayHalf", value: false });
    fireEvent.click(screen.getByRole("switch", { name: "包 Liability" }));
    expect(api.control).toHaveBeenCalledWith({ type: "liability", value: false });
  });

  it("lists who sits where and hands a person's chair to the computer once confirmed", () => {
    const view = tableView(dealt([0, 2]));
    const api = fakeApi(view);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<TableSettings api={api} view={view} sound={sound} appearance={appearance} display={tabletDisplay()} />);

    fireEvent.click(screen.getByRole("tab", { name: /^Players/ }));
    expect(screen.getByRole("tab", { name: /^Players/ }).textContent).toContain("2 on phones · 2 computer");
    // Only people can be taken out; the computer's chairs have no button.
    const buttons = screen.getAllByRole("button", { name: /with the computer$/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      `Replace ${NAMES[0]} with the computer`,
      `Replace ${NAMES[2]} with the computer`,
    ]);

    fireEvent.click(buttons[1]);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(`The computer plays on as Robot ${NAMES[2]}`));
    expect(api.control).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(buttons[1]);
    expect(api.control).toHaveBeenCalledWith({ type: "replaceWithComputer", seat: 2 });
    vi.unstubAllGlobals();
  });

  it("works the payout example from the table's own payout table and paying rule", () => {
    const view = tableView(lobby([0]));
    const { rerender } = render(<TableSettings api={fakeApi(view)} view={view} appearance={appearance} />);
    const rows = () => [...document.querySelectorAll(".payout__rows dd")].map((dd) => dd.textContent);
    expect(screen.getByText("A 3-faan win off a discard (8 points)")).toBeTruthy();
    expect(rows()).toEqual(["−8", "−4", "+16"]);

    const alone = { ...view, config: { ...view.config, othersPayHalf: false } };
    rerender(<TableSettings api={fakeApi(alone)} view={alone} appearance={appearance} />);
    expect(rows()).toEqual(["−8", "0", "+8"]);
  });

  it("locks the tile set while a hand is being played", () => {
    const view = tableView(dealt([0]));
    render(<TableSettings api={fakeApi(view)} view={view} appearance={appearance} />);
    expect(screen.getByText("Locked until this hand ends")).toBeTruthy();
    const flowers = screen.getByRole("group", { name: "Flowers and Seasons" });
    for (const button of within(flowers).getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
  });

  it("moves between sections from the rail, by tap or by arrow key", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    const display = tabletDisplay();
    render(<TableSettings api={api} view={view} sound={sound} appearance={appearance} display={display} />);

    fireEvent.click(screen.getByRole("tab", { name: /Pace & turns/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Turn time limit" })).getByRole("button", { name: "1 min" }));
    expect(api.control).toHaveBeenCalledWith({ type: "turnLimit", value: 60 });

    const pace = screen.getByRole("tab", { name: /Pace & turns/ });
    fireEvent.keyDown(pace, { key: "ArrowDown" });
    const tablet = screen.getByRole("tab", { name: /This tablet/ });
    expect(tablet.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tablet);
    fireEvent.click(screen.getByRole("switch", { name: "Wall" }));
    expect(display.setWall).toHaveBeenCalledWith("off");
  });
});

describe("a phone's settings", () => {
  it("groups the phone's own settings, each a switch or a choice", () => {
    const display = phoneDisplay();
    render(
      <PhoneSettings
        sound={sound}
        config={tableView(lobby([0])).config}
        appearance={appearance}
        display={display}
        layout={{ compact: false, setCompact: vi.fn() }}
      />,
    );
    for (const group of ["On this phone", "Your hand", "Assists"]) {
      expect(screen.getByRole("heading", { name: group })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("switch", { name: "Helper" }));
    expect(display.setHelper).toHaveBeenCalledWith("off");
    fireEvent.click(screen.getByRole("switch", { name: "Hurry up" }));
    expect(display.setHurry).toHaveBeenCalledWith("on");
    fireEvent.click(within(screen.getByRole("group", { name: "Button size" })).getByRole("button", { name: "Comfy" }));
    expect(display.setSize).toHaveBeenCalledWith("comfy");
  });

  it("says so when the browser cannot vibrate, rather than offering a switch that does nothing", () => {
    // jsdom, like an iPhone, has no navigator.vibrate.
    render(<PhoneSettings sound={sound} config={tableView(lobby([0])).config} appearance={appearance} display={phoneDisplay()} />);
    const vibrate = screen.getByRole("switch", { name: "Vibrate" });
    expect(vibrate).toHaveProperty("disabled", true);
    expect(vibrate.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/iPhones never can/)).toBeTruthy();
  });
});
