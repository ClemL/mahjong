"use client";

import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ClaimOption } from "@/game/engine";
import { HURRY_COOLDOWN_MS, HURRY_GRACE_MS, MORE_TIME_MS, TAKE_BACK_MS, type RoomView } from "@/game/room";
import { findSets } from "@/game/sets";
import type { RoomApi } from "@/hooks/useRoom";
import { SEAT_NAMES, type Seat, type Tile, type TileCode, seatWind, suitOf, tileGlyph, tileName } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { useAppearance } from "@/hooks/useAppearance";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { usePhoneLayout } from "@/hooks/usePhoneLayout";
import { useCountdown } from "@/hooks/useCountdown";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useHandOrder } from "@/hooks/useHandOrder";
import { useFlip } from "@/hooks/useFlip";
import { useHaptics } from "@/hooks/useHaptics";
import { useDealIn } from "@/hooks/useDealIn";
import { useHurryFlash } from "@/hooks/useHurry";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useTableLook } from "@/hooks/useTableLook";
import { HelperButton, HelperPanel } from "./HelperPanel";
import { TileBack, TileButton, TileFace } from "./TileView";
import { MeldRow, bonusClass } from "./MeldRow";
import { ChipStack, Confetti, chipsOf, confettiCount } from "./TableEffects";
import type { SoundToggle } from "@/hooks/useRoomSound";
import { SettingsMenu } from "./SettingsMenu";
import { PhoneSettings } from "./PhoneSettings";
import { PlayLog } from "./PlayLog";
import { PhoneResult } from "./PhoneResult";
import { ReadyUp } from "./ReadyUp";
import { FormingMeld, useFormingMeld } from "./FormingMeld";
import { useTakeBackAssist } from "@/hooks/useTakeBackAssist";
import { FaanPreview, FaanToggle } from "./FaanPreview";
import { joinNames, winnersOf, youFirst } from "./TableResult";
import { usePhoneDisplay } from "@/hooks/useLocalSetting";
import { ClaimChoices } from "./ClaimChoices";
import { intoFrame, screenAngle } from "./screenFrame";
import { MiniPonds } from "./MiniPonds";
import { PhoneSummary } from "./PhoneSummary";
import { AchievementToasts } from "./AchievementToasts";
import { useRoomyScreen } from "@/hooks/useRoomyScreen";

/** How far a finger has to travel before a press on a tile becomes a drag. */
const DRAG_THRESHOLD = 10;
/** A tile pulled this far up and let go is thrown, as a share of its height. */
const FLICK_REACH = 0.9;
/** Or one let go moving up at least this fast, in pixels a millisecond: a quick flick travels less. */
const FLICK_SPEED = 0.45;

/**
 * How many tiles the hand row holds, and whether the drawn one stands apart,
 * so a stretched hand can size its tiles to fill the width exactly. Shelves
 * size theirs by the longer of their two rows.
 */
function handFill(tiles: number, apart: boolean, shelf = 0): CSSProperties {
  return {
    "--hand-count": Math.max(1, tiles),
    "--hand-apart": apart ? 1 : 0,
    "--shelf-count": Math.max(1, shelf),
  } as CSSProperties;
}

/** Where whoever threw a tile sits, said from your chair: play passes to your right. */
const RELATIVE = ["you", "your right", "across", "your left"] as const;

const shelfKind = (code: TileCode) => suitOf(code) ?? "honor";

/**
 * Where the shelves layout starts the hand's second row: at the change of suit
 * that leaves the two rows closest in length, so a suit stays on one shelf.
 * Halved instead when the hand is one suit, or splitting by suit would leave
 * one row much the longer. `after` is the room the drawn tile takes at the end
 * of the second row.
 */
export function shelfBreak(codes: readonly TileCode[], after = 0): number {
  const n = codes.length;
  const even = Math.min(n, Math.ceil((n + after) / 2));
  let best = -1;
  let longest = Infinity;
  for (let i = 1; i < n; i++) {
    if (shelfKind(codes[i]) === shelfKind(codes[i - 1])) continue;
    const rows = Math.max(i, n - i + after);
    if (rows < longest) {
      longest = rows;
      best = i;
    }
  }
  return best < 0 || longest > even + 2 ? even : best;
}

/** The controller's screens, in the order a swipe right moves through them. */
type Page = "hand" | "discards" | "summary";

/** How far a finger travels sideways across the middle before it counts as a swipe. */
const SWIPE_REACH = 48;

/** An eye, open to turn the hand up, struck through to turn it down. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {open ? null : <path d="M4 20 20 4" />}
    </svg>
  );
}

/** A cup: the chips and achievements, on the button that brings them in. */
function TrophyIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </svg>
  );
}

/** Three small tiles: the discards, on the button that brings them in. */
function PondsIcon() {
  return (
    <svg aria-hidden="true" width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="4" height="5.5" rx="1" />
      <rect x="6" y="1" width="4" height="5.5" rx="1" />
      <rect x="11" y="1" width="4" height="5.5" rx="1" />
      <rect x="1" y="7.5" width="4" height="5.5" rx="1" />
      <rect x="6" y="7.5" width="4" height="5.5" rx="1" />
    </svg>
  );
}

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

/** How a tile already in a set is marked: the kind of set, and the faan an honor set scores. */
type SetMark = { kind: "run" | "set" | "score"; faan: number; set: number };

const SET_SPOKEN: Record<SetMark["kind"], string> = {
  run: "part of a run",
  set: "part of three of a kind",
  score: "part of three of a kind that scores",
};

/** A discard on its way from this phone up to the table. */
type Sent = { id: string; code: TileCode; x: number; y: number; w: number; h: number };

/**
 * The player's own view: their hand and the decisions that are theirs, on a
 * phone held sideways. The pond, the scores and everyone's melds are on the
 * tablet in the middle, so the phone gives its whole width to the hand and the
 * choices, full screen where the browser allows it.
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
  const appearance = useAppearance();
  const fullscreen = useFullscreen("landscape");
  const layout = usePhoneLayout();
  const display = usePhoneDisplay(me.occupant.name);
  useHaptics(view, display.vibrate === "on");
  const wakeLock = useWakeLock(display.keepAwake === "on");
  useTableLook(view, appearance);
  // Flashed whatever this phone's own Hurry up setting says: that setting is
  // the button for hurrying others, not a way out of being hurried.
  const hurriedBy = useHurryFlash(view, display.vibrate === "on");
  useTakeBackAssist(view, api, display.takeBack === "on");
  const [helperOpen, setHelperOpen] = useState(false);
  // The table resting after anyone's hurry-up: every button waits it out,
  // rather than inviting presses the server will refuse.
  const hurryLeft = useCountdown(view.hurryCooldown?.left ?? null, !view.paused, view.version);
  // Nor is anybody hurried in the first moments of their turn.
  const graceLeft = useCountdown(view.hurryGraceLeft > 0 ? view.hurryGraceLeft : null, !view.paused, view.version);
  const takeBackLeft = useCountdown(view.takeBackIn > 0 ? view.takeBackIn : null, true, view.version);
  const order = useHandOrder(me.hand, view.drawnTileId, `${view.roomId}:${view.gameId}:${view.handNumber}`);
  const shelves = layout.layout === "shelves";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const dealIn = useDealIn(view, seat, rootRef, hidden);
  // A set just made from this hand: shown forming in the middle of the
  // screen, then marked where it lands among the open sets.
  const forming = useFormingMeld(me.melds, view.handNumber);
  const ready = () => void api.act({ type: "ready" });
  const [sent, setSent] = useState<Sent | null>(null);
  // The claim being pressed or hovered, whose tiles the hand lifts.
  const [preview, setPreview] = useState<ClaimOption | null>(null);
  // Your open sets and flowers drawn large, for reading across a table.
  const [zoomed, setZoomed] = useState(false);
  // Everyone's discards: kept in the middle right where the screen has room
  // and the player asked for them, otherwise a screen of their own under the header.
  const roomy = useRoomyScreen();
  const docked = roomy && display.ponds === "on";
  // The screens a swipe right moves through: the hand, everyone's discards
  // (unless they are already kept beside it), then the chips and achievements.
  // A swipe left goes back one.
  const [page, setPage] = useState<Page>("hand");
  const pages: Page[] = docked ? ["hand", "summary"] : ["hand", "discards", "summary"];
  const turnPage = (by: 1 | -1) =>
    setPage((current) => {
      const at = Math.max(0, pages.indexOf(current));
      return pages[Math.min(pages.length - 1, Math.max(0, at + by))];
    });
  const pondsOpen = page === "discards";
  const summaryOpen = page === "summary";
  // The hand's result, put aside to look at the table, by the hand and phase it was for.
  const [resultAside, setResultAside] = useState<string | null>(null);
  // How many of the computer's turns for you have been acknowledged. The room
  // starts counting from nothing again once you move, and so does this.
  const [standInSeen, setStandInSeen] = useState(0);
  useEffect(() => {
    if (view.stoodIn === 0) setStandInSeen(0);
  }, [view.stoodIn]);
  const standIn = view.stoodIn > standInSeen ? view.stoodIn : 0;
  // The patterns behind a win on offer, opened from the faan beside Win.
  const [faanOpen, setFaanOpen] = useState(false);
  useEffect(() => {
    // Never leave a tile armed, or a claim previewed, across a turn or a deal.
    setArmed(null);
    setPreview(null);
    setFlung(null);
    setFaanOpen(false);
    // A move to make should not open under the enlarged sets.
    setZoomed(false);
  }, [view.turn, view.handNumber, view.phase]);

  // Whenever the move comes to you — your turn to throw, a call on a discard,
  // a win or a kong — the screen comes back to the hand and its buttons. Once
  // a move: swiped away again, the other screens stay while it is weighed up.
  const myTurn = view.turn === seat && view.phase === "action" && Boolean(view.actions?.canDiscard);
  const decision = view.claim
    ? `claim:${view.lastDiscard?.tile.id}`
    : myTurn || view.actions?.canWin || (view.actions?.kongs?.length ?? 0) > 0
      ? `move:${view.handNumber}:${view.turn}:${view.drawnTileId}`
      : null;
  useEffect(() => {
    if (decision !== null) setPage("hand");
  }, [decision]);
  useEffect(() => setPage("hand"), [view.handNumber]);
  // The discards are kept beside the hand now: there is no screen of them to be on.
  useEffect(() => {
    if (docked) setPage((current) => (current === "discards" ? "hand" : current));
  }, [docked]);
  useEffect(() => {
    if (page === "hand") return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPage("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  // A swipe right across the middle of the controller moves on a screen, a
  // swipe left comes back one. Read in the controller's own frame: held
  // upright it is turned on its side, and right is along the glass.
  const swipe = useRef<{ id: number; x: number; y: number; angle: number } | null>(null);
  const onSwipeStart = (e: PointerEvent<HTMLDivElement>) => {
    swipe.current = null;
    const target = e.target as Element;
    if (!target.closest(".phone__controls, .phone__status, .minipond--sheet")) return;
    if (target.closest("button, a, input, select, textarea")) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, angle: screenAngle(rootRef.current) };
  };
  const onSwipeMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    if (!start || start.id !== e.pointerId) return;
    const moved = intoFrame(e.clientX - start.x, e.clientY - start.y, start.angle);
    if (Math.abs(moved.x) < SWIPE_REACH || Math.abs(moved.x) < 1.5 * Math.abs(moved.y)) return;
    swipe.current = null;
    turnPage(moved.x > 0 ? 1 : -1);
  };
  const onSwipeEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (swipe.current?.id === e.pointerId) swipe.current = null;
  };

  // The first touch asks for full screen. It cannot be asked for without one,
  // and once is enough: someone who backs out of it meant to.
  const askedFullscreen = useRef(false);
  const onFirstTouch = () => {
    if (askedFullscreen.current || !coarse || !fullscreen.supported || fullscreen.active) return;
    askedFullscreen.current = true;
    fullscreen.enter();
  };

  const toPlay = view.turn === seat && view.phase === "action" && view.actions?.canDiscard;
  // Paused, the turn is still yours and its clock still shows, stopped, but
  // nothing can be played until the table picks the hand up.
  const yourTurn = toPlay && !view.paused;
  const turnLeft = useCountdown(toPlay ? view.turnDeadlineIn : null, !view.paused, view.version);

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
    /** A rearrangement: the hand as it was picked up, where each tile sat, and where this one would land. */
    ids: string[];
    els: HTMLElement[];
    slots: { x: number; y: number }[];
    from: number;
    to: number;
    lift: { x: number; y: number };
  } | null>(null);
  // A drag ends with the finger lifting over a tile; that must not also count
  // as a tap on it.
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [flicking, setFlicking] = useState<string | null>(null);
  // The tile under a finger, enlarged so it can be read past the finger.
  const [pressed, setPressed] = useState<string | null>(null);
  // A dragged tile just let go: where it was, by the finger, from where it now sits.
  const [settle, setSettle] = useState<{ id: string; x: number; y: number } | null>(null);
  const canThrow = Boolean(yourTurn) && !api.busy;
  // Tiles slide into a new sort or round a closing gap. Not while a finger
  // places them, nor as a drop lands: the rest are already where they belong.
  useFlip(handRef, dragging === null && flicking === null && settle === null);

  // A dropped tile is let go where the finger left it and settles into its
  // new place; the tiles that parted for it are already in theirs.
  useLayoutEffect(() => {
    if (!settle) return;
    const hand = handRef.current;
    for (const el of hand?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? []) {
      for (const v of ["--part-x", "--part-y", "--drag-x", "--drag-y"]) el.style.removeProperty(v);
    }
    const el = hand?.querySelector<HTMLElement>(`[data-tile-id="${settle.id}"]`);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (el && !still && typeof el.animate === "function") {
      const x = settle.x - (el.offsetLeft + el.offsetWidth / 2);
      const y = settle.y - (el.offsetTop + el.offsetHeight / 2);
      el.animate([{ translate: `${x}px ${y}px` }, { translate: "0px 0px" }], {
        duration: 200,
        easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      });
    }
    setSettle(null);
  }, [settle]);

  const displayIds = () => [...order.tiles.map((t) => t.id), ...(order.drawn ? [order.drawn.id] : [])];

  const onHandPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // A touch on a hand still being dealt brings the rest of it straight in.
    dealIn.finish();
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
      ids: [],
      els: [],
      slots: [],
      from: 0,
      to: 0,
      lift: { x: 0, y: 0 },
    };
    setPressed(el.dataset.tileId);
  };

  /**
   * Opens the gap where the dragged tile would land: every tile between its
   * old place and that one moves one place along, toward the hole it left.
   * Places are the ones taken when the tile was picked up, so a row that wraps
   * still parts along itself.
   */
  const part = (d: NonNullable<typeof drag.current>) => {
    d.els.forEach((el, i) => {
      if (i === d.from) return;
      let j = i;
      if (d.from < d.to && i > d.from && i <= d.to) j = i - 1;
      else if (d.to < d.from && i >= d.to && i < d.from) j = i + 1;
      el.style.setProperty("--part-x", `${d.slots[j].x - d.slots[i].x}px`);
      el.style.setProperty("--part-y", `${d.slots[j].y - d.slots[i].y}px`);
    });
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
      setPressed(null);
      handRef.current?.setPointerCapture?.(e.pointerId);
      if (d.mode === "flick") setFlicking(d.id);
      else {
        // Where every tile sits now, in the hand's own frame, before anything moves.
        d.els = [...(handRef.current?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? [])];
        d.ids = d.els.map((el) => el.dataset.tileId!);
        d.slots = d.els.map((el) => ({
          x: el.offsetLeft + el.offsetWidth / 2,
          y: el.offsetTop + el.offsetHeight / 2,
        }));
        d.from = d.to = Math.max(0, d.ids.indexOf(d.id));
        setDragging(d.id);
      }
    }
    if (d.mode === "flick") {
      // The tile follows the finger up, and only a little sideways.
      const at = { x: moved.x * 0.35, y: Math.min(0, moved.y) };
      d.trail = [...d.trail.slice(-5), { ...at, t: e.timeStamp }];
      d.el.style.setProperty("--flick-x", `${at.x}px`);
      d.el.style.setProperty("--flick-y", `${at.y}px`);
      return;
    }
    // The tile rides on the finger, never far from the row; the place it
    // would land is whichever of the places taken at pick-up is nearest.
    const h = d.el.offsetHeight;
    d.lift = { x: moved.x, y: Math.max(-h, Math.min(h * 0.4, moved.y)) };
    d.el.style.setProperty("--drag-x", `${d.lift.x}px`);
    d.el.style.setProperty("--drag-y", `${d.lift.y}px`);
    const at = { x: d.slots[d.from].x + moved.x, y: d.slots[d.from].y + moved.y };
    let to = d.from;
    let best = Infinity;
    d.slots.forEach((slot, i) => {
      const distance = Math.hypot(at.x - slot.x, at.y - slot.y);
      if (distance < best) {
        best = distance;
        to = i;
      }
    });
    if (to !== d.to) {
      d.to = to;
      part(d);
    }
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
    if (d.mode === "reorder") {
      // The hand may have changed under the finger — a tile drawn, a claim —
      // and then the places taken at pick-up no longer describe it.
      const same = d.ids.join() === displayIds().join();
      if (e.type === "pointerup" && same && d.to !== d.from) {
        const next = d.ids.filter((id) => id !== d.id);
        next.splice(d.to, 0, d.id);
        order.arrange(next);
      }
      const from = d.slots[d.from];
      setSettle({ id: d.id, x: from.x + d.lift.x, y: from.y + d.lift.y });
    }
    drag.current = null;
    setDragging(null);
    setFlicking(null);
    setPressed(null);
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
    if (tile && el && at && !still) {
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

  // Alt and an arrow move the focused tile one place along the hand: the way
  // to arrange it without a finger or a mouse. The tile is focused again once
  // it has moved, since moving a focused element drops its focus.
  const keysHint = useId();
  const [refocus, setRefocus] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (refocus === null) return;
    handRef.current?.querySelector<HTMLElement>(`[data-tile-id="${refocus}"]`)?.focus();
    setRefocus(null);
  }, [refocus]);
  const onHandKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const id = (e.target as Element).closest<HTMLElement>("[data-tile-id]")?.dataset.tileId;
    if (!id) return;
    e.preventDefault();
    const ids = displayIds();
    const from = ids.indexOf(id);
    const to = from + (e.key === "ArrowLeft" ? -1 : 1);
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    order.arrange(ids);
    setRefocus(id);
  };

  const tapTile = (tileId: string) => {
    if (justDragged.current || !yourTurn || api.busy) return;
    if (armed === tileId) {
      discard(tileId);
    } else {
      setArmed(tileId);
    }
  };
  // Sets the hand already holds, for the line under their tiles.
  const marks = useMemo(() => {
    const byTile = new Map<string, SetMark>();
    if (display.setHints !== "on") return byTile;
    findSets(me.hand, seatWind(seat), view.roundWind, view.config).forEach((found, set) => {
      const kind = found.type === "chow" ? "run" : found.faan > 0 ? "score" : "set";
      for (const id of found.tileIds) byTile.set(id, { kind, faan: found.faan, set });
    });
    return byTile;
  }, [me.hand, seat, view.roundWind, view.config, display.setHints]);
  // A scoring set says what it is worth once, on whichever of its tiles is leftmost.
  const badged = new Set<string>();
  {
    const seen = new Set<number>();
    for (const id of displayIds()) {
      const mark = marks.get(id);
      if (mark?.kind === "score" && !seen.has(mark.set)) {
        seen.add(mark.set);
        badged.add(id);
      }
    }
  }
  const armedTile = me.hand.find((t) => t.id === armed);
  const previewed = view.claim?.options.find((o) => o.id === preview?.id);
  const using = new Set(previewed?.tileIds ?? []);

  const tileClass = (tileId: string) =>
    [
      armed === tileId ? "tile--armed" : "",
      using.has(tileId) ? "tile--uses" : "",
      dragging === tileId ? "tile--dragging" : "",
      pressed === tileId ? "tile--peek" : "",
      flicking === tileId ? "tile--flicking" : "",
      flung === tileId ? "tile--flung" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const result = view.result;
  const over = view.phase === "handOver" || view.phase === "gameOver";
  // What this hand paid or cost you, shown beside the chips once it is settled.
  const settled = over && result ? (result.payments[seat] ?? 0) : null;
  const winners = winnersOf(result);
  const yourWin = over ? (winners.find((w) => w.winner === seat && w.score)?.score ?? null) : null;
  const nameOf = (s: Seat) => view.players[s].occupant.name ?? SEAT_NAMES[s];
  const winText =
    winners.length > 1
      ? `${joinNames(youFirst(winners, seat).map((w) => (w.winner === seat ? "You" : nameOf(w.winner))))} win on the same tile.`
      : result?.type === "win" && result.winner !== null && result.score
        ? `${result.winner === seat ? "You win" : `${nameOf(result.winner)} wins`} with ${result.score.scoredFaan} faan.`
        : "Washed-out hand.";
  // During a claim the turn still belongs to whoever discarded, but the table
  // is waiting on the person being asked about it.
  const deciding = view.awaitingClaimSeats[0];
  let prompt: string;
  if (view.phase === "gameOver") prompt = result ? `${winText} That is the game.` : "The table ended the game.";
  else if (view.phase === "handOver") prompt = `${winText} Tap Ready for the next one.`;
  else if (view.paused) prompt = "Paused — the table will pick the hand back up.";
  else if (view.claim && view.claim.declared.length > 0)
    prompt = `${joinNames(view.claim.declared.map(nameOf))} won on ${tileName(view.lastDiscard!.tile.code)} — you can win on it too`;
  else if (view.claim) prompt = `${nameOf(view.lastDiscard!.from)} discarded ${tileName(view.lastDiscard!.tile.code)}`;
  else if (view.actions?.canWin) prompt = `You can win for ${view.actions.winScore?.scoredFaan} faan.`;
  else if (yourTurn) prompt = "Your turn — discard a tile.";
  else if (view.phase === "claiming" && deciding !== undefined && view.lastDiscard)
    prompt = `Waiting for ${nameOf(deciding)} to decide on ${tileName(view.lastDiscard.tile.code)}…`;
  // The beat after your own throw, while it can still be taken back.
  else if (view.turn === seat && view.lastDiscard?.from === seat) prompt = `You threw ${tileName(view.lastDiscard.tile.code)}.`;
  else prompt = `Waiting for ${nameOf(view.turn)}…`;
  // Whoever is being waited on has already been hurried, and by whom: nobody
  // else need ask again, and nobody wonders whether anyone has.
  const waitedOn = view.phase === "claiming" ? deciding : view.turn;
  const hurriedNote =
    view.hurried && view.hurried.seat === waitedOn && waitedOn !== seat && prompt.startsWith("Waiting for")
      ? `Hurried by ${view.hurried.by === seat ? "you" : nameOf(view.hurried.by)}`
      : null;

  // The newest discard at the table, who threw it and where they sit from
  // here, and how many of it this seat can already see — enough to decide on
  // it without looking up at the shared screen.
  const played = view.lastPlayed;
  const seenOf = (code: TileCode, id: string) => {
    const ids = new Set([id]);
    for (const t of me.hand) if (t.code === code) ids.add(t.id);
    for (const p of view.players) {
      for (const t of p.discards) if (t.code === code) ids.add(t.id);
      for (const m of p.melds) {
        // Another seat's concealed kong shows its ends face down, as the table draws it.
        const faceUp = m.type === "kong" && m.concealed && p.seat !== seat ? m.tiles.slice(1, 3) : m.tiles;
        for (const t of faceUp) if (t.code === code) ids.add(t.id);
      }
    }
    return ids.size;
  };
  const lastPlayed = played ? (
    <span
      className="phone__last"
      title={`Last played: ${tileName(played.tile.code)} from ${nameOf(played.from)}`}
    >
      <TileFace key={played.tile.id} code={played.tile.code} size="sm" entry="toss" tossFrom="top" />
      <span className="phone__last-text">
        <span className="phone__last-who">
          <span className="phone__last-from" aria-hidden>
            {tileGlyph(seatWind(played.from))}
          </span>
          <span className="sr-only">from </span>
          {played.from === seat ? "You" : nameOf(played.from)}
        </span>
        {played.from === seat ? null : (
          <span className="phone__last-where">{RELATIVE[(played.from - seat + 4) % 4]}</span>
        )}
        <span className="phone__last-seen">{seenOf(played.tile.code, played.tile.id)} of 4 seen</span>
      </span>
    </span>
  ) : null;

  // The person the table is waiting on, when it is someone else at the table:
  // the one deciding on a discard, or else whoever is on turn and has not thrown.
  const onTurn = view.players[view.turn].occupant;
  const waitingOn =
    view.phase === "claiming"
      ? (deciding ?? null)
      : view.phase === "action" && view.lastDiscard === null && onTurn.kind === "human" && !onTurn.away
        ? view.turn
        : null;
  // The count can outlive the view's cooldown by a render, so both are checked.
  const cooldown = view.hurryCooldown !== null && hurryLeft !== null && hurryLeft > 0 ? view.hurryCooldown : null;
  const cooldownSeconds = Math.ceil((hurryLeft ?? 0) / 1000);
  const settling = cooldown === null && graceLeft !== null && graceLeft > 0;
  const graceSeconds = Math.ceil((graceLeft ?? 0) / 1000);
  const restingStyle: CSSProperties & { "--left": number } = {
    "--left": cooldown
      ? Math.min(1, (hurryLeft ?? 0) / HURRY_COOLDOWN_MS)
      : Math.min(1, (graceLeft ?? 0) / HURRY_GRACE_MS),
  };
  const hurryButton =
    display.hurry === "on" && waitingOn !== null && waitingOn !== seat && !view.paused ? (
      <button
        type="button"
        className={`btn btn--sm btn--ghost phone__hurry-btn${cooldown || settling ? " phone__hurry-btn--resting" : ""}`}
        style={cooldown || settling ? restingStyle : undefined}
        disabled={api.busy || cooldown !== null || settling}
        aria-label={
          cooldown
            ? `${cooldown.by === seat ? "You" : nameOf(cooldown.by)} hurried ${nameOf(cooldown.seat)}: hurry up again in ${cooldownSeconds} seconds`
            : settling
              ? `${nameOf(waitingOn)}'s turn has only just started: hurry up in ${graceSeconds} seconds`
              : `Hurry up ${nameOf(waitingOn)}: flash their screen`
        }
        onClick={() => void api.act({ type: "hurry" })}
      >
        {/* "Hurried" while it is this wait that was nudged; once the turn has
            moved on, the button is only resting. */}
        {cooldown?.seat === waitingOn ? "Hurried" : "Hurry up"}
        {cooldown ? ` ${cooldownSeconds}s` : settling ? ` ${graceSeconds}s` : null}
      </button>
    ) : null;

  // A win on offer, off the discard or self-drawn, with what it would score.
  const winOnOffer = view.claim?.options.find((o) => o.type === "win")?.score ?? view.actions?.winScore ?? null;
  const faanToggle = winOnOffer ? (
    <FaanToggle score={winOnOffer} open={faanOpen} onToggle={() => setFaanOpen((o) => !o)} />
  ) : null;

  // Gone once the moment has passed, without waiting for the next poll to say so.
  const takeBackButton =
    takeBackLeft !== null && takeBackLeft > 0 ? (
      <button
        type="button"
        className="btn btn--sm phone__hurry-btn phone__hurry-btn--resting phone__take-back"
        style={{ "--left": Math.min(1, takeBackLeft / TAKE_BACK_MS) } as CSSProperties}
        disabled={api.busy}
        aria-label={`Take back ${view.lastDiscard ? tileName(view.lastDiscard.tile.code) : "your discard"}`}
        onClick={() => void api.act({ type: "takeBack" })}
      >
        Take back
      </button>
    ) : null;

  // Only while a hand is live and turned up: the helper reads the tiles in it.
  const helperAvailable =
    display.helper === "on" && (view.phase === "action" || view.phase === "claiming");
  const showHelper = helperAvailable && helperOpen && !hidden;

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
            disabled={api.busy || view.paused}
            aria-label={`More time: add ${MORE_TIME_MS / 1000} seconds, once per turn`}
            onClick={() => void api.act({ type: "moreTime" })}
          >
            +{MORE_TIME_MS / 1000}s
          </button>
        )}
      </>
    ) : null;

  const resultKey = `${view.handNumber}-${view.phase}`;
  // The end of the game has its standings to show even when it was ended mid-hand.
  const showResult = over && (result !== null || view.phase === "gameOver") && resultAside !== resultKey;
  const promptLine = (
    <p className={`phone__prompt${yourTurn || view.claim ? " phone__prompt--live" : ""}`}>
      {prompt}
      {hurriedNote ? <span className="phone__hurried-note">{hurriedNote}</span> : null}
      {over && (result || view.phase === "gameOver") && !showResult ? (
        <button type="button" className="btn btn--sm phone__result-open" onClick={() => setResultAside(null)}>
          Result
        </button>
      ) : null}
    </p>
  );

  const sets = (
    <>
      {me.melds.map((m, i) => (
        <MeldRow
          key={`m${i}`}
          meld={m}
          fresh={forming?.index === i && forming.landed}
          arriving={forming?.index === i && !forming.landed}
        />
      ))}
      {me.flowers.length > 0 ? (
        <span className="meld phone__flowers">
          {me.flowers.map((t) => (
            <TileFace key={t.id} code={t.code} size="sm" className={bonusClass(t.code, me)} />
          ))}
        </span>
      ) : null}
    </>
  );
  const hasSets = me.melds.length > 0 || me.flowers.length > 0;
  const exposed =
    hasSets || takeBackButton ? (
      <div className="seat__row phone__melds">
        {hasSets ? (
          <button
            type="button"
            className="phone__sets"
            aria-label="Enlarge your open sets and flowers"
            onClick={() => setZoomed(true)}
          >
            {sets}
          </button>
        ) : null}
        {/* To the right of the flowers: up out of the way of the hand and the
            buttons for the next move, where a hurried tap cannot find it. */}
        {takeBackButton}
      </div>
    ) : null;
  // Recent plays fill the space the buttons use, only while nothing there is
  // waiting on a decision.
  const idle =
    !view.claim &&
    !view.actions?.canWin &&
    (view.actions?.kongs?.length ?? 0) === 0 &&
    view.phase !== "handOver" &&
    view.phase !== "gameOver";

  // Shelves split the hand in two rows by suit; the face-down hand is halved,
  // so its split says nothing about the suits in it.
  const shelfAt = shelves ? shelfBreak(order.tiles.map((t) => t.code), order.drawn ? 1 : 0) : 0;
  const shelfLong = Math.max(shelfAt, order.tiles.length - shelfAt + (order.drawn ? 1.3 : 0));
  const hiddenAt = Math.ceil(me.hand.length / 2);
  const shelfGap = (i: number, at: number, of: number) =>
    shelves && i === at && i > 0 && i < of ? <span className="hand__shelf" aria-hidden /> : null;

  const handTile = (t: Tile, drawn: boolean) => {
    const mark = marks.get(t.id);
    return (
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
        // "Discard" only when a press would throw it; otherwise the tile is
        // just a tile, there to be read or moved along the hand.
        ariaLabel={`${yourTurn ? "Discard " : ""}${tileName(t.code)}${
          mark ? `, ${SET_SPOKEN[mark.kind]}${mark.faan > 0 ? ` ${mark.faan} faan` : ""}` : ""
        }`}
      >
        {mark ? (
          <span
            className={`tile__set tile__set--${mark.kind}${mark.faan >= 2 ? " tile__set--double" : ""}`}
            aria-hidden
          />
        ) : null}
        {badged.has(t.id) ? (
          <span className="tile__set-faan" aria-hidden>
            +{mark!.faan}
          </span>
        ) : null}
      </TileButton>
    );
  };

  return (
    <div
      className={[
        "phone",
        "phone--landscape",
        shelves ? "phone--shelves" : "phone--rail",
        `phone--size-${display.size}`,
        // Your move — your turn or your call on a discard — lit in the same
        // colour the table lights your rack with.
        yourTurn || view.claim ? "phone--acting" : "",
        hurriedBy !== null ? "phone--hurried" : "",
        showResult ? "phone--result" : "",
        display.stretch === "on" && !shelves ? "phone--stretch" : "",
        docked ? "phone--ponds" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDownCapture={onFirstTouch}
      onPointerDown={onSwipeStart}
      onPointerMove={onSwipeMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeEnd}
      ref={rootRef}
    >
      <header className="phone__bar">
        <span className="phone__seat">
          <span className="phone__wind" aria-hidden>
            {tileGlyph(seatWind(seat))}
          </span>
          <span className="phone__name">{nameOf(seat)}</span>
          <span> · {SEAT_NAMES[seat]}</span>
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
        <span className="phone__bar-gap" />
        {/* Which screen this is, of the ones a swipe moves through. */}
        <span className="phone__pages" aria-hidden>
          {pages.map((p) => (
            <span key={p} className={p === page ? "phone__page phone__page--on" : "phone__page"} />
          ))}
        </span>
        {helperAvailable ? (
          <HelperButton
            open={helperOpen}
            onToggle={() => setHelperOpen((o) => !o)}
            className="btn btn--sm btn--ghost phone__toggle"
          />
        ) : null}
        {docked ? null : (
          <button
            type="button"
            className="btn btn--sm btn--ghost phone__toggle phone__ponds-btn"
            aria-pressed={pondsOpen}
            aria-label={pondsOpen ? "Put away everyone's discards" : "Show everyone's discards"}
            title="Everyone's discards — or swipe right across the middle"
            onClick={() => setPage((current) => (current === "discards" ? "hand" : "discards"))}
          >
            <PondsIcon />
          </button>
        )}
        <button
          type="button"
          className="btn btn--sm btn--ghost phone__toggle phone__summary-btn"
          aria-pressed={summaryOpen}
          aria-label={summaryOpen ? "Put away chips and achievements" : "Show chips and achievements"}
          title="Chips and achievements — or swipe right past the discards"
          onClick={() => setPage((current) => (current === "summary" ? "hand" : "summary"))}
        >
          <TrophyIcon />
        </button>
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
          <EyeIcon open={hidden} />
        </button>
        {sound ? (
          <SettingsMenu>
            <PhoneSettings
              sound={sound}
              config={view.config}
              appearance={appearance}
              fullscreen={fullscreen}
              wakeLock={display.keepAwake === "on" ? wakeLock : undefined}
              tableTakeBack={view.settings.takeBack !== false}
              layout={layout}
              display={display}
              sort={order}
              table={tableName(view.roomId)}
              onLeave={() => void api.leave()}
            />
          </SettingsMenu>
        ) : null}
      </header>

      {/* The play: the tile in question, what to do, and the clock. */}
      <div className="phone__status phone__now">
        {lastPlayed}
        {promptLine}
        {/* Always there, empty or not, so the clock or Hurry up arriving in it
            never moves the tile and the words above. */}
        <span className="phone__now-row">
          {turnTimer}
          {hurryButton}
        </span>
      </div>

      {exposed}

      {docked || pondsOpen ? (
        <MiniPonds
          players={view.players}
          you={seat}
          newestId={view.lastPlayed?.tile.id ?? null}
          order={display.pondOrder}
          // Sorting the discards counts what has gone for you, so it is one of the helper's assists.
          onOrder={display.helper === "on" ? display.setPondOrder : undefined}
          nameOf={nameOf}
          onClose={docked ? undefined : () => setPage("hand")}
        />
      ) : null}
      {summaryOpen ? (
        <PhoneSummary view={view} you={seat} nameOf={nameOf} onClose={() => setPage("hand")} />
      ) : null}

      {/* The hand is always last, with the choices and the helper above it, so
          nothing that comes and goes can push it off the bottom or cover it. */}
      <div className="phone__dock">
        <div className="phone__controls">
          {display.playLog === "on" && idle ? (
            <PlayLog log={view.log} hand={view.handNumber} players={view.players} />
          ) : null}
          {faanOpen && winOnOffer ? <FaanPreview score={winOnOffer} /> : null}
          {view.paused ? (
            <div className="confirm-bar confirm-bar--note phone__paused" role="status">
              <span className="confirm-bar__text">Paused by the table. Your clock has stopped.</span>
            </div>
          ) : null}
          {standIn > 0 ? (
            <div className="confirm-bar confirm-bar--note" role="status">
              <span className="confirm-bar__text">
                The computer played {standIn} {standIn === 1 ? "turn" : "turns"} for you.
              </span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setStandInSeen(standIn)}>
                OK
              </button>
            </div>
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
                fresh={view.version}
                allowance={view.claim.allowance}
                onMoreTime={view.claim.canExtend ? () => void api.act({ type: "moreTime" }) : undefined}
                busy={api.busy || view.paused}
                running={!view.paused}
                onClaim={(optionId) => {
                  setPreview(null);
                  void api.act({ type: "claim", optionId });
                }}
                onPreview={setPreview}
                faan={faanToggle}
                concealed={hidden}
              />
            ) : (
              <>
                {view.phase === "handOver" ? (
                  <ReadyUp view={view} seat={seat} nameOf={nameOf} busy={api.busy} onReady={ready} />
                ) : null}
                {view.actions?.canWin ? (
                  <button
                    type="button"
                    className="btn btn--win phone__win"
                    disabled={api.busy || view.paused}
                    onClick={() => void api.act({ type: "win" })}
                  >
                    Win 自摸
                  </button>
                ) : null}
                {faanToggle}
                {(view.actions?.kongs ?? []).map((kong) => (
                  <button
                    key={`${kong.kind}-${kong.code}`}
                    type="button"
                    className="btn btn--primary"
                    disabled={api.busy || view.paused}
                    onClick={() => void api.act({ type: "kong", kind: kong.kind, code: kong.code })}
                  >
                    {kong.kind === "concealed" ? "Kong" : "Add to kong"}
                    {/* Which four you hold is the hand's business while it is face down. */}
                    {hidden ? null : (
                      <span className="btn__preview">
                        <TileFace code={kong.code} size="sm" />
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <span id={keysHint} className="sr-only">
          Alt and the left or right arrow move a tile along your hand.
        </span>
        {showHelper ? (
          <HelperPanel
            hand={me.hand}
            melds={me.melds}
            seats={view.players}
            seatWind={seatWind(seat)}
            roundWind={view.roundWind}
            config={view.config}
          />
        ) : null}

        {hidden ? (
          <button
            type="button"
            className="phone__hand phone__hand--hidden"
            style={handFill(me.hand.length, false, hiddenAt)}
            aria-label={`Hand hidden, ${me.hand.length} tiles. Show hand`}
            onClick={() => setHidden(false)}
          >
            {me.hand.map((t, i) => (
              <Fragment key={t.id}>
                {shelfGap(i, hiddenAt, me.hand.length)}
                <TileBack size="lg" />
              </Fragment>
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
            style={handFill(order.tiles.length + (order.drawn ? 1 : 0), order.drawn !== undefined, shelfLong)}
            role="group"
            aria-label="Your hand"
            aria-describedby={keysHint}
            onPointerDown={onHandPointerDown}
            onPointerMove={onHandPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onHandKeyDown}
          >
            {order.tiles.map((t, i) => (
              <Fragment key={t.id}>
                {shelfGap(i, shelfAt, order.tiles.length)}
                {handTile(t, t.id === view.drawnTileId)}
              </Fragment>
            ))}
            {order.drawn ? (
              <>
                <span className="hand__gap" aria-hidden />
                {handTile(order.drawn, true)}
              </>
            ) : null}
          </div>
        )}
      </div>
      {showResult ? (
        <PhoneResult
          view={view}
          seat={seat}
          nameOf={nameOf}
          onHide={() => setResultAside(resultKey)}
          ready={
            view.phase === "handOver" ? (
              <ReadyUp view={view} seat={seat} nameOf={nameOf} busy={api.busy} onReady={ready} />
            ) : null
          }
        />
      ) : null}
      {hurriedBy !== null ? (
        <div className="phone__hurry" role="alert">
          <span className="phone__hurry-text">{hurriedBy} says hurry up!</span>
        </div>
      ) : null}
      {zoomed && hasSets ? (
        <button
          type="button"
          className="phone__zoom"
          aria-label="Close the enlarged sets"
          onClick={() => setZoomed(false)}
        >
          <span className="phone__zoom-sets">{sets}</span>
          {me.flowers.some((t) => bonusClass(t.code, me)) ? (
            <span className="phone__zoom-note">Faded flowers score nothing for your seat.</span>
          ) : null}
        </button>
      ) : null}
      {yourWin ? (
        <Confetti
          key={`confetti-${view.handNumber}`}
          count={confettiCount(yourWin.scoredFaan)}
          seed={view.handNumber * 7919 + seat}
          spread={260}
          style={{ left: "50%", top: "45%" }}
        />
      ) : null}
      <AchievementToasts view={view} mine={seat} />
      {forming && !forming.landed ? (
        <FormingMeld key={forming.key} meld={forming.meld} onDone={forming.land} />
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
