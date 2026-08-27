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
 * A third call was added by RICH-EXT-T3 and sits on the same side of the line as the first:
 *
 *  - `apply_saved_place_extraction` (`0019_saved_place_enrichment.sql`) — `security invoker`,
 *    granted to `service_role` only, and the ONLY writer of `saved_places.tags` / `why_go` /
 *    `dishes`. Those three columns carry no `INSERT` or `UPDATE` grant for `authenticated` at all,
 *    which is how `0019` avoids repeating the `extracted_reason` hole rather than merely intending
 *    to: a browser POSTing a forged tag list straight to `/saved_places` is refused 42501 by
 *    Postgres. It runs on `service` because that is the role it is granted to; it bypasses RLS as a
 *    consequence, and therefore enforces ownership itself with `where sp.user_id = p_user_id` —
 *    which is why this adapter must pass a real `userId` and not infer one.
 *
 * Three sequential RPC calls, not one transaction: `resolve_place` and `save_place` execute under
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

/**
 * The enrichment write, **last and non-fatal**.
 *
 * ## Ordering
 *
 * It has to be last: `apply_saved_place_extraction` updates a `saved_places` row by id, so the row
 * must exist, which means `save_place` must have returned. There is no ordering choice to make on
 * that axis. The choice that does exist is what happens when it fails, and it is decided here
 * rather than at the call site so no future caller can decide it differently.
 *
 * ## Failure
 *
 * A failure is swallowed and reported, never thrown. The three columns are an improvement to a save
 * that has already succeeded — the place is in the user's library, on the map, with its name,
 * coordinates, source link and reason. Rethrowing would turn "your tags are missing" into "the save
 * failed", and because `confirmOne` catches per item and reports `failed`, the user would be told
 * nothing was saved while the row sits in their library. The user would then press Save again;
 * `save_place` is idempotent so that is harmless, but they would have been lied to, and the second
 * attempt would fail the same way. Losing the extras is recoverable (a later re-import fills them:
 * `apply_saved_place_extraction` is first-writer-wins per column, and a `NULL` column has no first
 * writer yet). Losing the user's trust in what "saved" means is not.
 *
 * The inverse ordering — enrichment first, save second — is not available, and would be wrong even
 * if it were: it would make the *unimportant* write the one that can block the important one.
 *
 * Silence is not the same as swallowing. One structured line goes out on every failure through
 * `ctx.log`, carrying the SQLSTATE and nothing else. No row values, no tag text, no caption
 * (`07` §7.1).
 *
 * ## The failure that will actually happen, and why it is not hypothetical
 *
 * `23514`, `check_violation`, from `0019`'s bounds — and it is reachable with values that are
 * **legal under the extraction schema**. The application bounds the raw model string; the database
 * bounds the NFKC-*normalised* one, and NFKC expands (up to 18x on a single code point). Measured:
 * a 59-character dish normalises to 67 against a 64 bound; a 186-character `whyGo` normalises to
 * 288 against 280. `dishes` has a 1.07x margin, so one `½` or `ﬄ` in a long item is enough.
 *
 * Which makes this path the belt, not the braces. The braces are a tighter bound in the extraction
 * schema (measured on the normalised string), which is a different task's file and is being routed
 * separately; if that lands and is correct, this branch stops firing. It stays anyway, because the
 * write it protects is worth strictly less than the save it must not take down.
 *
 * **All three columns are lost together** when it fires: `apply_saved_place_extraction` sets
 * `tags`, `why_go` and `dishes` in one `UPDATE`, so an over-long dish costs the tags too. That is
 * deliberately not worked around here with a retry-without-dishes: guessing which column Postgres
 * objected to, then re-submitting a subset, is this adapter inventing a partial success the
 * database did not grant it. Logging the code and moving on is the honest version, and the real fix
 * is upstream of the write.
 */
async function applyEnrichment(
  service: SupabaseClient,
  /**
   * **`save_place`'s own return value, from this same request.** Never a client-supplied id, never
   * an id read back out of `saved_places` by any predicate other than the one `save_place` already
   * applied under the user's JWT.
   *
   * `apply_saved_place_extraction` runs as `service_role`, which bypasses RLS, so no policy filters
   * the row this id names. Its `where sp.user_id = p_user_id` is belt-and-braces; the control is
   * that both arguments are server-derived. Pair this id with a `userId` from the request body and
   * anyone who learns a victim's `saved_place_id` writes model output onto their row.
   */
  savedPlaceId: string,
  save: ConfirmPlaceSave,
  ctx: OpCtx,
): Promise<boolean> {
  if (save.enrichment === null) return false;

  try {
    const { error } = await service.rpc('apply_saved_place_extraction', {
      p_saved_place_id: savedPlaceId,
      // From the verified server-side session — see `ConfirmPlaceSave.userId` and the call site in
      // `app/api/imports/confirm/route.ts`, which is the only caller.
      p_user_id: save.userId,
      // `readonly string[]` -> `string[]`: PostgREST serialises either, but the RPC's declared
      // parameter type is `text[]` and a mutable copy keeps the seam honest about that.
      p_tags: save.enrichment.tags === null ? null : [...save.enrichment.tags],
      p_why_go: save.enrichment.whyGo,
      p_dishes: save.enrichment.dishes === null ? null : [...save.enrichment.dishes],
    });

    if (error) {
      ctx.log.event('saved_place.enrichment_failed', { code: postgrestCode(error) });
      return false;
    }

    return true;
  } catch (e) {
    // A transport failure, not a SQL one — `supabase-js` returns SQL errors on the `error` channel
    // and throws only when the request itself could not be made. Same verdict either way.
    ctx.log.event('saved_place.enrichment_failed', { code: postgrestCode(e) });
    return false;
  }
}

/** A short, bounded machine code out of a PostgREST error — a SQLSTATE (`42501`) or a `PGRST` code.
 *  Never `message`, `details` or `hint`: those quote row values back at you, and a row here holds
 *  caption-derived text. Same rule as `app/api/imports/_lib/error-reporting.ts`'s `describeCause`,
 *  restated rather than imported because `integrations/` may not depend on `app/`. */
function postgrestCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return 'unknown';
  return /^[A-Za-z0-9_.-]{1,20}$/.test(code) ? code : 'unknown';
}

export function supabasePlaceStore(service: SupabaseClient, user: SupabaseClient): PlaceStore {
  return {
    async confirmPlace(input: ConfirmPlaceInput, save: ConfirmPlaceSave, ctx: OpCtx) {
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

      // Asked before the save, because `save_place` is idempotent and so cannot distinguish a
      // first save from a repeat afterwards. Read through the *user's* client so RLS scopes it to
      // this user's own rows — a service-role read would report another user's save as ours.
      const { data: existing, error: existingError } = await user
        .from('saved_places')
        .select('id')
        .eq('place_id', placeId)
        .maybeSingle();

      if (existingError) {
        throw internal('saved_places lookup failed', existingError);
      }

      const alreadySaved = existing !== null;

      const { data: savedPlaceId, error: saveError } = await user.rpc('save_place', {
        p_place_id: placeId,
        p_source_id: save.sourceId,
        p_note: save.note,
        p_extracted_reason: save.extractedReason,
      });

      if (saveError || typeof savedPlaceId !== 'string') {
        throw internal('save_place failed', saveError ?? savedPlaceId);
      }

      const enrichmentApplied = await applyEnrichment(service, savedPlaceId, save, ctx);

      return { placeId: placeId as PlaceId, savedPlaceId, alreadySaved, enrichmentApplied };
    },
  };
}
