import 'server-only';

/**
 * `PlaceLookupStore` over `public.place_lookups`, through the two RPCs migration 0023 added.
 *
 * ## Why RPCs and not two PostgREST statements
 *
 * A read has to serve the response, bump `hit_count` and enforce expiry against the **server's**
 * clock, all in one statement. PostgREST cannot express `hit_count = hit_count + 1`, so without
 * `place_lookup_get` every cache hit would be a read then a write — two round trips, which spends
 * the latency the cache exists to save, and a lost-update race on the counter. Expiry evaluated
 * against a Node process's clock would be worse than a lost counter: `expires_at` is where Google's
 * 30-day caching cap is enforced (`06` §3.1, VERIFIED), and a boundary decided by the caller is not
 * a boundary.
 *
 * ## Service role, and the review rule it comes with
 *
 * `place_lookups` has ENABLE + FORCE RLS and **no policy at all** (0007), and EXECUTE on both
 * functions is granted to `service_role` alone (0023, asserted by `0008_policy_tests.sql` P26). So
 * this is a trusted-server module and nothing else can call it — an anon or authenticated caller
 * gets 42501 at the database, not a decision made in TypeScript.
 *
 * `docs/security.md` §4's rule for this client — *a service-role query never filters by `user_id`*
 * — is satisfied trivially: the table has no user column. These are provider responses about public
 * venues, shared across all users by design; that sharing is the point.
 *
 * ## Nothing here throws
 *
 * `PlaceLookupStore`'s contract. A read failure is a miss and a write failure is a shrug, both
 * logged. The alternative is an import that fails because a *cache* was unavailable, which is a
 * strictly worse product than having no cache at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlaceLookupStore } from '@/integrations/places/lookup-cache';

/** Named once so a rename shows up as one broken constant, not as a cache that silently never hits. */
const GET_RPC = 'place_lookup_get';
const PUT_RPC = 'place_lookup_put';

export function supabasePlaceLookupStore(service: SupabaseClient): PlaceLookupStore {
  return {
    async get(lookupHash, ctx) {
      try {
        const { data, error } = await service
          .rpc(GET_RPC, { p_lookup_hash: lookupHash })
          .abortSignal(ctx.signal);
        if (error) {
          // The vendor error object stops here. Only its `code` is logged, and PostgREST codes are
          // SQLSTATEs and short strings — never a row, a query or a caption.
          ctx.log.event('places.lookup_cache_error', { op: 'get', code: error.code ?? 'unknown' });
          return null;
        }
        return data ?? null;
      } catch {
        // An aborted request lands here too, and "the caller cancelled" is correctly a miss: the
        // work downstream is about to be abandoned anyway.
        ctx.log.event('places.lookup_cache_error', { op: 'get', code: 'throw' });
        return null;
      }
    },

    async put(entry, ctx) {
      try {
        const { error } = await service
          .rpc(PUT_RPC, {
            p_lookup_hash: entry.lookupHash,
            p_provider: entry.provider,
            p_region_id: entry.regionId,
            p_response: entry.response,
            p_ttl_seconds: entry.ttlSeconds,
          })
          .abortSignal(ctx.signal);
        if (error) {
          // One of these is not like the others: a `check_violation` here means the 30-day Google
          // ceiling refused the write (0023). It is logged at the same level because the *product*
          // outcome is identical — the answer is served, it is simply not stored — but the code is
          // what tells a reader which of the two happened.
          ctx.log.event('places.lookup_cache_error', { op: 'put', code: error.code ?? 'unknown' });
        }
      } catch {
        ctx.log.event('places.lookup_cache_error', { op: 'put', code: 'throw' });
      }
    },
  };
}
