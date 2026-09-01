import 'server-only';

/**
 * `PlaceResolver` over Google Places API (New) Text Search, provider `'google'`.
 *
 * Added 2026-08-28 on the owner's ruling that Google Places becomes the active direction for place
 * resolution. The measurement behind that ruling is
 * `docs/evidence/places/google-places-and-transcription-probe-2026-08-28.md`: on the exact 16
 * extracted candidate strings from the 13 real corpus TikToks, Google's top-1 was right 14/15
 * against the Overture resolver's 12/15, and all three Overture misses were index *coverage*
 * (a venue absent, a venue whose previous tenant still occupies the row), not scoring.
 *
 * ## This file does not rank
 *
 * It maps Google's results to `ResolvedPlace` and hands them to `scoreCandidates` — the same scorer
 * the Overture adapter uses. That is the whole design:
 *
 *  - there is **one ranker** in the system, so a change to scoring cannot mean two different things
 *    depending on which provider answered;
 *  - Overture and Google numbers stay **directly comparable**, which is what makes the provider
 *    choice re-decidable later rather than a one-way door.
 *
 * Google returns results in its own relevance order. We deliberately do not carry that order
 * through as a score: it is not on our 0..1 scale, it is not comparable to Overture's, and
 * `places.resolution_score`'s CHECK is on our scale.
 *
 * ## `datasetConfidence` is 0.5, and that is a statement about us, not about Google
 *
 * `scorePlace` weights `datasetConfidence` at 0.10. Google exposes no per-result confidence, so
 * every row gets the schema's neutral default. Manufacturing a number here — from result order, or
 * from a rating, or from "it's Google so it's probably right" — is exactly the confidently-wrong
 * failure the working agreement forbids. Being constant across a response it cannot change the
 * *ranking* within one query; it only sets where the absolute score sits against the band gates.
 *
 * ## Language: we ask in the script the caption was written in
 *
 * Text Search localises names and addresses to `languageCode`. Left unset it answered
 * `האחים` with `Haachim @ Shlomo Ibn Gabirol Street 26` — the right venue, transliterated. That is
 * wrong twice over: our users are Hebrew speakers in Tel Aviv and would be shown a place under a
 * name it does not use, and `addressScore` explicitly cannot compare across writing systems, so a
 * Latin address silently discards the corroboration an address is *for*.
 *
 * So the language follows the query: Hebrew in, Hebrew out. Anywhere else the field is omitted and
 * Google's own default applies, which keeps this global rather than pinning it to one market.
 * `docs` memory: Hebrew↔English is the language scope; other scripts are best-effort.
 *
 * ## A lone result means something here that it does not mean for a prefilter
 *
 * Text Search returns exactly one result for 14 of the 16 real corpus candidates, so `margin` is
 * null almost always. Under the default band policy (`10` §12 Q3: unmeasured margin is not perfect
 * margin) that caps every answer at `confirm` and makes the auto-accept rate structurally 0% —
 * measured, with 15/15 of those answers correct. The rule is right for `poi_index`, where one row
 * means *our cheap prefilter matched one thing*; it is wrong here, where one result means *a global
 * index holds one place under that name near that city*.
 *
 * So this adapter passes `'exhaustive-search'` to `scoreCandidates`. That waives **only** the
 * unmeasurable-margin block. The score gate is untouched, and a margin that does exist must still
 * clear it — so this can never promote a measured-but-poor margin.
 *
 * ## Region semantics differ from Overture's, and the difference is load-bearing
 *
 * `regionsSearched: []` means *"we have not loaded that city"* — `regionLoaded()` turns it into a
 * distinct honest UI state (`06` §7.3). Google has no such concept: it is global, and a miss is a
 * genuine "not found", never "not loaded yet". So this adapter reports `GLOBAL_REGION` and never
 * an empty array, and `ResolvedPlace.regionId` is `null` (the field's documented value for a
 * region-less provider). An adapter that returned `[]` here would make every Google miss render as
 * "we don't have that city yet", which would be a lie.
 *
 * ## Terms of service — read this before wiring it to end users
 *
 * `06-map-and-places-decision.md` §3.1, VERIFIED: Google Places content **may not be used in
 * conjunction with a non-Google map** (Service Specific Terms §5.3), and §5.4 caps lat/lng caching
 * at 30 days. Our renderer is still MapLibre + Protomaps.
 *
 * The owner's 2026-08-28 ruling is to make Google primary *and* to keep the renderer for now, with
 * a Google Maps renderer prototype as the next thing to build. `place-resolver-factory.ts` is where
 * those two facts are reconciled: production defaults to Overture until the renderer moves. That
 * gate lives in code, not only in prose, because a documented-only gate is one refactor from gone.
 *
 * Only `providerPlaceId` (Google's place id) is exempt from §5.4 and safe to store indefinitely.
 * Coordinates from this provider are cache, not record.
 *
 * ## Quota — the operational blocker, measured 2026-08-28
 *
 * The Cloud project behind the current key carries
 * `SearchTextRequestPerDayPerProject = 100`, a **hard cap of 100 Text Search requests per day**,
 * and one night of measurement exhausted it (HTTP 429, `RESOURCE_EXHAUSTED`). At 1–7 lookups per
 * import that is roughly 15–100 imports **per day across all users combined**.
 *
 * The published free tier is 5 000 Text Search (Pro) calls per month, so this is a project-level
 * quota rather than the product's real ceiling — but it is the ceiling that is live today, and
 * raising it is an owner action in the Cloud console (and probably a billing one). Until it is
 * raised, treat this provider as measurable but not shippable.
 *
 * `GooglePlaceResolverOptions.lookupStore` is the one lever that moves that number without asking
 * Google for anything: identical requests are served from `place_lookups` instead of the network,
 * so a re-import costs nothing and a venue two people saved costs one call rather than two.
 * Counted on the 13-URL corpus, a second run is 16/16 hits.
 *
 * ## Failures are observable now, and that is not the same as failures being visible
 *
 * Until 2026-08-28 every non-OK response became one undifferentiated `internal(...)`, which
 * `resolveCandidates` collapsed to `{ kind: 'failed', reason: 'lookup_failed' }`. A real Prague
 * import produced four of those and nothing else: no way to tell an exhausted quota from a revoked
 * key from a five-second timeout, and no server log line at all, because nothing downstream throws
 * — resolution deliberately degrades one candidate rather than failing the import, so the route's
 * own failure logging never runs.
 *
 * Two things changed, and the split between them is the point:
 *
 *  - `classifyGoogleStatus` names the failure, and `ProviderLookupFailure`
 *    (`domain/import/provider-failure.ts`) carries that name on the `DomainError`'s cause chain.
 *    Nothing vendor-specific rides along: the message is composed from the provider slug, the
 *    classification and the status, and Google's own body stays one link further down where only
 *    `describeCause` reads it.
 *  - the resolver emits **one** `places.resolve_failed` line per failed lookup, with the
 *    classification and the HTTP status and nothing else. Not the query, not the candidate name,
 *    not a coordinate (`ports.ts`).
 *
 * The client boundary is untouched. `DomainError.toView` still returns a code and two booleans,
 * and `tests/manual/describe-cause-redaction.manual.mts` is still the rule for what may appear in
 * a log line.
 */

import { DomainError, internal, upstreamTimeout } from '@/domain/errors';
import {
  ProviderLookupFailure,
  providerFailureOf,
  type ProviderFailureKind,
} from '@/domain/import/provider-failure';
import type { OpCtx, PlaceResolver } from '@/domain/ports';
import { toCountryCode } from '@/domain/places/country-code';
import { distinctiveTokens, scoreCandidates } from '@/domain/places/score';
import { normalise } from '@/domain/places/normalise';
import type { RegionId, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';
import { cachedProviderRows, type PlaceLookupStore } from '@/integrations/places/lookup-cache';

/**
 * The single `RegionId` this provider reports. Not a real `poi_regions` row and never joined
 * against one — it exists so `regionLoaded()` is true for a global provider. See the header.
 */
export const GLOBAL_REGION: RegionId = 'global';

/** Google exposes no per-result confidence. The schema's neutral default; see the header. */
export const GOOGLE_DATASET_CONFIDENCE = 0.5;

/** Text Search caps at 20; we score what we ask for, and our shortlist is 5. Ten is headroom for
 *  the scorer to re-rank within without paying for results nothing will ever read. */
export const MAX_GOOGLE_RESULTS = 10;

/**
 * Per-lookup ceiling. `04` §7's sibling budgets are 5 s for a short link and 8 s for oEmbed; this
 * is the same kind of number for the same reason.
 *
 * It is not hypothetical. With the project's Text Search quota exhausted (see below), a real
 * 5-candidate import sat on a spinner for **47 seconds** before degrading — the lookups were going
 * to fail either way, and the only thing the wait bought the user was the wait. `resolveCandidates`
 * is sequential and `MAX_CANDIDATES` is 7, so an untimed provider bounds the whole import at
 * "however long seven hung requests take".
 */
export const GOOGLE_TIMEOUT_MS = 5_000;

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Every field this adapter reads, and no more. The field mask is the billing tier: each added
 * field can move the whole request to a more expensive SKU, so this list is deliberately short.
 * `addressComponents` is what makes a *structured* `addressLine` possible — see `toResolvedPlace`
 * for why `formattedAddress` is not used for that.
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.addressComponents',
  'places.location',
  'places.primaryType',
].join(',');

/* ------------------------------------------------------------------------------------------- *
 * The gateway — the one seam that touches the network.
 * ------------------------------------------------------------------------------------------- */

/** One `addressComponents` entry, only the fields we read. */
export interface GoogleAddressComponent {
  readonly longText?: string;
  readonly shortText?: string;
  readonly types?: readonly string[];
}

/** One Text Search result, in Google's own shape. Snake-to-camel is `toResolvedPlace`'s job. */
export interface GooglePlaceRow {
  readonly id: string;
  readonly displayName?: { readonly text?: string };
  readonly addressComponents?: readonly GoogleAddressComponent[];
  readonly location?: { readonly latitude?: number; readonly longitude?: number };
  readonly primaryType?: string;
}

export interface GoogleTextSearchParams {
  readonly textQuery: string;
  /** ISO-3166-1 alpha-2, upper-cased by the caller. Biases results to a country when we know one. */
  readonly regionCode: string | null;
  /** BCP-47. `null` leaves it to Google. See the header for why this is not cosmetic. */
  readonly languageCode: string | null;
  readonly maxResultCount: number;
}

/**
 * Exists so the resolver's logic — query building, mapping, scoring — is testable without a
 * network or an API key. Same reasoning as `PoiIndexGateway` in the Overture adapter.
 */
export interface GooglePlacesGateway {
  searchText(params: GoogleTextSearchParams, signal: AbortSignal): Promise<readonly GooglePlaceRow[]>;
}

/**
 * Google's HTTP status, as one of our six classifications.
 *
 * Only the distinctions we can act on differently. The important one is `quota_exhausted` vs
 * `auth`: on this project both are "Google refused", both used to be an identical
 * `lookup_failed`, and they are opposite operational facts — one resolves by itself tomorrow, the
 * other never does. Measured on this project's key: an exhausted Text Search quota answers
 * **429** with `RESOURCE_EXHAUSTED` (`docs/evidence/places/`).
 *
 * The 403 branch is the one place this adapter reads the response body, and it reads it for two
 * fixed tokens and nothing else. Google has historically served quota refusals as 403 with
 * `RESOURCE_EXHAUSTED` / `rateLimitExceeded` as well as 429, and filing a spent quota as "our key
 * is broken" would send an operator to the wrong console page. The body is not retained, not
 * logged from here, and not returned — only the presence of a token is.
 *
 * Anything else 4xx is `bad_request`: the provider understood us and refused, which on a request
 * this adapter composes itself means the adapter is wrong. 5xx is theirs.
 */
export function classifyGoogleStatus(status: number, body: string): ProviderFailureKind {
  if (status === 429) return 'quota_exhausted';
  if (status === 403 && /RESOURCE_EXHAUSTED|rateLimitExceeded/.test(body)) return 'quota_exhausted';
  if (status === 401 || status === 403) return 'auth';
  // A bad key is a **400**, not a 401 or a 403. Verified against the live endpoint with a
  // deliberately invalid key: `400 {"error":{"status":"INVALID_ARGUMENT","message":"API key not
  // valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}`.
  //
  // Without this branch the single most likely production key fault — rotated, revoked, mistyped,
  // or absent from the deploy — classified as `bad_request`, whose whole meaning is "the adapter
  // built a wrong request". That sent an operator to the query builder over a credential problem,
  // and it was a *confident* wrong answer where the old undifferentiated `lookup_failed` had at
  // least been an honest "we do not know". Read the body the same way the 403 arm already does.
  if (status === 400 && /API_KEY_INVALID|API key not valid/.test(body)) return 'auth';
  if (status >= 500) return 'provider_error';
  if (status >= 400) return 'bad_request';
  // A 3xx or a 2xx that `response.ok` rejected is not a shape we have ever seen; `provider_error`
  // is the honest bucket for "the provider answered something we cannot interpret".
  return 'provider_error';
}

/**
 * The `DomainError` a classified failure becomes.
 *
 * `timed_out` maps to `UPSTREAM_TIMEOUT` because that code already exists for exactly this and
 * `resolveCandidates` already reads it; everything else is `INTERNAL`, unchanged. **The
 * classification is not carried by the code** — `07` §9's set is closed and provider-agnostic
 * (see `domain/import/provider-failure.ts`). It is carried by the cause chain:
 *
 *     DomainError  ->  ProviderLookupFailure (kind, status)  ->  the vendor's own error
 *
 * so `resolveCandidates` can read the classification, `describeCause` can log it, and
 * `DomainError.toView` still hands the client a code and two booleans.
 */
function lookupFailure(
  kind: ProviderFailureKind,
  status: number | null,
  cause: unknown,
): DomainError {
  const failure = new ProviderLookupFailure({ provider: 'google', kind, status, cause });
  return kind === 'timed_out'
    ? upstreamTimeout('Google Places searchText timed out', failure)
    : internal('Google Places searchText failed', failure);
}

/**
 * `timeoutMs` overrides the per-lookup ceiling. It exists because the timeout branch is otherwise
 * only reachable by waiting five real seconds: `AbortSignal.timeout` is a Node internal and does
 * not observe a fake clock, so a test that cannot set this number cannot assert that a slow Google
 * is classified as `timed_out` rather than as `transport`. Production passes nothing and gets
 * `GOOGLE_TIMEOUT_MS`.
 */
export function googlePlacesGateway(
  apiKey: string,
  options: { readonly timeoutMs?: number } = {},
): GooglePlacesGateway {
  const timeoutMs = options.timeoutMs ?? GOOGLE_TIMEOUT_MS;
  return {
    async searchText(params, signal) {
      // Our own ceiling, composed with the caller's cancellation rather than replacing it: whichever
      // fires first wins, and an aborted import still aborts immediately.
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetch(SEARCH_TEXT_URL, {
          method: 'POST',
          signal: AbortSignal.any([signal, timeout]),
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: params.textQuery,
            maxResultCount: params.maxResultCount,
            ...(params.regionCode !== null ? { regionCode: params.regionCode } : {}),
            ...(params.languageCode !== null ? { languageCode: params.languageCode } : {}),
          }),
        });
      } catch (cause) {
        // Which signal fired is the whole difference between "Google is slow" and "the user left",
        // and `fetch` reports both as the same rejection. `timeout.aborted` is the only thing that
        // tells them apart, so it is asked rather than inferred from the error's name — an
        // `AbortError` from the caller's signal is a cancellation, not a provider fact, and filing
        // it as `timed_out` would put a user pressing Back into the provider's error rate.
        throw lookupFailure(timeout.aborted ? 'timed_out' : 'transport', null, cause);
      }

      if (!response.ok) {
        // The body carries Google's own error object. It stops here: it is read for the two quota
        // tokens `classifyGoogleStatus` needs and then passed as a `cause`, which
        // `DomainError.toView` does not serialise — so no key, quota detail or vendor message can
        // reach a client, and `describeCause` clamps what survives into a log line.
        const body = await response.text().catch(() => '');
        throw lookupFailure(classifyGoogleStatus(response.status, body), response.status, body);
      }

      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return [];
      // A zero-result search returns `{}`, not `{ places: [] }`.
      const places = (body as { places?: unknown }).places;
      return Array.isArray(places) ? (places as readonly GooglePlaceRow[]) : [];
    },
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Mapping
 * ------------------------------------------------------------------------------------------- */

function componentText(
  components: readonly GoogleAddressComponent[] | undefined,
  type: string,
): string | null {
  const hit = components?.find((c) => c.types?.includes(type) === true);
  const text = hit?.longText ?? hit?.shortText;
  return text !== undefined && text !== '' ? text : null;
}

/**
 * `route` + `street_number`, in that order, or `null`.
 *
 * **Not `formattedAddress`.** That string carries the postcode, and `parseAddress` reads a bare
 * number as a house number — so `"Jerusalem Blvd 22, Tel Aviv-Yafo, 6802203"` risks being compared
 * on `6802203` instead of `22`, and `addressScore` treats a house-number mismatch as conclusive
 * (score 0), not as weak evidence. Building the line from components avoids inventing that failure.
 *
 * Street-then-number matches what `poi_index.address_line` holds (`בזל 42`) and what captions
 * write (`לבונטין 19`), so both providers hand the scorer the same shape.
 */
function addressLineOf(components: readonly GoogleAddressComponent[] | undefined): string | null {
  const route = componentText(components, 'route');
  if (route === null) return null;
  const number = componentText(components, 'street_number');
  return number === null ? route : `${route} ${number}`;
}

export function toResolvedPlace(row: GooglePlaceRow): ResolvedPlace | null {
  const name = row.displayName?.text;
  const lat = row.location?.latitude;
  const lng = row.location?.longitude;
  // A result with no name or no point cannot be scored or pinned. Dropping it is honest; a
  // placeholder name would enter the scorer as if it were evidence.
  if (name === undefined || name === '' || lat === undefined || lng === undefined) return null;

  return {
    provider: 'google',
    providerPlaceId: row.id,
    sourceDataset: 'google-places',
    regionId: null,
    name,
    // Text Search returns no alternate names. Empty, never a guess.
    altNames: [],
    providerCategory: row.primaryType ?? null,
    addressLine: addressLineOf(row.addressComponents),
    locality: componentText(row.addressComponents, 'locality'),
    lat,
    lng,
    datasetConfidence: GOOGLE_DATASET_CONFIDENCE,
  };
}

/**
 * What we send Google. The candidate name plus the city hint, because Text Search is a single
 * free-text field and the city is the disambiguator that makes "Rustico" mean the one in Tel Aviv.
 *
 * The address hint is deliberately **not** appended. It is a *scoring* input (`ResolveQuery`'s own
 * contract), and folding it into the query text would let a wrong or partial address suppress the
 * right venue instead of merely failing to corroborate it — recall must not depend on it.
 */
/**
 * The same query with its generic words dropped — `Tokyo ICCO` becomes `ICCO`, `Jinsei Yakitori`
 * becomes `Jinsei`. Returns `null` when there is nothing to drop or nothing distinctive left.
 *
 * **The query builder and the scorer disagreed, and this is that seam.** `SCORING.generic` already
 * knows `tokyo`, `cafe`, `restaurant` and the rest are not names — the scorer has filtered them out
 * of `tokenCoverage` since the prototype. `buildTextQuery` sent the raw string anyway, so Google
 * was ranking on words we had already decided did not identify anything.
 *
 * Measured 2026-09-01: `Tokyo ICCO London` returns **no_match at 0.754**, and `ICCO London` returns
 * `ICCO Pizza - Soho` at **0.879, confirm**. Same venue, same provider, one generic word removed.
 */
export function narrowedTextQuery(query: ResolveQuery): string | null {
  const distinctive = distinctiveTokens(query.text);
  if (distinctive.length === 0) return null;
  const narrowed = distinctive.join(' ');
  if (normalise(narrowed) === normalise(query.text)) return null;
  const city = query.cityHint?.trim();
  return city !== undefined && city !== '' ? `${narrowed}, ${city}` : narrowed;
}

export function buildTextQuery(query: ResolveQuery): string {
  const city = query.cityHint?.trim();
  return city !== undefined && city !== '' ? `${query.text}, ${city}` : query.text;
}

const HEBREW = /[\u0590-\u05FF]/u;

/**
 * The language to ask Google to answer in, or `null` to let Google decide.
 *
 * Only Hebrew is asserted, and only from the query's own script — this is the language scope the
 * product actually commits to, not a general locale system. A Latin caption about a Tel Aviv venue
 * gets Google's default, which is the right answer for whoever wrote it that way.
 */
export function languageCodeFor(query: ResolveQuery): string | null {
  return HEBREW.test(query.text) || HEBREW.test(query.cityHint ?? '') ? 'he' : null;
}

/* ------------------------------------------------------------------------------------------- *
 * The resolver
 * ------------------------------------------------------------------------------------------- */

export interface GooglePlaceResolverOptions {
  /**
   * The shared provider-response cache (`place_lookups`), or `null` for "go to the network every
   * time". See `integrations/places/lookup-cache.ts` for why it wraps the *request* here, inside
   * the resolver and above `scoreCandidates`, rather than wrapping the whole `PlaceResolver`:
   * caching a ranked result would mean every scoring change either invalidates the cache or serves
   * a ranking the current scorer would not produce.
   *
   * It is the reason this adapter is affordable at all. The Cloud project's Text Search quota is
   * 100 requests **per day across all users** (see the header); the same venue named by two
   * different TikToks is one request instead of two, and a re-import is zero.
   */
  readonly lookupStore?: PlaceLookupStore | null;
}

export function googlePlaceResolver(
  gateway: GooglePlacesGateway,
  options: GooglePlaceResolverOptions = {},
): PlaceResolver {
  const lookupStore = options.lookupStore ?? null;

  return {
    provider: 'google',

    async resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult> {
      const first = await lookupAndScore(buildTextQuery(query), query, ctx);

      // **A second look, and only ever after the first has already failed.**
      //
      // A `no_match` means the words we sent found nothing worth showing, and the commonest reason
      // measured is that they were not all name: `Tokyo ICCO London` returns no_match at 0.754
      // while `ICCO London` returns `ICCO Pizza - Soho` at 0.879. The generic word was doing the
      // ranking damage, and `SCORING.generic` already knew it was generic.
      //
      // **Gated on `no_match` rather than applied to every query, and that gate is the whole
      // safety argument.** Narrowing unconditionally was measured and rejected: `Cafe Fiori` in Tel
      // Aviv resolves to `Cafe fiori` at 1.000, and narrowed to `Fiori` it resolves to a
      // **different venue**, also at 1.000 — both auto-accept, so the change would silently move
      // which place a user saves. `Jones Family Kitchen` also got worse (0.908 -> 0.888). Only a
      // query that has already found nothing can be re-asked, so nothing that works can move.
      if (first.confidence.band !== 'no_match') return first;
      const narrowed = narrowedTextQuery(query);
      if (narrowed === null) return first;

      // **Scored against the question it asked, not the one that already failed.** Re-scoring the
      // narrowed answer against the full text was measured first and buys nothing: `Tokyo ICCO`
      // retrieves `ICCO Pizza - Soho` correctly but still scores 0.760 against "Tokyo ICCO",
      // because the 0.45 `whole` term compares full strings and "Tokyo" is in both the query and
      // nothing else. The retry then costs a lookup and moves no band.
      //
      // Judging it on the narrowed name is not laundering: `distinctiveTokens` is the scorer's own
      // notion of which words identify a venue, and `tokenCoverage` has ignored the rest since the
      // prototype. This makes `whole` agree with what `tokenCoverage` already believed.
      const narrowedName = distinctiveTokens(query.text).join(' ');
      const second = await lookupAndScore(narrowed, { ...query, text: narrowedName }, ctx);
      ctx.log.event('places.resolve_narrowed', {
        provider: 'google',
        rescued: second.confidence.band !== 'no_match',
      });
      // Never worse: the first answer stands unless the narrowed one actually cleared a band.
      return second.confidence.band === 'no_match' ? first : second;
    },
  };

  async function lookupAndScore(
    textQuery: string,
    query: ResolveQuery,
    ctx: OpCtx,
  ): Promise<ResolveResult> {
      const params: GoogleTextSearchParams = {
        textQuery,
        // `countryHint` is a country **name**, never a code: the prompt asks the model to copy the
        // caption's own location words, so it arrives as `United Kingdom`, `Czech Republic`,
        // `Israel` or `ישראל`. This line used to require `/^..$/` after an upper-case, which none
        // of those satisfy — measured across all 50 candidate rows in the local database, **not
        // one** carried a two-letter code, so `regionCode` was `null` on every real import and the
        // field was dead. Those same four values through `toCountryCode` give `GB / CZ / IL / IL`.
        regionCode: toCountryCode(query.countryHint),
        languageCode: languageCodeFor(query),
        maxResultCount: MAX_GOOGLE_RESULTS,
      };

      let rows: readonly GooglePlaceRow[];
      try {
        rows = await cachedProviderRows<GooglePlaceRow>(
          {
            store: lookupStore,
            provider: 'google',
            regionId: GLOBAL_REGION,
            // Every field of the request and nothing else — the same four the manual harness's
            // disk cache keys on, so a recorded corpus run and a production run agree on what
            // counts as the same lookup. Written as a literal so a fifth request field has to be
            // added here deliberately rather than arriving through a spread.
            request: [
              params.textQuery,
              params.regionCode,
              params.languageCode,
              params.maxResultCount,
            ],
            fetch: () => gateway.searchText(params, ctx.signal),
          },
          ctx,
        );
      } catch (cause) {
        // The one place a failed Google lookup is *observable*. Everything downstream swallows it
        // on purpose — `resolveCandidates` degrades one candidate rather than failing the import —
        // so without this line a whole import of dead lookups leaves no trace at all. That was the
        // state on 2026-08-28: four failed lookups on a real Prague import, four identical
        // `lookup_failed` records, and nothing in the server log to say which of quota, key,
        // timeout or network it had been.
        //
        // Fields are scalars from closed sets plus an HTTP status. Never the query, never the
        // candidate name, never the response body (`ports.ts`: "never a caption, never a
        // coordinate"). `status` is omitted rather than zeroed when there was no response.
        const failure = providerFailureOf(cause);
        ctx.log.event('places.resolve_failed', {
          provider: 'google',
          classification: failure?.kind ?? 'transport',
          ...(failure?.status != null ? { status: failure.status } : {}),
          cached: lookupStore !== null,
        });

        // `PlaceResolver` never leaks a provider error — but a `DomainError` is not a provider
        // error, it is this layer's own output, and re-wrapping it used to bury the cause chain
        // one link deeper and flatten `UPSTREAM_TIMEOUT` into `INTERNAL`. Pass it through; convert
        // only what is genuinely foreign (a store failure from `cachedProviderRows`, say).
        throw cause instanceof DomainError
          ? cause
          : internal('Google Places searchText failed', cause);
      }

      const candidates = rows
        .map(toResolvedPlace)
        .filter((place): place is ResolvedPlace => place !== null);

      ctx.log.event('places.resolve', {
        provider: 'google',
        results: rows.length,
        scored: candidates.length,
      });

      // `no_match` on an empty list is `scoreCandidates`' own construction, so there is one path to
      // it rather than two. `GLOBAL_REGION` rather than `[]`: see the header.
      return scoreCandidates(query, candidates, [GLOBAL_REGION], 'exhaustive-search');
  }
}
