import 'server-only';

/**
 * The real `PlaceResolver` (`domain/ports.ts`), provider `'overture'`, over `public.poi_index`.
 *
 * **This is the adapter that has never existed.** The port has been declared since L0-F1-T3, the
 * scoring core has been pure and tested since MS5, and in between there was nothing: every
 * coordinate in the product today is the model's own guess, measured 65–470 m out. This file is the
 * missing middle — region scoping, the prefilter, row → `ResolvedPlace`, and then straight into
 * `scoreCandidates`. **It reimplements no scoring.** If a number in the shortlist looks wrong, this
 * file is not where it came from.
 *
 * ## Service role, and why there is no other option
 *
 * `poi_index` and `poi_regions` carry `ENABLE`/`FORCE ROW LEVEL SECURITY`, **no policy at all**, and
 * an explicit `REVOKE ALL ... FROM anon, authenticated` (migration 0010 §5–6, `10` §6). The browser
 * holds no grant on either table and never will: `06` §11 Q6 requires the per-user rate limit to be
 * enforced server-side, and a client that can query `poi_index` with the anon key has no rate limit
 * at all. So this adapter takes the trusted-server client (`service-role-client.ts`), exactly as
 * `place-store.ts` does for `resolve_place`.
 *
 * The review rule that comes with that client — *a service-role query never filters by `user_id`* —
 * is satisfied trivially here: neither table has a user column. These are global, rebuildable index
 * rows, not user data (`10` §1).
 *
 * ## The prefilter, and the one piece of `10` §5 that is not implementable from here
 *
 * `10` §5's proposed SQL has two OR-ed arms: a whole-string trigram similarity arm
 * (`name_norm operator(extensions.%) $2`) and a token-substring arm (`name_norm like any($3)`).
 * **Only the second is expressible through PostgREST.** `%` is a custom operator; PostgREST's
 * filter grammar has no syntax for one, and reaching the first arm needs a `SECURITY DEFINER` SQL
 * function granted to `service_role` — a migration, which this task is explicitly scoped out of.
 *
 * So the token arm ships and the similarity arm does not, and the gap is written down rather than
 * papered over:
 *
 *  - **What ships is still `pg_trgm`-backed.** `poi_index_name_trgm_idx` is a GIN index with
 *    `gin_trgm_ops`, and that index serves `LIKE '%token%'` — trigram extraction from the pattern is
 *    what `gin_trgm_ops` is for. This is not a fallback to a sequential scan by another name.
 *  - **What is lost is recall on a query whose tokens are all misspelt**, since a substring match is
 *    exact per token. `'Falafel HaKosem'` typed `'Falafal HaKosem'` loses the first token entirely
 *    and survives only on the second. The similarity arm is what covers that case, and it is owed.
 *  - **Tokens shorter than three characters cannot use the trigram index** — there is no full
 *    trigram to extract — so a query that falls back to all-generic tokens (`queryTokens`'s
 *    `strong(toks(q)) or toks(q)` rule) can force a scan. Kept anyway: dropping short tokens here
 *    would mean the two sides of the prefilter no longer ask the same question, which is the one
 *    property `10` §5's recall gate depends on.
 *
 * The `10` §5 recall gate — *for all 44 benchmark cases the eventual winner is inside the
 * prefilter's output* — is **not verified by this file and cannot be**: `poi_index` holds 0 rows and
 * all three `poi_regions` are `is_loaded = false`. It runs when a region is loaded.
 *
 * ## Errors
 *
 * `PlaceResolver` never throws for "no match" and never leaks a provider error. Both halves are
 * enforced here: no match is `shortlist: []` with band `no_match` (which `scoreCandidates` produces
 * from an empty candidate list, so there is one construction path and not two), "that city is not
 * loaded" is `regionsSearched: []`, and every PostgREST or transport failure becomes
 * `internal(...)` — a `DomainError` whose wire view is a code and two booleans. The vendor error
 * object rides along as `cause`, which `DomainError.toView` does not serialise.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { internal } from '@/domain/errors';
import type { OpCtx, PlaceResolver } from '@/domain/ports';
import { NORM_VERSION } from '@/domain/places/normalise';
import { regionHintFor } from '@/domain/places/region-hint';
import { queryTokens, scoreCandidates } from '@/domain/places/score';
import type { RegionId, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * Ceilings. Every one of these is a deliberate number, not a default.
 * ------------------------------------------------------------------------------------------- */

/** `10` §5's cap, verbatim. 8 candidates per import times an uncapped prefilter (one Python query
 *  returned 2 904 rows) is the difference between a fast route and a timeout. A cap can also hide
 *  the true match, which is why `ResolveResult.candidatesPrefiltered` reports the count reached. */
export const MAX_PREFILTER_ROWS = 500;

/**
 * Most tokens that may enter the `OR` disjunction, longest first.
 *
 * Not in `10` §5, which assumed a caption-length candidate name. It is here because the disjunction
 * is a URL query string: PostgREST takes `or=(...)` as one parameter, and a pathological candidate
 * name — a whole caption arriving as `ResolveQuery.text` — would build a filter long enough to be
 * rejected by the gateway's header limit, turning a bad extraction into a 5xx. Twelve distinctive
 * tokens is far more than any real business name; the longest tokens are kept because they are the
 * most selective, and the count is logged when it bites so a real case can be seen rather than
 * guessed at.
 */
export const MAX_PREFILTER_TOKENS = 12;

/** How long the loaded-region list is trusted. It changes only when an ingest runs, and it is read
 *  once per candidate — 8 identical round trips per import without it. Short enough that a reload
 *  becomes visible within a minute rather than at the next deploy. */
export const REGION_CACHE_TTL_MS = 60_000;

/** Prefiltered rows, keyed by region set plus pattern set. Two candidates in one caption often
 *  share tokens, and a re-import repeats the whole set. Bounded hard: this holds up to 500 rows per
 *  entry, so the entry count is the memory ceiling and it is deliberately small. */
export const RESOLUTION_CACHE_MAX_ENTRIES = 64;
export const RESOLUTION_CACHE_TTL_MS = 300_000;

/* ------------------------------------------------------------------------------------------- *
 * The gateway — the one seam that touches the database.
 * ------------------------------------------------------------------------------------------- */

/** `poi_regions`, only the columns the resolver reads. Snake case: these are row shapes, not
 *  domain types, and renaming at the boundary is `toResolvedPlace`'s job below. */
export interface PoiRegionRow {
  readonly id: string;
  readonly country_code: string;
  readonly norm_version: number | null;
  /** The ingest bbox. Read, not assumed: `0010` seeded `tlv` at 32.03–32.12 / 34.74–34.86 and
   *  `0020` widens it to the Tel Aviv + Hasharon launch area. Which towns are searchable is a
   *  property of these four numbers, so the resolver reads them rather than encoding a guess. */
  readonly min_lat: number;
  readonly max_lat: number;
  readonly min_lng: number;
  readonly max_lng: number;
}

/** `poi_index`, the columns `ResolvedPlace` is built from. */
export interface PoiIndexRow {
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

/**
 * The two queries this adapter makes, and nothing else.
 *
 * Two methods rather than one generic `query()` because they are two different questions with two
 * different shapes, and rather than three because nothing else is needed — this is the thin seam the
 * task asked for, not a repository. Its only reason to exist is that the resolver's logic (region
 * scoping, the norm-version gate, pattern building, caching, mapping, scoring) is testable without
 * a database; the implementation below is small enough to read in one screen precisely because
 * everything interesting lives on the other side of it.
 */
export interface PoiIndexGateway {
  /** Loaded regions only (`is_loaded = true`). A half-loaded region is indistinguishable from an
   *  absent one by construction — `poi_regions_loaded_is_complete`, migration 0010. */
  loadedRegions(signal: AbortSignal): Promise<readonly PoiRegionRow[]>;
  prefilter(
    input: {
      readonly regionIds: readonly string[];
      /** Already-escaped PostgREST `like` values, from `namePrefilterPatterns`. */
      readonly likePatterns: readonly string[];
      readonly limit: number;
    },
    signal: AbortSignal,
  ): Promise<readonly PoiIndexRow[]>;
}

/* ------------------------------------------------------------------------------------------- *
 * Pattern building — pure, exported, and tested, because it is the part that is easy to get
 * subtly wrong and impossible to notice.
 * ------------------------------------------------------------------------------------------- */

/**
 * `queryTokens()` → PostgREST `like` values, longest first and capped.
 *
 * **Exactly `queryTokens`, no other token source.** `10` §5's recall gate only means anything if
 * both sides of the prefilter ask the same question: the scorer averages per-token similarity over
 * `queryTokens(text)`, so the prefilter must select on those same tokens or it can hand the scorer
 * rows the gate never contemplated — or, worse, withhold rows the scorer would have ranked first,
 * which reads as "the scorer regressed" and sends the debugging in the wrong direction.
 *
 * `*` is PostgREST's spelling of `%`, so `*token*` on the wire is `LIKE '%token%'` in Postgres.
 *
 * ## Why there is no escaping here, which is the interesting part
 *
 * The first version of this function escaped `_` (LIKE's single-character wildcard, which
 * `normalise()` keeps because Python's `\w` does) as `\_`, then double-quoted the value per
 * PostgREST's rule for values containing reserved characters. **That was thrown away as
 * unverifiable.** PostgREST documents `*` as an alias for `%` and documents double quotes for
 * reserved characters, but does **not** state whether `*` is still translated inside a quoted
 * value — and with `poi_index` empty there is no way to settle it by experiment right now. Shipping
 * a filter whose meaning depends on undocumented behaviour is how a prefilter silently returns
 * nothing and the resolver looks like it has bad data.
 *
 * So the escape is replaced by a widening: **`_` becomes `*`**, i.e. the token `cafe_bar` is
 * prefiltered as `LIKE '%cafe%bar%'`. That is a superset of the exact match, so it cannot lose the
 * true row — and the prefilter is allowed to be generous, because the scorer, not this function,
 * decides what is a match. What it buys is that a pattern contains **only** characters
 * `normalise()` can emit plus `*`, none of which are reserved in a PostgREST filter, so no quoting
 * is needed and nothing here depends on an unspecified rule. `namePrefilterPatterns` is asserted to
 * emit no reserved character in its own test.
 *
 * Two known costs, recorded rather than hidden:
 *
 *  - A `_` in a real place name matches more rows than it should. `_` appears in essentially no
 *    business name; if that ever changes, the fix is the SQL-function prefilter that `10` §5 wants
 *    anyway, not more string surgery here.
 *  - Tokens shorter than three characters cannot use the trigram index (no full trigram to
 *    extract), so an all-generic query can force a scan. Kept anyway — dropping short tokens would
 *    break the "both sides ask the same question" property the recall gate rests on.
 */
export function namePrefilterPatterns(text: string): readonly string[] {
  const tokens = [...queryTokens(text)]
    .filter((token) => token !== '')
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_PREFILTER_TOKENS);

  return tokens.map((token) => `*${token.replace(/[_%]/gu, '*')}*`);
}

/** The `or=(...)` argument for `supabase-js`. Split out so a test can assert the whole string. */
export function namePrefilterFilter(patterns: readonly string[]): string {
  return patterns.map((pattern) => `name_norm.like.${pattern}`).join(',');
}

/* ------------------------------------------------------------------------------------------- *
 * The Supabase-backed gateway.
 * ------------------------------------------------------------------------------------------- */

const REGION_COLUMNS = 'id, country_code, norm_version, min_lat, max_lat, min_lng, max_lng';
const POI_COLUMNS =
  'dataset_place_id, region_id, name, alt_names, provider_category, address_line, locality, lat, lng, dataset_confidence';

export function supabasePoiIndexGateway(service: SupabaseClient): PoiIndexGateway {
  return {
    async loadedRegions(signal) {
      const { data, error } = await service
        .from('poi_regions')
        .select(REGION_COLUMNS)
        .eq('is_loaded', true)
        .abortSignal(signal);

      if (error) throw internal('poi_regions read failed', error);
      return (data ?? []) as unknown as readonly PoiRegionRow[];
    },

    async prefilter({ regionIds, likePatterns, limit }, signal) {
      const { data, error } = await service
        .from('poi_index')
        .select(POI_COLUMNS)
        .in('region_id', [...regionIds])
        .or(namePrefilterFilter(likePatterns))
        .limit(limit)
        .abortSignal(signal);

      if (error) throw internal('poi_index prefilter failed', error);
      return (data ?? []) as unknown as readonly PoiIndexRow[];
    },
  };
}

/* ------------------------------------------------------------------------------------------- *
 * The resolver.
 * ------------------------------------------------------------------------------------------- */

export interface OverturePlaceResolverOptions {
  /** Injectable only so the two caches are testable without waiting out a TTL. `Date.now` is legal
   *  here — the `Clock` port's ban on ambient time is a `domain/` rule, and this is `integrations/`. */
  readonly now?: () => number;
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export function overturePlaceResolver(
  gateway: PoiIndexGateway,
  options: OverturePlaceResolverOptions = {},
): PlaceResolver {
  const now = options.now ?? (() => Date.now());

  let regionCache: CacheEntry<readonly PoiRegionRow[]> | null = null;
  const rowCache = new Map<string, CacheEntry<readonly PoiIndexRow[]>>();

  async function loadedRegions(ctx: OpCtx): Promise<readonly PoiRegionRow[]> {
    const cached = regionCache;
    if (cached !== null && cached.expiresAt > now()) return cached.value;

    let rows: readonly PoiRegionRow[];
    try {
      rows = await gateway.loadedRegions(ctx.signal);
    } catch (cause) {
      // Same rule as the prefilter: the Supabase gateway has already converted PostgREST's `error`
      // channel, and this catches a thrown transport failure. Nothing vendor-shaped gets past here.
      throw internal('poi_regions read failed', cause);
    }
    // A failed read is never cached: a 30-second network blip must not become a 60-second "no
    // regions are loaded", which the UI would render as "we don't have that city".
    regionCache = { value: rows, expiresAt: now() + REGION_CACHE_TTL_MS };
    return rows;
  }

  /**
   * `10` §4 / `normalise.ts`'s contract: a region loaded under a different normaliser is silently
   * degraded, not broken, so it is refused rather than served. Refused here means **excluded from
   * the region set**, not thrown: the user-visible truth is "we don't have that city right now",
   * which the empty-`regionsSearched` path already says honestly. Throwing `INTERNAL` would show a
   * generic failure for a condition an ingest run fixes, and would take down every other loaded
   * region with it.
   */
  function usableRegions(rows: readonly PoiRegionRow[], ctx: OpCtx): readonly PoiRegionRow[] {
    const usable = rows.filter((row) => row.norm_version === NORM_VERSION);
    const refused = rows.length - usable.length;
    if (refused > 0) {
      ctx.log.event('poi.region_norm_version_mismatch', {
        expected: NORM_VERSION,
        refused,
        regions: rows
          .filter((row) => row.norm_version !== NORM_VERSION)
          .map((row) => row.id)
          .join(','),
      });
    }
    return usable;
  }

  return {
    provider: 'overture',

    async resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult> {
      // Region scoping. Nothing about this step touches the network except the region list itself,
      // so an unloaded city costs one cached read and no prefilter.
      const hint = regionHintFor(query.cityHint, query.countryHint);

      let regions: readonly RegionId[] = [];
      let scopeReason = 'none';
      if (hint.kind === 'city') {
        const loaded = usableRegions(await loadedRegions(ctx), ctx);
        const named = loaded.filter((row) => row.id === hint.regionId);
        // The bbox test, and the whole reason `RegionHint` carries a point. A town the alias table
        // assigns to `tlv` is only searchable if the *loaded* `tlv` extract actually covers it —
        // otherwise reporting `regionsSearched: ['tlv']` would claim we looked in the right place
        // and return the best-scoring Tel Aviv namesake for a Netanya café.
        regions = named.filter((row) => covers(row, hint.point)).map((row) => row.id);
        scopeReason = regions.length > 0 ? 'city' : named.length > 0 ? 'outside_extent' : 'not_loaded';
      } else if (hint.kind === 'country') {
        const loaded = usableRegions(await loadedRegions(ctx), ctx);
        regions = loaded.filter((row) => row.country_code === hint.countryCode).map((row) => row.id);
        scopeReason = regions.length > 0 ? 'country' : 'not_loaded';
      }
      // `unknown` searches nothing, on purpose — see `region-hint.ts`.

      const patterns = namePrefilterPatterns(query.text);

      if (regions.length === 0 || patterns.length === 0) {
        ctx.log.event('poi.resolve', {
          hint: hint.kind,
          scope: scopeReason,
          regions: regions.join(','),
          prefiltered: 0,
          band: 'no_match',
          reason: regions.length === 0 ? 'no_region' : 'no_tokens',
        });
        // One construction path for the empty result, so "nothing searched" and "nothing found"
        // cannot drift apart in shape. `regionsSearched: []` is what `regionLoaded()` reads.
        return scoreCandidates(query, [], regions);
      }

      const rows = await prefilterRows(regions, patterns, ctx);
      const candidates = rows.map(toResolvedPlace);
      const result = scoreCandidates(query, candidates, regions);

      ctx.log.event('poi.resolve', {
        hint: hint.kind,
        scope: scopeReason,
        regions: regions.join(','),
        prefiltered: result.candidatesPrefiltered,
        capped: result.candidatesPrefiltered >= MAX_PREFILTER_ROWS,
        tokens: patterns.length,
        band: result.confidence.band,
        shortlist: result.shortlist.length,
      });

      return result;
    },
  };

  async function prefilterRows(
    regions: readonly RegionId[],
    patterns: readonly string[],
    ctx: OpCtx,
  ): Promise<readonly PoiIndexRow[]> {
    // `\u0000` cannot appear in a region id (`^[a-z][a-z0-9_]{1,15}$`) or in a pattern built from
    // `normalise()`d text, so it is a separator that cannot be forged into a cache collision.
    const key = `${[...regions].sort().join(',')}\u0000${patterns.join('\u0000')}`;
    const hit = rowCache.get(key);
    if (hit !== undefined && hit.expiresAt > now()) return hit.value;
    if (hit !== undefined) rowCache.delete(key);

    let rows: readonly PoiIndexRow[];
    try {
      rows = await gateway.prefilter(
        { regionIds: regions, likePatterns: patterns, limit: MAX_PREFILTER_ROWS },
        ctx.signal,
      );
    } catch (cause) {
      // The gateway already converts PostgREST's `error` channel; this catches a thrown transport
      // failure and anything a non-Supabase gateway does. Either way the vendor shape stops here.
      throw internal('poi_index prefilter failed', cause);
    }

    // Oldest-first eviction. A Map preserves insertion order, so the first key is the oldest; no
    // recency tracking, because the working set is one import's candidates and an LRU would be
    // more machinery than the thing it manages.
    if (rowCache.size >= RESOLUTION_CACHE_MAX_ENTRIES) {
      const oldest = rowCache.keys().next();
      if (oldest.done !== true) rowCache.delete(oldest.value);
    }
    rowCache.set(key, { value: rows, expiresAt: now() + RESOLUTION_CACHE_TTL_MS });
    return rows;
  }
}

/**
 * Inclusive point-in-bbox. Inclusive because `poi_regions`' own bounds are the ingest bounds and a
 * row sitting exactly on one was loaded; excluding the boundary would disagree with the extract.
 * No antimeridian handling: `poi_regions_bbox_ordered` (migration 0010) requires `min < max` on
 * both axes, so a box that wraps cannot exist in this table.
 */
function covers(region: PoiRegionRow, point: { readonly lat: number; readonly lng: number }): boolean {
  return (
    point.lat >= region.min_lat &&
    point.lat <= region.max_lat &&
    point.lng >= region.min_lng &&
    point.lng <= region.max_lng
  );
}

/**
 * Row → `ResolvedPlace`. The only place snake case becomes camel case, and the only place a
 * nullable column meets a non-nullable field.
 *
 * `alt_names` is `not null default '{}'` in the schema, so the `?? []` is for a gateway that
 * projected it away or a driver that gave back `null` — never a silent `undefined` reaching the
 * scorer's `for...of`. `provider` and `sourceDataset` are constants because `poi_index` has a
 * `check (source_dataset = 'overture-places')`: a row from anywhere else cannot be in this table,
 * and that CHECK is the enforcement of `06` §11 Q2 (the ODbL question), not a formality.
 */
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
