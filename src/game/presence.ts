/**
 * Presence timings, in their own leaf module so the React layer can share them
 * without dragging the rules engine into the multiplayer bundle.
 */

/**
 * Silence after which a seated player is treated as away and the computer
 * plays for them. Their seat is kept — acting or polling again takes it back —
 * because losing a chair for putting a phone down would be worse than the AI
 * playing a turn.
 *
 * Five minutes, not one: a phone locks after thirty seconds of not being
 * touched, and a locked phone stops polling — browsers throttle background
 * timers to about a minute and iOS suspends them outright. A full turn cycle
 * with four people regularly runs past ninety seconds, so a shorter threshold
 * hands your tiles to the computer for the crime of watching the table instead
 * of your screen.
 */
export const SEAT_IDLE_MS = 300_000;

/** How stale a heartbeat must be before a poll bothers to write one. */
export const HEARTBEAT_WRITE_MS = 25_000;
