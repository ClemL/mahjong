"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, tileName } from "@/game/tiles";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { TileButton, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import type { SoundToggle } from "./TableView";

function claimLabel(type: string): string {
  return type === "chow" ? "Chow 上" : type === "pung" ? "Pung 碰" : type === "kong" ? "Kong 槓" : "Win 糊";
}

/**
 * The player's own view. When a table device is present this is all a phone
 * shows — your hand and the decisions that are yours — because the shared
 * screen is already carrying the pond, the scores and everyone's melds.
 */
export function PhoneView({
  api,
  view,
  sound,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
}) {
  const seat = view.you.seat!;
  const me = view.players[seat];
  const coarse = useCoarsePointer();
  // On touch a tile is armed by the first tap and thrown by the second; with a
  // mouse the click discards directly.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    // Never leave a tile armed across a turn or a new deal.
    setArmed(null);
  }, [view.turn, view.handNumber, view.phase]);

  const tapTile = (tileId: string) => {
    if (!coarse) {
      void api.act({ type: "discard", tileId });
      return;
    }
    if (armed === tileId) {
      setArmed(null);
      void api.act({ type: "discard", tileId });
    } else {
      setArmed(tileId);
    }
  };
  const armedTile = me.hand.find((t) => t.id === armed);
  const yourTurn = view.turn === seat && view.phase === "action" && view.actions?.canDiscard;
  const drawn = me.hand.find((t) => t.id === view.drawnTileId);
  const rest = me.hand.filter((t) => t.id !== view.drawnTileId);

  let prompt: string;
  if (view.phase === "gameOver") prompt = "The round is over.";
  else if (view.phase === "handOver") prompt = "Hand finished — the table deals the next one.";
  else if (view.claim) prompt = `${SEAT_NAMES[view.lastDiscard!.from]} discarded ${tileName(view.lastDiscard!.tile.code)}`;
  else if (view.actions?.canWin) prompt = `You can win for ${view.actions.winScore?.faan} faan.`;
  else if (yourTurn) prompt = "Your turn — discard a tile.";
  else prompt = `Waiting for ${SEAT_NAMES[view.turn]}…`;

  return (
    <div className="phone">
      <header className="phone__bar">
        <span className="phone__seat">
          {SEAT_NAMES[seat]}
          {view.dealer === seat ? " · dealer" : ""}
        </span>
        <span className="phone__score">
          {view.scores[seat] > 0 ? `+${view.scores[seat]}` : view.scores[seat]}
        </span>
        <span className="phone__wall">{view.wallCount} left</span>
        {sound ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-label={sound.muted ? "Unmute" : "Mute"}
            aria-pressed={!sound.muted}
            onClick={() => sound.setMuted(!sound.muted)}
          >
            {sound.muted ? "🔇" : "🔊"}
          </button>
        ) : null}
      </header>

      <p className={`phone__prompt${yourTurn || view.claim ? " phone__prompt--live" : ""}`}>
        {prompt}
      </p>

      {view.lastDiscard ? (
        <div className="phone__discard">
          <span className="seat__meta">Last discard</span>
          <TileFace code={view.lastDiscard.tile.code} size="md" />
        </div>
      ) : null}

      {me.melds.length > 0 || me.flowers.length > 0 ? (
        <div className="seat__row phone__melds">
          {me.melds.map((m, i) => (
            <MeldRow key={`m${i}`} meld={m} />
          ))}
          {me.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" />
          ))}
        </div>
      ) : null}

      <div className="phone__hand">
        {rest.map((t) => (
          <TileButton
            key={t.id}
            code={t.code}
            size="lg"
            className={armed === t.id ? "tile--armed" : ""}
            disabled={!yourTurn || api.busy}
            onClick={() => tapTile(t.id)}
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
              className={armed === drawn.id ? "tile--armed" : ""}
              disabled={!yourTurn || api.busy}
              onClick={() => tapTile(drawn.id)}
            />
          </>
        ) : null}
      </div>

      {armedTile && yourTurn ? (
        <div className="confirm-bar" role="status">
          <span className="confirm-bar__text">Discard {tileName(armedTile.code)}?</span>
          <button
            type="button"
            className="btn btn--win"
            disabled={api.busy}
            onClick={() => {
              setArmed(null);
              void api.act({ type: "discard", tileId: armedTile.id });
            }}
          >
            Discard
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setArmed(null)}>
            Keep
          </button>
        </div>
      ) : null}

      <div className="actions phone__actions">
        {view.claim ? (
          <>
            {view.claim.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.type === "win" ? "btn btn--win" : "btn btn--primary"}
                disabled={api.busy}
                onClick={() => void api.act({ type: "claim", optionId: option.id })}
              >
                {claimLabel(option.type)}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={api.busy}
              onClick={() => void api.act({ type: "claim", optionId: null })}
            >
              Pass
            </button>
            <span className="seat__meta">
              {Math.ceil(view.claim.deadlineIn / 1000)}s
            </span>
          </>
        ) : (
          <>
            {view.actions?.canWin ? (
              <button
                type="button"
                className="btn btn--win"
                disabled={api.busy}
                onClick={() => void api.act({ type: "win" })}
              >
                Win 自摸
              </button>
            ) : null}
            {(view.actions?.kongs ?? []).map((kong) => (
              <button
                key={`${kong.kind}-${kong.code}`}
                type="button"
                className="btn btn--primary"
                disabled={api.busy}
                onClick={() => void api.act({ type: "kong", kind: kong.kind, code: kong.code })}
              >
                Kong {tileName(kong.code)}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
