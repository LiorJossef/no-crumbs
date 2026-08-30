import { expect, test, type Page } from '@playwright/test';

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
 *  1. `/collections/[id]` mounts its content **twice** — once in the vaul drawer, once in the
 *     `lg+` panel — so a `renderToStaticMarkup` count is double and a naive `getByRole` count is
 *     whatever the breakpoint happens to hide. Only a browser knows which copy is on screen.
 *  2. the picker's back control is drawn by a *different component* than the one that owns the
 *     picker (`HostedPaneBackContext`), so the invariant only exists once both are mounted and the
 *     effect that hands the control over has run.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

/** Names that are, or could be mistaken for, "go back". The Map/Collections/Profile tabs are not
 *  here: they name a destination, which is the whole reason the ruling allows them everywhere. */
const BACK_SHAPED = /^(back\b|collections$)/i;

async function signIn(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      return;
    } catch { /* dev-mode hydration race; the other specs retry the same way */ }
  }
  throw new Error('could not sign in after four attempts');
}

/**
 * Every *visible* control's accessible name, read out of the browser.
 *
 * Visibility is checked with a box and computed styles rather than Playwright's `:visible`, because
 * the hidden copy of the collection content is hidden by `display: none` at a breakpoint and must
 * be excluded exactly the way a screen reader excludes it.
 */
async function visibleControlNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('a,button,[role="button"]')]
      .filter((element) => {
        // The three tabs are destinations, not back controls, and the ruling puts them on every
        // route on purpose — so the bar is not part of the count.
        if (element.closest('nav[aria-label="Main"]') !== null) return false;
        const box = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && styles.visibility !== 'hidden';
      })
      .map((element) =>
        (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
  );
}

async function backShaped(page: Page): Promise<string[]> {
  return (await visibleControlNames(page)).filter((name) => BACK_SHAPED.test(name));
}

/** The first collection on the index, whatever the database happens to hold. */
async function openFirstCollection(page: Page): Promise<void> {
  await page.goto('/collections');
  const first = page.getByRole('link', { name: /\d+ places?/ }).first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await page.waitForURL(/\/collections\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await page.waitForTimeout(2500);
}

/** The `Add to a collection` row inside an open place detail, whose label carries a count. */
function pickerTrigger(page: Page) {
  return page.locator('button').filter({ hasText: /^(In\b|Add to a collection)/ }).first();
}

/** Presses it wherever it is in the column. The sheet rests at `half`, so this row is often below
 *  the fold, and a press that has to be preceded by a scroll gesture is not what is under test. */
async function press(page: Page, name: RegExp, by: 'text' | 'label' = 'text'): Promise<void> {
  const target =
    by === 'label'
      ? page.getByRole('button', { name }).first()
      // `:visible`, because `/collections/[id]` mounts its content twice — drawer and `lg+` panel —
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

    // 1. The list. No arrow at layer 0 — the kicker up-link, which says where it goes.
    const onList = await backShaped(page);
    expect(onList, 'the list header carries exactly the up-link').toEqual(['Collections']);
    // Scoped outside the bar: the Collections *tab* shares this name by design, and is a
    // destination rather than a back control.
    const upLink = page
      .locator('a[aria-label="Collections"]:not(nav[aria-label="Main"] a)')
      .locator('visible=true');
    await expect(upLink).toHaveAttribute('href', '/collections');
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
    await press(page, /^(In\b|Add to a collection)/);
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
    await press(page, /^(In\b|Add to a collection)/);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: 'New collection' })).toBeVisible();
    expect(await backShaped(page)).toEqual(['Back to the place']);
    // The host's own exit is an ×, which is not back-shaped and stays alongside it.
    await expect(page.getByRole('button', { name: 'Close place detail' })).toBeVisible();
  });
});
