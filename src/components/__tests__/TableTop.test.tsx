// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SEAT_IDLE_MS, drain, robotName } from "@/game/room";
import { SEAT_NAMES, tileName } from "@/game/tiles";
import { TableTop } from "../TableTop";
import { NAMES, claimable, dealt, fakeApi, sound, tableView } from "./fixtures";

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

const racks = (container: HTMLElement) => Array.from(container.querySelectorAll("section.rack"));

describe("TableTop", () => {
  it("places nothing on the felt until it has been measured", () => {
    feltSize(0, 0);
    const view = tableView(dealt());
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);

    expect(container.querySelector(".felt")!.childElementCount).toBe(0);
    expect(screen.getByText("Room TEST")).toBeTruthy();
  });

  it("draws a rack for every seat with who sits there and how many tiles they hold", () => {
    feltSize();
    const room = dealt([0, 2]);
    const view = tableView(room);
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);

    expect(racks(container).map((r) => r.getAttribute("aria-label"))).toEqual(
      view.players.map(
        (p) =>
          `${SEAT_NAMES[p.seat]}: ${p.seat === 0 || p.seat === 2 ? NAMES[p.seat] : robotName(p.seat)}, ${p.handCount} tiles in hand`,
      ),
    );
    const dealerRack = racks(container)[view.dealer];
    expect(dealerRack.textContent).toContain("Dealer");
    expect(container.querySelectorAll(".seat__badge")).toHaveLength(1);
  });

  it("drops a person's discards in from their phone and a computer's from its rack", () => {
    feltSize();
    const view = tableView(dealt([0, 2]));
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);

    const ponds = Array.from(container.querySelectorAll(".discards"));
    expect(ponds.map((p) => p.classList.contains("from-phone"))).toEqual(
      view.players.map((p) => p.seat === 0 || p.seat === 2),
    );
  });

  it("shows each seat's chips, starting from 100", () => {
    feltSize();
    const view = tableView(dealt([0, 2]));
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);
    expect(racks(container).map((r) => r.querySelector(".chipstack__count")!.textContent)).toEqual(
      view.scores.map((s) => String(100 + s)),
    );
  });

  it("names the winner and lists the faan their hand scored", () => {
    feltSize();
    const view = tableView(dealt([0, 2]));
    const score = {
      faan: 4,
      scoredFaan: 4,
      value: 16,
      limitReached: false,
      patterns: [
        { key: "allPungs", chinese: "對對糊", name: "All Pungs", faan: 3 },
        { key: "dragon", chinese: "中", name: "Red Dragon", faan: 1 },
      ],
    };
    const over = {
      ...view,
      phase: "handOver" as const,
      result: { type: "win" as const, winner: 2 as const, from: 1 as const, score, payments: [0, -16, 16, 0], dealerKeeps: false },
    };
    const { container } = render(<TableTop api={fakeApi(over)} view={over} sound={sound} />);
    expect(container.querySelector(".console__headline")!.textContent).toBe(`${NAMES[2]} wins`);
    const rows = Array.from(container.querySelectorAll(".faan-list__row")).map((r) => r.textContent);
    expect(rows).toEqual(["All Pungs 對對糊3", "Red Dragon 中1", "Total4"]);
  });

  it("never draws a concealed tile, only counts", () => {
    feltSize();
    const view = tableView(dealt());
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);

    // Every tile face on the felt is a discard, a meld or a flower — open tiles.
    const open = view.players.reduce(
      (n, p) => n + p.discards.length + p.flowers.length + p.melds.reduce((m, meld) => m + meld.tiles.length, 0),
      0,
    );
    // The deal animation's stacks are tile backs with nothing behind them.
    expect(container.querySelectorAll(".felt .tile:not(.deal__tile)")).toHaveLength(open);
    expect(container.querySelector(".felt .tile--back:not(.deal__tile)")).toBeNull();
    for (const [i, rack] of racks(container).entries()) {
      expect(rack.querySelector(".rack__count")!.textContent).toBe(String(view.players[i].handCount));
    }
  });

  it("spotlights the last discard and lets the table stop waiting on a claim", () => {
    feltSize();
    const { room } = claimable();
    const view = tableView(room);
    const api = fakeApi(view);
    const { container } = render(<TableTop api={api} view={view} sound={sound} />);

    const discard = view.lastDiscard!;
    expect(container.querySelector(".console__caption")!.textContent).toBe(
      `${SEAT_NAMES[discard.from]} · ${tileName(discard.tile.code)}`,
    );
    expect(container.querySelectorAll(".rack--deciding")).toHaveLength(view.awaitingClaimSeats.length);
    expect(container.querySelectorAll(".discards .tile--just-discarded")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: `Skip waiting (${view.awaitingClaimSeats.length})` }));
    expect(api.control).toHaveBeenCalledWith({ type: "forcePass" });
  });

  it("redeals at once but asks before restarting", () => {
    feltSize();
    const view = tableView(dealt());
    const api = fakeApi(view);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<TableTop api={api} view={view} sound={sound} />);

    fireEvent.click(screen.getByRole("button", { name: "Redeal" }));
    expect(api.control).toHaveBeenLastCalledWith({ type: "redeal" });

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(api.control).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(api.control).toHaveBeenLastCalledWith({ type: "restart" });
  });

  it("shows the result in the middle once a hand is over", () => {
    feltSize();
    // With its only player gone quiet, the computer plays the hand to its end.
    const room = dealt([0], 12);
    drain(room, Date.now() + SEAT_IDLE_MS + 1);
    expect(room.state.phase).toBe("handOver");
    const view = tableView(room);
    const api = fakeApi(view);
    const { container } = render(<TableTop api={api} view={view} sound={sound} />);

    const result = container.querySelector(".console__result")!;
    expect(result.textContent).toMatch(view.result!.type === "win" ? / wins/ : /Washed-out hand/);
    expect(container.querySelector(".console__wind")).toBeNull();

    // Both the bar and the console offer the next hand.
    const next = screen.getAllByRole("button", { name: "Next hand" });
    expect(next).toHaveLength(2);
    fireEvent.click(next[1]);
    expect(api.control).toHaveBeenCalledWith({ type: "nextHand" });
  });

  it("names a claimed set and who took the discard until the next tile is thrown", () => {
    feltSize();
    const { room, claimer } = claimable();
    const discard = room.state.lastDiscard!;
    room.lastPlayed = { ...discard, hand: room.state.handNumber };
    // Resolve the claim by hand: the tile leaves the pond for a pung.
    const pond = room.state.players[discard.from].discards;
    pond.splice(pond.findIndex((t) => t.id === discard.tile.id), 1);
    const twins = room.state.players[claimer].hand.filter((t) => t.code === discard.tile.code).slice(0, 2);
    room.state.players[claimer].melds.push({
      type: "pung",
      tiles: [...twins, discard.tile],
      concealed: false,
      claimedFrom: discard.from,
      claimedTileId: discard.tile.id,
    });
    const view = tableView(room);
    const { container } = render(<TableTop api={fakeApi(view)} view={view} sound={sound} />);

    const fresh = container.querySelectorAll(".meld--fresh");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].closest(".rack")!.getAttribute("data-seat")).toBe(String(claimer));
    expect(fresh[0].querySelector(".meld__tag")!.textContent).toBe("Pung 碰");
    expect(fresh[0].querySelector(".meld__taken")!.getAttribute("title")).toBe(tileName(discard.tile.code));
    expect(container.querySelector(".console__caption")!.textContent).toBe(
      `${view.players[discard.from].occupant.name} · ${tileName(discard.tile.code)} · punged by ${view.players[claimer].occupant.name}`,
    );
  });
});
