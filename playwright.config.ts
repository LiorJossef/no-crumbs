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
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
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
