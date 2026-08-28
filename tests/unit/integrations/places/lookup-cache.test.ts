/**
 * The provider-response cache: the key, the per-provider TTL policy, and the one property that
 * matters more than either — that nothing here can fail a resolution.
 *
 * What is deliberately not asserted: that the *database* enforces the 30-day Google ceiling. That
 * is `place_lookup_put`'s CHECK and it is proved where it lives, in
 * `supabase/tests/0008_policy_tests.sql` P26. Re-asserting it against a fake store here would
 * prove only that the fake agrees with the test.
 */

import { describe, expect, it, vi } from 'vitest';

// `import 'server-only'` throws outside a server bundle; it protects the bundler boundary, not
// this test. Same mock, same reason, as the other integrations tests.
vi.mock('server-only', () => ({}));

import type { OpCtx } from '@/domain/ports';
import type { PlaceProvider } from '@/domain/types';
import {
  cachedProviderRows,
  GOOGLE_MAX_CACHE_MS,
  LOOKUP_RESPONSE_VERSION,
  LOOKUP_TTL,
  lookupHash,
  NEGATIVE_TTL_MS,
  ttlFor,
  type PlaceLookupStore,
} from '@/integrations/places/lookup-cache';

interface Logged {
  readonly name: string;
  readonly fields: Record<string, string | number | boolean>;
}

function ctxWith(): { ctx: OpCtx; logs: Logged[] } {
  const logs: Logged[] = [];
  return {
    logs,
    ctx: {
      signal: new AbortController().signal,
      importId: null,
      log: { event: (name, fields) => void logs.push({ name, fields }) },
    },
  };
}

interface PutCall {
  readonly lookupHash: string;
  readonly provider: PlaceProvider;
  readonly regionId: string | null;
  readonly response: unknown;
  readonly ttlSeconds: number | null;
}

/** An in-memory `PlaceLookupStore`. Behaves like migration 0023's pair, minus the TTL arithmetic. */
function fakeStore(seed: Record<string, unknown> = {}): {
  store: PlaceLookupStore;
  puts: PutCall[];
  gets: string[];
} {
  const rows = new Map<string, unknown>(Object.entries(seed));
  const puts: PutCall[] = [];
  const gets: string[] = [];
  return {
    puts,
    gets,
    store: {
      get: (hash) => {
        gets.push(hash);
        return Promise.resolve(rows.get(hash) ?? null);
      },
      put: (entry) => {
        puts.push(entry as PutCall);
        rows.set(entry.lookupHash, entry.response);
        return Promise.resolve();
      },
    },
  };
}

const envelope = (rows: readonly unknown[], provider: PlaceProvider = 'google') => ({
  v: LOOKUP_RESPONSE_VERSION,
  provider,
  rows,
});

const GOOGLE_REQUEST = ['Kohi, תל אביב', 'IL', 'he', 10] as const;

describe('lookupHash', () => {
  it('is a 64-character lower-case hex digest, the shape place_lookups.lookup_hash CHECKs', () => {
    expect(lookupHash('google', GOOGLE_REQUEST)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls', () => {
    expect(lookupHash('google', GOOGLE_REQUEST)).toBe(lookupHash('google', GOOGLE_REQUEST));
  });

  it('changes when any single request field changes', () => {
    const base = lookupHash('google', GOOGLE_REQUEST);
    const variants = [
      ['Kohi, tel aviv', 'IL', 'he', 10],
      ['Kohi, תל אביב', 'GB', 'he', 10],
      ['Kohi, תל אביב', 'IL', null, 10],
      ['Kohi, תל אביב', 'IL', 'he', 5],
    ] as const;
    for (const variant of variants) expect(lookupHash('google', variant)).not.toBe(base);
  });

  it('separates the provider namespaces, so two providers cannot collide on one request', () => {
    expect(lookupHash('google', GOOGLE_REQUEST)).not.toBe(lookupHash('overture', GOOGLE_REQUEST));
  });

  it('cannot be confused by field boundaries: ["ab", "c"] and ["a", "bc"] are different keys', () => {
    // The unit separator is what buys this. Without it, joining on '' would make these identical
    // and one venue's answer could be served for another's request.
    expect(lookupHash('google', ['ab', 'c'])).not.toBe(lookupHash('google', ['a', 'bc']));
  });
});

describe('ttlFor', () => {
  it('keeps Google strictly under the 30-day Service Specific Terms §5.4 cap', () => {
    const google = LOOKUP_TTL.google;
    expect(google.cacheable).toBe(true);
    // A null TTL for Google would mean "forever" and is exactly what §5.4 forbids.
    expect(google.cacheable ? google.ttlMs : null).not.toBeNull();
    expect(ttlFor('google', false)?.ttlMs).toBeLessThan(GOOGLE_MAX_CACHE_MS);
  });

  it('lets open data be cached indefinitely', () => {
    expect(ttlFor('overture', false)).toEqual({ ttlMs: null });
  });

  it('refuses to cache a provider with no adapter and no licence sign-off', () => {
    expect(ttlFor('nominatim', false)).toBeNull();
    expect(ttlFor('llm_guess', false)).toBeNull();
  });

  it('caps a negative answer far shorter than a positive one, for both providers', () => {
    expect(ttlFor('google', true)?.ttlMs).toBe(NEGATIVE_TTL_MS);
    // Even the permanently-cacheable provider gets a bounded "not found".
    expect(ttlFor('overture', true)?.ttlMs).toBe(NEGATIVE_TTL_MS);
  });
});

describe('cachedProviderRows', () => {
  const args = (store: PlaceLookupStore | null, fetch: () => Promise<readonly unknown[]>) => ({
    store,
    provider: 'google' as const,
    regionId: 'global',
    request: GOOGLE_REQUEST,
    fetch,
  });

  it('serves a stored response without calling the provider', async () => {
    const rows = [{ id: 'ChIJ-kohi' }];
    const { store, gets } = fakeStore({ [lookupHash('google', GOOGLE_REQUEST)]: envelope(rows) });
    const fetch = vi.fn(() => Promise.resolve([]));
    const { ctx, logs } = ctxWith();

    expect(await cachedProviderRows(args(store, fetch), ctx)).toEqual(rows);
    expect(fetch).not.toHaveBeenCalled();
    expect(gets).toHaveLength(1);
    expect(logs).toContainEqual({
      name: 'places.lookup_cache',
      fields: { provider: 'google', outcome: 'hit', rows: 1 },
    });
  });

  it('on a miss, calls the provider and stores the raw rows under the right key and TTL', async () => {
    const rows = [{ id: 'ChIJ-kohi' }];
    const { store, puts } = fakeStore();
    const { ctx } = ctxWith();

    expect(await cachedProviderRows(args(store, () => Promise.resolve(rows)), ctx)).toEqual(rows);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.lookupHash).toBe(lookupHash('google', GOOGLE_REQUEST));
    expect(puts[0]?.provider).toBe('google');
    expect(puts[0]?.regionId).toBe('global');
    // Raw provider rows, not a ranked result — the whole reason this seam is below the scorer.
    expect(puts[0]?.response).toEqual(envelope(rows));
    expect(puts[0]?.ttlSeconds).toBe(Math.floor((ttlFor('google', false)?.ttlMs ?? 0) / 1000));
  });

  it('caches a zero-result answer, but on the short negative TTL', async () => {
    const { store, puts } = fakeStore();
    const { ctx } = ctxWith();

    expect(await cachedProviderRows(args(store, () => Promise.resolve([])), ctx)).toEqual([]);
    expect(puts[0]?.ttlSeconds).toBe(NEGATIVE_TTL_MS / 1000);
  });

  it('round-trips: the second call is served from what the first stored', async () => {
    const rows = [{ id: 'ChIJ-kohi' }];
    const { store } = fakeStore();
    const fetch = vi.fn(() => Promise.resolve(rows));
    const { ctx } = ctxWith();

    await cachedProviderRows(args(store, fetch), ctx);
    expect(await cachedProviderRows(args(store, fetch), ctx)).toEqual(rows);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats an envelope from another version as a miss rather than reinterpreting it', async () => {
    const hash = lookupHash('google', GOOGLE_REQUEST);
    const { store } = fakeStore({ hash: null, [hash]: { v: 99, provider: 'google', rows: [{}] } });
    const fetch = vi.fn(() => Promise.resolve([{ id: 'fresh' }]));
    const { ctx } = ctxWith();

    expect(await cachedProviderRows(args(store, fetch), ctx)).toEqual([{ id: 'fresh' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats an entry written by another provider as a miss', async () => {
    const hash = lookupHash('google', GOOGLE_REQUEST);
    const { store } = fakeStore({ [hash]: envelope([{ id: 'overture-row' }], 'overture') });
    const fetch = vi.fn(() => Promise.resolve([{ id: 'fresh' }]));
    const { ctx } = ctxWith();

    expect(await cachedProviderRows(args(store, fetch), ctx)).toEqual([{ id: 'fresh' }]);
  });

  it('treats a malformed entry as a miss', async () => {
    const hash = lookupHash('google', GOOGLE_REQUEST);
    const { store } = fakeStore({ [hash]: { v: LOOKUP_RESPONSE_VERSION, provider: 'google' } });
    const fetch = vi.fn(() => Promise.resolve([{ id: 'fresh' }]));
    const { ctx } = ctxWith();

    expect(await cachedProviderRows(args(store, fetch), ctx)).toEqual([{ id: 'fresh' }]);
  });

  it('a store that refuses to answer is a miss, not a failed resolution', async () => {
    const store: PlaceLookupStore = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
    };
    const { ctx } = ctxWith();
    expect(await cachedProviderRows(args(store, () => Promise.resolve([{ id: 'x' }])), ctx)).toEqual(
      [{ id: 'x' }],
    );
  });

  it('bypasses the cache entirely when no store is configured', async () => {
    const fetch = vi.fn(() => Promise.resolve([{ id: 'x' }]));
    const { ctx, logs } = ctxWith();

    expect(await cachedProviderRows(args(null, fetch), ctx)).toEqual([{ id: 'x' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    // A switched-off cache logs nothing. A `miss` per call would read as a cache that is broken.
    expect(logs).toEqual([]);
  });

  it('never reads or writes for a provider that may not be cached', async () => {
    const { store, gets, puts } = fakeStore();
    const { ctx } = ctxWith();

    await cachedProviderRows(
      { ...args(store, () => Promise.resolve([{ id: 'x' }])), provider: 'nominatim' },
      ctx,
    );
    expect(gets).toEqual([]);
    expect(puts).toEqual([]);
  });

  it('propagates a provider failure — the cache must not turn an outage into an empty answer', async () => {
    const { store } = fakeStore();
    const { ctx } = ctxWith();
    await expect(
      cachedProviderRows(
        args(store, () => Promise.reject(new Error('429'))),
        ctx,
      ),
    ).rejects.toThrow('429');
  });
});
