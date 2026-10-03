"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaimOption } from "@/game/engine";
import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { useAppearance } from "@/hooks/useAppearance";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useFullscreen } from "@/hooks/useFullscreen";
import { TileButton, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import type { SoundToggle } from "./TableView";
import { SettingsMenu } from "./SettingsMenu";
import { PhoneSettings } from "./PhoneSettings";
import { ClaimChoices } from "./ClaimChoices";

/**
 * The player's own view: their hand and the decisions that are theirs.
 *
 * `landscape` is the controller a phone becomes when a tablet is acting as the
 * table. The pond, the scores and everyone's melds are on the shared screen,
 * so the phone gives its whole width to the hand and the choices, held
 * sideways and full screen where the browser allows it.
 */
export function PhoneView({
  api,
  view,
  sound,
  landscape = false,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  landscape?: boolean;
}) {
  const seat = view.you.seat!;
  const me = view.players[seat];
  const coarse = useCoarsePointer();
  const appearance = useAppearance();
  const fullscreen = useFullscreen("landscape");
  // On touch a tile is armed by the first tap and thrown by the second; with a
  // mouse the click discards directly.
  const [armed, setArmed] = useState<string | null>(null);
  // The claim being pressed or hovered, whose tiles the hand lifts.
  const [preview, setPreview] = useState<ClaimOption | null>(null);
  useEffect(() => {
    // Never leave a tile armed, or a claim previewed, across a turn or a deal.
    setArmed(null);
    setPreview(null);
  }, [view.turn, view.handNumber, view.phase]);

  // The first touch asks for full screen. It cannot be asked for without one,
  // and once is enough: someone who backs out of it meant to.
  const askedFullscreen = useRef(false);
  const onFirstTouch = () => {
    if (askedFullscreen.current || !coarse || !fullscreen.supported || fullscreen.active) return;
    askedFullscreen.current = true;
    fullscreen.enter();
  };

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
  const previewed = view.claim?.options.find((o) => o.id === preview?.id);
  const using = new Set(previewed?.tileIds ?? []);

  const tileClass = (tileId: string) =>
    [armed === tileId ? "tile--armed" : "", using.has(tileId) ? "tile--uses" : ""]
      .filter(Boolean)
      .join(" ");

  let prompt: string;
  if (view.phase === "gameOver") prompt = "The round is over.";
  else if (view.phase === "handOver") prompt = "Hand finished — the table deals the next one.";
  else if (view.claim) prompt = `${SEAT_NAMES[view.lastDiscard!.from]} discarded ${tileName(view.lastDiscard!.tile.code)}`;
  else if (view.actions?.canWin) prompt = `You can win for ${view.actions.winScore?.faan} faan.`;
  else if (yourTurn) prompt = "Your turn — discard a tile.";
  else prompt = `Waiting for ${SEAT_NAMES[view.turn]}…`;

  return (
    <div
      className={landscape ? "phone phone--landscape" : "phone"}
      onPointerDownCapture={landscape ? onFirstTouch : undefined}
    >
      <header className="phone__bar">
        <span className="phone__seat">
          <span className="phone__wind" aria-hidden>
            {tileGlyph(seatWind(seat))}
          </span>
          {SEAT_NAMES[seat]}
          {view.dealer === seat ? " · dealer" : ""}
        </span>
        <span className="phone__score">
          {view.scores[seat] > 0 ? `+${view.scores[seat]}` : view.scores[seat]}
        </span>
        <span className="phone__wall">{view.wallCount} left</span>
        {landscape && fullscreen.supported && !fullscreen.active ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={fullscreen.enter}>
            Full screen
          </button>
        ) : null}
        {sound ? (
          <SettingsMenu>
            <PhoneSettings
              sound={sound}
              config={view.config}
              appearance={appearance}
              fullscreenHint={landscape && !fullscreen.supported}
            />
          </SettingsMenu>
        ) : null}
      </header>

      <p className={`phone__prompt${yourTurn || view.claim ? " phone__prompt--live" : ""}`}>
        {prompt}
      </p>

      {/* The shared screen already shows the pond; only a phone standing in
          for the whole table needs the last discard. */}
      {!landscape && view.lastDiscard ? (
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
            className={tileClass(t.id)}
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
              className={tileClass(drawn.id)}
              disabled={!yourTurn || api.busy}
              onClick={() => tapTile(drawn.id)}
            />
          </>
        ) : null}
      </div>

      <div className="phone__controls">
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
          {view.claim && view.lastDiscard ? (
            <ClaimChoices
              options={view.claim.options}
              discard={view.lastDiscard.tile.code}
              deadlineIn={view.claim.deadlineIn}
              busy={api.busy}
              onClaim={(optionId) => {
                setPreview(null);
                void api.act({ type: "claim", optionId });
              }}
              onPreview={setPreview}
            />
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
                  {kong.kind === "concealed" ? "Kong" : "Add to kong"}
                  <span className="btn__preview">
                    <TileFace code={kong.code} size="sm" />
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
