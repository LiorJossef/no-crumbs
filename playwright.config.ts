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
  // Two reporters in CI, and the second is not decoration. `ci.yml`'s `upload-artifact` step
  // uploads `playwright-report/`, and the `github` reporter never writes that directory — so the
  // step has been dead for as long as it has existed. Measured on run 33661142026 (2026-09-02):
  // 24 tests failed, `trace: 'on-first-retry'` recorded a trace for every one of them, and the
  // upload logged "No files were found with the provided path: playwright-report/". Every one of
  // those failures then had to be reconstructed from the raw job log.
  //
  // `open: 'never'` because a reporter that launches a browser is a hang on a runner.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    /**
     * **Driving a `next dev` server: use `http://localhost:<port>`, never `http://127.0.0.1:<port>`.**
     *
     * Measured 2026-09-02 against `next dev -p 4311`: every request for `/_next/static/chunks/*.js`
     * returned **403** when the page was loaded from `127.0.0.1`, and 200 from `localhost` — Next's
     * dev-server cross-origin protection does not treat the two as the same origin. The app then
     * never hydrates, so every `click` on a `type="submit"` button submits the form *natively*
     * (`GET /sign-in?`), and every signed-in spec dies with `could not sign in after four attempts`
     * against credentials that authenticate fine on the wire. It reads exactly like a broken login.
     *
     * The default below stays `127.0.0.1` because it is the address `webServer` boots and probes,
     * and that path runs `next start` — a production server, which has no such check and where
     * `localhost` risks resolving to `::1` against a server bound to IPv4. So: the default is right
     * for the built path CI takes, and anyone pointing this suite at a dev server must set
     * `PLAYWRIGHT_BASE_URL=http://localhost:<port>` by hand.
     */
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
    // `docs/archive/overnight-run-plan.md` §8a Q1 names 390×844 and 1440×900, and six package exit criteria
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
          // CI has already run `npm run build` as its own step ("build against the local stack"),
          // so building again here paid for the same compile twice inside a 180s budget. Warm
          // `.next/cache` made the second one incremental rather than free, which is why it went
          // unnoticed. Locally there is no prior build, so the pair stays.
          command: process.env.CI ? 'npm run start' : 'npm run build && npm run start',
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
