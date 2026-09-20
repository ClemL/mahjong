"use client";

import type { MahjongApi, Speed } from "@/hooks/useMahjong";
import { MIN_FAAN_CHOICES } from "@/game/rules";
import { Choice, type ChoiceOption } from "./Choice";

const SPEEDS: ChoiceOption<Speed>[] = [
  { value: "slow", label: "Slow", hint: "A long pause between opponents' turns" },
  { value: "normal", label: "Normal", hint: "The default pace" },
  { value: "fast", label: "Fast", hint: "Opponents play almost immediately" },
];

const ON_OFF: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "" },
  { value: "off", label: "Off", hint: "" },
];

const HINTS = ON_OFF.map((o) => ({
  ...o,
  hint: o.value === "on" ? "Marks the tiles worth keeping in your hand" : "No help with your hand",
}));

const SOUND = ON_OFF.map((o) => ({
  ...o,
  hint: o.value === "on" ? "Clacks on discards, claims and wins" : "Silent",
}));

/** Everything about how the game plays that is not a move in it. */
export function GamePanel({ api }: { api: MahjongApi }) {
  return (
    <section className="panel">
      <details open>
        <summary>Game</summary>
        <div className="appearance">
          <label className="field">
            <span className="field__label">Min faan</span>
            <select
              className="field__select"
              value={api.minFaan}
              onChange={(e) => api.setMinFaan(Number(e.target.value))}
            >
              {MIN_FAAN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "0 (chicken)" : n === 3 ? "3 (HK standard)" : n}
                </option>
              ))}
            </select>
          </label>

          <Choice
            label="Speed"
            options={SPEEDS}
            value={api.speed}
            onChange={(value) => api.setSpeed(value)}
          />
          <Choice
            label="Hints"
            options={HINTS}
            value={api.showHints ? "on" : "off"}
            onChange={(value) => api.setShowHints(value === "on")}
          />
          <Choice
            label="Sound"
            options={SOUND}
            value={api.muted ? "off" : "on"}
            onChange={(value) => api.setMuted(value === "off")}
          />
        </div>
      </details>
    </section>
  );
}
