import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * `docs/ux-collections-as-scope.md` §5 items 1, 2 and 4: **the collections index is S4 with
 * collections in it, not a second page.**
 *
 * `tests/unit/shell/one-shell.test.ts` already proves the page chrome is gone from the *source*.
 * What only a browser can prove is the other half of the ruling — that something is behind the
 * list. A route can delete its header, its column and its back arrow and still render a white
 * void; the reason for deleting them was that dragging the sheet down should leave you looking at
 * your own places.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

test.describe('the collections index', () => {
  test.skip(!PASSWORD, 'E2E_PASSWORD is required');
  // The 30s default is not enough for this file's `beforeEach`, and that is the whole reason all
  // five of its tests failed identically at commit c99db5e: the hook signs in (four attempts, per
  // `_lib/sign-in.ts`) and then waits for `networkidle` on a MapLibre surface. Both artefacts in
  // `test-results/` show the timeout firing while the page is still the sign-in screen. Every
  // other signed-in spec in this directory already raises it to 180-300s; this file was the only
  // one that never did. No assertion is changed.
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    // The canonical URL. `/collections` still resolves and is covered by the redirect assertion
    // below, but driving the shim on every test would measure the redirect rather than the screen.
    await page.goto('/map?view=collections');
    await page.waitForLoadState('networkidle');
    // The list is in the document twice — the sheet (`lg:hidden`) and the panel
    // (`hidden lg:block`) — so `.first()` is whichever the breakpoint happens to hide.
    await expect(page.getByText(/yours/i).locator('visible=true').first()).toBeVisible();
  });

  test('renders a real map behind the list, not a void', async ({ page }) => {
    // The shell's own canvas, and it has to have painted: an unmounted MapLibre surface leaves a
    // zero-sized canvas that a `toBeVisible` would still pass.
    const box = await page.locator('canvas.maplibregl-canvas').first().boundingBox();
    expect(box, 'the map canvas is mounted').not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);
    await expect(page.getByText(/OpenStreetMap contributors/i)).toBeVisible();
  });

  test('carries none of the page chrome the ruling deleted', async ({ page }) => {
    // `visible=true` because the assertion is about the *sheet*, not the document. The `lg+` panel
    // in `collections-index-list.tsx` renders its own <h1> by design and is `display: none` at this
    // width — still in the DOM, so a bare `locator('h1')` counts chrome that is not on screen.
    await expect(page.locator('h1').locator('visible=true')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /back to the map/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /go to your map/i })).toHaveCount(0);
  });

  test('still has exactly one bottom bar, and it is the shell’s', async ({ page }) => {
    await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
  });

  /**
   * **The old URL still works**, which is the half of the 2026-08-31 route merge that is easy to
   * forget and impossible to recover: `/collections` is in browser history, in bookmarks, in the
   * bar people learned and in anything anyone has shared. A restructure that quietly 404s
   * previously-working links is a worse defect than the flicker it removed.
   */
  test('keeps the URL it used to live at, as a redirect', async ({ page }) => {
    await page.goto('/collections');
    await page.waitForURL('**/map?view=collections', { timeout: 15_000 });
    await expect(page.getByText(/yours/i).locator('visible=true').first()).toBeVisible();
  });
});
