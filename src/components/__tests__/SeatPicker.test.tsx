// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { replaceWithComputer, robotName, viewFor } from "@/game/room";
import { SeatPicker } from "../SeatPicker";
import { NAMES, dealt } from "./fixtures";

/** How a phone that has not sat down yet sees a game already under way. */
const spectating = (seats = [0, 2] as const) => viewFor(dealt([...seats]), null);

describe("SeatPicker", () => {
  it("opens on the computer chair a code was scanned for, ready for a name", () => {
    const onClaim = vi.fn(async () => {});
    render(<SeatPicker view={spectating()} picked={1} onClaim={onClaim} onReset={() => {}} busy={false} error={null} />);

    expect(screen.getByRole("status").textContent).toContain(
      `You are taking over ${robotName(1)} at seat 2, South, hand and all.`,
    );
    const box = screen.getByRole("textbox");
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "Srini" } });
    fireEvent.click(screen.getByRole("button", { name: "Sit down" }));
    expect(onClaim).toHaveBeenCalledWith(1, "Srini");
  });

  it("does not choose a chair somebody sat in after the code was shown", () => {
    render(
      <SeatPicker view={spectating()} picked={2} onClaim={vi.fn()} onReset={() => {}} busy={false} error={null} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Sit down" })).toHaveProperty("disabled", true);
    expect(screen.getByText(NAMES[2])).toBeTruthy();
  });

  it("tells a phone the table gave its chair to the computer, which then goes by its name", () => {
    const room = dealt([0, 1]);
    replaceWithComputer(room, 1);
    render(
      <SeatPicker view={viewFor(room, "tok-1")} onClaim={vi.fn()} onReset={() => {}} busy={false} error={null} />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "The table gave seat 2, South, to the computer. Pick a seat to sit back down.",
    );
    expect(screen.getByText(`Robot ${NAMES[1]} — sit in`)).toBeTruthy();
  });
});
