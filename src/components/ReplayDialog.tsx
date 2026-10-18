"use client";

import { useEffect, useRef, useState } from "react";
import { type ReplayFrame, readyOn } from "@/game/replay";
import { SEAT_NAMES, type Seat, nextSeat, tileName } from "@/game/tiles";
import { TileFace } from "./TileView";
import { MeldRow } from "./SeatPanel";

interface Props {
  frames: ReplayFrame[];
  handNumber: number;
  humanSeat: Seat;
  onClose: () => void;
}

/**
 * A finished hand, one logged move at a time, with every hand face up — the
 * question it answers is "what was I waiting on, and where did it go wrong".
 * Nothing moves on its own: stepping is the player's, so there is no motion
 * to tone down.
 */
export function ReplayDialog({ frames, handNumber, humanSeat, onClose }: Props) {
  const last = frames.length - 1;
  const [at, setAt] = useState(last);
  const slider = useRef<HTMLInputElement>(null);
  const frame = frames[Math.min(at, last)];

  // A button that reaches the start or the end disables itself and drops
  // focus to the page, so focus moves to the slider there instead.
  const go = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    setAt(next);
    if (next === 0 || next === last) slider.current?.focus();
  };
  const step = (by: number) => go(at + by);

  useEffect(() => {
    slider.current?.focus();
  }, []);

  // Listened for on the document, not the dialog: keys pressed with focus on
  // the page itself would never reach the dialog's own handler.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.key === "Escape") onClose();
    // The slider moves itself with the arrows.
    if (document.activeElement === slider.current) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // You at the top, then round the table in turn order.
  const order: Seat[] = [0, 1, 2, 3].map((i) => nextSeat(humanSeat, i));
  const waits = readyOn(frame, humanSeat);

  return (
    <div className="modal__backdrop">
      <div
        className="modal modal--wide replay"
        role="dialog"
        aria-modal="true"
        aria-label={`Replay of hand ${handNumber}`}
      >
        <h2 className="modal__title">Replay · hand {handNumber}</h2>
        <p className="replay__step" aria-live="polite">
          <span className="replay__count">
            {at === 0 ? "The deal" : `Move ${at} of ${last}`}
          </span>{" "}
          {frame.text}
        </p>

        <div className="replay__controls">
          <button type="button" className="btn btn--sm" onClick={() => go(0)} disabled={at === 0}>
            Deal
          </button>
          <button type="button" className="btn btn--sm" onClick={() => step(-1)} disabled={at === 0}>
            Back
          </button>
          <input
            ref={slider}
            className="replay__slider"
            type="range"
            min={0}
            max={last}
            value={at}
            aria-label="Move"
            aria-valuetext={at === 0 ? "The deal" : `Move ${at} of ${last}`}
            onChange={(e) => setAt(Number(e.target.value))}
          />
          <button type="button" className="btn btn--sm" onClick={() => step(1)} disabled={at === last}>
            Next
          </button>
          <button type="button" className="btn btn--sm" onClick={() => go(last)} disabled={at === last}>
            End
          </button>
        </div>

        <div className="replay__seats">
          {order.map((seat) => {
            const p = frame.players[seat];
            const you = seat === humanSeat;
            return (
              <section
                key={seat}
                className={`replay__seat${frame.turn === seat && !frame.over ? " replay__seat--turn" : ""}`}
                aria-label={you ? `${SEAT_NAMES[seat]} (you)` : SEAT_NAMES[seat]}
              >
                <h3 className="replay__name">
                  {SEAT_NAMES[seat]}
                  {you ? " (you)" : ""}
                  {frame.turn === seat && !frame.over ? <span className="replay__badge">On turn</span> : null}
                </h3>
                <div className="replay__row">
                  {p.hand.map((code, i) => (
                    <TileFace key={`h${i}`} code={code} size="sm" />
                  ))}
                  {p.melds.map((meld, i) => (
                    <MeldRow key={`m${i}`} meld={meld} />
                  ))}
                  {p.flowers.length > 0 ? (
                    <span className="meld">
                      {p.flowers.map((code, i) => (
                        <TileFace key={`f${i}`} code={code} size="sm" />
                      ))}
                    </span>
                  ) : null}
                </div>
                {p.discards.length > 0 ? (
                  <div className="replay__pond" aria-label={`${SEAT_NAMES[seat]}'s discards`}>
                    {p.discards.map((code, i) => (
                      <TileFace
                        key={`d${i}`}
                        code={code}
                        size="sm"
                        justDiscarded={
                          frame.discard?.from === seat && i === p.discards.length - 1 && frame.discard.code === code
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {you && waits.length > 0 ? (
                  <p className="replay__ready">
                    Ready on {waits.map((code) => tileName(code)).join(", ")}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
