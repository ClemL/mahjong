"use client";

import { ACHIEVEMENTS } from "@/game/achievements";
import type { RoomView } from "@/game/room";
import { type Seat, roundName, seatWind, tileGlyph } from "@/game/tiles";
import { chipsOf } from "./TableEffects";
import { standings } from "./TableSide";

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/** A change in chips, signed, with a true minus. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** How many of the latest hands the phone lists, newest first. */
const RECENT_HANDS = 8;

/**
 * The screen past everyone's discards: where the chips stand, what each hand
 * did to yours, and the achievements — yours earned and still to earn, and the
 * ones the others have picked up. Nothing here is a decision, so it can take
 * the whole screen under the header; the move coming to you brings the hand
 * straight back.
 */
export function PhoneSummary({
  view,
  you,
  nameOf,
  onClose,
}: {
  view: RoomView;
  you: Seat;
  nameOf: (seat: Seat) => string;
  onClose: () => void;
}) {
  const seats = [0, 1, 2, 3].map((step) => ((you + step) % 4) as Seat);
  const place = standings(view.scores);
  const last = view.history.at(-1) ?? null;
  const mine = view.history.map((h) => ({ hand: h.handNumber, change: h.payments[you] ?? 0, won: h.winner === you }));
  const wins = mine.filter((h) => h.won).length;
  const best = mine.reduce((top, h) => Math.max(top, h.change), 0);
  const recent = mine.slice(-RECENT_HANDS).reverse();

  const on = view.settings.achievements !== false;
  const earned = view.achievements.filter((a) => a.seat === you);
  const earnedIds = new Set(earned.map((a) => a.id));
  const handOf = new Map(earned.map((a) => [a.id, a.hand]));
  const others = view.achievements.filter((a) => a.seat !== you).slice(-4).reverse();

  return (
    <section className="minipond minipond--sheet phone-summary" aria-label="Chips and achievements">
      <header className="minipond__head">
        <h2 className="minipond__title">Chips &amp; achievements</h2>
        <span className="phone-summary__round">
          {roundName(view.roundWind)} round · hand {view.handNumber}
        </span>
        <button type="button" className="minipond__close" aria-label="Close chips and achievements" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="phone-summary__body">
        <div className="phone-summary__col">
          <table className="phone-summary__board">
            <caption className="sr-only">Chips, starting with you and going round in the order of play</caption>
            <thead>
              <tr>
                <th scope="col">Seat</th>
                <th scope="col" className="phone-summary__num">
                  Chips
                </th>
                {last ? (
                  <>
                    <th scope="col" className="phone-summary__num">
                      Last hand
                    </th>
                    <th scope="col" className="phone-summary__num">
                      Place
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {seats.map((seat) => {
                const change = last ? (last.payments[seat] ?? 0) : null;
                return (
                  <tr key={seat} className={seat === you ? "phone-summary__row--you" : undefined}>
                    <th scope="row">
                      <span className="phone-summary__wind" aria-hidden>
                        {tileGlyph(seatWind(seat))}
                      </span>{" "}
                      {seat === you ? "You" : nameOf(seat)}
                    </th>
                    <td className="phone-summary__num phone-summary__chips">{chipsOf(view.scores[seat])}</td>
                    {change !== null ? (
                      <>
                        <td
                          className={`phone-summary__num${change > 0 ? " phone-summary__up" : change < 0 ? " phone-summary__down" : ""}`}
                        >
                          {signed(change)}
                        </td>
                        <td className="phone-summary__num">{ORDINALS[place[seat]]}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mine.length > 0 ? (
            <>
              <p className="phone-summary__line">
                You have won {wins} of {mine.length} {mine.length === 1 ? "hand" : "hands"}
                {best > 0 ? `; your best took ${signed(best)}` : ""}.
              </p>
              <ol className="phone-summary__hands" aria-label="Your chips, hand by hand, newest first">
                {recent.map((h) => (
                  <li
                    key={h.hand}
                    className={`phone-summary__hand${h.change > 0 ? " phone-summary__up" : h.change < 0 ? " phone-summary__down" : ""}`}
                  >
                    <span className="phone-summary__hand-no">Hand {h.hand}</span>
                    <span className="phone-summary__hand-change">
                      {signed(h.change)}
                      {h.won ? " · won" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="phone-summary__line">No hand has been settled yet.</p>
          )}
        </div>

        <div className="phone-summary__col">
          {on ? (
            <>
              <h3 className="phone-summary__title">
                Your achievements · {earnedIds.size} of {ACHIEVEMENTS.length}
              </h3>
              <ul className="phone-summary__badges">
                {ACHIEVEMENTS.map((a) => {
                  const got = earnedIds.has(a.id);
                  return (
                    <li key={a.id} className={got ? "phone-summary__badge phone-summary__badge--got" : "phone-summary__badge"}>
                      <span className="phone-summary__badge-icon" aria-hidden>
                        {a.icon}
                      </span>
                      <span className="phone-summary__badge-text">
                        <span className="phone-summary__badge-title">{a.title}</span>
                        <span className="phone-summary__badge-detail">
                          {got ? `Earned in hand ${handOf.get(a.id)}` : a.detail}
                        </span>
                      </span>
                      <span className="sr-only">{got ? ", earned" : ", not yet"}</span>
                    </li>
                  );
                })}
              </ul>
              {others.length > 0 ? (
                <>
                  <h3 className="phone-summary__title">Lately at the table</h3>
                  <ul className="phone-summary__others">
                    {others.map((a, i) => {
                      const info = ACHIEVEMENTS.find((x) => x.id === a.id)!;
                      return (
                        <li key={`${a.seat}-${a.id}-${i}`}>
                          <span aria-hidden>{info.icon}</span> {a.name} earned <strong>{info.title}</strong> in hand{" "}
                          {a.hand}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="phone-summary__line">This table plays without achievements.</p>
          )}
        </div>
      </div>
    </section>
  );
}
