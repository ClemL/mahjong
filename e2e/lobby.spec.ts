import { type Browser, expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, TABLET, presetPreferences, watchErrors } from "./helpers";

/** The one table no other spec sits at. */
const ROOM = "TABLE1";
const SHOTS = process.env.LOBBY_SHOTS;

async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await presetPreferences(page, {});
  return { context, page, errors: watchErrors(page) };
}

test("players swap chairs in the lobby, and a taken chair's code takes it over", async ({
  browser,
  request,
}) => {
  expect((await request.post(`/api/rooms/${ROOM}/reset`)).ok()).toBe(true);

  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ })).toBeVisible();

  const kris = await open(browser, PHONE_PORTRAIT, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  const srini = await open(browser, PHONE_PORTRAIT, true);
  await srini.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  await expect(table.page.getByText("2 of 4 seated")).toBeVisible();

  // The table trades East and South.
  await table.page.getByRole("button", { name: "Swap Kris with Srini, seat 2, South" }).click();
  await expect(table.page.getByRole("button", { name: "Swap Kris with Srini, seat 1, East" })).toBeVisible();
  // Kris's phone follows to South, and offers only Kris's own buttons.
  await expect(kris.page.getByRole("button", { name: "Move Kris to seat 3, West" })).toBeVisible();
  await expect(kris.page.getByRole("button", { name: /^(Move|Swap) Srini/ })).toHaveCount(0);
  if (SHOTS) {
    await table.page.screenshot({ path: `${SHOTS}/table-lobby.png` });
    await kris.page.screenshot({ path: `${SHOTS}/phone-lobby.png`, fullPage: true });
  }

  // The taken chair still has its code; a new phone scanning it puts Kris out.
  const code = table.page.getByRole("img", { name: /take over seat 2, South, from Kris/ });
  await expect(code).toBeVisible();
  const james = await open(browser, PHONE_PORTRAIT, true);
  await james.page.goto(`/room/${ROOM}?seat=1&replace=1`);
  await expect(table.page.getByText("Louis").first()).toBeVisible();
  await expect(kris.page.getByRole("status").filter({ hasText: /took your place/ })).toBeVisible();
  await expect(kris.page.getByText(/scanned the code for seat 2, South/)).toBeVisible();
  if (SHOTS) await kris.page.screenshot({ path: `${SHOTS}/phone-replaced.png`, fullPage: true });

  for (const side of [table, kris, srini, james]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});
