/**
 * The tag facet row, rendered to static markup with `react-dom/server` — the only rendering this
 * repo's unit setup can do (vitest in a `node` environment, no jsdom, no testing library).
 *
 * `tagFacets`'s own tests own the counting; this file owns the two rules that are properties of the
 * *rendered row* and that `overnight-copy-deck.md` §9.1 states as acceptance criteria a verifier can
 * check without a browser:
 *
 *  - with a library that has no tags, `grep` finds no facet element in the output — **absent**, not
 *    disabled and not a placeholder;
 *  - every chip that does render carries a count and a tag the library holds.
 *
 * What it cannot claim: nothing here is evidence that the row scrolls without stealing the sheet's
 * drag, that a chip holds 44px on a device, or that two stacked chip rows are the right density on
 * a 390px phone. There is no layout and no pointer in a static string.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TagFacetBar } from '@/components/sheet/place-enrichment';
import { TagFilterContext, tagFacets, type TagFilter } from '@/ui/place/tag-filter';

interface Row {
  readonly tags: readonly string[];
}
const tagsOf = (row: Row) => row.tags;

/** The row inside a live filter context, which is the only state it draws anything in. */
function render(
  tagLists: readonly string[][],
  filter: TagFilter | null = { activeTag: null, onToggleTag: () => {} },
): string {
  const facets = tagFacets(
    tagLists.map((tags) => ({ tags })),
    tagsOf,
  );
  return renderToStaticMarkup(
    createElement(TagFilterContext, { value: filter }, createElement(TagFacetBar, { facets })),
  );
}

function chips(markup: string): readonly string[] {
  return markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

describe('TagFacetBar — what it offers', () => {
  it('draws one chip per tag the library holds, with its count', () => {
    // The aggregate read the product had no surface for: until now a tag could only be filtered by
    // if you had already happened to see it on a place you opened.
    const markup = render([['late night'], ['late night', 'wine'], ['wine'], ['brunch']]);
    const drawn = chips(markup);
    expect(drawn).toHaveLength(3);
    expect(drawn[0]).toContain('Late Night');
    expect(drawn[0]).toContain('>2<');
    expect(drawn[2]).toContain('Brunch');
    expect(drawn[2]).toContain('>1<');
  });

  it('renders nothing at all for a library with no tags', () => {
    // §9.1: not a disabled row, not a "no tags yet" line, not a placeholder. No string is needed
    // because nothing is shown, which is the point. This is the common case — nothing was
    // backfilled, so every place saved before extraction v2 has none.
    expect(render([[], [], []])).toBe('');
    expect(render([])).toBe('');
  });

  it('renders nothing without a filter context, because a chip there could not act', () => {
    // The same rule the detail's tag chips follow: with no provider they are inert labels rather
    // than controls that look pressable and do nothing.
    expect(render([['wine']], null)).toBe('');
  });

  it('never offers a tag no place carries', () => {
    // Every chip in the output names a tag from the rows, so tapping any of them yields ≥ 1 place.
    const markup = render([['wine'], ['brunch']]);
    expect(markup).toContain('Wine');
    expect(markup).toContain('Brunch');
    expect(markup).not.toContain('Late Night');
  });
});

describe('TagFacetBar — how it is announced and gestured', () => {
  it('is a named group rather than a row of loose toggle buttons', () => {
    expect(render([['wine']])).toContain('aria-label="Filter by tag"');
  });

  it('says the count in words, and contains the visible label', () => {
    // `Wine 1` read aloud is a loose number away from a sentence. Label-in-name: the accessible
    // name contains what the chip says rather than replacing it.
    const markup = render([['wine']]);
    expect(markup).toContain('aria-label="⁨Wine⁩, 1 place"');
    expect(render([['wine'], ['wine']])).toContain('aria-label="⁨Wine⁩, 2 places"');
  });

  it('carries the toggle state on the DOM, not in a class string', () => {
    // Rule 6a: `aria-pressed` is the state, and `CHIP_PRESSABLE` carries both arms as variants —
    // so a chip cannot look pressed while telling a screen reader it is not.
    const markup = render([['wine']]);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-pressed:bg-tag-selected');
  });

  it('does not let a horizontal swipe become a sheet drag', () => {
    // Without `data-vaul-no-drag` a drag that starts on this row hauls the whole sheet.
    expect(render([['wine']])).toContain('data-vaul-no-drag');
  });

  it('gives every chip the 44px touch floor and a press', () => {
    const chip = chips(render([['wine']]))[0] ?? '';
    expect(chip).toContain('min-h-11');
    expect(chip).toContain('motion-safe:active:scale-95');
  });
});
