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
 * **`frame-src` is the one exception to that, and it is a tightening rather than half a CSP.**
 * `frame-ancestors` says who may embed us; it says nothing about whom *we* may embed, so before
 * this line the answer was "anyone". The TikTok embed
 * (`security-ruling-embed-playback-2026-08-31.md` §6 item 8) makes that worth naming: one host,
 * explicitly allow-listed, the same discipline `canonicalise-tiktok-url.ts` already applies to
 * outbound TikTok hosts with its six-host `Set`. Nothing that worked before stops working — the
 * app frames exactly one thing — and any *second* third-party frame now has to be added here
 * deliberately.
 *
 * **It is not a mitigation of the embed's disclosure and must not be recorded as one.** The cookie
 * and the fingerprint SDK are what TikTok's player is built to do once it is allowed to run at all;
 * this directive only decides *which host* may be framed, never what that host does once framed.
 * `docs/security.md` R-18 is where the residual lives.
 *
 * The value is `EMBED_PLAYER_FRAME_SRC` from `src/components/embed/embed-player-url.ts`, inlined
 * here as a literal because `next.config.ts` is loaded outside the `@/` alias — and
 * `tests/unit/embed/embed-player-url.test.ts` reads this file and asserts the two agree, plus that
 * both equal the origin the iframe actually loads. A CSP entry that has quietly stopped matching
 * the thing it constrains is a guard that cannot fail.
 *
 * `Permissions-Policy` names `geolocation=(self)` rather than disabling it: the map's own locate
 * button uses it. Camera, microphone and payment are things this product will never ask for.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; frame-src https://www.tiktok.com" },
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
