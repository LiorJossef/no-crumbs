#!/usr/bin/env node
/**
 * The screenshot harness: walk every reachable screen, at both gate viewports, at 0 / 3 / 30
 * places, and write labelled PNGs plus a manifest that says exactly how each one was produced.
 *
 * ## What it is for
 *
 * `docs/overnight-run-plan.md` §8a Q1 asks for every reachable screen at 390×844 and 1440×900,
 * signed out and signed in, at 0, 3 and 30 places. Six package exit criteria say "verified in a
 * browser". None of that was checkable in this repository, because there is no `.env.local` and no
 * Docker, so four of the eight surfaces returned 500 (measured at commit 55698ae). This makes it
 * repeatable instead of impossible.
 *
 * ## Two modes, and the honesty rule that separates them
 *
 *   `--from-commit <sha>`   build that commit, run it against a stub Supabase, capture everything.
 *   `--base-url <url>`      drive a real deployment. **Signed-out screens only.**
 *
 * Remote mode does not fabricate a session. There is no credential in this environment and none
 * may be created, so the signed-in screens against a deployment are simply not taken — the manifest
 * records them as `skipped: no credentials`, and a later reader can tell a gap from a result. A
 * screenshot of a screen nobody saw is worse than an admitted hole.
 *
 * Everything captured in `--from-commit` mode against `/map`, `/profile`, `/collections` or
 * `/import` is **stub-backed**: the rows come from `fixtures.mjs`, not from Postgres, and the
 * manifest stamps `dataSource: "stub"` on every one. It is evidence about rendering — layout, the
 * zero state, the camera at 30 pins, a radius, a contrast — and it is not evidence about a query,
 * a join or an RLS policy. See `stub-supabase.mjs` for the full statement of what it does not prove.
 *
 * ## Usage
 *
 *   node tests/harness/capture-screens.mjs --from-commit HEAD --out docs/evidence/qa/screens/after
 *   node tests/harness/capture-screens.mjs --base-url https://p-002-zeta.vercel.app --out docs/evidence/qa/screens/before
 *   node tests/harness/capture-screens.mjs --from-commit HEAD --counts 0,3,30,300 --routes /map
 *
 * `PLAYWRIGHT_BASE_URL` is honoured as the default for `--base-url`, so this agrees with
 * `playwright.config.ts` rather than inventing a second convention.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_VIEWPORTS } from './viewports.mjs';
import { startStubSupabase } from './stub-supabase.mjs';
import { authCookie, DEMO_COLLECTION_ID, DEMO_INVITE_TOKEN } from './fixtures.mjs';
import { exportCommit, buildApp, startApp } from './app-server.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Both ports are chosen at run time rather than fixed, and the reason is concurrency.
 *
 * A fixed port is a shared resource with no lock on it. 3000 is the dev server another agent may be
 * holding; 54321 is a real local Supabase and must never be shadowed. Even a private number is not
 * safe — the first version of this file hard-coded 54387 and the second run of the night died with
 * `EADDRINUSE` on the previous run's own `TIME_WAIT` sockets. Asking the kernel for a free port
 * costs nothing and removes the whole class.
 */
async function findFreePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * The screens, and whether the number of saved places changes what they show.
 *
 * `auth: 'out'` screens render with no session at all — they are the two that already work in a
 * credential-less checkout, and the only two a deployment can be asked for honestly.
 *
 * `varyByPlaces: false` on `/import` and `/collections` is a claim worth stating: neither reads the
 * saved-place count, so capturing them three times would produce three identical PNGs and make the
 * output directory lie about how much was checked.
 */
const SCREENS = [
  // `/` is captured in **both** states, and that is a correction rather than extra coverage.
  //
  // The first version of this file attached the session cookie to every context, including the two
  // screens it labelled `signed-out` — so `stub--signed-out--landing--390x844.png` showed
  // `Signed in as demo@example.com` under an `Open your map →` button. The pixels were honest and
  // the filename was a lie, which is precisely the failure the naming rule exists to prevent, and
  // it took looking at the picture to catch it. `auth` is now the list of states a screen is
  // actually captured in, and the cookie is attached per state rather than per run.
  //
  // The signed-in landing is worth having anyway: it is a different screen (a different CTA and an
  // account line) and it is on the demo path.
  { route: '/', name: 'landing', auth: ['out', 'in'], varyByPlaces: false },
  { route: '/sign-in', name: 'sign-in', auth: ['out'], varyByPlaces: false },
  { route: '/map', name: 'map', auth: ['in'], varyByPlaces: true },
  { route: '/profile', name: 'profile', auth: ['in'], varyByPlaces: true },
  { route: '/collections', name: 'collections', auth: ['in'], varyByPlaces: false },
  { route: '/import', name: 'import', auth: ['in'], varyByPlaces: false },
  // The two collection sub-routes were an admitted hole until 2026-08-31: their fixtures were
  // unverified, and an unverified fixture makes a worse artefact than a gap. The shapes are now
  // read off `DETAIL_SELECT`, its hand-written `DetailRow`, and the `InvitePreview` interface in
  // the join page — so these are mirrors of the selects rather than guesses.
  { route: `/collections/${DEMO_COLLECTION_ID}`, name: 'collection-detail', auth: ['in'], varyByPlaces: false },
  // The join screen has two states and the *signed-out* one is the one that matters: it is what an
  // invited stranger sees, and `0024` refuses `anon` the invite preview on purpose, so the screen
  // deliberately says less than `ux-collections.md` §5.3 asks for. Both are captured.
  { route: `/collections/join/${DEMO_INVITE_TOKEN}`, name: 'collection-join', auth: ['out', 'in'], varyByPlaces: false },

  // The import states, reachable only through `dev-screen.ts`'s `?state=` seam, which is guarded on
  // a literal `NODE_ENV !== 'production'` the bundler eliminates. So these need `--dev`; in the
  // production path they are recorded as skipped rather than quietly missing.
  //
  // Ordered by what the product is judged on, not by the flow. `no-places` first: `mvp-plan.md`
  // calls it the modal outcome of an import, which makes it a core surface rather than an error
  // path, and Wave 6 is about to rebuild it. `review` next, because W6-4 inverts its provenance
  // hierarchy and a *before* only exists until that lands. Then the failure screens.
  { route: '/import?state=no-places', name: 'import-no-places', auth: ['in'], varyByPlaces: false, requiresDev: true, notExpect: 'OR TRY ONE OF THESE' },
  { route: '/import?state=review', name: 'import-review', auth: ['in'], varyByPlaces: false, requiresDev: true, notExpect: 'OR TRY ONE OF THESE' },
  { route: '/import?state=rail', name: 'import-rail', auth: ['in'], varyByPlaces: false, requiresDev: true, notExpect: 'OR TRY ONE OF THESE' },
  { route: '/import?state=error-POST_UNAVAILABLE', name: 'import-error-post-unavailable', auth: ['in'], varyByPlaces: false, requiresDev: true, notExpect: 'OR TRY ONE OF THESE' },
  { route: '/import?state=redirect-UNSUPPORTED_HOST', name: 'import-redirect-unsupported-host', auth: ['in'], varyByPlaces: false, requiresDev: true, notExpect: 'OR TRY ONE OF THESE' },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

/**
 * Wait for a screen to stop moving.
 *
 * `networkidle` alone is not enough here and it matters why: the map is MapLibre over CARTO, so
 * tiles keep arriving after the DOM settles, and the pins animate in (`W2-1` is literally a
 * criterion about pins *at rest*). A fixed settle on top of network idle is crude but it is the
 * thing that stops a screenshot catching a half-drawn basemap and being filed as a rendering
 * defect. Errors while waiting are swallowed on purpose — a page that never reaches network idle
 * should still be photographed, because that is itself the finding.
 */
async function settle(page, settleMs) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  } catch {
    /* a long-poll or a stuck tile request; photograph it anyway */
  }
  await page.waitForTimeout(settleMs);
}

async function capture({ browser, baseUrl, screen, viewportSpec, cookie, outDir, label, settleMs, fullPage, authState }) {
  const context = await browser.newContext({
    viewport: viewportSpec.viewport,
    deviceScaleFactor: viewportSpec.deviceScaleFactor,
    isMobile: viewportSpec.isMobile,
    hasTouch: viewportSpec.hasTouch,
    baseURL: baseUrl,
  });
  const consoleErrors = [];
  const pageErrors = [];
  if (cookie) {
    await context.addCookies([{ ...cookie, url: baseUrl, httpOnly: false, sameSite: 'Lax' }]);
  }
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  let status = null;
  let error = null;
  const file = `${label}--${screen.name}--${viewportSpec.id}.png`;
  try {
    const response = await page.goto(new URL(screen.route, baseUrl).href, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    status = response?.status() ?? null;
    await settle(page, settleMs);
    await page.screenshot({ path: join(outDir, file), fullPage });
  } catch (thrown) {
    error = String(thrown);
    // Still try for a picture of whatever is on screen — a broken screen is the most useful
    // screenshot in the directory.
    try {
      await page.screenshot({ path: join(outDir, file) });
    } catch {
      /* nothing renderable */
    }
  }
  const finalUrl = page.url();

  /**
   * Did React actually hydrate, and does the screen show what its filename claims?
   *
   * Both checks exist because of one incident on 2026-08-31. Next 16's dev server refuses
   * cross-origin requests for its own client chunks, so driving `next dev` at `127.0.0.1` returned
   * 403 on every `_next/static/chunks/*` file and React never hydrated. The pages still rendered —
   * server HTML is perfectly photogenic — so the harness produced ten screenshots of five different
   * `?state=` values that were all the same idle screen, and every one of them was labelled with
   * the state it did not show. Status was 200. Nothing failed.
   *
   * `hydrated` is the general guard: an unhydrated capture has no effects, no handlers and no
   * client state, so it is not a picture of the product and must never be filed as one.
   * `notExpect` is the specific one: a screen reached through a seam has to prove it left the
   * screen it was reached *from*.
   */
  const hydrated = await page
    .evaluate(() => {
      const roots = [document.querySelector('main'), ...Array.from(document.body.children)];
      return roots.some(
        (el) => el !== null && Object.keys(el).some((k) => k.startsWith('__reactFiber$')),
      );
    })
    .catch(() => false);

  let expectMet = null;
  if (screen.notExpect) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    expectMet = !new RegExp(screen.notExpect, 'i').test(text);
  }

  await context.close();

  return {
    file,
    route: screen.route,
    finalUrl,
    viewport: viewportSpec.id,
    auth: authState,
    status,
    hydrated,
    expectMet,
    error,
    consoleErrors,
    pageErrors,
  };
}

/**
 * Launch Chromium, falling back to the system Chrome when the bundled build is not downloaded.
 *
 * Measured at commit 55698ae: `playwright-core` is 1.62.1 and wants revision **1234**, while
 * `~/Library/Caches/ms-playwright` holds only **1223** and **1228**. So `chromium.launch()` throws
 * `Executable doesn't exist`. That is not just this harness's problem — **`npm run test:e2e`
 * cannot run in this checkout either**, for the same reason, and that is a finding in its own
 * right rather than something to paper over.
 *
 * The fallback is `channel: 'chrome'`, the Google Chrome already installed on this machine. It
 * downloads nothing. It is also not the same binary CI uses, so the manifest records which one
 * took the picture — a rendering difference between a Chrome build and a Chromium build is small
 * but it is exactly the kind of thing a pixel-level facelift review would otherwise argue about.
 */
async function launchBrowser() {
  try {
    const browser = await chromium.launch();
    return { browser, browserNote: 'Rendered with the bundled Playwright Chromium.' };
  } catch (bundledError) {
    const browser = await chromium.launch({ channel: 'chrome' });
    return {
      browser,
      browserNote:
        'Rendered with the SYSTEM Google Chrome (channel: "chrome"), because the bundled ' +
        'Playwright Chromium revision is not downloaded in this environment. Original error: ' +
        String(bundledError).split('\n')[0],
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const remoteBaseUrl = typeof args['base-url'] === 'string'
    ? args['base-url']
    : (process.env.PLAYWRIGHT_BASE_URL || null);
  const fromCommit = typeof args['from-commit'] === 'string' ? args['from-commit'] : null;

  if (!remoteBaseUrl && !fromCommit) {
    console.error(
      'capture-screens: pass --from-commit <sha|HEAD> to build and drive a commit locally, or ' +
        '--base-url <url> to drive a deployment (signed-out screens only).',
    );
    process.exit(2);
  }

  // 0 first, and that ordering is a decision. `growth-plan.md` §6 calls shipping the zero state
  // "the one thing" and W1-1 is the run's highest-impact package, so the screen a new user gets is
  // the screen we most need to see. 300 is at the other end for the reason §8a gives in terms —
  // "the demo dies at zero, the product dies at scale" — and it is the only case that tests the
  // second half of that sentence.
  const counts = String(args.counts ?? '0,3,30,300')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));
  const routeFilter = typeof args.routes === 'string' ? args.routes.split(',').map((r) => r.trim()) : null;
  // Matched against the screen *name* as well as the route, because the import screens differ only
  // by query string and `--routes /import` would otherwise be ambiguous.
  const screens = routeFilter
    ? SCREENS.filter((s) => routeFilter.includes(s.route) || routeFilter.includes(s.name))
    : SCREENS;
  const settleMs = Number(args.settle ?? 2500);
  const fullPage = args['full-page'] === true;

  const outArg = typeof args.out === 'string' ? args.out : 'docs/evidence/qa/screens/run';
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const devMode = args.dev === true;
  const manifest = {
    takenAt: new Date().toISOString(),
    mode: fromCommit ? (devMode ? 'local-dev' : 'local-build') : 'remote',
    commit: null,
    baseUrl: null,
    dataSource: fromCommit ? 'stub' : 'live-deployment',
    /**
     * `next dev` or `next start`. Recorded because they are not the same artefact: dev has no
     * minification, React in development mode, different bundling and different timing. Layout and
     * copy are trustworthy; timing is not, and the motion harness never runs in dev.
     */
    buildMode: fromCommit ? (devMode ? 'next dev' : 'next build + next start') : 'deployed build',
    viewports: GATE_VIEWPORTS.map((v) => v.id),
    placeCounts: fromCommit ? counts : [],
    shots: [],
    skipped: [],
    notes: [],
  };

  let stub = null;
  let server = null;
  let appDir = null;

  try {
    let baseUrl;
    if (fromCommit) {
      appDir = join(
        process.env.TMPDIR ?? '/tmp',
        `no-crumbs-harness-${process.pid}`,
      );
      process.stderr.write(`[harness] exporting ${fromCommit} to ${appDir}\n`);
      manifest.commit = exportCommit(REPO_DIR, fromCommit, appDir);

      stub = await startStubSupabase({ port: 0, places: counts[0] ?? 0 });
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: stub.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
      };

      if (!devMode) {
        process.stderr.write('[harness] building\n');
        const build = buildApp(appDir, env);
        if (!build.ok) {
          manifest.notes.push('next build FAILED; no local screens captured');
          writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
          process.stderr.write(build.output);
          process.exit(1);
        }
      }

      process.stderr.write(`[harness] starting (${devMode ? 'next dev' : 'next start'})\n`);
      server = await startApp(appDir, await findFreePort(), env, { dev: devMode });
      baseUrl = server.url;
      if (devMode) {
        manifest.notes.push(
          'DEV MODE: captured from `next dev`, not a production build. Unminified, React in ' +
            'development mode, different bundling and timing. Trustworthy for layout and copy; ' +
            'NOT for anything timing-related.',
        );
      }
      manifest.notes.push(
        'Signed-in screens are STUB-BACKED: rows come from tests/harness/fixtures.mjs through ' +
          'tests/harness/stub-supabase.mjs, not from Postgres. They evidence rendering only.',
      );
    } else {
      baseUrl = remoteBaseUrl;
      manifest.notes.push(
        'Remote mode: signed-in screens were NOT captured. No credential exists in this ' +
          'environment and none may be created, so they are recorded as skipped rather than faked.',
      );
    }
    manifest.baseUrl = baseUrl;

    const { browser, browserNote } = await launchBrowser();
    manifest.notes.push(browserNote);
    const cookie = fromCommit && stub ? authCookie(stub.url) : null;

    for (const viewportSpec of GATE_VIEWPORTS) {
      for (const screen of screens) {
        if (screen.requiresDev && !devMode) {
          manifest.skipped.push({
            route: screen.route,
            viewport: viewportSpec.id,
            reason:
              'reachable only through the dev-only ?state= seam, which a production build ' +
              'eliminates. Re-run with --dev.',
          });
          continue;
        }
        for (const authState of screen.auth) {
          if (authState === 'in' && !fromCommit) {
            manifest.skipped.push({
              route: screen.route,
              viewport: viewportSpec.id,
              reason: 'signed-in screen, no credentials against a deployment',
            });
            continue;
          }
          const passes = authState === 'in' && screen.varyByPlaces ? counts : [counts[0] ?? 0];
          for (const count of passes) {
            if (stub) stub.setPlaceCount(count);
            // The data source leads the filename, not just the manifest.
            //
            // Orchestrator ruling, 2026-08-31: a screenshot is an assertion, and the run's
            // load-bearing rule is that no change may increase what the product asserts. An
            // unlabelled stub-backed PNG pasted into a report asserts that the product read those
            // rows from Postgres. It did not. A manifest alone is not enough because a PNG gets
            // separated from its directory the moment somebody drags one into a document — so the
            // word travels *in the filename*, where it cannot be lost.
            const source = manifest.dataSource === 'stub' ? 'stub' : 'live';
            const label = `${devMode ? `${source}-dev` : source}--${
              authState === 'out' ? 'signed-out' : `signed-in-${count}-places`
            }`;
            process.stderr.write(`[harness] ${label} ${screen.route} @ ${viewportSpec.id}\n`);
            const shot = await capture({
              browser,
              baseUrl,
              screen,
              viewportSpec,
              // Attached per state, never per run. See the note on SCREENS.
              cookie: authState === 'in' ? cookie : null,
              outDir,
              label,
              settleMs,
              fullPage,
              authState,
            });
            manifest.shots.push({
              ...shot,
              placeCount: authState === 'in' && screen.varyByPlaces ? count : null,
            });
          }
        }
      }
    }

    await browser.close();
  } finally {
    if (server) await server.stop();
    if (stub) await stub.close();
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  const broken = manifest.shots.filter(
    (s) =>
      s.error !== null ||
      (s.status !== null && s.status >= 400) ||
      s.hydrated === false ||
      s.expectMet === false,
  );
  process.stderr.write(
    `\n[harness] ${manifest.shots.length} screenshots -> ${outDir}\n` +
      `[harness] ${manifest.skipped.length} skipped, ${broken.length} unusable\n`,
  );
  for (const shot of broken) {
    const why = [
      shot.error,
      shot.status !== null && shot.status >= 400 ? `status ${shot.status}` : null,
      shot.hydrated === false ? 'REACT DID NOT HYDRATE — this is server HTML, not the product' : null,
      shot.expectMet === false ? 'screen did not change: the seam did not fire' : null,
    ]
      .filter(Boolean)
      .join('; ');
    process.stderr.write(`[harness]   UNUSABLE ${shot.file}: ${why}\n`);
  }
  if (broken.length > 0) process.exitCode = 1;
}

await main();
