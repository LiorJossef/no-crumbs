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
 * A candidate whose only evidence is a hashtag survives the other rules and is **kept**, not
 * dropped — its confidence is capped here instead, and `isHashtagOnlyEvidence` below is what the
 * review screen states in words ("Only mentioned in a hashtag").
 *
 * **Keeping it is a measured decision, not a hedge.** Across 129 real cached captions (the
 * `corpus-100` set plus E7), venues that appear *only* inside a hashtag are common in exactly the
 * Hebrew Tel Aviv content this product targets — `#LaLaLand`, `#הריםבייקרי` ("Harim Bakery", whose
 * caption's prose says only "new cafe!! in Tower of David Jerusalem"), `#שוקהכרמל`, `#איטמי`.
 * Dropping the class would cost every one of those. Nor is there a non-arbitrary way to separate
 * them from junk by caption shape: hashtag counts over those 129 captions run 0 → 30 with no
 * cliff (0 tags 9, 1 tag 5, 3 tags 16, 5 tags 23, 10 tags 11, 30 tags 1), so any "trailing tag
 * block bigger than N is SEO salad" threshold would be a number invented to fit one specimen.
 *
 * So the line is: **a hashtag is weak evidence, not absent evidence.** Keep the candidate, cap it,
 * and say so on screen. What that costs is that `#tsukijifishmarket` still reaches the review
 * list — as a labelled, capped candidate the user can reject, rather than as the confident find it
 * used to be.
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

/**
 * Every `#tag` token in a caption. A tag runs to the next whitespace or the next `#`, so
 * `#a#b` is two tags and `#tel aviv` is the tag `#tel` followed by prose.
 */
const HASHTAG_TOKEN = /#[^\s#]+/gu;

/**
 * Letters and digits only, lowercased, everything else removed — so `#tsukijifishmarket`,
 * `tsukijifishmarket` and `Tsukiji Fish Market` all reduce to the same string.
 *
 * The aggressiveness is the point, and it is what `normaliseForComparison` deliberately does not
 * do (that one keeps word boundaries, because the rules using it care about words). Here the
 * enemy is precisely the model's freedom over `#`, spacing and casing when it copies a tag, so
 * every one of those has to stop mattering.
 */
function tightenForTagMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Is a hashtag the **only** thing in this caption that evidences the candidate?
 *
 * This replaces a test on the candidate's own spelling — `rawName.trim().startsWith('#')` — and
 * that replacement is the whole fix. **The old test never fired on the case that motivated it.**
 * On @nom_life's post (`7220925199297039662`), a caption of one sentence plus 28 tags, the model
 * returned `rawName: "tsukijifishmarket"` — the tag with its `#` stripped — at
 * `modelConfidence: 0.95`. `startsWith('#')` was false, so neither the confidence cap nor the
 * review screen's "Only mentioned in a hashtag" notice applied, and a topic tag sitting between
 * `#totoro` and `#studioghibli` reached the user as an ordinary confident result. It resolves
 * cleanly, too, because Tsukiji Fish Market is real — nothing downstream could have caught it.
 * The prompt asked for the `#` (`integrations/llm/prompt.ts`) and the model did not supply it, and
 * a guard that depends on the model formatting its answer correctly is not a guard.
 *
 * So the question asked here is about the **caption**, not about the candidate's spelling:
 * strip every `#tag` token out of the caption to leave the prose, then ask where the name is
 * findable. Tag but not prose → hashtag-only. In prose → corroborated, full confidence, no label,
 * regardless of whether a tag happens to repeat it. That is the "the hashtag is the only evidence"
 * / "a hashtag agrees with the prose" line the rule has to draw, and drawing it on the caption
 * makes it immune to how the model chose to write `rawName`.
 *
 * `evidence` is tested as a second route because tight matching is within-script: when the model
 * segments and transliterates a tag (`#נומיכפרמונש` → `"Nomi Kfar Monash"`, which the prompt asks
 * for), the name no longer tightens into the Hebrew tag, but the verbatim `evidence` quote still
 * does.
 */
export function isHashtagOnlyEvidence(
  caption: string,
  rawName: string,
  evidence: string | null,
): boolean {
  const tags = caption.match(HASHTAG_TOKEN) ?? [];
  if (tags.length === 0) return false;

  // Split rather than replace-with-a-space: tightening removes whitespace, so joining the prose
  // either side of a removed tag into one string would let a name match across the seam and be
  // wrongly read as prose-corroborated — a false negative in the unsafe direction.
  const proseSegments = caption.split(HASHTAG_TOKEN).map(tightenForTagMatch);
  const tightTags = tags.map(tightenForTagMatch);

  const onlyInTag = (value: string): boolean => {
    const tight = tightenForTagMatch(value);
    if (tight === '') return false;
    if (proseSegments.some((segment) => segment.includes(tight))) return false;
    return tightTags.some((tag) => tag.includes(tight));
  };

  if (onlyInTag(rawName)) return true;
  return evidence !== null && onlyInTag(evidence);
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
    if (
      isHashtagOnlyEvidence(caption, candidate.rawName, candidate.evidence) &&
      candidate.modelConfidence !== null &&
      candidate.modelConfidence > HASHTAG_ONLY_CONFIDENCE_CEILING
    ) {
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
