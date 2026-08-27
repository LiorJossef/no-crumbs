import { expect, test, type Page } from '@playwright/test';

/**
 * FIX-ERR-QA — the failure screen must never be a dead end.
 *
 * `importErrorActions` guarantees a non-empty action list as *data*, and `ImportFailureScreen`
 * drops `open_tiktok` / `open_link` when the field is empty (`if (!url) return null`). Neither
 * check covers the case this file drives: an action that is rendered, is the primary, and does
 * nothing when pressed.
 *
 * The defect QA found: `Retry` calls `submit()`, `submit()` re-reads `url` from state, and
 * `RailScreen`'s `Cancel` was `reset()` — which cleared `url` without aborting the in-flight
 * request. A cancelled-then-failing request landed on a failure screen whose `url` was `''`, where
 * `Retry` re-entered `submit()`, failed the canonicaliser on an empty string, and returned without
 * changing anything.
 *
 * **This file was restructured when that was fixed, and the reason matters.** The original first
 * test drove the dead end by cancelling the rail and then waiting for the failure screen to
 * arrive. `submit()` now holds an `AbortController`: `Cancel` aborts the request, and a response
 * that lost its race sets no state at all — so a cancelled import can no longer produce a failure
 * screen for `Retry` to be dead on. Waiting for one is waiting for the bug.
 *
 * Nothing was dropped. The original assertion — pressing the primary on a failure screen must
 * actually re-run the import — is kept verbatim below, driven by a failure that is genuinely
 * reachable (a TikTok URL whose video does not exist). The cancel path gets a **stronger** claim
 * than it had: not "if a failure screen appears, Retry works" but "a cancelled import produces no
 * screen at all". Both still fail on the code as it was.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;
/** A well-formed TikTok URL whose video id does not exist: `POST_UNAVAILABLE`, no model call. */
const MISSING = 'https://www.tiktok.com/@a/video/7259010845558983975';

async function signIn(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    try { await page.waitForURL('**/map', { timeout: 20_000 }); return; } catch { /* hydration race */ }
  }
  throw new Error('could not sign in after four attempts');
}

test.describe('the failure screen is never a dead end', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 180_000 });

  test('a cancelled rail produces no failure screen at all', async ({ page }) => {
    // The original shape of the dead end, asserted from the other side. `Cancel` aborts the
    // request, so the screen the user is returned to is the one they keep — there is no late
    // failure screen, and therefore no dead `Retry` on one. Fails on the pre-fix code, where the
    // cancelled request resolved and took the screen.
    const probes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/imports/probe')) probes.push(r.postData() ?? ''); });

    // Held so `Cancel` is reachable before the failure arrives. The delay is the harness; the
    // sequence is ordinary user behaviour on any import slower than a tap.
    await page.route('**/api/imports/probe', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(MISSING);
    await page.getByRole('button', { name: 'Add →' }).click();
    await expect(page.getByRole('heading', { name: 'Adding your TikTok' })).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByPlaceholder('Paste a TikTok link')).toBeVisible();

    // Well past the 5s hold, so the cancelled request has certainly resolved by now.
    await page.waitForTimeout(12_000);
    const headline = await page.locator('h1').first().innerText();
    console.log(JSON.stringify({ headlineAfterCancel: headline, probeRequests: probes.length }));

    await expect(
      page.getByRole('button', { name: 'Retry' }),
      'a cancelled import must not produce a failure screen to be dead on',
    ).toHaveCount(0);
    await expect(page.getByPlaceholder('Paste a TikTok link')).toBeVisible();
    expect(headline, 'the user stays where Cancel put them').toBe('Add a TikTok');
  });

  test('Retry on a failure screen actually re-runs the import', async ({ page }) => {
    // The original assertion, on a failure that is reachable without cancelling anything: a
    // well-formed TikTok URL whose video does not exist fails at the source stage
    // (`POST_UNAVAILABLE`) and never reaches the model.
    const probes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/imports/probe')) probes.push(r.postData() ?? ''); });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(MISSING);
    await page.getByRole('button', { name: 'Add →' }).click();

    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 30_000 });

    const before = probes.length;
    const headlineBefore = await page.locator('h1').first().innerText();
    const actionsBefore = await page.locator('main button, main a').allInnerTexts();
    await retry.click();
    await page.waitForTimeout(2500);
    const headlineAfter = await page.locator('h1').first().innerText();
    console.log(JSON.stringify({
      headlineBefore,
      actionsBefore: actionsBefore.map((t) => t.trim()).filter(Boolean),
      requestsBeforeRetry: before,
      requestsAfterRetry: probes.length,
      headlineAfter,
      retriedTheSameUrl: probes.every((b) => b === probes[0]),
    }));

    expect(probes.length, 'the primary action on a failure screen must do something').toBeGreaterThan(before);
    expect(probes.every((b) => b === probes[0]), 'Retry must re-send the same url').toBe(true);
  });

  test('an unrecognised server code renders a real screen, not a blank one', async ({ page }) => {
    await page.route('**/api/imports/probe', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SOME_CODE_WE_DO_NOT_KNOW', retryable: true } }),
      });
    });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill('https://www.tiktok.com/@a/video/7259010845558983978');
    await page.getByRole('button', { name: 'Add →' }).click();

    const headline = page.locator('h1').first();
    await expect(headline).toHaveText('That didn’t work on our side.', { timeout: 30_000 });
    const body = await page.locator('main').innerText();
    console.log(JSON.stringify({ unknownCodeScreen: body.replace(/\n+/g, ' | ').slice(0, 300) }));
    expect(body).toContain('Reference: SOME_CODE_WE_DO_NOT_KNOW');
  });
});
