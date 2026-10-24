/**
 * A finished game told from its hand history: where everyone ended, how they
 * got there, and the handful of facts a table talks about afterwards.
 */
import type { HandRecord } from "./engine";
import { STARTING_CHIPS } from "./rules";
import type { Seat } from "./tiles";

const SEATS: Seat[] = [0, 1, 2, 3];

export interface GameSummary {
  hands: number;
  /** Hands won, by seat. */
  wins: number[];
  selfDraws: number;
  /** Winning tiles each seat threw. */
  thrown: number[];
  washouts: number;
  /** The highest-scoring win, the earlier on a tie; null if nobody won a hand. */
  biggest: {
    /** Which hand of the game, from 1. */
    hand: number;
    winner: Seat;
    faan: number;
    pattern: { name: string; chinese: string } | null;
  } | null;
  /** Chips by seat, from the chips everyone sat down with to the end of each hand. */
  chips: number[][];
  /** Seats from the most chips to the fewest; a tie keeps seat order. */
  standings: Seat[];
  /** Each seat's place, a tie sharing the higher one (1, 1, 3, 4). */
  place: number[];
}

export function summarizeGame(history: readonly HandRecord[]): GameSummary {
  const wins = [0, 0, 0, 0];
  const thrown = [0, 0, 0, 0];
  let selfDraws = 0;
  let washouts = 0;
  let biggest: GameSummary["biggest"] = null;
  for (const [index, hand] of history.entries()) {
    if (hand.type === "washout" || hand.winner === null) {
      washouts += 1;
      continue;
    }
    // A discard more than one player won on counts as a win for each, and a winner thrown for each.
    const won = [
      { winner: hand.winner, faan: hand.faan ?? 0, pattern: hand.pattern ?? null },
      ...(hand.alsoWon ?? []).map((o) => ({ winner: o.winner, faan: o.faan, pattern: null })),
    ];
    for (const { winner, faan, pattern } of won) {
      wins[winner] += 1;
      if (hand.from === null) selfDraws += 1;
      else thrown[hand.from] += 1;
      if (faan > (biggest?.faan ?? -1)) biggest = { hand: index + 1, winner, faan, pattern };
    }
  }

  const chips = SEATS.map((seat) => [
    STARTING_CHIPS,
    ...history.map((hand) => STARTING_CHIPS + hand.scores[seat]),
  ]);
  const final = SEATS.map((seat) => chips[seat][chips[seat].length - 1]);
  const standings = [...SEATS].sort((a, b) => final[b] - final[a] || a - b);
  const place = SEATS.map((seat) => 1 + final.filter((c) => c > final[seat]).length);

  return { hands: history.length, wins, selfDraws, thrown, washouts, biggest, chips, standings, place };
}
