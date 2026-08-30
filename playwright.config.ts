import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;

export default defineConfig({
  testDir: './tests/e2e',
  // Without this line the guard is dead code, which is what it was from the day it was written
  // until 2026-08-30: CI skipped 28 of 34 tests and reported green. See tests/e2e/global-setup.ts.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  // Mobile-first: the primary target is a phone browser (ux-architecture).
  projects: [
    // `testIgnore` is load-bearing, not tidiness: `testDir` is `./tests/e2e` and it recurses, so
    // without it every gate spec would also run on these two projects at 412×839 and 1280×720 —
    // the exact sizes the gate specs exist to rule out.
    { name: 'mobile-chrome', testIgnore: '**/gates/**', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', testIgnore: '**/gates/**', use: { ...devices['Desktop Chrome'] } },
    // The two viewports the quality gates are written against, and they are not the two above.
    //
    // `docs/overnight-run-plan.md` §8a Q1 names 390×844 and 1440×900, and six package exit criteria
    // repeat those numbers. Measured at commit 55698ae: **`devices['Pixel 7']` is 412×839 and
    // `devices['Desktop Chrome']` is 1280×720** — neither project can produce either gate size. A
    // screenshot taken at 412 px and filed against a 390 px criterion is 22 px off, which is
    // exactly the width at which a layout decides how many columns it has.
    //
    // Added rather than substituted: the two projects above are what every existing spec has run
    // on, and silently re-sizing them would change the meaning of tests this change has no business
    // touching. These two carry their own `testDir`, so `npx playwright test` picks up only the
    // specs written for them and the existing suite runs exactly as before.
    {
      name: 'gate-mobile',
      testDir: './tests/e2e/gates',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'gate-desktop',
      testDir: './tests/e2e/gates',
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
  // Against a preview URL (PLAYWRIGHT_BASE_URL) we drive the deployment itself and
  // start no local server. The key is omitted rather than set to undefined, because
  // exactOptionalPropertyTypes makes that distinction real.
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run start',
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
