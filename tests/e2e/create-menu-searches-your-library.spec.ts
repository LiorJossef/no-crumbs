import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * **This spec is a finding, and at the time of writing it is RED on `/collections` and `/profile`.**
 * Do not weaken it to green; the fix is a prop, not an assertion.
 *
 * `docs/ux-collections-as-scope.md` and the owner's ruling behind `BottomNav` say the `＋` means one
 * thing on every screen. `bottom-nav.tsx` now opens the same `AddSheetHost` everywhere, which is
 * the right shape — but on the tabs that host no menu of their own it mounts it with `places={[]}`,
 * and the sheet's search is `Array.prototype.filter` over exactly that array.
 *
 * The consequence, measured in a browser on 2026-08-30: type the name of a place you have already
 * saved and the sheet answers **"Nothing you've saved matches that. Add "…" manually"**. That is not
 * a truthful empty result, it is a false statement about the user's own library, and the only
 * action it offers writes a **duplicate row** and spends one of the 100 daily Google Places
 * lookups doing it. De-duplication is the entire job of that search.
 *
 * The test derives its query from the library itself — the first place on `/map` — so it asserts a
 * behaviour rather than a fixture.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

/** A place the signed-in user demonstrably has, taken off `/map`'s own list. */
async function aPlaceIHaveSaved(page: Page): Promise<string> {
  await page.goto('/map');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Show your places' }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const label = await page.getByRole('button', { name: /^⁨?Open / }).first().getAttribute('aria-label');
  const name = (label ?? '').replace(/^⁨?Open /, '').split(/,|⁩/)[0]!.trim();
  expect(name.length, 'the demo library has at least one place').toBeGreaterThan(2);
  return name;
}

/** Opens the `＋` menu and its `Add a place` pane, then types `query`. */
async function searchTheCreateMenu(page: Page, query: string): Promise<void> {
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Add a place/ }).click();
  await page.waitForTimeout(1000);
  // **Named, not positional.** `input:visible` resolved to the first visible `<input>` in the
  // document, and on `/profile` that is the theme switcher's radio — `<input type="radio"
  // aria-hidden="true" tabindex="-1" value="light">`, which Playwright counts as visible and cannot
  // fill. Measured on CI run 33661142026: `locator.fill: Input of type "radio" cannot be filled`,
  // on the `/profile` arm only, which is why the `/map?view=collections` arm went on passing.
  // The control this test is about carries an accessible name (`add-sheet.tsx`'s `FIELD_LABEL`);
  // ask for it by name and the arm cannot drift onto a neighbour again.
  await page
    .getByRole('textbox', { name: 'Paste a TikTok link or search your places' })
    .fill(query);
  await page.waitForTimeout(1000);
}

// `/map?view=collections` rather than `/collections`: the drawer's views are search params on
// `/map` since 2026-08-31, and driving the redirect shim would test the shim.
for (const route of ['/map?view=collections', '/profile'] as const) {
  test.describe(`the ＋ on ${route} searches the library it claims to`, () => {
    test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
    // Mobile only, and not a narrowing of what this spec found: `BottomNav` is `lg:hidden`, so the
    // `＋` this is about has no desktop presence to assert against. A desktop arm would be waiting
    // for a control the product deliberately does not draw.
    test.skip(({ isMobile }) => !isMobile, 'the ＋ is a mobile control');
    test.describe.configure({ timeout: 180_000 });

    test('does not tell the user they have no place they do have', async ({ page }) => {
      await signIn(page);
      const name = await aPlaceIHaveSaved(page);

      await page.goto(route);
      await page.waitForTimeout(2500);
      await searchTheCreateMenu(page, name);

      const sheet = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(
        sheet,
        `typing "${name}" on ${route} claims the user has saved nothing matching it, and they have`,
      ).not.toContain('Nothing you’ve saved matches that');
      await expect(
        page.getByRole('button', { name: new RegExp(name.slice(0, 12), 'i') }).first(),
        'the saved place is offered as a match, so the user does not create a duplicate',
      ).toBeVisible();
    });
  });
}
