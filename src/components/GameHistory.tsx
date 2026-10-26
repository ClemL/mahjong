"use client";

import { type GameRecord, statsByName } from "@/game/history";
import { signed } from "./TableResult";

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * What a table remembers of the games played at it: each person's record
 * across them, then the games themselves, newest first. Only people are
 * counted; a chair the computer played is shown in its game but is nobody's
 * record.
 */
export function GameHistory({ games }: { games: GameRecord[] | null }) {
  if (games === null) return <p className="history__note">Reading this table&rsquo;s games…</p>;
  const played = games.filter((g) => g.hands > 0);
  if (played.length === 0) {
    return (
      <p className="history__note">
        No games finished at this table yet. A game is kept here once it ends with at least one hand played.
      </p>
    );
  }
  const stats = statsByName(played);
  return (
    <div className="history">
      <section className="history__panel" aria-labelledby="history-players">
        <h3 id="history-players" className="history__heading">
          Players · {played.length} {played.length === 1 ? "game" : "games"}
        </h3>
        {stats.length === 0 ? (
          <p className="history__note">Only the computer has finished a game here so far.</p>
        ) : (
          <table className="history__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="history__num">Games</th>
                <th scope="col" className="history__num">1st</th>
                <th scope="col" className="history__num">Avg place</th>
                <th scope="col" className="history__num">Chips</th>
                <th scope="col" className="history__num">Wins</th>
                <th scope="col" className="history__num">Best hand</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.name.toLowerCase()}>
                  <th scope="row">{s.name}</th>
                  <td className="history__num">{s.games}</td>
                  <td className="history__num">{s.firsts}</td>
                  <td className="history__num">{s.averagePlace.toFixed(1)}</td>
                  <td className="history__num">{signed(s.net)}</td>
                  <td className="history__num">{s.wins}</td>
                  <td className="history__num">{s.bestFaan > 0 ? `${s.bestFaan} faan` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="history__panel" aria-labelledby="history-games">
        <h3 id="history-games" className="history__heading">
          Recent games
        </h3>
        <ol className="history__games">
          {played.map((game) => (
            <li key={game.id} className="history__game">
              <span className="history__when">
                {when(game.endedAt)} · {game.hands} {game.hands === 1 ? "hand" : "hands"}
                {game.endedEarly ? " · ended early" : ""}
              </span>
              <span className="history__standings">
                {game.players.map((p) => (
                  <span key={p.seat} className={`history__place${p.place === 1 ? " history__place--top" : ""}`}>
                    {p.place}. {p.name} <strong>{p.chips}</strong>
                  </span>
                ))}
              </span>
              {game.biggest ? (
                <span className="history__best">
                  Biggest hand: {game.biggest.name}, {game.biggest.faan} faan
                  {game.biggest.pattern ? ` · ${game.biggest.pattern}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
