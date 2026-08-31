#!/usr/bin/env node
/**
 * **`prefers-reduced-motion` on the import rail** — the one animated screen that `verify-i2.mjs`
 * cannot reach.
 *
 * Adopted from a `reduced-motion-probe.mjs` left at the repo root by another lane on 2026-08-31.
 * The idea was right and worth keeping; what it lacked is what makes a measurement usable later:
 * it pinned `HEAD` (so it measured a working tree several agents were writing to — guardrail 31),
 * it printed to stdout and wrote nothing, it ran one viewport, and it counted animations without
 * ever checking the half of the rule that actually protects anyone.
 *
 * **That half is `stays usable`.** `facelift-plan.md` §3a says the motion collapses *to the opacity
 * change, not to nothing*, and `chrome-motion.ts` records what "to nothing" looked like the one
 * time it shipped here: a card stuck 18 px low and a mascot stuck at 61% and rotated 12°, forever,
 * for reduced-motion users only. A probe that reports `animationsRunning: 0` scores that build as a
 * pass. So this reads the **resting state** — is anything still transparent, still transformed,
 * still absent — beside the animation count, and it reads the rail's own progress copy, because a
 * wait screen whose only signal was a spinner says nothing at all once the spinner is stilled.
 *
 * ## Why this one runs `next dev`
 *
 * `src/app/import/_lib/dev-screen.ts` gates the `?state=` seam on `process.env.NODE_ENV !==
 * 'production'`, and the bundler eliminates that branch from a production build — correctly, since
 * a seam reachable in production would be a second way into a screen a real user can reach. Dev is
 * how this probe meets that guard rather than weakening it. `app-server.mjs`'s `startApp` documents
 * the consequences; the relevant one here is that **nothing timing-related may be claimed from a
 * dev-mode capture**, so this file claims none.
 *
 *   node tests/harness/reduced-motion-rail.mjs --from-commit 6499777 --out docs/evidence/i2
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_VIEWPORTS } from './viewports.mjs';
import { startStubSupabase } from './stub-supabase.mjs';
import { authCookie } from './fixtures.mjs';
import { exportCommit, startApp } from './app-server.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SCREENS = [
  { path: '/import?state=rail', name: 'rail', waitFor: 'text=Working on it' },
];

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  const v = process.argv[i + 1];
  return i === -1 || v === undefined || v.startsWith('--') ? fallback : v;
}

const freePort = () =>
  new Promise((res, rej) => {
    const probe = createServer();
    probe.once('error', rej);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => res(port));
    });
  });

/**
 * Everything read in one `evaluate`, so the DOM is described in one consistent state.
 *
 * `transitionsArmed` deliberately excludes `all` and `none`: a `transition-property: all` says
 * nothing about whether anything is animated, and counting it makes every build look identical.
 */
const PROBE = () => {
  const all = Array.from(document.querySelectorAll('*'));
  const cs = (el) => getComputedStyle(el);
  return {
    animationsRunning: all.filter((el) => cs(el).animationName !== 'none' && cs(el).animationDuration !== '0s').length,
    transitionsArmed: all.filter(
      (el) => !['none', 'all'].includes(cs(el).transitionProperty) && cs(el).transitionDuration !== '0s',
    ).length,
    loadersInDom: document.querySelectorAll('svg.lucide-loader-circle').length,
    loadersVisible: Array.from(document.querySelectorAll('svg.lucide-loader-circle')).filter(
      (el) => cs(el).display !== 'none',
    ).length,
    stepDotsVisible: Array.from(document.querySelectorAll('span.rounded-full.bg-current')).filter(
      (el) => cs(el).display !== 'none',
    ).length,
    // --- the half the original probe did not measure: is the screen still a screen? ---
    invisibleElements: all.filter((el) => {
      const s = cs(el);
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && Number(s.opacity) < 0.99 && s.visibility !== 'hidden';
    }).length,
    transformedElements: all.filter((el) => {
      const t = cs(el).transform;
      return t !== 'none' && t !== '' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
    }).length,
    // The rail's progress has to be legible without the spinner, or the preference costs the user
    // the only signal the screen carries.
    visibleText: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    focusableStops: Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && cs(el).visibility !== 'hidden';
    }).length,
  };
};

async function main() {
  const fromCommit = arg('--from-commit', 'HEAD');
  const outArg = arg('--out', 'docs/evidence/i2');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-rm-${process.pid}`);
  const report = {
    takenAt: new Date().toISOString(),
    commit: exportCommit(REPO_DIR, fromCommit, appDir),
    commitish: fromCommit,
    buildMode: 'next dev — the ?state= seam is eliminated from a production build by design',
    caveat: 'Dev mode. Nothing timing-related may be claimed from these numbers.',
    results: [],
  };

  const stub = await startStubSupabase({ port: 0, places: 0 });
  const server = await startApp(
    appDir,
    await freePort(),
    {
      NEXT_PUBLIC_SUPABASE_URL: stub.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    },
    { dev: true },
  );
  const browser = await chromium.launch();

  try {
    for (const screen of SCREENS) {
      for (const viewport of GATE_VIEWPORTS) {
        for (const reducedMotion of ['reduce', 'no-preference']) {
          const context = await browser.newContext({
            viewport: viewport.viewport,
            deviceScaleFactor: viewport.deviceScaleFactor,
            isMobile: viewport.isMobile,
            hasTouch: viewport.hasTouch,
            baseURL: server.url,
            reducedMotion,
            colorScheme: 'dark',
          });
          await context.addCookies([
            { ...authCookie(stub.url), url: server.url, httpOnly: false, sameSite: 'Lax' },
          ]);
          const page = await context.newPage();
          process.stderr.write(`[rm] ${screen.name} @ ${viewport.id} rm=${reducedMotion}\n`);
          await page.goto(screen.path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          await page.waitForSelector(screen.waitFor, { timeout: 60_000 });
          await page.waitForTimeout(1500);
          const first = await page.evaluate(PROBE);
          await page.waitForTimeout(2500);
          const second = await page.evaluate(PROBE);
          await page.screenshot({ path: join(outDir, `rail--${viewport.id}--${reducedMotion}.png`) });
          await context.close();
          report.results.push({
            screen: screen.name,
            viewport: viewport.id,
            reducedMotion,
            ...first,
            // Two reads 2.5 s apart. Identical is *stopped*; different is *still moving*, which is
            // the only way to tell a paused animation from one whose keyframes happen to be dull.
            changedOver2500ms: JSON.stringify(first) !== JSON.stringify(second),
          });
        }
      }
    }
  } finally {
    await browser.close();
    await server.stop();
    await stub.close();
    writeFileSync(join(outDir, 'reduced-motion-rail.json'), JSON.stringify(report, null, 2));
    process.stderr.write(`[rm] report -> ${join(outDir, 'reduced-motion-rail.json')}\n`);
  }
}

await main();
