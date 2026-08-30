import type { CSSProperties } from 'react';

/**
 * The two variation axes the display face is run at.
 *
 * `brand-and-product-foundation.md` §3.1 sets the wordmark and the large editorial headings in
 * **Fraunces** at `SOFT` 60 with `WONK` on — the two axes that give it the slight tilt keeping it
 * from reading as a bank. Fraunces defaults to `SOFT` 0 and `WONK` off, so a call site that takes
 * the family and forgets the axes renders a straighter, colder serif that is *almost* the brand
 * face. One constant is how that stops being a thing anyone has to remember.
 *
 * **The family is a class, not this object.** `--font-display` is registered in `globals.css`'s
 * `@theme inline` block, so `font-display` is a real Tailwind utility and the family never needs a
 * bracket or an inline style. Only the axes live here, because `font-variation-settings` has no
 * Tailwind namespace to register under.
 *
 * **Where it may be used is narrow**: the wordmark, and `h1`/`h2` at editorial size. Functional
 * labels — `h3`, `h4`, card titles at 15–17px — stay Manrope under `font-heading`, because a serif
 * at that size turns to mud (§3.1). No `font-stretch`, ever: an expanded width axis visibly
 * distorted the letterforms in the first design-system document and §3.1 records it as a bug that
 * shipped.
 */
export const DISPLAY_AXES: CSSProperties = {
  fontVariationSettings: '"SOFT" 60, "WONK" 1',
};
