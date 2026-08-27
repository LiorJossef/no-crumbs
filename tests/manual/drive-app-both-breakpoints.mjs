/**
 * Drives the running app in a real browser at one viewport, screenshots the saved-places list row
 * and the place-detail view for named places, and dumps what a screen reader would announce.
 *
 * It exists because green tests are not evidence for this surface. The enrichment work it was built
 * for turned up three things no assertion would have caught: a 27-character tag ellipsing three
 * chips at once (which is why the row now spends a character budget as well as a count cap), Hebrew
 * and Latin chips needing `dir="auto"` to sit together correctly, and — the one that matters most —
 * proving a gated `why_go` is genuinely ABSENT from the DOM rather than merely invisible. A
 * screenshot cannot prove an absence; the text dump can.
 *
 * Usage — the dev server must already be running, and must be reached on `localhost`, NOT
 * `127.0.0.1`: on this Next version that origin 403s every `/_next/static/**` request, so the page
 * never hydrates and the sign-in form silently falls back to a native GET. It looks exactly like a
 * failed login and has cost more than one person real time.
 *
 *   node tests/manual/drive-app-both-breakpoints.mjs <out-dir> <width> <height> [place-name]
 *   node tests/manual/drive-app-both-breakpoints.mjs /tmp/shots-mobile  390 844
 *   node tests/manual/drive-app-both-breakpoints.mjs /tmp/shots-desktop 1440 900 "Anat Bakery"
 *
 * Local only. Signs in as the local demo user; never point it at a hosted environment.
 */
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.argv[2];
const W = Number(process.argv[3]);
const H = Number(process.argv[4]);
const ONLY = process.argv[5];
const MOBILE = W < 900;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  isMobile: MOBILE,
  hasTouch: MOBILE,
  ...(MOBILE ? { userAgent: devices['Pixel 7'].userAgent } : {}),
});
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto('http://localhost:3000/sign-in');
await page.getByPlaceholder('you@example.com').fill('demo@example.com');
await page.getByPlaceholder('At least 6 characters').fill('local-dev-preview-1234');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL('**/map', { timeout: 60000 });
await page.waitForTimeout(4000);

async function openList() {
  if (!MOBILE) return;
  const b = page.getByRole('button', { name: /show your places/i });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(600); }
}
async function search(q) {
  const f = page.getByRole('searchbox', { name: /search your places/i }).first();
  await f.fill(q);
  await page.waitForTimeout(1200);
}
async function scrollDetail() {
  const box = await page.locator('[data-testid="place-sheet"], [data-slot="map-popup"]').first().boundingBox().catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
}
async function detailText() {
  return page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((e) => e.textContent?.trim());
    let n = h?.parentElement;
    while (n && n.parentElement && !/FROM THE POST|Remove/i.test(n.innerText)) n = n.parentElement;
    return n?.innerText ?? '(none)';
  });
}

await openList();
await shot('01-list-mixed');

const cases = [
  ['kiaans tooting', '02-five-tags'],
  ['laughing yak',   '03-whygo-suppressed'],
  ['sycamore vino',  '04-long-tag'],
  ['anat',           '05-hebrew'],
  ['container',      '06-tags-only'],
  ['nordoy',         '07-no-tags'],
  ['la nonna brix',  '08-real-filler'],
  ['the life god',   '09-real-filler2'],
].filter(([, n]) => !ONLY || n.includes(ONLY));

for (const [q, name] of cases) {
  await openList();
  await search(q);
  await shot(`${name}-row`);
  await page.getByRole('button', { name: /^Open / }).first().click();
  await page.waitForTimeout(900);
  await shot(name);
  await scrollDetail();
  await shot(`${name}-scrolled`);
  fs.appendFileSync(`${OUT}/detail-text.txt`, `\n===== ${name} =====\n` + (await detailText()) + '\n');
  const close = page.getByRole('button', { name: /close place detail/i }).first();
  if (await close.count()) await close.click();
  await page.waitForTimeout(500);
  await search('');
  await page.waitForTimeout(800);
}

await openList();
await page.waitForTimeout(500);
const names = await page.getByRole('button', { name: /^Open / }).evaluateAll(
  (els) => els.map((e) => e.getAttribute('aria-label')),
);
fs.writeFileSync(`${OUT}/aria-labels.txt`, names.join('\n'));
await browser.close();
console.log('done', OUT);
