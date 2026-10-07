import { type Browser, type Page, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, presetPreferences, watchErrors } from "./helpers";

/** Its own table, so a solo run elsewhere can never be sitting in this one. */
const ROOM = "TABLE2";

async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
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

  // Every hand arrives face down on the phone; its owner turns it up.
  await phone.page.getByRole("button", { name: /Hand hidden, \d+ tiles/ }).tap();
  // East deals, and the seat a phone takes first is East: it opens the hand
  // once the table has finished laying out the deal.
  const live = phone.page.locator(".phone__hand [data-tile-id]:not([aria-disabled])");
  await expect(live.first()).toBeVisible({ timeout: 45_000 });
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
