/**
 * The games a table has finished, kept after the room itself has moved on,
 * and what they say about the people who played them. Pure: the server
 * stores the records, and screens read the numbers from here.
 */
import type { HandRecord } from "./engine";
import { STARTING_CHIPS } from "./rules";
import { summarizeGame } from "./summary";
import type { Seat } from "./tiles";

export interface GameRecord {
  /** Unique per game, so a game is never kept twice. */
  id: string;
  endedAt: number;
  hands: number;
  endedEarly: boolean;
  players: {
    seat: Seat;
    name: string;
    /** False for a chair the computer played; those are kept but not counted as anyone's. */
    human: boolean;
    chips: number;
    place: number;
    wins: number;
    /** Winning tiles this seat threw. */
    thrown: number;
    /** The most faan this seat won a hand with; 0 if it won none. */
    bestFaan: number;
  }[];
  biggest: { name: string; faan: number; pattern: string | null } | null;
}

/** How many finished games a table keeps; the oldest go first. */
export const GAMES_KEPT = 50;

/** A finished game as the table will remember it. */
export function gameRecord(input: {
  id: string;
  endedAt: number;
  endedEarly: boolean;
  history: readonly HandRecord[];
  players: { name: string; human: boolean }[];
}): GameRecord {
  const summary = summarizeGame(input.history);
  const final = (seat: Seat) => summary.chips[seat][summary.chips[seat].length - 1];
  const best = [0, 0, 0, 0];
  for (const hand of input.history) {
    if (hand.type !== "win" || hand.winner === null) continue;
    best[hand.winner] = Math.max(best[hand.winner], hand.faan ?? 0);
    for (const also of hand.alsoWon ?? []) best[also.winner] = Math.max(best[also.winner], also.faan);
  }
  return {
    id: input.id,
    endedAt: input.endedAt,
    hands: summary.hands,
    endedEarly: input.endedEarly,
    players: summary.standings.map((seat) => ({
      seat,
      name: input.players[seat].name,
      human: input.players[seat].human,
      chips: final(seat),
      place: summary.place[seat],
      wins: summary.wins[seat],
      thrown: summary.thrown[seat],
      bestFaan: best[seat],
    })),
    biggest: summary.biggest
      ? {
          name: input.players[summary.biggest.winner].name,
          faan: summary.biggest.faan,
          pattern: summary.biggest.pattern ? `${summary.biggest.pattern.name} ${summary.biggest.pattern.chinese}` : null,
        }
      : null,
  };
}

export interface NameStats {
  name: string;
  games: number;
  /** Games finished first, a shared first included. */
  firsts: number;
  averagePlace: number;
  /** Chips won or lost over every game, against what everyone sat down with. */
  net: number;
  wins: number;
  thrown: number;
  /** The most faan this name won a hand with, across every game; 0 if none. */
  bestFaan: number;
}

/** "Kris", "kris " and "KRIS" are the same person at a table where names are typed on phones. */
const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Each person's record across the table's games, most games first. Only
 * people count: a chair the computer played is nobody's record.
 */
export function statsByName(games: readonly GameRecord[]): NameStats[] {
  const byName = new Map<string, NameStats & { places: number }>();
  // Newest first, so a name is shown as it was last typed.
  const newestFirst = [...games].sort((a, b) => b.endedAt - a.endedAt);
  for (const game of newestFirst) {
    if (game.hands === 0) continue;
    for (const p of game.players) {
      if (!p.human) continue;
      const key = nameKey(p.name);
      const entry =
        byName.get(key) ??
        { name: p.name.trim(), games: 0, firsts: 0, averagePlace: 0, net: 0, wins: 0, thrown: 0, bestFaan: 0, places: 0 };
      entry.games += 1;
      entry.firsts += p.place === 1 ? 1 : 0;
      entry.places += p.place;
      entry.net += p.chips - STARTING_CHIPS;
      entry.wins += p.wins;
      entry.thrown += p.thrown;
      entry.bestFaan = Math.max(entry.bestFaan, p.bestFaan);
      byName.set(key, entry);
    }
  }
  return [...byName.values()]
    .map(({ places, ...rest }) => ({ ...rest, averagePlace: Math.round((places / rest.games) * 10) / 10 }))
    .sort((a, b) => b.games - a.games || b.firsts - a.firsts || a.averagePlace - b.averagePlace || a.name.localeCompare(b.name));
}
