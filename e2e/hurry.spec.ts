import { type Browser, expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, expectNoSidewaysScroll, presetPreferences, watchErrors } from "./helpers";

const ROOM = "TABLE3";

async function open(browser: Browser) {
  const context = await browser.newContext({ viewport: PHONE_PORTRAIT, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await presetPreferences(page, {});
  return { context, page, errors: watchErrors(page) };
}

test("a hurry-up flashes the screen of the player on turn, and the helper lists what finishes their sets", async ({
  browser,
  request,
}) => {
  expect((await request.post(`/api/rooms/${ROOM}/reset`)).ok()).toBe(true);

  // Phones alone, no tablet: East deals and is first to throw.
  const kris = await open(browser);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  const srini = await open(browser);
  await srini.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  await kris.page.getByRole("button", { name: /^Deal$/ }).click();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();

  // Srini is waiting on Kris, and says so.
  const hurry = srini.page.getByRole("button", { name: "Hurry up Kris: flash their screen" });
  await expect(hurry).toBeVisible();
  await hurry.click();
  await expect(srini.page.getByRole("button", { name: "Kris has been hurried" })).toBeDisabled();
  await expect(kris.page.getByRole("alert").filter({ hasText: "Srini says hurry up!" })).toBeVisible();
  await expect(kris.page.locator(".phone--hurried")).toHaveCount(1);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/hurry.png` });
  // Kris is never offered a button to hurry himself, and the flash plays out.
  await expect(kris.page.getByRole("button", { name: /^Hurry up/ })).toHaveCount(0);
  await expect(kris.page.locator(".phone__hurry")).toHaveCount(0, { timeout: 6_000 });

  // The helper opens over a turned-up hand.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).click();
  await kris.page.getByRole("button", { name: /^Helper/ }).click();
  await expect(kris.page.locator(".helper")).toBeVisible();
  await expectNoSidewaysScroll(kris.page);
  if (process.env.HURRY_SHOTS) await kris.page.screenshot({ path: `${process.env.HURRY_SHOTS}/helper.png`, fullPage: false });

  expect(kris.errors).toEqual([]);
  expect(srini.errors).toEqual([]);
  await kris.context.close();
  await srini.context.close();
});

test("solo: the helper button opens the list, and settings turn it off", async ({ page }) => {
  await presetPreferences(page, {});
  const errors = watchErrors(page);
  await page.goto("/solo?seed=7");
  const helper = page.getByRole("button", { name: /^Helper/ });
  await expect(helper).toBeVisible({ timeout: 20_000 });
  await helper.click();
  await expect(page.locator(".helper")).toBeVisible();

  await page.close();
  const off = await page.context().newPage();
  await presetPreferences(off, { helper: false });
  await off.goto("/solo?seed=7");
  await expect(off.getByText(/Your turn|Waiting for the other players/)).toBeVisible({ timeout: 20_000 });
  await expect(off.getByRole("button", { name: /^Helper/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
