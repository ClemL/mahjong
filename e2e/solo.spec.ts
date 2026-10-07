import { type Page, expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, expectNoSidewaysScroll, presetPreferences, watchErrors } from "./helpers";

/** Any seed deals a playable hand; a fixed one makes a failure replayable at /solo?seed=. */
const SEED = 20261007;

/** How many of your own turns the smoke test plays before calling it a pass. */
const TURNS = 8;

const yourHand = (page: Page) => page.getByRole("region", { name: "Your hand" });
const handTiles = (page: Page) => yourHand(page).locator(".hand__tiles button.tile--button");
const handResult = (page: Page) => page.getByRole("dialog", { name: /Hand result|Game complete/ });

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

  test("plays a run of turns on the felt: one discard per throw, hand sizes hold", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/solo?seed=${SEED}`);
    await expect(yourHand(page)).toBeVisible();
    // Wide enough for the felt: four racks, four ponds, the wall dealt from.
    await expect(page.locator(".felt .rack")).toHaveCount(4);
    const pause = page.getByRole("button", { name: /^(Pause|Resume)$/ });

    // Play waits for the deal, and skipping it hands play over at once.
    const playable = yourHand(page).locator("button.tile--button:not([disabled])");
    await expect(yourHand(page)).toContainText("Dealing");
    await expect(playable).toHaveCount(0);
    await page.getByRole("button", { name: "Skip the deal" }).click();
    await expect(playable.first()).toBeVisible({ timeout: 2_000 });

    let turns = 0;
    while (turns < TURNS) {
      const decision = await nextDecision(page);
      if (decision === "over") break;
      if (decision === "claim") {
        await yourHand(page).getByRole("button", { name: "Pass" }).click();
        continue;
      }

      // Hold the computer while this turn is checked, so nothing it does —
      // claiming the tile, or play coming round again — can blur the count.
      await pause.click();
      await expect(pause).toHaveText("Resume");

      // On your turn the hand is fourteen tiles counting each set as three,
      // whatever has been claimed. Your sets are on your rack, at the bottom.
      const hand = yourHand(page);
      const melds = await page.locator('.rack[data-seat="0"] .meld:not(.rack__flowers)').count();
      await expect(handTiles(page)).toHaveCount(14 - melds * 3);

      // A double-click must throw one tile, not two: the first click ends the
      // turn, and the second must find nothing it can throw.
      await hand.locator("button.tile--button:not([disabled])").first().dblclick();
      await expect(handTiles(page)).toHaveCount(13 - melds * 3);
      await expect(hand.locator("button.tile--button:not([disabled])")).toHaveCount(0);
      await page.waitForTimeout(300);
      await expect(handTiles(page)).toHaveCount(13 - melds * 3);

      await pause.click();
      await expect(pause).toHaveText("Pause");
      turns++;
    }

    expect(turns, "your turns played").toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("keeps the compact table on a phone held upright, and fits it", async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(PHONE_PORTRAIT);
    await page.goto(`/solo?seed=${SEED}`);
    await expect(yourHand(page)).toBeVisible();
    // Too narrow for the felt's racks; the grid, and no wait for a deal it does not show.
    await expect(page.locator(".felt")).toHaveCount(0);
    await expect(page.locator(".pond")).toBeVisible();
    await nextDecision(page);
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test("finishes a hand on a phone and reads out what everyone paid", async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(PHONE_PORTRAIT);
    await page.goto(`/solo?seed=${SEED}`);
    for (;;) {
      const decision = await nextDecision(page);
      if (decision === "over") break;
      const hand = yourHand(page);
      if (decision === "claim") await hand.getByRole("button", { name: "Pass" }).click();
      else await hand.locator("button.tile--button:not([disabled])").first().click();
    }
    // Each seat's payment is a pill with its text inside it. A gaming-chip
    // style once shared the class name and drew a coin over the words.
    const pills = handResult(page).locator(".modal__payments > *");
    await expect(pills).toHaveCount(4);
    for (const pill of await pills.all()) {
      await expect(pill).toHaveText(/^(East|South|West|North) [+-]?\d+$/);
      const fits = await pill.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.clientWidth > 40);
      expect(fits, "payment pill holds its text").toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
