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

    // Review screen. The heading is the honest "extraction finished" signal — the Save button is
    // not, because it is absent whenever nothing is selected, which is a legitimate state.
    const reviewHeading = page.getByRole('heading', { name: /\d+ places? found/ });
    await expect(reviewHeading).toBeVisible({ timeout: 90_000 });

    // Candidates render as `role="checkbox"` (`candidate-card.tsx`). One of two things is true
    // here: this is a first import and the confident candidate is pre-selected, or the place is
    // already on the map from this same video and it is deliberately deselected. Both are correct
    // product behaviour, and both must end with exactly one candidate selected.
    const candidates = page.getByRole('checkbox');
    await expect(candidates.first()).toBeVisible({ timeout: 30_000 });
    const selectedAlready = await page.getByRole('checkbox', { checked: true }).count();
    if (selectedAlready === 0) {
      await candidates.first().click();
      await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1);
    }

    const saveButton = page.getByRole('button', { name: /^Save (this place|\d+ places) →$/ });
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    const reviewHeadline = await reviewHeading.innerText();
    const cardText = await page.locator('main').innerText();

    await saveButton.click();
    await page.waitForURL('**/map', { timeout: 60_000 });
    console.log(JSON.stringify({
      reviewHeadline,
      selectedAlready,
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
