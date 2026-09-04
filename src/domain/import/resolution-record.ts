/**
 * What the server remembers about resolving one extracted candidate, and how a confirm turns it
 * back into place facts.
 *
 * ## Why this exists at all, and why it is a *stored* thing
 *
 * Until TLV-RESOLVE-T3 there was no `PlaceResolver` on the live import path, so every coordinate
 * the product saved was the model's own guess — measured 65–470 m out, and 541 m apart between two
 * runs of the same caption. The resolver now runs during `/api/imports/probe`. But the probe and
 * the confirm are two separate HTTP requests, so the shortlist has to survive the gap.
 *
 * It survives **on the server**, in `extractions.candidates` (mirrored into `imports.candidates`),
 * and that is not an implementation preference — it is the security property `candidate-place.ts`'s
 * header was written to defend. `/api/imports/confirm` once took `name`/`lat`/`lng` from the
 * request body and one authenticated POST could rename and relocate a place other users had saved.
 * The fix was a change of authority: the browser may say only **which** candidate, and now **which
 * option** of a stored shortlist, it wants. It may never say *what* that option is.
 *
 * Both storage locations are server-write-only, and that was checked rather than assumed:
 * `authenticated` holds `SELECT` and nothing else on `extractions`, and on `imports` it holds
 * `UPDATE` on exactly two columns — `status` and `completed_at`. `imports.candidates` and
 * `extractions.candidates` carry no `INSERT`/`UPDATE` grant for the browser at all, so a resolution
 * record can only ever have been written by a service-role request that did the resolving.
 *
 * ## Why the whole `ResolveResult` is stored, not a flattened "winner"
 *
 * `deriveResolution` (`pipeline.ts`) is the one mapping from a resolver band to a UX status —
 * `preselect → resolved`, `confirm → ambiguous`, `no_match → unresolved` — and `domain/types.ts`
 * says outright that the derivation drops evidence and should therefore happen as late as possible.
 * Storing the derived form would bake that loss into the row: an `ambiguous` candidate keeps its
 * `ResolvedPlace[]` but loses every option's score, so a user picking option 2 would have no
 * honest `resolution_score` to write and we would be back to inventing one. Storing the
 * `ResolveResult` keeps the scores, and the derivation is re-run at read time from the same
 * function the streamed pipeline uses.
 *
 * ## What a `null` record means
 *
 * "This candidate was never put to the resolver" — an extraction row written before this change
 * (there are six on the local database), or a candidate past `MAX_CANDIDATES`. It is deliberately
 * distinct from `{ kind: 'unresolved', reason: 'no_match' }`, which means we looked and found
 * nothing. Reporting "we looked" for "we could not look" is the uncertainty-into-certainty move the
 * working agreement forbids.
 *
 * ## The degraded save, and how it gets upgraded later
 *
 * Owner ruling, 2026-08-28: *resolution must never dead-end.* When Google is out of quota or
 * unreachable, a candidate that carries the model's own coordinate is still saved — as
 * `provider: 'llm_guess'`, `sourceDataset: 'llm-guess'`, `resolutionScore: null`
 * (`candidate-place.ts`'s unchanged second branch). The fallback never fabricates a canonical
 * provider identity and never borrows a provider score. **`resolution_score` stays `null`, not
 * `0`**: the column's CHECK is `between 0 and 1` on `scoreCandidates`' own scale, so `0` is a real
 * measurement meaning "we ranked it and it ranked worst". Nothing ranked this. `null` is the only
 * value that says so, and it is already what "no resolver score exists" means everywhere else.
 *
 * What is new here is that the *reason* survives. A `failed` record now carries a classification
 * rather than a uniform `lookup_failed`, so an `llm_guess` row written during a quota outage is
 * distinguishable, after the fact, from one written because the venue genuinely has no match.
 *
 * **The upgrade path, written down because the upgrader is not built yet.** Everything it needs
 * already exists; no column and no migration are owed:
 *
 *  1. *Find the rows.* `places p join place_provider_refs r on r.place_id = p.id` where
 *     `r.provider = 'llm_guess'`. `places.source_dataset = 'llm-guess'` and
 *     `resolution_score is null` corroborate. Sixteen such refs over fifteen places on the local
 *     database as of 2026-08-28.
 *  2. *Recover what was searched for — from the extraction, not from the id.* `provider_place_id`
 *     is `llm:<placeNameKey(rawName)>|<placeNameKey(cityHint)>|<placeNameKey(countryHint)>`
 *     (`llm-guess-place-id.ts`), and `placeNameKey` strips separators, so `ha kosem` and
 *     `hakosem` both key as `hakosem`. That is exactly right for **dedup** and wrong for
 *     **retrieval**: the key is not a query, and re-running the resolver on it would search for a
 *     string no caption ever contained. Recompute it over `extractions.candidates` instead and use
 *     it as a **join key** back to the originating candidate — reachable as
 *     `saved_places → saved_place_sources → sources → extractions` — which carries the verbatim
 *     `rawName`, `nameVariants`, `addressHint`, `cityHint` and `countryHint` that
 *     `buildResolveQuery` actually needs.
 *  3. *Read this record to know which rows deserve a lookup.* A candidate stored as
 *     `{ kind: 'failed', reason: 'quota_exhausted' }` was never given a fair chance and should be
 *     re-run first. One stored as `{ kind: 'answered', … }` whose band was `no_match` was looked up
 *     properly and is a much weaker upgrade candidate. Before this change every failure was an
 *     undifferentiated `lookup_failed` and that ordering was not derivable at all.
 *  4. *Write the upgrade, and be able to **merge**.* This is the part a naive design gets wrong.
 *     `place_provider_refs` holds aliases, many per place (migration `0005`), so the easy case is
 *     an added `google` ref on the same `places` row plus a refresh of the provider-owned columns.
 *     But two `llm_guess` rows frequently turn out to be **one** Google place: four of the sixteen
 *     local refs are duplicate pairs — `Tokii`/`Tokii London` 85 m apart, `La Nonna`/`La Nonna
 *     Brixton` 91 m, plus `Kiaans`/`Kiaans Tooting` and `Sycamore Vino Cucina`/`Sycamore Cucina &
 *     Bar`. `resolve_place`'s near-duplicate guard misses all four (its radius is 75 m) and
 *     widening it cannot fix them, because these coordinates are the model's own and drift a
 *     median 327 m between two runs of the same caption — a distance guard cannot deduplicate
 *     points noisier than its own radius. The canonical Google place id **is** the merge signal
 *     the geometry cannot provide, so the upgrader must handle "these two rows are one place":
 *     `places.merged_into_place_id` is the tombstone that already exists for it, and reads follow
 *     the chain. An upgrader that can only relabel one row in place leaves the duplicates behind
 *     and is not worth building.
 *
 * The one thing an upgrader must not do is silently replace a coordinate a user has been looking
 * at. That is a product decision (`working-agreement.md` §7), not this module's.
 */

import { z } from 'zod';

import { offerableShortlist } from './offerable-shortlist';
import { deriveResolution } from './pipeline';
import type { RankedPlace, ResolveResult } from '../types';

/* ------------------------------------------------------------------------------------------- *
 * The persisted shape
 * ------------------------------------------------------------------------------------------- */

/**
 * Mirrors `ResolvedPlace` (`domain/types.ts`) field for field. It is restated as a schema rather
 * than derived from the interface because this is a **parse of untrusted stored JSON**: a `jsonb`
 * column is boundary data like any provider response, and the domain must only ever see values a
 * schema admitted. `provider`/`sourceDataset` keep their closed unions here for the same reason.
 *
 * **These two unions must list every value `PlaceProvider`/`SourceDataset` admit.** They are closed
 * on purpose, but a value the resolver can genuinely return and this schema cannot parse does not
 * fail loudly — `chooseResolvedPlace` sees `null` and the confirm step silently saves the model's
 * own guess instead. That is exactly what happened when `'google'` was added to `PlaceProvider` and
 * not here: the review screen showed `Oscar's @ נחלת בנימין 68` and the row written to `places`
 * was `llm-guess` at the model's coordinate, with no error anywhere. Verified by importing a real
 * TikTok and reading the row back, 2026-08-28.
 */
const StoredResolvedPlaceSchema = z.object({
  provider: z.enum(['overture', 'nominatim', 'llm_guess', 'google']),
  providerPlaceId: z.string().min(1),
  sourceDataset: z.enum(['overture-places', 'osm-nominatim', 'llm-guess', 'google-places']),
  regionId: z.string().nullable(),
  name: z.string().min(1),
  altNames: z.array(z.string()),
  providerCategory: z.string().nullable(),
  addressLine: z.string().nullable(),
  locality: z.string().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  datasetConfidence: z.number().min(0).max(1),
});

const StoredRankedPlaceSchema = z.object({
  place: StoredResolvedPlaceSchema,
  score: z.number().min(0).max(1),
  nameScore: z.number(),
  tokenCoverage: z.number(),
  categoryScore: z.union([z.literal(0), z.literal(1)]),
});

const StoredConfidenceSchema = z.object({
  band: z.enum(['preselect', 'confirm', 'no_match']),
  score: z.number(),
  /** `null` is a real, load-bearing value — an unmeasured margin, not a perfect one (`10` §8). */
  margin: z.number().nullable(),
});

const StoredResolveResultSchema = z.object({
  shortlist: z.array(StoredRankedPlaceSchema),
  confidence: StoredConfidenceSchema,
  regionsSearched: z.array(z.string()),
  candidatesPrefiltered: z.number().int().min(0),
});

/**
 * Why a lookup produced no answer, as it sits in stored `jsonb`.
 *
 * **Widened, never re-lettered.** Rows written before 2026-08-28 hold `lookup_failed` or
 * `timed_out` and must keep parsing forever — an `extractions.candidates` row that fails this
 * schema does not fail loudly, it reads back as `null`, and `chooseResolvedPlace` then silently
 * saves the model's own guess instead. That is not hypothetical: it is exactly what happened when
 * `'google'` was added to `PlaceProvider` and not to `StoredResolvedPlaceSchema`. So the first two
 * members are load-bearing legacy and the rest are additive.
 *
 *  - `lookup_failed` — the honest floor: something failed and the adapter offered no
 *    classification. Every pre-2026-08-28 row, and any provider that does not classify.
 *  - `timed_out` — legacy spelling of the classification of the same name; the two are the same
 *    fact and deliberately share one value rather than acquiring a synonym.
 *  - the remaining five are `ProviderFailureKind` verbatim (`provider-failure.ts`).
 *
 * `failed()` below is what keeps that last sentence true rather than hopeful: it takes a
 * `StoredFailureReason`, `resolveCandidates` hands it a `ProviderFailureKind`, and a classification
 * that is not also a stored reason stops the build at that call site.
 */
export const STORED_FAILURE_REASONS = [
  'lookup_failed',
  'timed_out',
  'quota_exhausted',
  'auth',
  'bad_request',
  'provider_error',
  'transport',
] as const;

export type StoredFailureReason = (typeof STORED_FAILURE_REASONS)[number];

/**
 * One candidate's resolution outcome as it sits in `jsonb`.
 *
 * The two non-`answered` variants are the reasons `runImport` already models (`pipeline.ts`'s
 * stage C): a lookup that failed in transport degrades **one candidate**, never the import, and a
 * candidate past `MAX_CANDIDATES` is kept and visible rather than silently dropped.
 */
export const StoredResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answered'), result: StoredResolveResultSchema }),
  z.object({ kind: z.literal('failed'), reason: z.enum(STORED_FAILURE_REASONS) }),
  z.object({ kind: z.literal('capped') }),
]);

/**
 * The domain-side shape. Declared rather than `z.infer`red, because the inferred type has mutable
 * arrays and this must be exactly the `ResolveResult` the resolver returns — otherwise storing a
 * fresh result needs a copy or a cast, and either one is a place for the two shapes to drift. The
 * schema above is the *validator* for stored JSON; this is the type the rest of the code speaks.
 * They are kept in step by `StoredResolutionSchema`'s output being assignable to this — asserted
 * by the compiler at `parseResolution`'s return, not by a comment.
 */
export type StoredResolution =
  | { readonly kind: 'answered'; readonly result: ResolveResult }
  | { readonly kind: 'failed'; readonly reason: StoredFailureReason }
  | { readonly kind: 'capped' };

/** Convenience constructor so the route never hand-builds the discriminant. */
export function answered(result: ResolveResult): StoredResolution {
  return { kind: 'answered', result };
}

/**
 * The failed counterpart, and the seam that ties the adapter's classification vocabulary to the
 * stored one. `resolveCandidates` calls this with a `ProviderFailureKind`; if a future
 * classification is not also a `StoredFailureReason`, this call stops compiling instead of
 * silently writing a value the Zod schema will later refuse to parse.
 */
export function failed(reason: StoredFailureReason): StoredResolution {
  return { kind: 'failed', reason };
}

/* ------------------------------------------------------------------------------------------- *
 * Reading it back
 * ------------------------------------------------------------------------------------------- */

/**
 * Which shortlist entry a confirm should write, given the stored record and the caller's optional
 * choice. **The only place the band policy is applied**, and it deliberately does not re-implement
 * the band→status mapping: it calls `deriveResolution`.
 *
 * The policy, and the reason for each arm:
 *
 *  - `resolved` (band `preselect`) — auto-accept the top entry. Measured on 14 adjudicated Tel Aviv
 *    cases: every `preselect` result was correct, zero false auto-accepts. That is what the band is
 *    for, and refusing to use it would leave the product on model guesses.
 *  - `ambiguous` (band `confirm`) — **no auto-accept.** The shortlist is real but the margin says
 *    we cannot tell the entries apart, and silently taking the top one is precisely the
 *    uncertainty-into-certainty failure this product cannot afford. Answered as `'choose'`: the
 *    caller may pass an `optionIndex` and get that entry, and with no choice the save falls back to
 *    the existing `llm_guess` path rather than inventing a match.
 *  - `unresolved`, `failed`, `capped`, and a `null` record — nothing to write; the `llm_guess` path
 *    is unchanged.
 *
 * An `optionIndex` that does not address a stored entry is `'out_of_range'` rather than a silent
 * clamp, because a clamp would turn "the client asked for the wrong thing" into "the server saved a
 * different place than the user picked".
 */
export type ResolutionChoice =
  | { readonly kind: 'use'; readonly ranked: RankedPlace }
  /** Options exist but none is authoritative; the caller may pick one. No choice ⇒ no Overture save. */
  | { readonly kind: 'choose'; readonly options: readonly RankedPlace[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'out_of_range' };

export function chooseResolvedPlace(
  resolution: StoredResolution | null,
  optionIndex: number | null,
): ResolutionChoice {
  if (resolution === null || resolution.kind !== 'answered') {
    // An explicit choice against a record with no options is a client bug, not a silent no-op.
    return optionIndex === null ? { kind: 'none' } : { kind: 'out_of_range' };
  }

  const { shortlist } = resolution.result;
  const { status } = deriveResolution(resolution.result);

  if (optionIndex !== null) {
    const picked = shortlist[optionIndex];
    if (picked === undefined) return { kind: 'out_of_range' };
    // A pick is honoured under `resolved` too: the top entry is a default, not a verdict, and a
    // user who read the shortlist and chose the second entry is better evidence than the scorer.
    return status === 'unresolved' ? { kind: 'out_of_range' } : { kind: 'use', ranked: picked };
  }

  if (status === 'resolved') {
    const top = shortlist[0];
    return top === undefined ? { kind: 'none' } : { kind: 'use', ranked: top };
  }
  if (status === 'ambiguous') {
    // The rows the screen actually offered, not the whole stored shortlist (E-T1). An explicit
    // `optionIndex` above is still checked against the full stored list: a pick that was on screen
    // when it was made must not become `out_of_range` because the cut moved underneath it.
    return { kind: 'choose', options: offerableShortlist(shortlist) };
  }
  return { kind: 'none' };
}
