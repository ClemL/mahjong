import { type Page, expect } from "@playwright/test";

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
      JSON.stringify({ muted: true, ...stored, version: 2 }),
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
