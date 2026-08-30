import type { CSSProperties } from 'react';

/**
 * The variation axes the display face is run at — two settings, not one.
 *
 * `brand-and-product-foundation.md` §3.1 sets the wordmark and the large editorial headings in
 * **Fraunces** with `SOFT` and `WONK` on — the axes that give it the slight tilt keeping it from
 * reading as a bank. Fraunces defaults to `SOFT` 0 and `WONK` off, so a call site that takes the
 * family and forgets the axes renders a straighter, colder serif that is *almost* the brand face.
 * One constant is how that stops being a thing anyone has to remember.
 *
 * **`SOFT` 60 is the wordmark's setting, not the whole face's**, and the difference is visible.
 * §3.1's prose gives one number; the rendered design system it points at
 * (`no-crumbs-design-system.html`) sets them apart, and the document is the artefact the owner
 * approved:
 *
 * | | weight | `SOFT` | source |
 * |---|---|---|---|
 * | wordmark | 900 | 60 | `.wm` |
 * | `h1`/`h2` | 700 | 32 | the base `h1, h2` rule |
 * | hero `h1` | 700 | 44 | `.hero h1`, and the landing headline is one |
 *
 * Measured on `/` at 390×844: the whole scale at 900/60 gave a headline heavy enough to read as a
 * slab, which is the opposite of what a soft display serif is here for. The wordmark wants the
 * weight because it is two words at 18px carrying the product's name; a two-line headline at 34px
 * does not.
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
/** The wordmark, and only the wordmark. Pair with `font-black`. */
export const DISPLAY_WORDMARK_AXES: CSSProperties = {
  fontVariationSettings: '"SOFT" 60, "WONK" 1',
};

/** `h1`/`h2` at editorial size — the landing headline, the error screens. Pair with `font-bold`. */
export const DISPLAY_HEADING_AXES: CSSProperties = {
  fontVariationSettings: '"SOFT" 44, "WONK" 1',
};
