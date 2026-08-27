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
 * ## The prefilter is both of `10` §5's arms now, and it lives in SQL
 *
 * `10` §5's prefilter has two OR-ed arms: a per-token substring match and a trigram similarity
 * match. Until migration `0021` only the substring arm shipped, because `%` is a custom operator
 * and PostgREST's filter grammar has no syntax for one. The cost was measured, not theorised:
 * benchmark case TLV-12, `'Belboy tel aviv'`, returned **0 prefiltered rows** against an index that
 * holds `Bellboy`, because `belboy` cannot substring-match `bellboy`.
 *
 * `0021` adds `public.poi_prefilter` — both arms, region-scoped,
 * capped, ordered — and this adapter calls it. Three consequences worth knowing here:
 *
 *  - **The token → pattern rule moved into SQL.** This file sends `queryTokens()`'s output and the
 *    function builds the `LIKE` patterns, so there is one answer to "what does this token match"
 *    instead of two that can drift. The old `*token*` PostgREST spelling, and the paragraph of
 *    unverifiable reasoning about whether `*` is still a wildcard inside a quoted value, are both
 *    gone: a bound `text[]` parameter has no URL grammar to escape against.
 *  - **The trigram metric is per-token `strict_word_similarity`, not `10` §5's literal whole-string
 *    `similarity`.** Measured on the loaded index, the whole-string form scores `bellboy` against
 *    `'belboy tel aviv'` at 0.333 — barely over pg_trgm's default and gone entirely if the caption
 *    carries one more word. `0021`'s header carries the numbers.
 *  - **The 500-row cap is now ordered.** `.limit(500)` through PostgREST had no `ORDER BY` at all,
 *    so which 500 rows survived was whatever the plan emitted — `10` §5's "a cap can silently
 *    exclude the true match" in its worst form. The function orders by best per-token match before
 *    it truncates. That order is a RECALL order and nothing downstream reads it: `scoreCandidates`
 *    is still the only ranker.
 *
 * ## The third arm: the street address (`0022`)
 *
 * Neither name arm can reach a row whose name shares nothing with the caption. Measured on the 13
 * real TikToks in `tests/manual/tiktok-recognition-corpus.json`: **6 of 9 misses were
 * `unreachable_in_index`** — the row is there and no scoring change can see it. The canonical one
 * is `קוהי`, which prefiltered **zero** rows while `Kohi Coffee Shop` sat in the index at
 * `בן יהודה 155` — an address the extractor had already put in `addressHint`.
 *
 * `0022` adds an address arm, and this file's only job in it is to pass `ResolveQuery.addressHint`
 * through **verbatim**. Not normalised, not parsed, not split: `score.ts` owns every decision about
 * how an address is compared, and the SQL arm is deliberately imprecise (it will happily return
 * `רוטשילד 150` for `רוטשילד 15`, which `addressScore`'s house-number branch then rejects
 * outright). One parser, one answer.
 *
 * It is **recall only and can never be a filter** — 8 of 17 real candidates carry no address at
 * all, so a null hint has to leave the result byte-identical. `0022`'s own post-condition proves
 * that against a recomputation of `0021`'s two arms, for `null`, `''`, whitespace, punctuation and
 * a bare house number.
 *
 * `10` §5's recall gate — *the eventual winner is inside the prefilter's output* — is exercised by
 * `tests/manual/tlv-resolve-benchmark.manual.ts` against the loaded `tlv` index, not here.
 *
 * ## Query forms: the same three arms, asked in both scripts (TLV-BILING-B)
 *
 * The address arm bought recall the ranking could not spend: it returns `Kohi Coffee Shop` for
 * `קוהי` and the cross-script name then scores ~0, so the blend lands below a wrong-venue row that
 * merely shares a script (`handoff-2026-08-28` §5). The fix is on the query side, not the weights.
 *
 * `ResolveQuery.textVariants` carries alternate-script forms of the same name, and this file's job
 * is one line: the prefilter's token list is built from **every** form (`queryForms`), not just
 * `text`. That needs no new migration and no second round trip — `poi_prefilter`'s two name arms
 * are per-token disjunctions, so one call with the union of the forms' tokens returns exactly the
 * union of the rows. `score.ts` then takes the best name score across the forms and records which
 * one won.
 *
 * Two ceilings, both stated because they are the ones that bound the widening: at most
 * `MAX_QUERY_VARIANTS` (3) variants are ever considered, and the twelve-token prefilter budget is
 * shared round-robin across the forms rather than being multiplied by them. The number of database
 * round trips per candidate is unchanged at one.
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
import { NORM_VERSION, normalise } from '@/domain/places/normalise';
import { regionHintFor } from '@/domain/places/region-hint';
import { queryForms, queryTokens, scoreCandidates } from '@/domain/places/score';
import type { RegionId, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * Ceilings. Every one of these is a deliberate number, not a default.
 * ------------------------------------------------------------------------------------------- */

/** `10` §5's cap, verbatim. 8 candidates per import times an uncapped prefilter (one Python query
 *  returned 2 904 rows) is the difference between a fast route and a timeout. A cap can also hide
 *  the true match, which is why `ResolveResult.candidatesPrefiltered` reports the count reached. */
export const MAX_PREFILTER_ROWS = 500;

/**
 * Most tokens either name arm of the prefilter may ask about, longest first, **shared across the
 * query forms**.
 *
 * Not in `10` §5, which assumed a caption-length candidate name. The original reason was PostgREST's
 * URL length; that reason is gone with the `or=(...)` filter, and the cap stays for a better one:
 * **each token is one GIN index probe in both arms**, so a pathological candidate — a whole caption
 * arriving as `ResolveQuery.text` — would turn one import into hundreds of probes. Twelve
 * distinctive tokens is far more than any real business name; the longest are kept because they are
 * the most selective, and the count is logged when it bites so a real case can be seen rather than
 * guessed at. `0021` repeats the same cap and the same ordering server-side, so the two agree on
 * which twelve even if this file is bypassed.
 *
 * With `textVariants` in play the twelve are a shared budget and they are allocated **round-robin**
 * across the forms rather than globally longest-first (TLV-BILING-B). Longest-first across a merged
 * list would let one wordy form eat the whole budget and leave a variant with no token at all in
 * the prefilter — which is the exact failure the variant exists to fix, reintroduced by a sort
 * order. Round-robin guarantees every form at least `12 / forms` tokens, and with a single form it
 * degenerates to the previous ordering exactly.
 */
export const MAX_PREFILTER_TOKENS = 12;

/** How long the loaded-region list is trusted. It changes only when an ingest runs, and it is read
 *  once per candidate — 8 identical round trips per import without it. Short enough that a reload
 *  becomes visible within a minute rather than at the next deploy. */
export const REGION_CACHE_TTL_MS = 60_000;

/** Prefiltered rows, keyed by region set plus token set. Two candidates in one caption often
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
  /**
   * `10` §5's prefilter, all three arms, via `public.poi_prefilter(text[], text[], text, text,
   * integer)` (migrations `0021` and `0022`).
   *
   * `tokens` is `queryTokens()`'s output verbatim — **not** patterns. Both name arms are built from
   * it on the SQL side, which is what keeps the substring arm, the trigram arm and `score.ts`'s
   * `tokenCoverage` asking one question rather than three. `queryNorm` is the normalised whole
   * query and is used only to order the rows before the cap; nothing ranks on it. `addressHint` is
   * the caption's address, raw, and drives the third arm (`0022`).
   */
  prefilter(
    input: {
      readonly regionIds: readonly string[];
      readonly tokens: readonly string[];
      readonly queryNorm: string;
      /** `ResolveQuery.addressHint`, verbatim. `null` when the caption gave no address, which is
       *  the majority case and must cost nothing — see the header. */
      readonly addressHint: string | null;
      readonly limit: number;
    },
    signal: AbortSignal,
  ): Promise<readonly PoiIndexRow[]>;
}

/* ------------------------------------------------------------------------------------------- *
 * Token selection — pure, exported, and tested, because it is the part that is easy to get
 * subtly wrong and impossible to notice.
 * ------------------------------------------------------------------------------------------- */

/**
 * `queryTokens()` → the token list both prefilter arms ask about, longest first and capped.
 *
 * **Exactly `queryTokens`, no other token source.** `10` §5's recall gate only means anything if
 * both sides of the prefilter ask the same question: the scorer averages per-token similarity over
 * `queryTokens(text)`, so the prefilter must select on those same tokens or it can hand the scorer
 * rows the gate never contemplated — or, worse, withhold rows the scorer would have ranked first,
 * which reads as "the scorer regressed" and sends the debugging in the wrong direction.
 *
 * ## Why there is no escaping here, which used to be the interesting part
 *
 * There was a whole paragraph here about `_`, PostgREST's `*`-for-`%` alias, and whether `*` is
 * still translated inside a quoted value — a question PostgREST does not document and that could
 * not be settled by experiment. **The question no longer exists.** `poi_prefilter` takes a bound
 * `text[]`, so there is no URL grammar and nothing to quote, and the `LIKE` pattern is built in SQL
 * (`0021`) where `_` is widened and the backslash is escaped explicitly. This function returns the
 * tokens themselves.
 *
 * The one cost that remains is real and unchanged: a token shorter than three characters has no
 * full trigram, so it cannot use the GIN index in either arm and an all-generic query
 * (`queryTokens`'s `strong(toks(q)) or toks(q)` fallback) can force a scan. Kept anyway — dropping
 * short tokens here would mean the two sides of the prefilter no longer ask the same question,
 * which is the one property the recall gate depends on.
 */
export function prefilterTokens(
  text: string,
  textVariants: readonly string[] | null = null,
): readonly string[] {
  const perForm = queryForms(text, textVariants).map((form) =>
    [...queryTokens(form)]
      .filter((token) => token !== '')
      .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0)),
  );

  // Round-robin, longest-first within each form. With a single form this is exactly the old
  // `sort().slice()` — same order, same twelve — which is why no existing assertion moves.
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (let rank = 0; tokens.length < MAX_PREFILTER_TOKENS; rank += 1) {
    let anyLeft = false;
    for (const form of perForm) {
      const token = form[rank];
      if (token === undefined) continue;
      anyLeft = true;
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
      if (tokens.length >= MAX_PREFILTER_TOKENS) break;
    }
    if (!anyLeft) break;
  }
  return tokens;
}

/* ------------------------------------------------------------------------------------------- *
 * The Supabase-backed gateway.
 * ------------------------------------------------------------------------------------------- */

const REGION_COLUMNS = 'id, country_code, norm_version, min_lat, max_lat, min_lng, max_lng';

/** Migrations `0021`/`0022`. Named once so a rename shows up as one broken constant, not as an empty
 *  prefilter that looks like bad data. */
const PREFILTER_RPC = 'poi_prefilter';

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

    /**
     * One RPC, four bound parameters, no filter string. The function returns exactly the ten
     * columns `PoiIndexRow` declares, in that order, so there is no `select()` list here to fall
     * out of step with the row type — and `name_norm` is deliberately not among them (`0021`).
     *
     * `service_role` is the only role holding EXECUTE on it (`0021`, asserted in that migration and
     * again by `inventory.sql` check 6): calling this with the anon key is a 42501 at the database,
     * not a policy decision made in this file.
     */
    async prefilter({ regionIds, tokens, queryNorm, addressHint, limit }, signal) {
      const { data, error } = await service
        .rpc(PREFILTER_RPC, {
          p_region_ids: [...regionIds],
          p_tokens: [...tokens],
          p_query_norm: queryNorm,
          p_address_hint: addressHint,
          p_limit: limit,
        })
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
      // `query.text` is the third argument on purpose: when the extractor gives no `cityHint`,
      // the city is often still sitting in the candidate string (`'Belboy tel aviv'`). Without it
      // that query scoped to nothing and the index was never read — see `region-hint.ts`.
      const hint = regionHintFor(query.cityHint, query.countryHint, query.text);

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
        // `city_text` rather than `city` when the city came out of the candidate string: it is the
        // same scope with weaker warrant, and a log that conflates them cannot show which.
        const scoped = hint.via === 'text' ? 'city_text' : 'city';
        scopeReason = regions.length > 0 ? scoped : named.length > 0 ? 'outside_extent' : 'not_loaded';
      } else if (hint.kind === 'country') {
        const loaded = usableRegions(await loadedRegions(ctx), ctx);
        regions = loaded.filter((row) => row.country_code === hint.countryCode).map((row) => row.id);
        scopeReason = regions.length > 0 ? 'country' : 'not_loaded';
      }
      // `unknown` searches nothing, on purpose — see `region-hint.ts`.

      // The variants ride into the SAME call, not a second one. Both name arms of `poi_prefilter`
      // are per-token disjunctions (arm 1 `name_norm like any(patterns)`, arm 2 a join on any
      // token), so one call with the union of the forms' tokens returns exactly the union of the
      // rows each form would have returned on its own — no extra round trip, no extra cache entry,
      // and no migration. The address arm depends only on `p_address_hint`, so it is unaffected.
      const tokens = prefilterTokens(query.text, query.textVariants ?? null);

      if (regions.length === 0 || tokens.length === 0) {
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

      // `?? null` for the same reason `score.ts`'s `rankPlaces` does it: `addressHint` is optional
      // on `ResolveQuery`, and absent and null mean the same thing. Collapsing them here means the
      // cache key and the RPC argument cannot disagree about which one arrived.
      const rows = await prefilterRows(
        regions,
        tokens,
        normalise(query.text),
        query.addressHint ?? null,
        ctx,
      );
      const candidates = rows.map(toResolvedPlace);
      const result = scoreCandidates(query, candidates, regions);

      ctx.log.event('poi.resolve', {
        hint: hint.kind,
        scope: scopeReason,
        regions: regions.join(','),
        prefiltered: result.candidatesPrefiltered,
        capped: result.candidatesPrefiltered >= MAX_PREFILTER_ROWS,
        tokens: tokens.length,
        band: result.confidence.band,
        shortlist: result.shortlist.length,
      });

      return result;
    },
  };

  async function prefilterRows(
    regions: readonly RegionId[],
    tokens: readonly string[],
    queryNorm: string,
    addressHint: string | null,
    ctx: OpCtx,
  ): Promise<readonly PoiIndexRow[]> {
    // `\u0000` cannot appear in a region id (`^[a-z][a-z0-9_]{1,15}$`) or in a token built from
    // `normalise()`d text, so it is a separator that cannot be forged into a cache collision.
    // `queryNorm` is NOT in the key, deliberately: it only orders the rows below the cap, and two
    // queries with the same tokens differ in that order by at most which of >500 rows survive —
    // which, on this index, no benchmark case has ever reached. Keying on it would halve the hit
    // rate of the one cache that saves eight round trips per import for no observable gain.
    //
    // The variants need no separate key component: they enter only through `tokens`, which is
    // already the whole of what the two name arms select on. Two queries whose forms produce the
    // same token set genuinely do get the same rows.
    //
    // `addressHint` IS in the key, and that is not symmetry — it changes which ROWS come back, not
    // their order (`0022`'s third arm). Two candidates in one caption very often share a name token
    // and carry different addresses; without this they would share a cache entry and the second
    // would silently get the first one's address arm. `\u0001` separates it from the tokens so an
    // address cannot be forged to look like one.
    const key = `${[...regions].sort().join(',')}\u0000${tokens.join('\u0000')}\u0001${addressHint ?? ''}`;
    const hit = rowCache.get(key);
    if (hit !== undefined && hit.expiresAt > now()) return hit.value;
    if (hit !== undefined) rowCache.delete(key);

    let rows: readonly PoiIndexRow[];
    try {
      rows = await gateway.prefilter(
        { regionIds: regions, tokens, queryNorm, addressHint, limit: MAX_PREFILTER_ROWS },
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
