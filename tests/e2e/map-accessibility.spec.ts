import { expect, test } from '@playwright/test';

/**
 * Regression guard for a defect that made the entire map page unreachable by assistive technology.
 *
 * `PlaceSheet` is a permanently-open, non-modal vaul drawer. vaul 1.1.2 does not forward its
 * `modal={false}` to Radix's Dialog, so Radix ran the modal path and `hideOthers()` marked
 * `<main>` — the whole application — `aria-hidden="true"`. Measured before the fix: zero elements
 * matched `getByRole` for "Add a TikTok", "Sign out" or the search field, at every breakpoint.
 *
 * Nothing in the unit tier can see this. It is a browser-level a11y-tree fact, which is why it
 * lives here (`docs/working-agreement.md` §2 — implemented is not the same as working).
 *
 * Requires credentials for a signed-in session. Skipped when they are absent, so the suite still
 * runs against a deployment where the local demo user does not exist.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('the map page is reachable by assistive technology', () => {
  test.skip(
    PASSWORD === undefined,
    'set E2E_PASSWORD (and optionally E2E_EMAIL) to run the signed-in checks',
  );

  test('<main> is not hidden from the accessibility tree, and its controls have roles', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/map');

    // The attribute itself. Asserted directly because it is the mechanism, and because a future
    // vaul or Radix upgrade could reintroduce it without changing anything else on the page.
    await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');

    // And the consequence: role queries walk the accessibility tree, so these all returned zero
    // while `<main>` was hidden, even though the buttons were on screen and clickable by mouse.
    // Two controls that exist at **both** project viewports, which is what this assertion needs
    // and what makes it stable.
    //
    // It used to name `Add a TikTok` and `Sign out`, and both have since moved. Sign-out is no
    // longer on this page at all — it lives inside `/profile` (owner ruling, 2026-08-29). And the
    // create control is named differently per breakpoint on purpose: below `lg` it is the `＋`,
    // which now opens the create menu and says `Create`, while the desktop panel keeps a literal
    // `Add a TikTok` button. Asserting either name here would pass at one viewport and fail at the
    // other, which is exactly what it did.
    //
    // The map's canvas carries a real accessible name now (`mapAccessibleName`), so a role query
    // for it proves the same thing the buttons did and is not tied to a label anyone is likely to
    // reword. The create control is the second, matched on either of its two names.
    //
    // Not the search field, which was the obvious third candidate: at the mobile sheet's peek stop
    // it is clipped and therefore out of the accessibility tree, which is correct behaviour and
    // makes it useless to a role query at one of the two viewports.
    await expect(
      page.getByRole('region', { name: /map of your saved places/i }).first(),
    ).toBeAttached();
    await expect(
      page.getByRole('button', { name: /create|add a tiktok/i }).first(),
    ).toBeAttached();
  });
});
