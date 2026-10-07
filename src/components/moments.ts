/**
 * The wins worth more than the usual chips and confetti: the hands players
 * retell. Which one a hand was is read off its score, so this is presentation
 * only — the engine scores the patterns and knows nothing of how they look.
 */
import type { HandResult, LogEntry } from "@/game/engine";
import type { TileCode } from "@/game/tiles";

export type MomentKind = "limit" | "kongBlossom" | "robbing" | "seaMoon" | "riverFish";

export interface Moment {
  kind: MomentKind;
  /** The name as it is said at the table. */
  chinese: string;
  /** The name in English, for everyone else. */
  name: string;
  /** For a limit hand, the pattern that made it. */
  detail?: string;
}

/**
 * The moment a settled hand deserves, if any. A limit hand outranks the rest:
 * it is the bigger story, and a hand can be both.
 */
export function signatureMoment(result: HandResult | null): Moment | null {
  if (!result || result.type !== "win" || !result.score) return null;
  const { patterns, limitReached } = result.score;
  const has = (key: string) => patterns.find((p) => p.key === key);

  if (limitReached) {
    const biggest = [...patterns].sort((a, b) => b.faan - a.faan)[0];
    return {
      kind: "limit",
      chinese: "滿糊",
      name: "Limit hand",
      detail: biggest ? `${biggest.chinese} ${biggest.name}` : undefined,
    };
  }
  if (has("kongReplacement")) {
    return { kind: "kongBlossom", chinese: "槓上開花", name: "Flower on the Kong" };
  }
  if (has("robbingKong")) {
    return { kind: "robbing", chinese: "搶槓", name: "Robbing the Kong" };
  }
  const last = has("lastTile");
  if (last) {
    return result.from === null
      ? { kind: "seaMoon", chinese: "海底撈月", name: "Moon from the Bottom of the Sea" }
      : { kind: "riverFish", chinese: "河底撈魚", name: "Fish from the Bottom of the River" };
  }
  return null;
}

/** The tile a hand was won on, when the play log names one: a discard or a robbed kong's tile. */
export function winningTileOf(log: LogEntry[]): TileCode | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const play = log[i].play;
    if (play?.kind === "win") return play.tiles[0] ?? null;
  }
  return null;
}
