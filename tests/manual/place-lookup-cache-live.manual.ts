/**
 * TRACK2-REUSE — the provider-response cache against the **real** local database.
 *
 * Not part of CI. Run it with:
 *
 *   set -a; source .env.local; set +a
 *   npx vitest run tests/manual/place-lookup-cache-live.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts
 *
 * The unit tests prove the caching logic against a fake store. This proves the other half — that
 * the RPC names, the argument names and the jsonb round trip actually agree with migration 0023 —
 * because none of that is type-checked, and a rename lands as a cache that silently never hits.
 *
 * The Google gateway is a stub: this measures the cache, not Google, and the project's Text Search
 * quota is 100 requests a day. It cleans up the rows it writes.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

// The adapters open with `import 'server-only'`, which throws outside a server bundle. What that
// package protects is the bundler boundary, not this harness — same mock, same reason, as
// `tiktok-recognition.manual.ts`.
vi.mock('server-only', () => ({}));

import { createClient } from '@supabase/supabase-js';

import type { OpCtx } from '@/domain/ports';
import { googlePlaceResolver, type GooglePlaceRow } from '@/integrations/google/place-resolver';
import { supabasePlaceLookupStore } from '@/integrations/supabase/place-lookup-store';
import type { ResolveQuery } from '@/domain/types';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(URL_);

// A live-database harness that silently passes with no database is worse than one that fails.
const runIf = KEY !== '' && LOCAL ? describe : describe.skip;

const db = createClient(URL_, KEY === '' ? 'unset' : KEY, { auth: { persistSession: false } });

/** Unique per run, so a leftover row from a previous run can never make this pass. */
const MARK = `trk2-${String(Date.now())}`;

const ctx: OpCtx = {
  signal: new AbortController().signal,
  importId: null,
  log: { event: () => undefined },
};

const query = (text: string): ResolveQuery => ({
  text,
  cityHint: 'תל אביב',
  countryHint: 'IL',
  categoryHint: null,
  near: null,
  maxResults: null,
});

const row: GooglePlaceRow = {
  id: 'ChIJ-trk2-fixture',
  displayName: { text: 'Fixture Cafe' },
  location: { latitude: 32.0764, longitude: 34.7767 },
  primaryType: 'cafe',
};

afterAll(async () => {
  if (KEY === '' || !LOCAL) return;
  // `KEEP_LOOKUP_ROW=1` leaves the row behind so it can be read in psql. Off by default: a harness
  // that litters a shared local database is a harness people stop running.
  if (process.env.KEEP_LOOKUP_ROW === '1') return;
  // Named by the response we wrote, because the hash is derived and the test should not have to
  // recompute it to clean up after itself.
  await db.from('place_lookups').delete().eq('response->>mark', MARK);
});

runIf('place_lookups, live', () => {
  it('writes on a miss, serves on a hit, and spends one provider call for two resolves', async () => {
    let calls = 0;
    const gateway = {
      searchText: () => {
        calls += 1;
        return Promise.resolve([row]);
      },
    };
    const resolver = googlePlaceResolver(gateway, { lookupStore: supabasePlaceLookupStore(db) });

    const first = await resolver.resolve(query(MARK), ctx);
    const second = await resolver.resolve(query(MARK), ctx);

    expect(calls).toBe(1);
    expect(second.shortlist).toEqual(first.shortlist);

    // Now read the row that actually landed, rather than trusting that it did.
    const { data } = await db
      .from('place_lookups')
      .select('lookup_hash, provider, region_id, response, hit_count, expires_at, created_at')
      .eq('provider', 'google');
    const stored = (data ?? []).find(
      (r) => (r as { response: { rows?: GooglePlaceRow[] } }).response.rows?.[0]?.id === row.id,
    ) as
      | {
          lookup_hash: string;
          region_id: string;
          response: { v: number; provider: string; rows: GooglePlaceRow[] };
          hit_count: number;
          expires_at: string;
          created_at: string;
        }
      | undefined;

    expect(stored).toBeDefined();
    expect(stored?.lookup_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored?.region_id).toBe('global');
    // Raw Google rows, not a ranked result: that is the whole point of the seam.
    expect(stored?.response.rows[0]).toEqual(row);
    expect(stored?.hit_count).toBe(1);

    // The licence boundary, measured on the row rather than on the constant that produced it.
    const ttlDays =
      (Date.parse(stored?.expires_at ?? '') - Date.parse(stored?.created_at ?? '')) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(27);
    expect(ttlDays).toBeLessThan(30);

    // Tag the row so afterAll can find it without recomputing the hash.
    await db
      .from('place_lookups')
      .update({ response: { ...stored?.response, mark: MARK } })
      .eq('lookup_hash', stored?.lookup_hash ?? '');
  });
});
