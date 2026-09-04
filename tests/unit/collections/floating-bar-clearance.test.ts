/**
 * The floating `BottomNav`'s share of every column the shell puts in the sheet — the collections
 * half.
 *
 * `/map`'s place detail is pinned by `tests/unit/shell/sheet-geometry.test.ts` and
 * `tests/unit/sheet/place-detail-floating-bar.test.ts`. Fixing it turned up three more surfaces
 * with the same two failures, all of them measured in a browser before they were touched:
 *
 *  1. **The collections index** (`app/map/collections-index-list.tsx`) declared
 *     `height: STOP_TO_CONTENT_HEIGHT[stop]` on an element that was *also* `flex-1`. `flex-1` is
 *     `flex: 1 1 0%`, and a flex basis of `0%` replaces the main-axis height, so the cap was
 *     declared and then ignored. Measured at 390×844 with the drawer at `half`: declared
 *     `calc(55dvh - 70px)`, **computed 772 px**, the scroller `scrollHeight 726 === clientHeight
 *     726` — inert — with its bottom 380 px below the screen.
 *  2. **A place inside a collection** (`collection-place-detail.tsx` → `PlaceDetail`
 *     `variant="hosted"`) had the box but not the padding. Measured at maximum scroll:
 *     `Remove from this collection` at y 770–814 against a bar at 776–844, **5/5 hit-test points
 *     blocked**.
 *  3. **`Add places`'s own pinned footer** (`AddPlacesPanel`) padded for the home indicator and not
 *     for the bar — the same defect its sibling, the collection list's footer, had already been
 *     fixed for. Measured with one place picked: `Add 1 place` at y 784–832, **5/5 blocked**.
 *     After: 716–764, 0/5.
 *
 * ## Why these read source rather than render
 *
 * `vitest.config.ts` sets `environment: 'node'`: there is no layout here, so a test can only assert
 * what a component *declares*. Two of these three are also unreachable from a unit test at all —
 * `CollectionContent` needs a router, a drawer and a live collection. The browser evidence lives in
 * the task report; what this file protects is that the declaration is still there and still derived.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { floatingBarClearancePx } from '@/components/shell/sheet-geometry';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

const CONTENT = repoFile('src/components/collections/collection-content.tsx');
const HOSTED = repoFile('src/components/collections/collection-place-detail.tsx');
const SHARE = repoFile('src/components/collections/share-panel.tsx');
const INDEX = repoFile('src/app/map/collections-index-list.tsx');

describe('every view CollectionContent puts in the sheet is told what the bar costs', () => {
  it('is asked once per view, from the geometry module', () => {
    // Three views, three call sites. `CollectionList`'s own `barPx` is the fourth reader and was
    // the only one that had the number before this change.
    const asked = CONTENT.match(/floatingBarClearancePx\(/g) ?? [];
    expect(asked.length).toBeGreaterThanOrEqual(4);
    for (const view of ['SharePanel', 'AddPlacesPanel', 'CollectionPlaceDetail']) {
      expect(CONTENT, view).toContain(`<${view}\n        floatingBarPx={floatingBarClearancePx(`);
    }
  });

  it('no longer re-derives the conditional it used to open-code', () => {
    // `stop === undefined ? 0 : BOTTOM_NAV_HEIGHT_PX` was written out here before it had a home.
    // One declaration, and `sheet-geometry.ts` is it.
    expect(CONTENT).not.toMatch(/stop === undefined \? 0 : BOTTOM_NAV_HEIGHT_PX/);
    expect(CONTENT).toContain('const barPx = floatingBarClearancePx(stop);');
  });

  it('reaches the hosted place card, which is where the blocked control was', () => {
    expect(HOSTED).toContain('floatingBarPx={floatingBarPx}');
    expect(HOSTED).toContain('variant="hosted"');
  });

  it('reaches the share panel’s own scroll column, in the padding and the scroll padding', () => {
    expect(SHARE).toContain("'--floating-bar': `${floatingBarPx}px`");
    expect(SHARE).toContain('scrollPaddingBottom: `${floatingBarPx}px`');
    expect(SHARE).toContain('var(--floating-bar,0px)');
  });

  it('reaches Add places’ pinned footer, which is not in a scroll column at all', () => {
    // The one of the four that cannot be fixed with scroll padding: it is `shrink-0` and pinned
    // below the list, so the bar has to be in its `padding-bottom` or the button is behind it.
    expect(CONTENT).toContain(
      'paddingBottom: `calc(env(safe-area-inset-bottom) + 0.75rem + ${floatingBarPx}px)`',
    );
  });

  it('never types the bar’s height into any of them', () => {
    for (const [name, source] of [
      ['collection-content.tsx', CONTENT],
      ['collection-place-detail.tsx', HOSTED],
      ['share-panel.tsx', SHARE],
      ['collections-index-list.tsx', INDEX],
    ] as const) {
      expect(source, name).not.toContain(`${BOTTOM_NAV_HEIGHT_PX}px + `);
      expect(source, name).not.toContain(`+ ${BOTTOM_NAV_HEIGHT_PX}px`);
    }
    // And the number itself is still the bar's, whatever it becomes.
    expect(floatingBarClearancePx('half')).toBe(BOTTOM_NAV_HEIGHT_PX);
  });
});

/**
 * The mechanism behind defect 1, stated as a rule rather than as one file's line number.
 *
 * `flex-1` on an element that also declares a main-axis `height` silently wins, and the symptom is
 * not a layout that looks wrong — it is a scroll container whose bottom is off screen, which
 * renders, paints, hit-tests and reports `visible` while being unreachable. It is the same class of
 * failure `STOP_TO_CONTENT_HEIGHT` was written to fix, arriving through a class that cancels it, so
 * a comment on one file would not have been enough.
 */
describe('a sheet column never carries both a content height and flex-1', () => {
  const SIZED = [
    ['src/app/map/collections-index-list.tsx', INDEX],
    ['src/components/collections/collection-content.tsx', CONTENT],
    ['src/components/sheet/place-sheet.tsx', repoFile('src/components/sheet/place-sheet.tsx')],
  ] as const;

  /**
   * The opening JSX tag the height is declared on — from the `<` before it to the `>` that closes
   * that tag, counting braces and skipping string literals so a `>` inside an expression or a
   * comment does not end it early. A regex cannot do this: every one of these tags contains both
   * `{}` and `=>`.
   */
  function openingTag(source: string, at: number): string {
    const start = source.lastIndexOf('<', at);
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (quote !== null) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
    }
    return source.slice(start);
  }

  it('in any file that caps a column with STOP_TO_CONTENT_HEIGHT', () => {
    let checked = 0;
    for (const [name, source] of SIZED) {
      for (const match of source.matchAll(/STOP_TO_CONTENT_HEIGHT[.[]/g)) {
        const element = openingTag(source, match.index);
        checked += 1;
        if (!element.includes('flex-1')) continue;
        // The `lg+` panel has no stop and therefore no height, and there this column genuinely has
        // to grow — so a guarded `flex-1` is the one allowed shape.
        expect(element, `${name}: unguarded flex-1 beside a content height`).toMatch(
          /stop === undefined && 'flex-1'/,
        );
      }
    }
    // The scan found something; a rule that silently matched nothing is not a rule.
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
