"use client";

import type { ClaimPrompt } from "@/game/controller";
import type { StrategyName } from "@/game/ai";
import type { MahjongApi } from "@/hooks/useMahjong";
import { Choice, type ChoiceOption } from "./Choice";

const OPPONENTS: ChoiceOption<StrategyName>[] = [
  { value: "greedy", label: "Skilled", hint: "Discards to get closest to ready, and claims what helps" },
  { value: "random", label: "Random", hint: "Draws and discards at random — hands rarely finish" },
];

const CLAIM_PROMPTS: ChoiceOption<ClaimPrompt>[] = [
  { value: "useful", label: "Useful only", hint: "Asks when a claim would improve your hand" },
  { value: "always", label: "Every claim", hint: "Asks whenever anything at all is claimable" },
  { value: "wins", label: "Wins only", hint: "Never interrupts except to declare a win" },
];

export function PlayPanel({ api }: { api: MahjongApi }) {
  return (
    <section className="panel">
      <details open>
        <summary>Play</summary>
        <div className="appearance">
          <Choice
            label="Opponents"
            options={OPPONENTS}
            value={api.opponents}
            onChange={api.setOpponents}
          />
          <Choice
            label="Ask me about claims"
            options={CLAIM_PROMPTS}
            value={api.claimPrompt}
            onChange={api.setClaimPrompt}
          />
        </div>
      </details>
    </section>
  );
}
