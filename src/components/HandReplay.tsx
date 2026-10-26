"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomView } from "@/game/room";
import { type ReplayStep, replaySteps } from "@/game/replay";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph, tileName } from "@/game/tiles";
import { TileBack, TileFace } from "./TileView";

const SEATS: Seat[] = [0, 1, 2, 3];
const STEP_MS = 900;
const CLAIMED: Record<"chow" | "pung" | "kong", string> = { chow: "chowed", pung: "punged", kong: "konged" };

/** One move in words, with the players' own names. */
export function describeStep(step: ReplayStep, name: (seat: Seat) => string): string {
  const play = step.play;
  if (!play || step.seat === null) return "The hand as dealt, before the first discard.";
  const who = name(step.seat);
  // A self-drawn win carries no tile: the one it went out on was never shown.
  if (play.kind === "win") {
    return play.from === undefined || play.tiles.length === 0
      ? `${who} drew the winning tile.`
      : `${who} won on ${name(play.from)}'s ${tileName(play.tiles[0])}.`;
  }
  const tile = tileName(play.tiles[0]);
  switch (play.kind) {
    case "discard":
      return `${who} threw ${tile}.`;
    default:
      if (play.from !== undefined) {
        return `${who} ${CLAIMED[play.kind]} ${tileName(step.taken ?? play.tiles[0])} from ${name(play.from)}.`;
      }
      return step.sets[step.seat].some((m) => m.kind === "kong" && !m.concealed && m.tiles[0] === play.tiles[0])
        ? `${who} added to the kong of ${tile}.`
        : `${who} declared a concealed kong of ${tile}.`;
  }
}

/**
 * The hand just finished, played back on the tablet move by move: the four
 * ponds filling and the sets going down in the order they did, each move said
 * in words. Step through it, scrub to any move, or let it play.
 */
export function HandReplay({
  view,
  name,
  onClose,
}: {
  view: RoomView;
  name: (seat: Seat) => string;
  onClose: () => void;
}) {
  const steps = useMemo(() => replaySteps(view.log, view.handNumber), [view.log, view.handNumber]);
  const lastIndex = steps.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = steps[Math.min(index, lastIndex)];

  useEffect(() => {
    if (!playing) return;
    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(lastIndex, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index, lastIndex]);

  const go = (to: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(lastIndex, to)));
  };

  return (
    <div className="result-sheet">
      <section
        className="result-sheet__card replay"
        role="dialog"
        aria-modal="false"
        aria-label={`Replay of hand ${view.handNumber}`}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLInputElement) return;
          if (e.key === "ArrowRight") go(index + 1);
          else if (e.key === "ArrowLeft") go(index - 1);
        }}
      >
        <header className="result-sheet__head">
          <div className="result-sheet__heading-block">
            <span className="result-sheet__kicker">
              Hand {view.handNumber} · replay · move {index} of {lastIndex}
            </span>
            <h2 className="result-sheet__title replay__caption" aria-live="polite">
              {describeStep(step, name)}
            </h2>
          </div>
          <div className="result-sheet__head-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Back to the result
            </button>
          </div>
        </header>

        <div className="replay__controls">
          <button type="button" className="btn btn--sm btn--ghost" aria-label="First move" disabled={index === 0} onClick={() => go(0)}>
            ⏮
          </button>
          <button type="button" className="btn btn--sm btn--ghost" aria-label="Previous move" disabled={index === 0} onClick={() => go(index - 1)}>
            ◀
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary replay__play"
            onClick={() => {
              if (index >= lastIndex) setIndex(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "Pause" : index >= lastIndex ? "Play again" : "Play"}
          </button>
          <button type="button" className="btn btn--sm btn--ghost" aria-label="Next move" disabled={index >= lastIndex} onClick={() => go(index + 1)}>
            ▶
          </button>
          <button type="button" className="btn btn--sm btn--ghost" aria-label="Last move" disabled={index >= lastIndex} onClick={() => go(lastIndex)}>
            ⏭
          </button>
          <input
            className="replay__scrub"
            type="range"
            min={0}
            max={lastIndex}
            value={index}
            aria-label="Move"
            onChange={(e) => go(Number(e.target.value))}
          />
        </div>

        <div className="replay__seats">
          {SEATS.map((seat) => (
            <section
              key={seat}
              className={`replay__seat${step.seat === seat ? " replay__seat--moved" : ""}`}
              aria-label={`${name(seat)}, ${SEAT_NAMES[seat]}`}
            >
              <h3 className="replay__who">
                <span aria-hidden>{tileGlyph(seatWind(seat))}</span> {name(seat)}
                {step.seat === seat ? <span className="replay__tag">moved</span> : null}
              </h3>
              <div className="replay__sets" aria-label="Sets laid down">
                {step.sets[seat].length === 0 ? <span className="replay__none">No sets down</span> : null}
                {step.sets[seat].map((set, i) => (
                  <span key={i} className="replay__set">
                    {set.tiles.map((code, j) =>
                      set.concealed && (j === 0 || j === set.tiles.length - 1) ? (
                        <TileBack key={j} size="sm" />
                      ) : (
                        <TileFace key={j} code={code} size="sm" />
                      ),
                    )}
                  </span>
                ))}
              </div>
              <div className="replay__pond" aria-label="Discards">
                {step.ponds[seat].map((code, i) => (
                  <TileFace
                    key={i}
                    code={code}
                    size="sm"
                    className={step.marked?.seat === seat && step.marked.index === i ? "replay__marked" : ""}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
