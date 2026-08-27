/**
 * Turns one stored extraction candidate into the exact set of place facts a save needs — on the
 * server, from the server's own copy of the extraction, and never from anything the browser sent.
 *
 * ## Why this file exists
 *
 * `/api/imports/confirm` used to accept `provider`, `providerPlaceId`, `name`, `lat` and `lng`
 * straight out of the request body and hand them to `resolve_place` on a **service-role** client.
 * `resolve_place`'s step 1 refreshes provider-owned columns whenever the matched row's
 * `provider_fetched_at` is older than 30 days:
 *
 *     update places set name = p_name, lat = p_lat, lng = p_lng where id = v_place_id;
 *
 * `places` rows are shared across users (`saved_places` is the per-user overlay), and nothing in
 * that path checked who was asking. So one authenticated request naming an existing
 * `(provider, provider_place_id)` could rename and relocate a place other users had saved.
 * Confirmed on the local database before this change: a single POST renamed a Tel Aviv café to
 * "ATTACKER RENAMED THIS" and moved it to the Eiffel Tower.
 *
 * The fix is not a validation rule — no schema can tell a truthful `lat` from a malicious one. It
 * is a change of authority: the client may now say only **which candidate** of a **stored
 * extraction it can prove it owns**, plus its own note. Every fact that reaches `places` is derived
 * here, from the extraction row the server wrote itself.
 *
 * ## Two provenances, and the one that is new
 *
 * Since TLV-RESOLVE-T3 this function takes a second argument: the `RankedPlace` the stored
 * `PlaceResolver` result selected for this candidate, or `null`. It produces one of exactly two
 * kinds of save, and the difference between them is the whole point of the provenance columns:
 *
 *  - **Resolved** — the facts come from the Overture row: `provider: 'overture'`,
 *    `sourceDataset: 'overture-places'`, the GERS id, the POI's own name, category, address,
 *    locality and coordinates, plus a **real** `resolutionScore` from the scorer. Measured on the
 *    caption mention "HaKosem": the Overture row is 11 m from the real venue, where the model's own
 *    guess for the same caption was 555 m and 483 m out on two runs and 541 m from itself.
 *  - **Unresolved** — unchanged `llm_guess` behaviour, down to the byte. `provider: 'llm_guess'`,
 *    `sourceDataset: 'llm-guess'`, the model's coordinate, `resolutionScore: null`. This path is
 *    not a legacy remnant to be deleted once the resolver works: Overture covers one loaded region,
 *    "no match" is a frequent and honest answer, and a saved place with a model coordinate and an
 *    `llm_guess` mark is *more* useful than no place at all precisely because the mark says what it
 *    is.
 *
 * Nothing in between exists. There is no path that takes an Overture name with a model coordinate,
 * or a model name with an Overture score — that mixture would make `places.provider` a lie about
 * the row it labels, and the extracted-vs-inferred distinction is the one invariant the whole
 * product rests on.
 *
 * ## What the derivation deliberately does not do
 *
 * It does not invent a coordinate. A candidate the model could not place **and** the resolver could
 * not match gets `kind: 'skipped'` rather than a city-centre fallback: the model's own pins are the
 * least trustworthy thing in the product (measured: identical captions yield coordinates ~150-220 m
 * apart, and the one real import checked against OpenStreetMap landed 477 m from the venue), and a
 * fabricated coordinate would make that worse while looking the same. Note the *and*: a resolved
 * candidate is saveable even when the model offered no coordinate of its own, which is the case
 * where this change turns a skip into a real place.
 *
 * ## What it does not cover
 *
 * The three columns migration `0019` added to `saved_places` — `tags`, `why_go`, `dishes` — are
 * derived by `saved-place-enrichment.ts`, not here. Different table, different writer, different
 * privilege: see that file's header. Nothing in this file changed for extraction schema v2; see
 * `extractedReason` below for the one field that was proposed to and deliberately did not.
 *
 * ## `resolutionScore`, and a reason that has expired
 *
 * This file used to leave `resolutionScore` unconditionally null, on the stated grounds that
 * "`places.resolution_score` documents a real `PlaceResolver` score (`ports.ts`)" and we had no
 * `PlaceResolver`. **We have one now**, so the field is populated on the resolved path with
 * `RankedPlace.score` — the scorer's own `0.72·nameScore + 0.18·categoryScore + 0.10·datasetConfidence`,
 * in the same 0..1 range as the column's CHECK. What has *not* changed is the rule the old comment
 * was really protecting: the model's `modelConfidence` is a different quantity measured on a
 * different thing and still never reaches this column, and the retired
 * `datasetConfidence: item.resolutionScore ?? 0.5` at the old confirm seam is still exactly the
 * kind of invented number this field must not collect. On the `llm_guess` path it stays null,
 * because there is still no score there to write.
 */

import { llmGuessProviderPlaceId } from './llm-guess-place-id';
import { toCountryCode } from '../places/country-code';
import type { PlaceCandidate, PlaceProvider, RankedPlace, RegionId, SourceDataset } from '../types';

/**
 * Every column value a save writes, all of it server-derived. Field names mirror
 * `ConfirmPlaceInput`/`ResolvedPlace` (`ports.ts`, `types.ts`) so the store adapter passes them
 * through without a second mapping layer to keep in step.
 */
export interface DerivedPlaceSave {
  /**
   * `'overture'` when a stored `PlaceResolver` result was accepted for this candidate,
   * `'llm_guess'` when the coordinate came from the model rather than a gazetteer. This pair of
   * columns *is* the extracted-vs-inferred distinction as it reaches the database.
   */
  readonly provider: Extract<PlaceProvider, 'overture' | 'llm_guess'>;
  readonly sourceDataset: Extract<SourceDataset, 'overture-places' | 'llm-guess'>;
  /** Stable dedup identity, recomputed here rather than accepted from the caller. */
  readonly providerPlaceId: string;
  /**
   * The model's real-world identification when it has one, else the caption's verbatim fragment.
   * `rawName` is not lost by this choice — `extractedReason` below carries the verbatim caption
   * text this candidate came from, which is the provenance that matters and is checkable against
   * the caption.
   */
  readonly name: string;
  /** The full seven-value extracted vocabulary — no narrowing (see `domain/types.ts`). */
  readonly category: string | null;
  /** Overture's `categories.primary`, verbatim, on the resolved path; `null` on the model path,
   *  which has no provider to have a category of its own. Never our own taxonomy — that is
   *  `category` above, and conflating the two is how a provider string ends up being filtered on. */
  readonly providerCategory: string | null;
  readonly addressLine: string | null;
  readonly locality: string | null;
  /** ISO-3166-1 alpha-2, normalised from the caption's country name. */
  readonly countryCode: string | null;
  readonly lat: number;
  readonly lng: number;
  /** `poi_index.region_id` for a resolved place; null for a model guess, which belongs to no
   *  region. Carried because `ResolvedPlace` requires it, not because `resolve_place` stores it. */
  readonly regionId: RegionId | null;
  /** `poi_index.dataset_confidence` for a resolved place. **0, not 0.5**, on the model path: this
   *  is a field the scorer weights, and a plausible-looking default here is one wiring change away
   *  from silently crediting every model guess. */
  readonly datasetConfidence: number;
  /** The scorer's real 0..1 score on the resolved path; null on the model path — see the header. */
  readonly resolutionScore: number | null;
  /**
   * The extractor's verbatim caption fragment for this candidate, written to
   * `saved_places.extracted_reason` (migration 0017). This is the answer to "why do we think this
   * TikTok meant this place", and it is checkable: `ExtractionResultSchema` requires `evidence` to
   * be copied from the caption, so a fabrication is a substring test rather than a judgement.
   *
   * **Deliberately still `evidence` under schema v2, and the reasoning is worth keeping.**
   * RICH-EXT-T3 was originally briefed to remap this to `whyGo.groundedIn` — the caption words that
   * license the model's `why_go` sentence — on the grounds that the column's name has always
   * claimed to hold a *reason*, while `evidence` is the fragment the *name* came from (measured on
   * the 20 local saved rows: 7 empty, 2 reading as the venue's own name). That ruling was
   * **reversed on 2026-08-27 after security review**, and the reason is not about semantics:
   *
   *   - `extracted_reason` is still `INSERT, SELECT` for `authenticated` (`current-state.md` §3.4,
   *     the scar 0017 left and 0019's header opens with). A browser can POST any value it likes
   *     straight to `/saved_places` and it lands verbatim.
   *   - Holding a paraphrase, a forged value is a user lying to themselves. Holding a **verbatim
   *     caption quote**, rendered as a quotation beside a real `source_url` and a real creator
   *     handle, a forged value is fabricated words attributed to a named third party by our own
   *     interface.
   *   - And it would invert the protection: `why_go` — the model's soft synthesis — would sit
   *     behind `service_role` (0019), while the *evidence licensing it* stayed browser-writable.
   *     Exactly backwards for a product whose central invariant is the extracted-vs-inferred
   *     distinction.
   *
   * So `groundedIn` is **not persisted at all**. It is a gate, not a column: `extraction/
   * grounding.ts` uses it to null any `whyGo` whose quote is absent from the caption or merely
   * echoes the venue's own name, and it has already done that work before storage is reached. It
   * survives in `extractions.candidates` for anyone auditing a claim. Moving this column to it is a
   * separate change that must land *with* the grant closure — moving `extracted_reason` out of
   * `save_place`'s INSERT list and revoking it — on its own branch.
   */
  readonly extractedReason: string | null;
}

/**
 * A candidate either yields a full set of place facts or is skipped with a stated reason. There is
 * no third outcome that saves something partial — `places.lat`/`lng` are `not null`, and a save
 * with an invented coordinate is the failure mode this whole file exists to prevent.
 */
export type CandidatePlaceOutcome =
  | { readonly kind: 'save'; readonly place: DerivedPlaceSave }
  | { readonly kind: 'skipped'; readonly reason: 'no_coordinates' };

/** Trims to null so a whitespace-only model field never reaches a column as `' '`. */
function blankToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Note there is no `schemaVersion` parameter, and there deliberately is not one: nothing this
 * function derives differs between extraction schema v1 and v2. The v2 fields all land on
 * `saved_places` through `saved-place-enrichment.ts`, so a confirm against a pre-v2 extraction id
 * produces a byte-identical `places` row to the one it produced yesterday.
 *
 * `resolved` is the entry `chooseResolvedPlace` selected from the **stored** resolver result
 * (`resolution-record.ts`), or `null`. It is a `RankedPlace` rather than a bare `ResolvedPlace`
 * because the score travels with it: a resolved save without its score would be a place we could
 * not later say how confident we were about, and `places.resolution_score` exists precisely so
 * that question has an answer.
 *
 * It defaults to `null`, so every existing caller keeps the exact `llm_guess` behaviour it had.
 */
export function derivePlaceSave(
  candidate: PlaceCandidate,
  resolved: RankedPlace | null = null,
): CandidatePlaceOutcome {
  const extractedReason = blankToNull(candidate.evidence);
  // Our own seven-value taxonomy, from the extraction, on both paths. Overture's own string is a
  // different vocabulary and lands in `providerCategory`; deriving `category` from it would mean a
  // resolved place and a guessed place could not be filtered by the same query.
  const category = candidate.categoryHint;
  const countryCode = toCountryCode(candidate.countryHint);

  if (resolved !== null) {
    const { place } = resolved;
    return {
      kind: 'save',
      place: {
        provider: 'overture',
        sourceDataset: 'overture-places',
        // Overture's GERS id, verbatim. `resolve_place` takes it as both `p_provider_place_id` and
        // `p_source_dataset_id` — for Overture they are documented to be the same string.
        providerPlaceId: place.providerPlaceId,
        // The POI's own name, not the model's guess at it. This is the point of resolving: the
        // gazetteer knows what the venue is called and the caption only knows what it was called.
        name: place.name,
        category,
        providerCategory: place.providerCategory,
        addressLine: place.addressLine,
        locality: place.locality,
        // Still the caption's, because `ResolvedPlace` carries no country: `poi_index` scopes by
        // region, and the region's country lives on `poi_regions`, which the resolver does not
        // return per row. Reading it there is a later, separate improvement; guessing it from the
        // locality string would be exactly the fabrication this file refuses.
        countryCode,
        lat: place.lat,
        lng: place.lng,
        regionId: place.regionId,
        datasetConfidence: place.datasetConfidence,
        resolutionScore: resolved.score,
        extractedReason,
      },
    };
  }

  if (candidate.coordinates === null) {
    return { kind: 'skipped', reason: 'no_coordinates' };
  }

  const name = blankToNull(candidate.identifiedName) ?? candidate.rawName;

  return {
    kind: 'save',
    place: {
      provider: 'llm_guess',
      sourceDataset: 'llm-guess',
      providerPlaceId: llmGuessProviderPlaceId(candidate),
      name,
      category,
      providerCategory: null,
      addressLine: blankToNull(candidate.addressHint),
      locality: blankToNull(candidate.cityHint),
      countryCode,
      lat: candidate.coordinates.lat,
      lng: candidate.coordinates.lng,
      regionId: null,
      datasetConfidence: 0,
      resolutionScore: null,
      extractedReason,
    },
  };
}
