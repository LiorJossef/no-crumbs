/**
 * Q3 probe — read the review screen's three cards as text, not as a picture.
 *
 * The screenshot harness photographs a fixed viewport and the candidate list is an internal scroll
 * container, so the third card — the `capped` one that W1-4 and W6-4 are both about — is below the
 * fold in every capture. This dumps every card's rendered text and its tick state instead, so the
 * gate is judged on the strings rather than on what happened to fit.
 *
 * Throwaway probe (agent-guardrails: probe harnesses live in tests/manual/). Runs `next dev`,
 * because the `?state=` seam is eliminated from a production build on purpose.
 *
 *   node tests/manual/q3-review-card-text.manual.mjs <commit>
 */
import { createServer } from 'node:net';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { GATE_VIEWPORTS } from '../harness/viewports.mjs';
import { startStubSupabase } from '../harness/stub-supabase.mjs';
import { authCookie } from '../harness/fixtures.mjs';
import { exportCommit, startApp } from '../harness/app-server.mjs';

const REPO_DIR = process.cwd();
const commitish = process.argv[2] ?? 'HEAD';

function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const appDir = join(process.env.TMPDIR ?? '/tmp', `q3-probe-${process.pid}`);
const sha = exportCommit(REPO_DIR, commitish, appDir);

const stub = await startStubSupabase({ port: 0, places: 0 });
const env = {
  NEXT_PUBLIC_SUPABASE_URL: stub.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
};
const server = await startApp(appDir, await findFreePort(), env, { dev: true });

const browser = await chromium.launch({ channel: 'chrome' });
const spec = GATE_VIEWPORTS.find((v) => v.viewport.width === 390) ?? GATE_VIEWPORTS[0];
const context = await browser.newContext({
  viewport: spec.viewport,
  deviceScaleFactor: spec.deviceScaleFactor,
  isMobile: spec.isMobile,
  hasTouch: spec.hasTouch,
  baseURL: server.url,
});
await context.addCookies([
  { ...authCookie(stub.url), url: server.url, httpOnly: false, sameSite: 'Lax' },
]);
const page = await context.newPage();

const out = { commit: sha, screens: {} };

for (const state of ['review', 'rail', 'no-places']) {
  await page.goto(`${server.url}/import?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  out.screens[state] = await page.evaluate(() => ({
    body: (document.body.innerText ?? '').replace(/\n{2,}/g, '\n').trim(),
    ticks: [...document.querySelectorAll('[role="checkbox"],[aria-pressed],input[type=checkbox]')].map(
      (el) => ({
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        checked: el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed') ?? String(el.checked),
      }),
    ),
  }));
}

console.log(JSON.stringify(out, null, 2));

await browser.close();
await server.stop();
await stub.close();
