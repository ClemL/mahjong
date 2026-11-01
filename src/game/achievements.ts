import type { GameState, HandRecord } from "./engine";
import type { GameStats } from "./gameStats";
import type { Seat } from "./tiles";

export type AchievementId =
  | "offTheMark"
  | "selfMade"
  | "bigFish"
  | "hatTrick"
  | "pungFu"
  | "chowHound"
  | "kongGong"
  | "flowerGarden"
  | "quickDraw"
  | "takeYourTime"
  | "backseatDriver"
  | "topOfTheTable";

export interface Achievement {
  id: AchievementId;
  /** Drawn beside the title; the title always says it in words. */
  icon: string;
  title: string;
  /** How it is earned, said the way the toast and the final scores show it. */
  detail: string;
}

/** One achievement, earned once a game by whoever was sitting in a chair at the time. */
export interface Earned {
  id: AchievementId;
  seat: Seat;
  /** The person's name when they earned it. */
  name: string;
  hand: number;
}

/** Thresholds, in one place so the words and the tests read them from here. */
export const BIG_FISH_FAAN = 5;
export const HAT_TRICK_WINS = 3;
export const PUNG_FU_PUNGS = 3;
export const CHOW_HOUND_CHOWS = 4;
export const FLOWER_GARDEN_FLOWERS = 4;
export const QUICK_DRAW_TURNS = 10;
export const HURRIED_TIMES = 3;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "offTheMark", icon: "🎯", title: "Off the Mark", detail: "Win a hand" },
  { id: "selfMade", icon: "✋", title: "Self-Made 自摸", detail: "Win on a tile you drew yourself" },
  { id: "bigFish", icon: "🐟", title: "Big Fish", detail: `Win a hand worth ${BIG_FISH_FAAN} faan or more` },
  { id: "hatTrick", icon: "🎩", title: "Hat Trick", detail: `Win ${HAT_TRICK_WINS} hands in one game` },
  { id: "pungFu", icon: "🥋", title: "Pung Fu", detail: `Claim ${PUNG_FU_PUNGS} pungs in one game` },
  { id: "chowHound", icon: "🍜", title: "Chow Hound", detail: `Claim ${CHOW_HOUND_CHOWS} chows in one game` },
  { id: "kongGong", icon: "🔔", title: "Kong Gong", detail: "Make a kong" },
  {
    id: "flowerGarden",
    icon: "🌸",
    title: "Flower Garden",
    detail: `Hold ${FLOWER_GARDEN_FLOWERS} flowers or seasons at once`,
  },
  {
    id: "quickDraw",
    icon: "⚡",
    title: "Quick Draw",
    detail: `Throw within 3 seconds of your turn, ${QUICK_DRAW_TURNS} times in one game`,
  },
  { id: "takeYourTime", icon: "🐢", title: "Take Your Time", detail: `Get hurried up ${HURRIED_TIMES} times in one game` },
  {
    id: "backseatDriver",
    icon: "📣",
    title: "Backseat Driver",
    detail: `Hurry others up ${HURRIED_TIMES} times in one game`,
  },
  { id: "topOfTheTable", icon: "🏆", title: "Top of the Table", detail: "Finish the game with the most chips" },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievement(id: AchievementId): Achievement {
  return BY_ID.get(id)!;
}

/** Every win a hand record holds for one seat: the winner, and anyone paid on the same discard. */
function winsIn(record: HandRecord, seat: Seat): { faan: number; selfDrawn: boolean }[] {
  if (record.type !== "win") return [];
  const wins: { faan: number; selfDrawn: boolean }[] = [];
  if (record.winner === seat) wins.push({ faan: record.faan ?? 0, selfDrawn: record.from === null });
  for (const other of record.alsoWon ?? []) {
    if (other.winner === seat) wins.push({ faan: other.faan, selfDrawn: false });
  }
  return wins;
}

/** What each achievement looks at: the game so far, and the room's counts of it. */
const EARNS: Record<AchievementId, (seat: Seat, state: GameState, stats: GameStats) => boolean> = {
  offTheMark: (seat, state) => state.history.some((h) => winsIn(h, seat).length > 0),
  selfMade: (seat, state) => state.history.some((h) => winsIn(h, seat).some((w) => w.selfDrawn)),
  bigFish: (seat, state) => state.history.some((h) => winsIn(h, seat).some((w) => w.faan >= BIG_FISH_FAAN)),
  hatTrick: (seat, state) => state.history.reduce((n, h) => n + winsIn(h, seat).length, 0) >= HAT_TRICK_WINS,
  pungFu: (seat, _state, stats) => stats.pungs[seat] >= PUNG_FU_PUNGS,
  chowHound: (seat, _state, stats) => stats.chows[seat] >= CHOW_HOUND_CHOWS,
  kongGong: (seat, _state, stats) => stats.kongs[seat] >= 1,
  flowerGarden: (seat, state) => state.players[seat].flowers.length >= FLOWER_GARDEN_FLOWERS,
  quickDraw: (seat, _state, stats) => stats.quick[seat] >= QUICK_DRAW_TURNS,
  takeYourTime: (seat, _state, stats) => stats.hurriesReceived[seat] >= HURRIED_TIMES,
  backseatDriver: (seat, _state, stats) => stats.hurriesSent[seat] >= HURRIED_TIMES,
  topOfTheTable: (seat, state) =>
    state.phase === "gameOver" &&
    state.history.length > 0 &&
    state.scores[seat] === Math.max(...state.scores),
};

/**
 * The achievements earned since `earned` was last brought up to date, in the
 * order they are listed. Only people earn them — `people` names whoever is
 * sitting in each chair, or null where the computer is — and each once a game.
 */
export function newlyEarned(
  state: GameState,
  stats: GameStats,
  earned: readonly Earned[],
  people: readonly (string | null)[],
): Earned[] {
  const fresh: Earned[] = [];
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const name = people[seat];
    if (name === null) continue;
    for (const { id } of ACHIEVEMENTS) {
      if (earned.some((e) => e.id === id && e.seat === seat)) continue;
      if (EARNS[id](seat, state, stats)) fresh.push({ id, seat, name, hand: state.handNumber });
    }
  }
  return fresh;
}
