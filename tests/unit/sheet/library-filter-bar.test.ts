/**
 * The header's three filter menus and their triggers, rendered to static markup with
 * `react-dom/server` — the only rendering this repo's unit setup can do: vitest runs in a `node`
 * environment, there is no jsdom and no testing library, and `vitest.config.ts` only collects
 * `*.test.ts`, so components are driven through `createElement` rather than JSX.
 *
 * What that buys and what it does not, stated plainly because it decides what these assertions may
 * claim: the markup is real, so the accessibility contract (`aria-pressed`, `aria-expanded`, the
 * radio groups, the 44 px targets, `data-vaul-no-drag`) is genuinely checked, and so is which
 * controls exist for a given state. **Nothing here is evidence that a menu opens, that focus
 * returns to its trigger, that anything is hittable, or that 40 px of paint sits inside a 44 px
 * band.** There is no layout, no CSS, no pointer and no event in a static string. The menus are
 * therefore closed in every render below, exactly as they are at rest — the open state was measured
 * by hand in a browser at 375x812, 390x844 and 1440x900 with `elementFromPoint`.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LibraryFilterBar } from '@/components/sheet/library-filter-bar';
import type { LibraryFilterBarProps } from '@/components/sheet/library-filter-bar';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { TagFacet } from '@/ui/place/tag-filter';
import { CATEGORY_COLOR } from '@/ui/place/palette';

const FACETS: readonly CategoryFacet[] = [
  { category: 'restaurant', count: 6 },
  { category: 'cafe', count: 4 },
  { category: 'bar', count: 1 },
];

const TAGS: readonly TagFacet[] = [
  { tag: 'wine', label: 'Wine', count: 3 },
  { tag: 'late night', label: 'Late Night', count: 2 },
];

function render(overrides: Partial<LibraryFilterBarProps> = {}): string {
  return renderToStaticMarkup(
    createElement(LibraryFilterBar, {
      facets: FACETS,
      activeCategory: null,
      onToggleCategory: () => {},
      visitFilter: 'all' as const,
      onChangeVisitFilter: () => {},
      // The default is a library where somebody has marked something, because that is the state
      // every assertion about the visit axis is actually about.
      anyVisited: true,
      tagFacets: TAGS,
      activeTags: [],
      onToggleTag: () => {},
      onClearTags: () => {},
      ...overrides,
    }),
  );
}

/** Every `<button>` in the markup, in DOM order. Crude on purpose — a regex over static markup is
 *  enough to answer "which controls, in what order, in what state". */
function buttons(markup: string): readonly string[] {
  return markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

describe('LibraryFilterBar — one trigger per axis, because they are not one question', () => {
  it('draws Been, Category and Tags as three separate triggers', () => {
    // Owner, 2026-09-02: "maybe we should have a dropdown for each of the filters instead of having
    // it in one place / cause they are not related". One generic `Filter` was calmer than the
    // sixteen pills it replaced and it also hid which axes existed at all.
    const chips = buttons(render());
    expect(chips).toHaveLength(3);
    expect(chips[0]).toContain('>Been<');
    expect(chips[1]).toContain('>Category<');
    expect(chips[2]).toContain('>Tags<');
  });

  it('keeps every option out of the resting markup — they are behind a trigger, not deleted', () => {
    const markup = render();
    expect(markup).not.toContain('Restaurant');
    expect(markup).not.toContain('Café');
    expect(markup).not.toContain('Late Night');
    expect(markup).not.toContain('Not been yet');
  });

  it('says each one is a closed disclosure, and says which menu it opens', () => {
    const markup = render();
    expect((markup.match(/aria-expanded="false"/g) ?? []).length).toBe(3);
    expect((markup.match(/aria-controls="[^"]+"/g) ?? []).length).toBe(3);
  });

  it('wraps rather than scrolling, because a control that hides at rest is the whole defect', () => {
    // D1 in `ux-visit-filter-and-chip-density-2026-09-02.md`: a container whose job is to hide
    // overflow cannot hold controls whose whole job is to be legible without being pressed. Three
    // triggers plus `Clear` plus the sort control is ~310 px against ~358 px of content width at
    // 375, so a second line is the honest cost.
    const markup = render();
    expect(markup).toContain('flex-wrap');
    expect(markup).not.toContain('overflow-x-auto');
  });

  it('leaves out an axis that cannot change the result', () => {
    // Nothing marked been: two of the three visit states return the same rows. One category: its
    // selected and unselected states show the same twelve places. No tags: nothing to pick from.
    const chips = buttons(
      render({ facets: [{ category: 'restaurant', count: 12 }], anyVisited: false, tagFacets: [] }),
    );
    expect(chips).toHaveLength(0);
  });

  it('renders nothing at all when no axis and no trailing control has anything to offer', () => {
    // An empty flex row is invisible but not free — it is a `gap` child in the sheet's column, so
    // it opens a hole under the search field.
    expect(
      render({ facets: [{ category: 'restaurant', count: 12 }], anyVisited: false, tagFacets: [] }),
    ).toBe('');
  });

  it('keeps the tags axis for a one-category library', () => {
    // The gate is per axis, not on `facets.length`: a library of one kind of place can still have
    // tags and been marks, and an earlier version hid the tag list of exactly that library.
    const chips = buttons(
      render({ facets: [{ category: 'restaurant', count: 12 }], anyVisited: false }),
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('aria-label="Tags, showing all"');
  });
});

describe('LibraryFilterBar — every trigger states its own value without being pressed', () => {
  it('reads the axis word and is unpressed when that axis is not narrowing', () => {
    for (const chip of buttons(render())) {
      expect(chip).toContain('aria-pressed="false"');
      expect(chip).toMatch(/aria-label="(Been|Category|Tags), showing all"/);
    }
  });

  it('shows the visit state by name', () => {
    // Defect D2: two visual states for three meanings. `Not been yet` is on the trigger, so the
    // state is legible without opening anything.
    const chips = buttons(render({ visitFilter: 'not-been' }));
    expect(chips[0]).toContain('Not been yet');
    expect(chips[0]).toContain('aria-pressed="true"');
    expect(chips[0]).toContain('aria-label="Been, Not been yet"');
  });

  it('shows the active category with its count, in that category own colour', () => {
    // `facelift-plan.md` :81 and :144 make the category colour load-bearing across pins, chips and
    // counts. The chip was only ever the container; the colour is the part that must survive.
    const chips = buttons(render({ activeCategory: 'cafe' }));
    expect(chips[1]).toContain('Café');
    expect(chips[1]).toContain('>4<');
    expect(chips[1]).toContain('--tag-selected:var(--category-cafe)');
    expect(chips[1]).toContain('--tag-selected-foreground:var(--on-category)');
    expect(chips[1]).toContain('aria-label="Category, Café"');
  });

  it('paints through the token rather than an inline literal, so it can follow the theme', () => {
    const chips = buttons(render({ activeCategory: 'cafe' }));
    expect(chips[1]).toContain('var(--category-cafe)');
    expect(chips[1]).not.toContain(CATEGORY_COLOR.cafe);
  });

  it('names one selected tag and counts several, because three names would be the whole row', () => {
    expect(buttons(render({ activeTags: ['wine'] }))[2]).toContain('aria-label="Tags, Wine"');
    const many = buttons(render({ activeTags: ['wine', 'late night'] }))[2] ?? '';
    expect(many).toContain('>2<');
    expect(many).toContain('aria-pressed="true"');
  });

  it('holds the 44 px target while painting at 32, and keeps a visible focus ring', () => {
    // Owner, 2026-09-02: the controls "feel too large, heavy". The paint shrinks; the target does
    // not. `min-h-11` is on the button, `h-8` on the pill inside it, and the 6 px band between them
    // is transparent hit area — proved in a browser with `elementFromPoint`, since a static string
    // cannot say anything about hit testing.
    for (const chip of buttons(render())) {
      expect(chip).toContain('min-h-11');
      expect(chip).toContain('h-8');
      expect(chip).toContain('py-1.5');
      expect(chip).toContain('group-focus-visible/trigger:ring-3');
    }
  });

  it('is quiet at rest: no fill, no bold, and mint only once that axis is on', () => {
    const resting = buttons(render())[0] ?? '';
    expect(resting).toContain('bg-card');
    expect(resting).not.toContain('bg-tag-selected');
    expect(resting).not.toContain('font-bold');
    expect(buttons(render({ visitFilter: 'been' }))[0]).toContain('bg-tag-selected');
  });

  it('does not let a press on a trigger start a sheet drag', () => {
    expect((render().match(/data-vaul-no-drag/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('carries no `x` — the dismissal glyph with no dismissal control behind it is deleted', () => {
    // Defect D3. It was `aria-hidden` decoration inside the visit chip: a screen reader heard
    // nothing and a sighted user read "close".
    expect(render({ visitFilter: 'not-been' })).not.toContain('lucide-x');
  });
});

describe('LibraryFilterBar — Clear is a word, and only when there is something to clear', () => {
  it('is absent while nothing is narrowing', () => {
    // A permanently visible `Clear` is a dead control eating the width this row exists to save.
    expect(render()).not.toContain('Clear');
  });

  it('appears the moment any axis is on', () => {
    expect(render({ activeCategory: 'cafe' })).toContain('>Clear<');
    expect(render({ visitFilter: 'been' })).toContain('>Clear<');
    expect(render({ activeTags: ['wine'] })).toContain('>Clear<');
  });

  it('says what it does, in words, at the touch floor', () => {
    const markup = render({ activeCategory: 'cafe' });
    expect(markup).toContain('aria-label="Clear all filters"');
    expect(markup).toMatch(/<button[^>]*aria-label="Clear all filters"[^>]*class="[^"]*min-h-11/);
    expect(markup).not.toContain('lucide-x');
  });
});
