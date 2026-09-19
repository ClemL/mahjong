import { describe, expect, it } from "vitest";
import { NAME_POOL, suggestName } from "../names";

describe("suggested names", () => {
  it("offers thirty distinct names that fit a seat card", () => {
    expect(NAME_POOL).toHaveLength(30);
    expect(new Set(NAME_POOL).size).toBe(30);
    // claimSeat truncates at sixteen characters.
    expect(NAME_POOL.every((name) => name.length <= 16)).toBe(true);
  });

  it("never suggests a name already in use at the table", () => {
    const taken = NAME_POOL.slice(0, 29);
    expect(suggestName(taken)).toBe(NAME_POOL[29]);
    // Case is not the point — "pikachu" is still Pikachu's chair.
    expect(suggestName(["pikachu"])).not.toBe("Pikachu");
  });

  it("falls back to the whole pool rather than returning nothing", () => {
    expect(NAME_POOL).toContain(suggestName(NAME_POOL));
  });
});
