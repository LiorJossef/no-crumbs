/**
 * The field-level gate for schema v2 (`extraction/schema.ts`), and the companion to
 * `plausibility.ts`.
 *
 * The two do different jobs and that separation is deliberate. `filterPlausible` decides whether a
 * **candidate** exists at all — a hashtag, a bare city, a name with no verbatim evidence — and
 * drops the whole thing. This file never drops a candidate. It decides whether each **enrichment
 * field** earned its place, and nulls or trims only that field. Dropping a real venue because the
 * model wrote a shaky one-line summary about it would be a regression, not a safeguard.
 *
 * Everything here is pure and side-effect free. It takes the caption and the candidates and
 * returns the cleaned candidates plus counts of what it changed; logging those counts (never the
 * text — `07` §7.1) is the caller's job, exactly as with `filterPlausible`.
 *
 * ## What each rule is actually buying
 *
 *  - **`whyGo`** is the only field in v2 that is the model writing prose. It is allowed to be the
 *    model's own words; it is not allowed to be unsourced. `whyGo.groundedIn` must be findable in
 *    the caption or the whole `whyGo` becomes `null`. That converts "trust the model" into a
 *    substring test, which is the same trade `evidence` already makes for names. Note that
 *    `groundedIn` is **never persisted** (see `WhyGoSchema`) — this gate is the entirety of its
 *    value, so weakening the gate does not weaken a stored field, it deletes the field's reason to
 *    exist.
 *  - **`whyGo` again**, because one substring test was not enough. Measured on the real
 *    `Resturants in Tel Aviv 📍Ha Kosem #foodie...` caption, `gemini-3.5-flash-lite` returned
 *    *"Grab a legendary falafel pita in Tel Aviv."* citing `groundedIn: "Ha Kosem"` — a genuine
 *    caption substring, so the first gate passed it, while every load-bearing word in the sentence
 *    ("legendary", "falafel", "pita") came from the model's knowledge of the venue and not from
 *    the caption at all. A citation that quotes only the place's own name licenses nothing, so it
 *    is now rejected as circular. This is the exact failure the field was most at risk of, and it
 *    was found by running the thing, not by reasoning about it.
 *  - **`dishes`** are verbatim-class, so each item must be findable in the caption. A dish the
 *    caption does not name is a menu the model invented, and it is dropped item by item.
 *  - **`tags`** are canonicalised, de-duplicated and capped (`tags.ts`). They are *not*
 *    substring-gated: `Hotel restaurant` is a reading of "inside Middle Eighty Hotel", not a quote
 *    from it. This is the one v2 field whose truthfulness rests on the prompt, and it is called
 *    out here so nobody later assumes a gate exists that does not.
 *
 * ## Matching is normalised, and `evidence` is not
 *
 * `filterPlausible` tests `caption.includes(evidence)` exactly. This file tests through
 * `normalise()` instead — same string, punctuation flattened, case folded, emoji dropped. The
 * reason is the difference in consequence: a strict `evidence` mismatch drops a candidate, and we
 * want that to be rare and unambiguous, whereas a strict `groundedIn` mismatch would throw away a
 * true summary because the model straightened a curly apostrophe. Both are still mechanical
 * substring tests; only the tolerance differs.
 */

import { canonicaliseTags } from './tags';
import type { PlaceCandidate } from '../types';
import { normalise } from '../places/normalise';

export interface GroundingCounters {
  /** `whyGo` discarded because `groundedIn` was not in the caption — a fabricated citation. */
  readonly why_go_ungrounded: number;
  /** `whyGo` discarded because `groundedIn` quoted nothing but the venue's own name. The citation
   *  was real and still supported nothing, which is how a world-knowledge sentence gets in wearing
   *  a caption's clothes. */
  readonly why_go_cites_only_the_name: number;
  /** `whyGo.text` kept, but it is a verbatim slice of the caption rather than the model's own
   *  sentence. Not an error — it is still true — but it is the v1 behaviour we were trying to move
   *  past, so it is counted rather than hidden. */
  readonly why_go_verbatim_copy: number;
  /** Individual dish items dropped for not appearing in the caption. */
  readonly dish_not_in_caption: number;
  /** Individual tags dropped as empty, duplicate, redundant with the name/category, or over cap. */
  readonly tag_dropped: number;
}

export interface GroundingResult {
  readonly candidates: readonly PlaceCandidate[];
  readonly counters: GroundingCounters;
}

/* ------------------------------------------------------------------------------------------- *
 * The gate
 * ------------------------------------------------------------------------------------------- */

/** Normalised-substring containment. Empty needle is never contained — an empty `groundedIn` is a
 *  missing citation, not a trivially satisfied one. */
function containsNormalised(haystackNormalised: string, needle: string): boolean {
  const n = normalise(needle);
  if (n === '') return false;
  return haystackNormalised.includes(n);
}

/**
 * Words that carry no claim on their own, so a citation made only of these plus the venue's name
 * is still a citation of nothing. Deliberately tiny: this is not a stop-word list for search, it
 * is the handful of connectives a model puts around a name ("at Ha Kosem", "the Ha Kosem").
 */
const CITATION_FILLER = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'for', 'and', 'to', 'is', 'it', 'this', 'that']);

/**
 * True when `groundedIn` quotes nothing beyond the candidate's own name.
 *
 * The first gate asks "is this fragment really in the caption?". This one asks the question that
 * actually matters: "does the fragment say anything?" A citation of `"Ha Kosem"` on a candidate
 * called `Ha Kosem` is circular — it proves the caption named the place, which we already knew from
 * `evidence`, and it licenses no claim whatsoever about why to go there.
 */
function citesOnlyTheName(groundedIn: string, names: readonly (string | null)[]): boolean {
  const nameWords = new Set<string>();
  for (const name of names) {
    if (name === null) continue;
    for (const word of normalise(name).split(' ')) {
      if (word !== '') nameWords.add(word);
    }
  }
  const remaining = normalise(groundedIn)
    .split(' ')
    .filter((w) => w !== '' && !nameWords.has(w) && !CITATION_FILLER.has(w));
  return remaining.length === 0;
}

/**
 * Applies every v2 field rule against the caption the candidates were extracted from. Runs after
 * `filterPlausible`, on the survivors.
 */
export function applyGrounding(candidates: readonly PlaceCandidate[], caption: string): GroundingResult {
  const captionNormalised = normalise(caption);

  let whyGoUngrounded = 0;
  let whyGoCircular = 0;
  let whyGoVerbatim = 0;
  let dishDropped = 0;
  let tagDropped = 0;

  const out = candidates.map((candidate): PlaceCandidate => {
    const tags = canonicaliseTags(candidate.tags, {
      names: [candidate.rawName, candidate.identifiedName],
      categoryHint: candidate.categoryHint,
    });
    tagDropped += candidate.tags.length - tags.length;

    const dishes = candidate.dishes.filter((dish) => containsNormalised(captionNormalised, dish));
    dishDropped += candidate.dishes.length - dishes.length;

    let whyGo = candidate.whyGo;
    if (whyGo !== null) {
      if (!containsNormalised(captionNormalised, whyGo.groundedIn)) {
        whyGoUngrounded += 1;
        whyGo = null;
      } else if (citesOnlyTheName(whyGo.groundedIn, [candidate.rawName, candidate.identifiedName])) {
        whyGoCircular += 1;
        whyGo = null;
      } else if (containsNormalised(captionNormalised, whyGo.text)) {
        whyGoVerbatim += 1;
      }
    }

    return { ...candidate, tags, dishes, whyGo };
  });

  return {
    candidates: out,
    counters: {
      why_go_ungrounded: whyGoUngrounded,
      why_go_cites_only_the_name: whyGoCircular,
      why_go_verbatim_copy: whyGoVerbatim,
      dish_not_in_caption: dishDropped,
      tag_dropped: tagDropped,
    },
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Re-composing what field discipline separated
 * ------------------------------------------------------------------------------------------- */

/**
 * The free-form query string for a geocoder: name, then the area, then the city, then the country,
 * comma-joined — `"La Nonna, Brixton, London"`.
 *
 * This function is the reason splitting `areaHint` out of the name loses nothing. A stratified
 * n=20 measurement found the composed form beats the bare name against a free-form geocoder (6/9
 * vs 4/9 top-1; a short area qualifier narrowed 5 of 10 ambiguous cases and broke none of 5 clean
 * hits), so the qualifier is an asset — it just belongs in a field that means "area", with the
 * composition done here, once, rather than baked into `identifiedName` where it also has to be
 * displayed.
 *
 * `identifiedName` is preferred over `rawName` when present, matching what the save path already
 * writes to `places.name`. Duplicated parts are dropped, so a model that still writes `"La Nonna
 * Brixton"` into the name with `areaHint: "Brixton"` does not produce `"La Nonna Brixton,
 * Brixton"`.
 *
 * Not called by anything in `domain/extraction` — it exists for the `PlaceResolver` work, and is
 * placed here because it is the inverse of the field split this schema introduced.
 */
export function venueQueryString(
  candidate: Pick<PlaceCandidate, 'rawName' | 'identifiedName' | 'areaHint' | 'cityHint' | 'countryHint'>,
): string {
  const name = candidate.identifiedName ?? candidate.rawName;
  const parts: string[] = [name];
  const seen = normalise(name).split(' ').filter((w) => w !== '');
  const seenSet = new Set(seen);

  for (const hint of [candidate.areaHint, candidate.cityHint, candidate.countryHint]) {
    if (hint === null) continue;
    const words = normalise(hint).split(' ').filter((w) => w !== '');
    if (words.length === 0) continue;
    if (words.every((w) => seenSet.has(w))) continue;
    for (const w of words) seenSet.add(w);
    parts.push(hint.trim());
  }

  return parts.join(', ');
}
