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

import type { Theme } from '@/lib/theme';
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

/* -------------------------------------------------------------------------- */
/* Night                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * **The category colours for a dark ground — and the reason this file grew a second set rather
 * than the DOM growing a theme prop.**
 *
 * W7-1 discovered the thing that makes this necessary: **nothing in `src/` reads a `--category-*`
 * CSS token.** Every DOM surface that paints a category — the row's disc, the filter chip's dot,
 * the profile swatch — calls `categoryDisplay()` and applies the literal from this module as an
 * inline `style`. So a dark palette in `globals.css` themed *nothing*, and the discs stayed light
 * under a rebuilt dark theme.
 *
 * That turned out to be good news. The DOM half and the GL half read the same module, so making
 * *this* theme-aware fixes both at once and they cannot diverge afterwards — a strictly better
 * arrangement than the two-sided duplication `palette-tokens.test.ts` exists to police.
 *
 * **Measured, not picked.** The light values on a dark card are café **2.2:1** and bar **2.7:1** —
 * a café disc on a night row is very nearly invisible. Lifted, all four clear AA as ink (5.5–7.8:1
 * on `--card`), and they keep separating from each other: the worst pair is restaurant/café at
 * **ΔE 23.2**, better than the light set's own worst pair (20.1, after W0-2 retuned café for
 * exactly this confusion). Hue identity is preserved — a café is still brown, a bar is still purple
 * — because "a café is the same brown wherever it appears" survives a change of ground; what does
 * not survive is a fixed lightness.
 */
export const CATEGORY_COLOR_DARK: Readonly<Record<ProductCategory, string>> = {
  restaurant: '#E8735C',
  cafe: '#C99A55',
  bar: '#A288E0',
};

/** The house mint at night. `--mint-400`'s neighbour rather than the mint itself: it has to read as
 *  a *place colour* beside the three above, not as the brand. */
export const UNCATEGORISED_COLOR_DARK = '#5FC3B4';

/** The ink that sits **on** a category fill — a pressed filter chip, a pin glyph. White on the
 *  light fills (5.0 / 7.8 / 6.3 : 1); the ground on the dark ones (6.2 / 7.3 / 6.3 : 1), where
 *  white would be 2.1–3.0 and the mint ink would be 4.1. Mirrors `--on-category` in `globals.css`,
 *  which is the same decision for the DOM. */
export const ON_CATEGORY_INK = '#FFFFFF';
export const ON_CATEGORY_INK_DARK = '#131312';

/** A pin's label on a night basemap: the ground is what the halo has to separate the name from, so
 *  a white halo — correct on paper — becomes the wrong ring entirely. */
export const PIN_LABEL_INK_DARK = '#F4F2EC';
export const PIN_LABEL_HALO_DARK = '#131312';

/**
 * **The seam.** Everything that paints a place, resolved for one theme, in one call.
 *
 * This is the shape `components/map/marker-style.ts` should consume — it is held by another lane,
 * so the seam is defined here and the map side is a separate change. A MapLibre style expression
 * cannot resolve a CSS custom property (see this file's header), so the map genuinely needs
 * literals; what it does not need is its own opinion about which literals.
 *
 * A plain function of the theme rather than a hook or a module-level cache: the map rebuilds its
 * style when the theme changes, and a stale closure over "the theme at import time" is exactly the
 * bug that would survive every unit test and only show up on a real toggle.
 */
export interface PlacePalette {
  readonly category: Readonly<Record<ProductCategory, string>>;
  readonly uncategorised: string;
  /** The ink on a category fill. */
  readonly onCategory: string;
  readonly labelInk: string;
  readonly labelHalo: string;
}

export function placePalette(theme: Theme): PlacePalette {
  return theme === 'dark'
    ? {
        category: CATEGORY_COLOR_DARK,
        uncategorised: UNCATEGORISED_COLOR_DARK,
        onCategory: ON_CATEGORY_INK_DARK,
        labelInk: PIN_LABEL_INK_DARK,
        labelHalo: PIN_LABEL_HALO_DARK,
      }
    : {
        category: CATEGORY_COLOR,
        uncategorised: UNCATEGORISED_COLOR,
        onCategory: ON_CATEGORY_INK,
        labelInk: PIN_LABEL_INK,
        labelHalo: PIN_LABEL_HALO,
      };
}

/* -------------------------------------------------------------------------- */
/* The DOM's half                                                              */
/* -------------------------------------------------------------------------- */

/**
 * **What a DOM surface should paint with instead of a literal.**
 *
 * The tokens in `globals.css` already carry both themes and already switch under `.dark`; they were
 * simply read by nothing. A `var(--category-cafe)` in an inline `style` follows the theme with no
 * hook, no context, no re-render and no prop — which is why the DOM does not need `placePalette`
 * and the map does.
 *
 * Kept here rather than in `category-display.ts` because that file is asserted to contain no colour
 * literal at all (`palette-tokens.test.ts`), and a `var()` reference naming a token is close enough
 * to one that putting it there would be arguing with the spirit of a guard that is right.
 */
export const CATEGORY_COLOR_VAR: Readonly<Record<ProductCategory, string>> = {
  restaurant: 'var(--category-restaurant)',
  cafe: 'var(--category-cafe)',
  bar: 'var(--category-bar)',
};

export const UNCATEGORISED_COLOR_VAR = 'var(--category-uncategorised)';

/** The token twin of `ON_CATEGORY_INK`. */
export const ON_CATEGORY_INK_VAR = 'var(--on-category)';
