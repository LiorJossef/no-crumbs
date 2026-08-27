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
 * ## What the derivation deliberately does not do
 *
 * It does not invent a coordinate. A candidate the model could not place gets `kind: 'skipped'`
 * rather than a city-centre fallback: the pins are already the least trustworthy thing in the
 * product (measured: identical captions yield coordinates ~150-220 m apart, and the one real
 * import checked against OpenStreetMap landed 477 m from the venue), and a fabricated coordinate
 * would make that worse while looking the same.
 *
 * ## What it does not cover
 *
 * The three columns migration `0019` added to `saved_places` — `tags`, `why_go`, `dishes` — are
 * derived by `saved-place-enrichment.ts`, not here. Different table, different writer, different
 * privilege: see that file's header. Nothing in this file changed for extraction schema v2; see
 * `extractedReason` below for the one field that was proposed to and deliberately did not.
 *
 * It also leaves `resolutionScore` null. `places.resolution_score` documents a real
 * `PlaceResolver` score (`ports.ts`); the model's own `modelConfidence` is a different quantity
 * measured on a different thing, and the retired `datasetConfidence: item.resolutionScore ?? 0.5`
 * at the old confirm seam is exactly the kind of invented number this field must not collect.
 */

import { llmGuessProviderPlaceId } from './llm-guess-place-id';
import { toCountryCode } from '../places/country-code';
import type { PlaceCandidate } from '../types';

/**
 * Every column value a save writes, all of it server-derived. Field names mirror
 * `ConfirmPlaceInput`/`ResolvedPlace` (`ports.ts`, `types.ts`) so the store adapter passes them
 * through without a second mapping layer to keep in step.
 */
export interface DerivedPlaceSave {
  /** Fixed for this path: the coordinate came from the model, not a gazetteer. */
  readonly provider: 'llm_guess';
  readonly sourceDataset: 'llm-guess';
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
  /** Reserved for a provider's own category string; this path has no provider. */
  readonly providerCategory: null;
  readonly addressLine: string | null;
  readonly locality: string | null;
  /** ISO-3166-1 alpha-2, normalised from the caption's country name. */
  readonly countryCode: string | null;
  readonly lat: number;
  readonly lng: number;
  /** Always null on this path — see the header. */
  readonly resolutionScore: null;
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
 */
export function derivePlaceSave(candidate: PlaceCandidate): CandidatePlaceOutcome {
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
      category: candidate.categoryHint,
      providerCategory: null,
      addressLine: blankToNull(candidate.addressHint),
      locality: blankToNull(candidate.cityHint),
      countryCode: toCountryCode(candidate.countryHint),
      lat: candidate.coordinates.lat,
      lng: candidate.coordinates.lng,
      resolutionScore: null,
      extractedReason: blankToNull(candidate.evidence),
    },
  };
}
