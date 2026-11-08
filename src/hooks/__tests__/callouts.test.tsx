// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@/game/room";
import type { TileCode } from "@/game/tiles";
import type { AnnounceSpeed } from "../useLocalSetting";
import { ANNOUNCE_RATES, useCallouts } from "../useCallouts";
import { dealt, tableView } from "@/components/__tests__/fixtures";

class FakeUtterance {
  rate = 1;
  lang = "";
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

/** A speech engine that records what it was asked to say, and whether it was cut short first. */
function fakeSynth() {
  const said: { text: string; rate: number; cutShort: boolean }[] = [];
  let cut = false;
  const synth = {
    speaking: false,
    pending: false,
    queue: [] as FakeUtterance[],
    getVoices: () => [],
    cancel() {
      cut = true;
      for (const u of synth.queue) u.onerror?.();
      synth.queue = [];
      synth.speaking = false;
    },
    speak(u: FakeUtterance) {
      said.push({ text: u.text, rate: u.rate, cutShort: cut });
      cut = false;
      synth.queue.push(u);
      if (!synth.speaking) {
        synth.speaking = true;
        u.onstart?.();
      }
    },
    /** The utterance being spoken reaches its end, and the next one starts. */
    finish() {
      synth.queue.shift()?.onend?.();
      const next = synth.queue[0];
      synth.speaking = Boolean(next);
      next?.onstart?.();
    },
  };
  return { synth, said };
}

const threw = (v: RoomView, id: string, code: TileCode): RoomView => ({ ...v, lastPlayed: { tile: { id, code }, from: 1 } });

const pung = (v: RoomView): RoomView => ({
  ...v,
  players: v.players.map((p) => (p.seat === 2 ? { ...p, melds: [...p.melds, { type: "pung", tiles: [], concealed: false }] } : p)),
});

describe("the tablet's voice", () => {
  let speech: ReturnType<typeof fakeSynth>;

  beforeEach(() => {
    speech = fakeSynth();
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: speech.synth });
  });

  afterEach(() => {
    // Let anything still being said finish, so the next test starts silent.
    while (speech.synth.queue.length) speech.synth.finish();
    vi.unstubAllGlobals();
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  });

  const run = (announce: AnnounceSpeed, calls = true) => {
    const start = tableView(dealt());
    const hook = renderHook(({ view }) => useCallouts(view, { calls, announce }), { initialProps: { view: start } });
    return { start, next: (view: RoomView) => hook.rerender({ view }) };
  };

  it("names each discard at the speed chosen, in English without a Chinese voice", () => {
    const { start, next } = run("fast");
    const first = threw(start, "p5#1", "p5");
    next(first);
    next({ ...first, wallCount: first.wallCount - 1 });
    expect(speech.said).toEqual([{ text: "5 Dots", rate: ANNOUNCE_RATES.fast, cutShort: true }]);
    expect(ANNOUNCE_RATES.slow).toBeLessThan(ANNOUNCE_RATES.normal);
    expect(ANNOUNCE_RATES.normal).toBeLessThan(ANNOUNCE_RATES.fast);
  });

  it("says nothing for a discard when announcing is off, and still makes its calls", () => {
    const { start, next } = run("off");
    const thrown = threw(start, "p5#1", "p5");
    next(thrown);
    expect(speech.said).toEqual([]);
    next(pung(thrown));
    expect(speech.said.map((s) => s.text)).toEqual(["Pung"]);
  });

  it("names the tile before the call that claims it when both arrive in one poll", () => {
    const { start, next } = run("normal");
    next(pung(threw(start, "p5#1", "p5")));
    expect(speech.said).toEqual([
      { text: "5 Dots", rate: 1, cutShort: true },
      { text: "Pung", rate: 1, cutShort: false },
    ]);
  });

  it("lets a call finish before the next tile, and cuts a tile short for the next one", () => {
    const { start, next } = run("normal");
    const claimed = pung(threw(start, "p5#1", "p5"));
    next(claimed);
    speech.synth.finish(); // the tile is said; the call starts
    const after = threw(claimed, "dr#2", "dr");
    next(after);
    expect(speech.said.at(-1)).toEqual({ text: "Red Dragon", rate: 1, cutShort: false });
    speech.synth.finish(); // the call is said; Red Dragon starts
    next(threw(after, "s3#3", "s3"));
    expect(speech.said.at(-1)).toEqual({ text: "3 Bamboo", rate: 1, cutShort: true });
  });
});
