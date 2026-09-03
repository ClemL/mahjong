"use client";

import type { MahjongApi } from "@/hooks/useMahjong";
import { SEAT_NAMES, tileName } from "@/game/tiles";
import { TileButton, TileFace } from "./TileView";
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

export function PlayerHand({ api }: { api: MahjongApi }) {
  const { state, humanSeat, actions, claimOptions, awaitingClaim, readyDiscards } = api;
  if (!state) return null;
  const me = state.players[humanSeat];
  const drawn = me.hand.find((t) => t.id === state.drawnTileId);
  const rest = me.hand.filter((t) => t.id !== state.drawnTileId);
  const discardTile = state.lastDiscard?.tile;

  let prompt: string;
  let muted = false;
  if (state.phase === "gameOver") {
    prompt = "The round is over.";
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

      {(me.melds.length > 0 || me.flowers.length > 0) && (
        <div className="seat__row">
          {me.melds.map((m, i) => (
            <MeldRow key={`my-meld-${i}`} meld={m} />
          ))}
          {me.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" />
          ))}
        </div>
      )}

      <div className="hand__tiles">
        {rest.map((t) => (
          <TileButton
            key={t.id}
            code={t.code}
            size="lg"
            ready={readyDiscards.has(t.id)}
            disabled={!actions.canDiscard}
            onClick={() => api.discard(t.id)}
          />
        ))}
        {drawn ? (
          <>
            <span className="hand__gap" aria-hidden />
            <TileButton
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
            {actions.canDiscard && actions.waits.length > 0 && !actions.canWin ? (
              <span className="seat__meta">
                Ready — waiting on{" "}
                {actions.waits.map((c) => tileName(c)).join(", ")}
              </span>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
