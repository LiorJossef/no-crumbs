import { expect, test } from '@playwright/test';

import { MapPage, openTaggedPlace, PASSWORD, signIn } from './helpers/map-page';

/**
 * `L1-RETRIEVAL-E2E` — tag filtering, driven through the real application.
 *
 * Tag filtering shipped with good unit coverage (`tests/unit/ui/tag-filter.test.ts`,
 * `tests/unit/map/filter-places.test.ts`, `tests/unit/ui/place-enrichment.test.ts`) and **none of
 * it can see the thing that matters**. `filterByTag` is a pure function over an array; what the
 * user relies on is that the one array it returns reaches two surfaces at once — the list of rows
 * and the pins MapLibre paints — and that the filter can be taken off again. Those are facts about
 * a browser, a canvas and a `useState`, so they are asserted here and nowhere else.
 *
 * Nothing in this file re-checks *which* places match a tag; that is `filterByTag`'s job and it is
 * already tested. Every assertion here is about the seam.
 *
 * Signed-in, so it skips without `E2E_PASSWORD` — the same convention as
 * `map-accessibility.spec.ts` and the import specs, and the reason CI (which sets no credentials)
 * runs the file without running the tests. **These are a local gate, not a CI gate.**
 *
 * Read-only: the flow taps chips and types in a search box. It writes nothing, so it is safe to
 * run against the owner's development database.
 */

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

test.describe('tag filtering', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 120_000 });

  test('a chip narrows the list and the pins together, and the two never disagree', async ({
    page,
  }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const before = await map.pins();
    const beforeRows = await map.listedNames();
    const beforePainted = before.renderedPins + before.renderedInClusters;

    // The invariant, stated before any filter is applied so a failure after one is attributable.
    // The list shows the active area; the `Elsewhere` rows count the matches in every other area;
    // the pins are never narrowed by area at all. So the rows and the elsewhere counts must
    // account for every pin the map is holding — that is what "the list and the map are answering
    // the same question" means, and it is checkable without knowing anything about the library.
    expect(
      beforeRows.length + sum(await map.elsewhereCounts()),
      'unfiltered: rows in this area + matches elsewhere must equal the pins on the map',
    ).toBe(before.sourceNames.length);

    const { name, chipLabels } = await openTaggedPlace(map, page);
    const tag = chipLabels[0] as string;
    await map.tagChip(tag).click();

    // Tapping a chip deselects, so the detail view closes and the list is back underneath.
    await expect(map.tagChips()).toHaveCount(0);
    await expect(map.activeTagPill()).toBeVisible();

    await expect
      .poll(async () => map.pinCount(), { message: 'the pins never narrowed' })
      .toBeLessThan(before.sourceNames.length);

    const after = await map.pins();
    const afterRows = await map.listedNames();

    expect(afterRows, 'the place whose chip was tapped must still be listed').toContain(name);
    expect(
      afterRows.length + sum(await map.elsewhereCounts()),
      'filtered: rows in this area + matches elsewhere must equal the pins on the map',
    ).toBe(after.sourceNames.length);
    for (const listed of afterRows) {
      expect(after.sourceNames, `${listed} is in the list but has no pin`).toContain(listed);
    }

    // The pins the user can actually see, not only the array behind them. The camera does not move
    // on a chip tap, so the same viewport now paints strictly fewer places — and never zero, since
    // the place the chip came from is in the area the camera is framing. Polled, because repainting
    // the symbol layer is a frame or two behind the state change that caused it.
    await expect
      .poll(async () => map.paintedCount(), { message: 'the same viewport must paint fewer places' })
      .toBeLessThan(beforePainted);
    expect(await map.paintedCount(), 'the map must not go blank').toBeGreaterThan(0);

    // Printed so a green run is readable as evidence rather than taken on trust: a reader can see
    // that the numbers moved, and by how much, without re-deriving them from the library.
    console.log(
      JSON.stringify({
        breakpoint: map.isDesktop ? 'desktop' : 'mobile',
        tag,
        pins: { before: before.sourceNames.length, after: after.sourceNames.length },
        rowsInArea: { before: beforeRows.length, after: afterRows.length },
        painted: { before: beforePainted, after: await map.paintedCount() },
      }),
    );
  });

  test('the filter names itself and can be taken off again', async ({ page }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const before = await map.pinCount();
    const beforeRows = (await map.listedNames()).length;

    const { name, chipLabels } = await openTaggedPlace(map, page);
    const tag = chipLabels[0] as string;
    await map.tagChip(tag).click();

    // The pill has to say which tag it is undoing. A filter the user cannot name is a library that
    // has silently lost rows.
    const pill = map.activeTagPill();
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAccessibleName(`Clear the ${tag} tag filter`);
    await expect(pill).toContainText(tag);
    // The `TAGGED` kicker beside it. Scoped to the pill's own container: a bare `getByText` is not
    // a role query, so it matches the copy in whichever composition is hidden behind the
    // breakpoint as well as the one on screen.
    await expect(pill.locator('xpath=..')).toContainText('Tagged');

    await expect.poll(async () => map.pinCount()).toBeLessThan(before);

    await pill.click();

    await expect(map.activeTagPill()).toHaveCount(0);
    await expect
      .poll(async () => map.pinCount(), { message: 'dismissing the pill did not restore the pins' })
      .toBe(before);
    expect((await map.listedNames()).length).toBe(beforeRows);

    // And the chip it came from is no longer pressed — the pill and the chip are one state, not two.
    await openTaggedPlace(map, page);
    await expect(map.tagChip(tag)).toHaveAttribute('aria-pressed', 'false');
    expect(name).toBeTruthy();
  });

  test('the chip is a keyboard-operable toggle, and aria-pressed is the state', async ({ page }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const before = await map.pinCount();
    const { chipLabels } = await openTaggedPlace(map, page);
    const tag = chipLabels[chipLabels.length - 1] as string;

    await expect(map.tagChip(tag)).toHaveAttribute('aria-pressed', 'false');

    // Reached by keyboard, not by `locator.focus()`. The chips sit directly above the detail
    // view's close button in the DOM, so one Shift+Tab from it is the deterministic way in — and
    // it proves the chip is in the tab order rather than merely focusable programmatically.
    await page.getByRole('button', { name: 'Close place detail' }).first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(map.tagChip(tag)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(map.activeTagPill()).toBeVisible();
    await expect.poll(async () => map.pinCount()).toBeLessThan(before);

    // Reopen the place: the chip now reports itself pressed, and pressing it again clears.
    await openTaggedPlace(map, page);
    await expect(map.tagChip(tag)).toHaveAttribute('aria-pressed', 'true');
    await map.tagChip(tag).press('Enter');

    await expect(map.activeTagPill()).toHaveCount(0);
    await expect.poll(async () => map.pinCount()).toBe(before);
  });

  test('a Hebrew tag survives the real render and filters like any other', async ({ page }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const before = await map.pinCount();

    // Hebrew ↔ English is the supported language scope (owner ruling, `current-state.md` §4), and
    // `tests/unit/ui/tag-filter.test.ts` already covers Hebrew tag keys. What it cannot cover is
    // the round trip through a real DOM: `dir="auto"` on the chip's own text, an RTL label inside
    // an LTR accessible name on the pill, and `tagKey` equality holding across the click handler.
    //
    // This fails rather than skips when the library has no Hebrew-tagged place. A silent skip on
    // the one language case we promised to support is how that promise stops being checked.
    const { chipLabels } = await openTaggedPlace(map, page, /, tagged .*[֐-׿]/);
    const hebrew = chipLabels.find((label) => /[֐-׿]/.test(label));
    expect(hebrew, `no Hebrew chip on a place the row said was Hebrew-tagged: ${chipLabels}`).toBeDefined();

    await map.tagChip(hebrew as string).click();

    const pill = map.activeTagPill();
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAccessibleName(`Clear the ${hebrew} tag filter`);
    // The chip's text is a bidi isolate; the string in the DOM must still be the tag itself.
    await expect(pill).toContainText(hebrew as string);

    await expect
      .poll(async () => map.pinCount(), { message: 'a Hebrew tag did not narrow the library' })
      .toBeLessThan(before);
    expect((await map.listedNames()).length).toBeGreaterThan(0);

    await pill.click();
    await expect.poll(async () => map.pinCount()).toBe(before);
  });
});
