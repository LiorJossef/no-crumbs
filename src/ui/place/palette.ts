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

/* -------------------------------------------------------------------------- */
/* The ramps                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Five steps per category, and every one of them is drawn in
 * `docs/no-crumbs-design-system.html` §`system`.**
 *
 * The product had four hard-coded hexes and no scale, so a chip wash borrowed the mint tag colour
 * and said nothing, and anything wanting a category as a *ground* rather than as ink had to compute
 * one. `#system`: *"fix that and the map, the chips, the rows, the pins and the collection covers
 * all light up at once, from one file."*
 *
 * The steps map onto jobs rather than onto lightness for its own sake: **100** is a wash a chip or
 * a row can sit on, **300** a border or a disabled state, **500** a hover or a secondary fill,
 * **700** the pin and the ink, **900** text on the 100 wash (8.5–11.7:1 on it, every family).
 *
 * `--cat-*-…` in `globals.css` mirrors this, and `tests/unit/ui/palette-tokens.test.ts` is what
 * keeps the two sides honest — see this file's header for why the duplication is deliberate.
 *
 * **Adopted at the role level, not yet at every call site.** `CATEGORY_COLOR` below resolves to the
 * ramp, so every pin, disc and chip in the product moved with this change. The 100/300/500/900
 * steps are published and not yet read by anything: `categoryTintVar()` still computes its wash
 * with `color-mix` and `--tint-strength`, which is a *different* answer to the same question and
 * the one that is currently measured in both themes. Replacing it with the 100 step is a real
 * change to a live surface and belongs with whoever holds that surface, not with a token commit.
 */
export const CATEGORY_RAMP = {
  /**
   * **Persimmon**, replacing `#C2452F`. `#system`: *"brick, and reads brown beside the café."*
   */
  restaurant: {
    100: '#FDECE7',
    300: '#FBB9A6',
    500: '#F2704A',
    700: '#D9482A',
    900: '#7E2412',
  },
  /**
   * **Amber**, replacing `#6F4A2B`.
   *
   * The document's argument is that a genuine brown *"at 15px on a warm map is indistinguishable
   * from the restaurant red — amber separates cleanly and still reads coffee"*, and it names
   * `#8A5A3B` as the value it is arguing against. That is the value from **before** W0-2 retuned
   * this, not the one that ships; see `CATEGORY_COLOR` for what the measurement says about the two
   * of them.
   */
  cafe: {
    100: '#FBF0DE',
    300: '#F0CE8C',
    500: '#D9992F',
    700: '#A66A18',
    /**
     * **The one value in this file the design system does not draw**, and it is here because a
     * measurement put it here rather than a preference. Lab-interpolated between the published 700
     * and 900 of this same ramp, so it is a step on the specified amber and not a fourth opinion
     * about what a café is. `CATEGORY_COLOR` carries the numbers.
     */
    800: '#6C430B',
    900: '#5E3A08',
  },
  /**
   * **Violet**, and the hue is unchanged: `#system` calls it *"the one that worked"*. What it gains
   * is the ramp, and specifically the light-wash step for chips, which today borrow the mint tag
   * colour and therefore say nothing about the category they are filtering.
   */
  bar: {
    100: '#EFEBFB',
    300: '#C7B9F2',
    500: '#8B6CE6',
    700: '#6A4BD0',
    900: '#33206E',
  },
  /**
   * **House mint, unchanged and deliberately so.** Mint is the *action* — the primary button, the
   * focus ring, the uncategorised pin. Once category has its own colours mint stops competing for
   * that job and starts doing only this one.
   */
  uncategorised: {
    100: '#F1FBF9',
    300: '#C0EFE5',
    500: '#A8ECE2',
    700: '#2E7A70',
    900: '#123B35',
  },
} as const;

/**
 * The three categories the taxonomy defines, **as the ramp's ink step**.
 *
 * ## Restaurant, bar and uncategorised are the design system's values verbatim
 *
 * `#D9482A` persimmon replaces `#C2452F`, which is brick; `#6A4BD0` keeps the hue that already
 * worked; mint is untouched. Measured across the four, CIEDE2000: the worst pair goes from **20.1**
 * to **21.1** and every other pair improves — restaurant/bar 38.1 → 44.1, café/bar 39.1 → 54.5.
 *
 * ## Café is on the amber ramp, and it is on the 800 step rather than the 700 the document draws
 *
 * **This is the one place iteration 2 does not build the drawing as drawn, and it is a measurement
 * rather than taste.** The instrument was validated first — against the sixteen published
 * CIEDE2000 pairs of Sharma, Wu & Dalal (worst error 4e-5), against WCAG's own anchors, and against
 * the three ΔE figures already written in this file's history (20.1 / 14.8 / 23.2), which it
 * reproduces to the decimal. Colour-vision simulation is Machado, Oliveira & Fernandes (2009) at
 * severity 1.0.
 *
 * | restaurant / café | ΔE00 | L\* gap | deuteranopia | protanopia | ring-ink on the body |
 * |---|---|---|---|---|---|
 * | `#C2452F` / `#6F4A2B`, before this change | 23.8 | 16.4 | **21.2** | 10.8 | 7.41:1 |
 * | `#D9482A` / `#A66A18`, as `#system` draws it | 21.1 | **1.3** | **3.4** | 6.0 | 4.25:1 |
 * | `#D9482A` / `#6C430B`, what ships | 26.7 | 19.0 | 21.2 | 11.3 | 8.16:1 |
 *
 * **ΔE00 alone passes the specified pair — 21.1, above every floor in this repository — and
 * deuteranopia takes it to 3.4.** Two colours that no longer differ, on the one surface where
 * colour is the entire encoding, for roughly one man in twelve. That is the instrument lesson from
 * `overnight-run-report.md` §7 in its purest form: a number that is correct and answers a narrower
 * question than the one that matters.
 *
 * `tests/unit/ui/palette-tokens.test.ts` already knew. It asserts `|L* restaurant − L* café| > 8`
 * and says why: *"lightness is the axis that survives a 26px disc and a red-green deficiency; hue
 * alone does not."* The specified pair is 1.3 apart and fails it. The guard is right.
 *
 * So café takes the ramp's darker step, which delivers the document's actual answer — café leaves
 * desaturated brown for the amber family, hue 26° → 35°, chroma up — while regressing **no** axis:
 * it is better than today's on all four columns above. Flipping this to `700` is one edit if the
 * owner rules the other way, and the row that says what that costs is in the table.
 *
 * **What did not change, and is not this change's to fix:** the night pair `#E8735C` / `#C99A55` is
 * ΔE00 23.2 and **deutan 3.1**. It already ships, it was tuned before anyone simulated it, and it
 * is a separate ruling.
 */
export const CATEGORY_COLOR: Readonly<Record<ProductCategory, string>> = {
  restaurant: CATEGORY_RAMP.restaurant[700],
  cafe: CATEGORY_RAMP.cafe[800],
  bar: CATEGORY_RAMP.bar[700],
};

/**
 * What an uncategorised place is drawn in — the house mint, and the same value as `--mint-700`.
 *
 * A place whose category we could not read is still one of the user's places, and painting it grey
 * would make "we do not know" look like "this one is lesser". It is a colour and **not** a
 * category: it has no label and the filter bar offers no chip for it.
 */
export const UNCATEGORISED_COLOR = CATEGORY_RAMP.uncategorised[700];

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
