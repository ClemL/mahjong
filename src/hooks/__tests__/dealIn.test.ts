import { describe, expect, it } from "vitest";
import { DEAL_FLIGHT_MS, DEAL_MS, DEAL_STEP_MS, FLOWER_STEP_MS, WALL_BUILD_MS } from "@/game/room";
import { flowerLanding, stackLandings, stackOf } from "../useDealIn";

describe("the deal on a phone", () => {
  it("fills the hand four, four, four, then the rest", () => {
    expect([0, 3, 4, 7, 8, 11, 12, 13].map(stackOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("lands each stack when the table's deal reaches this seat's rack", () => {
    // The dealer's stacks are the first of each round of four; the next seat's a step after.
    const dealer = stackLandings(0, 0, true);
    expect(dealer[0]).toBe(WALL_BUILD_MS + DEAL_FLIGHT_MS);
    expect(dealer[1] - dealer[0]).toBe(4 * DEAL_STEP_MS);
    expect(stackLandings(1, 0, true)[0] - dealer[0]).toBe(DEAL_STEP_MS);
    // Seats count round from the dealer, whoever deals.
    expect(stackLandings(0, 3, true)).toEqual(stackLandings(1, 0, true));
    // The last stack lands before the table is done dealing.
    expect(Math.max(...stackLandings(3, 0, true))).toBeLessThanOrEqual(DEAL_MS);
  });

  it("lays opening flowers in the table's order, after the deal", () => {
    expect(flowerLanding(0, 0, true, 0)).toBe(DEAL_MS);
    expect(flowerLanding(3, 1, true, 0)).toBe(DEAL_MS + 3 * FLOWER_STEP_MS);
  });

  it("runs short without a table screen, where nothing waits for it", () => {
    const quick = stackLandings(2, 0, false);
    expect(quick).toEqual([...quick].sort((a, b) => a - b));
    expect(quick[3]).toBeLessThan(1500);
    expect(flowerLanding(5, 1, false, quick[3])).toBeGreaterThan(quick[3]);
  });
});
