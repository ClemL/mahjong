"use client";

import { PLAYABLE_CODES } from "@/game/tiles";
import { SUIT_PALETTES, THEMES, TILE_BACKS, TILE_BODIES, TILE_STYLES } from "@/game/appearance";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { TileBack, TileFace } from "./TileView";
import { Choice } from "./Choice";

/** One sample of each suit, an honor and a back, so a choice can be judged at a glance. */
const PREVIEW = ["m5", "p3", "s7", "we", "dr"].filter((c) => PLAYABLE_CODES.includes(c));

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
            <TileBack size="md" />
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
            label="Tile body"
            options={TILE_BODIES}
            value={appearance.body}
            onChange={(value) => set("body", value)}
          />
          <Choice
            label="Tile backs"
            options={TILE_BACKS}
            value={appearance.backs}
            onChange={(value) => set("backs", value)}
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
