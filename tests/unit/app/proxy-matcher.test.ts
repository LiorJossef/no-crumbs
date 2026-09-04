/**
 * **Which requests the session refresh runs on.**
 *
 * `src/proxy.ts` is the only place a Server Component's refreshed Supabase token can be persisted —
 * a Server Component has no response to set a cookie on, so `app/_lib/supabase/server.ts` catches
 * the failure and drops the write. Until 2026-08-31 the matcher was `['/map/:path*']` and six
 * Server Component pages rendered outside it, which meant the refresh happened, was discarded, and
 * the next request re-presented a spent refresh token.
 *
 * A matcher is a string Next compiles at build time, so nothing in the app exercises it and a typo
 * is invisible until a page silently signs someone out. This file compiles **the shipped literal**
 * with Next's own `getMiddlewareMatchers` — the same function the build calls — and asserts both
 * halves of the decision: every page is in, and each exclusion is deliberate.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { config } from '@/proxy';

/** Next ships no public types for this internal. Reaching for it anyway is the point of the file:
 *  a hand-written regex would only prove that the test agrees with itself. */
const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  'next/dist/build/analysis/get-page-static-info',
) as {
  getMiddlewareMatchers: (matcher: string | string[], nextConfig: object) => { regexp: string }[];
};

const patterns = getMiddlewareMatchers(config.matcher, {}).map(
  (matcher) => new RegExp(matcher.regexp),
);

function runsOn(pathname: string): boolean {
  return patterns.some((pattern) => pattern.test(pathname));
}

describe('proxy matcher', () => {
  it('runs on every page that renders as a Server Component', () => {
    // The six from the finding, plus `/map`, which was the only one covered before.
    for (const page of [
      '/',
      '/import',
      '/profile',
      '/collections',
      '/collections/join/0c96cfdb-1111-4222-8333-444455556666',
      '/collections/0c96cfdb-1111-4222-8333-444455556666',
      '/auth/new-password',
      '/map',
      '/map/anything',
    ]) {
      expect(runsOn(page), page).toBe(true);
    }
  });

  it('runs on the signed-out doors too, because a signed-in visitor can reach them', () => {
    // Not an oversight. Carving out the pages that *usually* have no session is how the
    // list-shaped version of this bug comes back.
    expect(runsOn('/sign-in')).toBe(true);
    expect(runsOn('/auth/reset')).toBe(true);
  });

  it('does not run on a Route Handler, which persists its own session', () => {
    // A Route Handler owns a response, so `cookies().set()` succeeds there. `/auth/callback` is
    // additionally mid-exchange of a one-use code and wants no interference.
    for (const handler of [
      '/api/imports/probe',
      '/api/imports/confirm',
      '/api/imports/place-search',
      '/api/imports/source-preview',
      '/auth/callback',
    ]) {
      expect(runsOn(handler), handler).toBe(false);
    }
  });

  it('does not run on the deploy check', () => {
    // A liveness probe that fails when the auth server does is not a liveness probe.
    expect(runsOn('/healthz')).toBe(false);
  });

  it('does not run on an asset, an icon or a metadata route', () => {
    for (const asset of [
      '/_next/static/chunks/main-abc123.js',
      '/_next/image',
      '/favicon.ico',
      '/icon.svg',
      '/manifest.webmanifest',
      '/robots.txt',
      '/sitemap.xml',
      '/opengraph-image',
      '/apple-icon',
      '/vendor/mapbox-gl-rtl-text.js',
    ]) {
      expect(runsOn(asset), asset).toBe(false);
    }
  });

  it('is one pattern, so nothing above is quietly satisfied by a second entry', () => {
    expect(patterns).toHaveLength(1);
  });
});
