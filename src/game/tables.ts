/**
 * The tables one deployment serves.
 *
 * Table 1 keeps the id the single table always had, so links, printed QR
 * codes and seats taken before there were three still land in the same place.
 */
export const TABLES = [
  { id: "TABLE", number: 1, name: "Table 1" },
  { id: "TABLE2", number: 2, name: "Table 2" },
  { id: "TABLE3", number: 3, name: "Table 3" },
] as const;

export type TableInfo = (typeof TABLES)[number];

/**
 * The table an id names, in any case, with TABLE1 accepted for the first —
 * it is what people type once they have seen Table 2 and Table 3. Null for
 * anything else.
 */
export function findTable(id: string): TableInfo | null {
  const upper = id.toUpperCase();
  const canonical = upper === "TABLE1" ? "TABLE" : upper;
  return TABLES.find((t) => t.id === canonical) ?? null;
}

/** "Table 2", for showing; the id itself if it is not one of ours. */
export function tableName(id: string): string {
  return findTable(id)?.name ?? id;
}
