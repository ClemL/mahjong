// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { moveSeat, openTable, replaceWithComputer, robotName, viewFor } from "@/game/room";
import { SeatPicker } from "../SeatPicker";
import { NAMES, dealt, lobby, sit } from "./fixtures";

/** How a phone that has not sat down yet sees a game already under way. */
const spectating = (seats = [0, 2] as const) => viewFor(dealt([...seats]), null);

describe("SeatPicker", () => {
  it("opens on the computer chair a code was scanned for, ready for a name", () => {
    const onClaim = vi.fn(async () => true);
    render(<SeatPicker view={spectating()} picked={1} onClaim={onClaim} onReset={() => {}} busy={false} error={null} />);

    expect(screen.getByRole("status").textContent).toContain(
      `You are taking over ${robotName(1)} at seat 2, South, hand and all.`,
    );
    const box = screen.getByRole("textbox");
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "Srini" } });
    fireEvent.click(screen.getByRole("button", { name: "Sit down" }));
    expect(onClaim).toHaveBeenCalledWith(1, "Srini", false);
  });

  it("names an empty chair after a default nobody is using once someone has moved", () => {
    const room = lobby([]);
    sit(room, 0, "Calvin");
    moveSeat(room, 0, 1);
    render(<SeatPicker view={viewFor(room, null)} picked={0} onClaim={vi.fn()} onReset={() => {}} busy={false} error={null} />);
    // Calvin is at South now, so East offers South's own name rather than a second Calvin.
    expect(screen.getByRole("button", { name: "東EastLouis" })).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).placeholder).toBe("Louis");
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

  it("lets go of a chair somebody else sits in first, and says who", () => {
    const room = lobby([]);
    const onClaim = vi.fn(async () => true);
    const props = { onClaim, onReset: () => {}, busy: false, error: null };
    const { rerender } = render(<SeatPicker view={viewFor(room, null)} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^東East/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Srini" } });

    sit(room, 0, "Kris");
    rerender(<SeatPicker view={viewFor(room, null)} {...props} />);
    expect(screen.getByRole("status").textContent).toBe("Kris just sat down at East. Pick another seat.");
    expect(screen.getByRole("button", { name: "Sit down" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("textbox")).toBeNull();

    // Another chair, and the name typed for the first one is still there.
    fireEvent.click(screen.getByRole("button", { name: /^南South/ }));
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Srini");
    fireEvent.click(screen.getByRole("button", { name: "Sit down" }));
    expect(onClaim).toHaveBeenCalledWith(1, "Srini", false);
  });

  it("does not mistake its own chair filling for somebody else's, and opens again if refused", async () => {
    const room = lobby([]);
    let refuse: (sat: boolean) => void = () => {};
    const onClaim = vi.fn(() => new Promise<boolean>((resolve) => (refuse = resolve)));
    const props = { onClaim, onReset: () => {}, busy: false, error: null };
    const { rerender } = render(<SeatPicker view={viewFor(room, null)} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^東East/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sit down" }));
    expect(screen.getByRole("button", { name: "Sit down" })).toHaveProperty("disabled", true);

    // A poll lands with the chair filled before the claim has answered.
    sit(room, 0, "Calvin");
    rerender(<SeatPicker view={viewFor(room, null)} {...props} />);
    expect(screen.queryByRole("status")).toBeNull();

    // Refused after all: the chair is somebody else's.
    await act(async () => refuse(false));
    rerender(<SeatPicker view={viewFor(room, null)} {...props} error="That seat is taken" />);
    expect(screen.getByRole("status").textContent).toBe("Calvin just sat down at East. Pick another seat.");
    expect(screen.getByText("That seat is taken")).toBeTruthy();
  });

  it("offers to take over a table open on another device, game and all", () => {
    const room = dealt([0, 2]);
    const onClaim = vi.fn(async () => true);
    render(
      <SeatPicker view={viewFor(room, null)} picked="table" onClaim={onClaim} onReset={() => {}} busy={false} error={null} />,
    );
    expect(screen.getByText(/Open elsewhere · take over/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("The table is open on another device right now.");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Take over the table" }));
    expect(onClaim).toHaveBeenCalledWith("table", "", true);
  });

  it("tells the device that had the table that another one took it over", () => {
    const room = dealt([0]);
    openTable(room, "another-tablet", { replace: true });
    render(
      <SeatPicker view={viewFor(room, "tok-table")} onClaim={vi.fn()} onReset={() => {}} busy={false} error={null} />,
    );
    expect(screen.getByText(/Another device took over the table/)).toBeTruthy();
    expect(screen.getByText("Table").closest("button")).toHaveProperty("disabled", false);
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
