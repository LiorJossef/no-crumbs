/**
 * The strings the import review screen puts on a candidate card, as pure functions.
 *
 * They live in `domain/` rather than inline in the component for one reason that matters more than
 * tidiness: **the card must show the string that will actually be saved.** The review screen used
 * to title each card with `rawName` while `derivePlaceSave` wrote `identifiedName ?? rawName`, so a
 * card reading "kolamba" saved a place called "Kolamba". "Nothing is saved without an explicit
 * human confirm" is not satisfied by confirming something the human was not shown. Keeping the
 * title next to the derivation, both testable, is what stops that drifting apart again.
 *
 * The other job here is the product's trust story, expressed in plain language rather than a
 * legend the user has to learn:
 *
 *  - the **title** is our best answer, which may be the model's inference;
 *  - the **provenance line** always says where that name came from, in the caption's own words.
 *
 * There is deliberately no confidence number anywhere in this file. `modelConfidence` is the
 * model's opinion of itself, and it has been measured against reality: coordinates from this path
 * land 65-470 m from the venue while the model reports 95%. Rendering that as a percentage, a bar,
 * or a High/Medium/Low band derived from it would dress an unreliable number as a finding. What
 * replaces it is a single honest sentence at screen level (`LOCATION_CAVEAT`) and two words per
 * card (`locationLine`).
 */

import { isHashtagOnlyEvidence } from '@/domain/extraction/plausibility';
import type { PlaceCandidate } from '../types';
import { PRODUCT_CATEGORY_LABEL, isProductCategory } from '../places/product-category';

/** The one thing this screen says about location accuracy, said once rather than per card —
 *  because our honest position is identical on every candidate. "A street or two" is the measured
 *  range (65-470 m), not a euphemism. */
export const LOCATION_CAVEAT =
  'We work out pins from what the caption said, so they can be a street or two off.';

/**
 * What the caption gave us to call this place: the model's identification, or the caption's own
 * words when it made none.
 *
 * **This is not necessarily what gets saved.** When the resolver matched the candidate,
 * `derivePlaceSave` writes the provider's name instead, and the card is titled with that — see
 * `savedPlaceName` in `ui/import/candidate-resolution-view.ts`. This function is the fallback for
 * the unresolved path and the input to `candidateProvenance`.
 */
export function candidateTitle(candidate: PlaceCandidate): string {
  const identified = candidate.identifiedName?.trim();
  return identified !== undefined && identified !== '' ? identified : candidate.rawName;
}

/**
 * Where the title came from. Exactly two variants, both true on every candidate, neither of them
 * a grade:
 *
 *  - the title is our inference → hand back the caption's own words so they can be checked;
 *  - the title *is* the caption's words → say so.
 *
 * Deliberately not `Likely: …`, which hedges the name without saying where it came from — the
 * opposite of what this line is for.
 *
 * `shownTitle` is the title the card actually rendered, which since `savedPlaceName` may be the
 * provider's name rather than this candidate's. Passing it keeps the two lines describing the same
 * string: without it, a card titled `Kohi בית קפה יפני` would claim it was `Named in the caption`
 * because the *model's* guess happened to equal `rawName`.
 */
export function candidateProvenance(candidate: PlaceCandidate, shownTitle?: string): string {
  const title = (shownTitle ?? candidateTitle(candidate)).trim();
  const raw = candidate.rawName.trim();
  return title.toLowerCase() === raw.toLowerCase()
    ? 'Named in the caption'
    : `The caption called it “${raw}”`;
}

/**
 * `Restaurant · 21 Kingly St, London` — category, then the most specific place hint available.
 *
 * `countryHint` is dropped whenever a city or address exists. "LONDON, UNITED KINGDOM" repeated
 * down eight consecutive cards is noise, and the country is never the thing that distinguishes one
 * candidate from another within a single TikTok.
 */
export function candidateMeta(candidate: PlaceCandidate): string {
  const parts: string[] = [];

  if (candidate.categoryHint !== null) {
    parts.push(isProductCategory(candidate.categoryHint) ? PRODUCT_CATEGORY_LABEL[candidate.categoryHint] : 'Place');
  }

  const address = candidate.addressHint?.trim() ?? '';
  const city = candidate.cityHint?.trim() ?? '';

  if (address !== '') {
    // The caption sometimes writes the city into the address already ("חצר השוק 6, רעננה"), which
    // is the same duplication `googleMapsSearchUrl` guards against, tested the same way.
    parts.push(city !== '' && !address.toLowerCase().includes(city.toLowerCase())
      ? `${address}, ${city}`
      : address);
  } else if (city !== '') {
    parts.push(city);
  } else if ((candidate.countryHint?.trim() ?? '') !== '') {
    parts.push(candidate.countryHint!.trim());
  }

  return parts.length > 0 ? parts.join(' · ') : 'Location not given';
}

/**
 * Whether the verbatim caption fragment adds anything beyond the name already on the card. A
 * candidate whose evidence is just its own name renders a quote that says nothing twice.
 */
export function showsEvidence(candidate: PlaceCandidate): boolean {
  const evidence = candidate.evidence?.trim() ?? '';
  if (evidence === '') return false;
  return evidence.toLowerCase() !== candidate.rawName.trim().toLowerCase();
}

/**
 * A candidate can be saved only if the model gave it a coordinate. This is knowable at render
 * time, and saying so up front is the whole difference between a calm statement and a post-hoc
 * apology: the screen used to accept a candidate it already knew it would skip, and only mention
 * it after the user pressed the button.
 */
export function isSaveable(candidate: PlaceCandidate): boolean {
  return candidate.coordinates !== null;
}

/** Two words about the pin, the only per-card confidence signal on the screen. */
export function locationLine(candidate: PlaceCandidate): string {
  return isSaveable(candidate) ? 'Pin is approximate' : 'We couldn’t place this one';
}

/**
 * `filterPlausible` keeps a hashtag-only candidate rather than dropping it, capping its confidence
 * instead (`extraction/plausibility.ts`). The screen states the fact and not the cap: "confidence"
 * is a number we have decided not to show, so it cannot be the explanation.
 *
 * This delegates rather than re-testing the spelling. It used to be
 * `candidate.rawName.trim().startsWith('#')`, which asked whether *the model* had kept the `#` —
 * and the model strips it. On a real caption of one sentence and 28 hashtags that produced
 * `rawName: "tsukijifishmarket"` at 0.95 confidence with no cap and no label, so a topic tag
 * reached the user as a confident find. The cap and this notice are two readings of one fact and
 * must come from one function; `isHashtagOnlyEvidence` asks the caption where the name is
 * findable, which no model formatting choice can change.
 */
export function isHashtagOnly(caption: string | null, candidate: PlaceCandidate): boolean {
  return caption !== null && isHashtagOnlyEvidence(caption, candidate.rawName, candidate.evidence);
}

/** The primary action's label, which is also the clearest statement of what pressing it does. */
export function saveButtonLabel(selectedCount: number): string {
  if (selectedCount === 0) return 'Select a place to save';
  if (selectedCount === 1) return 'Save this place →';
  return `Save ${selectedCount} places →`;
}

/**
 * The consequence of the unsaveable candidates, stated before the button is pressed rather than
 * after. Null when there are none.
 */
export function skippedNotice(unsaveableCount: number): string | null {
  if (unsaveableCount === 0) return null;
  return unsaveableCount === 1
    ? '1 of these has no location — it won’t be saved.'
    : `${unsaveableCount} of these have no location — they won’t be saved.`;
}
