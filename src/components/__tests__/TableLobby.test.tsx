// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "@/game/appearance";
import { moveSeat } from "@/game/room";
import { TableLobby } from "../TableLobby";
import { fakeApi, lobby, playerView, sit, sound, tableView } from "./fixtures";

// The real code is SVG path data; the link it encodes is what matters here.
vi.mock("../QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => (
    <span role="img" aria-label={label} data-value={value} />
  ),
}));

/** The one large code on the table, and the link it carries. */
const spotCode = () => screen.getAllByRole("img").find((el) => /^Scan to /.test(el.getAttribute("aria-label") ?? ""))!;
const showCode = (seat: number, wind: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Show the code for seat ${seat}, ${wind}` }));

describe("TableLobby on the table", () => {
  it("puts up one large code, for the next open chair, carrying the name typed for it", () => {
    const view = tableView(lobby([0]));
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    // Seat 1 is taken, so the code is for seat 2, the next open chair.
    expect(screen.getAllByRole("img").filter((el) => /^Scan to /.test(el.getAttribute("aria-label") ?? ""))).toHaveLength(1);
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 2, South");
    expect(spotCode().getAttribute("data-value")).toMatch(/\/room\/TEST\?seat=1$/);
    expect(screen.getByText("Code showing")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name for seat 2"), { target: { value: "Srini" } });
    expect(spotCode().getAttribute("data-value")).toMatch(/\/room\/TEST\?seat=1&name=Srini$/);
    // The typed name shows in the chair's row until somebody scans it.
    expect(screen.getByRole("list", { name: "Seats" }).textContent).toContain("Srini");
    expect(screen.getByText("1 of 4 seated")).toBeTruthy();
  });

  it("moves the code to whichever chair is tapped, a taken one's to take it over", () => {
    const view = tableView(lobby([0]));
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    showCode(4, "North");
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 4, North");
    expect((screen.getByLabelText("Name for seat 4") as HTMLInputElement).placeholder).toBe("Clem");

    showCode(1, "East");
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take over seat 1, East, from Kris");
    expect(spotCode().getAttribute("data-value")).toMatch(/\/room\/TEST\?seat=0&replace=1$/);
    // A taken chair asks for no name: whoever scans names themselves.
    expect(screen.queryByLabelText(/^Name for seat/)).toBeNull();
  });

  it("moves on to the next open chair once somebody sits in the one showing", () => {
    const room = lobby([0]);
    const before = tableView(room);
    const { rerender } = render(<TableLobby api={fakeApi(before)} view={before} sound={sound} />);
    showCode(3, "West");
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 3, West");

    sit(room, 2);
    const after = tableView(room);
    rerender(<TableLobby api={fakeApi(after)} view={after} sound={sound} />);
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 2, South");

    sit(room, 1);
    sit(room, 3);
    const full = tableView(room);
    rerender(<TableLobby api={fakeApi(full)} view={full} sound={sound} />);
    expect(screen.getByRole("heading", { name: /All four seated/ })).toBeTruthy();
  });

  it("greys in each empty chair's own name, and opens the house rules out to change them", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    expect((screen.getByLabelText("Name for seat 2") as HTMLInputElement).placeholder).toBe("Louis");
    const rules = screen.getByRole("region", { name: "House rules" });
    expect(rules.textContent).toContain("Min 1 faan");
    expect(screen.queryByLabelText("Flowers")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Flowers"), { target: { value: "off" } });
    expect(api.control).toHaveBeenCalledWith({ type: "flowers", value: false });
    fireEvent.change(screen.getByLabelText("Game length"), { target: { value: "2" } });
    expect(api.control).toHaveBeenCalledWith({ type: "rounds", value: 2 });
  });

  it("resets the table and clears the typed names once confirmed", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<TableLobby api={api} view={view} sound={sound} />);

    showCode(3, "West");
    const input = screen.getByLabelText("Name for seat 3") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Steven" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset table" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(api.control).toHaveBeenCalledWith({ type: "reset" });
    // Back to the next open chair, with nothing typed for anyone.
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 2, South");
    showCode(3, "West");
    expect((screen.getByLabelText("Name for seat 3") as HTMLInputElement).value).toBe("");
    expect(spotCode().getAttribute("data-value")).not.toContain("name=");
  });

  it("does nothing when the reset is cancelled", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<TableLobby api={api} view={view} sound={sound} />);

    showCode(3, "West");
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
    // The table's look goes with the deal, for the phones to start the game in.
    expect(api.control).toHaveBeenCalledWith({ type: "deal", look: DEFAULT_APPEARANCE });
  });
});

describe("renaming a seated chair", () => {
  it("lets the table rename anyone who has sat down", () => {
    const view = tableView(lobby([0, 2]));
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename seat 3" }));
    const input = screen.getByLabelText("New name for seat 3");
    fireEvent.change(input, { target: { value: "Sherman" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(api.control).toHaveBeenCalledWith({ type: "rename", seat: 2, name: "Sherman" });
    expect(screen.queryByLabelText("New name for seat 3")).toBeNull();
  });

  it("sends nothing when the edit is cancelled or unchanged", () => {
    const view = tableView(lobby([0]));
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename seat 1" }));
    fireEvent.change(screen.getByLabelText("New name for seat 1"), { target: { value: "Thanh" } });
    fireEvent.keyDown(screen.getByLabelText("New name for seat 1"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Rename seat 1" }));
    fireEvent.blur(screen.getByLabelText("New name for seat 1"));

    expect(api.control).not.toHaveBeenCalled();
  });

  it("lets a phone rename only its own chair", () => {
    const view = playerView(lobby([0, 1]), 1);
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    expect(screen.queryByRole("button", { name: "Rename seat 1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rename yourself" }));
    const input = screen.getByLabelText("New name for seat 2");
    fireEvent.change(input, { target: { value: "Teja" } });
    fireEvent.blur(input);

    expect(api.control).toHaveBeenCalledWith({ type: "rename", seat: 1, name: "Teja" });
  });
});

describe("TableLobby on a phone", () => {
  it("offers no reset and no chair's code to a seated player, only a code to bring someone in", () => {
    const view = playerView(lobby([0, 1]), 1);
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    expect(screen.queryByRole("button", { name: "Reset table" })).toBeNull();
    expect(screen.queryByRole("img", { name: /take seat/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Show the code/ })).toBeNull();
    expect(screen.getByRole("img", { name: "Join TEST" }).getAttribute("data-value")).toMatch(/\/room\/TEST$/);
    expect(screen.getByText("You're in as South")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave seat" })).toBeTruthy();
    // With a tablet present, dealing is the table's job.
    expect(screen.queryByRole("button", { name: "Deal" })).toBeNull();
    expect(screen.getByText("The table deals when everyone is ready.")).toBeTruthy();
  });

  it("never lets a phone deal: with no tablet yet, it asks for one", () => {
    const view = playerView(lobby([0, 1], false), 0);
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    expect(screen.queryByRole("button", { name: /^(Deal|Play the computer)$/ })).toBeNull();
    expect(screen.getByText(/On a tablet, open “Be TEST on this screen”/)).toBeTruthy();
  });
});

describe("moving between chairs", () => {
  it("lets the table move any seated player either way round", () => {
    const view = tableView(lobby([0, 1]));
    const api = fakeApi(view);
    render(<TableLobby api={api} view={view} sound={sound} />);

    // Empty chairs have nobody to move.
    expect(screen.getAllByRole("button", { name: /^(Move|Swap) / })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Swap Kris with Srini, seat 2, South" }));
    expect(api.control).toHaveBeenCalledWith({ type: "moveSeat", seat: 0, step: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Move Kris to seat 4, North" }));
    expect(api.control).toHaveBeenCalledWith({ type: "moveSeat", seat: 0, step: -1 });
  });

  it("keeps Louis as Louis after a move, and the empty chair offers a name nobody has", () => {
    const room = lobby([0]);
    sit(room, 1, "Louis");
    moveSeat(room, 1, 1);
    const view = tableView(room);
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);

    const seats = screen.getByRole("list", { name: "Seats" });
    const row = (n: number) => within(seats).getAllByRole("listitem")[n].textContent;
    expect(row(2)).toContain("Louis");
    // South is empty again, but Louis is sitting at West: South offers West's own name.
    expect(row(1)).toContain("Hanna");
    expect(row(1)).not.toContain("Louis");
    expect(spotCode().getAttribute("aria-label")).toBe("Scan to take seat 2, South");
    expect((screen.getByLabelText("Name for seat 2") as HTMLInputElement).placeholder).toBe("Hanna");
  });

  it("only offers a phone its own player's buttons", () => {
    const view = playerView(lobby([0, 1]), 1);
    render(<TableLobby api={fakeApi(view)} view={view} sound={sound} />);
    const buttons = screen.getAllByRole("button", { name: /^(Move|Swap) / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Swap Srini with Kris, seat 1, East",
      "Move Srini to seat 3, West",
    ]);
  });
});
