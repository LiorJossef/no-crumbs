/**
 * Manual end-to-end driver for `L1-F7-T2` — delete a saved place, and edit your own note — in the
 * real UI against the real database. NOT part of the CI suite.
 *
 *   node tests/manual/crud-e2e.manual.mjs [mobile|desktop]
 *
 * It exists for the same reason `import-e2e.manual.mjs` does: the failures that matter here are not
 * the ones a mocked unit test can see. `tests/unit/app/actions/saved-places.test.ts` proves the
 * *shape* of what the actions send; only running the product proves that the affordance is
 * reachable, that the list and the pins both update after a delete, and that a note survives a
 * reload. `docs/working-agreement.md` §2/§3.
 *
 * **It deletes a real row**, so point it at a throwaway. Set `E2E_TARGET` to the exact name of a
 * saved place to act on; without it the driver takes the first row in the list, which is almost
 * certainly one you wanted to keep. Seed a throwaway first, e.g.
 *
 *   psql "$DATABASE_URL" -c "select save_place('<place-uuid>', null, 'throwaway', null)"
 *
 * It leaves one `places` row behind per run, and that is correct rather than a leak: deleting a
 * saved place deliberately never touches `places`, which is shared across users. Clean up the
 * seeded one yourself if you care —
 * `delete from places where name = '<seeded name>' and id not in (select place_id from saved_places)`.
 *
 * Screenshots land in `tests/manual/.shots/` (git-ignored).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MOBILE = process.argv[2] === 'mobile';
const LABEL = MOBILE ? 'crud-mobile' : 'crud-desktop';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '.shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'local-dev-preview-1234';

const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
const page = await (
  await browser.newContext({ viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 } })
).newPage();

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${LABEL}-${name}.png`) });
  console.log(`  shot: ${LABEL}-${name}.png`);
};
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

let failures = 0;
function check(label, condition) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

/** The mobile sheet starts at `peek`, where the list is off screen. */
async function raiseSheet() {
  if (!MOBILE) return;
  await page.getByRole('button', { name: /Show your places/i }).click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1400);
}

console.log('→ sign in');
await page.goto(`${BASE}/sign-in`);
await page.getByPlaceholder('you@example.com').fill(EMAIL);
await page.getByPlaceholder('At least 6 characters').fill(PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/map', { timeout: 30_000 });
await page.waitForTimeout(4000);
await raiseSheet();
await shot('01-list');

// Scoped to `li >` deliberately: a bare role/name match also catches Next's dev-overlay button
// ("Open Next.js Dev Tools"), which exists in dev and not in a built app — an off-by-one that
// would quietly change meaning between environments.
// `:visible` is load-bearing, not tidiness. Both list surfaces are always in the DOM — the
// desktop panel (`hidden lg:block`) and the mobile sheet (`lg:hidden`, portaled to body by vaul) —
// so every row matches twice at every width, and `.first()` picks whichever the breakpoint has
// hidden. Filtering to the visible one is what makes a single script meaningful at both sizes.
const ROW = 'li > button[aria-label^="Open "]:visible';
const rows = page.locator(ROW);
const before = await rows.count();
console.log(`→ ${before} selectable place rows`);
check('the list is a keyboard-reachable entry point to place detail', before > 0);
if (before === 0) {
  await browser.close();
  process.exit(1);
}

const wanted = process.env.E2E_TARGET;
const rowNamed = (name) => page.locator(`li > button[aria-label="Open ${name}"]:visible`);
const target = wanted ? rowNamed(wanted).first() : rows.first();
if (wanted && (await target.count()) === 0) {
  console.log(`  FAIL  E2E_TARGET "${wanted}" is not in the list`);
  await browser.close();
  process.exit(1);
}
const targetName = wanted ?? (await rows.first().getAttribute('aria-label'))?.replace(/^Open /, '') ?? '(unknown)';
console.log(`→ opening "${targetName}"`);
await target.click();
await page.waitForTimeout(1200);
await shot('02-detail');

check('detail opened', await page.getByRole('button', { name: /Remove from your places/i }).count() > 0);

console.log('→ add a note');
await page.getByRole('button', { name: /Add a note|^Edit$/ }).first().click();
await page.waitForTimeout(400);
const NOTE = `verified by crud-e2e at ${new Date().toISOString()}`;
await page.getByPlaceholder('Why did you save this?').fill(NOTE);
await shot('03-note-editing');
await page.getByRole('button', { name: /^Save note$/ }).click();
await page.waitForTimeout(2500);
await shot('04-note-saved');
check('the note is on screen after saving', await page.getByText(NOTE).count() > 0);

console.log('→ reload, to prove it persisted rather than only rendered');
await page.reload();
await page.waitForTimeout(4000);
await raiseSheet();
await rowNamed(targetName).first().click();
await page.waitForTimeout(1200);
check('the note survived a reload', await page.getByText(NOTE).count() > 0);
await shot('05-note-after-reload');

console.log('→ the confirmation is two-step');
await page.getByRole('button', { name: /Remove from your places/i }).click();
await page.waitForTimeout(500);
check(
  'the first click confirms rather than deletes',
  (await page.getByRole('button', { name: /^Remove$/ }).count()) > 0,
);
await shot('06-confirm');

console.log('→ cancel, and check nothing was removed');
await page.getByRole('button', { name: /^Cancel$/ }).click();
await page.waitForTimeout(1500);
await page.reload();
await page.waitForTimeout(4000);
await raiseSheet();
check('cancelling removed nothing', (await page.locator(ROW).count()) === before);

console.log('→ remove for real');
await rowNamed(targetName).first().click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Remove from your places/i }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Remove$/ }).click();
await page.waitForTimeout(3500);
await shot('07-after-delete');

const after = await page.locator(ROW).count();
check(`the list lost exactly one row (${before} → ${after})`, after === before - 1);
check('the detail closed itself', (await page.getByRole('button', { name: /Remove from your places/i }).count()) === 0);
check('the removed place is gone from the list', (await rowNamed(targetName).count()) === 0);

console.log('→ reload, to prove the delete persisted');
await page.reload();
await page.waitForTimeout(4000);
await raiseSheet();
check('still gone after a reload', (await page.locator(ROW).count()) === before - 1);
await shot('08-final');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
