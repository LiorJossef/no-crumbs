import { expect, type Page } from '@playwright/test';

/**
 * Signing the demo user in, with the one thing every copy of this helper was missing: **it reads
 * the field back.**
 *
 * ## Why a `fill` is not enough
 *
 * Under `next dev` the sign-in form paints before React has hydrated. A `fill` that lands in that
 * window puts the value in the DOM, and hydration then replaces the input with a controlled one
 * whose state is the empty initial value — so the value is silently discarded, the click submits an
 * empty form natively (`GET /sign-in?`), and the attempt is burned. Nothing throws; the page simply
 * stays where it was.
 *
 * Measured on 2026-09-02 against `http://127.0.0.1:4311`: five specs failed with
 * `could not sign in after four attempts`, and the captured page snapshot showed the form still on
 * screen with **both fields empty** — while the same credentials returned an `access_token` from
 * `/auth/v1/token?grant_type=password` on the first try. The credentials were never the problem.
 *
 * A production build hydrates fast enough that this almost never fires, which is why CI has been
 * signing in successfully all along and why the failure only ever appears on the machine of whoever
 * tries to reproduce a CI failure locally. That asymmetry is the expensive part: it makes the
 * suite feel unrunnable outside CI, and a suite nobody runs locally is a suite that drifts.
 *
 * ## What this does instead
 *
 * `expect(...).toPass()` re-runs fill-then-verify until the value survives its own read-back, so a
 * fill eaten by hydration is retried rather than submitted. The outer four-attempt loop stays: it
 * covers the other half of the race, where both fields hold their values and the *click* is the
 * event that lands pre-hydration.
 *
 * Deliberately not done: waiting on a hydration marker. There is no such marker in `src/` and
 * inventing one for the tests would put a test-only attribute in the product. Reading the value the
 * user would see is the same check without the coupling.
 */
export async function signInAsDemoUser(page: Page, email: string, password: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const emailField = page.getByPlaceholder('you@example.com');
    const passwordField = page.locator('#password');

    try {
      await expect(async () => {
        await emailField.fill(email);
        await passwordField.fill(password);
        expect(await emailField.inputValue()).toBe(email);
        expect(await passwordField.inputValue()).toBe(password);
      }).toPass({ timeout: 15_000 });
    } catch {
      // The form never held the values within the budget. Reload and try the whole thing again
      // rather than clicking a form we know is empty.
      continue;
    }

    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      return;
    } catch {
      // The click itself landed pre-hydration. Same remedy: start over.
    }
  }
  throw new Error('could not sign in after four attempts');
}
