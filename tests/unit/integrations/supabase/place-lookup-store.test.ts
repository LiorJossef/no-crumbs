/**
 * The Supabase side of the provider-response cache: the two RPC names and argument lists migration
 * 0023 declares, and the promise this adapter makes to everything above it — *it never throws*.
 *
 * The RPC names and argument names are not type-checked against the database, so a rename lands as
 * a cache that silently never hits: one extra Google call per lookup, no error, no signal. That is
 * what the first two tests are for, and it is why they name every argument rather than using
 * `toMatchObject` — a surplus argument is a 404 from PostgREST, not a warning.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';

import type { OpCtx } from '@/domain/ports';
import { supabasePlaceLookupStore } from '@/integrations/supabase/place-lookup-store';

interface RpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

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

/** `outcome` is whatever PostgREST would resolve or reject with. */
function stubClient(
  outcome: { data?: unknown; error?: { code?: string; message?: string } | undefined } | Error,
  calls: RpcCall[] = [],
): SupabaseClient {
  const builder = {
    abortSignal: () =>
      outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
  };
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return builder;
    },
  } as unknown as SupabaseClient;
}

const HASH = 'a'.repeat(64);

describe('supabasePlaceLookupStore', () => {
  it('reads through place_lookup_get with the one argument 0023 declares', async () => {
    const calls: RpcCall[] = [];
    const { ctx } = ctxWith();
    const store = supabasePlaceLookupStore(stubClient({ data: { v: 1 }, error: undefined }, calls));

    expect(await store.get(HASH, ctx)).toEqual({ v: 1 });
    expect(calls).toEqual([{ fn: 'place_lookup_get', args: { p_lookup_hash: HASH } }]);
  });

  it('writes through place_lookup_put with the five arguments 0023 declares', async () => {
    const calls: RpcCall[] = [];
    const { ctx } = ctxWith();
    const store = supabasePlaceLookupStore(stubClient({ error: undefined }, calls));

    await store.put(
      {
        lookupHash: HASH,
        provider: 'google',
        regionId: 'global',
        response: { v: 1, provider: 'google', rows: [] },
        ttlSeconds: 2_419_200,
      },
      ctx,
    );

    expect(calls).toEqual([
      {
        fn: 'place_lookup_put',
        args: {
          p_lookup_hash: HASH,
          p_provider: 'google',
          p_region_id: 'global',
          p_response: { v: 1, provider: 'google', rows: [] },
          p_ttl_seconds: 2_419_200,
        },
      },
    ]);
  });

  it('reports a missing row as null, which the cache reads as a miss', async () => {
    const { ctx } = ctxWith();
    const store = supabasePlaceLookupStore(stubClient({ data: null, error: undefined }));
    expect(await store.get(HASH, ctx)).toBeNull();
  });

  it('turns a PostgREST error into a miss and logs only the code', async () => {
    const { ctx, logs } = ctxWith();
    const store = supabasePlaceLookupStore(
      stubClient({ error: { code: '42501', message: 'permission denied for function' } }),
    );

    expect(await store.get(HASH, ctx)).toBeNull();
    expect(logs).toEqual([
      { name: 'places.lookup_cache_error', fields: { op: 'get', code: '42501' } },
    ]);
    // Charter R9 and the adapter's own rule: no vendor message leaves this file.
    expect(JSON.stringify(logs)).not.toContain('permission denied');
  });

  it('turns a thrown transport failure into a miss rather than a failed import', async () => {
    const { ctx, logs } = ctxWith();
    const store = supabasePlaceLookupStore(stubClient(new Error('ECONNREFUSED')));

    expect(await store.get(HASH, ctx)).toBeNull();
    expect(logs[0]?.fields).toEqual({ op: 'get', code: 'throw' });
  });

  it('swallows a refused write — including the 30-day ceiling refusing a google entry', async () => {
    const { ctx, logs } = ctxWith();
    // 23514 is what `place_lookup_put` raises when a google TTL is null or over 30 days. The
    // product outcome is that the answer is served and simply not stored; the code is the only
    // thing that tells a reader which failure this was.
    const store = supabasePlaceLookupStore(stubClient({ error: { code: '23514' } }));

    await expect(
      store.put(
        {
          lookupHash: HASH,
          provider: 'google',
          regionId: 'global',
          response: {},
          ttlSeconds: null,
        },
        ctx,
      ),
    ).resolves.toBeUndefined();
    expect(logs).toEqual([
      { name: 'places.lookup_cache_error', fields: { op: 'put', code: '23514' } },
    ]);
  });

  it('swallows a thrown write failure', async () => {
    const { ctx } = ctxWith();
    const store = supabasePlaceLookupStore(stubClient(new Error('ECONNREFUSED')));
    await expect(
      store.put(
        { lookupHash: HASH, provider: 'google', regionId: null, response: {}, ttlSeconds: 60 },
        ctx,
      ),
    ).resolves.toBeUndefined();
  });
});
