"use client";

import { PLAYABLE_CODES } from "@/game/tiles";
import { type Option, SUIT_PALETTES, THEMES, TILE_STYLES } from "@/game/appearance";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { TileFace } from "./TileView";

/** One sample of each suit plus an honor, so a choice can be judged at a glance. */
const PREVIEW = ["m5", "p3", "s7", "dr"].filter((c) => PLAYABLE_CODES.includes(c));

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <div className="choice">
      <span className="choice__label">{label}</span>
      <div className="choice__options" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice__btn${option.value === value ? " choice__btn--on" : ""}`}
            aria-pressed={option.value === value}
            title={option.hint}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {active ? <span className="choice__hint">{active.hint}</span> : null}
    </div>
  );
}

export function AppearancePanel({ api }: { api: AppearanceApi }) {
  const { appearance, set, reset } = api;
  return (
    <section className="panel">
      <details open>
        <summary>Table &amp; tiles</summary>

        <div className="appearance">
          <div className="appearance__preview" aria-label="Preview">
            {PREVIEW.map((code) => (
              <TileFace key={code} code={code} size="md" />
            ))}
          </div>

          <Choice
            label="Table"
            options={THEMES}
            value={appearance.theme}
            onChange={(value) => set("theme", value)}
          />
          <Choice
            label="Tile faces"
            options={TILE_STYLES}
            value={appearance.tiles}
            onChange={(value) => set("tiles", value)}
          />
          <Choice
            label="Suit colors"
            options={SUIT_PALETTES}
            value={appearance.suits}
            onChange={(value) => set("suits", value)}
          />

          <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      </details>
    </section>
  );
}
