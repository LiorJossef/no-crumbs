import { expect, test, type Page } from '@playwright/test';

/**
 * FIX-ERR-QA — the honest-status claim, measured on the wire.
 *
 * `fix/honest-import-errors` replaces a blanket HTTP 502 with a per-code status and swaps
 * `INTERNAL` for the real `DomainErrorCode` on the request-shaped failures. Both are wire facts, so
 * they are asserted against the running route rather than against `HTTP_STATUS_BY_ERROR_CODE` —
 * the unit tier already pins the table to itself, which cannot catch a route that never consults it.
 *
 * Requests are issued from inside the signed-in page so they carry the real session cookies, and
 * every case here fails before the model is reached: no case in this file can spend a Gemini call.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

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

interface Case {
  readonly name: string;
  /** Sent verbatim as the request body. `null` means "send nothing at all". */
  readonly body: string | null;
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
}

const CASES: readonly Case[] = [
  { name: 'body is not JSON', body: 'not json at all', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'empty body', body: null, status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'no url key', body: '{}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'url is a number', body: '{"url":123}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'url is an object', body: '{"url":{"toString":"x"}}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'url is an array of one link', body: '{"url":["https://www.tiktok.com/@a/video/7259010845558983978"]}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'javascript: scheme', body: '{"url":"javascript:alert(1)"}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'file: scheme', body: '{"url":"file:///etc/passwd"}', status: 400, code: 'MALFORMED_URL', retryable: false },
  { name: 'internal ipv4 literal', body: '{"url":"http://169.254.169.254/latest/meta-data/"}', status: 422, code: 'UNSUPPORTED_HOST', retryable: false },
  { name: 'localhost with a tiktok-shaped path', body: '{"url":"http://127.0.0.1:54321/@a/video/7259010845558983978"}', status: 422, code: 'UNSUPPORTED_HOST', retryable: false },
  { name: 'credentials in authority', body: '{"url":"https://u:p@www.tiktok.com/@a/video/7259010845558983978"}', status: 422, code: 'UNSUPPORTED_HOST', retryable: false },
  { name: 'suffix look-alike host', body: '{"url":"https://tiktok.com.evil.io/@a/video/7259010845558983978"}', status: 422, code: 'UNSUPPORTED_HOST', retryable: false },
  { name: 'instagram', body: '{"url":"https://www.instagram.com/reel/Cabcdefghij/"}', status: 422, code: 'UNSUPPORTED_HOST', retryable: false },
  { name: 'tiktok profile', body: '{"url":"https://www.tiktok.com/@joelleuzyel"}', status: 422, code: 'UNSUPPORTED_URL', retryable: false },
  { name: 'tiktok photo post', body: '{"url":"https://www.tiktok.com/@a/photo/7259010845558983978"}', status: 422, code: 'PHOTO_POST', retryable: false },
  { name: 'nonexistent video id', body: '{"url":"https://www.tiktok.com/@a/video/7259010845558983971"}', status: 422, code: 'POST_UNAVAILABLE', retryable: true },
];

test.describe('every probe failure carries its own status and code', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 300_000 });

  test('signed in', async ({ page }) => {
    await signIn(page);
    const results: unknown[] = [];

    for (const c of CASES) {
      const out = await page.evaluate(async (body: string | null) => {
        const res = await fetch('/api/imports/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body === null ? {} : { body }),
        });
        const text = await res.text();
        return { status: res.status, text: text.slice(0, 400) };
      }, c.body);
      results.push({ case: c.name, ...out });
    }
    console.log('\nPROBE STATUS MAP\n' + results.map((r) => JSON.stringify(r)).join('\n') + '\n');

    for (const [i, c] of CASES.entries()) {
      const r = results[i] as { status: number; text: string };
      const parsed = JSON.parse(r.text) as { error?: { code?: string; retryable?: boolean } };
      expect(r.status, `${c.name}: HTTP status`).toBe(c.status);
      expect(parsed.error?.code, `${c.name}: code`).toBe(c.code);
      expect(parsed.error?.retryable, `${c.name}: retryable`).toBe(c.retryable);
      // No prose, ever: the payload is a code and two booleans.
      expect(Object.keys(parsed.error ?? {}).sort(), `${c.name}: payload shape`).toEqual(['code', 'retryable']);
    }
  });

  test('signed out gets 401 NOT_AUTHENTICATED, not a 502', async ({ page }) => {
    await page.goto('/sign-in');
    const out = await page.evaluate(async () => {
      const res = await fetch('/api/imports/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.tiktok.com/@a/video/7259010845558983978' }),
      });
      return { status: res.status, text: (await res.text()).slice(0, 300) };
    });
    console.log('SIGNED OUT ' + JSON.stringify(out));
    expect(out.status).toBe(401);
    expect(JSON.parse(out.text).error.code).toBe('NOT_AUTHENTICATED');
  });
});
