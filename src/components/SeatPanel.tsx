"use client";

import type { GameState } from "@/game/engine";
import { SEAT_NAMES, type Seat, tileGlyph, seatWind } from "@/game/tiles";
import type { Meld } from "@/game/melds";
import { TileBack, TileFace } from "./TileView";

export function MeldRow({ meld }: { meld: Meld }) {
  // A concealed kong is shown face down on the ends, as it is on a real table.
  if (meld.type === "kong" && meld.concealed) {
    return (
      <span className="meld">
        <TileBack size="sm" />
        <TileFace code={meld.tiles[1].code} size="sm" />
        <TileFace code={meld.tiles[2].code} size="sm" />
        <TileBack size="sm" />
      </span>
    );
  }
  return (
    <span className="meld">
      {meld.tiles.map((t) => (
        <TileFace key={t.id} code={t.code} size="sm" />
      ))}
    </span>
  );
}

interface Props {
  state: GameState;
  seat: Seat;
}

export function SeatPanel({ state, seat }: Props) {
  const player = state.players[seat];
  const isTurn = state.turn === seat && state.phase === "action";
  const isClaiming = state.pendingClaims.some((c) => c.seat === seat);
  const score = state.scores[seat];

  return (
    <section
      className={[
        "seat",
        isTurn ? "seat--active" : "",
        isClaiming ? "seat--claiming" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${SEAT_NAMES[seat]} seat`}
    >
      <header className="seat__head">
        <span className="seat__wind">{tileGlyph(seatWind(seat))}</span>
        <span className="seat__name">{SEAT_NAMES[seat]}</span>
        {state.dealer === seat ? <span className="seat__badge">Dealer</span> : null}
        <span
          className={[
            "seat__score",
            score > 0 ? "seat__score--pos" : "",
            score < 0 ? "seat__score--neg" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {score > 0 ? `+${score}` : score}
        </span>
      </header>

      <div className="seat__row" aria-label={`${player.hand.length} concealed tiles`}>
        {player.hand.map((t) => (
          <TileBack key={t.id} size="sm" />
        ))}
      </div>

      {player.melds.length > 0 ? (
        <div className="seat__row">
          {player.melds.map((m, i) => (
            <MeldRow key={`${seat}-meld-${i}`} meld={m} />
          ))}
        </div>
      ) : null}

      {player.flowers.length > 0 ? (
        <div className="seat__row">
          {player.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" />
          ))}
        </div>
      ) : null}

      <div className="seat__meta">
        {player.hand.length} in hand · {player.discards.length} discarded
        {isClaiming ? " · deciding…" : ""}
      </div>
    </section>
  );
}
