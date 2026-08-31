#!/usr/bin/env node
/**
 * **How long the post-login arrival withholds the place list, at a named commit.**
 *
 * Written for the mount-versus-reveal defect in `map-shell.tsx` (2026-08-31), where both list
 * surfaces sat behind `{listArrived && …}` and the desktop place list therefore did not exist in
 * the document for ~2.5 s. `measure-motion.mjs` answers *did anything move and what did it cost*;
 * this answers a narrower question that one cannot: **when could somebody read their places.**
 *
 * ## Three clocks, and merging them is how the defect stayed invisible
 *
 * | | |
 * |---|---|
 * | `domMs` | first frame a marker is in the rendered DOM — the **mount** |
 * | `visibleMs` | first frame an element carrying it is **painted**: effective opacity > 0.5 through every ancestor, a rect of at least 2×2, and its own centre inside the viewport — the **reveal** |
 * | `sheet.risen` | first frame `[data-testid="place-sheet"]` has any part on screen — **beat 4** |
 *
 * A fix that only mounts moves `domMs` and leaves `visibleMs` alone; a fix that only reveals cannot
 * move `domMs` at all. One number cannot tell those apart, and the committed screenshot
 * `docs/evidence/i2/screens/map-arrival--1440x900--t1500ms.png` is a picture of `visibleMs`.
 *
 * ## Two traps this instrument exists to *not* fall into, both found the hard way
 *
 * **1. `<script>` is in the document and is not the document's content.** Next embeds the RSC flight
 * payload as `self.__next_f.push(…)`, and that payload carries every fixture place name. The first
 * version of this file walked `textContent` without excluding it and reported the list present at
 * **7 ms** against `5c3d3a9` — a build where the panel was measurably not painted until 2467 ms.
 * A screen reader cannot read a script tag either. See `SKIP`.
 *
 * **2. A `display: none` element's rect is all zeros, and zero is on screen.** `Drawer.Content` is
 * `lg:hidden`, so at 1440×900 the sheet reports `top: 0 < innerHeight` on every frame and any naive
 * "has it risen" test scores it a pass forever. The `sheet` columns are meaningful **below `lg`
 * only**; on a desktop viewport the wordmark is the surface still reading the entrance's ground
 * clock, and it is what to watch there.
 *
 * ## And the resting state is read separately, at the end
 *
 * A marker present on frame 1 and gone by frame 300 passes every "first frame" test in this file.
 * `REST` therefore re-reads the sheet's position, its transform, its `--snap-point-height`, and
 * whether it is in the accessibility tree at all — which is the claim `map-shell.tsx`'s header
 * makes and the thing a `translate3d(0, 0, 0)` regression would break silently. That regression is
 * not hypothetical: withholding the active snap point *without* pinning `--snap-point-height` puts
 * the sheet at the top of the phone one frame after mount, and it was photographed before it was
 * understood.
 *
 * Everything runs against `git archive <sha>` in a scratch directory (`app-server.mjs`), so no
 * agent's working tree is involved and nothing here mutates git.
 *
 *   node tests/harness/measure-arrival.mjs --commit <sha> [--runs 3] [--label before] [--out DIR]
 *
 * **On this machine, a single-arm before/after is not measurable below ~1 s.** The same commit
 * moved from 2467 ms to 4445 ms across one session with no code change, because several lanes
 * build concurrently. For a difference of a few hundred milliseconds use `ab-arrival.mjs`, which
 * serves both commits at once and alternates.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

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

const COMMIT = arg('--commit', 'HEAD');
const RUNS = Number(arg('--runs', '3'));
const LABEL = arg('--label', COMMIT);
const OUT = arg('--out', join(tmpdir(), 'arrival'));
/** How long to sample. Long enough to outlast `ENTRANCE_CLOCK_FLOOR_MS` (4 s) plus beat 5. */
const WINDOW_MS = 9000;

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

/**
 * Runs before anything else in the page. Samples every animation frame.
 *
 * **`windowMs` is a parameter and not a closed-over constant**, because `addInitScript` serialises
 * this function and runs it in the page, where nothing in this module's scope exists. Referencing
 * `WINDOW_MS` here throws a `ReferenceError` on the first frame — the sampler stops at `frames: 1`
 * and every mark after the throw point reports `never`, which reads exactly like a surface that was
 * withheld forever. Found by a smoke run that said the desktop panel never painted on a commit
 * where it demonstrably paints at 137 ms.
 */
const PROBE = (windowMs) => {
  window.__arrival = { t0: performance.now(), frames: 0, marks: {}, held: null };

  const MARKERS = {
    /** Any fixture place name — `fixtures.mjs` numbers every one of them `… No. n`. */
    list: /No\.\s*\d+/,
    wordmark: /^No Crumbs$/,
  };

  /** Elements that are in the DOM and are not the document's content. See this file's header. */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE']);

  /** Opacity through every ancestor, so a parent held at 0 cannot report a visible child. */
  const effectiveOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= Number(cs.opacity);
      if (o === 0) return 0;
    }
    return o;
  };

  const painted = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    return effectiveOpacity(el) > 0.5;
  };

  const sample = () => {
    const t = performance.now() - window.__arrival.t0;
    window.__arrival.frames += 1;

    const leaves = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || SKIP.has(el.tagName)) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) leaves.push([el, text]);
    }
    for (const [key, re] of Object.entries(MARKERS)) {
      const slot = (window.__arrival.marks[key] ??= { domMs: null, visibleMs: null });
      const hits = leaves.filter(([, text]) => re.test(text)).map(([el]) => el);
      if (hits.length && slot.domMs === null) slot.domMs = t;
      if (slot.visibleMs === null && hits.some(painted)) slot.visibleMs = t;
    }

    const sheet = document.querySelector('[data-testid="place-sheet"]');
    const s = (window.__arrival.marks.sheet ??= { domMs: null, visibleMs: null });
    if (sheet) {
      if (s.domMs === null) {
        s.domMs = t;
        // **The hold state**, captured on the first frame the sheet exists rather than at the end:
        // by the time the window closes it has risen, and the whole question is where it sat
        // *before* its beat. `0` here is the top of the screen and is the regression to watch for.
        const cs = getComputedStyle(sheet);
        window.__arrival.held = {
          atMs: Number(t.toFixed(1)),
          top: Math.round(sheet.getBoundingClientRect().top),
          innerHeight,
          transform: cs.transform,
          snapPointHeight: cs.getPropertyValue('--snap-point-height').trim(),
          ariaHidden: sheet.getAttribute('aria-hidden'),
          inert: sheet.hasAttribute('inert'),
        };
      }
      // Risen once any part of it is on screen. At `peek` its top sits `PEEK_PX` above the bottom.
      if (s.visibleMs === null && sheet.getBoundingClientRect().top < innerHeight - 8) {
        s.visibleMs = t;
      }
    }

    if (t < windowMs) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/** The resting state, after the sampling window closes. A marker that appears and then vanishes
 *  passes every "first frame" test above; this is the half that notices. */
const REST = () => {
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => !e.children.length);
  const opacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= Number(cs.opacity);
    }
    return Number(o.toFixed(3));
  };
  const named = leaves.filter((e) => /No\.\s*\d+/.test((e.textContent ?? '').trim()));
  const sheet = document.querySelector('[data-testid="place-sheet"]');
  return {
    ...window.__arrival,
    restingListCount: named.length,
    restingList: named.slice(0, 3).map((e) => ({
      text: e.textContent.trim().slice(0, 30),
      opacity: opacity(e),
    })),
    restingWordmark: leaves
      .filter((e) => (e.textContent ?? '').trim() === 'No Crumbs')
      .map((e) => ({ opacity: opacity(e) })),
    restingSheet: sheet
      ? {
          top: Math.round(sheet.getBoundingClientRect().top),
          innerHeight,
          transform: getComputedStyle(sheet).transform,
          ariaHidden: sheet.getAttribute('aria-hidden'),
          inert: sheet.hasAttribute('inert'),
        }
      : null,
  };
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
const appDir = join(tmpdir(), `arrival-${COMMIT.replace(/[^a-z0-9]/gi, '')}`);
const sha = exportCommit(REPO_DIR, COMMIT, appDir);
const env = {
  NEXT_PUBLIC_SUPABASE_URL: stub.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
};
process.stderr.write(`[arrival] ${LABEL} = ${sha}\n[arrival] building\n`);
const build = buildApp(appDir, env);
if (!build.ok) {
  process.stderr.write(build.output.slice(-4000));
  throw new Error('next build failed');
}
const server = await startApp(appDir, await findFreePort(), env);
const browser = await chromium.launch();
const cookie = authCookie(stub.url);
const report = { label: LABEL, commit: sha, runs: [] };
mkdirSync(OUT, { recursive: true });
process.stderr.write('[arrival] warming up\n');
await warmUp(browser, server, cookie);

try {
  for (const viewport of GATE_VIEWPORTS) {
    for (const motion of ['no-preference', 'reduce']) {
      for (let run = 1; run <= RUNS; run += 1) {
        const context = await browser.newContext({
          viewport: viewport.viewport,
          deviceScaleFactor: viewport.deviceScaleFactor,
          isMobile: viewport.isMobile,
          hasTouch: viewport.hasTouch,
          baseURL: server.url,
          colorScheme: 'dark',
          reducedMotion: motion,
        });
        await context.addCookies([{ ...cookie, url: server.url, sameSite: 'Lax' }]);
        await context.addInitScript(PROBE, WINDOW_MS);
        const page = await context.newPage();
        process.stderr.write(`[arrival] ${viewport.id} ${motion} run ${run}\n`);
        const started = Date.now();
        await page.goto('/map', { waitUntil: 'commit', timeout: 45_000 });
        // One filmstrip frame per configuration, at the moment the committed evidence was taken.
        if (run === 1) {
          const wait = 1500 - (Date.now() - started);
          if (wait > 0) await page.waitForTimeout(wait);
          await page.screenshot({
            path: join(OUT, `arrival--${LABEL}--${viewport.id}--${motion}--t1500ms.png`),
          });
        }
        await page.waitForTimeout(WINDOW_MS + 500 - (Date.now() - started));
        const measured = await page.evaluate(REST);
        await context.close();
        report.runs.push({ viewport: viewport.id, motion, run, ...measured });
        const m = measured.marks ?? {};
        const ms = (v) => (v === null || v === undefined ? 'never' : v.toFixed(0));
        process.stderr.write(
          `    list dom=${ms(m.list?.domMs)} vis=${ms(m.list?.visibleMs)}` +
            `  sheet dom=${ms(m.sheet?.domMs)} risen=${ms(m.sheet?.visibleMs)}` +
            `  wordmark=${ms(m.wordmark?.visibleMs)}` +
            `  held.top=${measured.held?.top ?? '—'}/${measured.held?.innerHeight ?? '—'}` +
            `  resting rows=${measured.restingListCount} sheetTop=${measured.restingSheet?.top ?? '—'}\n`,
        );
      }
    }
  }
} finally {
  await browser.close();
  await server.stop();
  await stub.close();
}

writeFileSync(join(OUT, `arrival--${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);

const table = {};
for (const r of report.runs) {
  const key = `${r.viewport} ${r.motion}`;
  (table[key] ??= []).push(
    `dom ${r.marks?.list?.domMs?.toFixed(0) ?? '—'} / vis ${r.marks?.list?.visibleMs?.toFixed(0) ?? '—'}`,
  );
}
process.stdout.write(`\n== ${LABEL} (${sha.slice(0, 7)}) — place list, ms from navigation ==\n`);
for (const [key, v] of Object.entries(table)) {
  process.stdout.write(`${key.padEnd(22)} ${v.join('  |  ')}\n`);
}
process.stdout.write(`\n${join(OUT, `arrival--${LABEL}.json`)}\n`);
