"use client";

import { useMemo, useRef } from "react";
import type { MahjongApi } from "@/hooks/useMahjong";
import { useFlip } from "@/hooks/useFlip";
import type { GameState } from "@/game/engine";
import { type Wait, bestReadyDiscard, liveTiles, standingWaits } from "@/game/waits";
import { SEAT_NAMES, type Seat, tileName } from "@/game/tiles";
import { TileBack, TileButton, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";

function claimLabel(type: string): string {
  switch (type) {
    case "chow":
      return "Chow 上";
    case "pung":
      return "Pung 碰";
    case "kong":
      return "Kong 槓";
    default:
      return "Win 糊";
  }
}

/** What the hand is waiting on, worked out from what the player can see. */
function useWaitsHint(state: GameState | null, seat: Seat, myTurn: boolean, enabled: boolean) {
  return useMemo(() => {
    if (!state || !enabled || (state.phase !== "action" && state.phase !== "claiming")) return null;
    const me = state.players[seat];
    if (myTurn) {
      const best = bestReadyDiscard(me.hand, me.melds, state.players);
      return best ? { throw: best.tile.code, waits: best.waits } : null;
    }
    const waits = standingWaits(me.hand, me.melds, state.players);
    return waits.length > 0 ? { throw: null, waits } : null;
  }, [state, seat, myTurn, enabled]);
}

function tilesCount(n: number): string {
  return n === 1 ? "1 tile" : `${n} tiles`;
}

/** The winning tiles, each with how many are still out there to be drawn or thrown. */
function WaitList({ waits }: { waits: Wait[] }) {
  return (
    <span className="waits">
      {waits.map((w) => (
        <span
          key={w.code}
          className={w.left === 0 ? "waits__tile waits__tile--dead" : "waits__tile"}
          title={`${tileName(w.code)}: ${w.left} left`}
        >
          <TileFace code={w.code} size="sm" />
          <span className="waits__left" aria-hidden>
            ×{w.left}
          </span>
          <span className="sr-only">
            {tileName(w.code)}, {w.left} left
          </span>
        </span>
      ))}
    </span>
  );
}

export function PlayerHand({
  api,
  showSets = false,
}: {
  api: MahjongApi;
  /** Lay your sets and flowers out here too, when no rack of yours is on screen. */
  showSets?: boolean;
}) {
  const { state, humanSeat, actions, claimOptions, awaitingClaim, readyDiscards, dealing } = api;
  const row = useRef<HTMLDivElement>(null);
  useFlip(row);
  const hint = useWaitsHint(state, humanSeat, actions.canDiscard, api.showHints && !dealing);
  if (!state) return null;
  const me = state.players[humanSeat];
  const drawn = me.hand.find((t) => t.id === state.drawnTileId);
  const rest = me.hand.filter((t) => t.id !== state.drawnTileId);
  const discardTile = state.lastDiscard?.tile;

  let prompt: string;
  let muted = false;
  if (dealing) {
    prompt = "Dealing…";
    muted = true;
  } else if (state.phase === "gameOver") {
    prompt = "The game is over.";
    muted = true;
  } else if (state.phase === "handOver") {
    prompt = "Hand finished.";
    muted = true;
  } else if (awaitingClaim && discardTile) {
    prompt = `${SEAT_NAMES[state.lastDiscard!.from]} discarded ${tileName(discardTile.code)} — claim it?`;
  } else if (actions.canWin) {
    prompt = `You can declare a win for ${actions.winScore?.faan} faan.`;
  } else if (actions.canDiscard) {
    prompt = "Your turn — choose a tile to discard.";
  } else {
    prompt = "Waiting for the other players…";
    muted = true;
  }

  return (
    <section className="hand" aria-label="Your hand">
      <div className={`hand__prompt${muted ? " hand__prompt--muted" : ""}`}>{prompt}</div>

      {showSets && (me.melds.length > 0 || me.flowers.length > 0) && (
        <div className="seat__row">
          {me.melds.map((m, i) => (
            <MeldRow key={`my-meld-${i}`} meld={m} />
          ))}
          {me.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" />
          ))}
        </div>
      )}

      {/* Your tiles stay face down until the deal has reached you. */}
      <div className="hand__tiles" ref={row}>
        {dealing
          ? me.hand.map((t) => <TileBack key={t.id} size="lg" />)
          : rest.map((t) => (
              <TileButton
                key={t.id}
                tileId={t.id}
                code={t.code}
                size="lg"
                ready={readyDiscards.has(t.id)}
                disabled={!actions.canDiscard}
                onClick={() => api.discard(t.id)}
              />
            ))}
        {drawn && !dealing ? (
          <>
            <span className="hand__gap" aria-hidden />
            <TileButton
              tileId={drawn.id}
              code={drawn.code}
              size="lg"
              drawn
              entry="draw"
              ready={readyDiscards.has(drawn.id)}
              disabled={!actions.canDiscard}
              onClick={() => api.discard(drawn.id)}
            />
          </>
        ) : null}
      </div>

      <div className="actions">
        {awaitingClaim ? (
          <>
            {claimOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.type === "win" ? "btn btn--win" : "btn btn--primary"}
                onClick={() => api.claim(option.id)}
              >
                {claimLabel(option.type)}
                <span className="btn__preview">
                  {option.type !== "win" &&
                    option.codes.map((code, i) => (
                      <TileFace key={`${option.id}-${code}-${i}`} code={code} size="sm" />
                    ))}
                </span>
              </button>
            ))}
            <button type="button" className="btn btn--ghost" onClick={api.pass}>
              Pass
            </button>
          </>
        ) : (
          <>
            {actions.canWin ? (
              <button type="button" className="btn btn--win" onClick={api.declareWin}>
                Declare win 自摸 · {actions.winScore?.faan} faan
              </button>
            ) : null}
            {actions.kongs.map((kong) => (
              <button
                key={`${kong.kind}-${kong.code}`}
                type="button"
                className="btn btn--primary"
                onClick={() => api.declareKong(kong)}
              >
                {kong.kind === "concealed" ? "Concealed kong" : "Add to kong"}
                <span className="btn__preview">
                  <TileFace code={kong.code} size="sm" />
                </span>
              </button>
            ))}
            {hint && !actions.canWin ? (
              <span className="waits__line">
                <span className="seat__meta">
                  {hint.throw
                    ? `Throw ${tileName(hint.throw)} to be ready on ${tilesCount(liveTiles(hint.waits))}:`
                    : liveTiles(hint.waits) > 0
                      ? `Ready — ${tilesCount(liveTiles(hint.waits))} left to win on:`
                      : "Ready, but every tile you need is already out:"}
                </span>
                <WaitList waits={hint.waits} />
              </span>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
