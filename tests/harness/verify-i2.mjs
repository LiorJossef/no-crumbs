#!/usr/bin/env node
/**
 * **Independent verification of iteration 2, against a named commit.**
 *
 * Six commits landed between `4531ab9` and `6499777` with only their author's word behind them.
 * This is the other half of `working-agreement.md` §2: the agent that built a thing is never the
 * sole source of evidence that it works. Nothing here reads a commit message.
 *
 * Four probes, and each answers a claim the plan makes rather than a claim this file invents:
 *
 *  - **contrast** — `I2-4`'s *"every element clears AA in both themes, measured"*, using
 *    `contrast-render.mjs`, which scores painted pixels. The DOM-walking instrument that produced
 *    iteration 1's *"11 → 0"* cannot see ink authored in `oklab` and cannot score text over a
 *    gradient at all, which on these two screens is all of it.
 *  - **brand** — `I2-8`'s *"the name is present on the signed-in surfaces"*: whether the lockup
 *    renders, at what size, on which routes, and whether it sits over the live map.
 *  - **entrance** — `I2-6`'s *"under 900 ms, and it does not delay the field being focusable"*,
 *    separating the animation's own span from the load latency around it, and `I2-7`'s beats.
 *  - **reduced** — the standing rule that everything collapses to an opacity change **and stays
 *    usable**, which is a claim about the resting state as much as about the motion.
 *
 *   node tests/harness/verify-i2.mjs --from-commit 6499777 --out docs/evidence/i2
 *   node tests/harness/verify-i2.mjs --only contrast,brand
 *
 * `--self-test` runs the contrast instrument's known-answer cases and exits. It runs first in every
 * full pass anyway, and a failure there aborts the run: an instrument that cannot reproduce a
 * hand-computed 4.48 has no business reporting a number about the product.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_VIEWPORTS } from './viewports.mjs';
import { startStubSupabase } from './stub-supabase.mjs';
import { authCookie, DEMO_COLLECTION_ID } from './fixtures.mjs';
import { exportCommit, buildApp, startApp } from './app-server.mjs';
import { measureContrast, selfTest } from './contrast-render.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ROUTES = [
  { path: '/', name: 'landing', auth: 'out' },
  { path: '/sign-in', name: 'sign-in', auth: 'out' },
  { path: '/map', name: 'map', auth: 'in' },
  { path: '/collections', name: 'collections', auth: 'in' },
  { path: '/profile', name: 'profile', auth: 'in' },
];

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
  } catch (e) {
    return { browser: await chromium.launch({ channel: 'chrome' }), note: `system Chrome (${String(e).split('\n')[0]})` };
  }
}

/** Wait for the page to stop moving, without asserting anything about how long that takes. */
async function settle(page, ms = 3000) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
  } catch {
    /* tiles keep the network busy; not a failure */
  }
  await page.waitForTimeout(ms);
}

/* -------------------------------------------------------------------------- */
/* probe: the brand lockup                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where the name is, how big it is set, and what it is sitting on.
 *
 * The size floor is `no-crumbs-design-system.html` §Wordmark: *"at the shell header the mark sits
 * at 22 px with the wordmark at 15 px, which is the smallest the pair may ever be set together."*
 * The same paragraph's *"what it must never do"* list ends with **never over the live map**, so the
 * canvas overlap is measured beside the sizes rather than assumed from the class list.
 */
const BRAND_PROBE = () => {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const r = c.getBoundingClientRect();
    return { rect: { x: r.left, y: r.top, w: r.width, h: r.height }, cls: describe(c) };
  });

  // Any element whose own text is exactly `No Crumbs`, or a pair of siblings reading `No` / `Crumbs`
  // — the stacked construction `chrome-stage.tsx` uses. Found by text, never by class, so a
  // renamed component still shows up.
  const found = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    if (text !== 'No Crumbs') continue;
    // Keep the innermost element that says it, so nesting does not report the same lockup twice.
    if (Array.from(el.querySelectorAll('*')).some((d) => (d.innerText ?? '').replace(/\s+/g, ' ').trim() === 'No Crumbs')) {
      continue;
    }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // The mark is the nearest svg that shares an ancestor with the type, within three levels up.
    let scope = el;
    let svg = null;
    for (let i = 0; i < 4 && scope; i += 1) {
      svg = scope.querySelector('svg');
      if (svg) break;
      scope = scope.parentElement;
    }
    const svgRect = svg ? svg.getBoundingClientRect() : null;
    const lockup = scope ? scope.getBoundingClientRect() : r;
    found.push({
      selector: describe(el),
      wordmarkFontPx: Number(parseFloat(cs.fontSize).toFixed(1)),
      wordmarkWeight: Number(cs.fontWeight),
      wordmarkFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      markPx: svgRect ? Number(Math.max(svgRect.width, svgRect.height).toFixed(1)) : null,
      markSelector: svg ? describe(svg) : null,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      lockupRect: { x: lockup.left, y: lockup.top, w: lockup.width, h: lockup.height },
      visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01,
      overCanvas: canvases.some((c) => {
        const q = c.rect;
        return lockup.left < q.x + q.w && lockup.right > q.x && lockup.top < q.y + q.h && lockup.bottom > q.y;
      }),
      textShadow: cs.textShadow,
      backgroundImage: cs.backgroundImage,
    });
  }
  return { found, canvases: canvases.length };
};

/* -------------------------------------------------------------------------- */
/* probe: the entrance                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A `requestAnimationFrame` sampler installed **before any script runs**, so it sees the first
 * frame the entrance paints rather than whatever state the page had reached by the time a test
 * asked.
 *
 * Two clocks are recorded on purpose, because conflating them is how a measurement of software-GL
 * slip gets reported as the product's own duration:
 *
 *  - `spanMs` — first frame on which any `[data-entrance]` element moved, to the last frame on
 *    which any of them moved. **This is the animation.**
 *  - `fromNavigationMs` — the same last frame, measured from navigation start. This includes React
 *    hydration, the bundle, and however slowly this machine happens to be running. It is reported
 *    because it is what a person waits, and it is *not* the number `I2-6`'s 900 ms is about.
 *
 * Focusability is sampled on its own timer from the moment the field exists, because `I2-6`'s
 * second clause is a claim about the *form*, not about the animation: an entrance that finishes in
 * 700 ms and holds the field inert for 500 of them has failed the criterion it passes on paper.
 */
const ENTRANCE_INIT = () => {
  window.__i2 = {
    frames: [],
    focus: { firstSeenMs: null, firstFocusableMs: null, everRefused: false, attempts: 0, hitTest: null },
  };
  const t0 = performance.now();

  // Per element, not joined into one string.
  //
  // **The first version of this joined every `[data-entrance]` state into one line and reported the
  // last frame on which that line changed. It measured 4,950 ms on a 900 ms criterion, and the
  // number was an artefact of the instrument.** `chrome-ground.tsx` puts `data-entrance` on the two
  // ambient blooms, and `BLOOM_DRIFT` is `repeat: Infinity` — so *something* under that selector
  // changes on every frame forever, and a joined signature can therefore never settle. Two
  // different things share one attribute: the entrance, which ends, and the ambient field, which is
  // licensed not to. Reading them separately is the only way to say either number honestly.
  const sample = () => {
    const els = Array.from(document.querySelectorAll('[data-entrance]'));
    if (els.length) {
      window.__i2.frames.push({
        t: performance.now() - t0,
        s: els.map((el) => {
          const cs = getComputedStyle(el);
          return `${Number(cs.opacity).toFixed(3)}|${cs.transform}`;
        }),
        k: els.map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')}`),
      });
    }
    if (window.__i2.frames.length < 900) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);

  const poll = () => {
    const field = document.querySelector('input#email, input[type="email"], input[type="text"]');
    if (field) {
      const f = window.__i2.focus;
      if (f.firstSeenMs === null) f.firstSeenMs = performance.now() - t0;
      f.attempts += 1;
      field.focus();
      const got = document.activeElement === field;
      const r = field.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hit = top === field || field.contains(top);
      if (got && hit) {
        if (f.firstFocusableMs === null) f.firstFocusableMs = performance.now() - t0;
      } else if (f.firstFocusableMs === null) {
        f.everRefused = true;
      }
      f.hitTest = { focused: got, topmostIsField: hit, top: top ? top.tagName.toLowerCase() : null };
      field.blur();
    }
    if (performance.now() - t0 < 4000) setTimeout(poll, 25);
  };
  setTimeout(poll, 0);
};

const ENTRANCE_READ = () => {
  const frames = window.__i2?.frames ?? [];
  const n = frames.length ? frames[frames.length - 1].s.length : 0;
  const windowEndMs = frames.length ? frames[frames.length - 1].t : 0;

  /** For each element: when it first moved, when it last moved, how many frames it moved on. */
  const per = [];
  for (let i = 0; i < n; i += 1) {
    let first = null;
    let last = null;
    let changes = 0;
    for (let f = 1; f < frames.length; f += 1) {
      if (frames[f].s.length !== n || frames[f - 1].s.length !== n) continue;
      if (frames[f].s[i] !== frames[f - 1].s[i]) {
        if (first === null) first = frames[f - 1].t;
        last = frames[f].t;
        changes += 1;
      }
    }
    per.push({
      key: frames.length ? frames[frames.length - 1].k[i] : `#${i}`,
      firstMs: first === null ? null : Number(first.toFixed(1)),
      lastMs: last === null ? null : Number(last.toFixed(1)),
      changes,
      // Still moving in the last second of the sampling window: an ambient loop, not an entrance.
      neverSettles: last !== null && last > windowEndMs - 1000,
    });
  }

  const settling = per.filter((p) => p.lastMs !== null && !p.neverSettles);
  const ambient = per.filter((p) => p.neverSettles);
  const start = settling.length ? Math.min(...settling.map((p) => p.firstMs)) : null;
  const end = settling.length ? Math.max(...settling.map((p) => p.lastMs)) : null;

  const resting = Array.from(document.querySelectorAll('[data-entrance]')).map((el) => {
    const cs = getComputedStyle(el);
    return { opacity: Number(Number(cs.opacity).toFixed(3)), transform: cs.transform };
  });

  return {
    entranceElements: resting.length,
    framesSampled: frames.length,
    perElement: per,
    ambientElements: ambient.length,
    // **The animation's own span**, over the elements that finish. This is the number `I2-6`'s
    // 900 ms is about.
    entranceStartMs: start,
    entranceEndMs: end,
    spanMs: start === null ? null : Number((end - start).toFixed(1)),
    // And the wall clock a person waits, which includes hydration and this machine's mood. Reported
    // separately and never as the criterion.
    fromNavigationMs: end === null ? null : Number(end.toFixed(1)),
    focus: window.__i2?.focus ?? null,
    restingOpacityMin: resting.length ? Math.min(...resting.map((r) => r.opacity)) : null,
    restingTransformsNotNone: resting.filter((r) => r.transform !== 'none' && r.transform !== '').length,
  };
};

/* -------------------------------------------------------------------------- */
/* probe: the post-login arrival on /map                                       */
/* -------------------------------------------------------------------------- */

/**
 * **When does `/map` become useful?**
 *
 * `iteration-2-plan.md` §2.2 ruling 2 ends with a constraint the choreography does not get to
 * break: *"it may not delay the map being usable."* `entrance.ts` withholds the sheet until beat
 * 900 and the wordmark until beat 1100, and the clock's zero is **the camera framing the library**,
 * not the page mount — so the wall-clock cost of the entrance is `framing + beat`, and the plan's
 * table of milliseconds says nothing about the first term.
 *
 * This records the first frame on which each of four things exists, from navigation:
 *
 *  - the WebGL canvas,
 *  - the first fixture place name anywhere in the document — *"the list has content"*,
 *  - the wordmark,
 *  - and the first frame the sheet's own container is in the DOM.
 *
 * Run it against a commit **before** `1566030` and against `6499777` and the difference is the
 * entrance's real cost to a signing-in user, which is the number ruling 2's last sentence is about.
 * A MutationObserver rather than polling, so a marker that appears and is replaced within a frame
 * is still seen.
 */
const ARRIVAL_INIT = () => {
  const t0 = performance.now();
  const marks = {};
  const probes = {
    canvas: () => document.querySelector('canvas') !== null,
    listContent: () => (document.body?.innerText ?? '').includes('Sabich Counter No. 1'),
    wordmark: () =>
      Array.from(document.querySelectorAll('*')).some(
        (el) =>
          (el.innerText ?? '').replace(/\s+/g, ' ').trim() === 'No Crumbs' &&
          !Array.from(el.querySelectorAll('*')).some(
            (d) => (d.innerText ?? '').replace(/\s+/g, ' ').trim() === 'No Crumbs',
          ),
      ),
    anyPlaceLink: () => document.querySelector('a[href*="/place/"], [data-place-id]') !== null,
  };
  const check = () => {
    for (const [key, fn] of Object.entries(probes)) {
      if (marks[key] !== undefined) continue;
      let hit = false;
      try {
        hit = fn();
      } catch {
        hit = false;
      }
      if (hit) marks[key] = Number((performance.now() - t0).toFixed(1));
    }
  };
  window.__arrival = { marks, t0 };
  const tick = () => {
    check();
    if (performance.now() - t0 < 15_000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('DOMContentLoaded', check);
};

/* -------------------------------------------------------------------------- */
/* probe: reduced motion                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The rule is *collapses to an opacity change **and stays usable***, and the second half is the one
 * that has already broken here once: `chrome-motion.ts` records a build where the reduced-motion
 * user got a card permanently 18 px low and a mascot permanently at 61% and rotated 12°. So the
 * resting state is what this reads — opacity and transform at rest — not merely whether something
 * moved.
 *
 * Ambient drift is checked by sampling `transform` 2.5 s apart. Identical with the preference set
 * and different without it is the whole claim; anything else and condition 3 of the ambient
 * licence in `chrome-motion.ts` does not hold.
 */
const REDUCED_PROBE = () => {
  const els = Array.from(document.querySelectorAll('[data-entrance]'));
  const anim = Array.from(document.querySelectorAll('*')).filter((el) => {
    const cs = getComputedStyle(el);
    return cs.animationName !== 'none' && cs.animationDuration !== '0s';
  });
  return {
    entranceElements: els.length,
    restingOpacities: els.map((el) => Number(Number(getComputedStyle(el).opacity).toFixed(3))),
    restingTransforms: els.map((el) => getComputedStyle(el).transform),
    cssAnimationsRunning: anim.length,
    // Everything that paints an ambient gradient, so drift can be sampled without naming a class.
    ambientTransforms: Array.from(document.querySelectorAll('[aria-hidden="true"], [aria-hidden]'))
      .filter((el) => getComputedStyle(el).backgroundImage !== 'none')
      .map((el) => getComputedStyle(el).transform),
    focusable: (() => {
      const field = document.querySelector('input#email, input[type="email"]');
      if (!field) return null;
      field.focus();
      const ok = document.activeElement === field;
      field.blur();
      return ok;
    })(),
    // Anything still invisible at rest is the failure mode this probe exists for.
    invisibleAtRest: els.filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length,
  };
};

/* -------------------------------------------------------------------------- */

async function main() {
  const fromCommit = arg('--from-commit', '6499777');
  const places = Number(arg('--places', '12'));
  const only = arg('--only', 'contrast,brand,entrance,reduced').split(',');
  const outArg = arg('--out', 'docs/evidence/i2');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const report = {
    takenAt: new Date().toISOString(),
    commit: null,
    commitish: fromCommit,
    places,
    dataSource: 'stub (tests/harness/stub-supabase.mjs) — layout and colour are real, rows are not',
    buildMode: 'git archive <sha> -> next build -> next start',
    instrument: { contrastSelfTest: null },
    browser: null,
    contrast: [],
    brand: [],
    arrival: [],
    entrance: [],
    reduced: [],
    notes: [],
  };

  const { browser, note } = await launchBrowser();
  report.browser = note;

  if (only.includes('contrast') || process.argv.includes('--self-test')) {
    process.stderr.write('[i2] contrast instrument self-test\n');
    const st = await selfTest(browser);
    report.instrument.contrastSelfTest = st;
    if (!st.ok) {
      writeFileSync(join(outDir, 'verify-i2.json'), JSON.stringify(report, null, 2));
      process.stderr.write(`[i2] SELF-TEST FAILED — no product number will be reported\n${JSON.stringify(st.checks, null, 2)}\n`);
      await browser.close();
      process.exit(1);
    }
    process.stderr.write(`[i2] self-test ok (${st.checks.length} known-answer cases)\n`);
  }
  if (process.argv.includes('--self-test')) {
    writeFileSync(join(outDir, 'verify-i2.json'), JSON.stringify(report, null, 2));
    await browser.close();
    return;
  }

  let stub = null;
  let server = null;
  try {
    const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-i2-${process.pid}`);
    process.stderr.write(`[i2] exporting ${fromCommit}\n`);
    report.commit = exportCommit(REPO_DIR, fromCommit, appDir);
    stub = await startStubSupabase({ port: 0, places });
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: stub.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    };
    process.stderr.write('[i2] building\n');
    const build = buildApp(appDir, env);
    if (!build.ok) {
      process.stderr.write(build.output.slice(-4000));
      throw new Error('next build failed');
    }
    server = await startApp(appDir, await findFreePort(), env);
    const cookie = authCookie(stub.url);

    const makeContext = async (viewport, theme, extra = {}) => {
      const context = await browser.newContext({
        viewport: viewport.viewport,
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        baseURL: server.url,
        colorScheme: theme,
        ...extra,
      });
      await context.addCookies([{ ...cookie, url: server.url, sameSite: 'Lax' }]);
      return context;
    };

    /* ---- contrast --------------------------------------------------------- */
    if (only.includes('contrast')) {
      for (const theme of ['light', 'dark']) {
        for (const viewport of GATE_VIEWPORTS) {
          for (const route of ROUTES) {
            const context = await makeContext(viewport, theme);
            const page = await context.newPage();
            process.stderr.write(`[i2] contrast ${theme} ${route.name} @ ${viewport.id}\n`);
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await settle(page);
            const resolvedTheme = await page.evaluate(() =>
              document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            );
            const tiles = await page.evaluate(() =>
              Array.from(document.querySelectorAll('canvas')).length === 0
                ? null
                : Boolean(window.__mapTilesLoaded ?? null),
            );
            const result = await measureContrast(browser, page, { scale: viewport.deviceScaleFactor });
            await context.close();
            report.contrast.push({ theme, resolvedTheme, viewport: viewport.id, route: route.name, mapPresent: tiles !== null, ...result });
          }
        }
      }
    }

    /* ---- brand ------------------------------------------------------------ */
    if (only.includes('brand')) {
      for (const theme of ['light', 'dark']) {
        for (const viewport of GATE_VIEWPORTS) {
          for (const route of [...ROUTES, { path: `/collections/${DEMO_COLLECTION_ID}`, name: 'collection-detail', auth: 'in' }]) {
            const context = await makeContext(viewport, theme);
            const page = await context.newPage();
            process.stderr.write(`[i2] brand ${theme} ${route.name} @ ${viewport.id}\n`);
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            // Long, because `/map`'s wordmark is beat 5 of the entrance and its clock starts on the
            // camera framing — `ENTRANCE_CLOCK_FLOOR_MS` is 4 s if that never happens.
            await settle(page, 7000);
            const found = await page.evaluate(BRAND_PROBE);
            await context.close();
            report.brand.push({ theme, viewport: viewport.id, route: route.name, ...found });
          }
        }
      }
    }

    /* ---- entrance --------------------------------------------------------- */
    if (only.includes('entrance')) {
      for (const viewport of GATE_VIEWPORTS) {
        for (const route of [{ path: '/sign-in', name: 'sign-in' }, { path: '/', name: 'landing' }]) {
          for (const run of [1, 2]) {
            const context = await makeContext(viewport, 'dark');
            await context.addInitScript(ENTRANCE_INIT);
            const page = await context.newPage();
            process.stderr.write(`[i2] entrance ${route.name} @ ${viewport.id} run ${run}\n`);
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await page.waitForTimeout(5000);
            const measured = await page.evaluate(ENTRANCE_READ);
            // Second run in the same context: does it play again? `I2-6` says "it plays once".
            let replay = null;
            if (run === 2) {
              await page.evaluate(() => {
                window.__i2.frames.length = 0;
              });
              await page.goto(route.path === '/' ? '/sign-in' : '/', { waitUntil: 'domcontentloaded' });
              await page.waitForTimeout(2500);
              replay = await page.evaluate(ENTRANCE_READ);
            }
            await context.close();
            report.entrance.push({ viewport: viewport.id, route: route.name, run, ...measured, afterClientNav: replay });
          }
        }
      }
    }

    /* ---- screenshots, as the artefact a person can check the numbers against - */
    if (only.includes('screens')) {
      const shotDir = join(outDir, 'screens');
      mkdirSync(shotDir, { recursive: true });
      for (const viewport of GATE_VIEWPORTS) {
        // A filmstrip of the arrival. The numbers say the list is absent for ~2.4 s; this is what
        // that looks like, so the finding does not rest on a marker string.
        const context = await makeContext(viewport, 'dark');
        const page = await context.newPage();
        process.stderr.write(`[i2] filmstrip ${viewport.id}\n`);
        const started = Date.now();
        await page.goto('/map', { waitUntil: 'commit', timeout: 45_000 });
        for (const at of [500, 1000, 1500, 2000, 2500, 3500, 6000]) {
          const wait = at - (Date.now() - started);
          if (wait > 0) await page.waitForTimeout(wait);
          await page.screenshot({ path: join(shotDir, `map-arrival--${viewport.id}--t${String(at).padStart(4, '0')}ms.png`) });
        }
        await context.close();

        for (const theme of ['light', 'dark']) {
          const ctx2 = await makeContext(viewport, theme);
          const p2 = await ctx2.newPage();
          await p2.goto('/map', { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await settle(p2, 7000);
          const box = await p2.evaluate(() => {
            const el = Array.from(document.querySelectorAll('*')).find(
              (e) =>
                (e.innerText ?? '').replace(/\s+/g, ' ').trim() === 'No Crumbs' &&
                !Array.from(e.querySelectorAll('*')).some(
                  (d) => (d.innerText ?? '').replace(/\s+/g, ' ').trim() === 'No Crumbs',
                ),
            );
            if (!el) return null;
            let scope = el;
            for (let i = 0; i < 4 && scope; i += 1) {
              if (scope.querySelector('svg')) break;
              scope = scope.parentElement;
            }
            const r = (scope ?? el).getBoundingClientRect();
            return { x: Math.max(0, r.left - 28), y: Math.max(0, r.top - 28), width: r.width + 56, height: r.height + 56 };
          });
          if (box) {
            await p2.screenshot({ path: join(shotDir, `wordmark-over-map--${viewport.id}--${theme}.png`), clip: box });
          }
          await p2.screenshot({ path: join(shotDir, `map-settled--${viewport.id}--${theme}.png`) });
          await ctx2.close();

          for (const route of [{ path: '/sign-in', name: 'sign-in' }, { path: '/', name: 'landing' }]) {
            const ctx3 = await makeContext(viewport, theme);
            const p3 = await ctx3.newPage();
            await p3.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await settle(p3, 2500);
            await p3.screenshot({ path: join(shotDir, `${route.name}--${viewport.id}--${theme}.png`) });
            await ctx3.close();
          }
        }
      }
    }

    /* ---- the /map arrival ------------------------------------------------- */
    if (only.includes('arrival')) {
      report.arrival = [];
      for (const viewport of GATE_VIEWPORTS) {
        for (const reducedMotion of ['no-preference', 'reduce']) {
          for (const run of [1, 2, 3]) {
            const context = await makeContext(viewport, 'dark', { reducedMotion });
            await context.addInitScript(ARRIVAL_INIT);
            const page = await context.newPage();
            process.stderr.write(`[i2] arrival ${viewport.id} rm=${reducedMotion} run ${run}\n`);
            await page.goto('/map', { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await page.waitForTimeout(12_000);
            const marks = await page.evaluate(() => window.__arrival?.marks ?? null);
            await context.close();
            report.arrival.push({ viewport: viewport.id, reducedMotion, run, marks });
          }
        }
      }
    }

    /* ---- reduced motion --------------------------------------------------- */
    if (only.includes('reduced')) {
      for (const reducedMotion of ['reduce', 'no-preference']) {
        for (const viewport of GATE_VIEWPORTS) {
          for (const route of ROUTES) {
            const context = await makeContext(viewport, 'dark', { reducedMotion });
            const page = await context.newPage();
            process.stderr.write(`[i2] reduced=${reducedMotion} ${route.name} @ ${viewport.id}\n`);
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await settle(page, 3000);
            const first = await page.evaluate(REDUCED_PROBE);
            await page.waitForTimeout(2500);
            const second = await page.evaluate(REDUCED_PROBE);
            await context.close();
            report.reduced.push({
              reducedMotion,
              viewport: viewport.id,
              route: route.name,
              ...first,
              ambientDrifted: JSON.stringify(first.ambientTransforms) !== JSON.stringify(second.ambientTransforms),
              entranceStillMoving: JSON.stringify(first.restingTransforms) !== JSON.stringify(second.restingTransforms),
            });
          }
        }
      }
    }
  } finally {
    if (server) await server.stop();
    if (stub) await stub.close();
    await browser.close();
    // Named for the probes that ran, never a fixed filename.
    //
    // It was `verify-i2.json` for every invocation, and a later `--only screens` pass silently
    // overwrote a completed contrast/brand/arrival/reduced report with one whose arrays were all
    // empty. Nothing failed; the evidence was simply gone, and the only reason it was noticed is
    // that a follow-up query returned nothing. A run that destroys a previous run's evidence is
    // the failure mode guardrail 6 is about, in a directory rather than a database.
    const name = `verify-i2--${only.slice().sort().join('-')}.json`;
    writeFileSync(join(outDir, name), JSON.stringify(report, null, 2));
    process.stderr.write(`[i2] report -> ${join(outDir, name)}\n`);
  }

  const failures = report.contrast.reduce((n, r) => n + r.fail.length, 0);
  const unresolvable = report.contrast.reduce((n, r) => n + r.unresolvableInk.length, 0);
  process.stderr.write(
    `\n[i2] commit ${report.commit}\n` +
      `[i2] contrast: ${failures} AA failures across ${report.contrast.length} page-runs; ${unresolvable} unresolvable inks\n` +
      `[i2] brand: ${report.brand.filter((b) => b.found.length).length} of ${report.brand.length} page-runs show the lockup\n`,
  );
}

await main();
