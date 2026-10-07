import { type Browser, type Page, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, presetPreferences, watchErrors } from "./helpers";

/** Its own table, so a solo run elsewhere can never be sitting in this one. */
const ROOM = "TABLE2";

async function open(
  browser: Browser,
  viewport: { width: number; height: number },
  touch: boolean,
  still = false,
) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: still ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await presetPreferences(page, {});
  return { context, page, errors: watchErrors(page) };
}

const phoneTiles = (phone: Page) => phone.locator(".phone__hand [data-tile-id]");
const tableDiscards = (table: Page, seat: number) =>
  table.locator(`.discards[data-seat="${seat}"] .tile`);

test("a phone's discard lands on the table, once", async ({ browser, request }) => {
  // Whatever an earlier run left behind, the table starts empty.
  expect((await request.post(`/api/rooms/${ROOM}/reset`)).ok()).toBe(true);

  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  const deal = table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ });
  await expect(deal).toBeVisible();

  const phone = await open(browser, PHONE_LANDSCAPE, true);
  // Every buzz the phone asks for, in order, so the test can read them back.
  await phone.page.addInitScript(() => {
    const buzzes: unknown[] = [];
    (window as unknown as { buzzes: unknown[] }).buzzes = buzzes;
    navigator.vibrate = ((pattern: unknown) => {
      buzzes.push(pattern);
      return true;
    }) as typeof navigator.vibrate;
  });
  await phone.page.goto(`/room/${ROOM}?seat=0&name=Tester`);
  // The table's chair fills in from its own poll.
  await expect(table.page.getByText("Tester").first()).toBeVisible();

  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  // Skipping the deal clears it off the felt at once.
  const skip = table.page.getByRole("button", { name: "Skip the deal" });
  await skip.click();
  await expect(table.page.locator(".deal")).toHaveCount(0);
  await expect(skip).toHaveCount(0);

  // Every hand arrives face down on the phone; its owner turns it up.
  await phone.page.getByRole("button", { name: /Hand hidden, \d+ tiles/ }).tap();
  // East deals, and this phone is East: a person can open the hand whenever
  // their hand is up, deal or no deal.
  const live = phone.page.locator(".phone__hand [data-tile-id]:not([aria-disabled])");
  await expect(live.first()).toBeVisible({ timeout: 4_000 });
  await expect(phoneTiles(phone.page)).toHaveCount(14);
  // The turn arriving buzzes the phone, and the table runs East's clock.
  await expect
    .poll(() => phone.page.evaluate(() => (window as unknown as { buzzes: unknown[] }).buzzes))
    .toContainEqual([35]);
  await expect(table.page.locator('.rack[data-seat="0"] .rack__clock')).toBeVisible();

  // First tap arms the tile, the second throws it.
  const tile = live.first();
  await tile.tap();
  await expect(phone.page.getByRole("status").filter({ hasText: /^Discard / })).toBeVisible();
  await tile.tap();

  await expect(phoneTiles(phone.page)).toHaveCount(13);
  await expect(tableDiscards(table.page, 0)).toHaveCount(1);
  // Still one after the next poll: a second throw on the way would land now.
  await table.page.waitForTimeout(2500);
  await expect(tableDiscards(table.page, 0)).toHaveCount(1);
  await expect(phoneTiles(phone.page)).toHaveCount(13);

  expect(table.errors).toEqual([]);
  expect(phone.errors).toEqual([]);
  await table.context.close();
  await phone.context.close();
});

test("a table that does not animate the deal does not hold play for it", async ({ browser, request }) => {
  const room = "TABLE3";
  expect((await request.post(`/api/rooms/${room}/reset`)).ok()).toBe(true);

  const table = await open(browser, TABLET, false, true);
  await table.page.goto(`/room/${room}?seat=table`);
  // South, so the computer deals as East — and the computer is what the
  // room holds back while a deal is shown.
  const phone = await open(browser, PHONE_LANDSCAPE, true);
  await phone.page.goto(`/room/${room}?seat=1&name=Still`);
  await expect(table.page.getByText("Still").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();

  // Nothing to skip on a still screen, and nothing to wait for either: East's
  // first throw comes at the computer's 2.5 s pace, not after the 8 s deal.
  await expect(table.page.getByRole("button", { name: "Skip the deal" })).toHaveCount(0);
  await expect(table.page.locator(".console__spot")).toBeVisible({ timeout: 6_000 });

  expect(table.errors).toEqual([]);
  expect(phone.errors).toEqual([]);
  await table.context.close();
  await phone.context.close();
});
