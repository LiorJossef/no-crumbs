import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * `docs/ux-collections-as-scope.md` §2.2, held in a real accessibility tree:
 * **at most one back-shaped control is on screen at any moment.**
 *
 * Counted by *accessible name*, not by eye and not by CSS selector, because that is the thing the
 * rule is about — a user who cannot see the sheet hears these names and has to be able to tell the
 * two exits apart. The tabs are excluded on purpose: the ruling says a tab is a destination that
 * names itself, not a back control.
 *
 * Two facts a unit test cannot reach, both of which this file exists for:
 *
 *  1. a collection mounts its content **twice** — once in the vaul drawer, once in the `lg+`
 *     panel — so a `renderToStaticMarkup` count is double and a naive `getByRole` count is
 *     whatever the breakpoint happens to hide. Only a browser knows which copy is on screen.
 *  2. the picker's back control is drawn by a *different component* than the one that owns the
 *     picker (`HostedPaneBackContext`), so the invariant only exists once both are mounted and the
 *     effect that hands the control over has run.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

/** Names that are, or could be mistaken for, "go back". Persistent navigation is not here: a tab
 *  and a view switch name a *destination*, which is the whole reason the ruling allows them
 *  everywhere. See `NAVIGATION_LANDMARKS`. */
const BACK_SHAPED = /^(back\b|collections$)/i;

/**
 * The two `<nav>`s that are navigation rather than a way out of a pane, excluded from the count.
 *
 * `Main` is `BottomNav`. **`Places and collections` is the drawer's view switch** (owner,
 * 2026-08-31, `map-shell.tsx`'s `DrawerViewSwitch`), which took over the job the `Collections` tab
 * used to do — so it inherits the tab's exemption for the tab's reason, verbatim: it is on every
 * collections surface on purpose, its `Collections` segment names where it goes, and it carries
 * `aria-current` rather than a back arrow. Counting it would make §2.2 fail on the list view for a
 * control the ruling explicitly permits.
 */
const NAVIGATION_LANDMARKS = ['nav[aria-label="Main"]', 'nav[aria-label="Places and collections"]'];

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

/**
 * Every *visible* control's accessible name, read out of the browser.
 *
 * Visibility is checked with a box and computed styles rather than Playwright's `:visible`, because
 * the hidden copy of the collection content is hidden by `display: none` at a breakpoint and must
 * be excluded exactly the way a screen reader excludes it.
 */
async function visibleControlNames(page: Page): Promise<string[]> {
  return page.evaluate((landmarks) =>
    [...document.querySelectorAll('a,button,[role="button"]')]
      .filter((element) => {
        // Persistent navigation names destinations, not a way back, and the ruling puts it on
        // every route on purpose — so neither the bar nor the drawer's view switch is part of the
        // count.
        if (landmarks.some((selector) => element.closest(selector) !== null)) return false;
        const box = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && styles.visibility !== 'hidden';
      })
      .map((element) =>
        (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
  NAVIGATION_LANDMARKS,
  );
}

async function backShaped(page: Page): Promise<string[]> {
  return (await visibleControlNames(page)).filter((name) => BACK_SHAPED.test(name));
}

/** The first collection on the index, whatever the database happens to hold. */
async function openFirstCollection(page: Page): Promise<void> {
  await page.goto('/map?view=collections');
  const first = page.getByRole('link', { name: /\d+ places?/ }).first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  // **All three of the drawer's views are search params on `/map`** since 2026-08-31
  // (`app/map/_lib/drawer-view.ts`), which is what stops the drawer being torn down and rebuilt on
  // this tap: a dynamic segment's value is part of the router's cache key and a search param is
  // not. `/collections/<id>` still resolves — it is a redirect shim, kept forever — and matching it
  // here would let a regression back to two segments pass.
  await page.waitForURL(/\/map\?view=collections&collection=[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.waitForTimeout(2500);
}

/**
 * The `Add to a collection` row inside an open place detail, whose label carries a count.
 *
 * **The `Collections` prefix is not optional slack, it is the row's section label.** When this row
 * became a `DETAIL_FIELD_ROW` — the same shape as `Category` and `Your note` — it gained a
 * `SECTION_LABEL` span above its value, so the button's text content changed from
 * `Add to a collection` to `CollectionsAdd to a collection`. The old anchored regex matched
 * nothing, and CI run 33661142026 reported `toHaveCount(1)` receiving **0** on both projects, for a
 * control that is present and working. Verified at `4ca68e6`, before that redesign: the same test
 * passes there, which is what pins the cause to the label rather than to the picker.
 *
 * Still anchored, and `toHaveCount(1)` is still the assertion, so this cannot quietly widen into
 * matching some other button that happens to contain the word "In".
 */
const PICKER_TRIGGER = /^(Collections\s*)?(In\b|Add to a collection)/;

function pickerTrigger(page: Page) {
  return page.locator('button').filter({ hasText: PICKER_TRIGGER }).first();
}

/** Presses it wherever it is in the column. The sheet rests at `half`, so this row is often below
 *  the fold, and a press that has to be preceded by a scroll gesture is not what is under test. */
async function press(page: Page, name: RegExp, by: 'text' | 'label' = 'text'): Promise<void> {
  const target =
    by === 'label'
      ? page.getByRole('button', { name }).first()
      // `:visible`, because a collection mounts its content twice — drawer and `lg+` panel —
      // and the copy the breakpoint hides is first in document order. Pressing that one opens a
      // picker nobody can see.
      : page.locator('button:visible').filter({ hasText: name }).first();
  await target.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
    (element as HTMLElement).click();
  });
}

test.describe('one back control, at every step inside a collection', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 180_000 });

  test('list -> place -> picker -> back never puts two back-shaped controls on screen', async ({
    page,
  }) => {
    await signIn(page);
    await openFirstCollection(page);

    // 1. The list. Layer 0 now draws NO back control at all — the kicker up-link was deleted
    // 2026-09-02 (see `ux-collections-as-scope.md` §5 item 3). The invariant it guarded got
    // stronger rather than weaker: the drawer's `Places / Collections` switch renders directly
    // above this header and its `Collections` segment resolves to the same `/map?view=collections`,
    // so the escape route survives the row's deletion and layer 0 owes nothing.
    const onList = await backShaped(page);
    expect(onList, 'layer 0 carries no back control of its own').toEqual([]);
    // Scoped outside both navigation landmarks: the drawer's `Collections` segment shares this
    // name by design, and is a destination rather than a back control. (The bar carried a
    // `Collections` tab until 2026-08-31 and was excluded here for the same reason; it now holds
    // Map and Profile, so that half of the selector is belt to the switch's braces.)
    const upLink = page
      .locator(
        'a[aria-label="Collections"]:not(nav[aria-label="Main"] a):not(nav[aria-label="Places and collections"] a)',
      )
      .locator('visible=true');
    await expect(upLink).toHaveAttribute('href', '/map?view=collections');
    // ≥44 px, and leading: it stands where the deleted arrow stood.
    const upLinkBox = await upLink.boundingBox();
    expect(upLinkBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    // 2. A place. The up-link is *replaced* by the pane's back, not joined by it.
    await press(page, /^Open /, 'label');
    await page.waitForTimeout(1500);
    expect(await backShaped(page)).toEqual(['Back to the collection']);

    // 3. The picker. It borrows the header's control rather than drawing a second one.
    const trigger = pickerTrigger(page);
    await expect(trigger).toHaveCount(1);
    await press(page, PICKER_TRIGGER);
    await page.waitForTimeout(1200);
    await expect(
      page.getByRole('button', { name: 'New collection' }),
      'the picker is actually open',
    ).toBeVisible();
    expect(await backShaped(page)).toEqual(['Back to the place']);

    // 4. And back. The borrowed control returns the pane, not the route.
    await page.getByRole('button', { name: 'Back to the place' }).click();
    await page.waitForTimeout(1200);
    expect(await backShaped(page)).toEqual(['Back to the collection']);
    await expect(page.getByRole('button', { name: 'New collection' })).toHaveCount(0);
  });
});

test.describe('the map is untouched by the borrowing', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 180_000 });

  test('the picker keeps its own arrow where the host affordance is an ×', async ({ page }) => {
    await signIn(page);
    await page.goto('/map');
    await page.waitForTimeout(3000);
    // On a phone the list starts at `peek`; on a desktop it is already open.
    // Only exists below `lg`, where the sheet rests at `peek`. A short timeout, not the test's:
    // waiting three minutes to learn a control is absent is not a check, it is a hang.
    await page
      .getByRole('button', { name: 'Show your places' })
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    await press(page, /^⁨?Open /, 'label');
    await page.waitForTimeout(2000);

    // `/map` provides no host control, so the picker must draw one.
    await expect(pickerTrigger(page)).toHaveCount(1);
    await press(page, PICKER_TRIGGER);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: 'New collection' })).toBeVisible();
    expect(await backShaped(page)).toEqual(['Back to the place']);
    // The host's own exit is an ×, which is not back-shaped and stays alongside it.
    await expect(page.getByRole('button', { name: 'Close place detail' })).toBeVisible();
  });
});
