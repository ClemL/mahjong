import type { LogEntry } from "@/game/engine";
import type { PublicPlayer } from "@/game/room";
import { SEAT_NAMES, type Seat, tileName } from "@/game/tiles";
import { TileFace } from "./TileView";

const VERB: Record<NonNullable<LogEntry["play"]>["kind"], string> = {
  discard: "discarded",
  chow: "chowed",
  pung: "punged",
  kong: "konged",
  win: "won",
};

/** How many plays the phone keeps on screen. */
export const PLAY_LOG_LINES = 4;

/**
 * The last few plays of this hand, newest at the bottom: who threw what, and
 * who took it into which set — enough to follow the table without looking up.
 */
export function PlayLog({
  log,
  hand,
  players,
}: {
  log: LogEntry[];
  hand: number;
  players: PublicPlayer[];
}) {
  const plays = log.filter((e) => e.play && e.play.hand === hand && e.seat !== null).slice(-PLAY_LOG_LINES);
  const nameOf = (seat: Seat) => players[seat].occupant.name ?? SEAT_NAMES[seat];
  return (
    <ol className="playlog" aria-label="Recent plays">
      {plays.length === 0 ? <li className="playlog__row playlog__row--empty">No plays yet</li> : null}
      {plays.map((entry, i) => {
        const play = entry.play!;
        const said = `${nameOf(entry.seat!)} ${VERB[play.kind]} ${play.tiles.map(tileName).join(", ")}`;
        return (
          <li
            key={entry.id}
            className="playlog__row"
            // Older lines fade, so the newest reads first.
            style={{ opacity: 0.45 + (0.55 * (i + 1)) / plays.length }}
            title={said}
          >
            <span className="playlog__who">{nameOf(entry.seat!)}</span>{" "}
            <span className="playlog__verb">{VERB[play.kind]}</span>
            <span className={`playlog__tiles${play.tiles.length > 1 ? " playlog__tiles--set" : ""}`} aria-hidden>
              {play.tiles.map((code, k) => (
                <TileFace key={k} code={code} size="sm" />
              ))}
            </span>
            <span className="sr-only">{play.tiles.map(tileName).join(", ")}</span>
          </li>
        );
      })}
    </ol>
  );
}
