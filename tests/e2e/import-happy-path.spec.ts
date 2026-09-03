import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * FIX-ERR-QA — the core loop still works after the error-handling change.
 *
 * `fix/honest-import-errors` rewrote the screen router in `import-page-client.tsx` (a single
 * `probe_error` screen replacing `RedirectScreen` + the old failure screen) and the whole failure
 * half of the probe route. Nothing in that is supposed to touch the success path, which is exactly
 * why it is worth driving end to end: paste → rail → review → confirm → a saved place.
 *
 * The URL is one whose extraction is already cached in `extractions` on the local database, so
 * this test **must not** cost a model call. `save_place` is idempotent
 * (`on conflict (user_id, place_id) do update`), so re-running it does not pollute the fixture.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;
const CACHED = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

test.describe('the import core loop', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 240_000 });

  test('paste, review and confirm a real TikTok', async ({ page }) => {
    const confirms: { status: number; body: string }[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/api/imports/confirm')) {
        confirms.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) });
      }
    });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(CACHED);
    await page.getByRole('button', { name: 'Add →' }).click();

    // Review screen.
    const saveButton = page.getByRole('button', { name: /^Save (this place|\d+ places) →$/ });
    await expect(saveButton).toBeVisible({ timeout: 90_000 });
    const reviewHeadline = await page.locator('h1').first().innerText();
    const cardText = await page.locator('main').innerText();

    await saveButton.click();
    await page.waitForURL('**/map', { timeout: 60_000 });
    console.log(JSON.stringify({
      reviewHeadline,
      confirms,
      landedOn: page.url(),
      review: cardText.replace(/\n+/g, ' | ').slice(0, 400),
    }));

    expect(confirms.length, 'exactly one confirm call').toBe(1);
    expect(confirms[0]?.status, 'confirm must succeed').toBe(200);
    // Breakpoint-agnostic: the saved-places control is a bottom-sheet trigger on mobile and part
    // of the sidebar on desktop, so its *visibility* differs by design. That it is attached with a
    // count in it is the fact that matters here. The written rows themselves are checked in SQL,
    // not through the UI.
    // Queried by attribute, not by role: on desktop this control is not exposed to `getByRole`
    // (recorded, not asserted — a11y at the desktop breakpoint is `map-accessibility.spec.ts`'s
    // subject, not this file's).
    const places = page.locator('[aria-label="Show your places"]').first();
    await expect(places).toBeAttached({ timeout: 30_000 });
    await expect(places).toContainText(/\d+ places saved/i);
  });
});
