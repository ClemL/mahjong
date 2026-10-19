import { type Browser, type Page, expect, test } from "@playwright/test";
import {
  PHONE_LANDSCAPE,
  PHONE_PORTRAIT,
  TABLET,
  expectNoSidewaysScroll,
  presetPreferences,
  watchErrors,
} from "./helpers";

const ROOM = "TABLE3";
const HURRY_BUZZ = [120, 80, 120, 80, 120];

async function open(
  browser: Browser,
  assists = false,
  viewport: { width: number; height: number } = PHONE_PORTRAIT,
) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await presetPreferences(page, {});
  if (assists) {
    await page.addInitScript(() => {
      window.localStorage.setItem("hk-mahjong.hurry", "on");
      window.localStorage.setItem("hk-mahjong.helper", "on");
    });
  }
  // Every buzz the phone asks for, so the test can read them back.
  await page.addInitScript(() => {
    const buzzes: unknown[] = [];
    (window as unknown as { buzzes: unknown[] }).buzzes = buzzes;
    navigator.vibrate = ((pattern: unknown) => {
      buzzes.push(pattern);
      return true;
    }) as typeof navigator.vibrate;
  });
  return { context, page, errors: watchErrors(page) };
}

const buzzes = (page: Page) => page.evaluate(() => (window as unknown as { buzzes: unknown[] }).buzzes);

/**
 * How many of the hand's tiles have the hurry flash, or anything else, drawn
 * over their middle. The flash lets touches through, so it is made solid for
 * the probe or it would never be hit.
 */
function coveredTiles(page: Page): Promise<number> {
  return page.evaluate(() => {
    const flash = document.querySelector<HTMLElement>(".phone__hurry");
    if (flash) flash.style.pointerEvents = "auto";
    const covered = [...document.querySelectorAll(".phone__hand .tile")].filter((tile) => {
      const r = tile.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !hit?.closest(".phone__hand");
    }).length;
    if (flash) flash.style.pointerEvents = "";
    return covered;
  });
}

test("a hurry-up flashes everything but the hand of the player on turn, one at a time, and the helper sits above the hand", async ({
  browser,
  request,
}) => {
  expect((await request.post(`/api/rooms/${ROOM}/reset`)).ok()).toBe(true);

  // Phones alone, no tablet: East deals and is first to throw. Kris has
  // switched the assists on; Zaid and Lucy have them on without touching a setting.
  const kris = await open(browser, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  const zaid = await open(browser);
  await zaid.page.goto(`/room/${ROOM}?seat=1&name=Zaid`);
  const lucy = await open(browser);
  await lucy.page.goto(`/room/${ROOM}?seat=2&name=Lucy`);
  await kris.page.getByRole("button", { name: /^Deal$/ }).click();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  // Kris's hand docks at the foot of the screen once the phone's part of the page is in view.
  await kris.page.locator(".phone__hand").scrollIntoViewIfNeeded();
  const docked = (await kris.page.locator(".phone__hand").boundingBox())!;
  expect(docked.y + docked.height).toBeGreaterThan(PHONE_PORTRAIT.height - 30);

  // Zaid and Lucy are both waiting on Kris, and say so.
  await expect(lucy.page.getByRole("button", { name: "Hurry up Kris: flash their screen" })).toBeEnabled();
  const hurry = zaid.page.getByRole("button", { name: "Hurry up Kris: flash their screen" });
  await expect(hurry).toBeVisible();
  await hurry.click();
  await expect(kris.page.getByRole("alert").filter({ hasText: "Zaid says hurry up!" })).toBeVisible();
  await expect(kris.page.locator(".phone--hurried")).toHaveCount(1);
  // The whole screen flashes but the hand, which can still be read and thrown.
  expect(await coveredTiles(kris.page)).toBe(0);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/hurry.png` });
  await expect.poll(() => buzzes(kris.page)).toContainEqual(HURRY_BUZZ);
  // One at a time: both buttons rest, counting down, until the table takes another.
  await expect(zaid.page.getByRole("button", { name: /^You hurried Kris: hurry up again in \d+ seconds$/ })).toBeDisabled();
  const resting = lucy.page.getByRole("button", { name: /^Zaid hurried Kris: hurry up again in \d+ seconds$/ });
  await expect(resting).toBeDisabled();
  await expect(resting).toHaveText(/^Hurried \d+s$/);
  // Kris is never offered a button to hurry himself, and the flash plays out.
  await expect(kris.page.getByRole("button", { name: /^Hurry up/ })).toHaveCount(0);
  await expect(kris.page.locator(".phone__hurry")).toHaveCount(0, { timeout: 6_000 });

  // The helper opens over a turned-up hand.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).click();
  await kris.page.getByRole("button", { name: /^Helper/ }).click();
  await expect(kris.page.locator(".helper")).toBeVisible();
  // The wheelchair sticker has actually loaded, not left a broken image.
  const icon = kris.page.locator(".helper__icon");
  expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect((await icon.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // Straight above the hand, which stays last.
  const helper = (await kris.page.locator(".helper").boundingBox())!;
  const hand = (await kris.page.locator(".phone__hand").boundingBox())!;
  expect(helper.y + helper.height).toBeLessThanOrEqual(hand.y);
  await expectNoSidewaysScroll(kris.page);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/helper.png`, fullPage: false });

  expect(kris.errors).toEqual([]);
  expect(zaid.errors).toEqual([]);
  expect(lucy.errors).toEqual([]);
  await kris.context.close();
  await zaid.context.close();
  await lucy.context.close();

  // The same hand on the controller. A tablet sits down as the table, and
  // Kris and Zaid take their chairs back on phones held sideways. (In this
  // test rather than its own: a room reset is rate limited, and the suite
  // already spends the allowance.)
  const tableContext = await browser.newContext({ viewport: TABLET });
  const table = await tableContext.newPage();
  const tableErrors = watchErrors(table);
  await presetPreferences(table, {});
  await table.goto(`/room/${ROOM}?seat=table`);
  const krisSideways = await open(browser, true, PHONE_LANDSCAPE);
  await krisSideways.page.goto(`/room/${ROOM}?seat=0&name=Kris&replace=1`);
  const zaidSideways = await open(browser, false, PHONE_LANDSCAPE);
  await zaidSideways.page.goto(`/room/${ROOM}?seat=1&name=Zaid&replace=1`);

  await krisSideways.page.getByRole("button", { name: /Hand hidden/ }).tap();
  await krisSideways.page.getByRole("button", { name: /^Helper/ }).tap();
  await expect(krisSideways.page.locator(".helper")).toBeVisible();
  const phone = (await krisSideways.page.locator(".phone").boundingBox())!;
  const sideHelper = (await krisSideways.page.locator(".helper").boundingBox())!;
  const sideHand = (await krisSideways.page.locator(".phone__hand").boundingBox())!;
  // The helper has its own row above the hand; it once fell into a row under it.
  expect(sideHelper.y + sideHelper.height).toBeLessThanOrEqual(sideHand.y);
  expect(phone.y + phone.height - (sideHand.y + sideHand.height)).toBeLessThanOrEqual(2);

  // Once the table has rested from Zaid's last one.
  const again = zaidSideways.page.getByRole("button", { name: "Hurry up Kris: flash their screen" });
  await expect(again).toBeEnabled();
  await again.tap();
  await expect(krisSideways.page.getByRole("alert").filter({ hasText: "Zaid says hurry up!" })).toBeVisible();
  expect(await coveredTiles(krisSideways.page)).toBe(0);
  const flash = (await krisSideways.page.locator(".phone__hurry").boundingBox())!;
  expect(flash.y + flash.height).toBeLessThanOrEqual(sideHand.y);
  if (process.env.HURRY_SHOTS) {
    await krisSideways.page.screenshot({ path: `${process.env.HURRY_SHOTS}/controller-hurry.png` });
  }

  expect(krisSideways.errors).toEqual([]);
  expect(zaidSideways.errors).toEqual([]);
  expect(tableErrors).toEqual([]);
  await krisSideways.context.close();
  await zaidSideways.context.close();
  await tableContext.close();
});

test("solo: the helper is off until settings turn it on", async ({ page }) => {
  await presetPreferences(page, { helper: true });
  const errors = watchErrors(page);
  await page.goto("/solo?seed=7");
  const helper = page.getByRole("button", { name: /^Helper/ });
  await expect(helper).toBeVisible({ timeout: 20_000 });
  await helper.click();
  await expect(page.locator(".helper")).toBeVisible();

  await page.close();
  const off = await page.context().newPage();
  await presetPreferences(off, {});
  await off.goto("/solo?seed=7");
  await expect(off.getByText(/Your turn|Waiting for the other players/)).toBeVisible({ timeout: 20_000 });
  await expect(off.getByRole("button", { name: /^Helper/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
