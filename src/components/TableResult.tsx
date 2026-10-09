"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PublicPlayer, RoomView } from "@/game/room";
import type { ScoreResult } from "@/game/scoring";
import { arrangeWinningHand } from "@/game/winning";
import { type Seat, isFlower } from "@/game/tiles";
import { TileFace } from "./TileView";
import { MeldRow, bonusClass } from "./SeatPanel";
import { FaanBreakdown } from "./FaanBreakdown";
import { ChipStack, chipsOf } from "./TableEffects";

const SEATS: Seat[] = [0, 1, 2, 3];

const SET_NAME = { chow: "Chow", pung: "Pung", kong: "Kong" } as const;

/** One set of the winning hand, with what it is written under it. */
function Group({ label, order, children }: { label: string; order: number; children: ReactNode }) {
  return (
    <span className="result-hand__group" style={{ "--i": order } as CSSProperties}>
      {children}
      <span className="result-hand__label">{label}</span>
    </span>
  );
}

/**
 * The winning hand laid out the way it is claimed: the sets already laid open,
 * then the concealed tiles split into their sets of three and the pair, then
 * any flowers.
 */
export function WinningHand({ player, score }: { player: PublicPlayer; score: ScoreResult | null }) {
  const concealed = player.hand.map((t) => t.code).filter((code) => code !== "back" && !isFlower(code));
  const preferChows = score?.patterns.some((p) => p.key === "allChows") ?? false;
  const layout = arrangeWinningHand(concealed, player.melds, preferChows);
  // A limit hand is turned over set by set, the way it would be laid down to
  // a silent table.
  let order = 0;
  return (
    <div
      className={score?.limitReached ? "result-hand result-hand--reveal" : "result-hand"}
      aria-label="Winning hand"
    >
      {player.melds.map((meld, i) => (
        <Group
          key={`m${i}`}
          order={order++}
          label={`${SET_NAME[meld.type]}${meld.concealed ? "" : " · claimed"}`}
        >
          <MeldRow meld={meld} />
        </Group>
      ))}
      {layout.sets.map((set, i) => (
        <Group key={`s${i}`} order={order++} label={SET_NAME[set.type]}>
          <span className="meld">
            {set.codes.map((code, k) => (
              <TileFace key={k} code={code} size="sm" />
            ))}
          </span>
        </Group>
      ))}
      {layout.pair ? (
        <Group order={order++} label="Pair">
          <span className="meld">
            <TileFace code={layout.pair} size="sm" />
            <TileFace code={layout.pair} size="sm" />
          </span>
        </Group>
      ) : null}
      {layout.loose.length > 0 ? (
        <Group order={order++} label={score?.patterns[0]?.name ?? "Hand"}>
          <span className="meld">
            {layout.loose.map((code, k) => (
              <TileFace key={k} code={code} size="sm" />
            ))}
          </span>
        </Group>
      ) : null}
      {player.flowers.length > 0 ? (
        <Group order={order++} label="Flowers">
          <span className="meld">
            {player.flowers.map((t) => (
              <TileFace key={t.id} code={t.code} size="sm" className={bonusClass(t.code, player)} />
            ))}
          </span>
        </Group>
      ) : null}
    </div>
  );
}

/**
 * The end of a hand, laid over the felt rather than squeezed into the middle
 * of it: who won and how, the winning hand in its sets, the faan it scored,
 * what every seat paid, and the way on to the next hand. The felt shows
 * through, so the hands turned up on the racks are still there to look at,
 * and it can be put aside to look at them properly.
 */
export function TableResult({
  view,
  name,
  tile,
  onHide,
  onNextHand,
  busy,
}: {
  view: RoomView;
  name: (seat: Seat) => string;
  /** The size the tiles in it are drawn at. */
  tile: number;
  onHide: () => void;
  onNextHand: () => void;
  busy: boolean;
}) {
  const result = view.result;
  if (!result) return null;
  const won = result.type === "win" && result.winner !== null ? result : null;
  const score = won?.score ?? null;
  const style = { "--tile-sm": `${tile}px` } as CSSProperties;

  return (
    <div className="result-sheet" style={style}>
      <section className="result-sheet__card" role="dialog" aria-modal="false" aria-label="Hand result">
        <header className="result-sheet__head">
          <div>
            <h2 className="result-sheet__title">
              {won ? `${name(won.winner!)} wins 食糊` : "Washed-out hand 流局"}
            </h2>
            <p className="result-sheet__subtitle">
              {won
                ? [
                    won.from === null ? "Self-drawn 自摸" : `Off ${name(won.from)}'s discard`,
                    score ? `${score.scoredFaan} faan` : null,
                    `+${won.payments[won.winner!]} chips`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "The wall ran out before anyone went out. Nobody pays."}
            </p>
          </div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onHide}>
            See the table
          </button>
        </header>

        {won ? <WinningHand player={view.players[won.winner!]} score={score} /> : null}

        <div className="result-sheet__columns">
          {score ? (
            <div className="result-sheet__col">
              <h3 className="result-sheet__heading">Faan</h3>
              <FaanBreakdown score={score} />
            </div>
          ) : null}
          <div className="result-sheet__col">
            <h3 className="result-sheet__heading">Chips</h3>
            <ul className="result-chips" aria-label="Chips">
              {SEATS.map((seat) => {
                const paid = result.payments[seat] ?? 0;
                return (
                  <li
                    key={seat}
                    className={`result-chips__row${won?.winner === seat ? " result-chips__row--winner" : ""}`}
                  >
                    <span className="result-chips__name">{name(seat)}</span>
                    <span
                      className={`result-chips__delta${paid > 0 ? " result-chips__delta--up" : paid < 0 ? " result-chips__delta--down" : ""}`}
                    >
                      {paid > 0 ? `+${paid}` : paid < 0 ? paid : "—"}
                    </span>
                    <ChipStack count={chipsOf(view.scores[seat])} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <footer className="result-sheet__actions">
          {view.phase === "handOver" ? (
            <>
              <span className="seat__meta">
                {result.dealerKeeps ? `${name(view.dealer)} deals again` : "The deal moves on"}
              </span>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={onNextHand}
              >
                Next hand
              </button>
            </>
          ) : (
            <span className="seat__meta">Game complete — Restart to play again</span>
          )}
        </footer>
      </section>
    </div>
  );
}
