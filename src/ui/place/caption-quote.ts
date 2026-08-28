/**
 * The caption fragment a place was extracted from, prepared for reading.
 *
 * `saved_places.extracted_reason` is a verbatim substring of someone's TikTok caption, and it is
 * stored verbatim on purpose — it is the evidence that this place was really named in that post.
 * Verbatim is right for storage and wrong for a heading. What the database holds looks like
 * `📍האחים, אבן גבירול 26` or `✨ Sycamore Restaurant for seasonal Italian plates inside…`: the
 * marker emoji is the creator's own formatting convention, not part of what they said.
 *
 * So the emoji comes off for display, and the string is otherwise untouched — no rewording, no
 * truncation, no sentence-casing. Pure; the rendering is in `components/sheet/place-sheet.tsx`.
 */

import { newWordCount } from './enrichment';

/**
 * Leading decoration: the 📍 and ✨ markers, bullets, dashes, quotes, whitespace — anything before
 * the first letter or digit. `\p{L}`/`\p{N}` rather than a list of emoji, so this is right for
 * Hebrew, Japanese and every marker a creator invents next.
 */
const LEADING_DECORATION = /^[^\p{L}\p{N}]+/u;
/** The same at the end, minus the punctuation that legitimately closes a sentence. */
const TRAILING_DECORATION = /[^\p{L}\p{N}.!?)\]}"']+$/u;

export function formatCaptionQuote(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(LEADING_DECORATION, '')
    .replace(TRAILING_DECORATION, '')
    // A caption fragment can carry the newlines and runs of spaces the creator laid it out with.
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Below this the quote is the place's own name and address written out again, and showing it is
 * worse than showing nothing: it fills a labelled block with something the two lines above it
 * already said, which is exactly what makes a detail screen read as padded.
 *
 * Two, not `whyGoEarnsItsPlace`'s four, and the difference is deliberate. That threshold judges a
 * *paraphrase* against everything else on screen and can afford to be strict. This one judges the
 * creator's own words, which are worth showing on much thinner grounds — one extra noun ("brunch",
 * "courtyard") is a real thing the post said. It only has to catch the case measured on this
 * database: `📍האחים, אבן גבירול 26`, which is the name, a comma and the address.
 */
export const MIN_QUOTE_NEW_WORDS = 2;

/**
 * Whether the caption fragment says anything the identity block above it does not.
 *
 * Scored against the name, the address and the locality — the three things the detail view prints
 * before it gets here.
 */
export function quoteAddsSomething(
  quote: string,
  context: {
    readonly name?: string | null | undefined;
    readonly addressLine?: string | null | undefined;
    readonly locality?: string | null | undefined;
  }
): boolean {
  if (quote.trim() === '') return false;
  return (
    newWordCount(quote, [context.name, context.addressLine, context.locality]) >=
    MIN_QUOTE_NEW_WORDS
  );
}
