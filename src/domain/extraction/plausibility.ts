/**
 * The one gate extraction owns (`09` §5.2, D4), applied in `domain/` as a pure function, before any
 * candidate reaches resolution. Every rule here exists so a hallucinated or non-venue candidate
 * never consumes one of the seven provider lookups (`07` §7) or reaches the review screen — the
 * modal outcome (`09` §1, ~73% of posts) is "zero candidates", and this file is what keeps that
 * outcome clean rather than "zero after the resolver quietly filtered junk".
 *
 * Pure and side-effect free: it takes the caption text and the raw candidates, and returns the
 * survivors plus a count of what it dropped and why. Logging that count (never the text) is the
 * caller's job (`07` §7.1) — this function has no `Logger` and no `OpCtx`.
 */

import type { PlaceCandidate } from '../types';

/** `09` §5.2's stop-word list: generic words that, after normalisation, leave nothing behind that
 *  could be a venue name — "this hidden gem" is the case that motivated this rule (`06` §6.3: it
 *  scores 0.813–0.894 against a naive cutoff). */
const GENERIC_WORDS = new Set([
  'cafe', 'coffee', 'bar', 'restaurant', 'food', 'spot', 'place', 'gem',
  'this', 'that', 'the', 'a', 'an', 'hidden', 'little', 'best', 'favorite', 'favourite',
]);

export type PlausibilityDropReason =
  | 'hashtag_or_handle'
  | 'city_or_country_only'
  | 'generic_words_only'
  | 'evidence_not_in_caption'
  | 'duplicate';

/**
 * A `#`-prefixed candidate that survives the other rules is kept, not dropped — a real venue can
 * appear only as a hashtag in a caption (`#aroma` for the Aroma cafe chain) and there is no way to
 * tell that apart from a fake one (`#tsukijifishmarket`) from caption text alone (measured against
 * `gemma4:e4b`). Instead its confidence is capped here so nothing downstream — today just the
 * stored row, once the resolver's confidence bands exist — can treat an uncorroborated hashtag as
 * more trustworthy than this. Deliberately not the full corroboration/near-duplicate design (a
 * `#cafefiori` that also appears as prose "Cafe Fiori" gets no credit for that yet); this is the
 * narrow interim rule only.
 */
const HASHTAG_ONLY_CONFIDENCE_CEILING = 0.5;

export interface PlausibilityResult {
  readonly kept: readonly PlaceCandidate[];
  /** Count only, never the text (`07` §7.1) — a rising drop rate is the earliest signal that the
   *  prompt or the model has drifted. */
  readonly dropped: Readonly<Record<PlausibilityDropReason, number>>;
}

function normaliseForComparison(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `@handle`s and URLs are never venues regardless of context — always rejected. `#hashtag`s are
 *  handled separately below: they now survive to the other checks instead of being blanket-dropped
 *  here (see `HASHTAG_ONLY_CONFIDENCE_CEILING`). */
function isHandleOrUrl(rawName: string): boolean {
  const trimmed = rawName.trim();
  if (trimmed.startsWith('@')) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
}

function isHashtagOnly(rawName: string): boolean {
  return rawName.trim().startsWith('#');
}

function isCityOrCountryOnly(rawName: string, cityHint: string | null, countryHint: string | null): boolean {
  const norm = normaliseForComparison(rawName);
  if (norm.length === 0) return true;
  const hints = [cityHint, countryHint].filter((h): h is string => h !== null).map(normaliseForComparison);
  // Compare with internal spaces removed too: a hashtag never contains a space (`#telaviv`), so
  // without this a hint of "Tel Aviv" (normalises to "tel aviv") would never match the hashtag's
  // "telaviv". Small, targeted fix — not a general fuzzy-match, just closing this exact gap now
  // that hashtags reach this check instead of being dropped earlier.
  if (hints.includes(norm)) return true;
  const tight = norm.replace(/\s+/g, '');
  return hints.some((h) => h.replace(/\s+/g, '') === tight);
}

function isGenericWordsOnly(rawName: string): boolean {
  const words = normaliseForComparison(rawName).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  return words.every((w) => GENERIC_WORDS.has(w));
}

/**
 * Applies every `09` §5.2 rule in order, against the caption the candidates were extracted from.
 * `caption` is the verbatim text the extractor read — needed only to check that `evidence` is a
 * real substring of it, never inspected any other way.
 */
export function filterPlausible(candidates: readonly PlaceCandidate[], caption: string): PlausibilityResult {
  const dropped: Record<PlausibilityDropReason, number> = {
    hashtag_or_handle: 0,
    city_or_country_only: 0,
    generic_words_only: 0,
    evidence_not_in_caption: 0,
    duplicate: 0,
  };
  const kept: PlaceCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (isHandleOrUrl(candidate.rawName)) {
      dropped.hashtag_or_handle += 1;
      continue;
    }
    if (isCityOrCountryOnly(candidate.rawName, candidate.cityHint, candidate.countryHint)) {
      dropped.city_or_country_only += 1;
      continue;
    }
    if (isGenericWordsOnly(candidate.rawName)) {
      dropped.generic_words_only += 1;
      continue;
    }
    if (candidate.evidence !== null && !caption.includes(candidate.evidence)) {
      dropped.evidence_not_in_caption += 1;
      continue;
    }
    const key = normaliseForComparison(candidate.rawName);
    if (seen.has(key)) {
      dropped.duplicate += 1;
      continue;
    }
    seen.add(key);
    if (isHashtagOnly(candidate.rawName) && candidate.modelConfidence !== null && candidate.modelConfidence > HASHTAG_ONLY_CONFIDENCE_CEILING) {
      kept.push({ ...candidate, modelConfidence: HASHTAG_ONLY_CONFIDENCE_CEILING });
      continue;
    }
    kept.push(candidate);
  }

  return { kept, dropped };
}
