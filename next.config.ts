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

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: buildEnv,
};

export default nextConfig;
