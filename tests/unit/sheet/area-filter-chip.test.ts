/**
 * **The fifth filter's chip in the filter row** — `nls-plan.md` §5, the follow-up `bf10442` named.
 *
 * Rendered to static markup with `react-dom/server`, the only rendering this repo's unit setup can
 * do (vitest runs in `node`, there is no jsdom and no testing library), so the same limits
 * `library-filter-bar.test.ts` states apply here: this is evidence about which controls exist, in
 * what order and with what accessible names, and it is **not** evidence that a press does anything.
 * What a press does is held below by a source guard and, for real, by the browser passes recorded
 * in the task report.
 *
 * Two defects are pinned here, both of them the shape of "the row lies about what is narrowing the
 * library":
 *
 * 1. With an area on and nothing else, the row drew **no `Clear` at all** — `anythingActive` did
 *    not know the axis existed, so the one control that exists to say "something is narrowing this"
 *    said nothing while the library was confined to one city.
 * 2. There was no way to remove the area without removing something else as well.
 */

import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AreaFilterContext,
  LibraryFilterBar,
  type AreaFilterChip,
  type LibraryFilterBarProps,
} from '@/components/sheet/library-filter-bar';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { TagFacet } from '@/ui/place/tag-filter';

const FACETS: readonly CategoryFacet[] = [
  { category: 'restaurant', count: 6 },
  { category: 'cafe', count: 4 },
];

const TAGS: readonly TagFacet[] = [{ tag: 'bakery', label: 'Bakery', count: 3 }];

/** The library's own plurality spelling, Hebrew on purpose: half of this library is, and the chip
 *  carries an icon and an × on either side of an untrusted name. */
const TEL_AVIV = 'תל אביב-יפו';

const CHIP: AreaFilterChip = { label: TEL_AVIV, onClear: () => {} };

function render(
  overrides: Partial<LibraryFilterBarProps> = {},
  area: AreaFilterChip | null = null,
): string {
  const bar = createElement(LibraryFilterBar, {
    facets: FACETS,
    activeCategory: null,
    onToggleCategory: () => {},
    visitFilter: 'all' as const,
    onChangeVisitFilter: () => {},
    anyVisited: true,
    tagFacets: TAGS,
    activeTags: [],
    onToggleTag: () => {},
    onClearTags: () => {},
    ...overrides,
  });
  return renderToStaticMarkup(
    createElement(AreaFilterContext.Provider, { value: area }, bar),
  );
}

function buttons(markup: string): readonly string[] {
  return markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

/** What `isolate()` does to a name that has words after it. Written out rather than imported, so a
 *  change to the isolation is a failure here rather than a silent agreement. */
const ISOLATED_TEL_AVIV = `⁨${TEL_AVIV}⁩`;

describe('the area has a chip of its own', () => {
  it('shows the library’s own spelling, in the filter row, after the three menus', () => {
    const chips = buttons(render({}, CHIP));
    expect(chips).toHaveLength(5); // Been, Category, Tags, the area, Clear
    expect(chips[2]).toContain('>Tags<');
    expect(chips[3]).toContain(TEL_AVIV);
    expect(chips[4]).toContain('>Clear<');
  });

  it('is named for what pressing it does, with the name isolated for bidi', () => {
    // `Clear the ⁨תל אביב-יפו⁩ filter` — without the isolate the English tail is dragged into
    // the Hebrew run and reversed, which `isolate()` was written for and measured on.
    // No axis word: the same cell now holds a country, and `Clear the Israel area filter` was
    // wrong from the day a sentence could resolve one.
    expect(render({}, CHIP)).toContain(`aria-label="Clear the ${ISOLATED_TEL_AVIV} filter"`);
    expect(render({}, CHIP)).not.toContain('area filter');
  });

  it('is a 44 px target that the sheet will not read as the start of a drag', () => {
    const chip = buttons(render({}, CHIP))[3]!;
    expect(chip).toMatch(/class="[^"]*min-h-11/);
    expect(chip).toContain('data-vaul-no-drag');
  });

  it('opens nothing: a chevron opens, an × removes', () => {
    const chip = buttons(render({}, CHIP))[3]!;
    expect(chip).not.toContain('aria-expanded');
    expect(chip).not.toContain('aria-controls');
  });

  it('carries the name in its own bidi run, so the icon and the × keep their edges', () => {
    expect(buttons(render({}, CHIP))[3]!).toContain('dir="auto"');
  });

  it('is not drawn at all outside a provider — the axis is optional for every other host', () => {
    const chips = buttons(render());
    expect(chips).toHaveLength(3);
    expect(render()).not.toContain(TEL_AVIV);
  });
});

describe('the row stops lying about what is narrowing the library', () => {
  it('offers Clear when the area is the only thing on — defect 1', () => {
    // Before this, `anythingActive` was category/visit/tags only: a library confined to one city
    // drew a filter row with no clear in it.
    expect(render()).not.toContain('>Clear<');
    expect(render({}, CHIP)).toContain('>Clear<');
  });

  it('draws itself when the area is the only reason to exist', () => {
    // The early return is per axis. A library of one category, nothing marked been and no tags has
    // no menus to draw — and it can still be narrowed to a city by a sentence.
    const bare = { facets: [{ category: 'restaurant' as const, count: 12 }], anyVisited: false, tagFacets: [] };
    expect(render(bare)).toBe('');
    const withArea = render(bare, CHIP);
    expect(withArea).toContain(TEL_AVIV);
    expect(withArea).toContain('>Clear<');
  });
});

/**
 * **Behaviour, held at the source**, because a static string has no events. Two assertions, both
 * about the same rule: `Clear` empties the row, and the chip empties only itself.
 */
describe('what the two clears clear', () => {
  const source = readFileSync(
    new URL('../../../src/components/sheet/library-filter-bar.tsx', import.meta.url),
    'utf8',
  );

  it('`Clear` takes the area with it, alongside the other three axes', () => {
    const clearAll = source.slice(source.indexOf('CLEAR_ALL_ACCESSIBLE_NAME}'));
    const body = clearAll.slice(clearAll.indexOf('onClick'), clearAll.indexOf('className'));
    expect(body).toContain('onToggleCategory(activeCategory)');
    expect(body).toContain("onChangeVisitFilter('all')");
    expect(body).toContain('onClearTags()');
    expect(body).toContain('area?.onClear()');
  });

  it('the chip clears the area and nothing else', () => {
    expect(source).toContain('onClick={area.onClear}');
  });
});
