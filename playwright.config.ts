/**
 * Playwright configuration.
 *
 * Runs E2E tests against either:
 *  - a production build (`npm run build && npm start`) for CI
 *  - the dev server when running locally (`npm run dev`)
 *
 * Set the `CI` environment variable to switch between the two modes; locally
 * you can also `PLAYWRIGHT_DEV=1 npx playwright test` to use dev mode.
 *
 * Two projects mirror the two viewports that matter most for a PWA:
 *  - chromium (desktop)
 *  - mobile-chrome (375 px — smallest common phone)
 */

import { defineConfig, devices } from "@playwright/test";

const useDevServer =
  !process.env["CI"] || process.env["PLAYWRIGHT_DEV"] === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  /* Run each spec file in parallel; keep individual tests serial within a file
     so scoring state is deterministic. */
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: useDevServer ? "npm run dev" : "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
