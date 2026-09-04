import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

import { DOMAIN_ERROR_CODES } from '@/domain/errors';
import { IMPORT_ERROR_COPY } from '@/ui/import/import-error-copy';

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
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
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

        /**
         * **Wait for the failure screen, not for "an `h1` that is not the paste screen's".**
         *
         * The rail that runs between submit and failure has its own `h1` — `Adding your TikTok
         * link` — which is neither empty nor equal to the paste headline, so the two-line guard
         * this replaces fell straight through onto the *loading* screen and captured it. Measured
         * on CI run 33661142026: all thirteen codes were recorded with headline `Adding your TikTok
         * link`, body `WORKING ON IT` and actions `["Cancel"]`, and the only assertion that noticed
         * was the shared-headline check at the bottom of this test. Every other assertion here
         * passed against a screen that was not the subject.
         *
         * Waiting on `IMPORT_ERROR_COPY[c].headline` is also strictly stronger than what it
         * replaces: it proves the code → copy mapping reached the browser, which is the one thing
         * the unit tier cannot see. It is not a weaker restatement of the `not.toBe('')` below —
         * that assertion stays, because it is what fails loudly if the copy map ever gains a blank
         * headline.
         */
        const headline = page.locator('h1').first();
        await expect(headline).toHaveText(IMPORT_ERROR_COPY[c].headline, { timeout: 30_000 });

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
