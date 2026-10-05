import type { ScoreResult } from "@/game/scoring";

/** Each pattern a winning hand scored, its faan, and the total that was paid on. */
export function FaanBreakdown({ score }: { score: ScoreResult }) {
  return (
    <ul className="faan-list" aria-label="Faan breakdown">
      {score.patterns.map((p) => (
        <li key={p.key} className="faan-list__row">
          <span className="faan-list__name">
            {p.name} <span className="faan-list__zh">{p.chinese}</span>
          </span>
          <span className="faan-list__faan">{p.faan}</span>
        </li>
      ))}
      <li className="faan-list__row faan-list__total">
        <span className="faan-list__name">
          {score.limitReached && score.scoredFaan < score.faan
            ? `Total ${score.faan}, paid at the ${score.scoredFaan} faan limit`
            : "Total"}
        </span>
        <span className="faan-list__faan">{score.scoredFaan}</span>
      </li>
    </ul>
  );
}
