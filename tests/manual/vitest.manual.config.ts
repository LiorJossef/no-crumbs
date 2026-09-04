/**
 * Vitest config for the **manual** harnesses in `tests/manual/`.
 *
 * These are not part of CI and must never be: they touch the network (`tiktok-oembed-live`), the
 * local Supabase container (`tlv-resolve-benchmark`), or both. The root `vitest.config.ts` includes
 * only `tests/unit/**` and `src/**`, so nothing here can be picked up by `npm run test` — this file
 * is the *opt-in* way to run them, one path at a time:
 *
 *   npx vitest run tests/manual/<file>.manual.ts --config tests/manual/vitest.manual.config.ts
 *
 * It exists because `tests/manual/tiktok-oembed-live.manual.ts` has documented that exact command
 * since L0-F4-T1 while the config it names was never committed — the command could not run as
 * written (found and fixed under TLV-RESOLVE-T4).
 *
 * `hookTimeout`/`testTimeout` are raised because a real database round trip per benchmark case is
 * slower than a unit test, and a timeout here reads as a flake rather than as the finding it is.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      // See `_stubs/server-only.ts` for why this is safe here and unsafe in the root config.
      'server-only': fileURLToPath(new URL('./_stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/manual/**/*.manual.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file at a time: these harnesses share a live local database and a live third-party
    // endpoint, and interleaving them would make any failure ambiguous.
    fileParallelism: false,
  },
});
