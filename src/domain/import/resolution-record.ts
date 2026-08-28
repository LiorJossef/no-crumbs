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
 */

import { z } from 'zod';

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
 * One candidate's resolution outcome as it sits in `jsonb`.
 *
 * The two non-`answered` variants are the reasons `runImport` already models (`pipeline.ts`'s
 * stage C): a lookup that failed in transport degrades **one candidate**, never the import, and a
 * candidate past `MAX_CANDIDATES` is kept and visible rather than silently dropped.
 */
export const StoredResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answered'), result: StoredResolveResultSchema }),
  z.object({ kind: z.literal('failed'), reason: z.enum(['lookup_failed', 'timed_out']) }),
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
  | { readonly kind: 'failed'; readonly reason: 'lookup_failed' | 'timed_out' }
  | { readonly kind: 'capped' };

/** Convenience constructor so the route never hand-builds the discriminant. */
export function answered(result: ResolveResult): StoredResolution {
  return { kind: 'answered', result };
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
    return { kind: 'choose', options: shortlist };
  }
  return { kind: 'none' };
}
