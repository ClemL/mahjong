"use client";

import type { GameState } from "@/game/engine";
import { claimingSeats } from "@/game/controller";
import { SEAT_NAMES, type Seat, type Tile, tileGlyph, seatWind } from "@/game/tiles";
import { bonusTileScores } from "@/game/scoring";
import type { Meld } from "@/game/melds";
import { TileBack, TileFace } from "./TileView";

const MELD_TAG: Record<Meld["type"], string> = {
  chow: "Chow 上",
  pung: "Pung 碰",
  kong: "Kong 槓",
};

/**
 * One laid-open set. `fresh` marks the set just made from the newest discard:
 * its tiles gather in from the hand, the claimed one lands last, and the set
 * keeps a named tag until the next tile is thrown so a glance shows who took
 * what.
 */
export function MeldRow({ meld, fresh = false }: { meld: Meld; fresh?: boolean }) {
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
    <span className={fresh ? "meld meld--fresh" : "meld"}>
      {fresh ? (
        <span className="meld__tag" aria-hidden>
          {MELD_TAG[meld.type]}
        </span>
      ) : null}
      {meld.tiles.map((t) => {
        const taken = t.id === meld.claimedTileId;
        return (
          <TileFace
            key={t.id}
            code={t.code}
            size="sm"
            entry={taken ? "claim" : null}
            className={fresh ? (taken ? "meld__taken" : "meld__gathered") : ""}
          />
        );
      })}
    </span>
  );
}

/**
 * The class that ghosts a bonus tile which would add nothing to its owner's
 * win — someone else's flower that only came along with the draw.
 */
export function bonusClass(code: Tile["code"], owner: { seat: Seat; flowers: Tile[] }): string {
  const held = owner.flowers.map((t) => t.code);
  return bonusTileScores(code, owner.seat, held) ? "" : "tile--idle";
}

/** Whether a meld was just made from this discard. */
export function isFreshClaim(meld: Meld, lastPlayedId: string | undefined): boolean {
  return lastPlayedId !== undefined && meld.claimedTileId === lastPlayedId;
}

interface Props {
  state: GameState;
  seat: Seat;
}

export function SeatPanel({ state, seat }: Props) {
  const player = state.players[seat];
  const isTurn = state.turn === seat && state.phase === "action";
  const isClaiming = claimingSeats(state).includes(seat);
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
            <TileFace key={t.id} code={t.code} size="sm" className={bonusClass(t.code, player)} />
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
