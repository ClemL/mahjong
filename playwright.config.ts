import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Browser smoke tests against the production build.
 *
 * They drive the built app because every UI bug found so far — a double
 * discard, a broken phone grid, an invisible suit mark — showed up only in a
 * real browser. Run `npm run build` first; the server here is `next start`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Each multiplayer spec owns one of the three tables, and the room store is
  // the server's memory, so one worker keeps them from racing.
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
