import { expect, test, type Page } from '@playwright/test';

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
  { name: 'tiktok photo post', url: 'https://www.tiktok.com/@joelleuzyel/photo/7259010845558983978', expect: 'screen' },
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
    } catch {
      // fall through and try again
    }
  }
  throw new Error('could not sign in after four attempts');
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
});
