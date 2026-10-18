// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createGame } from "@/game/engine";
import { type ReplayFrame, frameOf } from "@/game/replay";
import { ReplayDialog } from "../ReplayDialog";

function frames(): ReplayFrame[] {
  const deal = frameOf(createGame({ seed: 5 }));
  const thrown: ReplayFrame = { ...deal, seq: deal.seq + 1, text: "East discards 1 Dots" };
  const ready: ReplayFrame = {
    ...thrown,
    seq: deal.seq + 2,
    text: "South discards Red Dragon",
    players: thrown.players.map((p, seat) =>
      seat === 0 ? { ...p, hand: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "dr", "dr", "dr", "p5"] } : p,
    ),
  };
  return [deal, thrown, ready];
}

describe("ReplayDialog", () => {
  it("opens on the end of the hand and steps back and forth through it", () => {
    render(<ReplayDialog frames={frames()} handNumber={3} humanSeat={0} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Replay of hand 3" })).toBeTruthy();
    expect(screen.getByText(/Move 2 of 2/)).toBeTruthy();
    expect(screen.getByText(/Ready on 5 Dots/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/Move 1 of 2/).parentElement?.textContent).toMatch(/East discards 1 Dots/);
    expect(screen.queryByText(/Ready on/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Deal" }));
    expect(screen.getByText("The deal")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("slider", { name: "Move" }), { target: { value: "2" } });
    expect(screen.getByText(/Move 2 of 2/)).toBeTruthy();
  });

  it("names every seat, and you", () => {
    render(<ReplayDialog frames={frames()} handNumber={1} humanSeat={2} onClose={() => {}} />);
    expect(screen.getByRole("region", { name: "West (you)" })).toBeTruthy();
    expect(screen.getAllByRole("region", { name: /^(East|South|North)$/ })).toHaveLength(3);
  });

  it("closes on Escape, wherever focus has gone", () => {
    const onClose = vi.fn();
    render(<ReplayDialog frames={frames()} handNumber={1} humanSeat={0} onClose={onClose} />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("steps with the arrow keys, and keeps focus once a button disables itself", () => {
    render(<ReplayDialog frames={frames()} handNumber={1} humanSeat={0} onClose={() => {}} />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(screen.getByText(/Move 1 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deal" }));
    expect(document.activeElement).toBe(screen.getByRole("slider", { name: "Move" }));
  });
});
