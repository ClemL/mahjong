/**
 * Table appearance: the theme, the suit coloring and the tile face style.
 *
 * Each setting is applied as a `data-` attribute on the document element and
 * consumed entirely by CSS, so switching costs no React re-render and the
 * choice can be restored before first paint.
 */

export interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export type Theme = "jade" | "slate" | "mahogany" | "midnight" | "parchment";
export type SuitPalette = "vivid" | "classic" | "mono";
export type TileStyle = "pips" | "numerals";

export const THEMES: Option<Theme>[] = [
  { value: "jade", label: "Jade", hint: "The classic green felt" },
  { value: "slate", label: "Slate", hint: "Neutral dark grey" },
  { value: "mahogany", label: "Mahogany", hint: "Warm dark wood" },
  { value: "midnight", label: "Midnight", hint: "Deep blue" },
  { value: "parchment", label: "Parchment", hint: "A light table" },
];

export const SUIT_PALETTES: Option<SuitPalette>[] = [
  { value: "vivid", label: "Vivid", hint: "Blue, orange and green — furthest apart" },
  { value: "classic", label: "Classic", hint: "Traditional ink, blue and green" },
  { value: "mono", label: "Monochrome", hint: "One ink; the tile face carries the suit" },
];

export const TILE_STYLES: Option<TileStyle>[] = [
  { value: "pips", label: "Pips", hint: "Drawn dots and bamboo, as on a real set" },
  { value: "numerals", label: "Numerals", hint: "Chinese numeral over the suit mark" },
];

export interface Appearance {
  theme: Theme;
  suits: SuitPalette;
  tiles: TileStyle;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "jade",
  suits: "vivid",
  tiles: "pips",
};

export const STORAGE_KEY = "hk-mahjong.appearance";

const THEME_VALUES = new Set(THEMES.map((o) => o.value));
const SUIT_VALUES = new Set(SUIT_PALETTES.map((o) => o.value));
const TILE_VALUES = new Set(TILE_STYLES.map((o) => o.value));

/** Coerce anything read back from storage into a valid appearance. */
export function normalizeAppearance(raw: unknown): Appearance {
  const value = (raw ?? {}) as Partial<Appearance>;
  return {
    theme: THEME_VALUES.has(value.theme as Theme) ? (value.theme as Theme) : DEFAULT_APPEARANCE.theme,
    suits: SUIT_VALUES.has(value.suits as SuitPalette)
      ? (value.suits as SuitPalette)
      : DEFAULT_APPEARANCE.suits,
    tiles: TILE_VALUES.has(value.tiles as TileStyle)
      ? (value.tiles as TileStyle)
      : DEFAULT_APPEARANCE.tiles,
  };
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.suits = appearance.suits;
  root.dataset.tiles = appearance.tiles;
}

/**
 * Runs before hydration so a stored theme is on the element for the first
 * paint. Inlined into the document head as a string, hence no imports.
 */
export const APPEARANCE_INIT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var saved = raw ? JSON.parse(raw) : {};
    var root = document.documentElement;
    var themes = ${JSON.stringify(THEMES.map((o) => o.value))};
    var suits = ${JSON.stringify(SUIT_PALETTES.map((o) => o.value))};
    var tiles = ${JSON.stringify(TILE_STYLES.map((o) => o.value))};
    root.dataset.theme = themes.indexOf(saved.theme) >= 0 ? saved.theme : "jade";
    root.dataset.suits = suits.indexOf(saved.suits) >= 0 ? saved.suits : "vivid";
    root.dataset.tiles = tiles.indexOf(saved.tiles) >= 0 ? saved.tiles : "pips";
  } catch (e) {
    /* A blocked or empty localStorage just means the defaults. */
  }
})();
`.trim();
