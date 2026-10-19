// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HandRecord } from "@/game/engine";
import type { RoomView } from "@/game/room";
import { TableTop } from "../TableTop";
import { PhoneResult } from "../PhoneResult";
import { PhoneView } from "../PhoneView";
import { NAMES, dealt, fakeApi, playerView, sound, tableView } from "./fixtures";

/** A felt measured at a landscape tablet's size, as soon as it is observed. */
function feltSize(width = 1264, height = 700) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

const score = {
  faan: 3,
  scoredFaan: 3,
  value: 8,
  limitReached: false,
  patterns: [{ key: "allChows", chinese: "平糊", name: "All Sequences", faan: 3 }],
};

/** Kris threw the tile Steven went out on; Srini and James each paid half. */
function discardWin(view: RoomView): RoomView {
  return {
    ...view,
    phase: "handOver",
    result: { type: "win", winner: 2, from: 0, score, payments: [-8, -4, 16, -4], dealerKeeps: false },
  };
}

const history: HandRecord[] = [
  { handNumber: 1, roundWind: "we", dealer: 0, type: "win", winner: 2, from: 0, faan: 3, value: 8, payments: [-8, -4, 16, -4], scores: [-8, -4, 16, -4], pattern: { name: "All Sequences", chinese: "平糊" } },
  { handNumber: 2, roundWind: "we", dealer: 1, type: "washout", winner: null, from: null, faan: null, value: null, payments: [0, 0, 0, 0], scores: [-8, -4, 16, -4] },
  { handNumber: 3, roundWind: "we", dealer: 2, type: "win", winner: 1, from: null, faan: 6, value: 32, payments: [-32, 96, -32, -32], scores: [-40, 92, -16, -36], pattern: { name: "Half Flush", chinese: "混一色" } },
  { handNumber: 4, roundWind: "we", dealer: 3, type: "win", winner: 3, from: 0, faan: 4, value: 16, payments: [-16, -8, -8, 32], scores: [-56, 84, -24, -4] },
];

function gameOver(view: RoomView): RoomView {
  return {
    ...view,
    phase: "gameOver",
    history,
    scores: [-56, 84, -24, -4],
    result: { type: "win", winner: 3, from: 0, score, payments: [-16, -8, -8, 32], dealerKeeps: false },
  };
}

describe("the table's hand result", () => {
  it("says who threw the tile, who paid half, and how the table settles up", () => {
    feltSize();
    const over = discardWin(tableView(dealt()));
    render(<TableTop api={fakeApi(over)} view={over} sound={sound} />);
    const sheet = screen.getByRole("dialog", { name: "Hand result" });
    const rows = Array.from(sheet.querySelectorAll(".who-pays__row"));
    expect(rows.map((r) => r.querySelector(".who-pays__name")!.textContent)).toEqual([
      NAMES[0],
      NAMES[1],
      NAMES[3],
      NAMES[2],
    ]);
    expect(rows.map((r) => r.querySelector(".who-pays__role")!.textContent)).toEqual([
      "threw the tile",
      "half share",
      "half share",
      "winner",
    ]);
    // The bars are drawn to scale against the biggest movement: the winner's.
    expect(rows.map((r) => (r.querySelector(".who-pays__bar") as HTMLElement).style.getPropertyValue("--share"))).toEqual([
      "0.5",
      "0.25",
      "0.25",
      "1",
    ]);
    expect(within(sheet).getByText("Others pay half · house rule")).toBeTruthy();
    expect(within(sheet).getByText(`The deal moves on · ${NAMES[1]} deals hand ${over.handNumber + 1}`)).toBeTruthy();
  });

  it("offers the final scores, not another hand, after the game's last hand", () => {
    feltSize();
    const base = tableView(dealt());
    const last = { ...discardWin(base), dealership: 3, roundWind: "we", config: { ...base.config, rounds: 1 } };
    render(<TableTop api={fakeApi(last)} view={last} sound={sound} />);
    expect(screen.getAllByRole("button", { name: "Final scores" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Next hand" })).toBeNull();
    expect(screen.getByText("That was the last hand of the game.")).toBeTruthy();
  });
});

describe("the end of the game", () => {
  it("ranks everyone, tells the game in four facts, and starts another from the lobby", () => {
    feltSize();
    const over = gameOver(tableView(dealt()));
    const api = fakeApi(over);
    render(<TableTop api={api} view={over} sound={sound} />);
    const sheet = screen.getByRole("dialog", { name: "Game complete" });
    expect(within(sheet).getByRole("heading", { level: 2 }).textContent).toBe(`${NAMES[1]} takes the table`);

    const standings = Array.from(sheet.querySelectorAll(".standings__row"));
    expect(standings.map((r) => r.querySelector(".standings__name")!.textContent)).toEqual([
      NAMES[1],
      NAMES[3],
      NAMES[2],
      NAMES[0],
    ]);
    expect(standings.map((r) => r.querySelector(".standings__count")!.textContent)).toEqual(["184", "96", "76", "44"]);

    const stats = Array.from(sheet.querySelectorAll(".game-stat")).map((s) => s.textContent);
    expect(stats).toEqual([
      `Biggest hand6 faan${NAMES[1]}, hand 3 · Half Flush 混一色`,
      "Self-draws1of 3 wins · 自摸",
      `Threw the most winners2${NAMES[0]}`,
      "Washouts1of 4 hands · 流局",
    ]);

    fireEvent.click(within(sheet).getByRole("button", { name: "New game" }));
    expect(api.control).toHaveBeenCalledWith({ type: "restart" });
  });

  it("draws everyone's chips hand by hand, named at the end of each line, with the same numbers as a table", () => {
    feltSize();
    const over = gameOver(tableView(dealt()));
    const { container } = render(<TableTop api={fakeApi(over)} view={over} sound={sound} />);
    const sheet = screen.getByRole("dialog", { name: "Game complete" });

    expect(container.querySelectorAll(".chips-chart__line")).toHaveLength(4);
    const labels = Array.from(container.querySelectorAll(".chips-chart__label")).map((l) => l.textContent);
    expect(labels).toEqual([`${NAMES[0]} 44`, `${NAMES[1]} 184`, `${NAMES[2]} 76`, `${NAMES[3]} 96`]);

    // The keyboard steps the crosshair through the hands, as a pointer would.
    const chart = container.querySelector(".chips-chart") as HTMLElement;
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    const tip = container.querySelector(".chips-chart__tip")!;
    expect(tip.querySelector(".chips-chart__tip-title")!.textContent).toBe("Hand 3");
    expect(tip.querySelector(".chips-chart__tip-what")!.textContent).toBe(
      `${NAMES[1]} self-drawn · Half Flush, 6 faan`,
    );

    fireEvent.click(within(sheet).getByRole("button", { name: "Hand by hand" }));
    const rows = Array.from(sheet.querySelectorAll(".chips-table tbody tr"));
    expect(rows).toHaveLength(history.length + 1);
    expect(rows[2].textContent).toContain("Washed out 流局");
  });
});

describe("a phone's hand result", () => {
  it("says what the hand cost this phone and why, beside the whole table's chips", () => {
    const view = discardWin(playerView(dealt(), 0));
    render(<PhoneResult view={view} seat={0} nameOf={(s) => NAMES[s]} onHide={() => {}} />);
    expect(document.querySelector(".phone-result__big")!.textContent).toBe("−8");
    expect(screen.getByText("You threw the winning tile, so you pay the full share.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: `${NAMES[2]} wins 食糊` })).toBeTruthy();
    const rows = Array.from(document.querySelectorAll(".phone-result__row"));
    expect(rows.map((r) => r.querySelector(".phone-result__delta")!.textContent)).toEqual(["+16", "−4", "−4", "−8"]);
  });

  it("sits above the hand, and can be put aside and brought back", () => {
    const view = discardWin(playerView(dealt(), 0));
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    const result = screen.getByRole("region", { name: "Hand result" });
    // The hand is never under it: the result is a row of the phone, not a layer over the hand.
    expect(result.contains(container.querySelector(".phone__hand"))).toBe(false);
    expect(container.querySelector(".phone--result")).not.toBeNull();

    fireEvent.click(within(result).getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region", { name: "Hand result" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Result" }));
    expect(screen.getByRole("region", { name: "Hand result" })).toBeTruthy();
  });

  it("gives each phone its place once the game is over", () => {
    const view = gameOver(playerView(dealt(), 3));
    render(<PhoneResult view={view} seat={3} nameOf={(s) => NAMES[s]} onHide={() => {}} />);
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText(new RegExp(`${NAMES[1]} takes the table`))).toBeTruthy();
  });
});
