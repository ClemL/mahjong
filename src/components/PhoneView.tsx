"use client";

import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import type { ClaimOption } from "@/game/engine";
import { MORE_TIME_MS, type RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, type Seat, type Tile, type TileCode, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { useAppearance } from "@/hooks/useAppearance";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { useCountdown } from "@/hooks/useCountdown";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useHandOrder } from "@/hooks/useHandOrder";
import { useFlip } from "@/hooks/useFlip";
import { useHaptics } from "@/hooks/useHaptics";
import { useWakeLock } from "@/hooks/useWakeLock";
import { TileBack, TileButton, TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";
import { ChipStack, Confetti, chipsOf, confettiCount } from "./TableEffects";
import type { SoundToggle } from "./TableView";
import { SettingsMenu } from "./SettingsMenu";
import { PhoneSettings } from "./PhoneSettings";
import { PlayLog } from "./PlayLog";
import { usePhoneDisplay } from "@/hooks/useLocalSetting";
import { CLAIM_LABEL, ClaimChoices, claimedIndex } from "./ClaimChoices";

/** How far a finger has to travel before a press on a tile becomes a drag. */
const DRAG_THRESHOLD = 10;
/** A tile pulled this far up and let go is thrown, as a share of its height. */
const FLICK_REACH = 0.9;
/** Or one let go moving up at least this fast, in pixels a millisecond: a quick flick travels less. */
const FLICK_SPEED = 0.45;

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
/**
 * Where an element sits inside a box, in the box's own frame. The controller
 * can be turned on its side with a transform, so screen rectangles would point
 * the wrong way; offsets are measured before any transform.
 */
function offsetWithin(el: HTMLElement, box: HTMLElement): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== box) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    // Offsets ignore scrolling, so a scrolled hand would put the tile elsewhere.
    for (let a: HTMLElement | null = node.parentElement; a; a = a.parentElement) {
      x -= a.scrollLeft;
      y -= a.scrollTop;
      if (a === parent) break;
    }
    node = parent;
  }
  return node === box ? { x, y } : null;
}

/** How far an element is turned on screen, in radians, by the transforms above it. */
function screenAngle(node: Element | null): number {
  let angle = 0;
  for (let n = node; n; n = n.parentElement) {
    const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(n).transform);
    if (m) {
      const [a, b] = m[1].split(",").map(Number);
      angle += Math.atan2(b, a);
    }
  }
  return angle;
}

/**
 * A movement on screen in the controller's own frame. Turned on its side, the
 * controller's "up" is across the glass, and a throw has to be read that way.
 */
function intoFrame(dx: number, dy: number, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/** A discard on its way from this phone up to the table. */
type Sent = { id: string; code: TileCode; x: number; y: number; w: number; h: number };

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
  const display = usePhoneDisplay();
  useHaptics(view, display.vibrate === "on");
  const order = useHandOrder(me.hand, view.drawnTileId, `${view.roomId}:${view.handNumber}`);
  // Density is a choice for the controller; the phone that stands in for the
  // whole table keeps its single column.
  const compact = landscape && layout.compact;
  // A tile is armed by the first tap or click and thrown by the second, so a
  // double-click or double-tap discards and a single stray touch never does.
  const [armed, setArmed] = useState<string | null>(null);
  // A flicked tile stays out of sight until the table takes it from the hand —
  // or, if the throw never arrives, comes back after a moment.
  const [flung, setFlung] = useState<string | null>(null);
  useEffect(() => {
    if (flung === null) return;
    const timer = window.setTimeout(() => setFlung(null), 3000);
    return () => window.clearTimeout(timer);
  }, [flung]);
  // Face down for when the phone is set on the table or someone is looking
  // over — and at every deal, so a hand is turned up by its owner, not
  // shown to whoever is next to the phone when the tiles arrive.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(true);
  }, [view.handNumber]);
  const keepAwake = useKeepAwake();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  // The claim being pressed or hovered, whose tiles the hand lifts.
  const [preview, setPreview] = useState<ClaimOption | null>(null);
  useEffect(() => {
    // Never leave a tile armed, or a claim previewed, across a turn or a deal.
    setArmed(null);
    setPreview(null);
    setFlung(null);
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

  // ---- dragging tiles into your own order, or flicking one away ---------
  const handRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
    /** Undecided until the finger has travelled; then sideways rearranges, upwards throws. */
    mode: "press" | "reorder" | "flick";
    angle: number;
    el: HTMLElement;
    /** Where the tile has been pulled to, newest last, for how fast it was let go. */
    trail: { x: number; y: number; t: number }[];
  } | null>(null);
  // A drag ends with the finger lifting over a tile; that must not also count
  // as a tap on it.
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [flicking, setFlicking] = useState<string | null>(null);
  const canThrow = Boolean(yourTurn) && !api.busy;
  // Tiles slide into a new sort or round a closing gap; a finger placing
  // them itself gets them where it puts them, without a slide fighting it.
  useFlip(handRef, dragging === null && flicking === null);

  const displayIds = () => [...order.tiles.map((t) => t.id), ...(order.drawn ? [order.drawn.id] : [])];

  const onHandPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    justDragged.current = false;
    const el = (e.target as Element).closest<HTMLElement>("[data-tile-id]");
    if (!el?.dataset.tileId) return;
    drag.current = {
      id: el.dataset.tileId,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      mode: "press",
      angle: screenAngle(handRef.current),
      el,
      trail: [],
    };
  };

  const onHandPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = intoFrame(e.clientX - d.x, e.clientY - d.y, d.angle);
    if (d.mode === "press") {
      if (Math.hypot(moved.x, moved.y) < DRAG_THRESHOLD) return;
      // Mostly upwards on your turn is a throw at the table; any other way,
      // or when it is not yours to throw, is moving the tile along the rack.
      d.mode = canThrow && -moved.y > Math.abs(moved.x) ? "flick" : "reorder";
      setArmed(null);
      handRef.current?.setPointerCapture?.(e.pointerId);
      if (d.mode === "flick") setFlicking(d.id);
      else setDragging(d.id);
    }
    if (d.mode === "flick") {
      // The tile follows the finger up, and only a little sideways.
      const at = { x: moved.x * 0.35, y: Math.min(0, moved.y) };
      d.trail = [...d.trail.slice(-5), { ...at, t: e.timeStamp }];
      d.el.style.setProperty("--flick-x", `${at.x}px`);
      d.el.style.setProperty("--flick-y", `${at.y}px`);
      return;
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
    if (d.mode !== "press") {
      justDragged.current = true;
      handRef.current?.releasePointerCapture?.(e.pointerId);
    }
    if (d.mode === "flick") {
      const last = d.trail[d.trail.length - 1] ?? { x: 0, y: 0, t: e.timeStamp };
      const first = d.trail.find((p) => last.t - p.t <= 120) ?? last;
      const speed = last.t > first.t ? (first.y - last.y) / (last.t - first.t) : 0;
      const reach = Math.max(36, d.el.offsetHeight * FLICK_REACH);
      const thrown =
        e.type === "pointerup" && canThrow && (-last.y >= reach || (speed >= FLICK_SPEED && -last.y >= 16));
      d.el.style.removeProperty("--flick-x");
      d.el.style.removeProperty("--flick-y");
      if (thrown) {
        discard(d.id, last);
      } else if (last.x !== 0 || last.y !== 0) {
        // Not far or fast enough: it settles back into the rack.
        d.el.animate?.([{ translate: `${last.x}px ${last.y}px` }, { translate: "0px 0px" }], {
          duration: 180,
          easing: "ease-out",
        });
      }
    }
    drag.current = null;
    setDragging(null);
    setFlicking(null);
  };

  // With a tablet on the table the discard is seen leaving the phone, thrown
  // up off the top edge towards the table, where it lands a moment later. A
  // flicked tile leaves from wherever the finger let it go.
  const discard = (tileId: string, from: { x: number; y: number } = { x: 0, y: 0 }) => {
    setArmed(null);
    const root = rootRef.current;
    const el = handRef.current?.querySelector<HTMLElement>(`[data-tile-id="${tileId}"]`);
    const tile = me.hand.find((t) => t.id === tileId);
    const at = root && el ? offsetWithin(el, root) : null;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (landscape && tile && el && at && !still) {
      setSent({
        id: tileId,
        code: tile.code,
        x: at.x + from.x,
        y: at.y + from.y,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    }
    if (from.x !== 0 || from.y !== 0) setFlung(tileId);
    void api.act({ type: "discard", tileId });
  };

  const tapTile = (tileId: string) => {
    if (justDragged.current || !yourTurn || api.busy) return;
    if (armed === tileId) {
      discard(tileId);
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
      flicking === tileId ? "tile--flicking" : "",
      flung === tileId ? "tile--flung" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const result = view.result;
  const over = view.phase === "handOver" || view.phase === "gameOver";
  // What this hand paid or cost you, shown beside the chips once it is settled.
  const settled = over && result ? (result.payments[seat] ?? 0) : null;
  const youWon = over && result?.type === "win" && result.winner === seat && result.score;
  const nameOf = (s: Seat) => view.players[s].occupant.name ?? SEAT_NAMES[s];
  const winText =
    result?.type === "win" && result.winner !== null && result.score
      ? `${result.winner === seat ? "You win" : `${nameOf(result.winner)} wins`} with ${result.score.scoredFaan} faan.`
      : "Washed-out hand.";
  // During a claim the turn still belongs to whoever discarded, but the table
  // is waiting on the person being asked about it.
  const deciding = view.awaitingClaimSeats[0];
  let prompt: string;
  if (view.phase === "gameOver") prompt = `${winText} The round is over.`;
  else if (view.phase === "handOver") prompt = `${winText} The table deals the next one.`;
  else if (view.claim) prompt = `${nameOf(view.lastDiscard!.from)} discarded ${tileName(view.lastDiscard!.tile.code)}`;
  else if (view.actions?.canWin) prompt = `You can win for ${view.actions.winScore?.faan} faan.`;
  else if (yourTurn) prompt = "Your turn — discard a tile.";
  else if (view.phase === "claiming" && deciding !== undefined && view.lastDiscard)
    prompt = `Waiting for ${nameOf(deciding)} to decide on ${tileName(view.lastDiscard.tile.code)}…`;
  else prompt = `Waiting for ${nameOf(view.turn)}…`;

  // The newest discard at the table, with the wind of whoever threw it — just
  // enough to know what went out without looking up at the shared screen.
  const played = view.lastPlayed;
  const lastPlayed = played ? (
    <span
      className="phone__last"
      title={`Last played: ${tileName(played.tile.code)} from ${nameOf(played.from)}`}
    >
      <span className="phone__last-from" aria-hidden>
        {tileGlyph(seatWind(played.from))}
      </span>
      <TileFace key={played.tile.id} code={played.tile.code} size="sm" entry="toss" tossFrom="top" />
      <span className="sr-only">from {nameOf(played.from)}</span>
    </span>
  ) : null;

  const allowance =
    view.turnAllowance || view.settings.turnLimit * 1000 + (view.turnExtended ? MORE_TIME_MS : 0);
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
      className={[
        "phone",
        landscape ? "phone--landscape" : "",
        compact ? "phone--compact" : "",
        landscape ? `phone--size-${display.size}` : "",
        // Your move — your turn or your call on a discard — lit in the same
        // colour the table lights your rack with.
        yourTurn || view.claim ? "phone--acting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDownCapture={landscape ? onFirstTouch : undefined}
      ref={rootRef}
    >
      <header className="phone__bar">
        <span className="phone__seat">
          <span className="phone__wind" aria-hidden>
            {tileGlyph(seatWind(seat))}
          </span>
          <span className="phone__name">{nameOf(seat)}</span>
          {/* The wind glyph says it already; compact keeps the wind's name for screen readers only. */}
          <span className={compact ? "sr-only" : undefined}> · {SEAT_NAMES[seat]}</span>
          {view.dealer === seat ? " · dealer" : ""}
        </span>
        {view.tablePresent ? (
          <span className="phone__score phone__chips">
            <ChipStack count={chipsOf(view.scores[seat])} label="Your chips" />
            {settled !== null && settled !== 0 ? (
              <span
                key={`delta-${view.handNumber}`}
                className={`chip-delta ${settled > 0 ? "chip-delta--up" : "chip-delta--down"}`}
              >
                {settled > 0 ? `+${settled}` : settled}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="phone__score">
            {view.scores[seat] > 0 ? `+${view.scores[seat]}` : view.scores[seat]}
          </span>
        )}
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
              display={landscape ? display : undefined}
              sort={order}
              table={tableName(view.roomId)}
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
          className={[
            "phone__hand",
            dragging ? "phone__hand--dragging" : "",
            canThrow ? "phone__hand--throw" : "",
          ]
            .filter(Boolean)
            .join(" ")}
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
        {landscape && display.playLog === "on" ? (
          <PlayLog log={view.log} hand={view.handNumber} players={view.players} />
        ) : null}
        {armedTile && yourTurn ? (
          <div className="confirm-bar" role="status">
            <span className="confirm-bar__text">Discard {tileName(armedTile.code)}?</span>
            <button
              type="button"
              className="btn btn--win"
              disabled={api.busy}
              onClick={() => discard(armedTile.id)}
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
      {landscape && youWon && result?.score ? (
        <Confetti
          key={`confetti-${view.handNumber}`}
          count={confettiCount(result.score.scoredFaan)}
          seed={view.handNumber * 7919 + seat}
          spread={260}
          style={{ left: "50%", top: "45%" }}
        />
      ) : null}
      {sent ? (
        <span
          key={sent.id}
          className="phone__sent"
          aria-hidden
          style={
            {
              left: sent.x,
              top: sent.y,
              "--tile-lg": `${sent.w}px`,
              "--send-rise": `${sent.y + sent.h + 24}px`,
            } as CSSProperties
          }
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setSent(null);
          }}
        >
          <TileFace code={sent.code} size="lg" />
          <span className="phone__sent-label">To the table</span>
        </span>
      ) : null}
    </div>
  );
}
