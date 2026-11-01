import { type Browser, type Locator, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, TABLET, deviceAddress, presetPreferences, resetTable, settleHand, watchErrors } from "./helpers";

/** Shared with the hurry and tablet specs; specs run one at a time and each resets it first. */
const ROOM = "TABLE3";
const SHOTS = process.env.ACHIEVEMENT_SHOTS;

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

test("hurrying earns achievements with a pop-up, and the final scores tell everyone's game", async ({
  browser,
  request,
}) => {
  test.setTimeout(150_000);
  await resetTable(request, ROOM);
  const kris = await open(browser, PHONE_LANDSCAPE, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // Srini has the hurry-up button on.
  const srini = await open(browser, PHONE_LANDSCAPE, true, { "hk-mahjong.hurry": "on" });
  await srini.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText(/Achievements on/)).toBeVisible();
  await table.page.getByRole("button", { name: "Deal" }).click();
  await table.page.getByRole("button", { name: "Skip the deal" }).click();

  // Kris, East, takes his time: thirty more seconds, and Srini hurries him three times.
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  await kris.page.getByRole("button", { name: /^More time/ }).tap();
  const hurry = srini.page.getByRole("button", { name: /^Hurry up Kris/ });
  const sent = async () =>
    ((await (await request.get(`/api/rooms/${ROOM}`)).json()) as { stats: { hurriesSent: number[] } }).stats
      .hurriesSent[1];
  // The button can come back a moment before the server's own rest is over,
  // and a hurry-up it refuses is simply pressed again.
  for (let count = 1; count <= 3; count++) {
    await expect(async () => {
      if ((await sent()) < count) {
        await expect(hurry).toBeEnabled({ timeout: 1_000 });
        await hurry.tap();
      }
      expect(await sent()).toBe(count);
    }).toPass({ timeout: 25_000 });
  }

  // The third earns each of them one: popped up on their own phones, and on the table by name.
  await expect(srini.page.locator(".toast").filter({ hasText: "Backseat Driver" })).toBeVisible();
  await expect(kris.page.locator(".toast").filter({ hasText: "Take Your Time" })).toBeVisible();
  await expect(kris.page.locator(".toast").filter({ hasText: "Backseat Driver" })).toHaveCount(0);
  await expect(table.page.locator(".toast").filter({ hasText: "Srini earned" })).toBeVisible();
  if (SHOTS) {
    await table.page.screenshot({ path: `${SHOTS}/table-toast.png` });
    await kris.page.screenshot({ path: `${SHOTS}/phone-toast.png` });
  }
  // They go again by themselves.
  await expect(srini.page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });

  // Kris throws, and the table ends the game: the final scores say how everyone played.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).tap();
  const tile = kris.page.locator(".phone__hand [data-tile-id]:not([aria-disabled])").first();
  await expect(tile).toBeVisible();
  await settleHand(kris.page);
  await tile.tap();
  await expect(kris.page.getByRole("status").filter({ hasText: /^Discard / })).toBeVisible();
  await tile.tap();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toHaveCount(0);
  table.page.on("dialog", (dialog) => void dialog.accept());
  await table.page.getByRole("button", { name: "End game" }).click();
  await table.page.getByRole("button", { name: "Players" }).click();
  const stats = table.page.locator(".game-stats");
  await expect(within(stats, "Kris")).toContainText("1 turn");
  await expect(within(stats, "Srini")).toContainText("3 · 0");
  await expect(within(stats, "Kris")).toContainText("0 · 3");
  await expect(stats.locator(".achievements")).toContainText("Backseat Driver");
  await expect(stats.locator(".achievements")).toContainText("Take Your Time");
  if (SHOTS) {
    await table.page.waitForTimeout(1_000);
    await table.page.screenshot({ path: `${SHOTS}/final-players.png` });
  }
  // And each phone has its own line.
  await expect(srini.page.locator(".your-game")).toContainText("hurried others 3×");
  if (SHOTS) await srini.page.screenshot({ path: `${SHOTS}/phone-final.png` });

  for (const side of [kris, srini, table]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});

/** A player's row in the final scores' Players table. */
function within(stats: Locator, name: string) {
  return stats.getByRole("row", { name: new RegExp(`^${name}`) });
}
