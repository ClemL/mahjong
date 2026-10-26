import { type Browser, type Page, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, expectNoSidewaysScroll, presetPreferences, watchErrors } from "./helpers";

const ROOM = "TABLE3";
const HURRY_BUZZ = [120, 80, 120, 80, 120];

async function open(browser: Browser, assists = false) {
  const context = await browser.newContext({ viewport: PHONE_LANDSCAPE, hasTouch: true, isMobile: true });
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

  // Kris has switched the assists on; Zaid and Lucy have them on without
  // touching a setting.
  const kris = await open(browser, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // Phones alone never deal: there is no table screen yet, so Kris is told to open one.
  await expect(kris.page.getByText(/Open Tablet mode on a tablet to deal/)).toBeVisible();
  await expect(kris.page.getByRole("button", { name: /^(Deal|Play the computer)$/ })).toHaveCount(0);

  const zaid = await open(browser);
  await zaid.page.goto(`/room/${ROOM}?seat=1&name=Zaid`);
  const lucy = await open(browser);
  await lucy.page.goto(`/room/${ROOM}?seat=2&name=Lucy`);
  const tableContext = await browser.newContext({ viewport: TABLET });
  const table = await tableContext.newPage();
  const tableErrors = watchErrors(table);
  await presetPreferences(table, {});
  await table.goto(`/room/${ROOM}?seat=table`);
  await expect(table.getByText("Lucy").first()).toBeVisible();
  await table.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await table.getByRole("button", { name: "Skip the deal" }).click();
  // Nobody is hurried in the first three seconds of their turn: the button counts them down.
  await expect(
    zaid.page.getByRole("button", { name: /^Kris's turn has only just started: hurry up in \d seconds$/ }),
  ).toBeDisabled();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();

  // The helper has its own row straight above the hand; it once fell into a row under it.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).tap();
  await kris.page.getByRole("button", { name: /^Helper/ }).tap();
  await expect(kris.page.locator(".helper")).toBeVisible();
  const phone = (await kris.page.locator(".phone").boundingBox())!;
  const helper = (await kris.page.locator(".helper").boundingBox())!;
  const hand = (await kris.page.locator(".phone__hand").boundingBox())!;
  expect(helper.y + helper.height).toBeLessThanOrEqual(hand.y);
  expect(phone.y + phone.height - (hand.y + hand.height)).toBeLessThanOrEqual(2);
  // The wheelchair sticker has actually loaded, not left a broken image, and is full size.
  const icon = kris.page.locator(".helper__icon");
  expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect((await icon.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await expectNoSidewaysScroll(kris.page);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/helper.png` });

  // Zaid and Lucy are both waiting on Kris, and say so.
  await expect(lucy.page.getByRole("button", { name: "Hurry up Kris: flash their screen" })).toBeEnabled();
  const hurry = zaid.page.getByRole("button", { name: "Hurry up Kris: flash their screen" });
  await expect(hurry).toBeVisible();
  // One width through every label it shows, so nothing beside it shifts.
  const widthBefore = (await hurry.boundingBox())!.width;
  await hurry.tap();
  await expect(kris.page.getByRole("alert").filter({ hasText: "Zaid says hurry up!" })).toBeVisible();
  await expect(kris.page.locator(".phone--hurried")).toHaveCount(1);
  // The whole screen flashes but the hand, which can still be read and thrown.
  expect(await coveredTiles(kris.page)).toBe(0);
  const flash = (await kris.page.locator(".phone__hurry").boundingBox())!;
  expect(flash.y + flash.height).toBeLessThanOrEqual(hand.y);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/hurry.png` });
  await expect.poll(() => buzzes(kris.page)).toContainEqual(HURRY_BUZZ);
  // One at a time: both buttons rest, counting down, until the table takes another.
  await expect(zaid.page.getByRole("button", { name: /^You hurried Kris: hurry up again in \d+ seconds$/ })).toBeDisabled();
  const resting = lucy.page.getByRole("button", { name: /^Zaid hurried Kris: hurry up again in \d+ seconds$/ });
  await expect(resting).toBeDisabled();
  await expect(resting).toHaveText(/^Hurried \d+s$/);
  expect((await zaid.page.locator(".phone__hurry-btn").boundingBox())!.width).toBeCloseTo(widthBefore, 0);
  // Everyone still waiting is told who already hurried Kris.
  await expect(lucy.page.locator(".phone__prompt")).toHaveText("Waiting for Kris…Hurried by Zaid");
  // Kris is never offered a button to hurry himself, and the flash plays out.
  await expect(kris.page.getByRole("button", { name: /^Hurry up/ })).toHaveCount(0);
  await expect(kris.page.locator(".phone__hurry")).toHaveCount(0, { timeout: 6_000 });

  expect(kris.errors).toEqual([]);
  expect(zaid.errors).toEqual([]);
  expect(lucy.errors).toEqual([]);
  expect(tableErrors).toEqual([]);
  for (const side of [kris, zaid, lucy]) await side.context.close();
  await tableContext.close();
});
