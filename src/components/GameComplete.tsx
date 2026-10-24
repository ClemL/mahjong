"use client";

import { type CSSProperties, useState } from "react";
import type { RoomView } from "@/game/room";
import { STARTING_CHIPS } from "@/game/rules";
import { summarizeGame } from "@/game/summary";
import { SEAT_NAMES, type Seat } from "@/game/tiles";
import { ChipsChart, ChipsTable, LineKey } from "./ChipsChart";
import { signed } from "./TableResult";
import { scoreCard } from "./scoreCard";
import { ShareScores } from "./ShareScores";

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="game-stat">
      <span className="game-stat__label">{label}</span>
      <span className="game-stat__value">{value}</span>
      <span className="game-stat__note">{note}</span>
    </div>
  );
}

/**
 * The end of the game, laid over the felt: where everyone finished, how the
 * chips moved hand by hand, and what the table will talk about afterwards.
 * Another game starts from the lobby with everyone still in their seats.
 */
export function GameComplete({
  view,
  name,
  onHide,
  onNewGame,
  busy,
}: {
  view: RoomView;
  name: (seat: Seat) => string;
  onHide: () => void;
  onNewGame: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const summary = summarizeGame(view.history);
  const { standings, place, chips, wins } = summary;
  const final = (seat: Seat) => chips[seat][chips[seat].length - 1];
  const card = scoreCard(view, name);

  return (
    <div className="result-sheet">
      <section
        className="result-sheet__card game-over"
        role="dialog"
        aria-modal="false"
        aria-label="Game complete"
      >
        <header className="result-sheet__head">
          <div className="result-sheet__heading-block">
            <span className="result-sheet__kicker">{card.kicker}</span>
            <h2 className="result-sheet__title">{card.title}</h2>
          </div>
          <div className="result-sheet__head-actions">
            <button type="button" className="btn btn--ghost" onClick={onHide}>
              See the table
            </button>
            <ShareScores view={view} name={name} className="btn btn--ghost" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              title="Everyone keeps their seat; the chips go back to the start"
              onClick={onNewGame}
            >
              New game
            </button>
          </div>
        </header>

        <div className="game-over__body">
          <div className="game-over__side">
            <section className="result-sheet__panel" aria-labelledby="game-standings">
              <h3 id="game-standings" className="result-sheet__heading">
                Final chips
              </h3>
              <ol className="standings">
                {standings.map((seat) => (
                  <li key={seat} className={`standings__row${place[seat] === 1 ? " standings__row--top" : ""}`}>
                    <span className="standings__place">{place[seat]}</span>
                    <LineKey seat={seat} />
                    <span className="standings__who">
                      <span className="standings__name">{name(seat)}</span>
                      <span className="standings__meta">
                        {SEAT_NAMES[seat]} · {wins[seat]} {wins[seat] === 1 ? "win" : "wins"}
                      </span>
                    </span>
                    <span className="standings__chips">
                      <span className="standings__count">{final(seat)}</span>
                      <span className="standings__delta">{signed(final(seat) - STARTING_CHIPS)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="game-over__stats">
              {card.facts.map((fact) => (
                <Stat key={fact.label} {...fact} />
              ))}
            </div>
          </div>

          <section className="result-sheet__panel game-over__chart" aria-labelledby="game-chart">
            <div className="result-sheet__panel-head">
              <h3 id="game-chart" className="result-sheet__heading">
                Chips after each hand
              </h3>
              {summary.hands === 0 ? null : (
                <div
                  className="seg seg--inline"
                  role="group"
                  aria-label="View"
                  style={{ "--seg-count": 2 } as CSSProperties}
                >
                  {(
                    [
                      ["chart", "Chart"],
                      ["table", "Hand by hand"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`seg__btn${mode === value ? " seg__btn--on" : ""}`}
                      aria-pressed={mode === value}
                      onClick={() => setMode(value)}
                    >
                      <span className="seg__label">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {summary.hands === 0 ? (
              <p className="game-over__empty">
                The game ended before a hand was finished, so everyone keeps the chips they sat down with.
              </p>
            ) : mode === "chart" ? (
              <ChipsChart history={view.history} chips={chips} name={name} />
            ) : (
              <ChipsTable history={view.history} chips={chips} name={name} />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
