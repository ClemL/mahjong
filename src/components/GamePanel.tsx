"use client";

import type { GameSettings } from "@/hooks/usePreferences";
import { MIN_FAAN_CHOICES } from "@/game/rules";
import { GAME_LENGTHS } from "./gameLength";
import { Choice } from "./Choice";

/** The house rules a table starts with when this device opens it in tablet mode. */
export function GamePanel({ api, note }: { api: GameSettings; note?: string }) {
  return (
    <section className="panel">
      <details open>
        <summary>House rules</summary>
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
            {note ? <span className="choice__hint">{note}</span> : null}
          </label>

          <Choice
            label="Game length"
            options={GAME_LENGTHS}
            value={String(api.rounds) as `${number}`}
            onChange={(value) => api.setRounds(Number(value))}
          />
        </div>
      </details>
    </section>
  );
}
