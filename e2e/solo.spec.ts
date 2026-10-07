import { type Page, expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, expectNoSidewaysScroll, presetPreferences, watchErrors } from "./helpers";

/** Any seed deals a playable hand; a fixed one makes a failure replayable at /solo?seed=. */
const SEED = 20261007;

/** How many of your own turns the smoke test plays before calling it a pass. */
const TURNS = 8;

const yourHand = (page: Page) => page.getByRole("region", { name: "Your hand" });
const yourPond = (page: Page) =>
  page.locator(".pond__group").filter({ hasText: "(you)" }).locator(".pond__row .tile");
const handResult = (page: Page) => page.getByRole("dialog", { name: /Hand result|Round complete/ });

/**
 * Waits for whatever the table asks of you next: a tile to throw, a claim to
 * answer, or the hand to be over.
 */
async function nextDecision(page: Page): Promise<"discard" | "claim" | "over"> {
  const hand = yourHand(page);
  const discard = hand.locator("button.tile--button:not([disabled])").first();
  const pass = hand.getByRole("button", { name: "Pass" });
  const over = handResult(page);
  await expect(discard.or(pass).or(over).first()).toBeVisible({ timeout: 30_000 });
  if (await over.isVisible()) return "over";
  if (await pass.isVisible()) return "claim";
  return "discard";
}

test.describe("solo table", () => {
  test.beforeEach(async ({ page }) => {
    // Fast opponents and no claim prompts but a win, so the test spends its
    // time on your turns rather than waiting for the computer.
    await presetPreferences(page, { speed: "fast", claimPrompt: "wins", showHints: true });
  });

  test("plays a run of turns: one discard per throw, hand sizes hold", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/solo?seed=${SEED}`);
    await expect(yourHand(page)).toBeVisible();

    let turns = 0;
    while (turns < TURNS) {
      const decision = await nextDecision(page);
      if (decision === "over") break;
      if (decision === "claim") {
        await yourHand(page).getByRole("button", { name: "Pass" }).click();
        continue;
      }

      // On your turn the hand is fourteen tiles counting each set as three,
      // whatever has been claimed.
      const hand = yourHand(page);
      const tiles = await hand.locator(".hand__tiles button.tile--button").count();
      const melds = await hand.locator(".meld").count();
      expect(tiles + melds * 3, "tiles in hand on your turn").toBe(14);

      // A double-click must throw one tile, not two: the first click ends the
      // turn, and the second must find nothing it can throw.
      const before = await yourPond(page).count();
      await hand.locator("button.tile--button:not([disabled])").first().dblclick();
      await expect(yourPond(page)).toHaveCount(before + 1);
      await expect(hand.locator("button.tile--button:not([disabled])")).toHaveCount(0);
      turns++;
    }

    expect(turns, "your turns played").toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("fits a phone held upright", async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(PHONE_PORTRAIT);
    await page.goto(`/solo?seed=${SEED}`);
    await expect(yourHand(page)).toBeVisible();
    await nextDecision(page);
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });
});
