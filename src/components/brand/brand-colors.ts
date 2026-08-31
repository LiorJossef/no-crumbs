/**
 * The brand's colours as literals, for the surfaces that have no stylesheet.
 *
 * ## Why literals, and why exactly here
 *
 * Four things this product draws cannot resolve a CSS custom property, and none of them can be
 * fixed by trying harder:
 *
 *  - **`app/icon.svg`** is a static file served straight to the browser as a favicon. It is not in
 *    the document, so `var(--brand)` resolves against nothing.
 *  - **`app/apple-icon.png`** is a raster. Colour is baked into pixels at build time.
 *  - **`app/opengraph-image.tsx`** renders through satori, which lays out a subset of CSS and has
 *    no cascade and no custom properties.
 *  - **`app/global-error.tsx`** replaces the whole document, `<html>` and `<body>` included, so the
 *    root layout never runs and the stylesheet never loads. Its own header has said so since it was
 *    written.
 *
 * This is exactly the arrangement `src/ui/place/palette.ts` already carries for the map — literals
 * on one side, `--tokens` in `globals.css` on the other, deliberate duplication, and a unit test
 * standing between it and a silent drift. **Read that file's header before deleting either side of
 * this one.**
 *
 * ## What is not here
 *
 * The category colours. A place's colour means *what a place is* and lives in `palette.ts`; these
 * six are chrome. `brand-and-product-foundation.md` §3.1 rule 3 keeps them apart on purpose —
 * toast-gold was refused as a brand colour precisely because it sits a few degrees from the café
 * amber, and on this map colour is information.
 *
 * And no gold. §3.1 rule 3: mint is the only brand colour, gold belongs to the mascot alone, and
 * the two never share a surface. The mascot appears on the icon and the link preview **in the brand
 * palette**, which rule 1 explicitly allows — palette is one of the four things an illustrator may
 * change; the outline is not.
 */

/** `--mint-400`. The tile the mark sits on, and the product's one saturated surface. */
export const BRAND_MINT = '#A8ECE2';

/** `--ink-on-mint`. The only ink that goes on `BRAND_MINT`; 11.5:1 against it. */
export const BRAND_INK_ON_MINT = '#123B35';

/** `--brand` / `--mint-700`. The mark on a light surface, and the product's link colour. */
export const BRAND_MINT_DEEP = '#2E7A70';

/** `--background`. The warm near-white every full-screen surface starts from. */
export const BRAND_SURFACE = '#FAF9F6';

/** `--foreground`. */
export const BRAND_INK = '#1B1B1A';

/** `--muted-foreground`. Body text that is not the headline; **5.10:1** on `BRAND_SURFACE`, up from
 *  `#75716A`'s 4.61 — see the token's own note in `globals.css` for why the ink moved rather than
 *  the grounds under it. `brand-colors.test.ts` asserts this literal and that token still agree,
 *  which is what caught this file: both call sites here render where a CSS variable cannot reach. */
export const BRAND_INK_MUTED = '#6E6A64';

/** `--border`. The hairline. */
export const BRAND_HAIRLINE = '#E7E3DC';
