import type { GameState } from "@/game/engine";
import { roundName } from "@/game/tiles";

/**
 * The solo game, kept on this device so a reload — or a phone browser throwing
 * the tab away in the background — does not lose a game of sixteen hands or
 * more. The engine state is plain data, so it is stored whole.
 */
export const SOLO_SAVE_KEY = "hk-mahjong.solo";

/** Bumped when a saved state can no longer be played by the current engine. */
const SAVE_VERSION = 1;

interface SavedGame {
  version: number;
  savedAt: number;
  state: GameState;
}

/** Enough to be sure the engine can carry on from it; anything else is dropped. */
function playable(state: unknown): state is GameState {
  const s = state as GameState | null;
  return (
    !!s &&
    Array.isArray(s.players) &&
    s.players.length === 4 &&
    Array.isArray(s.wall) &&
    typeof s.handNumber === "number" &&
    !!s.config &&
    s.phase !== "gameOver"
  );
}

export function readSavedGame(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SOLO_SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version === SAVE_VERSION && playable(saved.state)) return saved.state;
  } catch {
    // Unreadable or blocked storage is the same as nothing saved.
  }
  clearSavedGame();
  return null;
}

export function writeSavedGame(state: GameState): void {
  try {
    if (state.phase === "gameOver") {
      clearSavedGame();
      return;
    }
    const saved: SavedGame = { version: SAVE_VERSION, savedAt: Date.now(), state };
    window.localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the game plays on, it just cannot be resumed.
  }
}

export function clearSavedGame(): void {
  try {
    window.localStorage.removeItem(SOLO_SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A line for the start page: where the saved game stands, e.g. "South round, hand 6 · you are +24". */
export function describeSavedGame(state: GameState, humanSeat = 0): string {
  const score = state.scores[humanSeat] ?? 0;
  const standing = score > 0 ? `you are +${score}` : score < 0 ? `you are ${score}` : "you are level";
  return `${roundName(state.roundWind)} round, hand ${state.handNumber} · ${standing}`;
}
