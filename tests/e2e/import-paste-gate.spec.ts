import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * FIX-ERR-QA — adversarial guard on the `/import` paste gate.
 *
 * `fix/honest-import-errors` widened `canSubmit` from "the canonicaliser said ok" to "the field is
 * non-empty", so the `Add →` button is now live for input the client used to refuse outright. The
 * safety property that replaced it lives entirely inside `submit()`: it re-runs the canonicaliser
 * and only reaches the network on `ok`. That property is now the only thing between a hostile
 * paste and a request, so it is asserted here rather than assumed — with a hard count of the
 * requests the page actually issued to `/api/imports/probe`.
 *
 * One sign-in, one page, cases run in sequence: eighteen parallel sign-ins trip Supabase's local
 * auth rate limiter and the failures are the limiter, not the product.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

/** `dead` = the button is disabled and nothing at all happens, which is what a whitespace-only
 *  field gets: `canSubmit` is `url.trim().length > 0`, and `showInvalid` needs the same non-empty
 *  trim, so neither the button nor the inline sentence is reachable. Recorded rather than asserted
 *  as good — it is unchanged from `main` and out of this change's scope. */
type Verdict = 'inline' | 'screen' | 'dead';

const HOSTILE: readonly { readonly name: string; readonly url: string; readonly expect: Verdict }[] = [
  { name: 'pure whitespace', url: '     ', expect: 'dead' },
  { name: 'single character', url: 'x', expect: 'inline' },
  { name: 'data: URL', url: 'data:text/html,<script>alert(1)</script>', expect: 'inline' },
  { name: 'javascript: URL', url: 'javascript:alert(document.cookie)', expect: 'inline' },
  { name: 'file: URL', url: 'file:///etc/passwd', expect: 'inline' },
  { name: 'credentials in authority', url: 'https://u:p@www.tiktok.com/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'userinfo host confusion', url: 'https://www.tiktok.com@evil.io/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'suffix look-alike host', url: 'https://tiktok.com.evil.io/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'prefix look-alike host', url: 'https://nottiktok.com/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'cyrillic homograph host', url: 'https://www.tiktоk.com/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'explicit port', url: 'https://www.tiktok.com:8080/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'IPv4 literal', url: 'https://127.0.0.1/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'IPv6 literal', url: 'https://[::1]/@a/video/7259010845558983978', expect: 'screen' },
  { name: 'instagram link', url: 'https://www.instagram.com/reel/Cabcdefghij/', expect: 'screen' },
  { name: 'tiktok profile', url: 'https://www.tiktok.com/@joelleuzyel', expect: 'screen' },
  // `tiktok photo post` used to sit here, and it is not hostile any more — `PHOTO_POST` was
  // deleted from the taxonomy on 2026-08-28 and `/photo/<id>` is rewritten to `/video/<id>`. It
  // moved to its own test below rather than being deleted: one fewer entry in this list is, on its
  // own, indistinguishable from having quietly dropped a case that regressed.
  { name: 'tiktok tag page', url: 'https://www.tiktok.com/tag/telaviv', expect: 'screen' },
  { name: 'overlong video id', url: `https://www.tiktok.com/@a/video/${'9'.repeat(20000)}`, expect: 'inline' },
];

/**
 * Sign-in, retried. Under `next dev` the sign-in form is on screen before React has hydrated, and
 * a click landing in that window submits it natively (`GET /sign-in?`) instead of running
 * `handleSubmit` — a test-harness artefact of dev-mode compilation, not a product defect, but one
 * that makes a single-shot sign-in flaky.
 */
async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

test.describe('the paste gate refuses hostile input without touching the server', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test('no hostile paste reaches /api/imports/probe', async ({ page }) => {
    const probed: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/imports/probe')) probed.push(r.url());
    });

    await signIn(page);

    const field = page.getByPlaceholder('Paste a TikTok link');
    const inline = page.getByText('look like a TikTok link', { exact: false });
    const addButton = page.getByRole('button', { name: 'Add →' });
    const observed: unknown[] = [];

    for (const c of HOSTILE) {
      await page.goto('/import');
      await expect(field).toBeVisible();
      await page.waitForLoadState('networkidle');
      await field.fill(c.url);
      await field.blur();

      const inlineAfterBlur = await inline.isVisible().catch(() => false);
      const enabled = await addButton.isEnabled();
      const before = probed.length;
      if (enabled) await addButton.click();
      await page.waitForTimeout(1200);

      observed.push({
        case: c.name,
        expect: c.expect,
        buttonEnabled: enabled,
        inlineAfterBlur,
        probesIssued: probed.length - before,
        stillOnPaste: await field.isVisible().catch(() => false),
        headline: await page.locator('h1').first().innerText().catch(() => null),
      });
    }
    console.log('\nPASTE GATE OBSERVATIONS\n' + observed.map((o) => JSON.stringify(o)).join('\n') + '\n');

    expect(probed, 'no hostile paste may reach the server').toEqual([]);

    for (const [i, c] of HOSTILE.entries()) {
      const o = observed[i] as { inlineAfterBlur: boolean; stillOnPaste: boolean; headline: string | null };
      if (c.expect === 'dead') {
        expect(o.stillOnPaste, `${c.name}: must stay on the paste screen`).toBe(true);
      } else if (c.expect === 'inline') {
        expect(o.inlineAfterBlur, `${c.name}: C06 must show under the field`).toBe(true);
        expect(o.stillOnPaste, `${c.name}: must stay on the paste screen`).toBe(true);
      } else {
        expect(o.inlineAfterBlur, `${c.name}: C06 is false for this input`).toBe(false);
        expect(o.stillOnPaste, `${c.name}: must land on a failure screen`).toBe(false);
      }
    }
  });

  /**
   * The counterpart to `HOSTILE`, and the reason `tiktok photo post` is no longer in it.
   *
   * A photo link is not hostile input slipping past the gate — it is *supported* input the gate is
   * supposed to pass, since `canonicaliseTikTokUrl` rewrites `/photo/<id>` to `/video/<id>` (oEmbed
   * 400s the first form and 200s the second for the same post; measured on a real carousel,
   * 2026-08-28). The old placement made CI run 33661142026 fail the `probed` count with exactly one
   * URL in it, which was this one, behaving correctly.
   *
   * The id is the known-missing one on purpose: this asserts that the URL was accepted and fetched,
   * and a resolvable post would run the extractor to prove it.
   */
  test('a photo post is supported input, and reaches the server exactly once', async ({ page }) => {
    const probed: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/imports/probe')) probed.push(r.url());
    });

    await signIn(page);
    await page.goto('/import');
    const field = page.getByPlaceholder('Paste a TikTok link');
    await expect(field).toBeVisible();
    await page.waitForLoadState('networkidle');
    await field.fill('https://www.tiktok.com/@joelleuzyel/photo/7259010845558983971');
    await field.blur();

    // C06 is the client-side "that is not a TikTok link" sentence. A photo link must not draw it.
    await expect(
      page.getByText('look like a TikTok link', { exact: false }),
      'a photo link is not malformed',
    ).toBeHidden();

    await page.getByRole('button', { name: 'Add →' }).click();
    // A *source* answer — the post does not exist — which is only reachable if the `/photo/` URL
    // was accepted, canonicalised and actually fetched.
    await expect(
      page.getByRole('heading', { name: /couldn’t read this TikTok video yet/i }),
    ).toBeVisible({ timeout: 60_000 });
    expect(probed.length, 'one paste, one request').toBe(1);
  });
});
