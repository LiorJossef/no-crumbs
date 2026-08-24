/**
 * The DB-first `PlaceResolver`: the loaded `poi_index` extract(s) — Tel Aviv only, today — fed
 * through the pure scorer (`domain/places/score.ts`). Built for L0-F2b's real task (2026-08-24):
 * "check the real ~5K-row Tel Aviv database first, and only fall back to the LLM-guess +
 * Google Maps link path if there's no confident match." The fallback decision itself is the
 * caller's (`app/api/imports/probe/route.ts` / `app/import/import-page-client.tsx`) — this file
 * only ever answers "what does the database say", never "should we trust it enough to skip a
 * human" (that is `06` §6.2's band, read by the caller via `confidenceOf`/`ResolveResult.confidence`).
 *
 * SCOPE, DELIBERATELY NARROW — read this before extending the file:
 *  - **One resolver, one dataset.** This is the Overture `poi_index` adapter only. No Nominatim, no
 *    global fallback, no second `PlaceResolver` implementation — that is a separate, deferred
 *    project (D2b's global-resolver work). A city hint that names an unloaded region is an honest
 *    "not loaded" (`regionsSearched: []`), which the caller reads exactly like "no match".
 *  - **Region matching is a substring match against `poi_regions.display_name`, not a gazetteer.**
 *    `regionIdsForCityHint` below reads whichever regions are marked `is_loaded` from the database
 *    itself rather than hardcoding `'tlv'` — so a second loaded region does not require an edit
 *    here — but it is intentionally not more sophisticated than that: teaching it real city-name
 *    aliasing (transliteration, "Yafo"/"Jaffa", multi-city countries) is exactly the kind of richer
 *    vocabulary the deferred global-resolution project owns, not this lean pass.
 *  - **`norm_version` is checked per loaded region** (`10` §4's "the resolver checks 3 rows here
 *    rather than joining 165k... it refuses to serve on a mismatch instead of quietly matching
 *    worse"): a region whose `poi_regions.norm_version` disagrees with this build's `NORM_VERSION`
 *    is dropped from the search (logged, never thrown) rather than scored against a normalisation
 *    this code no longer implements.
 *  - **Provider-call ceiling**: one query per `resolve()` call (one `poi_regions` read + one
 *    `search_poi_index` RPC), and the caller bounds how many candidates get resolved per import
 *    (`domain/import/pipeline.ts`'s `MAX_CANDIDATES`, reused rather than re-invented at the call
 *    site) — this file adds no queueing, batching or its own cap beyond the prefilter's own
 *    `limit` (`10` §5's 500).
 *  - **No caching.** At `MAX_CANDIDATES` (7) resolver calls per import and no repeat traffic
 *    pattern in this MVP slice, a cache would be unmeasured complexity; if resolution volume ever
 *    justifies one, it is a wrapper around this factory, not a rewrite of it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { internal } from '@/domain/errors';
import { NORM_VERSION, normalise } from '@/domain/places/normalise';
import { queryTokens, scoreCandidates } from '@/domain/places/score';
import type { OpCtx, PlaceResolver } from '@/domain/ports';
import type { PlaceProvider, RegionId, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';

/** `10` §5's cap: "8 candidates per import × unbounded rows is the difference between a fast
 *  route and a timeout" — carried verbatim, not re-derived. */
const PREFILTER_LIMIT = 500;

export interface LoadedRegion {
  readonly id: RegionId;
  readonly displayName: string;
  /** `poi_regions.norm_version` — `null` for a region row that exists but was never loaded. */
  readonly normVersion: number | null;
}

/**
 * `query.cityHint` → the loaded regions it plausibly names. Both sides are run through the same
 * `normalise()` the scorer and the loader use, so `"Tel Aviv"`, `"tel aviv"` and `"תל אביב"` (once
 * a Hebrew `display_name` exists) all line up without a hand-maintained alias table.
 *
 * A `null`/empty hint defaults to the single loaded region **only when there is exactly one** —
 * the honest reading of "Tel Aviv is currently the only loaded region" (this file's header): with
 * two or more loaded regions, an absent city hint has no safe default and gets `[]` (searches
 * nothing) rather than a guess.
 */
export function regionIdsForCityHint(
  cityHint: string | null,
  loadedRegions: readonly LoadedRegion[],
): readonly RegionId[] {
  if (loadedRegions.length === 0) return [];
  const hint = normalise(cityHint);
  if (hint === '') {
    return loadedRegions.length === 1 ? [loadedRegions[0]!.id] : [];
  }
  return loadedRegions
    .filter((r) => {
      const name = normalise(r.displayName);
      return hint === r.id || hint.includes(name) || name.includes(hint);
    })
    .map((r) => r.id);
}

/** One row of `search_poi_index`'s result set — field-for-field what the RPC (migration 0020)
 *  returns, snake_case as Postgres hands it back over `supabase-js`. */
interface PoiIndexRow {
  readonly dataset_place_id: string;
  readonly region_id: string;
  readonly name: string;
  readonly alt_names: readonly string[] | null;
  readonly provider_category: string | null;
  readonly address_line: string | null;
  readonly locality: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly dataset_confidence: number;
}

function toResolvedPlace(row: PoiIndexRow): ResolvedPlace {
  return {
    provider: 'overture',
    providerPlaceId: row.dataset_place_id,
    sourceDataset: 'overture-places',
    regionId: row.region_id,
    name: row.name,
    altNames: row.alt_names ?? [],
    providerCategory: row.provider_category,
    addressLine: row.address_line,
    locality: row.locality,
    lat: row.lat,
    lng: row.lng,
    datasetConfidence: row.dataset_confidence,
  };
}

interface PoiRegionRow {
  readonly id: string;
  readonly display_name: string;
  readonly norm_version: number | null;
}

/**
 * The `PlaceResolver` over the loaded `poi_index` extract(s). `db` must be a service-role Supabase
 * client — `poi_regions`/`poi_index` grant nothing to `anon`/`authenticated` and `search_poi_index`
 * (migration 0020) grants `EXECUTE` to `service_role` only (`10` §5's "manual search goes through a
 * server route" ruling) — this adapter must never be constructed with a browser-reachable client.
 */
export function poiIndexPlaceResolver(db: SupabaseClient): PlaceResolver {
  return {
    provider: 'overture' satisfies PlaceProvider,

    async resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult> {
      const { data: regionRows, error: regionError } = await db
        .from('poi_regions')
        .select('id, display_name, norm_version')
        .eq('is_loaded', true);

      if (regionError) {
        throw internal('poi_regions lookup failed', regionError);
      }

      const loaded: LoadedRegion[] = ((regionRows ?? []) as PoiRegionRow[]).map((r) => ({
        id: r.id,
        displayName: r.display_name,
        normVersion: r.norm_version,
      }));

      // "Refuses to serve on a mismatch" (`10` §4) — a stale region is a data problem to fix by
      // reload, not a reason to fail every import, so this drops the region rather than throwing.
      const usable = loaded.filter((r) => {
        if (r.normVersion === NORM_VERSION) return true;
        ctx.log.event('poi_index_region_norm_version_mismatch', {
          regionId: r.id,
          expectedNormVersion: NORM_VERSION,
          foundNormVersion: r.normVersion ?? -1,
        });
        return false;
      });

      const regionIds = regionIdsForCityHint(query.cityHint, usable);
      const normalisedQuery = normalise(query.text);

      // Nothing to search: an honest "not loaded"/"no query text" rather than a wasted round trip.
      if (regionIds.length === 0 || normalisedQuery === '') {
        return scoreCandidates(query, [], []);
      }

      const tokens = queryTokens(query.text);
      const { data: rows, error: searchError } = await db.rpc('search_poi_index', {
        p_region_ids: regionIds,
        p_query_norm: normalisedQuery,
        p_like_patterns: tokens.map((t) => `%${t}%`),
        p_limit: PREFILTER_LIMIT,
      });

      if (searchError) {
        throw internal('search_poi_index RPC failed', searchError);
      }

      const candidates = ((rows ?? []) as PoiIndexRow[]).map(toResolvedPlace);
      return scoreCandidates(query, candidates, regionIds);
    },
  };
}
