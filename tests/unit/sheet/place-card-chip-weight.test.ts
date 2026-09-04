/**
 * **CARD-4** — the three follow-ups the card's own measurement left open.
 *
 * Rendered with `react-dom/server` to static markup, the only rendering this repo's unit setup can
 * do (vitest runs in `node`, no jsdom, no testing library). So the class assertions below are real
 * evidence about what is emitted, and anything about what a *press* does is a source guard, exactly
 * as `area-filter-chip.test.ts` states.
 */

import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CHIP_PRESSABLE, TagChipList } from '@/components/sheet/place-enrichment';
import { TagFilterContext, type TagFilter } from '@/ui/place/tag-filter';

const TAGS = ['bakery', 'pan asian'] as const;

const FILTER: TagFilter = { activeTags: [], onToggleTag: () => {} };

function render(filter: TagFilter | null): string {
  const list = createElement(TagChipList, { tags: TAGS });
  return renderToStaticMarkup(
    filter === null ? list : createElement(TagFilterContext, { value: filter }, list),
  );
}

/**
 * **The hierarchy inversion the owner called "overwhelming".** Measured on `Kohi` at 390x844:
 * band 1 held five bordered pressables, four of them tags, all at `font-bold` — so the loudest
 * objects on a place's card were its *tags*, outweighing `Been here`, which is the primary. The
 * chips measure 6.45:1 in light and 10.88:1 in dark, and contrast is weight-independent, so AA
 * holds at 500 and the demotion costs nothing legible.
 */
describe('the detail chip is quieter than the primary action', () => {
  it('the pressable chip is medium, not bold', () => {
    expect(CHIP_PRESSABLE).toContain('font-medium');
    expect(CHIP_PRESSABLE).not.toContain('font-bold');
  });

  it('the tag list is one 6 px gap whether the chips are controls or labels', () => {
    // It used to be `gap-2` for controls and `gap-1.5` for labels — the same block of tags,
    // spaced two different ways, and the wider one on the surface the owner called crowded.
    expect(render(FILTER)).toContain('gap-1.5');
    expect(render(null)).toContain('gap-1.5');
    expect(render(FILTER)).not.toContain('gap-2');
  });

  it('both arms still render one chip per tag', () => {
    expect(render(FILTER).match(/<button/g)).toHaveLength(TAGS.length);
    expect(render(null)).toContain('Pan Asian');
  });
});

/**
 * **`Clear all` cleared four of five.** Since the area filter gained a chip and started composing
 * (`bd2106c`), `onClear` — written by each host out of the four page handlers it holds — did not
 * touch the area. With a city on and a search that matched nothing, the button said "all" and left
 * the area filtering with its chip up.
 */
describe('the empty-list escape clears every axis, including the area', () => {
  const source = readFileSync(
    new URL('../../../src/components/sheet/place-sheet.tsx', import.meta.url),
    'utf8',
  );
  const escape = source.slice(source.indexOf('export function NothingHereEscape'));

  it('reads the fifth axis from the same context the filter row reads', () => {
    expect(escape).toContain('use(AreaFilterContext)');
  });

  it('the button clears the area alongside whatever the host passed', () => {
    const button = escape.slice(escape.indexOf('onClick'), escape.indexOf('CLEAR_EVERYTHING_LABEL'));
    expect(button).toContain('onClear()');
    expect(button).toContain('area?.onClear()');
  });
});

/**
 * **The desktop header's sentence entry**, the `lg+` twin of `6873202`. Measured at 1280x900: the
 * aside sat 16 px under the field and 16 px above the filter row, perfectly equidistant, so it read
 * as an orphan. Both gates survive, and the wrapper draws nothing when there is no aside.
 */
describe('the sentence entry belongs to the field above it on both surfaces', () => {
  function group(file: string): string {
    const source = readFileSync(
      new URL(`../../../src/components/sheet/${file}`, import.meta.url),
      'utf8',
    );
    const at = source.indexOf('<PlaceSearchField');
    return source.slice(source.lastIndexOf('{!libraryIsEmpty', at), at + 400);
  }

  for (const file of ['place-sheet.tsx', 'place-desktop-panel.tsx']) {
    it(`${file} wraps the field and its aside in one 6 px group`, () => {
      const block = group(file);
      expect(block).toContain('flex flex-col gap-1.5');
      expect(block).toContain('{searchAside}');
      // Both gates, on the group rather than twice on two children.
      expect(block).toContain('!libraryIsEmpty && !selecting');
    });
  }

  it('neither host still renders the aside as a loose sibling of the column', () => {
    for (const file of ['place-sheet.tsx', 'place-desktop-panel.tsx']) {
      const source = readFileSync(
        new URL(`../../../src/components/sheet/${file}`, import.meta.url),
        'utf8',
      );
      expect(source).not.toContain('!selecting && searchAside');
    }
  });
});
