/**
 * Manual end-to-end driver for the real TikTok import flow. NOT part of the CI suite — it drives a
 * real browser against the local dev server, the local Supabase container, the live TikTok oEmbed
 * endpoint and (on a cache miss) the real model.
 *
 *   node tests/manual/import-e2e.manual.mjs <tiktok-url> [label] [mobile|desktop]
 *
 * Screenshots land in `tests/manual/.shots/` (git-ignored). It exists because the important
 * failures in this flow are not the ones a mocked unit test can see: an import that saves eight
 * correct rows while the map sits on another continent passes every assertion in `tests/unit` and
 * is still broken. `docs/working-agreement.md` §2/§3.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_TO_IMPORT = process.argv[2] ?? null;
const LABEL = process.argv[3] ?? 'run';
const VIEWPORT =
  process.argv[4] === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const OUT = join(dirname(fileURLToPath(import.meta.url)), '.shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'local-dev-preview-1234';

const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${LABEL}-${name}.png`) });
  console.log(`  shot: ${LABEL}-${name}.png`);
};
const text = async () =>
  (await page.locator('body').innerText()).split('\n').filter(Boolean);

page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('response', (r) => {
  if (r.url().includes('/api/')) console.log(`  [api] ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
});

/** The "Add a TikTok" button exists in both the desktop panel and the mobile sheet; only one is
 *  visible at a given width, and neither is present until the map page has painted. */
async function clickAddTikTok() {
  const buttons = page.getByRole('button', { name: /add a tiktok/i });
  await buttons.first().waitFor({ state: 'attached', timeout: 30_000 });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    if (await buttons.nth(i).isVisible()) {
      await buttons.nth(i).click();
      return;
    }
  }
  throw new Error('no visible "Add a TikTok" button');
}

console.log('→ sign in');
await page.goto(`${BASE}/sign-in`);
await page.getByPlaceholder('you@example.com').fill(EMAIL);
await page.getByPlaceholder('At least 6 characters').fill(PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/map', { timeout: 30_000 });
await page.waitForTimeout(4000);
await shot('01-map-before');

if (URL_TO_IMPORT === null) {
  console.log('no URL given — map only');
  await browser.close();
  process.exit(0);
}

console.log('→ open import');
await clickAddTikTok();
await page.waitForTimeout(1200);
await shot('02-paste');

console.log('→ paste + submit');
await page.getByPlaceholder('Paste a TikTok link').fill(URL_TO_IMPORT);
await page.getByRole('button', { name: 'Add →' }).click();
await page.waitForTimeout(2000);
await shot('03-rail');

console.log('→ waiting for a settled screen (up to 150s)');
const startedAt = Date.now();
let settled = false;
while (Date.now() - startedAt < 150_000) {
  const done = await page.getByRole('button', { name: /^(Done|Saving…|Save .*)$/ }).count();
  const terminal = await page.getByText(/no places|couldn.t read|didn.t name|add it by hand/i).count();
  if (done > 0 || terminal > 0) { settled = true; break; }
  await page.waitForTimeout(1000);
}
console.log(`  settled=${settled} after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
await shot('04-result');
console.log((await text()).slice(0, 70).map((l) => `  | ${l}`).join('\n'));

const done = page.getByRole('button', { name: /^(Done|Save .*)$/ });
if (await done.count()) {
  console.log('→ pressing the primary action');
  await done.first().click();
  await page.waitForTimeout(6000);
  await shot('05-after-done');
  console.log((await text()).slice(0, 30).map((l) => `  | ${l}`).join('\n'));
}

await page.waitForTimeout(2500);
await shot('06-final');
await browser.close();
console.log('done.');
