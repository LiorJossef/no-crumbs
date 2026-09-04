import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * FIX-ERR-QA — the core loop still works after the error-handling change.
 *
 * `fix/honest-import-errors` rewrote the screen router in `import-page-client.tsx` (a single
 * `probe_error` screen replacing `RedirectScreen` + the old failure screen) and the whole failure
 * half of the probe route. Nothing in that is supposed to touch the success path, which is exactly
 * why it is worth driving end to end: paste → rail → review → confirm → a saved place.
 *
 * The URL is one whose extraction is already cached in `extractions` on the local database, so
 * this test **must not** cost a model call. `save_place` is idempotent
 * (`on conflict (user_id, place_id) do update`), so re-running it does not pollute the fixture.
 *
 * ## Why this drives the selection instead of assuming it
 *
 * It used to wait straight for the Save button, which made it a **first-ever import** test wearing
 * the name of the core loop. Every later run met a product behaviour working exactly as designed:
 * the demo user already had this place from this same video, so `prior-saves.ts` reported "Already
 * on your map from this TikTok video" and left the candidate **deselected** — and with nothing
 * selected there is no Save button, so the spec sat out a 90s timeout and failed while the app was
 * right. It failed in CI for the same reason from the other direction: `mobile-chrome` and
 * `desktop-chrome` run this file in parallel as the same user against the same URL, so whichever
 * saved first sent the other down the already-saved path.
 *
 * So the fixture state is now driven rather than assumed: whatever the review screen offers, make
 * sure exactly one candidate is selected, then save. That costs nothing, removes the collision,
 * and covers the prior-save path — which no other spec did.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;
const CACHED = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

test.describe('the import core loop', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 240_000 });

  test('paste, review and confirm a real TikTok', async ({ page }) => {
    const confirms: { status: number; body: string }[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/api/imports/confirm')) {
        confirms.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) });
      }
    });

    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(CACHED);
    await page.getByRole('button', { name: 'Add →' }).click();

    // `Add a note` belongs to a candidate card, so it exists once and only once extraction has
    // produced something to review — in every variant, and on no other screen. Four weaker signals
    // were tried first, and each encoded one variant rather than the state:
    //
    //  - the Save button is absent whenever nothing is selected, which is legitimate;
    //  - `N places found` changes element between variants — a paragraph on a first import, where
    //    the `h1` is the place name, and the `h1` itself on a re-import of a place already saved
    //    from this video. Matching the text without the role is worse still: the rail narrates the
    //    same words while extraction is running, so it passes before there is anything to review;
    //  - the candidate card is not always a `checkbox`. A single confident candidate renders with
    //    no selection control at all — there is nothing to choose between — so the checkbox exists
    //    only in the multi-candidate and already-saved shapes;
    //  - `Nothing is saved yet.` sits inside the same branch as the Save button, despite the
    //    comment above it calling itself unconditional, so it is absent for exactly as long as
    //    the Save button is.
    //
    // The first three passed on the owner's machine, where this fixture had been saved before,
    // and failed in CI, where the seed is fresh; the fourth failed the other way round.
    await expect(page.getByRole('button', { name: /add a note/i }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Selection, where there is any to make. One of three things is true, all of them correct
    // product behaviour: a single confident candidate is already implicit and draws no control; a
    // candidate is pre-selected; or the place is already on the map from this same video and is
    // deliberately deselected. All three must end with something to save.
    const candidates = page.getByRole('checkbox');
    if ((await candidates.count()) > 0) {
      const selectedAlready = await page.getByRole('checkbox', { checked: true }).count();
      if (selectedAlready === 0) {
        await candidates.first().click();
        await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1);
      }
    }

    const saveButton = page.getByRole('button', { name: /^Save (this place|\d+ places) →$/ });
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    // Recorded, not asserted, and read by text because of the variant split described above.
    const reviewHeadline = await page.getByText(/\d+ places? found/).first().innerText();
    const cardText = await page.locator('main').innerText();

    await saveButton.click();
    await page.waitForURL('**/map', { timeout: 60_000 });
    console.log(JSON.stringify({
      reviewHeadline,
      confirms,
      landedOn: page.url(),
      review: cardText.replace(/\n+/g, ' | ').slice(0, 400),
    }));

    expect(confirms.length, 'exactly one confirm call').toBe(1);
    expect(confirms[0]?.status, 'confirm must succeed').toBe(200);
    // Breakpoint-agnostic: the saved-places control is a bottom-sheet trigger on mobile and part
    // of the sidebar on desktop, so its *visibility* differs by design. That it is attached with a
    // count in it is the fact that matters here. The written rows themselves are checked in SQL,
    // not through the UI.
    // Queried by attribute, not by role: on desktop this control is not exposed to `getByRole`
    // (recorded, not asserted — a11y at the desktop breakpoint is `map-accessibility.spec.ts`'s
    // subject, not this file's).
    const places = page.locator('[aria-label="Show your places"]').first();
    await expect(places).toBeAttached({ timeout: 30_000 });
    // A count, not a wording. The label belongs to `ui/place/list-scope.ts` and changes with the
    // scope the map is showing — `60 in 4 countries` when the camera spans them, a places-saved
    // phrasing when it does not — so pinning one spelling here made this assertion a copy test
    // that failed on a scope change. What this file needs to know is that the control carries a
    // count; the written rows are checked in SQL, as the note above says.
    await expect(places).toContainText(/\d+/);
  });
});
