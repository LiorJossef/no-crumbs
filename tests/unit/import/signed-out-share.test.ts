/**
 * **A share that arrives at a locked door still has its link when the door opens.**
 *
 * `/import` demands a session. Until 2026-08-31 it redirected with `redirect('/sign-in')` — no
 * `next`, no `url` — so the one arrival the share seam was built for, a Shortcut or a share sheet
 * firing the product from nothing, handed the user back the copy-paste the seam removes.
 *
 * This file walks the whole round trip rather than either half of it, because the bug is not in
 * either half: `signedOutDestination` writes the sign-in URL, `safeReturnPath` reads it back the
 * way `sign-in-client.tsx` does, and `sharedImportUrl` receives it the way the page does on
 * arrival. A test of one function would pass with the encoding of the other two wrong.
 */
import { describe, expect, it, vi } from 'vitest';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { DEFAULT_AFTER_SIGN_IN, safeReturnPath } from '@/domain/auth/return-path';

// Same reason as `shared-url-param.test.ts`: `page.tsx` is a Server Component, `server-only` throws
// under Node's default conditions, and the client screen tree is irrelevant to a pure function.
vi.mock('server-only', () => ({}));
vi.mock('@/app/import/import-page-client', () => ({ ImportPageClient: () => null }));

const { SHARED_URL_PARAM, sharedImportUrl, signedOutDestination } = await import(
  '@/app/import/page'
);

/** A real, live TikTok — the one the import pipeline is verified against. */
const REAL = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';

/** What `sign-in-client.tsx` does with the URL we built: read `next`, then re-check it. */
function whereSignInSendsYou(destination: string): string {
  const query = destination.split('?')[1] ?? '';
  return safeReturnPath(new URLSearchParams(query).get('next'));
}

/** What `ImportPage` does with the URL sign-in pushed: read `url`, then narrow it. */
function whatTheImportRunsOn(returnPath: string): string | null {
  const query = returnPath.split('?')[1] ?? '';
  const values = new URLSearchParams(query).getAll(SHARED_URL_PARAM);
  return sharedImportUrl(values.length === 0 ? undefined : values);
}

describe('signedOutDestination', () => {
  it('carries a shared TikTok link through sign-in and into the import, unchanged', () => {
    const door = signedOutDestination(REAL);
    expect(door.startsWith('/sign-in?')).toBe(true);

    const back = whereSignInSendsYou(door);
    expect(back.startsWith('/import')).toBe(true);
    expect(whatTheImportRunsOn(back)).toBe(REAL);

    // And it is still the same link by the time the SSRF boundary sees it.
    const verdict = canonicaliseTikTokUrl(whatTheImportRunsOn(back) as string);
    expect(verdict.ok).toBe(true);
  });

  it('carries a whole Android share blob, not just a bare URL', () => {
    // A share hands over caption, link and hashtags in one field. `extractPastedUrl` narrows it on
    // arrival, exactly as it does for the same blob pasted off the clipboard.
    const blob = `Best hummus in Jaffa 🌯 ${REAL} #telaviv #food`;
    const back = whereSignInSendsYou(signedOutDestination(blob));
    expect(whatTheImportRunsOn(back)).toBe(REAL);
  });

  it('carries both values when the share target sends url and text', () => {
    const back = whereSignInSendsYou(signedOutDestination(['Look at this', REAL]));
    // `sharedImportUrl` picks the value that actually contains a link — the same rule it applies
    // to a fresh arrival, still runnable because both values survived.
    expect(whatTheImportRunsOn(back)).toBe(REAL);
  });

  it('sends a signed-out visitor back to /import even with nothing to carry', () => {
    const back = whereSignInSendsYou(signedOutDestination(undefined));
    expect(back).toBe('/import');
    expect(whatTheImportRunsOn(back)).toBe(null);
  });

  it('asks for no return path at all when the payload is too long to carry', () => {
    // The failure is the old behaviour — land on the map — rather than a broken URL. This route
    // never promises a destination `safeReturnPath` would refuse.
    const door = signedOutDestination('x'.repeat(3000));
    expect(door).toBe('/sign-in');
    expect(whereSignInSendsYou(door)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('hands a hostile payload to the boundary that already refuses it, rather than to a fetch', () => {
    // The seam's rule (`sharedImportUrl`'s header): a value we can see is not a TikTok link is
    // forwarded so the user gets the product's existing failure copy, not a blank screen. Surviving
    // sign-in must not change that — and must not make this a second host check.
    for (const [payload, code] of [
      ['https://www.instagram.com/reel/abc/', 'UNSUPPORTED_HOST'],
      ['http://169.254.169.254/latest/meta-data/', 'UNSUPPORTED_HOST'],
      // MALFORMED_URL, not UNSUPPORTED_HOST: that is the code that keeps the string off the failure
      // screen's `Open the link` anchor, and surviving a sign-in must not change which one it gets.
      ['javascript:alert(1)', 'MALFORMED_URL'],
      ['https://tiktok.com.evil.test/@a/video/1', 'UNSUPPORTED_HOST'],
    ] as const) {
      const back = whereSignInSendsYou(signedOutDestination(payload));
      const arrived = whatTheImportRunsOn(back);
      expect(arrived, payload).toBe(payload);
      const verdict = canonicaliseTikTokUrl(arrived as string);
      expect(verdict.ok, payload).toBe(false);
      if (!verdict.ok) expect(verdict.error.code, payload).toBe(code);
    }
  });

  it('cannot be talked into a sign-in URL that leaves the origin', () => {
    // The payload is attacker-controlled by construction — anyone can send a link to
    // `/import?url=…`. What it may never do is escape the `url` parameter it is encoded into.
    for (const payload of [
      '//evil.test',
      'https://evil.test',
      '/\\evil.test',
      '..%2f..%2fevil',
      '#/../../evil',
      'x&next=//evil.test',
      'x#frag',
    ]) {
      const door = signedOutDestination(payload);
      expect(door.startsWith('/sign-in'), payload).toBe(true);
      expect(new URL(door, 'https://own.origin.test').origin, payload).toBe(
        'https://own.origin.test',
      );

      const back = whereSignInSendsYou(door);
      expect(back.startsWith('/import') || back === DEFAULT_AFTER_SIGN_IN, payload).toBe(true);
      expect(new URL(back, 'https://own.origin.test').origin, payload).toBe(
        'https://own.origin.test',
      );
      // Whatever it was, it is still a *value*, never a second parameter or a second destination.
      const query = new URLSearchParams(back.split('?')[1] ?? '');
      expect([...query.keys()].every((key) => key === SHARED_URL_PARAM), payload).toBe(true);
    }
  });
});
