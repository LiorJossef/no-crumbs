import type { NextConfig } from 'next';

/**
 * Build identity, resolved at build time so a deploy is always identifiable.
 *
 * Vercel exposes VERCEL_ENV ('production' | 'preview' | 'development') and
 * VERCEL_GIT_COMMIT_SHA as system env vars automatically. Neither carries the
 * NEXT_PUBLIC_ prefix, so neither is inlined on its own — mapping them here is
 * what makes them readable from anywhere, including a future client component.
 * An explicitly set NEXT_PUBLIC_* value still wins, so local .env.local and any
 * non-Vercel host keep working.
 */
const buildEnv = {
  NEXT_PUBLIC_STAGE: process.env.NEXT_PUBLIC_STAGE ?? process.env.VERCEL_ENV ?? 'local',
  NEXT_PUBLIC_COMMIT_SHA:
    process.env.NEXT_PUBLIC_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
} satisfies Record<string, string>;

/**
 * Response headers. The product had none beyond Vercel's own HSTS.
 *
 * `Referrer-Policy` is the one with a specific reason rather than a general one. A collection
 * invite link carries its token **in the path**, and it is a bearer credential: anyone signed in
 * who opens it joins. Under the browser default a click from that page to any external link would
 * put the whole URL in the `Referer` header — so the join route gets `no-referrer` outright, and
 * everything else gets `strict-origin-when-cross-origin`, which sends the origin and never the
 * path.
 *
 * `frame-ancestors 'none'` as a CSP rather than `X-Frame-Options`: the header is superseded, and
 * nothing embeds this app. The rest of a CSP is deliberately absent — a real one here needs a nonce
 * strategy for Next's inline scripts, and half a CSP that has to be loosened on the first failure
 * is worse than none.
 *
 * `Permissions-Policy` names `geolocation=(self)` rather than disabling it: the map's own locate
 * button uses it. Camera, microphone and payment are things this product will never ask for.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: buildEnv,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // The token is in this path, so it must never travel in a `Referer`.
        source: '/collections/join/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
