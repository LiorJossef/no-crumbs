/**
 * `/import?url=…` — the addressable seam, and the boundary it is not allowed to become.
 *
 * The product's one verb had no URL: `/import` rendered `<ImportPageClient />` with no props, so a
 * link could only arrive by a human typing it into a field. This file asserts the two properties
 * that make the seam safe to open.
 *
 * **1. It routes through the existing SSRF boundary rather than around it.** Every case below takes
 * what `sharedImportUrl` returns and runs `canonicaliseTikTokUrl` on it — the same call
 * `useImportRun.submit` makes on a paste — and asserts the verdict. A hostile parameter has to be
 * refused by the allow-list that already exists, not by a second one invented for query strings.
 *
 * **2. It never produces a blank screen.** A value it cannot make sense of is handed on rather than
 * dropped, so the user lands on the product's existing failure copy against the text that actually
 * arrived. `null` is reserved for "nothing was sent at all".
 *
 * The manifest's `share_target` is checked here too: its `action` and its parameter names are a
 * contract with this route, on a platform nobody developing this runs, and a drift between them
 * fails silently.
 */
import { describe, expect, it, vi } from 'vitest';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';

// `page.tsx` is a Server Component: `server-only` throws under Node's default conditions, and the
// client component's whole screen tree is irrelevant to the pure function under test.
vi.mock('server-only', () => ({}));
vi.mock('@/app/import/import-page-client', () => ({ ImportPageClient: () => null }));

const { SHARED_URL_PARAM, sharedImportUrl } = await import('@/app/import/page');
const { default: manifest } = await import('@/app/manifest');

/** A real, live TikTok — the one the import pipeline is verified against. */
const REAL = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';

describe('sharedImportUrl', () => {
  it('passes a TikTok link straight through to the ordinary paste path', () => {
    const shared = sharedImportUrl(REAL);
    expect(shared).toBe(REAL);
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(true);
  });

  it('accepts a short link, which is what a share sheet actually emits', () => {
    const shared = sharedImportUrl('https://vm.tiktok.com/ZS2abc/');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(true);
  });

  it('pulls the link out of a share blob — caption, link, hashtags, one field', () => {
    const shared = sharedImportUrl('best falafel in tel aviv 🧆 https://vm.tiktok.com/ZS2abc/ #tlv');
    expect(shared).toBe('https://vm.tiktok.com/ZS2abc/');
    expect(canonicaliseTikTokUrl(shared as string).ok).toBe(true);
  });

  it('is nothing at all when the parameter is absent or empty', () => {
    expect(sharedImportUrl(undefined)).toBeNull();
    expect(sharedImportUrl('')).toBeNull();
    expect(sharedImportUrl('   ')).toBeNull();
    expect(sharedImportUrl([])).toBeNull();
    expect(sharedImportUrl(['', '  '])).toBeNull();
  });

  /* --- the array case: `share_target` maps `url` and `text` onto one name ------------------- */

  it('takes the value that actually contains a link, whichever field it arrived in', () => {
    expect(sharedImportUrl(['Look at this', REAL])).toBe(REAL);
    expect(sharedImportUrl([REAL, 'Look at this'])).toBe(REAL);
  });

  it('falls back to the first non-empty value when no value holds a link', () => {
    // Still wrong, still handed on: the user sees the honest failure against their own text.
    expect(sharedImportUrl(['', 'no link here', 'nor here'])).toBe('no link here');
  });

  /* --- hostile input: refused by the allow-list that already exists -------------------------- */

  it('refuses a host that merely contains an allowed host', () => {
    const shared = sharedImportUrl('https://tiktok.com.evil.test/@a/video/7259010845558983978');
    // Handed on unchanged — the allow-list is equality, so this is its job, not this seam's.
    expect(shared).toBe('https://tiktok.com.evil.test/@a/video/7259010845558983978');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('refuses userinfo smuggling', () => {
    const shared = sharedImportUrl('https://www.tiktok.com@evil.test/@a/video/7259010845558983978');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('refuses a `javascript:` scheme, and as MALFORMED_URL — the code that keeps it off a link', () => {
    const shared = sharedImportUrl('javascript:alert(1)');
    expect(shared).toBe('javascript:alert(1)');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    // MALFORMED_URL is inline copy on the paste screen, so this string never reaches the failure
    // screen's `Open the link` anchor. That is the property, not an implementation detail.
    if (!verdict.ok) expect(verdict.error.code).toBe('MALFORMED_URL');
  });

  it('refuses a non-URL string', () => {
    const shared = sharedImportUrl('drop table places');
    expect(shared).toBe('drop table places');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error.code).toBe('MALFORMED_URL');
  });

  it('sends an Instagram link to the recognised redirect, not to a failure', () => {
    const shared = sharedImportUrl('https://www.instagram.com/reel/Cxyz123/');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    // `UNSUPPORTED_HOST` is the manual-add redirect (`brand-and-product-foundation.md` §1), which
    // is exactly what a shared Instagram link should get.
    if (!verdict.ok) expect(verdict.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('sends a YouTube link to the same recognised redirect', () => {
    const shared = sharedImportUrl('https://youtu.be/dQw4w9WgXcQ');
    const verdict = canonicaliseTikTokUrl(shared as string);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('refuses an IP literal and an explicit port — the SSRF shapes', () => {
    for (const hostile of [
      'http://127.0.0.1/@a/video/7259010845558983978',
      'http://169.254.169.254/latest/meta-data/',
      'https://www.tiktok.com:8080/@a/video/7259010845558983978',
    ]) {
      const verdict = canonicaliseTikTokUrl(sharedImportUrl(hostile) as string);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.error.code).toBe('UNSUPPORTED_HOST');
    }
  });
});

describe('the manifest share target and the seam agree', () => {
  it('points at /import and at the parameter this route reads', () => {
    const target = manifest().share_target;
    expect(target).toBeDefined();
    expect(target?.action).toBe('/import');
    expect(target?.method).toBe('GET');
    // Both fields, one destination: Android puts the link in `text` more often than in `url`.
    expect(target?.params.url).toBe(SHARED_URL_PARAM);
    expect(target?.params.text).toBe(SHARED_URL_PARAM);
  });
});
