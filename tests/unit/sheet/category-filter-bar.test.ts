/**
 * The bar rendered to static markup with `react-dom/server`, which is the only rendering this
 * repo's unit setup can do: vitest runs in a `node` environment, there is no jsdom and no testing
 * library, and `vitest.config.ts` only collects `*.test.ts`, so the component is driven through
 * `createElement` rather than JSX.
 *
 * What that buys and what it does not, stated plainly because it decides what these assertions may
 * claim: the markup is real, so the accessibility contract (`aria-pressed`, the group and its name,
 * the accessible names, the 44 px class, `data-vaul-no-drag`) is genuinely checked, and so is which
 * chips exist for a given set of facets. **Nothing here is evidence that it looks right, scrolls
 * without trapping the sheet's drag, or holds 44 px on a device.** There is no layout, no CSS and
 * no pointer in a static string.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CategoryFilterBar } from '@/components/sheet/category-filter-bar';
import type { CategoryFilterBarProps } from '@/components/sheet/category-filter-bar';
import type { CategoryFacet } from '@/domain/places/category-filter';

const FACETS: readonly CategoryFacet[] = [
  { category: 'restaurant', count: 6 },
  { category: 'cafe', count: 4 },
  { category: 'other', count: 1 },
];

function render(overrides: Partial<CategoryFilterBarProps> = {}): string {
  return renderToStaticMarkup(
    createElement(CategoryFilterBar, {
      facets: FACETS,
      activeCategory: null,
      onToggleCategory: () => {},
      notBeenOnly: false,
      onToggleNotBeen: () => {},
      ...overrides,
    }),
  );
}

/** Every `<button>` in the markup, in DOM order. Crude on purpose — a regex over static markup is
 *  enough to answer "which chips, in what order, in what pressed state". */
function buttons(markup: string): readonly string[] {
  return markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

describe('CategoryFilterBar — what it offers', () => {
  it('draws one chip per facet, plus the visit chip, in the order it was given', () => {
    const chips = buttons(render());
    expect(chips).toHaveLength(4);
    expect(chips[0]).toContain('Not been yet');
    expect(chips[1]).toContain('Restaurant');
    expect(chips[2]).toContain('Café');
    // `other` renders as "Place" — the display layer's word, not a new string.
    expect(chips[3]).toContain('Place');
  });

  it('renders no chip for a category that is not in the facets', () => {
    const markup = render({ facets: [{ category: 'cafe', count: 2 }, { category: 'bar', count: 1 }] });
    expect(markup).toContain('Café');
    expect(markup).toContain('Bar');
    expect(markup).not.toContain('Restaurant');
    expect(markup).not.toContain('Dessert');
  });

  it('carries each chip\'s count', () => {
    const chips = buttons(render());
    expect(chips[1]).toContain('>6<');
    expect(chips[2]).toContain('>4<');
  });

  it('renders nothing at all when the library has no places', () => {
    expect(render({ facets: [] })).toBe('');
  });

  it('keeps the row but drops the category chips when the library is all one kind of place', () => {
    const chips = buttons(render({ facets: [{ category: 'restaurant', count: 12 }] }));
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('Not been yet');
    // A single chip's pressed and unpressed states would show the same twelve rows.
    expect(chips[0]).not.toContain('Restaurant');
  });
});

describe('CategoryFilterBar — the state model', () => {
  it('says nothing is pressed when no filter is set', () => {
    for (const chip of buttons(render())) {
      expect(chip).toContain('aria-pressed="false"');
    }
  });

  it('presses exactly the selected category', () => {
    const chips = buttons(render({ activeCategory: 'cafe' }));
    expect(chips[2]).toContain('aria-pressed="true"');
    expect(chips.filter((chip) => chip.includes('aria-pressed="true"'))).toHaveLength(1);
  });

  it('presses the visit chip independently of the category chips', () => {
    const chips = buttons(render({ notBeenOnly: true, activeCategory: 'cafe' }));
    expect(chips[0]).toContain('aria-pressed="true"');
    expect(chips[2]).toContain('aria-pressed="true"');
    expect(chips[1]).toContain('aria-pressed="false"');
  });

  it('shows the pressed chip even at a count of zero, so the filter can always be undone', () => {
    const chips = buttons(
      render({
        facets: [{ category: 'cafe', count: 3 }, { category: 'bar', count: 0 }],
        activeCategory: 'bar',
      }),
    );
    expect(chips[2]).toContain('Bar');
    expect(chips[2]).toContain('aria-pressed="true"');
    expect(chips[2]).toContain('0 places');
  });

  it('every chip is a type="button", so none of them submits anything', () => {
    for (const chip of buttons(render())) {
      expect(chip).toContain('type="button"');
    }
  });
});

describe('CategoryFilterBar — accessibility', () => {
  it('is a named group rather than a row of loose toggle buttons', () => {
    const markup = render();
    expect(markup).toContain('role="group"');
    expect(markup).toMatch(/aria-label="[^"]+"/);
  });

  it('names each category chip in words, and the name contains the visible label', () => {
    const chips = buttons(render());
    expect(chips[1]).toContain('aria-label="Restaurant, 6 places"');
    expect(chips[2]).toContain('aria-label="Café, 4 places"');
    expect(chips[3]).toContain('aria-label="Place, 1 place"');
  });

  it('leaves the colour dot out of the accessibility tree — colour never carries meaning alone', () => {
    const markup = render();
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('rounded-full');
  });

  it('holds the 44 px touch floor on every chip, which is why the merge happened', () => {
    for (const chip of buttons(render())) {
      expect(chip).toContain('min-h-11');
      expect(chip).not.toContain('min-h-8');
      expect(chip).not.toContain('min-h-9');
    }
  });

  it('keeps a visible focus ring on every chip', () => {
    for (const chip of buttons(render())) {
      expect(chip).toContain('focus-visible:ring');
    }
  });

  it('has no live region — the list and the heading already report the result', () => {
    const markup = render();
    expect(markup).not.toContain('aria-live');
    expect(markup).not.toContain('role="status"');
  });
});

describe('CategoryFilterBar — the gestures it must not steal', () => {
  it('marks the scroll row so a horizontal swipe is not read as a sheet drag', () => {
    expect(render()).toContain('data-vaul-no-drag');
  });

  it('scrolls horizontally and does not chain that scroll to the page', () => {
    const markup = render();
    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('overscroll-x-contain');
  });
});
