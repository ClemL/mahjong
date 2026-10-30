import { type Browser, expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, TABLET, presetPreferences, watchErrors } from "./helpers";

/** The one table no other spec sits at. */
const ROOM = "TABLE1";
const SHOTS = process.env.LOBBY_SHOTS;

/**
 * `address` is the one the server counts this device's requests under. Sitting
 * down is rate-limited per address, and every other spec sits down from the
 * default one.
 */
async function open(browser: Browser, viewport: { width: number; height: number }, touch: boolean, address?: string) {
  const context = await browser.newContext({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: address ? { "x-forwarded-for": address } : undefined,
  });
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

  // A taken chair's code is one tap away; a new phone scanning it puts Kris out.
  await table.page.getByRole("button", { name: "Show the code for seat 2, South" }).click();
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

test("people keep their names as they move round the chairs, a chair's default name included", async ({
  browser,
  request,
}) => {
  // Resets are rate-limited per address, and the other specs spend the default one's allowance.
  const reset = await request.post(`/api/rooms/${ROOM}/reset`, { headers: { "x-forwarded-for": "10.0.5.2" } });
  expect(reset.ok()).toBe(true);

  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  // Nobody types a name for South, so whoever scans it sits as South's own: Louis.
  const louis = await open(browser, PHONE_PORTRAIT, true);
  await louis.page.goto(`/room/${ROOM}?seat=1`);
  await expect(table.page.getByText("1 of 4 seated")).toBeVisible();
  const seats = table.page.getByRole("list", { name: "Seats" });
  const chair = (n: number) => seats.getByRole("listitem").nth(n);

  // Once round the table, a chair at a time: still Louis wherever he sits.
  for (const [seat, wind] of [
    [2, "West"],
    [3, "North"],
    [0, "East"],
    [1, "South"],
  ] as const) {
    await table.page.getByRole("button", { name: `Move Louis to seat ${seat + 1}, ${wind}` }).click();
    await expect(chair(seat)).toContainText("Louis");
    await expect(louis.page.getByText(`You're in as ${wind}`)).toBeVisible();
  }

  // At West, the empty South chair offers West's own name rather than a second Louis.
  await table.page.getByRole("button", { name: "Move Louis to seat 3, West" }).click();
  await expect(chair(2)).toContainText("Louis");
  await expect(chair(1)).toContainText("Hanna");
  const newcomer = await open(browser, PHONE_PORTRAIT, true);
  await newcomer.page.goto(`/room/${ROOM}?seat=1`);
  await expect(table.page.getByText("2 of 4 seated")).toBeVisible();
  await expect(chair(1)).toContainText("Hanna");
  await expect(chair(2)).toContainText("Louis");

  for (const side of [table, louis, newcomer]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});

test("a phone beaten to a chair is told so, and sits in another", async ({ browser, request }) => {
  // Resets are rate-limited per address, and the other specs spend the default one's allowance.
  const reset = await request.post(`/api/rooms/${ROOM}/reset`, { headers: { "x-forwarded-for": "10.0.5.3" } });
  expect(reset.ok()).toBe(true);

  const kris = await open(browser, PHONE_PORTRAIT, true, "10.0.5.3");
  const srini = await open(browser, PHONE_PORTRAIT, true, "10.0.5.3");
  for (const side of [kris, srini]) {
    await side.page.goto(`/room/${ROOM}`);
    await side.page.getByRole("button", { name: /^東\s?East/ }).click();
  }
  await kris.page.getByRole("textbox").fill("Kris");
  await srini.page.getByRole("textbox").fill("Srini");

  // Srini's phone hears nothing from the table for a moment, so it cannot
  // know Kris got there first: the refusal is the first it hears of it.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await srini.page.route(
    (url) => url.pathname === `/api/rooms/${ROOM}`,
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await srini.page.waitForTimeout(1500);
  await kris.page.getByRole("button", { name: "Sit down" }).click();
  await expect(kris.page.getByText("You're in as East")).toBeVisible();

  await srini.page.getByRole("button", { name: "Sit down" }).click();
  await expect(srini.page.getByText("That seat is taken")).toBeVisible();

  // Once it hears, it lets go of the chair and says who has it.
  release();
  await expect(srini.page.getByRole("status")).toHaveText("Kris just sat down at East. Pick another seat.");
  await expect(srini.page.getByRole("button", { name: "Sit down" })).toBeDisabled();
  await srini.page.getByRole("button", { name: /^南\s?South/ }).click();
  await expect(srini.page.getByRole("textbox")).toHaveValue("Srini");
  await srini.page.getByRole("button", { name: "Sit down" }).click();
  await expect(srini.page.getByText("You're in as South")).toBeVisible();

  expect(kris.errors).toEqual([]);
  // The refused claim is logged by the browser itself; nothing else may be.
  expect(srini.errors.filter((e) => !/status of 409/.test(e))).toEqual([]);
  for (const side of [kris, srini]) await side.context.close();
});

test("the table can step back to the start page and pick its lobby up again", async ({
  browser,
  request,
}) => {
  expect((await request.post(`/api/rooms/${ROOM}/reset`)).ok()).toBe(true);

  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  const kris = await open(browser, PHONE_PORTRAIT, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  await expect(table.page.getByText("1 of 4 seated")).toBeVisible();
  if (SHOTS) await table.page.screenshot({ path: `${SHOTS}/table-lobby-home.png` });

  // A phone in a chair has its own way out, and no start-page link.
  await expect(kris.page.getByRole("link", { name: /Start page/ })).toHaveCount(0);

  await table.page.getByRole("link", { name: /Start page/ }).click();
  await expect(table.page).toHaveURL(/\/$/);

  // Opening the same table again resumes it: the claim is kept and Kris is
  // still sitting down, rather than the table being "open on another device".
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("1 of 4 seated")).toBeVisible();
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await expect(table.page.getByText(/already open on another device/)).toHaveCount(0);

  for (const side of [table, kris]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});

test("another tablet takes the table over mid-game, and the first is told why", async ({ browser, request }) => {
  // Resets are rate-limited per address, and the other specs spend the default one's allowance.
  const reset = await request.post(`/api/rooms/${ROOM}/reset`, { headers: { "x-forwarded-for": "10.0.5.1" } });
  expect(reset.ok()).toBe(true);

  const first = await open(browser, TABLET, false);
  await first.page.goto(`/room/${ROOM}?seat=table`);
  const kris = await open(browser, PHONE_PORTRAIT, true);
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  await expect(first.page.getByText("1 of 4 seated")).toBeVisible();
  await first.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await first.page.getByRole("button", { name: "Skip the deal" }).click();
  await expect(kris.page.getByRole("button", { name: /Hand hidden/ })).toBeVisible();

  // A device without the table's claim, opening the table, is offered it rather than refused.
  const second = await open(browser, TABLET, false);
  await second.page.goto(`/room/${ROOM}?seat=table`);
  await expect(second.page.getByText(/The table is open on another device right now/)).toBeVisible();
  if (SHOTS) await second.page.screenshot({ path: `${SHOTS}/table-take-over.png` });
  await second.page.getByRole("button", { name: "Take over the table" }).click();

  // The same game, carried on: Kris is still at it, and nothing was dealt again.
  await expect(second.page.getByRole("button", { name: "End game" }).first()).toBeVisible();
  await expect(second.page.getByText("Kris").first()).toBeVisible();
  await expect(first.page.getByText(/Another device took over the table/)).toBeVisible();
  if (SHOTS) await first.page.screenshot({ path: `${SHOTS}/table-taken-over.png` });
  await expect(kris.page.getByRole("button", { name: /Hand hidden/ })).toBeVisible();

  for (const side of [first, second, kris]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});
