// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "@/game/appearance";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { type PhoneDisplay, type TabletDisplay, usePhoneDisplay } from "@/hooks/useLocalSetting";
import { TableSettings } from "../TableSettings";
import { PhoneSettings } from "../PhoneSettings";
import { NAMES, dealt, fakeApi, lobby, sound, tableView } from "./fixtures";

const appearance: AppearanceApi = { appearance: DEFAULT_APPEARANCE, set: vi.fn(), replace: vi.fn(), reset: vi.fn() };

function tabletDisplay(): TabletDisplay {
  return { turnGlow: "on", setTurnGlow: vi.fn(), wall: "on", setWall: vi.fn(), callouts: "on", setCallouts: vi.fn() };
}

function phoneDisplay(): PhoneDisplay {
  return {
    playLog: "on",
    setPlayLog: vi.fn(),
    size: "standard",
    setSize: vi.fn(),
    stretch: "off",
    setStretch: vi.fn(),
    vibrate: "on",
    setVibrate: vi.fn(),
    keepAwake: "off",
    setKeepAwake: vi.fn(),
    setHints: "on",
    setSetHints: vi.fn(),
    hurry: "off",
    setHurry: vi.fn(),
    helper: "on",
    setHelper: vi.fn(),
    takeBack: "off",
    setTakeBack: vi.fn(),
    takeBackLocked: false,
  };
}

describe("the table's settings", () => {
  it("opens on the house rules, says what is in force, and sends each rule to the room", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    render(<TableSettings api={api} view={view} sound={sound} appearance={appearance} display={tabletDisplay()} />);

    expect(screen.getByRole("tab", { name: /^House rules/ }).getAttribute("aria-selected")).toBe("true");
    for (const rule of ["Min 1 faan", "All four winds", "Flowers in", "包 Liability", "Others pay half", "截糊 First winner only"]) {
      expect(screen.getAllByText(rule).length).toBeGreaterThan(0);
    }

    fireEvent.click(within(screen.getByRole("group", { name: "Minimum faan" })).getByRole("button", { name: /^5/ }));
    expect(api.control).toHaveBeenCalledWith({ type: "minFaan", value: 5 });
    fireEvent.click(screen.getByRole("button", { name: /Discarder only/ }));
    expect(api.control).toHaveBeenCalledWith({ type: "othersPayHalf", value: false });
    fireEvent.click(within(screen.getByRole("group", { name: "Two can win on one discard" })).getByRole("button", { name: /Everyone/ }));
    expect(api.control).toHaveBeenCalledWith({ type: "multipleWinners", value: true });
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
    fireEvent.click(screen.getByRole("switch", { name: "Take back a discard" }));
    expect(api.control).toHaveBeenCalledWith({ type: "takeBack", value: false });
    fireEvent.click(within(screen.getByRole("group", { name: "Difficulty" })).getByRole("button", { name: "Hard" }));
    expect(api.control).toHaveBeenCalledWith({ type: "difficulty", value: "hard" });

    const pace = screen.getByRole("tab", { name: /Pace & turns/ });
    fireEvent.keyDown(pace, { key: "ArrowDown" });
    const history = screen.getByRole("tab", { name: /^History/ });
    expect(history.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(history, { key: "ArrowDown" });
    const tablet = screen.getByRole("tab", { name: /This tablet/ });
    expect(tablet.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tablet);
    fireEvent.click(screen.getByRole("switch", { name: "Wall" }));
    expect(display.setWall).toHaveBeenCalledWith("off");
    fireEvent.click(screen.getByRole("switch", { name: "Spoken calls" }));
    expect(display.setCallouts).toHaveBeenCalledWith("off");
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
    fireEvent.click(screen.getByRole("switch", { name: "Stretch to the edges" }));
    expect(display.setStretch).toHaveBeenCalledWith("on");
    // Set hints are one of the assists now.
    const assists = screen.getByRole("heading", { name: "Assists" }).parentElement!;
    expect(within(assists).getByRole("switch", { name: "Set hints" })).toBeTruthy();
  });

  it("keeps the screen awake and goes full screen from the settings, not the bar", () => {
    const display = phoneDisplay();
    const fullscreen = { supported: true, active: false, enter: vi.fn(), exit: vi.fn() };
    const { rerender } = render(
      <PhoneSettings sound={sound} config={tableView(lobby([0])).config} appearance={appearance} display={display} fullscreen={fullscreen} />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Keep awake" }));
    expect(display.setKeepAwake).toHaveBeenCalledWith("on");
    fireEvent.click(screen.getByRole("switch", { name: "Full screen" }));
    expect(fullscreen.enter).toHaveBeenCalled();

    const on = { ...fullscreen, active: true };
    rerender(
      <PhoneSettings
        sound={sound}
        config={tableView(lobby([0])).config}
        appearance={appearance}
        display={{ ...display, keepAwake: "on" }}
        fullscreen={on}
        wakeLock="unsupported"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Full screen" }));
    expect(on.exit).toHaveBeenCalled();
    // A browser that cannot hold the screen on says so rather than pretending.
    const awake = screen.getByRole("switch", { name: "Keep awake" });
    expect(awake).toHaveProperty("disabled", true);
    expect(screen.getByText("This browser cannot keep the screen on")).toBeTruthy();
  });

  it("offers take back as an assist, always on for Louis, and off for everyone when the table says so", () => {
    const display = phoneDisplay();
    const config = tableView(lobby([0])).config;
    const { rerender } = render(<PhoneSettings sound={sound} config={config} appearance={appearance} display={display} />);
    const assists = () => screen.getByRole("heading", { name: "Assists" }).parentElement!;
    fireEvent.click(within(assists()).getByRole("switch", { name: "Take back" }));
    expect(display.setTakeBack).toHaveBeenCalledWith("on");

    rerender(
      <PhoneSettings sound={sound} config={config} appearance={appearance} display={{ ...display, takeBack: "on", takeBackLocked: true }} />,
    );
    const louis = within(assists()).getByRole("switch", { name: "Take back" });
    expect(louis.getAttribute("aria-checked")).toBe("true");
    expect(louis).toHaveProperty("disabled", true);
    expect(screen.getByText("Always on for Louis")).toBeTruthy();

    rerender(<PhoneSettings sound={sound} config={config} appearance={appearance} display={display} tableTakeBack={false} />);
    expect(within(assists()).getByRole("switch", { name: "Take back" })).toHaveProperty("disabled", true);
    expect(screen.getByText("The table has switched take back off for everyone")).toBeTruthy();
  });

  it("starts every assist off, but on for the players who get them, until a choice is made", () => {
    const plain = renderHook(() => usePhoneDisplay("Kris")).result.current;
    expect([plain.setHints, plain.helper, plain.hurry, plain.takeBack]).toEqual(["off", "off", "off", "off"]);
    const lucy = renderHook(() => usePhoneDisplay(" lucy ")).result.current;
    expect([lucy.setHints, lucy.helper, lucy.hurry, lucy.takeBack]).toEqual(["on", "on", "on", "on"]);
    // Louis has take back whatever has been chosen, and only take back.
    window.localStorage.setItem("hk-mahjong.take-back", "off");
    try {
      const louis = renderHook(() => usePhoneDisplay("Louis")).result.current;
      expect([louis.takeBack, louis.takeBackLocked, louis.helper]).toEqual(["on", true, "off"]);
      expect(renderHook(() => usePhoneDisplay("Kris")).result.current.takeBack).toBe("off");
    } finally {
      window.localStorage.removeItem("hk-mahjong.take-back");
    }
    window.localStorage.setItem("hk-mahjong.set-hints", "on");
    try {
      expect(renderHook(() => usePhoneDisplay("Kris")).result.current.setHints).toBe("on");
    } finally {
      window.localStorage.removeItem("hk-mahjong.set-hints");
    }
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

describe("the table's history", () => {
  it("lists each person's record and the games, newest first, once the section is opened", async () => {
    const games = [
      {
        id: "g2",
        endedAt: Date.UTC(2026, 9, 24, 20, 0),
        hands: 12,
        endedEarly: false,
        players: [
          { seat: 1, name: "Srini", human: true, chips: 150, place: 1, wins: 4, thrown: 0, bestFaan: 7 },
          { seat: 0, name: "Kris", human: true, chips: 120, place: 2, wins: 2, thrown: 1, bestFaan: 3 },
          { seat: 2, name: "Robot Hanna", human: false, chips: 80, place: 3, wins: 1, thrown: 2, bestFaan: 1 },
          { seat: 3, name: "Robot Clem", human: false, chips: 50, place: 4, wins: 0, thrown: 3, bestFaan: 0 },
        ],
        biggest: { name: "Srini", faan: 7, pattern: "Half Flush 混一色" },
      },
    ];
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ games }) }));
    vi.stubGlobal("fetch", fetchMock);
    const view = tableView(lobby([0]));
    render(<TableSettings api={fakeApi(view)} view={view} sound={sound} appearance={appearance} display={tabletDisplay()} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /^History/ }));
    expect(fetchMock).toHaveBeenCalledWith(`/api/rooms/${view.roomId}/games`);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual(["Srini", "Kris"]);
    expect(within(rows[0]).getByText("7 faan")).toBeTruthy();
    expect(screen.getByText(/Biggest hand: Srini, 7 faan · Half Flush 混一色/)).toBeTruthy();
    expect(screen.getByText(/12 hands/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
