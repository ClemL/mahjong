"use client";

import type { ScoreResult } from "@/game/scoring";

const PANEL_ID = "faan-preview";

/** The faan a win would score, as a button that opens the patterns behind it. */
export function FaanToggle({ score, open, onToggle }: { score: ScoreResult; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="btn btn--sm btn--ghost faan-toggle"
      aria-expanded={open}
      aria-controls={PANEL_ID}
      aria-label={`${score.scoredFaan} faan: ${open ? "hide" : "show"} what it is made of`}
      onClick={onToggle}
    >
      {score.scoredFaan} faan <span aria-hidden>{open ? "▴" : "▾"}</span>
    </button>
  );
}

/**
 * What a win would score before it is taken: each pattern and its faan, then
 * the total and what one payer would owe. It sits above the moves, never over
 * the hand, so the tiles it is about stay in view.
 */
export function FaanPreview({ score }: { score: ScoreResult }) {
  return (
    <section id={PANEL_ID} className="faan-preview" aria-label="What this win scores">
      <ul className="faan-preview__rows">
        {score.patterns.map((p, i) => (
          <li key={i} className="faan-preview__row">
            <span className="faan-preview__name">
              {p.name} <span className="faan-preview__zh">{p.chinese}</span>
            </span>
            <strong className="faan-preview__faan">{p.faan}</strong>
          </li>
        ))}
      </ul>
      <span className="faan-preview__total">
        {score.limitReached ? "Limit 滿糊 · " : ""}
        {score.scoredFaan} faan · {score.value} points a share
      </span>
    </section>
  );
}
