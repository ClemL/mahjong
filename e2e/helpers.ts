import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { RESET_KEY } from "./resetKey";

/** Phone held upright, and the landscape controller a seated phone becomes. */
export const PHONE_PORTRAIT = { width: 390, height: 844 };
export const PHONE_LANDSCAPE = { width: 844, height: 390 };
/** A tablet lying flat as the shared table. */
export const TABLET = { width: 1180, height: 820 };

/**
 * Collects uncaught exceptions and console errors for the life of the page.
 * React reports a crashed render to the console rather than throwing to the
 * test, so without this a broken screen can pass every visible check.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/** The start page's stored choices, written before the app reads them. */
export async function presetPreferences(page: Page, prefs: Record<string, unknown>): Promise<void> {
  await page.addInitScript((stored) => {
    window.localStorage.setItem(
      "hk-mahjong.prefs",
      JSON.stringify({ muted: true, ...stored, version: 4 }),
    );
    window.localStorage.setItem("hk-mahjong.muted", "1");
  }, prefs);
}

/** Nothing may push the page sideways — the phone-grid bug looked exactly like this. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
}

/**
 * Seats and resets are rate-limited per address, and on a local run every
 * request arrives from the same one. Each device a spec opens gets an address
 * of its own, as it would at a real table, so no spec spends another's
 * allowance and a new test cannot push an old one over the limit.
 */
let devices = 0;
export function deviceAddress(): string {
  devices += 1;
  return `10.1.${Math.floor(devices / 256) % 256}.${devices % 256}`;
}

/**
 * Empty a table, whatever an earlier spec left on it. A game still being played
 * there can only be reset by its table or by whoever holds the deployment's
 * reset key, which the test server is started with.
 */
export async function resetTable(request: APIRequestContext, room: string): Promise<void> {
  const response = await request.post(`/api/rooms/${room}/reset`, {
    headers: { "x-forwarded-for": deviceAddress(), "x-reset-key": RESET_KEY },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/**
 * Drag one finger from `from` to `to` with real touch events. Playwright's own
 * touchscreen only taps, and a mouse drag is not a touch: the controller reads
 * a finger differently, and so does the browser's own scrolling.
 */
export async function fingerDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * Wait for a phone's hand to finish turning up and dealing in. A tap while the
 * row is still tipping over lands where the tile is about to be, not on it.
 */
export async function settleHand(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      (document.querySelector(".phone__hand")?.getAnimations({ subtree: true }) ?? []).map((a) =>
        a.finished.catch(() => undefined),
      ),
    ),
  );
}
