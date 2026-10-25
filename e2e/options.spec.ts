import { type Browser, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, expectNoSidewaysScroll, presetPreferences, watchErrors } from "./helpers";

/** Shared with the room spec; specs run one at a time and each resets it first. */
const ROOM = "TABLE2";

/**
 * Seats and resets are rate-limited per address, and every other spec spends
 * the same local allowance, so each device here has an address of its own.
 */
let address = 0;
const nextAddress = () => `10.0.4.${++address}`;

async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean, stored = {}) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: { "x-forwarded-for": nextAddress() },
  });
  const page = await context.newPage();
  await presetPreferences(page, {});
  await page.addInitScript((settings: Record<string, string>) => {
    for (const [key, value] of Object.entries(settings)) window.localStorage.setItem(key, value);
  }, stored);
  return { context, page, errors: watchErrors(page) };
}

test("a phone stretches its hand to the edges, and the table can end the game early", async ({ browser, request }) => {
  const reset = await request.post(`/api/rooms/${ROOM}/reset`, { headers: { "x-forwarded-for": nextAddress() } });
  expect(reset.ok()).toBe(true);

  const kris = await open(browser, PHONE_LANDSCAPE, true, {
    "hk-mahjong.hand-stretch": "on",
    // Take back is one of the assists, off unless the phone turns it on.
    "hk-mahjong.take-back": "on",
  });
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // The table deals in its own look, and every phone starts the game in it.
  const tableLook = { theme: "midnight", suits: "classic", tiles: "western", body: "bone", backs: "crimson", rev: 2 };
  const table = await open(browser, TABLET, false, { "hk-mahjong.appearance": JSON.stringify(tableLook) });
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await table.page.getByRole("button", { name: "Skip the deal" }).click();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  await expect
    .poll(() => kris.page.evaluate(() => ({ ...document.documentElement.dataset })))
    .toMatchObject({ theme: "midnight", suits: "classic", tiles: "western", body: "bone", backs: "crimson" });

  // Stretched, the hand runs from one edge of the screen to the other.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).tap();
  const tiles = kris.page.locator(".phone__hand .tile");
  await expect(tiles).toHaveCount(14);
  // Measured once the tile just drawn has settled into the hand.
  const right = async () => {
    const box = (await tiles.last().boundingBox())!;
    return box.x + box.width;
  };
  await expect.poll(right).toBeGreaterThanOrEqual(PHONE_LANDSCAPE.width - 6);
  await expect.poll(async () => (await tiles.first().boundingBox())!.x).toBeLessThanOrEqual(6);
  await expectNoSidewaysScroll(kris.page);
  // Keep awake and full screen live in the phone's settings, not on its bar.
  await expect(kris.page.locator(".phone__bar").getByRole("button", { name: /awake|full screen/i })).toHaveCount(0);
  await kris.page.getByRole("button", { name: /Settings/ }).first().tap();
  await expect(kris.page.getByRole("switch", { name: "Keep awake" })).toBeVisible();
  await expect(kris.page.getByRole("switch", { name: "Full screen" })).toBeVisible();
  await expect(kris.page.getByRole("switch", { name: "Take back" })).toHaveAttribute("aria-checked", "true");
  await kris.page.getByRole("button", { name: "Close" }).first().tap();
  await expect(kris.page.getByRole("switch", { name: "Keep awake" })).toHaveCount(0);

  // A tile thrown can be taken back in the moment after, and the table waits for it.
  const thrown = tiles.first();
  await thrown.tap();
  await thrown.tap();
  await expect(tiles).toHaveCount(13);
  // Up beside the flowers and open sets, away from the hand and the buttons for the next move.
  const takeBack = kris.page.getByRole("button", { name: /^Take back/ });
  await expect(kris.page.locator(".phone__melds").getByRole("button", { name: /^Take back/ })).toBeVisible();
  await takeBack.tap();
  await expect(tiles).toHaveCount(14);
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  await expect(table.page.locator('.discards[data-seat="0"] .tile')).toHaveCount(0);

  // The table ends the game mid-hand: straight to the final scores, everywhere.
  table.page.once("dialog", (dialog) => void dialog.accept());
  await table.page.getByRole("button", { name: "End game" }).first().click();
  const sheet = table.page.getByRole("dialog", { name: "Game complete" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/^Game ended early/)).toBeVisible();
  await expect(table.page.getByRole("button", { name: "End game" })).toHaveCount(0);
  await expect(kris.page.getByRole("region", { name: "Game complete" })).toBeVisible();

  // The final scores leave as a picture: saved, where there is no share sheet to hand it to.
  const saved = table.page.waitForEvent("download");
  await sheet.getByRole("button", { name: "Share scores" }).click();
  const picture = await saved;
  expect(picture.suggestedFilename()).toMatch(/^mahjong-[a-z0-9-]+-\d{8}_\d{4}\.png$/);
  await expect(sheet.getByRole("button", { name: "Image saved" })).toBeVisible();
  if (process.env.SCORE_CARD_OUT) await picture.saveAs(process.env.SCORE_CARD_OUT);

  // On a screen too short for it, the final scores scroll, and the card's
  // see-through colour runs the full length of it rather than one screenful.
  await table.page.setViewportSize({ width: TABLET.width, height: 480 });
  const covered = await sheet.evaluate((card) => {
    const scroller = card.scrollHeight > card.clientHeight ? card : card.parentElement!;
    const overflowing = scroller.scrollHeight > scroller.clientHeight;
    scroller.scrollTop = scroller.scrollHeight;
    return {
      overflowing,
      content: card.scrollHeight,
      backing: parseFloat(getComputedStyle(card, "::before").height),
    };
  });
  expect(covered.overflowing).toBe(true);
  expect(covered.backing).toBeGreaterThanOrEqual(covered.content - 1);

  expect(kris.errors).toEqual([]);
  expect(table.errors).toEqual([]);
  await kris.context.close();
  await table.context.close();
});
