/**
 * A finished hand, move by move, for looking back over it.
 *
 * The React layer sees every state the engine produces, but each is a full
 * structured clone — kept whole, a hand's worth runs to tens of megabytes. A
 * frame keeps only what the replay draws: tile codes for each hand and pond,
 * the open sets, and what was said in the log since the frame before.
 */
import type { GameState } from "./engine";
import type { Meld } from "./melds";
import { type Seat, type TileCode, isFlower } from "./tiles";
import { waitingTiles } from "./winning";

export interface ReplaySeat {
  hand: TileCode[];
  melds: Meld[];
  discards: TileCode[];
  flowers: TileCode[];
}

export interface ReplayFrame {
  /** The engine's log counter when the frame was taken. */
  seq: number;
  /** What happened since the frame before, in the log's words. */
  text: string;
  /** Who it happened to, when it was one seat. */
  seat: Seat | null;
  turn: Seat;
  wall: number;
  players: ReplaySeat[];
  /** The tile just thrown, while it is still on offer. */
  discard: { code: TileCode; from: Seat } | null;
  over: boolean;
}

export function frameOf(state: GameState, previousSeq = -1): ReplayFrame {
  const fresh = state.log.filter((entry) => entry.id > previousSeq);
  return {
    seq: state.logSeq,
    text: fresh.map((entry) => entry.text).join(" · "),
    seat: fresh.length > 0 ? fresh[fresh.length - 1].seat : null,
    turn: state.turn,
    wall: state.wall.length,
    players: state.players.map((p) => ({
      hand: p.hand.filter((t) => !isFlower(t.code)).map((t) => t.code),
      melds: p.melds.map((m) => ({ ...m, tiles: m.tiles.map((t) => ({ ...t })) })),
      discards: p.discards.map((t) => t.code),
      flowers: p.flowers.map((t) => t.code),
    })),
    discard: state.lastDiscard ? { code: state.lastDiscard.tile.code, from: state.lastDiscard.from } : null,
    over: state.phase === "handOver" || state.phase === "gameOver",
  };
}

/**
 * Add `state` to a hand's frames if anything was logged since the last one —
 * a discard, a claim, a kong, a flower, the win. A state that only moved the
 * claim prompts along is not a move worth a frame.
 */
export function recordFrame(frames: ReplayFrame[], state: GameState): ReplayFrame[] {
  const last = frames[frames.length - 1];
  if (!last) return [frameOf(state)];
  if (state.logSeq === last.seq) return frames;
  return [...frames, frameOf(state, last.seq)];
}

/** What a seat was waiting on in this frame, if its hand was ready. */
export function readyOn(frame: ReplayFrame, seat: Seat): TileCode[] {
  const p = frame.players[seat];
  if (p.hand.length % 3 !== 1) return [];
  return waitingTiles(p.hand, p.melds);
}
