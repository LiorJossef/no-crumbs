import { expect, test, type Page } from '@playwright/test';

import { DOMAIN_ERROR_CODES } from '@/domain/errors';

/**
 * FIX-ERR-QA — every code in the taxonomy renders a real screen in the real browser.
 *
 * `IMPORT_ERROR_COPY` is a total `Record<DomainErrorCode, …>` and the unit tier asserts that. What
 * the unit tier cannot see is the render: `ImportFailureScreen` picks an icon out of a second map
 * keyed by `copy.icon`, drops `open_tiktok`/`open_link` when the field is empty, and hides the
 * `Reference:` line when `rawCode` is null. A missing icon key, an empty action list or a blank
 * headline is a browser fact.
 *
 * The response is faked by the harness rather than provoked for real: eleven of the fourteen codes
 * cannot be produced on demand without breaking a dependency, and provoking the extractor ones
 * would spend model calls against the 500/day ceiling. What is real here is the client: the same
 * `submit()`, the same narrowing, the same component.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;
const VALID = 'https://www.tiktok.com/@a/video/7259010845558983978';

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

test.describe('every DomainErrorCode renders a usable failure screen', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 300_000 });

  test('no blank headline, no empty action list, for any of the fourteen', async ({ page }) => {
    let code = 'INTERNAL';
    let retryable = true;
    await page.route('**/api/imports/probe', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, retryable } }),
      });
    });

    await signIn(page);
    const seen: Record<string, { headline: string; kicker: string; body: string; actions: string[] }> = {};

    for (const c of DOMAIN_ERROR_CODES) {
      for (const r of [true, false]) {
        code = c;
        retryable = r;
        await page.goto('/import');
        await page.waitForLoadState('networkidle');
        await page.getByPlaceholder('Paste a TikTok link').fill(VALID);
        await page.getByRole('button', { name: 'Add →' }).click();

        const headline = page.locator('h1').first();
        await expect(headline).not.toHaveText('', { timeout: 20_000 });
        await expect(headline).not.toHaveText('Add a TikTok link');

        const actions = (await page.locator('main button, main a').allInnerTexts())
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        const texts = await page.locator('main p').allInnerTexts();

        expect(actions.length, `${c} (retryable=${r}): a failure screen must offer a way out`).toBeGreaterThan(0);
        expect(await headline.innerText(), `${c}: headline`).not.toBe('');
        // `Reference:` is the support handle, never the explanation, and it is not an action.
        expect(actions.some((a) => a.startsWith('Reference:'))).toBe(false);
        if (r) seen[c] = { headline: await headline.innerText(), kicker: texts[0] ?? '', body: texts[1] ?? '', actions };
      }
    }

    console.log('\nFAILURE SCREENS\n' + Object.entries(seen).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n');

    // Fourteen codes, and no two of them may be the same screen except the two pairs `07` §9
    // deliberately makes identical.
    const byHeadline = new Map<string, string[]>();
    for (const [c, v] of Object.entries(seen)) {
      byHeadline.set(v.headline, [...(byHeadline.get(v.headline) ?? []), c]);
    }
    const shared = [...byHeadline.values()].filter((cs) => cs.length > 1).map((cs) => cs.sort().join('+'));
    expect(shared.sort()).toEqual([
      'EXTRACTOR_INVALID_OUTPUT+EXTRACTOR_UNAVAILABLE',
      'RATE_LIMITED_UPSTREAM+UPSTREAM_TIMEOUT',
    ]);
  });
});
