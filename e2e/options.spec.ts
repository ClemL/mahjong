import { type Browser, expect, test } from "@playwright/test";
import {
  PHONE_LANDSCAPE,
  TABLET,
  deviceAddress,
  expectNoSidewaysScroll,
  presetPreferences,
  resetTable,
  watchErrors,
} from "./helpers";

/** Shared with the room spec; specs run one at a time and each resets it first. */
const ROOM = "TABLE2";

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

test("a phone stretches its hand to the edges, and the table can end the game early", async ({ browser, request }) => {
  await resetTable(request, ROOM);

  const kris = await open(browser, PHONE_LANDSCAPE, true, {
    "hk-mahjong.hand-stretch": "on",
    // Take back is one of the assists, off unless the phone turns it on.
    "hk-mahjong.take-back": "on",
  });
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  // The table deals in its own look, and every phone starts the game in it.
  const tableLook = { theme: "midnight", suits: "classic", tiles: "western", body: "bone", backs: "crimson", rev: 2 };
  const table = await open(browser, TABLET, false, { "hk-mahjong.appearance": JSON.stringify(tableLook) });
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("Kris").first()).toBeVisible();
  await table.page.getByRole("button", { name: /^(Deal|Play the computer)$/ }).click();
  await table.page.getByRole("button", { name: "Skip the deal" }).click();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  await expect
    .poll(() => kris.page.evaluate(() => ({ ...document.documentElement.dataset })))
    .toMatchObject({ theme: "midnight", suits: "classic", tiles: "western", body: "bone", backs: "crimson" });

  // Stretched, the hand runs from one edge of the screen to the other.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).tap();
  const tiles = kris.page.locator(".phone__hand .tile");
  await expect(tiles).toHaveCount(14);
  // Measured once the tile just drawn has settled into the hand.
  const right = async () => {
    const box = (await tiles.last().boundingBox())!;
    return box.x + box.width;
  };
  await expect.poll(right).toBeGreaterThanOrEqual(PHONE_LANDSCAPE.width - 6);
  await expect.poll(async () => (await tiles.first().boundingBox())!.x).toBeLessThanOrEqual(6);
  await expectNoSidewaysScroll(kris.page);
  // Keep awake and full screen live in the phone's settings, not on its bar.
  await expect(kris.page.locator(".phone__bar").getByRole("button", { name: /awake|full screen/i })).toHaveCount(0);
  await kris.page.getByRole("button", { name: /Settings/ }).first().tap();
  await expect(kris.page.getByRole("switch", { name: "Keep awake" })).toBeVisible();
  await expect(kris.page.getByRole("switch", { name: "Full screen" })).toBeVisible();
  await expect(kris.page.getByRole("switch", { name: "Take back" })).toHaveAttribute("aria-checked", "true");
  await kris.page.getByRole("button", { name: "Close" }).first().tap();
  await expect(kris.page.getByRole("switch", { name: "Keep awake" })).toHaveCount(0);

  // A tile thrown can be taken back in the moment after, and the table waits for it.
  const thrown = tiles.first();
  await thrown.tap();
  await thrown.tap();
  await expect(tiles).toHaveCount(13);
  // Up beside the flowers and open sets, away from the hand and the buttons for the next move.
  const takeBack = kris.page.getByRole("button", { name: /^Take back/ });
  await expect(kris.page.locator(".phone__melds").getByRole("button", { name: /^Take back/ })).toBeVisible();
  await takeBack.tap();
  await expect(tiles).toHaveCount(14);
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();
  await expect(table.page.locator('.discards[data-seat="0"] .tile')).toHaveCount(0);

  // The table pauses the hand: the felt says so, and the phone can throw nothing until it resumes.
  await table.page.getByRole("button", { name: "Pause" }).first().click();
  await expect(table.page.locator(".felt__paused")).toBeVisible();
  await expect(kris.page.getByText("Paused by the table. Your clock has stopped.")).toBeVisible();
  await expect(tiles.first()).toHaveAttribute("aria-disabled", "true");
  // Tapped anyway, twice, as a discard would be: nothing leaves the hand.
  await tiles.first().tap({ force: true });
  await tiles.first().tap({ force: true });
  await kris.page.waitForTimeout(500);
  await expect(tiles).toHaveCount(14);
  await table.page.getByRole("button", { name: "Resume" }).first().click();
  await expect(table.page.locator(".felt__paused")).toHaveCount(0);
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();

  // The phone's settings scroll under their heading, with nothing showing above it.
  await kris.page.getByRole("button", { name: "Settings" }).first().tap();
  const drawer = kris.page.locator(".drawer");
  await expect(drawer).toBeVisible();
  const gap = await drawer.evaluate((el) => {
    el.scrollTop = 200;
    return el.querySelector(".drawer__head")!.getBoundingClientRect().top - el.getBoundingClientRect().top;
  });
  expect(gap).toBeLessThanOrEqual(0.5);
  await kris.page.getByRole("button", { name: "Close" }).tap();

  // The table ends the game mid-hand: straight to the final scores, everywhere.
  table.page.once("dialog", (dialog) => void dialog.accept());
  await table.page.getByRole("button", { name: "End game" }).first().click();
  const sheet = table.page.getByRole("dialog", { name: "Game complete" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/^Game ended early/)).toBeVisible();
  await expect(table.page.getByRole("button", { name: "End game" })).toHaveCount(0);
  await expect(kris.page.getByRole("region", { name: "Game complete" })).toBeVisible();

  // The final scores leave as a picture: saved, where there is no share sheet to hand it to.
  const saved = table.page.waitForEvent("download");
  await sheet.getByRole("button", { name: "Share scores" }).click();
  const picture = await saved;
  expect(picture.suggestedFilename()).toMatch(/^mahjong-[a-z0-9-]+-\d{8}_\d{4}\.png$/);
  await expect(sheet.getByRole("button", { name: "Image saved" })).toBeVisible();
  if (process.env.SCORE_CARD_OUT) await picture.saveAs(process.env.SCORE_CARD_OUT);

  // On a screen too short for them, the final scores scroll under a heading
  // that stays put with New game and Share scores in it, and the card's
  // see-through colour runs the full length of the card.
  await table.page.setViewportSize({ width: TABLET.width, height: 460 });
  const short = await sheet.evaluate((card) => {
    const body = card.querySelector<HTMLElement>(".game-over__body")!;
    const overflowing = body.scrollHeight > body.clientHeight;
    body.scrollTop = body.scrollHeight;
    const head = card.querySelector(".result-sheet__head")!.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    return {
      overflowing,
      headInView: head.top >= box.top && head.bottom <= box.bottom && head.top >= 0,
      cardFits: box.bottom <= innerHeight,
      content: card.scrollHeight,
      backing: parseFloat(getComputedStyle(card, "::before").height),
    };
  });
  expect(short.overflowing).toBe(true);
  expect(short.headInView).toBe(true);
  expect(short.cardFits).toBe(true);
  expect(short.backing).toBeGreaterThanOrEqual(short.content - 1);
  await expect(sheet.getByRole("button", { name: "New game" })).toBeInViewport();

  expect(kris.errors).toEqual([]);
  expect(table.errors).toEqual([]);
  await kris.context.close();
  await table.context.close();
});

test("a foldable keeps everyone's discards beside the hand, and a phone swipes right for them", async ({
  browser,
  request,
}) => {
  await resetTable(request, ROOM);
  const FOLDABLE = { width: 930, height: 780 };
  const kris = await open(browser, FOLDABLE, true, { "hk-mahjong.ponds": "on" });
  await kris.page.goto(`/room/${ROOM}?seat=0&name=Kris`);
  const srini = await open(browser, PHONE_LANDSCAPE, true);
  await srini.page.goto(`/room/${ROOM}?seat=1&name=Srini`);
  const table = await open(browser, TABLET, false);
  await table.page.goto(`/room/${ROOM}?seat=table`);
  await expect(table.page.getByText("2 of 4 seated")).toBeVisible();
  await table.page.getByRole("button", { name: "Deal" }).click();
  await table.page.getByRole("button", { name: "Skip the deal" }).click();
  await expect(kris.page.getByText("Your turn — discard a tile.")).toBeVisible();

  // Opened out, the discards sit in the middle right, between the header and the hand.
  const ponds = (page: typeof kris.page) => page.getByRole("region", { name: "Everyone's discards" });
  await expect(ponds(kris.page)).toBeVisible();
  const box = (await ponds(kris.page).boundingBox())!;
  const bar = (await kris.page.locator(".phone__bar").boundingBox())!;
  const hand = (await kris.page.locator(".phone__hand").boundingBox())!;
  expect(box.x).toBeGreaterThan(FOLDABLE.width / 2);
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(box.y + box.height).toBeLessThanOrEqual(hand.y);
  await expect(kris.page.getByRole("button", { name: "Show everyone's discards" })).toHaveCount(0);

  // A phone keeps them out of the way until a swipe right across the middle.
  await expect(ponds(srini.page)).toHaveCount(0);
  const middle = (await srini.page.locator(".phone__controls").boundingBox())!;
  const sweep = async (from: number, to: number) => {
    const y = middle.y + middle.height / 2;
    await srini.page.mouse.move(from, y);
    await srini.page.mouse.down();
    for (let step = 1; step <= 8; step++) await srini.page.mouse.move(from + ((to - from) * step) / 8, y + 3);
    await srini.page.mouse.up();
  };
  await sweep(middle.x + 60, middle.x + 260);
  await expect(ponds(srini.page)).toBeVisible();
  await srini.page.getByRole("button", { name: "By suit" }).click();
  await expect(srini.page.getByRole("button", { name: "By suit" })).toHaveAttribute("aria-pressed", "true");
  await sweep(middle.x + 300, middle.x + 100);
  await expect(ponds(srini.page)).toHaveCount(0);

  // Kris throws, and his own pond shows it, ringed as the newest.
  await kris.page.getByRole("button", { name: /Hand hidden/ }).tap();
  const live = kris.page.locator(".phone__hand [data-tile-id]:not([aria-disabled])");
  const tile = live.first();
  await expect(tile).toBeVisible();
  // Tapped once the hand has finished turning up, not while it tips over.
  await kris.page.evaluate(() =>
    Promise.all(
      document
        .querySelector(".phone__hand")!
        .getAnimations({ subtree: true })
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await tile.tap();
  await expect(kris.page.getByRole("status").filter({ hasText: /^Discard / })).toBeVisible();
  await tile.tap();
  await expect(ponds(kris.page).locator(".minipond__row--mine .minipond__tile")).toHaveCount(1);
  await expect(ponds(kris.page).locator(".minipond__tile--newest")).toHaveCount(1);

  for (const side of [kris, srini, table]) {
    expect(side.errors).toEqual([]);
    await side.context.close();
  }
});
