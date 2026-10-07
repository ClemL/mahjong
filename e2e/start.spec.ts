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
}
