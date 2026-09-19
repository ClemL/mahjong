/**
 * Suggested player names.
 *
 * Typing a name on a phone is the last bit of friction between scanning a code
 * and sitting down, so the seat picker arrives with one already filled in.
 *
 * Thirty first-generation Pokémon, all Basic — nothing that evolves from
 * something else. Pikachu, Jigglypuff, Snorlax and Chansey were Basic in
 * generation one and only picked up pre-evolutions in later games. The ordering
 * is rough: it leans on the 2020 Pokémon of the Year global poll and on plain
 * recognisability, neither of which is an authoritative ranking.
 */
export const NAME_POOL = [
  "Pikachu",
  "Eevee",
  "Charmander",
  "Bulbasaur",
  "Squirtle",
  "Mewtwo",
  "Mew",
  "Snorlax",
  "Lapras",
  "Ditto",
  "Gastly",
  "Cubone",
  "Dratini",
  "Abra",
  "Psyduck",
  "Growlithe",
  "Vulpix",
  "Machop",
  "Jigglypuff",
  "Meowth",
  "Magikarp",
  "Onix",
  "Scyther",
  "Articuno",
  "Zapdos",
  "Moltres",
  "Chansey",
  "Porygon",
  "Aerodactyl",
  "Tauros",
] as const;

/**
 * A name nobody at this table is already using. Falls back to the whole pool
 * once every suggestion is taken, which needs a table of thirty-one.
 */
export function suggestName(taken: readonly string[] = []): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const free = NAME_POOL.filter((name) => !used.has(name.toLowerCase()));
  const pool = free.length > 0 ? free : NAME_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}
