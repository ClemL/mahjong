import type { LogEntry } from "./engine";
import type { Seat } from "./tiles";

/** A turn thrown this quickly counts as a quick one. */
export const QUICK_TURN_MS = 3000;

/**
 * What a game is remembered by besides its scores: how long each person took
 * over their turns, the hurry-ups, and the sets everyone claimed. Kept by the
 * room for the game in hand and started again with the next.
 */
export interface GameStats {
  /** Time each person spent on their own turns, in ms. The computer's turns are not timed. */
  turnMs: number[];
  /** Turns a person played themselves: a discard, or a win off their own draw. */
  turns: number[];
  /** Of those, the ones thrown within QUICK_TURN_MS. */
  quick: number[];
  hurriesSent: number[];
  hurriesReceived: number[];
  /** Sets claimed off a discard, or kongs declared, by every seat, the computer's included. */
  pungs: number[];
  chows: number[];
  kongs: number[];
  /** The newest log entry already counted. */
  logSeen: number;
  /** The last turn counted, so a discard taken back can be uncounted. */
  lastTurn: { seat: Seat; quick: boolean } | null;
}

/** The counts as everyone may see them. */
export type PublicStats = Omit<GameStats, "logSeen" | "lastTurn">;

const four = () => [0, 0, 0, 0];

export function emptyStats(): GameStats {
  return {
    turnMs: four(),
    turns: four(),
    quick: four(),
    hurriesSent: four(),
    hurriesReceived: four(),
    pungs: four(),
    chows: four(),
    kongs: four(),
    logSeen: 0,
    lastTurn: null,
  };
}

/**
 * Add a person's move to their time. A kong does not end the turn — the
 * replacement tile is still to play — so it adds time without a turn.
 */
export function addTurn(stats: GameStats, seat: Seat, ms: number, endsTurn: boolean): void {
  stats.turnMs[seat] += Math.max(0, Math.round(ms));
  if (!endsTurn) return;
  const quick = ms <= QUICK_TURN_MS;
  stats.turns[seat] += 1;
  if (quick) stats.quick[seat] += 1;
  stats.lastTurn = { seat, quick };
}

/**
 * A discard taken back was not the end of the turn after all: it is played
 * again, and counted then. The time already spent stays spent.
 */
export function uncountTurn(stats: GameStats, seat: Seat): void {
  const last = stats.lastTurn;
  if (!last || last.seat !== seat) return;
  stats.turns[seat] = Math.max(0, stats.turns[seat] - 1);
  if (last.quick) stats.quick[seat] = Math.max(0, stats.quick[seat] - 1);
  stats.lastTurn = null;
}

export function noteHurry(stats: GameStats, by: Seat, at: Seat): void {
  stats.hurriesSent[by] += 1;
  stats.hurriesReceived[at] += 1;
}

/**
 * Count the sets in log entries not counted yet. The log is the one place
 * every claim and kong passes through, the computer's and people's alike.
 */
export function countPlays(stats: GameStats, log: readonly LogEntry[]): void {
  for (const entry of log) {
    if (entry.id <= stats.logSeen) continue;
    stats.logSeen = entry.id;
    const play = entry.play;
    if (!play || entry.seat === null) continue;
    if (play.kind === "pung") stats.pungs[entry.seat] += 1;
    else if (play.kind === "chow") stats.chows[entry.seat] += 1;
    else if (play.kind === "kong") stats.kongs[entry.seat] += 1;
  }
}

export function publicStats(stats: GameStats): PublicStats {
  const { logSeen: _seen, lastTurn: _last, ...counts } = stats;
  return counts;
}

/** The seats with the most of a count, and how many; nobody when nobody has any. */
export function leaders(counts: readonly number[]): { seats: Seat[]; count: number } {
  const count = Math.max(...counts);
  if (count <= 0) return { seats: [], count: 0 };
  return { seats: ([0, 1, 2, 3] as Seat[]).filter((s) => counts[s] === count), count };
}
