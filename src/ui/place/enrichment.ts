/**
 * The render-time decisions about extraction v2's three new per-save fields — `saved_places.tags`,
 * `why_go` and `dishes` (migration `0019`). Pure, no React, no DOM: this file decides *what* is
 * worth putting on screen, `components/sheet/place-enrichment.tsx` decides how it looks.
 *
 * It lives in `ui/` rather than `domain/` because none of it is a fact about a place. Dropping a
 * sentence because the two fields either side of it already said the same thing is a presentation
 * judgement; the sentence stays in the column either way, and a different surface is free to show
 * it. Nothing here ever writes, compares for identity, or persists — `domain/extraction/tags.ts`
 * owns tag identity and `tagDisplayLabel` owns casing, and neither is re-implemented here.
 */

import type { Spot } from '@/domain/places/spot';
import { normalise } from '@/domain/places/normalise';
import { tagDisplayLabel } from '@/domain/extraction/tags';

/**
 * The three v2 columns as the read path returns them.
 *
 * **Separate from `Spot` on purpose, and temporarily.** `domain/places/spot.ts` does not declare
 * these yet — the extraction workstream landing on this same branch owns that file, and two agents
 * editing one type at once is how a merge conflict becomes a silent field drop. Once `Spot` carries
 * them, delete this interface and `enrichmentOf`'s cast: every call site already reads the same
 * field names.
 *
 * `readonly string[]` rather than `string[] | null`: `0019` makes NULL the single empty
 * representation in the database, and `getSpots` collapses it to `[]` at the boundary, so no
 * renderer ever has to know there were two ways to say "nothing here".
 */
export interface SpotEnrichment {
  /** `saved_places.tags`, stored already-normalised and lowercase. Render through
   *  `tagDisplayLabel`; never show a stored value directly. Empty is the normal case. */
  readonly tags: readonly string[];
  /** `saved_places.why_go` — the model's own one-sentence summary. Not a caption quote. */
  readonly whyGo: string | null;
  /** `saved_places.dishes` — verbatim items the post named, normalised for storage the same way
   *  tags are, so they render through `tagDisplayLabel` too. */
  readonly dishes: readonly string[];
}

/** A `Spot` that has been through `getSpots`, which reads the `0019` columns. */
export type EnrichedSpot = Spot & SpotEnrichment;

const NO_ENRICHMENT: SpotEnrichment = { tags: [], whyGo: null, dishes: [] };

/**
 * Reads the three fields off a spot, tolerating a spot that predates them.
 *
 * The cast is the whole reason this is a function rather than a property access: it is the single
 * place that assumes `getSpots` populated fields `Spot` does not yet declare, so there is exactly
 * one line to delete when it does. A `MapPlace` built by a test or a mock surface carries none of
 * them, and gets the empty shape rather than `undefined` sprayed through every renderer.
 */
export function enrichmentOf(spot: Spot | undefined): SpotEnrichment {
  if (!spot) return NO_ENRICHMENT;
  const enriched = spot as Partial<SpotEnrichment>;
  return {
    tags: enriched.tags ?? [],
    whyGo: enriched.whyGo ?? null,
    dishes: enriched.dishes ?? [],
  };
}

/**
 * The hard cap on how many tags a list row shows before collapsing the rest into a `+N`.
 *
 * Three, because at 390 px the row's text column is ~294 px and three chips of the median observed
 * tag (`pan asian`, `hidden gem`, `market stall` — 9 to 12 characters) fill it exactly.
 */
export const MAX_ROW_TAGS = 3;

/**
 * The second cap, and the one that actually does the work: the total *characters* a row's chips may
 * spend.
 *
 * A count alone is not enough, and this is measured rather than reasoned. `Sycamore Vino Cucina`
 * carries `seasonal italian`, `hotel restaurant`, `modern italian small plates`; three chips fitted
 * on the row only by every one of them truncating, and a row reading `Seasonal I… Hotel Resta…
 * Modern Italian Sma…` is strictly worse than two whole labels and a count — the whole point of a
 * chip is that you can read it at a glance.
 *
 * 34 characters is the budget the same row's ~294 px holds at 11 px bold with chip padding,
 * checked against the real tag lists on this database: `pan asian, market stall, hidden gem` (31)
 * fits three, `seasonal italian, hotel restaurant` (32) fits two, `בורקס, מאפייה, hidden gem` (21)
 * fits three. It is a proxy for width, not a measurement of it — a deliberate trade, because
 * measuring text in the browser would mean a layout read on every row of a scrolling list.
 */
export const ROW_TAG_CHAR_BUDGET = 34;

export interface RowTags {
  readonly shown: readonly string[];
  /** How many were left out. `0` when everything fits — the caller renders no `+N` at all. */
  readonly overflow: number;
}

/**
 * The row's split: as many whole tags as fit both caps (the extractor emits them most-salient-first
 * and `0019`'s `normalize_tag_list` preserves that order), and a count of the rest.
 *
 * The first tag is always shown, even when it alone blows the budget. A single 28-character tag
 * then truncates, which is the one case where an ellipsis is unavoidable — the alternative is a row
 * that says `+1` and nothing else.
 */
export function splitRowTags(tags: readonly string[]): RowTags {
  const shown: string[] = [];
  let spent = 0;

  for (const tag of tags) {
    if (shown.length === MAX_ROW_TAGS) break;
    if (shown.length > 0 && spent + tag.length > ROW_TAG_CHAR_BUDGET) break;
    shown.push(tag);
    spent += tag.length;
  }

  return { shown, overflow: tags.length - shown.length };
}

/**
 * The accessible name of a list row's button.
 *
 * `aria-label` replaces a button's content in the accessibility tree, so tag chips rendered inside
 * one are announced nowhere unless they are in the label. Only the chips that are actually on
 * screen are named — a hidden tag is not something a sighted user can act on either — and the
 * overflow stays a count, so a five-tag row reads as a phrase rather than a paragraph.
 *
 * Pure and here rather than inline in the component so the "does a screen reader user get the same
 * scanning signal as a sighted one" question has a test rather than a code review.
 */
export function rowAccessibleName(name: string, tags: readonly string[]): string {
  const { shown, overflow } = splitRowTags(tags);
  if (shown.length === 0) return `Open ${name}`;

  const labels = shown.map(tagDisplayLabel).join(', ');
  return overflow > 0
    ? `Open ${name}, tagged ${labels} and ${overflow} more`
    : `Open ${name}, tagged ${labels}`;
}

/* ------------------------------------------------------------------------------------------- *
 * whyGo: shown only when it says something the rest of the screen does not
 * ------------------------------------------------------------------------------------------- */

/**
 * Words that carry no distinguishing signal, so an overlap test that counted them would let a pure
 * paraphrase through on `the`/`and`/`inside`. English-only and deliberately short: this is not a
 * stopword list for a search engine, it is the set of connectives a one-sentence summary is built
 * from. Hebrew and other scripts get no list, which is the safe direction — an unrecognised word
 * counts as new information, so the sentence is *shown*, never wrongly hidden.
 */
const CONNECTIVES = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'in',
  'inside', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'there', 'these',
  'they', 'this', 'to', 'up', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'will', 'with', 'you', 'your',
]);

/**
 * The content words of a string, keyed exactly the way this codebase keys any other text —
 * `normalise()` (lowercase, accent-folded, punctuation stripped) — so `Pan-Asian` in a sentence and
 * `pan asian` in a tag are recognised as the same word without a second, quietly different rule.
 */
function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalise(text).split(' ')) {
    if (word !== '' && !CONNECTIVES.has(word)) out.add(word);
  }
  return out;
}

/**
 * How many words `whyGo` contributes that nothing else on the detail screen already says.
 *
 * Exported for its test and for anyone re-tuning the threshold against real output — the number
 * matters more than the boolean, and hiding it inside the predicate would make the rule
 * unmeasurable.
 */
export function newWordCount(whyGo: string, context: readonly (string | null | undefined)[]): number {
  const known = new Set<string>();
  for (const piece of context) {
    if (!piece) continue;
    for (const word of contentWords(piece)) known.add(word);
  }
  let count = 0;
  for (const word of contentWords(whyGo)) {
    if (!known.has(word)) count += 1;
  }
  return count;
}

/**
 * Below this, the sentence is a paraphrase of its own neighbours and is not rendered.
 *
 * **Four, and the number came out of the data rather than out of a preference.** Measured against
 * every `why_go` the v2 extractor has actually written into this database (n=9, real captions, real
 * model output), with each sentence scored against the quote, tags, dishes, name and city already
 * on the same screen:
 *
 * ```
 *  1  Tokii                 Experience East meets West fusion inside The Prince Akatoki ...
 *  1  The Laughing Yak      Discover a Nepalese kitchen tucked away in the market.
 *  2  Jones Family Kitchen  Find this hidden spot inside Eccleston Yards in Belgravia.
 *  2  MBER London           Try incredible pan-Asian sharing plates underground on Pudding Lane.
 *  3  La Nonna Brixton      Enjoy delicious artisan pasta in Brixton's Market Row.
 *  3  The Life Goddess      Experience beautiful Greek dishes.
 *  ---------------------------------------------------------------------------------------------
 *  5  Anat Bakery           A neighbourhood bakery that sells out by eleven on a Friday.
 *  7  Sycamore Vino Cucina  The menu changes with the season and the room is quiet enough to talk.
 *  8  Kiaans Tooting        Go on a weeknight — the counter is six seats and the queue starts at ...
 * ```
 *
 * The sample separates cleanly, with nothing scoring 4, and the split lands exactly where reading
 * the sentences puts it: everything at or below 3 is a listicle verb wrapped around words the
 * screen already shows (`Experience …`, `Enjoy delicious …`, `Try incredible …`, `Find this hidden
 * spot …`), and everything at or above 5 says something no tag could carry — a closing time, a
 * counter with six seats, a menu that changes. Four is the middle of the measured gap rather than a
 * number chosen and then justified.
 *
 * **Stated honestly: nine samples is a small sample.** This threshold is one constant, in one
 * place, feeding one call site, and it should be re-measured the moment there is more real output —
 * the table above is the method for doing that, not decoration.
 */
export const MIN_NEW_WORDS = 4;

/**
 * Whether the model's sentence has earned its place on the detail screen.
 *
 * **This is a deliberate design decision, not an optimisation, and it is one call site to remove.**
 * `why_go` is the model's own prose; `extracted_reason` is a verbatim caption substring. The two
 * are different columns holding different classes of claim, and the codebase's central invariant is
 * that the difference stays legible. When the sentence merely restates the quote and the tags in
 * softer words, showing both does not honour that distinction — it destroys it, because the two now
 * read as the same statement printed twice and the user has no way to tell which one the creator
 * actually wrote. So the quote always wins the space, and the sentence appears only when it carries
 * something the quote and the tags do not.
 *
 * Nothing is discarded: the column keeps the sentence, and this is a render-time filter that any
 * other surface (a debug view, the import review) is free to ignore.
 */
export function whyGoEarnsItsPlace(
  whyGo: string | null | undefined,
  context: {
    readonly reason?: string | null | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly dishes?: readonly string[] | undefined;
    readonly name?: string | null | undefined;
    readonly locality?: string | null | undefined;
  },
): boolean {
  const sentence = whyGo?.trim() ?? '';
  if (sentence === '') return false;

  return (
    newWordCount(sentence, [
      context.reason,
      ...(context.tags ?? []),
      ...(context.dishes ?? []),
      context.name,
      context.locality,
    ]) >= MIN_NEW_WORDS
  );
}
