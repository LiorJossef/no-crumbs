#!/usr/bin/env node
/**
 * **A/B the post-login arrival: two commits served at once, runs alternating.**
 *
 * `measure-arrival.mjs` builds one commit and measures it, which is enough for a difference of two
 * orders of magnitude and useless below about a second. This repo is built by several lanes at the
 * same time, and the evidence for that is not an argument — it is a measurement:
 *
 * | `5c3d3a9`, unchanged, 1440×900, place list painted | |
 * |---|---|
 * | 11:45 | 2467 / 2613 / 2509 ms |
 * | 11:57 | 2829 / 3010 / 2946 ms |
 * | 12:08 | 4445 / 3016 / 3072 / 7639 / 8692 ms |
 *
 * Same commit, same instrument, same machine, one session. A before/after taken across that drift
 * can invent a regression or hide one, and it did both here: a single-arm pair appeared to show the
 * wordmark 1400 ms slower after a change that does not touch the wordmark's clock.
 *
 * So both commits are exported, built and **served simultaneously**, and the runs go A B A B. Drift
 * is then shared by both arms rather than attributed to the change. What this cannot fix is
 * variance — report every run and a median, never a single number.
 *
 *   node tests/harness/ab-arrival.mjs --a <sha> --b <sha> [--runs 5] [--viewport 1440x900]
 *                                     [--motion no-preference|reduce]
 *
 * ## What it reads, and why only two things
 *
 * `list` is the place list painted — the surface the mount-versus-reveal fix is about. `wordmark`
 * is beat 5, and on a desktop viewport it is the **only** surface still reading the entrance's
 * ground clock, which makes it the honest check on whether a change to the shell delayed the map's
 * own `idle`. The sheet is deliberately absent: it is `lg:hidden` at `lg+`, and a `display: none`
 * element's rect is all zeros, so every "is it on screen" test scores it a pass forever. Measure
 * the sheet below `lg`, with `measure-arrival.mjs`.
 */

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { GATE_VIEWPORTS } from './viewports.mjs';
import { startStubSupabase } from './stub-supabase.mjs';
import { authCookie } from './fixtures.mjs';
import { exportCommit, buildApp, startApp } from './app-server.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  const v = process.argv[i + 1];
  return i === -1 || v === undefined || v.startsWith('--') ? fallback : v;
};
const A = arg('--a', 'HEAD~1');
const B = arg('--b', 'HEAD');
const RUNS = Number(arg('--runs', '5'));
const VIEWPORT_ID = arg('--viewport', '1440x900');
const MOTION = arg('--motion', 'no-preference');
const WINDOW_MS = 9200;

const viewport = GATE_VIEWPORTS.find((v) => v.id === VIEWPORT_ID);
if (!viewport) {
  throw new Error(`unknown viewport ${VIEWPORT_ID}; have ${GATE_VIEWPORTS.map((v) => v.id).join(', ')}`);
}

const freePort = () =>
  new Promise((res, rej) => {
    const p = createServer();
    p.once('error', rej);
    p.listen(0, '127.0.0.1', () => {
      const { port } = p.address();
      p.close(() => res(port));
    });
  });

/** `windowMs` is a parameter, not a closed-over constant — see `measure-arrival.mjs`'s `PROBE`
 *  for the `ReferenceError` that costs you every mark after the first frame. */
const PROBE = (windowMs) => {
  window.__ab = { t0: performance.now(), list: null, wordmark: null };
  /** `<script>` carries the RSC flight payload, which names every fixture place. See
   *  `measure-arrival.mjs`'s header — without this the list reads as present at ~7 ms on a build
   *  where it was never rendered. */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE']);
  const painted = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      o *= Number(cs.opacity);
    }
    return o > 0.5;
  };
  const sample = () => {
    const t = performance.now() - window.__ab.t0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || SKIP.has(el.tagName)) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (window.__ab.list === null && /No\.\s*\d+/.test(text) && painted(el)) window.__ab.list = t;
      if (window.__ab.wordmark === null && text === 'No Crumbs' && painted(el)) {
        window.__ab.wordmark = t;
      }
    }
    if (t < windowMs) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/**
 * One throwaway navigation per server before anything is measured.
 *
 * `next start` serves its first request to a route noticeably more slowly than the rest, and with
 * no warm-up that penalty lands entirely on run 1 — which, on a 9 s window, is enough to push
 * beat 4 past the end of the sampling and report the sheet as never having risen. Measured at
 * `d689318`: a single cold run said `risen=never`, and three warm runs on the same commit said
 * 2993 / 2997 / 3107 ms. A number that is an artefact of being first is worse than no number.
 */
async function warmUp(browser, server, cookieFor) {
  const context = await browser.newContext({ baseURL: server.url });
  await context.addCookies([{ ...cookieFor, url: server.url, sameSite: 'Lax' }]);
  const page = await context.newPage();
  try {
    await page.goto('/map', { waitUntil: 'load', timeout: 45_000 });
    await page.waitForTimeout(2000);
  } finally {
    await context.close();
  }
}

const stub = await startStubSupabase({ places: 30 });
const env = {
  NEXT_PUBLIC_SUPABASE_URL: stub.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
};

const arms = [];
for (const [name, commitish] of [
  ['A', A],
  ['B', B],
]) {
  const dir = join(tmpdir(), `ab-arrival-${name}`);
  const sha = exportCommit(REPO_DIR, commitish, dir);
  process.stderr.write(`[ab] ${name} = ${sha} — building\n`);
  const built = buildApp(dir, env);
  if (!built.ok) {
    process.stderr.write(built.output.slice(-3000));
    throw new Error(`${name} build failed`);
  }
  arms.push({ name, sha, dir, server: await startApp(dir, await freePort(), env) });
}

const browser = await chromium.launch();
const results = { a: A, b: B, viewport: VIEWPORT_ID, motion: MOTION, runs: [] };
for (const arm of arms) {
  process.stderr.write(`[ab] warming up ${arm.name}\n`);
  await warmUp(browser, arm.server, authCookie(stub.url));
}
try {
  for (let run = 1; run <= RUNS; run += 1) {
    for (const arm of arms) {
      const context = await browser.newContext({
        viewport: viewport.viewport,
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        baseURL: arm.server.url,
        colorScheme: 'dark',
        reducedMotion: MOTION,
      });
      await context.addCookies([{ ...authCookie(stub.url), url: arm.server.url, sameSite: 'Lax' }]);
      await context.addInitScript(PROBE, WINDOW_MS);
      const page = await context.newPage();
      await page.goto('/map', { waitUntil: 'commit', timeout: 45_000 });
      await page.waitForTimeout(WINDOW_MS);
      const m = await page.evaluate(() => window.__ab);
      await context.close();
      results.runs.push({ run, arm: arm.name, sha: arm.sha, ...m });
      const ms = (v) => (v === null ? 'never' : v.toFixed(0));
      process.stderr.write(
        `[ab] run ${run} ${arm.name} (${arm.sha.slice(0, 7)})  list=${ms(m.list)}  wordmark=${ms(m.wordmark)}\n`,
      );
    }
  }
} finally {
  await browser.close();
  for (const arm of arms) await arm.server.stop();
  await stub.close();
}

const outFile = join(tmpdir(), `ab-arrival--${VIEWPORT_ID}--${MOTION}.json`);
writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);

const median = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)].toFixed(0) : '—';
};
const cell = (v) => (v === null || v === undefined ? '—' : v.toFixed(0));
process.stdout.write(`\n== ${VIEWPORT_ID} ${MOTION}, alternating, ${RUNS} runs each ==\n`);
for (const arm of arms) {
  const mine = results.runs.filter((r) => r.arm === arm.name);
  process.stdout.write(
    `${arm.name} ${arm.sha.slice(0, 7)}  list ${mine.map((r) => cell(r.list)).join(' / ')}` +
      `  (median ${median(mine.map((r) => r.list))})\n` +
      `${' '.repeat(11)}wordmark ${mine.map((r) => cell(r.wordmark)).join(' / ')}` +
      `  (median ${median(mine.map((r) => r.wordmark))})\n`,
  );
}
process.stdout.write(`\n${outFile}\n`);
