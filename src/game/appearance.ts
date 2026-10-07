/**
 * Table appearance: the theme, the suit coloring, and the tile's face, body
 * and back.
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
export type TileStyle = "pips" | "traditional" | "indexed" | "numerals" | "western";
export type TileBody = "ivory" | "bone" | "twotone" | "amber" | "flat";
export type TileBacks = "table" | "emerald" | "crimson" | "sapphire" | "gold" | "ebony";

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
  {
    value: "traditional",
    label: "Hong Kong",
    hint: "Painted in red, green and blue like a parlour set, with a framed White Dragon",
  },
  { value: "indexed", label: "Indexed", hint: "Pips with the number in the corner, as on Western sets" },
  { value: "numerals", label: "Numerals", hint: "Chinese numeral over the suit mark" },
  { value: "western", label: "Western", hint: "Arabic numeral over the suit mark — easiest to learn" },
];

export const TILE_BODIES: Option<TileBody>[] = [
  { value: "ivory", label: "Ivory", hint: "Warm cream with a polished bevel" },
  { value: "bone", label: "Bone", hint: "Cool bright white" },
  { value: "twotone", label: "Two-tone", hint: "White face on a colored backing, like a real set" },
  { value: "amber", label: "Amber", hint: "Honey-toned face" },
  { value: "flat", label: "Flat", hint: "No bevel or gloss — a clean printed look" },
];

export const TILE_BACKS: Option<TileBacks>[] = [
  { value: "table", label: "Match table", hint: "Follows the table color" },
  { value: "emerald", label: "Emerald", hint: "Deep green" },
  { value: "crimson", label: "Crimson", hint: "Lacquer red" },
  { value: "sapphire", label: "Sapphire", hint: "Royal blue" },
  { value: "gold", label: "Gold", hint: "Brass and ochre" },
  { value: "ebony", label: "Ebony", hint: "Near black" },
];

export interface Appearance {
  theme: Theme;
  suits: SuitPalette;
  tiles: TileStyle;
  body: TileBody;
  backs: TileBacks;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "jade",
  suits: "vivid",
  tiles: "traditional",
  body: "ivory",
  backs: "table",
};

export const STORAGE_KEY = "hk-mahjong.appearance";

/**
 * Stamped on every saved appearance. Pips was the default face before the Hong
 * Kong one, so a save without this stamp holding "pips" most likely never
 * chose it; it moves to Hong Kong once. A save made after this — including an
 * explicit return to Pips — carries the stamp and is left alone.
 */
export const APPEARANCE_REVISION = 2;

/** What goes into storage: the appearance plus the revision it was saved at. */
export function serializeAppearance(appearance: Appearance): string {
  return JSON.stringify({ ...appearance, rev: APPEARANCE_REVISION });
}

/** True when a stored value predates the revision stamp and needs migrating. */
export function needsMigration(raw: unknown): boolean {
  return (raw as { rev?: unknown } | null)?.rev !== APPEARANCE_REVISION;
}

/** Every setting, its allowed values and its data- attribute, in one table so
 *  normalizing, applying and the pre-paint script cannot drift apart. */
const FIELDS: { [K in keyof Appearance]: readonly Option<Appearance[K]>[] } = {
  theme: THEMES,
  suits: SUIT_PALETTES,
  tiles: TILE_STYLES,
  body: TILE_BODIES,
  backs: TILE_BACKS,
};

const FIELD_KEYS = Object.keys(FIELDS) as (keyof Appearance)[];

/** Coerce anything read back from storage into a valid appearance. */
export function normalizeAppearance(raw: unknown): Appearance {
  const value = (raw ?? {}) as Record<string, unknown>;
  const result = { ...DEFAULT_APPEARANCE } as Record<keyof Appearance, string>;
  for (const key of FIELD_KEYS) {
    if (FIELDS[key].some((o) => o.value === value[key])) result[key] = value[key] as string;
  }
  if (needsMigration(raw) && result.tiles === "pips") result.tiles = "traditional";
  return result as Appearance;
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of FIELD_KEYS) root.dataset[key] = appearance[key];
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
    var fields = ${JSON.stringify(
      Object.fromEntries(FIELD_KEYS.map((key) => [key, FIELDS[key].map((o) => o.value)])),
    )};
    var defaults = ${JSON.stringify(DEFAULT_APPEARANCE)};
    if (saved.rev !== ${APPEARANCE_REVISION} && saved.tiles === "pips") saved.tiles = "traditional";
    for (var key in fields) {
      root.dataset[key] = fields[key].indexOf(saved[key]) >= 0 ? saved[key] : defaults[key];
    }
  } catch (e) {
    /* A blocked or empty localStorage just means the defaults. */
  }
})();
`.trim();
