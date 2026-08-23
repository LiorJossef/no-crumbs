import 'server-only';

/**
 * The real `PlaceStore` (`domain/ports.ts`, L0-F4-T3). Composes two RPCs that sit on opposite
 * sides of a privilege line, per that port's own doc comment:
 *
 *  - `resolve_place` (`supabase/migrations/0007_functions.sql`, provenance columns added in
 *    `0014_resolve_place_provenance.sql`) — `security definer`, granted to `service_role` only.
 *    The ONLY way a `places` row is created; provider data is not something a user should be able
 *    to forge, so it runs on `service`, the trusted-server client
 *    (`integrations/supabase/service-role-client.ts`), never on the caller's own session.
 *  - `save_place` (same file) — `security invoker`. RLS still applies, so it must run on `user`,
 *    the caller's own session client, or it would write nothing (no `auth.uid()`) or, worse,
 *    silently succeed under the wrong identity if a service-role client were used instead.
 *
 * Two sequential RPC calls, not one transaction: `resolve_place` and `save_place` execute under
 * different Postgres roles, which cannot share a client-side transaction over PostgREST. This is
 * not a correctness gap for this task's "no duplicate on repeat" exit criterion — `resolve_place`'s
 * alias/near-duplicate guard and `save_place`'s `on conflict (user_id, place_id)` each make their
 * own half idempotent, so replaying the same request after a partial failure (e.g. this process
 * dying between the two calls) converges to the same result rather than duplicating anything. What
 * it does not give is atomicity across the pair — a `places` row can exist with no save yet if the
 * second call fails — which is an acceptable, retryable partial state (07 §8's "partial success"
 * pattern), not silent data loss: the caller sees a thrown error for that item and may retry it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { internal } from '@/domain/errors';
import type { ConfirmPlaceInput, ConfirmPlaceSave, OpCtx, PlaceStore } from '@/domain/ports';
import type { PlaceId } from '@/domain/types';

export function supabasePlaceStore(service: SupabaseClient, user: SupabaseClient): PlaceStore {
  return {
    async confirmPlace(input: ConfirmPlaceInput, save: ConfirmPlaceSave, ctx: OpCtx) {
      void ctx; // No logging/cancellation need yet — kept for signature parity with every other port.
      const { place, category, countryCode, resolutionScore } = input;

      const { data: placeId, error: resolveError } = await service.rpc('resolve_place', {
        p_provider: place.provider,
        p_provider_place_id: place.providerPlaceId,
        p_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_category: category,
        p_provider_category: place.providerCategory,
        p_address_line: place.addressLine,
        p_locality: place.locality,
        p_region: null,
        p_country_code: countryCode,
        p_provider_payload: null,
        p_source_dataset: place.sourceDataset,
        // For Overture these are the same string (`domain/types.ts`'s `ResolvedPlace.providerPlaceId`
        // doc comment); this port carries only one id, matching that documented equivalence.
        p_source_dataset_id: place.providerPlaceId,
        p_resolution_score: resolutionScore,
      });

      if (resolveError || typeof placeId !== 'string') {
        throw internal('resolve_place failed', resolveError ?? placeId);
      }

      const { data: savedPlaceId, error: saveError } = await user.rpc('save_place', {
        p_place_id: placeId,
        p_source_id: save.sourceId,
        p_note: save.note,
      });

      if (saveError || typeof savedPlaceId !== 'string') {
        throw internal('save_place failed', saveError ?? savedPlaceId);
      }

      return { placeId: placeId as PlaceId, savedPlaceId };
    },
  };
}
