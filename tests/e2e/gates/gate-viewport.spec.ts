import { expect, test } from '@playwright/test';

/**
 * The guard on the gate viewports themselves.
 *
 * `docs/archive/overnight-run-plan.md` §8a Q1 and six package exit criteria are written against **390×844
 * and 1440×900**. Until 2026-08-31 nothing in this repository could produce either number:
 * `devices['Pixel 7']` is 412×839 and `devices['Desktop Chrome']` is 1280×720. That is the kind of
 * mismatch that is invisible in a report — a screenshot labelled "390×844" that was taken at 412 px
 * looks exactly like one that was not — so it is asserted here rather than trusted.
 *
 * The specs that judge a gate criterion belong in this directory, on these two projects. This one
 * only fixes the frame they are judged in, and rides on the landing page because `/` is the single
 * route that renders in a checkout with no Supabase credentials (measured at commit 55698ae:
 * `/map`, `/import`, `/collections` and `/profile` all 500 without them). Anything asserting a
 * signed-in screen has to skip the way the specs one directory up already do.
 */

const EXPECTED = {
  'gate-mobile': { width: 390, height: 844 },
  'gate-desktop': { width: 1440, height: 900 },
} as const;

test('the gate viewport is exactly the size the run plan names', async ({ page }, testInfo) => {
  const expected = EXPECTED[testInfo.project.name as keyof typeof EXPECTED];
  expect(
    expected,
    `${testInfo.project.name} has no declared gate size; a gate spec must run on gate-mobile or gate-desktop`,
  ).toBeDefined();

  await page.goto('/');

  const measured = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(measured).toEqual(expected);
});

test('the landing page renders without Supabase credentials', async ({ page }) => {
  // Not a formality. `/` reads the session and its `currentUserOrNull` swallows the failure on
  // purpose, so an unconfigured deployment still gets a landing screen and a route to sign-in.
  // Remove that try/catch and this page 500s, taking the only screen a broken deployment can be
  // diagnosed from with it.
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
});
