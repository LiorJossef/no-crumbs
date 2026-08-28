/**
 * The guard that stops a skipped tier from reading as a passing one.
 *
 * ## What went wrong, and why a `test.skip` was not enough on its own
 *
 * Every signed-in spec in this directory opens with
 * `test.skip(PASSWORD === undefined, 'set E2E_PASSWORD ...')`. That is the right behaviour for a
 * developer who has not set the variable: the suite should degrade to the signed-out smoke tier,
 * not fail. The problem was never the skip — it was that CI hit the same branch. The `playwright`
 * job started no Supabase and set no `E2E_PASSWORD`, so 28 of 34 tests skipped on every run
 * (measured 2026-08-28) and the check still reported green. The map, the place sheet, the import
 * happy path, the failure screens, double-submit, stale-response cancellation and the a11y
 * regression guard had never run in CI, and a green tick had been saying they did.
 *
 * So the rule this file encodes is narrow: **skipping is fine; skipping silently in CI is not.**
 *
 * ## The three environments, and why only one of them is fatal
 *
 *  1. **A local run.** `CI` is unset. Skipping is normal — not everyone wants a database up to
 *     check the landing page renders. Nothing happens here.
 *  2. **CI against a deployment** (`PLAYWRIGHT_BASE_URL` set — a Vercel preview). The demo user
 *     legitimately does not exist there; `supabase/seed.sql` is local-only and the hosted projects
 *     have no equivalent. Skipping the signed-in tier is the correct outcome, so this is allowed
 *     and only announced.
 *  3. **CI driving our own build** (`CI` set, no `PLAYWRIGHT_BASE_URL`). The workflow stands up a
 *     local Supabase and seeds the demo user precisely so these tests can run. Missing credentials
 *     here mean the job is misconfigured, and the only honest outcome is a failed job — never a
 *     green one covering six smoke tests.
 *
 * Deliberately not done: verifying the credentials actually authenticate. That is what the specs
 * themselves do, and a setup step that logs in would be a second, quietly different sign-in path.
 */
export default function globalSetup(): void {
  const isCI = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';
  const drivesADeployment = (process.env.PLAYWRIGHT_BASE_URL ?? '') !== '';
  const hasCredentials = (process.env.E2E_PASSWORD ?? '') !== '';

  if (!isCI || hasCredentials) return;

  if (drivesADeployment) {
    console.warn(
      '[e2e] E2E_PASSWORD is not set and PLAYWRIGHT_BASE_URL points at a deployment: the ' +
        'signed-in tier will skip. That is expected against a preview URL, where the ' +
        'seed.sql demo user does not exist.',
    );
    return;
  }

  throw new Error(
    'E2E_PASSWORD is not set, so every signed-in spec in tests/e2e would skip and this job would ' +
      'still report success. That is the exact defect this guard exists for. CI must stand up a ' +
      'local Supabase, run the seeded reset, and pass E2E_PASSWORD — see the `e2e` job in ' +
      '.github/workflows/ci.yml. Fix the job; do not delete this check.',
  );
}
