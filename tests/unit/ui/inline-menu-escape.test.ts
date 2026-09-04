import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **The third focus position, and the guard on it.**
 *
 * `InlinePanel` is dismissed by Escape from two places by construction: every consumer handles the
 * key on its own trigger, and the panel handles it on itself. Both call `stopPropagation`. That is
 * two of the three places focus can be while a panel is open, and on the collection screen the
 * third is one `Tab` away — the panel is drawn under the meta line rather than in the trigger's own
 * flex line, so `Tab` from `Collection options` lands on the members line, which is neither.
 *
 * Measured on `no-crumbs-implementation` at `d02fb37`, 390×844, `London 2026`: open the menu, press
 * `Tab`, press `Escape` — `aria-expanded` stayed `true` and the three rows stayed on screen. It was
 * never a trap (a press anywhere outside still closed it), only a dead key.
 *
 * The fix belongs in the material rather than on the screen, because the gap is the material's: the
 * library's filter bar has the identical hole and only hides it by putting its panel next in DOM
 * order. A `document` listener while the panel is mounted covers every focus position there is.
 *
 * **These are source assertions, and that is a limit worth naming.** `vitest.config.ts` sets
 * `environment: 'node'` and the tree carries neither `jsdom` nor `@testing-library`, so nothing here
 * can press a key. The behavioural evidence is the Playwright measurement above, taken at 390×844
 * and 1280×900 in both themes; this file guards the source facts that measurement depends on. The
 * first three fail on `d02fb37`; the fourth is a precondition rather than a repro — it passed
 * before the fix and exists so the fix cannot be undone from the far end.
 */
const INLINE_MENU = readFileSync('src/components/ui/inline-menu.tsx', 'utf8');

/** Every consumer of the material, and the trigger each one hands Escape to first. */
const CONSUMERS = [
  'src/components/sheet/library-filter-bar.tsx',
  'src/components/sheet/saved-place-edits.tsx',
  'src/components/sheet/sentence-panel.tsx',
  'src/components/collections/collection-content.tsx',
  'src/components/collections/collection-place-detail.tsx',
  'src/components/collections/add-to-collection.tsx',
  'src/components/collections/share-panel.tsx',
];

describe('Escape reaches an open inline panel from every focus position', () => {
  it('installs a document-level keydown listener for as long as the panel is mounted', () => {
    expect(INLINE_MENU).toMatch(/document\.addEventListener\(\s*'keydown'/);
    expect(INLINE_MENU).toMatch(/document\.removeEventListener\(\s*'keydown'/);
  });

  it('dismisses through onOutsidePress, so the key does not yank focus back to the trigger', () => {
    // `onEscape` returns focus to the trigger, which is right when focus is *on* the trigger and
    // wrong when the user has tabbed away from it — the same reason a press outside does not move
    // focus. Read the listener body rather than the file: `onEscape` is a prop of this component
    // and appears elsewhere in it legitimately.
    const listener = /function onDocumentKeyDown\(event: KeyboardEvent\) \{([\s\S]*?)\n {4}\}/.exec(
      INLINE_MENU,
    );
    expect(listener).not.toBeNull();
    const body = listener?.[1] ?? '';
    expect(body).toMatch(/event\.key !== 'Escape'/);
    expect(body).toMatch(/onOutsidePress\(\)/);
    expect(body).not.toMatch(/onEscape\(\)/);
  });

  it('does not gate on defaultPrevented, which is already true on the drawer surface', () => {
    // `NonModalDrawerScope`'s Radix `DismissableLayer` consumes Escape into an `onOpenChange` that
    // is a noop, so the event arrives at `document` marked handled while nothing has closed.
    // Measured 2026-09-04: with the flag as the guard the dead zone survived the fix unchanged.
    const listener = /function onDocumentKeyDown\(event: KeyboardEvent\) \{([\s\S]*?)\n {4}\}/.exec(
      INLINE_MENU,
    );
    expect(listener).not.toBeNull();
    expect(listener?.[1] ?? '').not.toMatch(/defaultPrevented/);
  });

  it('keeps every consumer stopping Escape on its own trigger', () => {
    // This is what confines the document listener to the third case. A consumer that stopped doing
    // it would get two dismissals for one key: the trigger's, which returns focus, and the
    // document's, which does not — and the second would land after the first.
    for (const path of CONSUMERS) {
      const source = readFileSync(path, 'utf8');
      const handlers = source.match(
        /event\.key !== 'Escape'[\s\S]{0,120}?event\.stopPropagation\(\)/g,
      );
      expect(handlers, `${path} handles Escape on its trigger and stops it`).not.toBeNull();
    }
  });
});
