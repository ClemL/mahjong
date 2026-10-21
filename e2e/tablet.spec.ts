import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";
import { PHONE_LANDSCAPE, PHONE_PORTRAIT, TABLET, presetPreferences, watchErrors } from "./helpers";

/** Shared with the hurry spec; specs run one at a time and each resets it first. */
const ROOM = "TABLE3";

/** A OnePlus Open opened out, in Chrome: close to square. */
const FOLDABLE = { width: 930, height: 780 };

/**
 * Seats and resets are rate-limited per address, and every other spec spends
 * the same local allowance. Each device here gets an address of its own, as
 * it would at a real table.
 */
let address = 0;
const nextAddress = () => `10.0.3.${++address}`;
const reset = (request: APIRequestContext) =>
  request.post(`/api/rooms/${ROOM}/reset`, { headers: { "x-forwarded-for": nextAddress() } });

async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-forwarded-for": nextAddress() },
  });
  const page = await context.newPage();
  await presetPreferences(page, {});
  return { context, page, errors: watchErrors(page) };
}

test("a widescreen tablet squares the felt, and a latecomer names themselves into a computer's chair", async ({
  browser,
  request,
}) => {
  expect((await reset(request)).ok()).toBe(true);

  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  const kris = await open(browser, PHONE_LANDSCAPE, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();

  // Square felt, the bar gone, and the panel beside it with the game in it.
  const felt = table.page.locator(".felt");
  await expect(table.page.locator(".tabletop--wide")).toBeVisible();
  const box = (await felt.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  await expect(table.page.locator(".tabletop__bar")).toHaveCount(0);
  const side = table.page.getByRole("complementary", { name: /the game/ });
  await expect(side.getByRole("region", { name: "Round" })).toContainText("East round · hand 1");
  await expect(side.getByRole("region", { name: "Scores" })).toContainText("Kris");
  await expect(side.getByRole("button", { name: "Redeal" })).toBeVisible();

  // One code for each chair the computer is playing, big enough to scan.
  const codes = side.getByRole("img", { name: /Scan to take over/ });
  await expect(codes).toHaveCount(3);
  expect((await codes.first().boundingBox())!.width).toBeGreaterThanOrEqual(120);
  await expect(side.getByRole("img", { name: /seat 2, South, from Robot Louis/ })).toBeVisible();

  // The code opens that chair on the phone with a box for a name.
  const srini = await open(browser, PHONE_LANDSCAPE, true);
  await srini.page.goto(`/room/${ROOM}?pick=1`);
  await expect(srini.page.getByRole("status")).toContainText("You are taking over Robot Louis at seat 2, South");
  await expect(srini.page).toHaveURL(new RegExp(`/room/${ROOM}$`));
  await srini.page.getByRole("textbox").fill("Srini");
  await srini.page.getByRole("button", { name: "Sit down" }).click();
  await expect(srini.page.locator(".phone--landscape")).toBeVisible();

  // The table drops that chair's code and seats Srini at it.
  await expect(codes).toHaveCount(2);
  await expect(table.page.locator('.rack[data-seat="1"]')).toContainText("Srini");

  // Close to square, the felt stays the full width under its bar.
  await table.page.setViewportSize(FOLDABLE);
  await expect(table.page.locator(".tabletop__bar")).toBeVisible();
  await expect(table.page.locator(".side")).toHaveCount(0);

  for (const side of [table, kris, srini]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});

test("held upright, the table and a phone's seat picker are turned on their side", async ({ browser, request }) => {
  expect((await reset(request)).ok()).toBe(true);

  // A tablet stood upright is still laid out landscape, and wide enough to split.
  const table = await open(browser, { width: TABLET.height, height: TABLET.width }, true);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  const phone = await open(browser, PHONE_PORTRAIT, true);
  await phone.page.goto(`/room/${ROOM}`);
  await expect(phone.page.getByRole("button", { name: "Sit down" })).toBeVisible();

  for (const { page } of [table, phone]) {
    const shape = await page.evaluate(() => {
      const app = document.querySelector<HTMLElement>(".app")!;
      return { turn: getComputedStyle(document.querySelector(".screen")!).transform, w: app.offsetWidth, h: app.offsetHeight };
    });
    // A quarter turn clockwise, and the page itself wider than it is tall.
    expect(shape.turn).toMatch(/^matrix\(0, 1, -1, 0,/);
    expect(shape.w).toBeGreaterThan(shape.h);
  }

  await phone.page.getByRole("button", { name: /East/ }).click();
  await phone.page.getByRole("textbox").fill("Kris");
  await phone.page.getByRole("button", { name: "Sit down" }).click();
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await expect(table.page.locator(".tabletop--wide")).toBeVisible();

  for (const side of [table, phone]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});
