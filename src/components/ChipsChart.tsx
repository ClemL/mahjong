"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import type { HandRecord } from "@/game/engine";
import { STARTING_CHIPS } from "@/game/rules";
import type { Seat } from "@/game/tiles";

const SEATS: Seat[] = [0, 1, 2, 3];

const W = 640;
const H = 340;
const LEFT = 44;
const RIGHT = 118;
const TOP = 14;
const BOTTOM = 46;
/** The closest two end labels may sit before they are spread apart and led back to their lines. */
const LABEL_GAP = 16;

/** The series colour follows the seat, never the standings, so nobody changes colour. */
export function seriesColor(seat: Seat): string {
  return `var(--series-${seat + 1})`;
}

/** A short stroke of a seat's colour, to key its name: the mark, not the text, carries identity. */
export function LineKey({ seat }: { seat: Seat }) {
  return (
    <svg className="line-key" width="22" height="10" viewBox="0 0 22 10" aria-hidden>
      <line x1="1" y1="5" x2="21" y2="5" stroke={seriesColor(seat)} strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="5" r="3.5" fill={seriesColor(seat)} />
    </svg>
  );
}

function niceStep(span: number): number {
  for (const step of [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) {
    if (span / step <= 5) return step;
  }
  return 10000;
}

/** What happened in a hand, in a few words. */
export function describeHand(hand: HandRecord, name: (seat: Seat) => string): string {
  if (hand.type === "washout" || hand.winner === null) return "Washed out 流局";
  const how = hand.from === null ? `${name(hand.winner)} self-drawn` : `${name(hand.winner)} off ${name(hand.from)}`;
  const what = hand.pattern ? `${hand.pattern.name}, ${hand.faan} faan` : `${hand.faan} faan`;
  return `${how} · ${what}`;
}

/** End labels, spread apart where lines finish close together, kept inside the plot. */
function spread(ends: { seat: Seat; y: number }[]): Map<Seat, number> {
  const sorted = [...ends].sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  for (const [i, end] of sorted.entries()) placed.push(i === 0 ? end.y : Math.max(end.y, placed[i - 1] + LABEL_GAP));
  const overflow = placed[placed.length - 1] - (H - BOTTOM);
  if (overflow > 0) {
    for (let i = placed.length - 1; i >= 0; i--) {
      placed[i] = i === placed.length - 1 ? placed[i] - overflow : Math.min(placed[i], placed[i + 1] - LABEL_GAP);
    }
  }
  return new Map(sorted.map((end, i) => [end.seat, Math.max(TOP, placed[i])]));
}

/**
 * Everyone's chips after each hand of the game, from the chips they sat down
 * with: one line per seat, each in its seat's colour, named at its end. The
 * crosshair snaps to a hand and reads out every seat there; the same numbers
 * are in the table view, so nothing rests on hovering.
 */
export function ChipsChart({
  history,
  chips,
  name,
}: {
  history: readonly HandRecord[];
  /** Chips by seat, from the start to the end of each hand. */
  chips: number[][];
  name: (seat: Seat) => string;
}) {
  const [at, setAt] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const hands = history.length;
  const all = chips.flat();
  const step = niceStep(Math.max(...all, STARTING_CHIPS) - Math.min(0, ...all));
  const lo = Math.floor(Math.min(0, ...all) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...all) / step) * step);
  const x = (i: number) => LEFT + (i * (W - LEFT - RIGHT)) / Math.max(1, hands);
  const y = (v: number) => H - BOTTOM - ((v - lo) / (hi - lo)) * (H - BOTTOM - TOP);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const every = hands <= 8 ? 1 : hands <= 16 ? 4 : Math.ceil(hands / 16) * 4;
  const handTicks = Array.from({ length: hands }, (_, i) => i + 1).filter(
    (i) => i === 1 || i === hands || i % every === 0,
  );
  const ends = SEATS.map((seat) => ({ seat, y: y(chips[seat][hands]) }));
  const labels = spread(ends);
  const final = (seat: Seat) => chips[seat][hands];

  const pick = (clientX: number, clientY: number) => {
    // Read through the chart's own transform rather than its screen box: a
    // tablet held upright turns the page on its side, and across the glass is
    // then along the chart's height.
    const ctm = svg.current?.getScreenCTM?.();
    if (!ctm) return;
    const px = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse()).x;
    setAt(Math.max(0, Math.min(hands, Math.round(((px - LEFT) / (W - LEFT - RIGHT)) * hands))));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.clientY);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const from = at ?? hands;
      setAt(Math.max(0, Math.min(hands, from + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Escape") {
      setAt(null);
    }
  };

  const leader = [...SEATS].sort((a, b) => final(b) - final(a))[0];
  const summary =
    `Chips after each of ${hands} hands, from ${STARTING_CHIPS} each. ` +
    SEATS.map((seat) => `${name(seat)} ends on ${final(seat)}`).join(", ") +
    `. ${name(leader)} finishes ahead.`;
  const readout = at === null ? null : [...SEATS].sort((a, b) => chips[b][at] - chips[a][at]);

  return (
    <div
      className="chips-chart"
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => setAt((a) => a ?? hands)}
      onBlur={() => setAt(null)}
      aria-label="Chips chart. Left and right arrows step through the hands."
    >
      <svg
        ref={svg}
        className="chips-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setAt(null);
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={LEFT}
              x2={W - RIGHT}
              y1={y(v)}
              y2={y(v)}
              className={v === STARTING_CHIPS ? "chips-chart__start" : "chips-chart__grid"}
            />
            <text x={LEFT - 10} y={y(v) + 4} textAnchor="end" className="chips-chart__tick">
              {v}
            </text>
          </g>
        ))}
        {ticks.includes(STARTING_CHIPS) ? null : (
          <line x1={LEFT} x2={W - RIGHT} y1={y(STARTING_CHIPS)} y2={y(STARTING_CHIPS)} className="chips-chart__start" />
        )}
        <text x={LEFT + 4} y={y(STARTING_CHIPS) - 6} className="chips-chart__tick">
          start
        </text>
        {handTicks.map((i) => (
          <text key={i} x={x(i)} y={H - BOTTOM + 20} textAnchor="middle" className="chips-chart__tick">
            {i}
          </text>
        ))}
        <text x={(LEFT + W - RIGHT) / 2} y={H - 6} textAnchor="middle" className="chips-chart__tick">
          Hand
        </text>

        {at !== null ? <line x1={x(at)} x2={x(at)} y1={TOP} y2={H - BOTTOM} className="chips-chart__cross" /> : null}

        {SEATS.map((seat) => (
          <path
            key={seat}
            d={chips[seat].map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")}
            className="chips-chart__line"
            stroke={seriesColor(seat)}
          />
        ))}
        {SEATS.map((seat) => (
          <circle
            key={seat}
            cx={x(hands)}
            cy={y(final(seat))}
            r={4.5}
            fill={seriesColor(seat)}
            className="chips-chart__dot"
          />
        ))}
        {at !== null && at !== hands
          ? SEATS.map((seat) => (
              <circle
                key={seat}
                cx={x(at)}
                cy={y(chips[seat][at])}
                r={4.5}
                fill={seriesColor(seat)}
                className="chips-chart__dot"
              />
            ))
          : null}
        {SEATS.map((seat) => {
          const end = y(final(seat));
          const label = labels.get(seat)!;
          return (
            <g key={seat}>
              {Math.abs(label - end) > 2 ? (
                <line x1={x(hands) + 6} y1={end} x2={x(hands) + 14} y2={label} className="chips-chart__leader" />
              ) : null}
              <text x={x(hands) + 16} y={label + 4.5} className="chips-chart__label">
                {name(seat).length > 9 ? `${name(seat).slice(0, 8)}…` : name(seat)} {final(seat)}
              </text>
            </g>
          );
        })}
      </svg>

      {readout && at !== null ? (
        <div
          className={`chips-chart__tip${x(at) > W / 2 ? " chips-chart__tip--left" : ""}`}
          style={{ left: `${(x(at) / W) * 100}%` }}
          aria-hidden
        >
          <span className="chips-chart__tip-title">{at === 0 ? "Start" : `Hand ${at}`}</span>
          {at > 0 ? <span className="chips-chart__tip-what">{describeHand(history[at - 1], name)}</span> : null}
          <span className="chips-chart__tip-rows">
            {readout.map((seat) => (
              <span key={seat} className="chips-chart__tip-row">
                <LineKey seat={seat} />
                <strong>{chips[seat][at]}</strong>
                <span>{name(seat)}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The chart's numbers as a table: every hand, what happened, and everyone's chips after it. */
export function ChipsTable({
  history,
  chips,
  name,
}: {
  history: readonly HandRecord[];
  chips: number[][];
  name: (seat: Seat) => string;
}) {
  return (
    <div className="chips-table__scroll">
      <table className="chips-table">
        <thead>
          <tr>
            <th scope="col">Hand</th>
            <th scope="col">What happened</th>
            {SEATS.map((seat) => (
              <th key={seat} scope="col" className="chips-table__num">
                <LineKey seat={seat} /> {name(seat)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Start</th>
            <td />
            {SEATS.map((seat) => (
              <td key={seat} className="chips-table__num">
                {chips[seat][0]}
              </td>
            ))}
          </tr>
          {history.map((hand, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td>{describeHand(hand, name)}</td>
              {SEATS.map((seat) => {
                const paid = hand.payments[seat] ?? 0;
                return (
                  <td key={seat} className="chips-table__num">
                    {chips[seat][i + 1]}
                    {paid !== 0 ? (
                      <span className="chips-table__delta">{paid > 0 ? ` +${paid}` : ` −${-paid}`}</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
