"use client";

import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import type { ClaimOption } from "@/game/engine";
import { MORE_TIME_MS, type RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, type Tile, type TileCode, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { useAppearance } from "@/hooks/useAppearance";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { useCountdown } from "@/hooks/useCountdown";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useHandOrder } from "@/hooks/useHandOrder";
import { useWakeLock } from "@/hooks/useWakeLock";
import { TileBack, TileButton, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import type { SoundToggle } from "./TableView";
import { SettingsMenu } from "./SettingsMenu";
import { PhoneSettings } from "./PhoneSettings";
import { CLAIM_LABEL, ClaimChoices, claimedIndex } from "./ClaimChoices";

/** How far a finger has to travel before a press on a tile becomes a drag. */
const DRAG_THRESHOLD = 10;

const KEEP_AWAKE_KEY = "hk-mahjong.keepAwake";

/** Keep-awake is remembered per device: whoever wanted it once wants it every game. */
function useKeepAwake() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(KEEP_AWAKE_KEY) === "1");
    } catch {
      // Storage can be blocked; the toggle still works for this visit.
    }
  }, []);
  const state = useWakeLock(on);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      window.localStorage.setItem(KEEP_AWAKE_KEY, next ? "1" : "0");
    } catch {
      // As above.
    }
  };
  return { on, state, toggle };
}

/**
 * A claim drawn where its meld would land — among your own open sets — but
 * faint, so what is on offer reads at a glance before anything is chosen.
 */
function GhostMeld({
  option,
  discard,
  lit,
}: {
  option: ClaimOption;
  discard: TileCode;
  lit: boolean;
}) {
  const codes = option.type === "win" ? [discard] : option.codes;
  const taken = option.type === "win" ? 0 : claimedIndex(option, discard);
  return (
    <span className={`meld meld--ghost${lit ? " meld--ghost-lit" : ""}`} aria-hidden>
      <span className="meld__ghost-label">{CLAIM_LABEL[option.type]}</span>
      {codes.map((code, i) =>
        i === taken ? (
          <span key={i} className="claim__taken">
            <TileFace code={code} size="sm" />
          </span>
        ) : (
          <TileFace key={i} code={code} size="sm" />
        ),
      )}
    </span>
  );
}

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
  const layout = useCompactLayout();
  const order = useHandOrder(me.hand, view.drawnTileId, `${view.roomId}:${view.handNumber}`);
  // Density is a choice for the controller; the phone that stands in for the
  // whole table keeps its single column.
  const compact = landscape && layout.compact;
  // A tile is armed by the first tap or click and thrown by the second, so a
  // double-click or double-tap discards and a single stray touch never does.
  const [armed, setArmed] = useState<string | null>(null);
  // Face down for when the phone is set on the table or someone is looking over.
  const [hidden, setHidden] = useState(false);
  const keepAwake = useKeepAwake();
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

  const yourTurn = view.turn === seat && view.phase === "action" && view.actions?.canDiscard;
  const turnLeft = useCountdown(yourTurn ? view.turnDeadlineIn : null);

  // ---- dragging tiles into your own order --------------------------------
  const handRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; pointerId: number; active: boolean } | null>(
    null,
  );
  // A drag ends with the finger lifting over a tile; that must not also count
  // as a tap on it.
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const displayIds = () => [...order.tiles.map((t) => t.id), ...(order.drawn ? [order.drawn.id] : [])];

  const onHandPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    justDragged.current = false;
    const el = (e.target as Element).closest<HTMLElement>("[data-tile-id]");
    if (!el?.dataset.tileId) return;
    drag.current = { id: el.dataset.tileId, x: e.clientX, y: e.clientY, pointerId: e.pointerId, active: false };
  };

  const onHandPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
      d.active = true;
      setDragging(d.id);
      setArmed(null);
      handRef.current?.setPointerCapture(e.pointerId);
    }
    // Whichever tile's centre is nearest the finger is where this one goes.
    // Measured on screen, so it holds when the whole controller is turned on
    // its side.
    let target: string | null = null;
    let best = Infinity;
    for (const el of handRef.current?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? []) {
      const box = el.getBoundingClientRect();
      const distance = Math.hypot(
        e.clientX - (box.left + box.width / 2),
        e.clientY - (box.top + box.height / 2),
      );
      if (distance < best) {
        best = distance;
        target = el.dataset.tileId ?? null;
      }
    }
    if (!target || target === d.id) return;
    const current = displayIds();
    const next = current.filter((id) => id !== d.id);
    next.splice(current.indexOf(target), 0, d.id);
    order.arrange(next);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.active) {
      justDragged.current = true;
      handRef.current?.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setDragging(null);
  };

  const tapTile = (tileId: string) => {
    if (justDragged.current || !yourTurn || api.busy) return;
    if (armed === tileId) {
      setArmed(null);
      void api.act({ type: "discard", tileId });
    } else {
      setArmed(tileId);
    }
  };
  const armedTile = me.hand.find((t) => t.id === armed);
  const previewed = view.claim?.options.find((o) => o.id === preview?.id);
  const using = new Set(previewed?.tileIds ?? []);

  const tileClass = (tileId: string) =>
    [
      armed === tileId ? "tile--armed" : "",
      using.has(tileId) ? "tile--uses" : "",
      dragging === tileId ? "tile--dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");

  let prompt: string;
  if (view.phase === "gameOver") prompt = "The round is over.";
  else if (view.phase === "handOver") prompt = "Hand finished — the table deals the next one.";
  else if (view.claim) prompt = `${SEAT_NAMES[view.lastDiscard!.from]} discarded ${tileName(view.lastDiscard!.tile.code)}`;
  else if (view.actions?.canWin) prompt = `You can win for ${view.actions.winScore?.faan} faan.`;
  else if (yourTurn) prompt = "Your turn — discard a tile.";
  else prompt = `Waiting for ${SEAT_NAMES[view.turn]}…`;

  // The newest discard at the table, with the wind of whoever threw it — just
  // enough to know what went out without looking up at the shared screen.
  const played = view.lastPlayed;
  const lastPlayed = played ? (
    <span
      className="phone__last"
      title={`Last played: ${tileName(played.tile.code)} from ${SEAT_NAMES[played.from]}`}
    >
      <span className="phone__last-from" aria-hidden>
        {tileGlyph(seatWind(played.from))}
      </span>
      <TileFace key={played.tile.id} code={played.tile.code} size="sm" entry="toss" tossFrom="top" />
      <span className="sr-only">from {SEAT_NAMES[played.from]}</span>
    </span>
  ) : null;

  const allowance = view.settings.turnLimit * 1000 + (view.turnExtended ? MORE_TIME_MS : 0);
  const timerStyle: CSSProperties & { "--left": number } = {
    "--left": turnLeft !== null ? Math.min(1, turnLeft / allowance) : 1,
  };
  const turnTimer =
    turnLeft !== null ? (
      <>
        <span className="phone__timer" style={timerStyle} role="timer" aria-label="Time left to discard">
          {Math.ceil(turnLeft / 1000)}s
        </span>
        {view.turnExtended ? null : (
          <button
            type="button"
            className="btn btn--sm btn--ghost phone__more-time"
            disabled={api.busy}
            aria-label={`More time: add ${MORE_TIME_MS / 1000} seconds, once per turn`}
            onClick={() => void api.act({ type: "moreTime" })}
          >
            +{MORE_TIME_MS / 1000}s
          </button>
        )}
      </>
    ) : null;

  const promptLine = (
    <p className={`phone__prompt${yourTurn || view.claim ? " phone__prompt--live" : ""}`}>
      {prompt}
    </p>
  );

  // Ghosts of every set the discard on offer would complete, laid out where
  // claimed sets go.
  // Hidden too when the hand is: a ghost is drawn from the tiles in it.
  const ghosts =
    view.claim && view.lastDiscard && !hidden
      ? view.claim.options.map((option) => (
          <GhostMeld
            key={option.id}
            option={option}
            discard={view.lastDiscard!.tile.code}
            lit={previewed?.id === option.id}
          />
        ))
      : null;
  const exposed =
    me.melds.length > 0 || me.flowers.length > 0 || ghosts ? (
      <div className="seat__row phone__melds">
        {me.melds.map((m, i) => (
          <MeldRow key={`m${i}`} meld={m} />
        ))}
        {me.flowers.map((t) => (
          <TileFace key={t.id} code={t.code} size="sm" />
        ))}
        {ghosts}
      </div>
    ) : null;
  // Compact keeps open melds on its one header line — until ghosts need the
  // room, and then they get a row of their own.
  const exposedInHeader = compact && !ghosts;

  const handTile = (t: Tile, drawn: boolean) => (
    <TileButton
      key={t.id}
      tileId={t.id}
      code={t.code}
      size="lg"
      drawn={drawn}
      entry={drawn ? "draw" : null}
      className={tileClass(t.id)}
      inactive={!yourTurn || api.busy}
      onClick={() => tapTile(t.id)}
    />
  );

  return (
    <div
      className={["phone", landscape ? "phone--landscape" : "", compact ? "phone--compact" : ""]
        .filter(Boolean)
        .join(" ")}
      onPointerDownCapture={landscape ? onFirstTouch : undefined}
    >
      <header className="phone__bar">
        <span className="phone__seat">
          <span className="phone__wind" aria-hidden>
            {tileGlyph(seatWind(seat))}
          </span>
          {/* The wind glyph says it already; compact keeps the name for screen readers only. */}
          <span className={compact ? "sr-only" : undefined}>{SEAT_NAMES[seat]}</span>
          {view.dealer === seat ? " · dealer" : ""}
        </span>
        <span className="phone__score">
          {view.scores[seat] > 0 ? `+${view.scores[seat]}` : view.scores[seat]}
        </span>
        <span className="phone__wall">{view.wallCount} left</span>
        {/* Compact folds the last tile, the prompt and the open melds into this one line. */}
        {compact ? lastPlayed : null}
        {compact ? promptLine : null}
        {compact ? turnTimer : null}
        {exposedInHeader ? exposed : null}
        {landscape && fullscreen.supported && !fullscreen.active ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            aria-label="Full screen"
            onClick={fullscreen.enter}
          >
            {compact ? "⛶" : "Full screen"}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--sm btn--ghost phone__toggle"
          aria-pressed={hidden}
          aria-label={hidden ? "Show hand" : "Hide hand"}
          onClick={() => {
            setArmed(null);
            setHidden((h) => !h);
          }}
        >
          {hidden ? "Show" : "Hide"}
          {compact ? null : " hand"}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost phone__toggle"
          aria-pressed={keepAwake.on}
          aria-label="Keep screen awake"
          disabled={keepAwake.state === "unsupported"}
          title={
            keepAwake.state === "unsupported"
              ? "This browser cannot keep the screen on"
              : keepAwake.state === "denied"
                ? "The browser refused; low battery mode can block it"
                : keepAwake.on
                  ? "The screen stays on while this page is open"
                  : "Let the screen sleep as usual"
          }
          onClick={keepAwake.toggle}
        >
          {compact ? "Awake" : "Keep awake"}
          {keepAwake.on && keepAwake.state === "held" ? " ✓" : null}
        </button>
        {sound ? (
          <SettingsMenu>
            <PhoneSettings
              sound={sound}
              config={view.config}
              appearance={appearance}
              fullscreenHint={landscape && !fullscreen.supported}
              layout={landscape ? layout : undefined}
              sort={order}
              onLeave={() => void api.leave()}
            />
          </SettingsMenu>
        ) : null}
      </header>

      {compact ? null : (
        <div className="phone__status">
          {lastPlayed}
          {promptLine}
          {turnTimer}
        </div>
      )}

      {exposedInHeader ? null : exposed}

      {hidden ? (
        <button
          type="button"
          className="phone__hand phone__hand--hidden"
          aria-label={`Hand hidden, ${me.hand.length} tiles. Show hand`}
          onClick={() => setHidden(false)}
        >
          {me.hand.map((t) => (
            <TileBack key={t.id} size="lg" />
          ))}
          <span className="phone__hidden-label" aria-hidden>
            Tap to show
          </span>
        </button>
      ) : (
        <div
          ref={handRef}
          className={`phone__hand${dragging ? " phone__hand--dragging" : ""}`}
          onPointerDown={onHandPointerDown}
          onPointerMove={onHandPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {order.tiles.map((t) => handTile(t, t.id === view.drawnTileId))}
          {order.drawn ? (
            <>
              <span className="hand__gap" aria-hidden />
              {handTile(order.drawn, true)}
            </>
          ) : null}
        </div>
      )}

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
