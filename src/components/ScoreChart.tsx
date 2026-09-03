"use client";

import { useState } from "react";
import type { HandRecord } from "@/game/engine";
import { SEAT_NAMES, type Seat } from "@/game/tiles";

/**
 * Cumulative score by hand — a four-series line chart.
 *
 * Colors are categorical slots 1–4 of the reference dark palette, validated
 * against this panel's dark-green surface (#0e3428): worst adjacent CVD ΔE 8.4,
 * normal-vision ΔE 19.8, all four above 3:1 contrast. Identity is never carried
 * by color alone — every series is direct-labeled and listed in the legend, and
 * the modal shows the same numbers as a table.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"];

const W = 640;
const H = 250;
const PAD = { top: 16, right: 104, bottom: 30, left: 46 };

/** Round a range out to readable tick values. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function ScoreChart({ history }: { history: HandRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);

  // Every player starts on zero, so the line has a point to leave from.
  const series: number[][] = [[0, 0, 0, 0], ...history.map((h) => h.scores)];
  const n = series.length;
  const all = series.flat();
  const rawMin = Math.min(...all, 0);
  const rawMax = Math.max(...all, 0);
  const pad = Math.max((rawMax - rawMin) * 0.12, 4);
  const minY = rawMin - pad;
  const maxY = rawMax + pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => (n === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + ((maxY - v) / (maxY - minY)) * plotH;

  const ticks = niceTicks(minY, maxY);
  const seats: Seat[] = [0, 1, 2, 3];
  const finals = series[n - 1];
  // Nudge end labels apart when two players finish on similar scores.
  const labelOrder = [...seats].sort((a, b) => finals[b] - finals[a]);
  const labelY = new Map<Seat, number>();
  let lastY = -Infinity;
  for (const seat of labelOrder) {
    const wanted = Math.max(y(finals[seat]), lastY + 15);
    labelY.set(seat, wanted);
    lastY = wanted;
  }

  return (
    <figure className="chart">
      <figcaption className="chart__title">Cumulative score by hand</figcaption>

      <div className="chart__legend">
        {seats.map((seat) => (
          <span className="chart__legend-item" key={`legend-${seat}`}>
            <span className="chart__swatch" style={{ background: SERIES_COLORS[seat] }} />
            {SEAT_NAMES[seat]}
          </span>
        ))}
      </div>

      <div className="chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative score by hand">
          {ticks.map((t) => (
            <g key={`tick-${t}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? "chart__zero" : "chart__grid"}
              />
              <text x={PAD.left - 8} y={y(t) + 4} className="chart__axis" textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {series.map((_, i) =>
            i === 0 || i % Math.ceil(n / 8) === 0 || i === n - 1 ? (
              <text key={`xt-${i}`} x={x(i)} y={H - 10} className="chart__axis" textAnchor="middle">
                {i === 0 ? "start" : i}
              </text>
            ) : null,
          )}

          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="chart__crosshair" />
          ) : null}

          {seats.map((seat) => (
            <g key={`series-${seat}`}>
              <polyline
                fill="none"
                stroke={SERIES_COLORS[seat]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={series.map((s, i) => `${x(i)},${y(s[seat])}`).join(" ")}
              />
              {series.map((s, i) => (
                <circle
                  key={`pt-${seat}-${i}`}
                  cx={x(i)}
                  cy={y(s[seat])}
                  r={hover === i ? 5 : 4}
                  fill={SERIES_COLORS[seat]}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}

          {seats.map((seat) => (
            <g key={`label-${seat}`}>
              <circle cx={W - PAD.right + 12} cy={labelY.get(seat)! - 4} r={4} fill={SERIES_COLORS[seat]} />
              <text x={W - PAD.right + 22} y={labelY.get(seat)!} className="chart__label">
                {SEAT_NAMES[seat]} {finals[seat] > 0 ? `+${finals[seat]}` : finals[seat]}
              </text>
            </g>
          ))}

          {series.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={x(i) - plotW / Math.max(n - 1, 1) / 2}
              y={PAD.top}
              width={plotW / Math.max(n - 1, 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>

        {hover !== null ? (
          <div
            className="chart__tooltip"
            // Pinned to the corner away from the cursor, so it never covers the
            // point being inspected.
            style={hover < n / 2 ? { right: 8 } : { left: 8 }}
            role="status"
          >
            <div className="chart__tooltip-title">
              {hover === 0 ? "Start" : `After hand ${hover}`}
            </div>
            {[...seats]
              .sort((a, b) => series[hover][b] - series[hover][a])
              .map((seat) => (
                <div className="chart__tooltip-row" key={`tt-${seat}`}>
                  <span className="chart__swatch" style={{ background: SERIES_COLORS[seat] }} />
                  <span className="chart__tooltip-name">{SEAT_NAMES[seat]}</span>
                  <span className="chart__tooltip-value">
                    {series[hover][seat] > 0 ? `+${series[hover][seat]}` : series[hover][seat]}
                  </span>
                </div>
              ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
