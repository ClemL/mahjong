"use client";

import type { RoomView } from "@/game/room";
import { summarizeGame } from "@/game/summary";
import { type Seat, tileName } from "@/game/tiles";
import { chipsOf } from "./TableEffects";
import { WinningHand, isLastHand, joinNames, signed, winnersOf, winningTile, youFirst } from "./TableResult";
import { endedEarly } from "./scoreCard";
import { ShareScores } from "./ShareScores";

const SEATS: Seat[] = [0, 1, 2, 3];

/** Why this hand cost you what it did, or paid you what it did, in one sentence. */
function yourShare(view: RoomView, seat: Seat, nameOf: (s: Seat) => string): string {
  const result = view.result!;
  if (result.type !== "win" || result.winner === null) {
    return "The wall ran out before anyone went out. Nobody pays.";
  }
  const { winner, from, liable } = result;
  const paid = -(result.payments[seat] ?? 0);
  const winners = winnersOf(result).map((w) => w.winner);
  if (winners.length > 1 && from !== null) {
    const both = winners.length === 2 ? "both" : "all";
    if (winners.includes(seat)) {
      return `Off ${nameOf(from)}'s discard, which ${joinNames(winners.filter((w) => w !== seat).map(nameOf))} won on too.`;
    }
    if (from === seat) return `You threw the tile ${joinNames(winners.map(nameOf))} ${both} won on, so you pay each of them.`;
    return paid > 0
      ? `${nameOf(from)} threw it; you pay half to each winner at this table.`
      : `${nameOf(from)} threw it and pays them ${both}.`;
  }
  if (winner === seat) {
    if (liable != null) return `${nameOf(liable)} fed the set that made it, so they pay it all 包.`;
    if (from === null) return "You drew it yourself, so everyone pays you.";
    return result.payments.filter((p) => p < 0).length > 1
      ? `Off ${nameOf(from)}'s discard; the other two pay half.`
      : `Off ${nameOf(from)}'s discard, and ${nameOf(from)} pays.`;
  }
  if (liable != null) {
    return seat === liable
      ? `You fed ${nameOf(winner)} the set that made it, so you pay it all 包.`
      : `${nameOf(liable)} pays it all 包, so you pay nothing.`;
  }
  if (from === null) return `${nameOf(winner)} drew it, so everyone pays the full share.`;
  if (from === seat) return "You threw the winning tile, so you pay the full share.";
  return paid > 0
    ? `${nameOf(from)} threw it; you pay half at this table.`
    : `${nameOf(from)} threw it and pays alone.`;
}

/**
 * The end of a hand on a phone, in the space above the hand: what it cost or
 * paid you and why, the winner's hand with the tile it went out on ringed,
 * the faan it scored, and where everyone's chips now stand. At the end of the
 * game, the final standings instead. The hand stays where it always is.
 */
export function PhoneResult({
  view,
  seat,
  nameOf,
  onHide,
}: {
  view: RoomView;
  seat: Seat;
  nameOf: (s: Seat) => string;
  onHide: () => void;
}) {
  const result = view.result;
  const hide = (
    <button type="button" className="btn btn--sm btn--ghost phone-result__hide" onClick={onHide}>
      Hide
    </button>
  );

  if (view.phase === "gameOver") {
    const { standings, place } = summarizeGame(view.history);
    const top = standings.filter((s) => place[s] === 1);
    return (
      <section className="phone-result phone-result--game" aria-label="Game complete">
        <div className="phone-result__you">
          <span className="phone-result__kicker">
            {endedEarly(view) ? "Game ended early" : "Game complete"} · your place
          </span>
          <span className="phone-result__big">{ordinal(place[seat])}</span>
          <span className="phone-result__chips">
            {chipsOf(view.scores[seat])} chips · {signed(view.scores[seat])}
          </span>
          <span className="phone-result__why">
            {top.length === 1 ? `${nameOf(top[0])} takes the table.` : "A shared win at the top."} The table
            can start a new game with everyone seated.
          </span>
        </div>
        <div className="phone-result__table">
          <div className="phone-result__head">
            <h2 className="phone-result__title">Final chips</h2>
            <ShareScores view={view} name={nameOf} className="btn btn--sm btn--ghost phone-result__share" />
            {hide}
          </div>
          <ol className="phone-result__rows">
            {standings.map((s) => (
              <li key={s} className={`phone-result__row${s === seat ? " phone-result__row--you" : ""}`}>
                <span className="phone-result__name">
                  {place[s]}. {nameOf(s)}
                  {s === seat ? <span className="phone-result__tag">You</span> : null}
                </span>
                <span className="phone-result__delta">{signed(view.scores[s])}</span>
                <span className="phone-result__count">{chipsOf(view.scores[s])}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  if (!result) return null;
  const won = result.type === "win" && result.winner !== null ? result : null;
  const winners = winnersOf(result);
  // Your own hand, if it was one of several that won on the tile; else the first.
  const shown = winners.find((w) => w.winner === seat) ?? winners[0];
  const delta = result.payments[seat] ?? 0;
  const code = won ? winningTile(view) : null;
  const nextDealer = (result.dealerKeeps ? view.dealer : (view.dealer + 1) % 4) as Seat;
  const ringNote =
    won && code
      ? won.from === null
        ? `The ringed tile is the ${tileName(code)} ${shown.winner === seat ? "you" : nameOf(shown.winner)} drew.`
        : `The ringed tile is the ${tileName(code)} ${won.from === seat ? "you" : nameOf(won.from)} threw.`
      : null;
  return (
    <section className="phone-result" aria-label="Hand result">
      <div className="phone-result__you">
        <span className="phone-result__kicker">Hand {view.handNumber} · your result</span>
        <span className="phone-result__line">
          <span className="phone-result__big">{signed(delta)}</span>
          <span className="phone-result__chips">
            Your chips {chipsOf(view.scores[seat] - delta)} → {chipsOf(view.scores[seat])}
          </span>
        </span>
        <span className="phone-result__why">{yourShare(view, seat, nameOf)}</span>
      </div>

      {won ? (
        <div className="phone-result__winner">
          <div className="phone-result__head">
            <h2 className="phone-result__title">
              {winners.length > 1
                ? `${joinNames(youFirst(winners, seat).map((w) => (w.winner === seat ? "You" : nameOf(w.winner))))} win`
                : won.winner === seat
                  ? "You win"
                  : `${nameOf(won.winner!)} wins`}{" "}
              <span className="phone-result__zh">食糊</span>
            </h2>
            {shown.score ? (
              <span className="phone-result__faan">
                {winners.length > 1 ? `${shown.winner === seat ? "Yours" : nameOf(shown.winner)}: ` : ""}
                {shown.score.scoredFaan} faan
              </span>
            ) : null}
          </div>
          <WinningHand
            player={view.players[shown.winner]}
            score={shown.score}
            winning={code ? { code, note: "" } : null}
            labels={false}
            shared={shown.winner !== won.winner}
          />
          {ringNote ? <span className="phone-result__note">{ringNote}</span> : null}
          {winners
            .filter((w) => w.winner !== shown.winner)
            .map((w) => (
              <span key={w.winner} className="phone-result__note">
                {w.winner === seat ? "You" : nameOf(w.winner)} won on it too
                {w.score ? ` · ${w.score.scoredFaan} faan` : ""}
              </span>
            ))}
          {shown.score ? (
            <ul className="phone-result__patterns" aria-label="Faan breakdown">
              {shown.score.patterns.map((p, i) => (
                <li key={i} className="phone-result__pattern">
                  {p.name} <strong>{p.faan}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="phone-result__table">
        <div className="phone-result__head">
          <h2 className="phone-result__title">The table</h2>
          {hide}
        </div>
        <ul className="phone-result__rows">
          {[...SEATS]
            .sort((a, b) => (result.payments[b] ?? 0) - (result.payments[a] ?? 0) || a - b)
            .map((s) => (
              <li key={s} className={`phone-result__row${s === seat ? " phone-result__row--you" : ""}`}>
                <span className="phone-result__name">
                  {nameOf(s)}
                  {s === seat ? <span className="phone-result__tag">You</span> : null}
                </span>
                <span className="phone-result__delta">{signed(result.payments[s] ?? 0)}</span>
                <span className="phone-result__count">{chipsOf(view.scores[s])}</span>
              </li>
            ))}
        </ul>
        <span className="phone-result__next">
          {isLastHand(view)
            ? "That was the last hand. The table shows the final scores next."
            : `The table deals hand ${view.handNumber + 1}. ${nameOf(nextDealer)} deals.`}
        </span>
      </div>
    </section>
  );
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}
