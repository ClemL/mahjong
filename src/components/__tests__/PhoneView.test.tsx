// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Seat } from "@/game/tiles";
import { SEAT_NAMES, tileName } from "@/game/tiles";
import { PhoneView } from "../PhoneView";
import { claimable, dealt, fakeApi, playerView, sound } from "./fixtures";

/** Phones in these tests are touch screens unless they say otherwise. */
function touchScreen() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(pointer: coarse)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** The seat name beside the wind glyph in the header bar. */
function seatName(container: HTMLElement) {
  return container.querySelector(".phone__seat > span:not(.phone__wind):not(.phone__name)") as HTMLElement;
}

function handButtons(container: HTMLElement) {
  return within(container.querySelector(".phone__hand") as HTMLElement).getAllByRole("button");
}

/** The seat whose turn it is in a fresh deal, and a view from their phone. */
function onTurn() {
  const room = dealt();
  const seat = room.state.turn as Seat;
  return { room, seat, view: playerView(room, seat) };
}

describe("PhoneView", () => {
  it("shows the player their own hand, with the drawn tile set apart", () => {
    const { seat, view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

    const own = view.players[seat].hand;
    expect(own.some((t) => t.code === "back")).toBe(false);
    expect(handButtons(container)).toHaveLength(own.length);
    expect(container.querySelectorAll(".phone__hand .tile--drawn")).toHaveLength(
      view.drawnTileId ? 1 : 0,
    );
    expect(screen.getByText("Your turn — discard a tile.")).toBeTruthy();
    expect(seatName(container).textContent).toBe(` · ${SEAT_NAMES[seat]}`);
    expect(container.querySelector(".phone__name")!.textContent).toBe(view.players[seat].occupant.name);
  });

  it("discards on a double-click with a mouse, never a single one", () => {
    const { seat, view } = onTurn();
    const api = fakeApi(view);
    const { container } = render(<PhoneView api={api} view={view} sound={sound} />);

    fireEvent.click(handButtons(container)[0]);
    expect(api.act).not.toHaveBeenCalled();
    fireEvent.click(handButtons(container)[0]);
    expect(api.act).toHaveBeenCalledWith({
      type: "discard",
      tileId: view.players[seat].hand.find((t) => t.id !== view.drawnTileId)!.id,
    });
  });

  it("throws a tile flicked up off the hand, and only on your turn", () => {
    touchScreen();
    const { room, seat, view } = onTurn();
    const api = fakeApi(view);
    const { container } = render(<PhoneView api={api} view={view} sound={sound} />);
    const tile = handButtons(container)[2];
    const flick = (dy: number) => {
      fireEvent.pointerDown(tile, { pointerId: 1, clientX: 100, clientY: 300 });
      fireEvent.pointerMove(tile, { pointerId: 1, clientX: 102, clientY: 300 + dy / 2 });
      fireEvent.pointerMove(tile, { pointerId: 1, clientX: 104, clientY: 300 + dy });
      fireEvent.pointerUp(tile, { pointerId: 1, clientX: 104, clientY: 300 + dy });
      fireEvent.click(tile);
    };

    // A short nudge settles back and arms nothing.
    flick(-14);
    expect(api.act).not.toHaveBeenCalled();
    expect(tile.className).not.toContain("tile--armed");

    flick(-120);
    expect(api.act).toHaveBeenCalledWith({ type: "discard", tileId: tile.dataset.tileId });
    expect(tile.className).toContain("tile--flung");

    // Off turn, the same movement is only a drag along the rack.
    const other = playerView(room, ((seat + 1) % 4) as Seat);
    const offApi = fakeApi(other);
    const { container: off } = render(<PhoneView api={offApi} view={other} sound={sound} />);
    const theirs = handButtons(off)[2];
    fireEvent.pointerDown(theirs, { pointerId: 2, clientX: 100, clientY: 300 });
    fireEvent.pointerMove(theirs, { pointerId: 2, clientX: 100, clientY: 180 });
    fireEvent.pointerUp(theirs, { pointerId: 2, clientX: 100, clientY: 180 });
    expect(offApi.act).not.toHaveBeenCalled();
  });

  it("arms a tile on the first tap and throws it on the second", () => {
    touchScreen();
    const { view } = onTurn();
    const api = fakeApi(view);
    const { container } = render(<PhoneView api={api} view={view} sound={sound} />);

    const tile = handButtons(container)[0];
    fireEvent.click(tile);
    expect(api.act).not.toHaveBeenCalled();
    expect(tile.className).toContain("tile--armed");
    expect(screen.getByRole("status").textContent).toMatch(/^Discard .+\?/);

    fireEvent.click(tile);
    expect(api.act).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lets an armed tile be kept or thrown from the confirm bar", () => {
    touchScreen();
    const { seat, view } = onTurn();
    const api = fakeApi(view);
    const { container } = render(<PhoneView api={api} view={view} sound={sound} />);
    const first = view.players[seat].hand.find((t) => t.id !== view.drawnTileId)!;

    fireEvent.click(handButtons(container)[0]);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(api.act).not.toHaveBeenCalled();

    fireEvent.click(handButtons(container)[0]);
    expect(screen.getByText(`Discard ${tileName(first.code)}?`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(api.act).toHaveBeenCalledWith({ type: "discard", tileId: first.id });
  });

  it("turns the hand face down and back up", () => {
    const { seat, view } = onTurn();
    const api = fakeApi(view);
    const { container } = render(<PhoneView api={api} view={view} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide hand" }));
    expect(container.querySelectorAll(".phone__hand .tile--back")).toHaveLength(
      view.players[seat].hand.length,
    );
    expect(container.querySelector(".phone__hand [data-tile-id]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Hand hidden/ }));
    expect(container.querySelector(".phone__hand .tile--back")).toBeNull();
    expect(handButtons(container)).toHaveLength(view.players[seat].hand.length);
  });

  it("asks for more time once, while the turn clock runs", () => {
    const { view } = onTurn();
    const timed = { ...view, turnDeadlineIn: 12_000, turnExtended: false };
    const api = fakeApi(timed);
    const { rerender } = render(<PhoneView api={api} view={timed} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: /^More time/ }));
    expect(api.act).toHaveBeenCalledWith({ type: "moreTime" });

    const extended = { ...timed, turnDeadlineIn: 41_000, turnExtended: true };
    rerender(<PhoneView api={api} view={extended} sound={sound} />);
    expect(screen.queryByRole("button", { name: /^More time/ })).toBeNull();
    expect(screen.getByRole("timer").textContent).toBe("41s");
  });

  it("keeps the hand locked when it is somebody else's turn", () => {
    const room = dealt();
    const other = ((room.state.turn + 1) % 4) as Seat;
    const view = playerView(room, other);
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

    // Locked, not disabled: a disabled button would swallow the drags that reorder the hand.
    for (const button of handButtons(container)) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
    expect(screen.getByText(`Waiting for ${view.players[room.state.turn].occupant.name}…`)).toBeTruthy();
  });

  it("offers the claims on a discard and sends the one chosen", () => {
    const { room, claimer } = claimable();
    const view = playerView(room, claimer);
    const api = fakeApi(view);
    render(<PhoneView api={api} view={view} sound={sound} />);

    const discard = view.lastDiscard!;
    expect(
      screen.getByText(`${view.players[discard.from].occupant.name} discarded ${tileName(discard.tile.code)}`),
    ).toBeTruthy();
    const group = screen.getByRole("group", { name: `Claim ${tileName(discard.tile.code)}?` });
    const option = view.claim!.options[0];

    fireEvent.click(within(group).getAllByRole("button")[0]);
    expect(api.act).toHaveBeenCalledWith({ type: "claim", optionId: option.id });
  });

  it("shows the newest discard and a play log on the controller", () => {
    const { room, claimer } = claimable();
    const view = playerView(room, claimer);
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} landscape />);

    const discard = view.lastDiscard!;
    expect(container.querySelector(".phone__last")).not.toBeNull();
    const rows = Array.from(container.querySelectorAll(".playlog__row"));
    expect(rows.at(-1)!.getAttribute("title")).toBe(
      `${view.players[discard.from].occupant.name} discarded ${tileName(discard.tile.code)}`,
    );
  });

  it("hides the play log when the phone's settings say so", () => {
    window.localStorage.setItem("hk-mahjong.play-log", "off");
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} landscape />);
    expect(container.querySelector(".playlog")).toBeNull();
    window.localStorage.removeItem("hk-mahjong.play-log");
  });
});

describe("PhoneView compact mode", () => {
  const compactStored = () => window.localStorage.setItem("hk-mahjong.compact", "1");

  it("folds the prompt into the bar on a landscape controller", () => {
    compactStored();
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} landscape />);

    const root = container.firstElementChild!;
    expect(root.className).toContain("phone--landscape");
    expect(root.className).toContain("phone--compact");
    const bar = container.querySelector(".phone__bar")!;
    expect(bar.querySelector(".phone__prompt")).not.toBeNull();
    expect(container.querySelectorAll(".phone__prompt")).toHaveLength(1);
    // The wind glyph carries the seat; the name stays for screen readers.
    expect(seatName(container).className).toBe("sr-only");
  });

  it("leaves the roomy layout in place when compact is off", () => {
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} landscape />);

    expect(container.firstElementChild!.className).not.toContain("phone--compact");
    expect(container.querySelector(".phone__bar .phone__prompt")).toBeNull();
    expect(container.querySelectorAll(".phone__prompt")).toHaveLength(1);
    expect(seatName(container).className).toBe("");
  });

  it("ignores the stored choice on a phone standing in for the table", () => {
    compactStored();
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

    expect(container.firstElementChild!.className).not.toContain("phone--compact");
    expect(container.querySelector(".phone__bar .phone__prompt")).toBeNull();
  });
});
