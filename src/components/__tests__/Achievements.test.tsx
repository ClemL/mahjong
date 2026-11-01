// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Earned } from "@/game/achievements";
import type { RoomView } from "@/game/room";
import { AchievementToasts, TOAST_MS } from "../AchievementToasts";
import { PlayerStats, YourGame, formatDuration } from "../GameStats";
import { TableLobby } from "../TableLobby";
import { dealt, fakeApi, lobby, playerView, sound, tableView } from "./fixtures";

const NAMES = ["Kris", "Srini", "Robot Hanna", "Teja"];
const name = (seat: number) => NAMES[seat];

function withEarned(view: RoomView, earned: Earned[], gameId = view.gameId): RoomView {
  return { ...view, achievements: earned, gameId };
}

const selfMade: Earned = { id: "selfMade", seat: 0, name: "Kris", hand: 2 };
const pungFu: Earned = { id: "pungFu", seat: 1, name: "Srini", hand: 3 };

describe("achievement toasts", () => {
  it("pop up only what is earned after the screen opened, and go again on their own", () => {
    vi.useFakeTimers();
    const base = tableView(dealt([0, 1]));
    // Earned before this screen looked: not popped up again.
    const { rerender } = render(<AchievementToasts view={withEarned(base, [selfMade])} />);
    expect(screen.queryByText("Self-Made 自摸")).toBeNull();

    rerender(<AchievementToasts view={withEarned(base, [selfMade, pungFu])} />);
    expect(screen.getByText("Pung Fu")).toBeTruthy();
    expect(screen.getByText("Srini earned")).toBeTruthy();
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText("Pung Fu")).toBeNull();
    vi.useRealTimers();
  });

  it("show a phone only its own player's, and start again with a new game", () => {
    const base = playerView(dealt([0, 1]), 0);
    const { rerender } = render(<AchievementToasts view={withEarned(base, [])} mine={0} />);
    rerender(<AchievementToasts view={withEarned(base, [pungFu])} mine={0} />);
    expect(screen.queryByText("Pung Fu")).toBeNull();
    rerender(<AchievementToasts view={withEarned(base, [pungFu, selfMade])} mine={0} />);
    expect(screen.getByText("Self-Made 自摸")).toBeTruthy();
    expect(screen.getByText("Achievement")).toBeTruthy();

    // The next game's list starts from nothing, and its first entry is new.
    rerender(<AchievementToasts view={withEarned(base, [{ ...selfMade, id: "offTheMark" }], base.gameId + 1)} mine={0} />);
    expect(screen.getByText("Off the Mark")).toBeTruthy();
  });
});

describe("the final scores' players", () => {
  function finished(): RoomView {
    const view = tableView(dealt([0, 1, 3]));
    return {
      ...view,
      stats: {
        turnMs: [134_000, 61_000, 0, 9_000],
        turns: [20, 10, 0, 3],
        quick: [4, 1, 0, 3],
        hurriesSent: [2, 0, 0, 1],
        hurriesReceived: [0, 3, 0, 0],
        pungs: [4, 1, 4, 0],
        chows: [0, 5, 2, 1],
        kongs: [0, 0, 0, 0],
      },
      achievements: [selfMade, pungFu],
    };
  }

  it("say how long each person took over their turns, their hurry-ups, and who claimed the most", () => {
    render(<PlayerStats view={finished()} name={name} />);
    expect(screen.getByText("Most pungs: Kris and Robot Hanna, 4")).toBeTruthy();
    expect(screen.getByText("Most chows: Srini, 5")).toBeTruthy();
    const kris = screen.getByRole("row", { name: /^Kris/ });
    expect(within(kris).getByText("2m 14s")).toBeTruthy();
    expect(within(kris).getByText("20 turns · 7s each")).toBeTruthy();
    expect(within(kris).getByText("2 · 0")).toBeTruthy();
    // The computer's turns are not timed.
    expect(within(screen.getByRole("row", { name: /^Robot Hanna/ })).getByText("—")).toBeTruthy();
    expect(screen.getByText("Self-Made 自摸")).toBeTruthy();
  });

  it("leave achievements out at a table that has them off", () => {
    const view = finished();
    render(<PlayerStats view={{ ...view, settings: { ...view.settings, achievements: false } }} name={name} />);
    expect(screen.queryByRole("heading", { name: "Achievements" })).toBeNull();
  });

  it("give a phone its own game in a line, with its achievements", () => {
    render(<YourGame view={finished()} seat={0} />);
    expect(screen.getByText(/2m 14s on 20 turns \(7s each\) · 4 pungs · 0 chows · hurried others 2×, hurried 0×/)).toBeTruthy();
    expect(screen.getByText("Self-Made 自摸")).toBeTruthy();
  });

  it("put times the way people say them", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_400)).toBe("45s");
    expect(formatDuration(134_000)).toBe("2m 14s");
    expect(formatDuration(60_000)).toBe("1m 00s");
  });
});

describe("the achievements setting in the lobby", () => {
  it("says whether they are on, and the table can switch them", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);
    expect(screen.getByText(/Achievements on/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Achievements"), { target: { value: "off" } });
    expect(api.control).toHaveBeenCalledWith({ type: "achievements", value: false });
  });
});
