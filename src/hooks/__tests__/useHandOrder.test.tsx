// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { type Tile, type TileCode, sortTiles } from "@/game/tiles";
import { useHandOrder } from "../useHandOrder";

const tiles = (...ids: string[]): Tile[] => ids.map((id) => ({ id, code: id.split("#")[0] as TileCode }));
const ids = (list: Tile[]) => list.map((t) => t.id);

describe("useHandOrder", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps a hand's own order through the hand, and leaves the next hand sorted", () => {
    const first = tiles("b1#0", "b2#0", "b3#0", "c5#1", "d9#2");
    const { result, rerender } = renderHook(({ hand, key }) => useHandOrder(hand, null, key), {
      initialProps: { hand: first, key: "T:1:1" },
    });
    act(() => result.current.arrange(["d9#2", "b1#0", "b2#0", "b3#0", "c5#1"]));
    expect(result.current.mode).toBe("manual");
    expect(ids(result.current.tiles)).toEqual(["d9#2", "b1#0", "b2#0", "b3#0", "c5#1"]);

    // A new deal holding two of the same physical tiles: none of them is put first.
    const second = tiles("b4#0", "b5#0", "c5#1", "c1#3", "d9#2", "we#1");
    rerender({ hand: second, key: "T:1:2" });
    expect(ids(result.current.tiles)).toEqual(ids(sortTiles(second)));
  });

  it("restores a hand's order after a reload, and not into the same-numbered hand of another game", () => {
    window.localStorage.setItem("hk-mahjong.sort", JSON.stringify("manual"));
    window.localStorage.setItem("hk-mahjong.order", JSON.stringify({ key: "T:100:1", ids: ["d9#2", "b1#0"] }));
    const hand = tiles("b1#0", "b4#0", "d9#2");

    const sameGame = renderHook(() => useHandOrder(hand, null, "T:100:1"));
    expect(ids(sameGame.result.current.tiles)).toEqual(["d9#2", "b1#0", "b4#0"]);
    sameGame.unmount();

    window.localStorage.setItem("hk-mahjong.order", JSON.stringify({ key: "T:100:1", ids: ["d9#2", "b1#0"] }));
    const nextGame = renderHook(() => useHandOrder(hand, null, "T:200:1"));
    expect(ids(nextGame.result.current.tiles)).toEqual(["b1#0", "b4#0", "d9#2"]);
  });
});

