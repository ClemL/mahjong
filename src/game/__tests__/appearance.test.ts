import { describe, expect, it } from "vitest";
import {
  APPEARANCE_INIT_SCRIPT,
  DEFAULT_APPEARANCE,
  TILE_BACKS,
  TILE_BODIES,
  TILE_STYLES,
  normalizeAppearance,
} from "../appearance";

describe("normalizeAppearance", () => {
  it("falls back to the defaults for missing or unknown values", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ tiles: "runes", body: 3, backs: "plaid" })).toEqual(
      DEFAULT_APPEARANCE,
    );
  });

  it("keeps an appearance saved before the body and back settings existed", () => {
    expect(normalizeAppearance({ theme: "slate", suits: "mono", tiles: "numerals" })).toEqual({
      theme: "slate",
      suits: "mono",
      tiles: "numerals",
      body: "ivory",
      backs: "table",
    });
  });

  it("accepts every offered tile option", () => {
    for (const tiles of TILE_STYLES) expect(normalizeAppearance({ tiles: tiles.value }).tiles).toBe(tiles.value);
    for (const body of TILE_BODIES) expect(normalizeAppearance({ body: body.value }).body).toBe(body.value);
    for (const backs of TILE_BACKS) expect(normalizeAppearance({ backs: backs.value }).backs).toBe(backs.value);
  });
});

describe("APPEARANCE_INIT_SCRIPT", () => {
  it("restores every setting a stored appearance carries", () => {
    const saved = { theme: "midnight", suits: "classic", tiles: "western", body: "twotone", backs: "crimson" };
    const root = { dataset: {} as Record<string, string> };
    const run = new Function("localStorage", "document", APPEARANCE_INIT_SCRIPT);
    run({ getItem: () => JSON.stringify(saved) }, { documentElement: root });
    expect(root.dataset).toEqual(saved);
  });
});
