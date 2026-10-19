import { type Browser, type Page, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, presetPreferences, watchErrors } from "./helpers";

/** Its own table, so another spec's game can never be sitting in this one. */
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
  // The phone deals its hand in time with the table: stacks yet to reach
  // this seat are held out of sight, face down as the hand is.
  await expect(phone.page.getByRole("button", { name: /Hand hidden, \d+ tiles/ })).toBeVisible();
  const held = () =>
    phone.page.evaluate(
      () =>
        [...document.querySelectorAll(".phone__hand .tile")].filter((el) => Number(getComputedStyle(el).opacity) < 0.5)
          .length,
    );
  expect(await held()).toBeGreaterThanOrEqual(8);
  // Skipping the deal clears it off the felt at once, and the phone's hand comes straight in.
  const skip = table.page.getByRole("button", { name: "Skip the deal" });
  await skip.click();
  await expect(table.page.locator(".deal")).toHaveCount(0);
  await expect(skip).toHaveCount(0);
  await expect.poll(held, { timeout: 3_000 }).toBe(0);

  // Every hand arrives face down on the phone; its owner turns it up.
  await phone.page.getByRole("button", { name: /Hand hidden, \d+ tiles/ }).tap();
  // East deals, and this phone is East: a person can open the hand whenever
  // their hand is up, deal or no deal.
  const live = phone.page.locator(".phone__hand [data-tile-id]:not([aria-disabled])");
  await expect(live.first()).toBeVisible({ timeout: 4_000 });
  await expect(phoneTiles(phone.page)).toHaveCount(14);
  // Let the row finish tipping up and the drawn tile land before reading
  // where anything is.
  await phone.page.evaluate(() =>
    Promise.all(
      document
        .querySelector(".phone__hand")!
        .getAnimations({ subtree: true })
        .filter((a) => a instanceof CSSAnimation)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  // The deal is over, so a hand turned up now is simply there: nothing drops
  // in again under a finger reaching for it.
  expect(await held()).toBe(0);
  // A tile dragged along the hand parts the rest to show where it would
  // land, and lands there.
  const order = () => phoneTiles(phone.page).evaluateAll((els) => els.map((el) => el.getAttribute("data-tile-id")));
  const picked = (await order())[1];
  const a = (await phoneTiles(phone.page).nth(1).boundingBox())!;
  const b = (await phoneTiles(phone.page).nth(4).boundingBox())!;
  await phone.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await phone.page.mouse.down();
  // Held, it grows so it can be read past the finger.
  await expect(phoneTiles(phone.page).nth(1)).toHaveClass(/tile--peek/);
  for (let step = 1; step <= 10; step++) {
    await phone.page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * step) / 10, a.y + a.height / 2 + 4);
  }
  await phone.page.waitForTimeout(300);
  await expect(phone.page.locator(".phone__hand .tile--dragging")).toHaveCount(1);
  const parted = await phoneTiles(phone.page).evaluateAll((els) =>
    els.slice(2, 5).map((el) => getComputedStyle(el).translate),
  );
  expect(parted.every((t) => t !== "none" && !/^0px( 0px)?$/.test(t)), `parted: ${parted}`).toBe(true);
  await phone.page.mouse.up();
  await expect.poll(async () => (await order()).indexOf(picked)).toBe(4);

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
