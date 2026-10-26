/**
 * A finished hand told again, move by move, from its log: the ponds filling
 * and the sets going down as they did at the table. Pure — it reads the log a
 * view already carries, so a replay never needs anything the table was not
 * already sent.
 */
import type { LogEntry, PlayNote } from "./engine";
import type { Seat, TileCode } from "./tiles";

export interface ReplaySet {
  kind: "chow" | "pung" | "kong";
  tiles: TileCode[];
  /** A kong declared from the hand, never shown face up as a claimed set is. */
  concealed: boolean;
}

export interface ReplayStep {
  /** Who moved; null only for the table before the first move. */
  seat: Seat | null;
  play: PlayNote | null;
  ponds: TileCode[][];
  sets: ReplaySet[][];
  /** The pond tile this move put down, or the one it won on, to ring it. */
  marked: { seat: Seat; index: number } | null;
  /** The discard a claim took from its pond. */
  taken: TileCode | null;
}

const empty = (): TileCode[][] => [[], [], [], []];

/** Every move of `hand` in order, with the table as it stood after each; the first step is the table before any. */
export function replaySteps(log: readonly LogEntry[], hand: number): ReplayStep[] {
  const ponds = empty();
  const sets: ReplaySet[][] = [[], [], [], []];
  const snapshot = (
    seat: Seat | null,
    play: PlayNote | null,
    marked: ReplayStep["marked"],
    taken: TileCode | null = null,
  ): ReplayStep => ({
    seat,
    play,
    ponds: ponds.map((p) => [...p]),
    sets: sets.map((s) => s.map((m) => ({ ...m, tiles: [...m.tiles] }))),
    marked,
    taken,
  });
  const steps: ReplayStep[] = [snapshot(null, null, null)];

  for (const entry of log) {
    const play = entry.play;
    if (!play || play.hand !== hand || entry.seat === null) continue;
    const seat = entry.seat;
    let marked: ReplayStep["marked"] = null;
    let taken: TileCode | null = null;
    if (play.kind === "discard") {
      ponds[seat].push(play.tiles[0]);
      marked = { seat, index: ponds[seat].length - 1 };
    } else if (play.kind === "win") {
      // Off a discard, the tile won on is the last the thrower put down.
      const from = play.from;
      const pond = from !== undefined ? ponds[from] : null;
      if (from !== undefined && pond && pond.length > 0 && pond[pond.length - 1] === play.tiles[0]) {
        marked = { seat: from, index: pond.length - 1 };
      }
    } else if (play.from !== undefined) {
      // A claim takes the newest tile of the pond it came from.
      taken = ponds[play.from].pop() ?? null;
      sets[seat].push({ kind: play.kind, tiles: [...play.tiles], concealed: false });
    } else {
      // A kong from the hand: added to a pung already down, or concealed.
      const pung = sets[seat].find((m) => m.kind === "pung" && m.tiles[0] === play.tiles[0]);
      if (pung) {
        pung.kind = "kong";
        pung.tiles = [...play.tiles];
      } else {
        sets[seat].push({ kind: "kong", tiles: [...play.tiles], concealed: true });
      }
    }
    steps.push(snapshot(seat, play, marked, taken));
  }
  return steps;
}
