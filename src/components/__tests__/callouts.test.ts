import { describe, expect, it } from "vitest";
import type { RoomView } from "@/game/room";
import { calloutFor, pickVoice } from "@/hooks/useCallouts";
import type { ReplayStep } from "@/game/replay";
import type { TileCode } from "@/game/tiles";
import { describeStep } from "../HandReplay";
import { dealt, tableView } from "./fixtures";

const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;

/** The same table with `seat` having just laid down a set of `type`. */
function laid(view: RoomView, seat: number, type: "chow" | "pung" | "kong"): RoomView {
  return {
    ...view,
    players: view.players.map((p) =>
      p.seat === seat ? { ...p, melds: [...p.melds, { type, tiles: [], concealed: false }] } : p,
    ),
  };
}

describe("calling out claims and wins", () => {
  const view = tableView(dealt());

  it("calls each set as it is laid down", () => {
    expect(calloutFor(view, laid(view, 1, "pung"))).toBe("pung");
    expect(calloutFor(view, laid(view, 2, "chow"))).toBe("chow");
    expect(calloutFor(view, laid(view, 3, "kong"))).toBe("kong");
  });

  it("calls a win, self-drawn or off a discard, and nothing for a washout", () => {
    const over = (result: RoomView["result"]): RoomView => ({ ...view, phase: "handOver", result });
    const win = { type: "win" as const, winner: 1 as const, score: null, payments: [0, 0, 0, 0], dealerKeeps: false };
    expect(calloutFor(view, over({ ...win, from: 0 }))).toBe("win");
    expect(calloutFor(view, over({ ...win, from: null }))).toBe("selfDrawn");
    expect(calloutFor(view, over({ type: "washout", winner: null, from: null, score: null, payments: [0, 0, 0, 0], dealerKeeps: true }))).toBeNull();
  });

  it("says nothing for a discard, a draw or a fresh deal", () => {
    expect(calloutFor(view, { ...view, wallCount: view.wallCount - 1 })).toBeNull();
    expect(calloutFor(view, { ...laid(view, 1, "pung"), handNumber: view.handNumber + 1 })).toBeNull();
  });

  it("speaks Cantonese where it can, any Chinese voice next, and English otherwise", () => {
    expect(pickVoice([voice("en-US"), voice("zh-CN"), voice("zh-HK")])?.lang).toBe("zh-HK");
    expect(pickVoice([voice("en-US"), voice("yue_HK")])?.lang).toBe("yue_HK");
    expect(pickVoice([voice("en-GB"), voice("zh-TW")])?.lang).toBe("zh-TW");
    expect(pickVoice([voice("en-US")])).toBeNull();
  });
});

describe("a replayed move in words", () => {
  const name = (seat: number) => ["Kris", "Srini", "Steven", "James"][seat];
  const step = (over: Partial<ReplayStep>): ReplayStep => ({
    seat: 1,
    play: null,
    ponds: [[], [], [], []],
    sets: [[], [], [], []],
    marked: null,
    taken: null,
    ...over,
  });

  it("names the claim, the tile taken and whose pond it came from", () => {
    const play = { kind: "pung" as const, tiles: ["p5", "p5", "p5"] as TileCode[], hand: 1, from: 0 as const };
    expect(describeStep(step({ play, taken: "p5" }), name)).toBe("Srini punged 5 Dots from Kris.");
  });

  it("tells a concealed kong from one added to a pung, and a self-draw from a win off a discard", () => {
    const kong = { kind: "kong" as const, tiles: ["dr", "dr", "dr", "dr"] as TileCode[], hand: 1 };
    const concealed = step({ play: kong, sets: [[], [{ kind: "kong", tiles: kong.tiles, concealed: true }], [], []] });
    const added = step({ play: kong, sets: [[], [{ kind: "kong", tiles: kong.tiles, concealed: false }], [], []] });
    expect(describeStep(concealed, name)).toBe("Srini declared a concealed kong of Red Dragon.");
    expect(describeStep(added, name)).toBe("Srini added to the kong of Red Dragon.");
    const win = { kind: "win" as const, tiles: [] as TileCode[], hand: 1 };
    expect(describeStep(step({ play: win }), name)).toBe("Srini drew the winning tile.");
    expect(describeStep(step({ play: { ...win, tiles: ["s3"], from: 3 } }), name)).toBe("Srini won on James's 3 Bamboo.");
  });
});
