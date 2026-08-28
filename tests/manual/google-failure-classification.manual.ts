/**
 * QA-DEGRADED-1 — what the Google adapter actually calls each failure, against the real
 * `googlePlacesGateway` rather than against a hand-built `ProviderLookupFailure`.
 *
 * Manual, not CI, for one reason: the last case makes a **live** request to
 * `places.googleapis.com` with a deliberately invalid key. That costs **zero** Text Search quota —
 * an unauthenticated request is refused before any project quota is consulted — and it is the only
 * way to learn what Google really answers for a bad key rather than assuming it.
 *
 *   npx vitest run tests/manual/google-failure-classification.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts
 *
 * The other cases stub `globalThis.fetch`, because the one status this repo must never produce on
 * purpose is 429: the project cap is 100 requests/day and exhausting it to watch the error would
 * take the product offline for the rest of the day.
 *
 * Recorded findings, 2026-08-28:
 *
 *  - a **429** with `RESOURCE_EXHAUSTED` classifies as `quota_exhausted`   — as designed;
 *  - a **403** carrying `RESOURCE_EXHAUSTED` classifies as `quota_exhausted` — as designed;
 *  - a **403 PERMISSION_DENIED** (API not enabled for the project) classifies as `auth` — as
 *    designed;
 *  - an **invalid / rotated / revoked API key answers HTTP 400**, `INVALID_ARGUMENT`,
 *    `API_KEY_INVALID` — and therefore classifies as **`bad_request`**, never `auth`. Verified
 *    live. `classifyGoogleStatus`'s comment says a 4xx "means the adapter is wrong"; for the most
 *    common key fault in production that sentence is false, and it points an operator at the query
 *    builder instead of at the key.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';

// `place-resolver.ts` opens with `import 'server-only'`; same shim the unit tests use.
vi.mock('server-only', () => ({}));

import { providerFailureOf } from '@/domain/import/provider-failure';
import { googlePlacesGateway } from '@/integrations/google/place-resolver';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubResponse(status: number, body: string): void {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
}

async function classificationOf(run: () => Promise<unknown>): Promise<{
  kind: string | undefined;
  status: number | null | undefined;
}> {
  try {
    await run();
    return { kind: undefined, status: undefined };
  } catch (e) {
    const failure = providerFailureOf(e);
    return { kind: failure?.kind, status: failure?.status };
  }
}

const params = {
  textQuery: 'coffee',
  regionCode: null,
  languageCode: null,
  maxResultCount: 1,
} as const;

function call(timeoutMs?: number): Promise<unknown> {
  const gateway = googlePlacesGateway('unused-in-stubbed-cases', timeoutMs === undefined ? {} : { timeoutMs });
  return gateway.searchText(params, new AbortController().signal);
}

describe('googlePlacesGateway failure classification', () => {
  it('429 RESOURCE_EXHAUSTED is quota_exhausted', async () => {
    stubResponse(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}');
    expect(await classificationOf(() => call())).toEqual({ kind: 'quota_exhausted', status: 429 });
  });

  it('403 carrying RESOURCE_EXHAUSTED is quota_exhausted, not auth', async () => {
    stubResponse(403, '{"error":{"status":"RESOURCE_EXHAUSTED"}}');
    expect(await classificationOf(() => call())).toEqual({ kind: 'quota_exhausted', status: 403 });
  });

  it('403 PERMISSION_DENIED is auth', async () => {
    stubResponse(403, '{"error":{"status":"PERMISSION_DENIED"}}');
    expect(await classificationOf(() => call())).toEqual({ kind: 'auth', status: 403 });
  });

  it('500 is provider_error', async () => {
    stubResponse(500, 'upstream exploded');
    expect(await classificationOf(() => call())).toEqual({ kind: 'provider_error', status: 500 });
  });

  it('a transport failure has no status', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await classificationOf(() => call())).toEqual({ kind: 'transport', status: null });
  });

  it('our own ceiling firing is timed_out, with no status', async () => {
    globalThis.fetch = ((_url: unknown, init: { signal?: AbortSignal } = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;
    expect(await classificationOf(() => call(30))).toEqual({ kind: 'timed_out', status: null });
  });

  /**
   * Live, and the point of the file. No quota is spent: Google rejects the key before the project's
   * Text Search quota is consulted.
   */
  it('LIVE: an invalid API key is HTTP 400 and classifies as bad_request, not auth', async () => {
    const gateway = googlePlacesGateway('qa-invalid-key-QA-DEGRADED-1');
    const observed = await classificationOf(() =>
      gateway.searchText(params, new AbortController().signal),
    );
    expect(observed).toEqual({ kind: 'bad_request', status: 400 });
  });
});
