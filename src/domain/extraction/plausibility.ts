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

/**
 * Generic over the candidate shape so the v2 enrichment fields (`extraction/schema.ts`'s
 * `PlaceCandidate`) survive this gate with their types intact. This filter reads only the
 * `PlaceCandidate` fields and never constructs a candidate of its own, so widening it costs
 * nothing and stops every caller having to re-widen afterwards.
 */
export interface PlausibilityResult<T extends PlaceCandidate = PlaceCandidate> {
  readonly kept: readonly T[];
  /** Count only, never the text (`07` §7.1) — a rising drop rate is the earliest signal that the
   *  prompt or the model has drifted. */
  readonly dropped: Readonly<Record<PlausibilityDropReason, number>>;
}

/**
 * Was `[^a-z0-9\s]` — ASCII-only, which silently stripped every non-Latin character (Hebrew,
 * Japanese, Cyrillic, Arabic...) down to an empty string, so any candidate written in one of those
 * scripts normalised to `''` and was then dropped by `isCityOrCountryOnly`'s `norm.length === 0`
 * check as if it were a bare city/country — a real venue in Hebrew never had a chance to survive
 * this gate regardless of what the model or the prompt did. `\p{L}\p{N}` (Unicode letter/number
 * classes, `u` flag) keeps any script's letters and digits instead of only `a-z0-9`.
 */
function normaliseForComparison(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
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
 * Whitespace runs collapse to one space. Applied to **both** sides of the evidence test and to
 * nothing else — see `evidenceFoundInCaption`. `\s` covers NBSP, tabs and newlines, all of which a
 * caption carries and a model's quote of it silently does not.
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** `...`, `…`, `[...]`, `[…]` — the four ways the model writes "I skipped a bit here". */
const ELISION = /\s*(?:\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/u;

/**
 * Minimum length of each piece of an elided quote. An elision splits one containment test into
 * several, and short pieces are cheap to satisfy by accident, which is exactly the hallucination
 * the gate exists to catch. Measured elided quotes in the recognition corpus had segments of 40
 * and 52 characters; 12 keeps a wide margin under the shortest real one while making a
 * two-character fragment inadmissible.
 */
const ELIDED_SEGMENT_MIN_CHARS = 12;

/**
 * Is `evidence` really a quote from `caption`?
 *
 * This used to be `caption.includes(evidence)`, and **that exact test was measured producing false
 * "no places found" on real imports** (`docs/evidence/extraction/determinism-2026-08-28.md`). Over
 * 79 real extraction runs on the 13-URL recognition corpus, every empty result — 4 of them,
 * including the corpus's one recorded `extraction_miss` — was this gate dropping a correct
 * candidate. Two causes, both benign quoting habits rather than fabrication:
 *
 *  1. **A collapsed double space.** The caption reads `מרמת אביב  ללב העיר`; the model quoted it
 *     with one space. Every character otherwise identical, and the venue, its street and its house
 *     number all correct.
 *  2. **An elided quote.** The model wrote `מסעדת רוסטיקו ... כתובת: בזל 42, תל אביב` — two real
 *     caption fragments joined by an ellipsis it added itself.
 *
 * The relaxation is deliberately narrow, and stops well short of `grounding.ts`'s `normalise()`
 * test. Case, accents, punctuation and emoji are all still significant here, because a strict
 * `evidence` mismatch drops a whole candidate and that consequence is what buys the strictness. It
 * is whitespace and elision only: every character the model claims the caption contains must still
 * be in the caption, in order.
 */
export function evidenceFoundInCaption(caption: string, evidence: string): boolean {
  const haystack = collapseWhitespace(caption);
  const needle = collapseWhitespace(evidence);
  if (needle === '') return false;
  if (haystack.includes(needle)) return true;

  const segments = needle.split(ELISION).map(collapseWhitespace).filter((s) => s !== '');
  if (segments.length < 2) return false;
  if (segments.some((s) => Array.from(s).length < ELIDED_SEGMENT_MIN_CHARS)) return false;

  // In order, non-overlapping: `A ... B` means B comes after A in the caption, not merely that
  // both appear somewhere. A model that reassembled two distant fragments backwards is not
  // quoting.
  let searchFrom = 0;
  for (const segment of segments) {
    const at = haystack.indexOf(segment, searchFrom);
    if (at < 0) return false;
    searchFrom = at + segment.length;
  }
  return true;
}

/**
 * Applies every `09` §5.2 rule in order, against the caption the candidates were extracted from.
 * `caption` is the verbatim text the extractor read — needed only to check that `evidence` is a
 * real quote from it, never inspected any other way.
 */
export function filterPlausible<T extends PlaceCandidate>(
  candidates: readonly T[],
  caption: string,
): PlausibilityResult<T> {
  const dropped: Record<PlausibilityDropReason, number> = {
    hashtag_or_handle: 0,
    city_or_country_only: 0,
    generic_words_only: 0,
    evidence_not_in_caption: 0,
    duplicate: 0,
  };
  const kept: T[] = [];
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
    if (candidate.evidence !== null && !evidenceFoundInCaption(caption, candidate.evidence)) {
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
      // `{ ...candidate, modelConfidence }` is a `T` at runtime — every other property is copied
      // — but TypeScript cannot prove a spread-plus-override of a generic is still that generic,
      // so the assertion states what the spread guarantees. The only alternative is dropping the
      // generic, which loses the v2 fields' types for every caller.
      kept.push({ ...candidate, modelConfidence: HASHTAG_ONLY_CONFIDENCE_CEILING } as T);
      continue;
    }
    kept.push(candidate);
  }

  return { kept, dropped };
}
