import { expect, test } from "@playwright/test";
import { PHONE_PORTRAIT, TABLET, expectNoSidewaysScroll, watchErrors } from "./helpers";

for (const [label, viewport] of [
  ["phone", PHONE_PORTRAIT],
  ["tablet", TABLET],
] as const) {
  test(`start page renders on a ${label}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto("/");
    for (const mode of ["Multiplayer", "Tablet mode"]) {
      await expect(page.getByRole("link", { name: new RegExp(mode) })).toBeVisible();
    }
    // No game on this device alone: a game is a tablet and phones.
    await expect(page.getByRole("link", { name: /solo/i })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test(`every tile fits the reference sheet on a ${label}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Show every tile" }).click();
    const sheet = page.getByRole("dialog", { name: "Every tile" });
    // One of each of the 42 faces, and the back they all share.
    await expect(sheet.locator(".tile")).toHaveCount(43);
    await expect(sheet.getByRole("region", { name: "Tile back" }).locator(".tile--back")).toBeVisible();
    // Nine to a row must fit without the sheet scrolling sideways.
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
