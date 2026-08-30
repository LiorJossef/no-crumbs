/**
 * Every colour the product draws a *place* in, as literal values, in one module.
 *
 * ## Why this file exists at all, and why the values are duplicated on purpose
 *
 * **MapLibre style expressions cannot read a CSS custom property.** A `paint` or `layout` value is
 * evaluated by the GL renderer against a JSON-ish expression tree, not by the browser's style
 * engine, so `['match', ['get', 'category'], 'cafe', 'var(--category-cafe)', …]` does not resolve
 * to a colour — it resolves to a string MapLibre cannot parse. The map therefore needs the literal.
 *
 * The DOM needs the token: the list, the detail view and the filter chips paint the same three
 * categories, and they have to be re-themeable (and dark-mode-able) from `globals.css` without
 * anybody editing a component.
 *
 * So each value is written twice — here, and as `--category-*` in `src/app/globals.css` — and
 * **that duplication is deliberate, not an oversight to be tidied away.** Deleting either side
 * breaks the other: delete the token and every DOM call site goes back to a hex literal; delete
 * this module and the pins lose their colour. `tests/unit/ui/palette-tokens.test.ts` asserts the
 * two sides agree, which is the only thing standing between this arrangement and a silent drift.
 *
 * ## What is *not* here
 *
 * The basemap's own POI colours (`components/map/poi-style.ts`). They are deliberately not the
 * product's palette — a saved café and a CARTO café must not look like the same kind of thing —
 * and that file's header explains it at the length the decision deserves. They never reach the
 * DOM, so they have no token twin and nothing to drift from.
 */

import type { ProductCategory } from '@/domain/places/product-category';

/**
 * The three categories the taxonomy defines.
 *
 * **`cafe` was retuned from `#8A5A3B` on 2026-08-31** — `facelift-plan.md` §1, finding 4: brick and
 * brown did not separate at pin size. Measured rather than argued. CIEDE2000 across the palette:
 * restaurant/bar 38.1, cafe/bar 37.9, cafe/uncategorised 36.0 — and restaurant/cafe **14.8**, an
 * outlier by a factor of two and a half. The old pair also sat 4 L* points apart (47 vs 43), so
 * neither hue nor lightness was carrying the distinction and a 26px disc read as two shades of the
 * same red.
 *
 * `#6F4A2B` takes it to ΔE 20.1 with a **12-point** lightness gap (47 vs 35). The gap is the point:
 * at pin size, and for a red-green colour-vision deficiency, lightness survives where hue does not.
 * It stays brown — hue 26°, a darker coffee rather than a different idea — because "a café is the
 * same brown word-and-colour wherever it appears" is the rule `category-display.ts` is built on,
 * and it still carries a white glyph (7.0:1 on white, up from 5.8:1).
 *
 * ΔE 34+, which is where every other pair sits, is not reachable without leaving brown altogether;
 * that would be a different decision from "fix the confusable pair" and it is not this one.
 */
export const CATEGORY_COLOR: Readonly<Record<ProductCategory, string>> = {
  restaurant: '#C2452F',
  cafe: '#6F4A2B',
  bar: '#6D4FA8',
};

/**
 * What an uncategorised place is drawn in — the house mint, and the same value as `--mint-700`.
 *
 * A place whose category we could not read is still one of the user's places, and painting it grey
 * would make "we do not know" look like "this one is lesser". It is a colour and **not** a
 * category: it has no label and the filter bar offers no chip for it.
 */
export const UNCATEGORISED_COLOR = '#2E7A70';

/**
 * The pin's name label, drawn by MapLibre into the GL canvas rather than into the DOM — so it, too,
 * needs the literal rather than `var(--foreground)`.
 *
 * These are `--foreground` and `--background`. The halo is the page's warm near-white and not pure
 * white on purpose: a white halo on CARTO Positron's own near-white paper reads as a bright patch
 * around every name.
 */
export const PIN_LABEL_INK = '#1B1B1A';
export const PIN_LABEL_HALO = '#FAF9F6';
