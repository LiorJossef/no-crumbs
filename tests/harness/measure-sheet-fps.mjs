#!/usr/bin/env node
/**
 * W7-6's third clause: **does the map hold frame rate while the sheet is open?**
 *
 * `facelift-plan.md` finding 12 names the standing risk — *six `backdrop-blur` surfaces sit over a
 * live WebGL canvas* — and the sheet is the largest of them. So the measurement is not "how fast is
 * the map"; it is **the same map interaction with the sheet open and with it closed**, on the same
 * build, in one process. A single number for the open case answers nothing: this hardware is
 * software-GL and slow in absolute terms, and the criterion is about a *cost*, not a threshold.
 *
 * The interaction is a pan and a zoom on the canvas, which is what forces continuous repaint under
 * the blur. Loading the page does not: a still map composites once.
 *
 * **Read the over-budget counts, not `maxMs`.** Measured on 2026-08-31, a 30-pin map reported a
 * higher `maxMs` (850 ms) than a 2,000-pin map (766 ms) on the same commit — which cannot be a
 * pin-count effect and settles that `maxMs` is noise at this sample size. `overs` is the signal.
 * The run repeats each condition and reports every repeat, so the spread is visible rather than
 * averaged away.
 *
 * Production build only. Dev mode has different bundling and different timing and is excluded from
 * every timing claim in this repository.
 *
 *   node tests/harness/measure-sheet-fps.mjs --from-commit HEAD --places 30 --repeats 3
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_VIEWPORTS } from './viewports.mjs';
import { startStubSupabase } from './stub-supabase.mjs';
import { authCookie } from './fixtures.mjs';
import { exportCommit, buildApp, startApp } from './app-server.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  const v = process.argv[i + 1];
  return i === -1 || v === undefined || v.startsWith('--') ? fallback : v;
}

function findFreePort() {
  return new Promise((res, rej) => {
    const probe = createServer();
    probe.once('error', rej);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => res(port));
    });
  });
}

async function launchBrowser() {
  try {
    return { browser: await chromium.launch(), note: 'bundled Playwright Chromium' };
  } catch {
    return { browser: await chromium.launch({ channel: 'chrome' }), note: 'system Chrome' };
  }
}

function stats(frameTimes) {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const at = (p) =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  return {
    frames: frameTimes.length,
    medianMs: Number(at(50).toFixed(2)),
    p95Ms: Number(at(95).toFixed(2)),
    maxMs: Number(Math.max(0, ...frameTimes).toFixed(2)),
    over16_7ms: frameTimes.filter((d) => d > 16.7).length,
    over33_3ms: frameTimes.filter((d) => d > 33.3).length,
  };
}

/** Pan and zoom the canvas, recording the rAF deltas that happen while it moves. */
async function driveTheMap(page, viewport) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__last = null;
    window.__recording = true;
    const tick = (now) => {
      if (window.__last !== null && window.__recording) window.__frames.push(now - window.__last);
      window.__last = now;
      if (window.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const { width, height } = viewport.viewport;
  const cx = Math.round(width / 2);
  const cy = Math.round(height * 0.35); // above the sheet, so the drag lands on the map

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    await page.mouse.move(cx - i * 4, cy - i * 2);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.mouse.move(cx, cy);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);

  const frames = await page.evaluate(() => {
    window.__recording = false;
    return window.__frames ?? [];
  });
  return frames;
}

/** True when the sheet reports itself open, so a failed click is never silently measured as one. */
async function openTheSheet(page) {
  const toggle = page.getByRole('button', { name: /^Show your places/ });
  if ((await toggle.count()) === 0) return { opened: false, why: 'no "Show your places" control on this screen' };
  const before = await page.evaluate(() => document.body.innerText.length);
  await toggle.first().click();
  await page.waitForTimeout(900); // the stop is a spring
  const after = await page.evaluate(() => document.body.innerText.length);
  // The peek strip carries one line; the open sheet carries the library. If the text did not grow,
  // the sheet did not open and this run must not be reported as "sheet open".
  return { opened: after > before + 20, before, after };
}

async function main() {
  const fromCommit = arg('--from-commit', 'HEAD');
  const places = Number(arg('--places', '30'));
  const repeats = Number(arg('--repeats', '3'));
  const outArg = arg('--out', 'docs/evidence/qa/sheet-fps');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const report = {
    takenAt: new Date().toISOString(),
    commit: null,
    dataSource: 'stub',
    buildMode: 'next build + next start',
    places,
    repeats,
    browser: null,
    runs: [],
    caveats: [
      'Software GL in headless Chromium. Absolute numbers are an upper bound; the comparison between the two conditions is the result.',
      'Read over16_7ms and over33_3ms. maxMs is noise-dominated at this sample size.',
      'Stub-backed pins. This measures rendering N markers under the sheet, not the real data path.',
      'The 60fps-on-a-real-device half of W7-6 cannot be run here and is not claimed.',
    ],
  };

  let stub = null;
  let server = null;
  let browser = null;
  try {
    const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-sheetfps-${process.pid}`);
    process.stderr.write(`[sheet] exporting ${fromCommit}\n`);
    report.commit = exportCommit(REPO_DIR, fromCommit, appDir);
    stub = await startStubSupabase({ port: 0, places });
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: stub.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    };
    process.stderr.write('[sheet] building\n');
    const build = buildApp(appDir, env);
    if (!build.ok) {
      process.stderr.write(build.output);
      process.exit(1);
    }
    server = await startApp(appDir, await findFreePort(), env);

    const launched = await launchBrowser();
    browser = launched.browser;
    report.browser = launched.note;
    const cookie = authCookie(stub.url);

    for (const viewport of GATE_VIEWPORTS) {
      for (const condition of ['sheet-closed', 'sheet-open']) {
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          const context = await browser.newContext({
            viewport: viewport.viewport,
            deviceScaleFactor: viewport.deviceScaleFactor,
            isMobile: viewport.isMobile,
            hasTouch: viewport.hasTouch,
            baseURL: server.url,
          });
          await context.addCookies([{ ...cookie, url: server.url, sameSite: 'Lax' }]);
          const page = await context.newPage();
          await page.goto('/map', { waitUntil: 'domcontentloaded', timeout: 45_000 });
          try {
            await page.waitForLoadState('networkidle', { timeout: 20_000 });
          } catch {
            /* tiles keep arriving */
          }
          await page.waitForTimeout(3000);

          let sheet = { opened: false };
          if (condition === 'sheet-open') {
            sheet = await openTheSheet(page);
          }
          const frames = await driveTheMap(page, viewport);
          await context.close();

          const run = {
            viewport: viewport.id,
            condition,
            repeat,
            sheetOpened: condition === 'sheet-open' ? sheet.opened : null,
            ...(sheet.why ? { note: sheet.why } : {}),
            ...stats(frames),
          };
          report.runs.push(run);
          process.stderr.write(
            `[sheet] ${viewport.id} ${condition} #${repeat}` +
              `${condition === 'sheet-open' ? ` (opened=${sheet.opened})` : ''}: ` +
              `${run.frames} frames, ${run.over16_7ms} over 16.7ms, ${run.over33_3ms} over 33.3ms, max ${run.maxMs}ms\n`,
          );
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
    if (stub) await stub.close();
    writeFileSync(join(outDir, 'sheet-fps.json'), JSON.stringify(report, null, 2));
  }

  const failedToOpen = report.runs.filter((r) => r.condition === 'sheet-open' && r.sheetOpened === false);
  if (failedToOpen.length > 0) {
    process.stderr.write(
      `\n[sheet] ${failedToOpen.length} "sheet-open" runs did NOT open the sheet. Those rows measure ` +
        `the closed state under an open label and must not be reported.\n`,
    );
    process.exitCode = 1;
  }
  process.stderr.write(`\n[sheet] report -> ${join(outDir, 'sheet-fps.json')}\n`);
}

await main();
