"use client";

import type { GameState } from "@/game/engine";
import { SEAT_NAMES, type Seat } from "@/game/tiles";
import { TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";

interface Props {
  state: GameState;
  onNextHand: () => void;
  onNewGame: () => void;
}

function Standings({ scores }: { scores: number[] }) {
  const order = ([0, 1, 2, 3] as Seat[]).slice().sort((a, b) => scores[b] - scores[a]);
  return (
    <div className="scores">
      {order.map((seat, i) => (
        <div className="scores__row" key={`final-${seat}`}>
          <span className="scores__name">
            {i + 1}. {SEAT_NAMES[seat]}
          </span>
          <span className="scores__value">
            {scores[seat] > 0 ? `+${scores[seat]}` : scores[seat]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResultModal({ state, onNextHand, onNewGame }: Props) {
  if (state.phase === "gameOver") {
    return (
      <div className="modal__backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Round complete">
          <h2 className="modal__title">East round complete</h2>
          <p className="modal__subtitle">Four dealerships played.</p>
          <Standings scores={state.scores} />
          <div className="actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" onClick={onNewGame}>
              New game
            </button>
          </div>
        </div>
      </div>
    );
  }

  const result = state.result;
  if (state.phase !== "handOver" || !result) return null;

  const winner = result.winner;
  const winnerPlayer = winner !== null ? state.players[winner] : null;

  return (
    <div className="modal__backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Hand result">
        {result.type === "washout" ? (
          <>
            <h2 className="modal__title">Washed-out hand 流局</h2>
            <p className="modal__subtitle">
              The wall ran out before anyone went out. Nobody pays; the dealership passes.
            </p>
          </>
        ) : (
          <>
            <h2 className="modal__title">
              {winnerPlayer?.isHuman ? "You win" : `${SEAT_NAMES[winner!]} wins`} 食糊
            </h2>
            <p className="modal__subtitle">
              {result.from === null
                ? "Self-drawn 自摸"
                : `On ${SEAT_NAMES[result.from]}'s discard`}
              {" · "}
              {result.score!.faan} faan
              {result.score!.faan > result.score!.scoredFaan
                ? ` (capped at ${result.score!.scoredFaan})`
                : ""}
              {" · "}
              {result.score!.value} points
            </p>
          </>
        )}

        {winnerPlayer ? (
          <div className="modal__tiles">
            {winnerPlayer.melds.map((m, i) => (
              <MeldRow key={`win-meld-${i}`} meld={m} />
            ))}
            {winnerPlayer.hand.map((t) => (
              <TileFace key={t.id} code={t.code} size="sm" />
            ))}
            {winnerPlayer.flowers.length > 0 ? (
              <span className="meld">
                {winnerPlayer.flowers.map((t) => (
                  <TileFace key={t.id} code={t.code} size="sm" />
                ))}
              </span>
            ) : null}
          </div>
        ) : null}

        {result.score ? (
          <table className="faan-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Faan</th>
              </tr>
            </thead>
            <tbody>
              {result.score.patterns.map((p, i) => (
                <tr key={`${p.key}-${i}`}>
                  <td>
                    {p.chinese} · {p.name}
                  </td>
                  <td>{p.faan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {result.score ? (
          <div className="modal__total">
            <span>Total</span>
            <span>
              {result.score.scoredFaan} faan → {result.score.value} points each payer
            </span>
          </div>
        ) : null}

        <div className="modal__payments">
          {result.payments.map((delta, seat) => (
            <span
              key={`pay-${seat}`}
              className={`chip ${delta > 0 ? "chip--pos" : delta < 0 ? "chip--neg" : ""}`}
            >
              {SEAT_NAMES[seat]} {delta > 0 ? `+${delta}` : delta}
            </span>
          ))}
        </div>

        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onNextHand}>
            {result.dealerKeeps ? "Next hand (dealer keeps)" : "Next hand"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onNewGame}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
