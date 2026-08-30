/**
 * **The first screen of a brand-new account** — `W1-1`, `growth-plan.md` §6's *"the one thing"*,
 * specified in `ux-map-is-the-query.md` §5 and `ux-overnight-specs.md` Spec 3.
 *
 * The defect this covers was photographed at 390×844 against a library with nothing in it: the
 * sheet rested on the **peek** strip, which collapses to the single line `Your map starts here. ⌃`,
 * so the sentence explaining what the product does and the `Add a TikTok` button underneath it
 * were both inside the sheet and off screen. At 1440×900 all three showed, because the desktop
 * panel is not a sheet. The only visible way forward on a phone was the `＋` in the tab bar — on
 * the screen a demo starts on, and on the screen a failed import returns to.
 *
 * ## Why these are source assertions and not a render
 *
 * `map-page-client.tsx` is a client component in a suite that runs in **node** with no DOM and no
 * renderer (`vitest.config.ts`: `environment: 'node'`, and a `.test.ts`-only include), and it
 * transitively imports the whole import flow. It cannot be imported here at all. The repository's
 * existing answer to that is to read the file as text and assert the seam —
 * `camera-library-shapes.test.ts`' Rule 5 and `seed-links.test.ts` both do it — so this file does
 * the same, and pairs each text assertion with real arithmetic over the **importable** half
 * (`sheet-geometry.ts`, `active-area.ts`) so the thing being pinned is a consequence and not a
 * spelling.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HALF_FRACTION, PEEK_PX, restingSheetFractionFor } from '@/components/shell/sheet-geometry';
import { mapAccessibleName } from '@/ui/place/active-area';
import { scopeHeading, scopeLabel, GLOBAL_SCOPE, resolveScope } from '@/ui/place/list-scope';

const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');

describe('the sheet rests at half while the library is empty', () => {
  /**
   * The decision itself. Stated as `places.length === 0` rather than as a `libraryIsEmpty`
   * variable name so that renaming the variable cannot silently delete the branch.
   */
  it('chooses the resting stop from whether anything is saved', () => {
    expect(PAGE).toContain("useState<SheetStop>(() => (places.length === 0 ? 'half' : 'peek'))");
  });

  /**
   * **One value, two consumers, and they must never disagree.** `useMapShell` snapshots the stop
   * at mount to seed the sheet; `MapShell` reads it every render for the camera's bottom budget.
   * A live expression would flip to `peek` the moment the first import lands, while the sheet
   * itself was still resting at `half` — and the post-import flight would then frame the places it
   * had just saved for a 128 px strip, behind a sheet covering 55% of the viewport.
   */
  it('hands the same snapshot to the shell and to the camera', () => {
    expect(PAGE).toContain('useMapShell({ restingStop })');
    expect(PAGE).toContain('restingStop={restingStop}');
    // The literal it replaced. A regression here is a one-word edit, and it is invisible in a diff
    // of a 1,200-line file.
    expect(PAGE).not.toContain('restingStop="peek"');
  });

  /** What the choice is worth, in the units the camera actually spends: `half` concedes 55% of the
   *  container where `peek` concedes a fixed strip, so the two are not interchangeable and the
   *  budget is a real consequence of the stop rather than a cosmetic one. */
  it('concedes a fraction of the viewport rather than the peek strip', () => {
    expect(restingSheetFractionFor('half')).toBe(HALF_FRACTION);
    expect(restingSheetFractionFor('half') as number).toBeGreaterThan(PEEK_PX / 844);
    expect(restingSheetFractionFor('peek')).toBeUndefined();
  });
});

describe('the canvas does not claim saved places it has none of', () => {
  /**
   * The lie, reproduced with the page's own functions so this is a statement about the product and
   * not about a string. An empty global scope labels itself `your library`, so the composed name
   * announces *your saved places in your library* over a map that has none. (The count arm is
   * `null` here, which is why the sentence stops before *the list below names all* — the claim
   * that remains is the one worth removing.)
   */
  it('would announce saved places the account does not have, without the branch', () => {
    const resolved = resolveScope([], [], GLOBAL_SCOPE);
    expect(resolved).not.toBeNull();
    const heading = scopeHeading({
      scope: resolved as NonNullable<typeof resolved>,
      countInScope: 0,
      searchQuery: '',
      tagLabel: null,
      notBeenOnly: false,
      matchesAnywhere: 0,
    });
    const named = mapAccessibleName(heading, scopeLabel(resolved as NonNullable<typeof resolved>));
    expect(named).toContain('your saved places');
    expect(named).toContain('your library');
  });

  /** The branch, and the string it answers with. One clause, sentence case, no exclamation mark,
   *  no claim — `voice-and-vocabulary.md`, and `ux-overnight-specs.md` Spec 3 §3.7. */
  it('says what is there instead', () => {
    expect(PAGE).toContain("const EMPTY_MAP_ACCESSIBLE_NAME = 'A map. Nothing saved yet.';");
    expect(PAGE).toContain('places.length === 0\n        ? EMPTY_MAP_ACCESSIBLE_NAME');
    expect(PAGE).not.toMatch(/EMPTY_MAP_ACCESSIBLE_NAME = '[^']*!/);
  });
});
