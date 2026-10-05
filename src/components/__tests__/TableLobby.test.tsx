// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableLobby } from "../TableLobby";
import { fakeApi, lobby, playerView, sound, tableView } from "./fixtures";

// The real code is SVG path data; the link it encodes is what matters here.
vi.mock("../QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => (
    <span role="img" aria-label={label} data-value={value} />
  ),
}));

const seatCode = (seat: number) =>
  screen.getByRole("img", { name: new RegExp(`take seat ${seat}`) }).getAttribute("data-value");

describe("TableLobby on the table", () => {
  it("gives each open chair its own code carrying the name typed for it", () => {
    const view = tableView(lobby([0]));
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    // Seat 1 is taken, so only the other three have a code to scan.
    expect(screen.queryByRole("img", { name: /take seat 1/ })).toBeNull();
    expect(seatCode(2)).toMatch(/\/room\/TEST\?seat=1$/);

    fireEvent.change(screen.getByLabelText("Name for seat 2"), { target: { value: "Srini" } });
    expect(seatCode(2)).toMatch(/\/room\/TEST\?seat=1&name=Srini$/);
    expect(screen.getByText("1 of 4 seated", { exact: false })).toBeTruthy();
  });

  it("resets the table and clears the typed names once confirmed", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<TableLobby api={api} view={view} sound={sound} />);

    const input = screen.getByLabelText("Name for seat 3") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Steven" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset table" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(api.control).toHaveBeenCalledWith({ type: "reset" });
    expect(input.value).toBe("");
    expect(seatCode(3)).not.toContain("name=");
  });

  it("does nothing when the reset is cancelled", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<TableLobby api={api} view={view} sound={sound} />);

    const input = screen.getByLabelText("Name for seat 3") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Steven" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset table" }));

    expect(api.control).not.toHaveBeenCalled();
    expect(input.value).toBe("Steven");
  });

  it("holds the reset while a command is in flight", () => {
    const view = tableView(lobby([0]));
    render(<TableLobby api={fakeApi(view, true)} view={view} sound={sound} />);
    expect((screen.getByRole("button", { name: "Reset table" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not deal to an empty table, and names a solo deal for what it is", () => {
    const empty = tableView(lobby([]));
    const { unmount } = render(<TableLobby api={fakeApi(empty)} view={empty} sound={sound} />);
    expect((screen.getByRole("button", { name: "Deal" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    const solo = tableView(lobby([0]));
    const api = fakeApi(solo);
    render(<TableLobby api={api} view={solo} sound={sound} />);
    fireEvent.click(screen.getByRole("button", { name: "Play the computer" }));
    expect(api.control).toHaveBeenCalledWith({ type: "deal" });
  });
});

describe("TableLobby on a phone", () => {
  it("offers no reset and no per-seat codes to a seated player", () => {
    const view = playerView(lobby([0, 1]), 1);
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    expect(screen.queryByRole("button", { name: "Reset table" })).toBeNull();
    expect(screen.queryByRole("img", { name: /take seat/ })).toBeNull();
    // With a tablet present, dealing is the table's job.
    expect(screen.queryByRole("button", { name: "Deal" })).toBeNull();
    expect(screen.getByText("The table deals when everyone is ready.")).toBeTruthy();
  });

  it("lets a player deal when no tablet is acting as the table", () => {
    const view = playerView(lobby([0, 1], false), 0);
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: "Deal" }));
    expect(api.control).toHaveBeenCalledWith({ type: "deal" });
    expect(screen.queryByRole("button", { name: "Reset table" })).toBeNull();
  });
});
