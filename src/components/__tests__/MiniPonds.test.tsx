// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicPlayer } from "@/game/room";
import { type Seat, type TileCode, tileName } from "@/game/tiles";
import { MiniPonds } from "../MiniPonds";

const NAMES = ["Kris", "Srini", "Teja", "Parth"];

function player(seat: Seat, codes: TileCode[], taken: PublicPlayer["taken"] = []): PublicPlayer {
  return {
    seat,
    handCount: 13,
    hand: [],
    melds: [],
    flowers: [],
    discards: codes.map((code, i) => ({ id: `${code}#${seat}${i}`, code })),
    taken,
    occupant: { kind: "human", name: NAMES[seat], away: false },
  };
}

const players = [
  player(0, ["s9", "m1"]),
  // Srini threw 5 Dots, then a tile Kris claimed, then 7 Characters and East.
  player(1, ["p5", "m7", "we"], [{ at: 1, by: 0 }]),
  player(2, []),
  player(3, ["dr", "p2", "m3"]),
];

const rows = () => screen.getAllByRole("listitem");
const tilesIn = (row: HTMLElement) =>
  [...row.querySelectorAll(".minipond__tiles > *")].map((el) =>
    el.classList.contains("minipond__gap") ? `gap:${el.textContent}` : el.querySelector("[data-code]")!.getAttribute("data-code"),
  );

function show(order: "thrown" | "sorted", you: Seat = 1, onClose?: () => void) {
  const onOrder = vi.fn();
  render(
    <MiniPonds
      players={players}
      you={you}
      newestId="m3#32"
      order={order}
      onOrder={onOrder}
      nameOf={(s) => NAMES[s]}
      onClose={onClose}
    />,
  );
  return onOrder;
}

describe("MiniPonds", () => {
  it("starts with you and goes round in the order of play", () => {
    show("thrown", 1);
    expect(rows().map((r) => r.querySelector(".minipond__name")!.textContent)).toEqual(["You", "Teja", "Parth", "Kris"]);
  });

  it("keeps each pond in the order thrown, with a space where a tile was claimed, and marks the newest", () => {
    show("thrown");
    const [srini, , parth] = rows();
    // The space sits where the claimed tile was, with the wind of whoever took it.
    expect(tilesIn(srini)).toEqual(["p5", "gap:東", "m7", "we"]);
    expect(tilesIn(parth)).toEqual(["dr", "p2", "m3"]);
    expect(parth.querySelector(".minipond__tile--newest [data-code]")!.getAttribute("data-code")).toBe("m3");
    expect(parth.querySelector(".sr-only")!.textContent).toBe(
      `Parth's discards, North: ${tileName("dr")}, ${tileName("p2")}, ${tileName("m3")} (newest)`,
    );
    expect(within(srini).getByText(/; 1 taken by others$/)).toBeTruthy();
  });

  it("lays each pond out by suit and number, which leaves no spaces", () => {
    show("sorted");
    const [srini, teja, parth] = rows();
    expect(tilesIn(srini)).toEqual(["m7", "p5", "we"]);
    expect(tilesIn(parth)).toEqual(["m3", "p2", "dr"]);
    expect(within(teja).getByText(/none yet/)).toBeTruthy();
  });

  it("switches order from its own buttons, and closes only when it was brought in", () => {
    const onOrder = show("thrown");
    expect(screen.getByRole("button", { name: "As thrown" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "By suit" }));
    expect(onOrder).toHaveBeenCalledWith("sorted");
    expect(screen.queryByRole("button", { name: "Close the discards" })).toBeNull();
  });

  it("can be put away when it was brought in over the controls", () => {
    const onClose = vi.fn();
    show("thrown", 0, onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close the discards" }));
    expect(onClose).toHaveBeenCalled();
  });
});
