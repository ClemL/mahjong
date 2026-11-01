"use client";

import { type Earned, achievement } from "@/game/achievements";
import { leaders } from "@/game/gameStats";
import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";
import { joinNames } from "./TableResult";

const SEATS: Seat[] = [0, 1, 2, 3];

/** "2m 14s", "45s", "0s": a length of time as the final scores say it. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/** "Most pungs: Kris, 4" — or that nobody made any. */
function leaderLine(label: string, counts: readonly number[], name: (seat: Seat) => string): string {
  const { seats, count } = leaders(counts);
  return seats.length === 0 ? `${label}: none made` : `${label}: ${joinNames(seats.map(name))}, ${count}`;
}

/** Each person's achievements this game, as icon and title. */
export function AchievementList({ earned, name }: { earned: readonly Earned[]; name: (seat: Seat) => string }) {
  const bySeat = SEATS.map((seat) => earned.filter((e) => e.seat === seat)).filter((list) => list.length > 0);
  if (bySeat.length === 0) return <p className="game-stats__none">Nobody earned an achievement this game.</p>;
  return (
    <ul className="achievements">
      {bySeat.map((list) => (
        <li key={list[0].seat} className="achievements__row">
          <span className="achievements__who">{name(list[0].seat)}</span>
          <span className="achievements__list">
            {list.map((e) => {
              const a = achievement(e.id);
              return (
                <span key={e.id} className="achievement-chip" title={a.detail}>
                  <span aria-hidden>{a.icon}</span> {a.title}
                </span>
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * How the game went for each person besides the chips: time on their turns,
 * the hurry-ups, the sets they claimed, and who claimed the most. The
 * computer's turns are not timed, so its chairs read a dash there.
 */
export function PlayerStats({ view, name }: { view: RoomView; name: (seat: Seat) => string }) {
  const stats = view.stats;
  return (
    <div className="game-stats">
      <p className="game-stats__leaders">
        <span>{leaderLine("Most pungs", stats.pungs, name)}</span>
        <span>{leaderLine("Most chows", stats.chows, name)}</span>
      </p>
      <table className="game-stats__table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col" className="game-stats__num">
              Time on turns
            </th>
            <th scope="col" className="game-stats__num">
              Hurry-ups sent · got
            </th>
            <th scope="col" className="game-stats__num">
              Pungs
            </th>
            <th scope="col" className="game-stats__num">
              Chows
            </th>
          </tr>
        </thead>
        <tbody>
          {SEATS.map((seat) => {
            const turns = stats.turns[seat];
            return (
              <tr key={seat}>
                <th scope="row">{name(seat)}</th>
                <td className="game-stats__num">
                  {turns === 0 ? (
                    "—"
                  ) : (
                    <>
                      {formatDuration(stats.turnMs[seat])}
                      <span className="game-stats__sub">
                        {turns} {turns === 1 ? "turn" : "turns"} · {formatDuration(stats.turnMs[seat] / turns)} each
                      </span>
                    </>
                  )}
                </td>
                <td className="game-stats__num">
                  {stats.hurriesSent[seat]} · {stats.hurriesReceived[seat]}
                </td>
                <td className="game-stats__num">{stats.pungs[seat]}</td>
                <td className="game-stats__num">{stats.chows[seat]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {view.settings.achievements !== false ? (
        <>
          <h4 className="game-stats__heading">Achievements</h4>
          <AchievementList earned={view.achievements} name={name} />
        </>
      ) : null}
    </div>
  );
}

/** One person's own game, in a line or two, for the phone's final scores. */
export function YourGame({ view, seat }: { view: RoomView; seat: Seat }) {
  const stats = view.stats;
  const turns = stats.turns[seat];
  const mine = view.achievements.filter((e) => e.seat === seat);
  const facts = [
    turns > 0
      ? `${formatDuration(stats.turnMs[seat])} on ${turns} ${turns === 1 ? "turn" : "turns"} (${formatDuration(stats.turnMs[seat] / turns)} each)`
      : null,
    `${stats.pungs[seat]} ${stats.pungs[seat] === 1 ? "pung" : "pungs"}`,
    `${stats.chows[seat]} ${stats.chows[seat] === 1 ? "chow" : "chows"}`,
    `hurried others ${stats.hurriesSent[seat]}×, hurried ${stats.hurriesReceived[seat]}×`,
  ].filter(Boolean);
  return (
    <div className="your-game">
      <span className="your-game__facts">{facts.join(" · ")}</span>
      {mine.length > 0 ? (
        <span className="your-game__achievements">
          {mine.map((e) => {
            const a = achievement(e.id);
            return (
              <span key={e.id} className="achievement-chip" title={a.detail}>
                <span aria-hidden>{a.icon}</span> {a.title}
              </span>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}
