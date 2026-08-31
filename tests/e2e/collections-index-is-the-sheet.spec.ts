import { expect, test, type Page } from '@playwright/test';

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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      return;
    } catch { /* dev-mode hydration race; every other spec retries the same way */ }
  }
  throw new Error('could not sign in after four attempts');
}

test.describe('the collections index', () => {
  test.skip(!PASSWORD, 'E2E_PASSWORD is required');

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
    await expect(page.locator('h1')).toHaveCount(0);
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
