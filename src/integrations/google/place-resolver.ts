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
 */

import { internal } from '@/domain/errors';
import type { OpCtx, PlaceResolver } from '@/domain/ports';
import { scoreCandidates } from '@/domain/places/score';
import type { RegionId, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';

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

export function googlePlacesGateway(apiKey: string): GooglePlacesGateway {
  return {
    async searchText(params, signal) {
      const response = await fetch(SEARCH_TEXT_URL, {
        method: 'POST',
        signal,
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

      if (!response.ok) {
        // The body carries Google's own error object. It stops here: `internal()`'s cause is not
        // serialised into the wire view (`DomainError.toView`), so no key, quota detail or vendor
        // message can reach a client.
        throw internal(
          `Google Places searchText failed (${String(response.status)})`,
          await response.text().catch(() => ''),
        );
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

export function googlePlaceResolver(gateway: GooglePlacesGateway): PlaceResolver {
  return {
    provider: 'google',

    async resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult> {
      const country = query.countryHint?.trim().toUpperCase();

      let rows: readonly GooglePlaceRow[];
      try {
        rows = await gateway.searchText(
          {
            textQuery: buildTextQuery(query),
            regionCode: country !== undefined && country.length === 2 ? country : null,
            languageCode: languageCodeFor(query),
            maxResultCount: MAX_GOOGLE_RESULTS,
          },
          ctx.signal,
        );
      } catch (cause) {
        // `PlaceResolver` never leaks a provider error. A gateway that already threw `internal`
        // is re-wrapped harmlessly; anything else is converted here.
        throw internal('Google Places searchText failed', cause);
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
    },
  };
}
