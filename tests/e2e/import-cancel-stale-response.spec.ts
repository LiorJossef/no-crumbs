import { expect, test, type Page } from '@playwright/test';

/**
 * FIX-ERR-QA — what `Cancel` on the rail actually cancels.
 *
 * `RailScreen`'s `Cancel` is wired to `reset()`, which clears the field and returns to the paste
 * screen. It does **not** abort the in-flight `fetch('/api/imports/probe')` — there is no
 * `AbortController` anywhere in `import-page-client.tsx`, on this branch or on `main`. So the
 * request keeps running, and when it resolves its `setScreen(...)` lands on whatever the user is
 * looking at by then.
 *
 * This is pre-existing, but `fix/honest-import-errors` widens where the stale screen can land: on
 * `main` a cancelled user could only re-submit another *valid* link, whereas `canSubmit` is now
 * satisfied by any non-empty string, so an Instagram link now reaches a `redirect` screen that the
 * previous request's success can overwrite a second later.
 *
 * The probe response is held by `page.route` so the race lands the same way every run. It is not
 * an artefact of that delay: the identical sequence with no harness delay reproduced on
 * `desktop-chrome` against the local dev server, going from `That link isn’t a TikTok.` to
 * `1 place found` on its own. That variant is not kept here because whether it lands depends on
 * TikTok's oEmbed latency, and a test that fails only sometimes is worth less than one that
 * fails always.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;
const CACHED = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';
const INSTAGRAM = 'https://www.instagram.com/reel/Cabcdefghij/';

async function signIn(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      return;
    } catch { /* dev-mode hydration race */ }
  }
  throw new Error('could not sign in after four attempts');
}

test.describe('a cancelled import cannot take the screen back', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 180_000 });

  test('cancel, then paste a non-TikTok link: the redirect screen survives', async ({ page }) => {
    // The probe response is held for 6s so the race is deterministic. The delay is in the harness,
    // not the product — the same sequence reproduces at natural latency, just less reliably.
    await page.route('**/api/imports/probe', async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.continue();
    });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Paste a TikTok link').fill(CACHED);
    await page.getByRole('button', { name: 'Add →' }).click();
    await expect(page.getByRole('heading', { name: 'Adding your TikTok link' })).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByPlaceholder('Paste a TikTok link')).toBeVisible();

    await page.getByPlaceholder('Paste a TikTok link').fill(INSTAGRAM);
    await page.getByRole('button', { name: 'Add →' }).click();
    const headlineNow = await page.locator('h1').first().innerText();

    await page.waitForTimeout(9000);
    const headlineLater = await page.locator('h1').first().innerText();
    console.log(JSON.stringify({ headlineNow, headlineLater }));
    expect(headlineLater, 'the cancelled import must not replace the screen the user is on').toBe(headlineNow);
  });

});
