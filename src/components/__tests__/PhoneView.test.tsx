// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Seat } from "@/game/tiles";
import { SEAT_NAMES, seatWind, tileName } from "@/game/tiles";
import { hurryUp, noteDiscard } from "@/game/room";
import { discard } from "@/game/engine";
import { PhoneView } from "../PhoneView";
import { NAMES, claimable, dealt, fakeApi, playerView, sound, underway } from "./fixtures";

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

/** The hand's tiles, turned face up first: every hand is dealt face down. */
function handButtons(container: HTMLElement) {
  const facedown = container.querySelector<HTMLElement>(".phone__hand--hidden");
  if (facedown) fireEvent.click(facedown);
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

  it("enlarges your open sets on a tap, ghosting flowers that score nothing", () => {
    const { seat, view } = onTurn();
    const own = (seat + 1) as 1 | 2 | 3 | 4;
    const other = own === 1 ? 2 : 1;
    // One flower is this seat's own, so it scores; the other came along with the draw.
    const flowers = [
      { id: "fa", code: `f${own}` },
      { id: "fb", code: `f${other}` },
    ];
    const seated = {
      ...view,
      players: view.players.map((p, i) => (i === seat ? { ...p, flowers } : p)),
    } as typeof view;
    const { container } = render(<PhoneView api={fakeApi(seated)} view={seated} sound={sound} />);

    expect(container.querySelectorAll(".phone__melds .tile--idle")).toHaveLength(1);
    expect(container.querySelector(".phone__zoom")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Enlarge your open sets and flowers" }));
    expect(container.querySelectorAll(".phone__zoom .tile")).toHaveLength(2);
    expect(container.querySelectorAll(".phone__zoom .tile--idle")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Close the enlarged sets" }));
    expect(container.querySelector(".phone__zoom")).toBeNull();
  });

  it("underlines sets already in the hand only with the assist turned on", () => {
    const { seat, view } = onTurn();
    // A run, three of a kind, a dragon triplet (1 faan) and the seat's own
    // wind (1 faan, or 2 when it is the round's wind as well).
    const wind = seatWind(seat);
    const codes = ["m1", "m2", "m3", "p5", "p5", "p5", "dr", "dr", "dr", wind, wind, wind, "s9", "s9"];
    const hand = codes.map((code, i) => ({ id: `${code}#t${i}`, code }));
    const seated = {
      ...view,
      drawnTileId: null,
      players: view.players.map((p, i) => (i === seat ? { ...p, hand, handCount: hand.length } : p)),
    } as typeof view;
    const windFaan = wind === view.roundWind ? 2 : 1;

    // An assist, so off unless this phone turns it on.
    const plain = render(<PhoneView api={fakeApi(seated)} view={seated} sound={sound} />);
    handButtons(plain.container);
    expect(plain.container.querySelectorAll(".tile__set, .tile__set-faan")).toHaveLength(0);
    plain.unmount();

    window.localStorage.setItem("hk-mahjong.set-hints", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.set-hints"));
    const { container } = render(<PhoneView api={fakeApi(seated)} view={seated} sound={sound} />);
    handButtons(container);
    expect(container.querySelectorAll(".tile__set--run")).toHaveLength(3);
    expect(container.querySelectorAll(".tile__set--set")).toHaveLength(3);
    expect(container.querySelectorAll(".tile__set--score")).toHaveLength(6);
    expect(container.querySelectorAll(".tile__set--double")).toHaveLength(windFaan === 2 ? 3 : 0);
    // Each scoring set says its worth once.
    expect([...container.querySelectorAll(".tile__set-faan")].map((b) => b.textContent).sort()).toEqual(
      ["+1", `+${windFaan}`].sort(),
    );
    // The pair is not a set.
    const nine = screen.getAllByRole("button", { name: /^Discard 9 Bamboo/ });
    expect(nine.every((b) => b.querySelector(".tile__set") === null)).toBe(true);
    expect(screen.getAllByRole("button", { name: "Discard 1 Characters, part of a run" })).toHaveLength(1);
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

  it("deals the hand face down, and turns it down and back up", () => {
    const { seat, view } = onTurn();
    const api = fakeApi(view);
    const { container, rerender } = render(<PhoneView api={api} view={view} sound={sound} />);

    // Nobody's tiles are on show until their owner turns them up.
    expect(container.querySelector(".phone__hand [data-tile-id]")).toBeNull();
    expect(screen.getByRole("button", { name: /^Hand hidden/ })).toBeTruthy();
    handButtons(container);

    fireEvent.click(screen.getByRole("button", { name: "Hide hand" }));
    expect(container.querySelectorAll(".phone__hand .tile--back")).toHaveLength(
      view.players[seat].hand.length,
    );
    expect(container.querySelector(".phone__hand [data-tile-id]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Hand hidden/ }));
    expect(container.querySelector(".phone__hand .tile--back")).toBeNull();
    expect(handButtons(container)).toHaveLength(view.players[seat].hand.length);

    // The next deal arrives face down again.
    const next = { ...view, handNumber: view.handNumber + 1 };
    rerender(<PhoneView api={api} view={next} sound={sound} />);
    expect(container.querySelector(".phone__hand [data-tile-id]")).toBeNull();
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

  it("opens the patterns a win would score from the faan beside it, off a discard or self-drawn", () => {
    const score = {
      faan: 4,
      scoredFaan: 4,
      value: 16,
      limitReached: false,
      patterns: [
        { key: "allPungs", chinese: "對對糊", name: "All Triplets", faan: 3 },
        { key: "seatFlower", chinese: "正花", name: "Seat flower", faan: 1 },
      ],
    };
    const { room, claimer } = claimable();
    const view = playerView(room, claimer);
    const win = { id: "win", type: "win" as const, tileIds: [], codes: [view.lastDiscard!.tile.code], score };
    const offered = { ...view, claim: { ...view.claim!, options: [...view.claim!.options, win] } };
    const first = render(<PhoneView api={fakeApi(offered)} view={offered} sound={sound} />);
    expect(screen.queryByRole("region", { name: "What this win scores" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "4 faan: show what it is made of" }));
    const panel = screen.getByRole("region", { name: "What this win scores" });
    expect(within(panel).getByText("All Triplets")).toBeTruthy();
    expect(within(panel).getByText("對對糊")).toBeTruthy();
    expect(within(panel).getByText("4 faan · 16 points a share")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 faan: hide what it is made of" }));
    expect(screen.queryByRole("region", { name: "What this win scores" })).toBeNull();
    first.unmount();

    const { seat, view: turn } = onTurn();
    const selfDrawn = { ...turn, actions: { ...turn.actions!, canWin: true, winScore: score } };
    render(<PhoneView api={fakeApi(selfDrawn)} view={selfDrawn} sound={sound} />);
    expect(seat).toBe(selfDrawn.turn);
    expect(screen.getByText("You can win for 4 faan.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 faan: show what it is made of" }));
    expect(within(screen.getByRole("region", { name: "What this win scores" })).getByText("Seat flower")).toBeTruthy();
  });

  it("offers more time on a claim only when there are sets to choose between", () => {
    const { room, claimer } = claimable();
    const view = playerView(room, claimer);
    const one = { ...view, claim: { ...view.claim!, canExtend: false } };
    const first = render(<PhoneView api={fakeApi(one)} view={one} sound={sound} />);
    expect(within(first.container).queryByRole("button", { name: /^More time to choose/ })).toBeNull();
    first.unmount();

    const several = { ...view, claim: { ...view.claim!, canExtend: true } };
    const api = fakeApi(several);
    const { container } = render(<PhoneView api={api} view={several} sound={sound} />);
    fireEvent.click(within(container).getByRole("button", { name: "More time to choose: add 20 seconds, once for this tile" }));
    expect(api.act).toHaveBeenCalledWith({ type: "moreTime" });
  });

  it("stretches the hand to the edges when the phone asks, sized by the tiles it holds", () => {
    const { seat, view } = onTurn();
    const plain = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    expect(plain.container.querySelector(".phone--stretch")).toBeNull();
    plain.unmount();

    window.localStorage.setItem("hk-mahjong.hand-stretch", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.hand-stretch"));
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    expect(container.querySelector(".phone--stretch")).not.toBeNull();
    const hand = container.querySelector<HTMLElement>(".phone__hand")!;
    expect(hand.style.getPropertyValue("--hand-count")).toBe(String(view.players[seat].hand.length));
  });

  it("shows the newest discard and a play log on the controller", () => {
    const { room, claimer } = claimable();
    const view = playerView(room, claimer);
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

    const discard = view.lastDiscard!;
    expect(container.querySelector(".phone__last")).not.toBeNull();
    const rows = Array.from(container.querySelectorAll(".playlog__row"));
    expect(rows.at(-1)!.getAttribute("title")).toBe(
      `${view.players[discard.from].occupant.name} discarded ${tileName(discard.tile.code)}`,
    );
  });

  it("tells a player coming back how many turns the computer played for them, until they say OK", () => {
    const room = dealt();
    room.stoodIn[0] = 3;
    const view = playerView(room, 0);
    const { rerender } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    expect(screen.getByText("The computer played 3 turns for you.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/The computer played/)).toBeNull();

    // Another turn played for them while they still have not moved brings it back.
    room.stoodIn[0] = 4;
    const later = playerView(room, 0);
    rerender(<PhoneView api={fakeApi(later)} view={later} sound={sound} />);
    expect(screen.getByText("The computer played 4 turns for you.")).toBeTruthy();
  });

  it("offers to take back the tile just thrown, only to whoever threw it", () => {
    const { room, seat } = onTurn();
    const before = room.state;
    const tile = before.players[seat].hand.find((t) => !t.code.startsWith("f"))!;
    room.state = discard(before, seat, tile.id);
    noteDiscard(room, seat, before);
    const view = playerView(room, seat);
    const api = fakeApi(view);
    const { unmount } = render(<PhoneView api={api} view={view} sound={sound} />);
    expect(screen.getByText(`You threw ${tileName(tile.code)}.`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Take back ${tileName(tile.code)}` }));
    expect(api.act).toHaveBeenCalledWith({ type: "takeBack" });
    unmount();

    const other = ((seat + 1) % 4) as Seat;
    const theirs = playerView(room, other);
    render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
    expect(screen.queryByRole("button", { name: /^Take back/ })).toBeNull();
  });

  it("hides the play log when the phone's settings say so", () => {
    window.localStorage.setItem("hk-mahjong.play-log", "off");
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    expect(container.querySelector(".playlog")).toBeNull();
    window.localStorage.removeItem("hk-mahjong.play-log");
  });
});

describe("PhoneView compact mode", () => {
  const compactStored = () => window.localStorage.setItem("hk-mahjong.compact", "1");

  it("folds the prompt into the bar on a landscape controller", () => {
    compactStored();
    const { view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

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
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);

    expect(container.firstElementChild!.className).not.toContain("phone--compact");
    expect(container.querySelector(".phone__bar .phone__prompt")).toBeNull();
    expect(container.querySelectorAll(".phone__prompt")).toHaveLength(1);
    expect(seatName(container).className).toBe("");
  });

});

describe("PhoneView — whose move it is", () => {
  it("lights the phone of the player to discard, and only theirs", () => {
    const { room, seat, view } = onTurn();
    const { container } = render(<PhoneView api={fakeApi(view)} view={view} sound={sound} />);
    expect(container.querySelector(".phone--acting")).not.toBeNull();

    const other = ((seat + 1) % 4) as Seat;
    const theirs = playerView(room, other);
    const { container: elsewhere } = render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
    expect(elsewhere.querySelector(".phone--acting")).toBeNull();
  });

  it("lights the phone being asked about a claim, and tells the others who they are waiting on", () => {
    const { room, claimer } = claimable();
    const asked = playerView(room, claimer);
    const { container } = render(<PhoneView api={fakeApi(asked)} view={asked} sound={sound} />);
    expect(container.querySelector(".phone--acting")).not.toBeNull();

    const bystander = ([0, 1, 2, 3] as Seat[]).find(
      (s) => s !== claimer && s !== room.state.lastDiscard!.from,
    )!;
    const theirs = playerView(room, bystander);
    const { container: elsewhere } = render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
    expect(elsewhere.querySelector(".phone--acting")).toBeNull();
    const name = theirs.players[claimer].occupant.name;
    const tile = tileName(room.state.lastDiscard!.tile.code);
    expect(within(elsewhere).getByText(`Waiting for ${name} to decide on ${tile}…`)).toBeTruthy();
  });

  it("hurries whoever is holding up the table, and flashes only their screen", () => {
    window.localStorage.setItem("hk-mahjong.hurry", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.hurry"));
    const { room, seat } = onTurn();
    underway(room);
    const other = ((seat + 1) % 4) as Seat;
    const theirs = playerView(room, other);
    const api = fakeApi(theirs);
    const { container: elsewhere } = render(<PhoneView api={api} view={theirs} sound={sound} />);
    const name = theirs.players[seat].occupant.name;
    fireEvent.click(within(elsewhere).getByRole("button", { name: `Hurry up ${name}: flash their screen` }));
    expect(api.act).toHaveBeenCalledWith({ type: "hurry" });

    expect(hurryUp(room, other)).toBeNull();
    const mine = playerView(room, seat);
    const { container } = render(<PhoneView api={fakeApi(mine)} view={mine} sound={sound} />);
    expect(container.querySelector(".phone--hurried")).not.toBeNull();
    expect(within(container).getByRole("alert").textContent).toBe(`${NAMES[other]} says hurry up!`);
    // Nobody is offered a button to hurry themselves.
    expect(within(container).queryByRole("button", { name: /^Hurry up/ })).toBeNull();
  });

  it("waits out the first three seconds of anybody's turn before it can hurry them", () => {
    window.localStorage.setItem("hk-mahjong.hurry", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.hurry"));
    // Dealt just now: the turn on the table has only just begun.
    const { room, seat } = onTurn();
    room.lastStepAt = Date.now();
    const other = ((seat + 1) % 4) as Seat;
    const theirs = playerView(room, other);
    expect(theirs.hurryGraceLeft).toBeGreaterThan(0);
    const api = fakeApi(theirs);
    const { container } = render(<PhoneView api={api} view={theirs} sound={sound} />);
    const waiting = within(container).getByRole("button", {
      name: new RegExp(`^${NAMES[seat]}'s turn has only just started: hurry up in [1-3] seconds$`),
    });
    expect(waiting).toHaveProperty("disabled", true);
    expect(waiting.textContent).toMatch(/^Hurry up [1-3]s$/);
    fireEvent.click(waiting);
    expect(api.act).not.toHaveBeenCalled();
    // The server holds to the same rule.
    expect(hurryUp(room, other)).toMatch(/only just started/);
  });

  it("rests every Hurry up button at the table after anyone's, counting down the seconds", () => {
    window.localStorage.setItem("hk-mahjong.hurry", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.hurry"));
    const { room, seat } = onTurn();
    underway(room);
    const sender = ((seat + 1) % 4) as Seat;
    const bystander = ((seat + 2) % 4) as Seat;
    const name = NAMES[seat];
    expect(hurryUp(room, sender)).toBeNull();

    const sent = playerView(room, sender);
    const { container: theirs } = render(<PhoneView api={fakeApi(sent)} view={sent} sound={sound} />);
    const own = within(theirs).getByRole("button", { name: new RegExp(`^You hurried ${name}: hurry up again in \\d+ seconds$`) });
    expect(own).toHaveProperty("disabled", true);
    expect(own.textContent).toMatch(/^Hurried \d+s$/);

    // Only one at a time: someone else at the table waits it out too.
    const other = playerView(room, bystander);
    const { container: elsewhere } = render(<PhoneView api={fakeApi(other)} view={other} sound={sound} />);
    const theirButton = within(elsewhere).getByRole("button", { name: new RegExp(`^${NAMES[sender]} hurried ${name}`) });
    expect(theirButton).toHaveProperty("disabled", true);
    expect(within(elsewhere).queryByRole("button", { name: /^Hurry up/ })).toBeNull();
  });

  it("buzzes the phone being hurried, even with its own Hurry up setting off", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, "vibrate", { value: vibrate, configurable: true });
    onTestFinished(() => {
      delete (window.navigator as { vibrate?: unknown }).vibrate;
    });
    const { room, seat } = onTurn();
    underway(room);
    expect(hurryUp(room, ((seat + 1) % 4) as Seat)).toBeNull();
    const mine = playerView(room, seat);
    const { container } = render(<PhoneView api={fakeApi(mine)} view={mine} sound={sound} />);
    // No flash without the setting, but the buzz still comes.
    expect(container.querySelector(".phone__hurry")).toBeNull();
    expect(vibrate).toHaveBeenCalledWith([120, 80, 120, 80, 120]);

    // The Vibrate setting is what silences it.
    vibrate.mockClear();
    window.localStorage.setItem("hk-mahjong.vibrate", "off");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.vibrate"));
    render(<PhoneView api={fakeApi(mine)} view={mine} sound={sound} />);
    expect(vibrate).not.toHaveBeenCalledWith([120, 80, 120, 80, 120]);
  });

  it("leaves the hurry-up button and the flash off unless the phone turns them on", () => {
    const { room, seat } = onTurn();
    underway(room);
    const other = ((seat + 1) % 4) as Seat;
    expect(hurryUp(room, other)).toBeNull();
    {
      const mine = playerView(room, seat);
      const { container } = render(<PhoneView api={fakeApi(mine)} view={mine} sound={sound} />);
      expect(container.querySelector(".phone--hurried, .phone__hurry")).toBeNull();
      const theirs = playerView(room, other);
      const { container: elsewhere } = render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
      expect(within(elsewhere).queryByRole("button", { name: /^Hurry up/ })).toBeNull();
    }
  });

  it.each([" zAiD ", "LUCY"])("turns the assists on by default for %j, however it is typed, but never over a choice", (typed) => {
    const { room, seat } = onTurn();
    underway(room);
    const other = ((seat + 1) % 4) as Seat;
    const occupant = room.seats[other];
    if (occupant.kind === "human") occupant.name = typed;
    const theirs = playerView(room, other);
    const first = render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
    expect(within(first.container).getByRole("button", { name: /^Hurry up/ })).toBeTruthy();
    expect(within(first.container).getByRole("button", { name: /^Helper/ })).toBeTruthy();
    first.unmount();

    window.localStorage.setItem("hk-mahjong.helper", "off");
    try {
      const chosen = render(<PhoneView api={fakeApi(theirs)} view={theirs} sound={sound} />);
      expect(within(chosen.container).queryByRole("button", { name: /^Helper/ })).toBeNull();
      expect(within(chosen.container).getByRole("button", { name: /^Hurry up/ })).toBeTruthy();
    } finally {
      window.localStorage.removeItem("hk-mahjong.helper");
    }
  });

  it("lists what finishes each set the hand has started, behind the helper button once turned on", () => {
    const { seat, view } = onTurn();
    const codes = ["m1", "m2", "m3", "p4", "p5", "s7", "s9", "dr", "dr", "we", "wn", "ws", "m9", "p1"];
    const hand = codes.map((code, i) => ({ id: `${code}#t${i}`, code }));
    const seated = {
      ...view,
      drawnTileId: null,
      players: view.players.map((p, i) => (i === seat ? { ...p, hand, handCount: hand.length } : p)),
    } as typeof view;
    const off = render(<PhoneView api={fakeApi(seated)} view={seated} sound={sound} />);
    expect(within(off.container).queryByRole("button", { name: /^Helper/ })).toBeNull();
    off.unmount();

    window.localStorage.setItem("hk-mahjong.helper", "on");
    onTestFinished(() => window.localStorage.removeItem("hk-mahjong.helper"));
    const { container } = render(<PhoneView api={fakeApi(seated)} view={seated} sound={sound} />);
    handButtons(container);
    expect(container.querySelector(".helper")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Helper/ }));
    const rows = [...container.querySelectorAll(".helper__row")].map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.includes("run with") && r.includes("3 Dots") && r.includes("6 Dots"))).toBe(true);
    expect(rows.some((r) => r.includes("run with") && r.includes("8 Bamboo"))).toBe(true);
    expect(rows.some((r) => r.includes("pung with") && r.includes(tileName("dr")))).toBe(true);
    // Straight above the hand, and the hand last of all.
    const row = container.querySelector(".phone__hand")!;
    expect(row.previousElementSibling).toBe(container.querySelector(".helper"));
    expect(row.parentElement!.lastElementChild).toBe(row);
  });
});
