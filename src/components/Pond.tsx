"use client";

import type { GameState } from "@/game/engine";
import { SEAT_NAMES, type Seat, tileGlyph } from "@/game/tiles";
import { TileFace } from "./TileView";

export function Pond({ state, order }: { state: GameState; order: Seat[] }) {
  const lastId = state.lastDiscard?.tile.id;
  return (
    <div className="pond">
      <div className="pond__center">
        <span className="pond__round">{tileGlyph(state.roundWind)}</span>
        <span className="pond__wall">{state.wall.length} tiles left</span>
      </div>

      {order.map((seat) => (
        <div className="pond__group" key={`pond-${seat}`}>
          <span className="pond__group-label">
            {SEAT_NAMES[seat]}
            {state.players[seat].isHuman ? " (you)" : ""}
          </span>
          <div className="pond__row">
            {state.players[seat].discards.length === 0 ? (
              <span className="seat__meta">—</span>
            ) : (
              state.players[seat].discards.map((t) => (
                <TileFace
                  key={t.id}
                  code={t.code}
                  size="sm"
                  justDiscarded={t.id === lastId}
                  dim={t.id !== lastId}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
