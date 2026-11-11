import { type Browser, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, deviceAddress, presetPreferences, resetTable, watchErrors } from "./helpers";

/** Shared with the lobby and phone-fit specs; specs run one at a time and each resets it first. */
const ROOM = "TABLE1";

async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean, stored = {}) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: { "x-forwarded-for": deviceAddress() },
  });
  const page = await context.newPage();
  await presetPreferences(page, {});
  await page.addInitScript((settings: Record<string, string>) => {
    for (const [key, value] of Object.entries(settings)) window.localStorage.setItem(key, value);
  }, stored);
  return { context, page, errors: watchErrors(page) };
}

test("somebody who scans into a computer's chair mid-game can change their name from the phone's menu", async ({
  browser,
  request,
}) => {
  await resetTable(request, ROOM);
  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  // Kris only holds the game open; nothing here is about his phone.
  const kris = await open(browser, PHONE_LANDSCAPE, true, { "hk-mahjong.vibrate": "off" });
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await table.page.getByRole("button", { name: "Skip the deal" }).click();

  // Mid-game, a latecomer scans a computer's chair and mistypes their name at the door.
  const srini = await open(browser, PHONE_LANDSCAPE, true);
  await srini.page.goto(`/room/${ROOM}?pick=1`);
  await srini.page.getByRole("textbox").fill("Srnii");
  await srini.page.getByRole("button", { name: "Sit down" }).click();
  await expect(srini.page.locator(".phone--landscape")).toBeVisible();
  await expect(srini.page.locator(".phone__name")).toHaveText("Srnii");
  await expect(table.page.locator('.rack[data-seat="1"]')).toContainText("Srnii");

  // The menu has the name at the top, to put right without leaving the chair.
  await srini.page.getByRole("button", { name: "Settings" }).tap();
  const you = srini.page.getByRole("dialog").getByRole("textbox", { name: "Your name" });
  await expect(you).toHaveValue("Srnii");
  await you.fill("Srini");
  await srini.page.getByRole("button", { name: "Save" }).tap();
  await expect(srini.page.locator(".phone__name")).toHaveText("Srini");
  await expect(table.page.locator('.rack[data-seat="1"]')).toContainText("Srini");

  // A name another player already goes by is told apart, and the box says what was given.
  await you.fill("kris");
  await you.press("Enter");
  await expect(you).toHaveValue("kris 2");
  await expect(srini.page.locator(".phone__name")).toHaveText("kris 2");

  // The hand is still theirs throughout.
  await srini.page.keyboard.press("Escape");
  await expect(srini.page.getByRole("button", { name: /Hand hidden, 13 tiles/ })).toBeVisible();

  for (const side of [table, srini]) expect(side.errors).toEqual([]);
  for (const side of [table, kris, srini]) await side.context.close();
});
