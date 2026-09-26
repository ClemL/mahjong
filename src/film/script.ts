/**
 * The narration.
 *
 * There is no audio, so these lines carry the whole explanation and are the
 * film's accessible text as well — the player renders the current one into a
 * live region and offers the lot as a transcript. Times are the second each
 * line appears; a line stands until the next one replaces it.
 */

export interface Line {
  at: number;
  text: string;
}

export interface Chapter {
  at: number;
  title: string;
}

export const RUNTIME = 278;

export const CHAPTERS: Chapter[] = [
  { at: 0, title: "Opening" },
  { at: 14, title: "The table" },
  { at: 32, title: "The three suits" },
  { at: 68, title: "Winds & dragons" },
  { at: 90, title: "Flowers" },
  { at: 102, title: "Your hand" },
  { at: 130, title: "Sets" },
  { at: 164, title: "Taking a turn" },
  { at: 188, title: "Claiming a tile" },
  { at: 212, title: "Scoring" },
  { at: 238, title: "Winning" },
  { at: 250, title: "Play it" },
];

export const LINES: Line[] = [
  { at: 1.0, text: "Mahjong." },
  { at: 3.6, text: "Four players, one table, and a hundred and forty-four tiles." },
  { at: 8.4, text: "This is the Hong Kong way of playing it." },
  { at: 12.2, text: "" },

  { at: 14.6, text: "Everyone takes a seat, and a wind." },
  { at: 18.2, text: "East, South, West, North." },
  { at: 21.6, text: "The tiles go face down and get stacked into a wall." },
  { at: 26.8, text: "East deals. The wall is broken open." },
  { at: 30.8, text: "" },

  { at: 32.6, text: "Three suits, each running one to nine." },
  { at: 36.6, text: "Characters." },
  { at: 40.0, text: "Dots." },
  { at: 43.4, text: "Bamboo." },
  { at: 47.0, text: "One through nine, in all three." },
  { at: 51.6, text: "And four copies of every single one." },
  { at: 57.2, text: "That is a hundred and eight tiles already." },
  { at: 62.4, text: "The rest are special." },
  { at: 66.4, text: "" },

  { at: 68.6, text: "First, the four winds." },
  { at: 72.2, text: "East, South, West and North — this time as tiles you can collect." },
  { at: 78.2, text: "Then three dragons." },
  { at: 81.6, text: "Red, green, and white — the blank one." },
  { at: 86.2, text: "Winds and dragons make no runs. Only sets of the same tile." },

  { at: 90.6, text: "Last, eight bonus tiles: four flowers and four seasons." },
  { at: 96.4, text: "Draw one and it is set aside, worth a point, and you draw again." },
  { at: 101.0, text: "" },

  { at: 102.6, text: "You hold thirteen tiles." },
  { at: 106.2, text: "Nobody else can see them." },
  { at: 109.6, text: "You are hunting for a fourteenth that finishes the hand." },
  { at: 115.2, text: "A finished hand is four sets and a pair." },
  { at: 120.6, text: "The pair is two of a kind — the eyes of the hand." },
  { at: 125.2, text: "The four sets are where the game actually is." },

  { at: 130.6, text: "Three in a row, one suit, is a chow." },
  { at: 136.2, text: "Three of the very same tile is a pung." },
  { at: 141.6, text: "Four of the same is a kong —" },
  { at: 145.2, text: "— and a kong earns you one extra tile." },
  { at: 149.6, text: "Any four groups will do. Runs, triplets, or a mix." },
  { at: 155.2, text: "Plus the pair. Fourteen tiles. That is a win." },
  { at: 160.4, text: "" },

  { at: 164.6, text: "The turn itself is simple, and it passes to the right." },
  { at: 169.2, text: "Draw a tile." },
  { at: 172.2, text: "Throw one away." },
  { at: 175.2, text: "Thirteen in hand, always — until the one that wins." },
  { at: 181.2, text: "Round and round, until somebody has it." },
  { at: 186.0, text: "" },

  { at: 188.6, text: "But a thrown tile is fair game." },
  { at: 192.6, text: "If it completes a set of yours, say so and take it." },
  { at: 198.6, text: "That set goes down face up, where everyone can see it." },
  { at: 204.2, text: "A claim jumps the queue — play carries on from you." },
  { at: 209.0, text: "Sets claimed this way score less. That is the trade." },

  { at: 212.6, text: "Winning is only half of it. What you won with sets the price." },
  { at: 219.0, text: "Patterns are counted in faan." },
  { at: 222.6, text: "All runs. All one suit. All triplets." },
  { at: 227.2, text: "Self-drawn. Concealed. Your own seat's flower." },
  { at: 231.6, text: "More faan, more points — up to the house limit." },
  { at: 236.4, text: "" },

  { at: 238.6, text: "Fourteen tiles that fit." },
  { at: 241.6, text: "Say it out loud, and the hand is over." },
  { at: 245.6, text: "Then the tiles go back in, and you do the whole thing again." },
  { at: 249.2, text: "" },

  { at: 250.6, text: "This table is on your screen." },
  { at: 254.2, text: "Three computer opponents will play the other seats." },
  { at: 259.2, text: "Or lay a tablet in the middle —" },
  { at: 262.6, text: "— and everyone scans the chair they are sitting in." },
  { at: 268.2, text: "Four phones, one table, nothing to install." },
  { at: 272.6, text: "Take a seat." },
];

/** The line showing at time t, and how long it has been up. */
export function lineAt(t: number): { text: string; since: number; index: number } {
  let lo = 0;
  let hi = LINES.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (LINES[mid]!.at <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return { text: "", since: 0, index: -1 };
  return { text: LINES[found]!.text, since: t - LINES[found]!.at, index: found };
}

export function chapterAt(t: number): Chapter {
  let current = CHAPTERS[0]!;
  for (const c of CHAPTERS) if (c.at <= t) current = c;
  return current;
}

/** Every spoken line, in order, for the readable transcript. */
export function transcript(): { time: number; text: string }[] {
  return LINES.filter((l) => l.text !== "").map((l) => ({ time: l.at, text: l.text }));
}
