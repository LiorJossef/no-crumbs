import { expect, test } from '@playwright/test';

import { MapPage, openTaggedPlace, PASSWORD, signIn } from './helpers/map-page';

/**
 * `L1-RETRIEVAL-E2E` — the search box, and what happens when it meets a tag chip.
 *
 * `map-page-client.tsx` composes the two as AND — `filterByTag(places, activeTag)` then
 * `filterPlaces(tagMatches, query)` — and that composition is unit-tested at the function level.
 * What is not, and cannot be, is that they are **two dimensions the user can undo separately**:
 * `src/ui/place/tag-filter.ts` argues at length that this is the whole reason a chip does not just
 * write its label into the search box, and the only place that argument is actually checked is
 * here, by clearing one and finding the other still on.
 *
 * The zero-result state is here for the same reason. `areaHeading` returns a string; whether the
 * user is left with a way out of it is a fact about which controls are on screen.
 *
 * Read-only, and skipped without `E2E_PASSWORD` — see `tag-filter.spec.ts` for both.
 */

const NONSENSE = 'zzqqxx';

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

test.describe('search, and search composed with a tag', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 120_000 });

  test('typing narrows the list and the pins, and announces the result', async ({ page }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const before = await map.pinCount();
    const [firstListed] = await map.listedNames();
    const term = (firstListed as string).split(' ')[0]?.toLowerCase() as string;

    await map.searchBox().fill(term);

    await expect
      .poll(async () => map.pinCount(), { message: 'typing did not narrow the pins' })
      .toBeLessThan(before);
    const matched = await map.pinCount();
    expect(matched).toBeGreaterThan(0);

    // The list and the pins still account for each other, exactly as they must under a tag filter.
    expect((await map.listedNames()).length + sum(await map.elsewhereCounts())).toBe(matched);

    // The one thing a screen-reader user has to go on: the list and the pins both changed
    // silently, and only this region says so. It is debounced by ~500 ms and it deliberately
    // discards a sentence about the *previous* query, so both the count and the query are checked —
    // a stale announcement is the failure this region was written to avoid.
    await expect(map.liveRegion()).toContainText(`${matched} place`, { timeout: 15_000 });
    await expect(map.liveRegion()).toContainText(term);

    await map.clearSearch().click();
    await expect.poll(async () => map.pinCount()).toBe(before);
    await expect(map.searchBox()).toHaveValue('');
  });

  test('a query whose matches are all in another area empties this one and says where they are', async ({
    page,
  }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const opening = (await map.heading().innerText()).trim();
    const here = /\bin (.+)$/.exec(opening)?.[1];
    expect(here, `could not read the active area out of the heading "${opening}"`).toBeDefined();

    const elsewhere = await map.elsewhereRows().evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? ''),
    );
    // Not applicable to a one-area library — a real "not here, but there" state cannot be produced.
    // Recorded as a skip with its reason rather than as a pass.
    test.skip(elsewhere.length === 0, 'the library has only one area, so nothing can be elsewhere');
    const there = /^(.+?), \d+ (?:place|match)/.exec(elsewhere[0] as string)?.[1] as string;

    // The area's own name is what the places in it have as their locality, so searching for it is a
    // query that can only match over there. This is the state `docs/ux-stable-area-list.md` is
    // built around — narrowing never navigates, so the camera stays put and the list has to explain
    // itself instead.
    await map.searchBox().fill(there);

    await expect(map.heading()).toHaveText(`No matches in ${here}`);
    await expect(map.rows()).toHaveCount(0);
    await expect
      .poll(async () => sum(await map.elsewhereCounts()), {
        message: `nothing was reported in ${there} for the query "${there}"`,
      })
      .toBeGreaterThan(0);
    expect(await map.pinCount(), 'every match is elsewhere, and every one still has a pin').toBe(
      sum(await map.elsewhereCounts()),
    );

    // The way out. Tapping the row is the one gesture that changes area by hand, and the list must
    // land on the matches it just promised.
    const moved = sum(await map.elsewhereCounts());
    await map.elsewhereRows().first().click();
    await expect(map.heading()).toContainText(there);
    await expect(map.rows()).toHaveCount(moved);
    expect(await map.pinCount(), 'switching area must not change what the filter matched').toBe(
      moved,
    );

    console.log(
      JSON.stringify({
        breakpoint: map.isDesktop ? 'desktop' : 'mobile',
        here,
        there,
        query: there,
        matchesElsewhere: moved,
      }),
    );
  });

  test('a tag and a query compose as AND, and clearing one leaves the other applied', async ({
    page,
  }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const everything = (await map.pins()).sourceNames;
    const unfiltered = everything.length;

    const { name, chipLabels } = await openTaggedPlace(map, page);
    const tag = chipLabels[0] as string;
    await map.tagChip(tag).click();
    await expect(map.activeTagPill()).toBeVisible();
    await expect.poll(async () => map.pinCount()).toBeLessThan(unfiltered);
    const tagged = (await map.pins()).sourceNames;
    const tagOnly = tagged.length;

    // The query is the name of a place the tag does **not** match. That is what makes this an AND
    // test rather than a "both numbers went down" test: under OR — or under the cheap
    // implementation where a chip writes its own label into the search box — this place would be
    // in the result, and the count could only grow. Under AND the two filters have no overlap and
    // the answer is zero.
    const outsider = everything.find((candidate) => !tagged.includes(candidate));
    expect(outsider, `every saved place carries the tag ${tag}; nothing left to exclude`).toBeDefined();

    await map.searchBox().fill(outsider as string);
    await expect
      .poll(async () => map.pinCount(), {
        message: `"${outsider}" does not carry ${tag}, so the two filters must not both be satisfied`,
      })
      .toBe(0);

    // Now the same query on its own: it has to find the place it names, which is what proves the
    // zero above came from the composition and not from a search that matches nothing.
    await map.activeTagPill().click();
    await expect(map.activeTagPill()).toHaveCount(0);
    await expect(map.searchBox()).toHaveValue(outsider as string);
    await expect
      .poll(async () => map.pinCount(), { message: 'dismissing the pill also dropped the search' })
      .toBeGreaterThan(0);
    const queryOnly = await map.pinCount();
    expect(queryOnly).toBeLessThan(unfiltered);
    // Checked against the pins rather than the rows: the place this query names may live in
    // another of the user's areas, and the list only ever shows the active one.
    expect((await map.pins()).sourceNames).toContain(outsider as string);

    // The other direction, on an intersection that is not empty: the tagged place's own name, so
    // both filters hold for it. Clearing the search must leave the tag on and land exactly on the
    // tag-only count, not on the whole library.
    await map.clearSearch().click();
    await expect.poll(async () => map.pinCount()).toBe(unfiltered);
    await openTaggedPlace(map, page);
    await map.tagChip(tag).click();
    await map.searchBox().fill(name);
    await expect
      .poll(async () => map.pinCount(), { message: 'the two filters did not compose' })
      .toBeLessThanOrEqual(tagOnly);
    const both = await map.pinCount();
    expect(both, 'the place carrying the tag also matches its own name').toBeGreaterThan(0);
    expect(await map.listedNames()).toContain(name);

    await map.clearSearch().click();
    await expect(map.activeTagPill()).toBeVisible();
    await expect
      .poll(async () => map.pinCount(), { message: 'clearing the search also dropped the tag' })
      .toBe(tagOnly);

    console.log(
      JSON.stringify({
        breakpoint: map.isDesktop ? 'desktop' : 'mobile',
        tag,
        taggedPlace: name,
        outsider,
        pins: { unfiltered, tagOnly, queryOnly, tagAndOutsider: 0, tagAndOwnName: both },
      }),
    );
  });

  test('a tag and a query that match nothing leave a named state with a way out', async ({
    page,
  }) => {
    const map = new MapPage(page);
    await signIn(page);
    await map.ready();
    await map.openList();

    const unfiltered = await map.pinCount();
    const { chipLabels } = await openTaggedPlace(map, page);
    const tag = chipLabels[0] as string;
    await map.tagChip(tag).click();
    await expect.poll(async () => map.pinCount()).toBeLessThan(unfiltered);
    const tagOnly = await map.pinCount();

    await map.searchBox().fill(NONSENSE);

    await expect
      .poll(async () => map.pinCount(), { message: 'a query matching nothing left pins on the map' })
      .toBe(0);
    await expect(map.rows()).toHaveCount(0);
    await expect(map.elsewhereRows()).toHaveCount(0);

    // The heading names the query, not the tag: it is the thing the user just typed, and the tag
    // has its own dismiss control on screen. Both must be true at once, which is the point.
    await expect(map.heading()).toHaveText(`Nothing matches "${NONSENSE}"`);
    await expect(map.activeTagPill()).toBeVisible();
    await expect(map.clearSearchEscape()).toBeVisible();

    await map.clearSearchEscape().click();
    await expect
      .poll(async () => map.pinCount(), { message: 'the escape did not restore the tag-only list' })
      .toBe(tagOnly);
    await expect(map.activeTagPill()).toBeVisible();
  });
});
