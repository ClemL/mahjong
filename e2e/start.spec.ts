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
    for (const mode of ["Play solo", "Multiplayer", "Tablet mode"]) {
      await expect(page.getByRole("link", { name: new RegExp(mode) })).toBeVisible();
    }
    await expectNoSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test(`every tile fits the reference sheet on a ${label}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Show every tile" }).click();
    const sheet = page.getByRole("dialog", { name: "Every tile" });
    await expect(sheet.locator(".tile")).toHaveCount(42);
    // Nine to a row must fit without the sheet scrolling sideways.
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
