import { type Browser, type Page, expect, test } from "@playwright/test";
import { TABLET, deviceAddress, fingerDrag, presetPreferences, resetTable, watchErrors } from "./helpers";

/** Shared with the lobby spec; specs run one at a time and each resets it first. */
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

async function deal(table: Page, phones: Page[]) {
  await table.getByRole("button", { name: "Deal" }).click();
  await table.getByRole("button", { name: "Skip the deal" }).click();
  for (const phone of phones) await expect(phone.locator(".phone__hand")).toBeVisible();
}

/** How close the controller's tiles and buttons come to each edge of the glass. */
function clearance(page: Page) {
  return page.evaluate(() => {
    const near = { left: Infinity, top: Infinity, right: Infinity, bottom: Infinity };
    for (const el of document.querySelectorAll(".phone__hand .tile, .phone__bar button, .phone__controls button")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      near.left = Math.min(near.left, r.left);
      near.top = Math.min(near.top, r.top);
      near.right = Math.min(near.right, innerWidth - r.right);
      near.bottom = Math.min(near.bottom, innerHeight - r.bottom);
    }
    const tile = document.querySelector(".phone__hand .tile")!.getBoundingClientRect();
    return { ...near, tile: Math.min(tile.width, tile.height) };
  });
}

test("chips and achievements scroll under a finger, held sideways or upright, and still swipe away", async ({
  browser,
  request,
}) => {
  await resetTable(request, ROOM);
  // A short phone, as an iPhone is in Safari with its bars showing: the badges
  // run well past the bottom of the screen.
  const SHORT = { width: 667, height: 340 };
  const sideways = await open(browser, SHORT, true);
  await sideways.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // The same phone held upright, its page turned on its side.
  const upright = await open(browser, { width: SHORT.height, height: SHORT.width }, true);
  await upright.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("2 of 4 seated")).toBeVisible();
  await deal(table.page, [sideways.page, upright.page]);

  for (const { page, turned } of [
    { page: sideways.page, turned: false },
    { page: upright.page, turned: true },
  ]) {
    await page.getByRole("button", { name: "Show chips and achievements" }).tap();
    const summary = page.getByRole("region", { name: "Chips and achievements" });
    await expect(summary).toBeVisible();
    const room = await summary.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(room, "the sheet is longer than the screen").toBeGreaterThan(40);

    // A finger drawn up the page — across the glass, when the page is turned —
    // scrolls the sheet, and does not take it for a swipe.
    const box = (await summary.boundingBox())!;
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const up = (by: number) => (turned ? { x: mid.x + by, y: mid.y } : { x: mid.x, y: mid.y - by });
    await fingerDrag(page, up(-60), up(60));
    await expect.poll(() => summary.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
    await expect(summary).toBeVisible();

    // Sideways across it, the other way, still goes back a screen.
    const back = (by: number) => (turned ? { x: mid.x, y: mid.y - by } : { x: mid.x - by, y: mid.y });
    await fingerDrag(page, back(-110), back(110));
    await expect(summary).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Everyone's discards" })).toBeVisible();
  }

  for (const side of [sideways, upright, table]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});

test("zoomed out, the controller keeps clear of every edge, and the setting takes effect at once", async ({
  browser,
  request,
}) => {
  await resetTable(request, ROOM);
  const SIZE = { width: 844, height: 390 };

  // The seat picker's name box is never small enough for Safari to zoom into
  // as it is tapped — a zoom it would keep once the controller opened.
  const picker = await open(browser, SIZE, true);
  await picker.page.goto(`/room/${ROOM}`);
  await picker.page.locator(".seat-card:not(.seat-card--table):not([disabled])").first().tap();
  const nameBox = picker.page.getByRole("textbox");
  await expect(nameBox).toBeVisible();
  expect(await nameBox.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await picker.context.close();

  const sideways = await open(browser, SIZE, true);
  await sideways.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // Upright, zoomed out from the start.
  const upright = await open(browser, { width: SIZE.height, height: SIZE.width }, true, {
    "hk-mahjong.zoom-out": "15",
  });
  await upright.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("2 of 4 seated")).toBeVisible();
  await deal(table.page, [sideways.page, upright.page]);

  const full = await clearance(sideways.page);
  await sideways.page.getByRole("button", { name: "Settings" }).tap();
  const zoom = sideways.page.getByRole("group", { name: "Zoom out" });
  await zoom.getByRole("button", { name: "10%" }).tap();
  await expect(zoom.getByRole("button", { name: "10%" })).toHaveAttribute("aria-pressed", "true");
  await sideways.page.keyboard.press("Escape");
  await expect(sideways.page.locator(".drawer")).toHaveCount(0);

  // A tenth off each side: half of it as a margin on either edge, and the
  // tiles a little smaller to fit.
  const out = await clearance(sideways.page);
  expect(out.left).toBeGreaterThanOrEqual(0.05 * SIZE.width);
  expect(out.right).toBeGreaterThanOrEqual(0.05 * SIZE.width);
  expect(out.top).toBeGreaterThanOrEqual(0.05 * SIZE.height);
  expect(out.bottom).toBeGreaterThanOrEqual(0.05 * SIZE.height);
  expect(out.tile).toBeLessThan(full.tile);
  expect(await sideways.page.evaluate(() => localStorage.getItem("hk-mahjong.zoom-out"))).toBe("10");

  // Upright, the margins turn with the page: still a share of each side of the glass.
  const turned = await clearance(upright.page);
  expect(turned.left).toBeGreaterThanOrEqual(0.075 * SIZE.height);
  expect(turned.right).toBeGreaterThanOrEqual(0.075 * SIZE.height);
  expect(turned.top).toBeGreaterThanOrEqual(0.075 * SIZE.width);
  expect(turned.bottom).toBeGreaterThanOrEqual(0.075 * SIZE.width);

  for (const side of [sideways, upright, table]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});
