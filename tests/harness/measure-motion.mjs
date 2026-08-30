#!/usr/bin/env node
/**
 * The mechanical half of Q4: **do pins arrive in sequence, and what does the frame budget cost?**
 *
 * ## What this can and cannot answer, stated first because it is the whole point
 *
 * W6-6's exit criterion is *"pins arrive in sequence after the flight; frame budget unchanged"* —
 * two claims, and until now neither was checkable by anyone but a person watching the screen.
 *
 * This measures both:
 *
 *  - **Sequence.** A screencast of the map from navigation to rest, and the fraction of pixels that
 *    changed between each consecutive pair of frames. A camera flight is a long run of large
 *    changes. Pins appearing all at once is *one* spike after the camera stops. Pins landing in a
 *    stagger is a *run of small spikes* after the camera stops. Those three shapes are different
 *    enough to tell apart from the numbers, and the frames are written to disk so a human can flip
 *    through them and check that the numbers are describing what they think.
 *  - **Frame budget.** `requestAnimationFrame` deltas across the same window, reduced to median,
 *    p95, max and the count over one and two 60 Hz frames. Comparable in kind to
 *    `facelift-plan.md` §2's *2,000 pins with labels gated → 19.0 ms median / 60.5 ms p95*, which
 *    was also taken under software GL — but **not the same measurement**: that one was a pin-count
 *    stress test, this one is a page load and settle. Compare a before against an after taken with
 *    this tool. Do not compare either against §2's number and call it a regression.
 *
 * **It cannot tell you the animation looks good.** It can say pins appeared over 400 ms in eleven
 * steps rather than in one, and it can say no frame exceeded 33 ms. Whether the easing reads as a
 * pin *landing* or as a pin *twitching* is a human judgement and this tool has no opinion on it.
 * Q4 keeps a person in it; this only removes the part where the person also has to be a stopwatch.
 *
 * It also cannot see anything below the sign-in boundary that is not stub-backed — the pins are
 * fixture rows (`fixtures.mjs`), so this measures the *rendering* of N pins and not the product's
 * real data path.
 *
 * ## Usage
 *
 *   node tests/harness/measure-motion.mjs --from-commit HEAD --out docs/evidence/qa/motion/before
 *   node tests/harness/measure-motion.mjs --from-commit <after-sha> --out .../after --places 30
 *
 * `--places` defaults to 30, which is the count Q1 names and the one where a stagger is legible.
 * `--places 2000` reproduces §2's stress condition for the frame-budget half.
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

/** Fraction of pixels that must differ for a frame to count as "something happened". */
const CHANGE_THRESHOLD = 0.0008;
/** Per-channel difference below which two pixels are the same. JPEG screencast frames are lossy. */
const PIXEL_TOLERANCE = 12;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  const value = process.argv[i + 1];
  return i === -1 || value === undefined || value.startsWith('--') ? fallback : value;
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function launchBrowser() {
  try {
    const browser = await chromium.launch();
    return { browser, browserNote: 'bundled Playwright Chromium' };
  } catch (bundledError) {
    const browser = await chromium.launch({ channel: 'chrome' });
    return {
      browser,
      browserNote: `system Google Chrome (bundled Chromium unavailable: ${String(bundledError).split('\n')[0]})`,
    };
  }
}

/**
 * Diff a list of base64 JPEG frames, in the browser.
 *
 * In the browser because there is no PNG/JPEG decoder in Node here and **no new dependency may be
 * added** — a canvas is a decoder that is already installed. It runs on a blank page, not on the
 * page being measured, so it cannot perturb the thing it is describing.
 */
async function diffFrames(browser, frames) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');
  const changed = await page.evaluate(
    async ({ frames, tolerance }) => {
      const decode = (data) =>
        new Promise((res, rej) => {
          const image = new Image();
          image.onload = () => res(image);
          image.onerror = rej;
          image.src = `data:image/jpeg;base64,${data}`;
        });

      const results = [];
      let previous = null;
      let canvas = null;
      let ctx = null;
      for (const frame of frames) {
        const image = await decode(frame);
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          ctx = canvas.getContext('2d', { willReadFrequently: true });
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const current = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (previous) {
          let differing = 0;
          for (let i = 0; i < current.length; i += 4) {
            if (
              Math.abs(current[i] - previous[i]) > tolerance ||
              Math.abs(current[i + 1] - previous[i + 1]) > tolerance ||
              Math.abs(current[i + 2] - previous[i + 2]) > tolerance
            ) {
              differing += 1;
            }
          }
          results.push(differing / (current.length / 4));
        } else {
          results.push(null); // nothing to compare the first frame against
        }
        previous = current.slice();
      }
      return results;
    },
    { frames, tolerance: PIXEL_TOLERANCE },
  );
  await context.close();
  return changed;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * Reduce the change series to the shape W6-6 asks about.
 *
 * **The first version of this function was wrong and the fix is the interesting part.** It tried to
 * find "the camera flight" as the leading run of large changes and call everything after it the
 * settle. Against the real series that anchored on the browser's *first paint* — a blank page
 * becoming a page — and declared the camera settled at 116 ms, before the basemap had arrived at
 * all. Every tile that loaded afterwards then counted as a pin landing. The numbers looked
 * plausible and meant nothing.
 *
 * So the anchor is now the single **largest** change in the run, which is the frame where the map
 * actually paints (0.39 and 0.42 of all pixels in the two runs measured — nothing else in a page
 * load comes close). What W6-6 asks about is exactly what happens *after* that:
 *
 *   - no paints, or one → the pins were already there when the map painted. No entrance.
 *   - a run of small changes spread over a few hundred ms → pins arriving in sequence.
 *   - one large change → pins appearing all at once.
 *
 * Note that a screencast frame **is** a compositor paint: the browser emits one when something is
 * drawn and nothing when nothing is. So the gaps in the series are themselves data, and
 * `paintsAfter` is a meaningful count rather than a sampling artefact.
 */
function summariseSequence(series, timestamps) {
  const values = series.map((v) => v ?? 0);
  let anchorIndex = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[anchorIndex]) anchorIndex = i;
  }

  const after = [];
  for (let i = anchorIndex + 1; i < values.length; i += 1) {
    if (values[i] > CHANGE_THRESHOLD) {
      after.push({ atMs: Math.round(timestamps[i] ?? 0), change: Number(values[i].toFixed(5)) });
    }
  }
  const anchorMs = Math.round(timestamps[anchorIndex] ?? 0);
  return {
    paints: values.length,
    /** The frame where the map painted, and how much of the screen it changed. */
    mapPaintedAtMs: anchorMs,
    mapPaintChange: Number(values[anchorIndex].toFixed(5)),
    paintsAfterMapPaint: values.length - anchorIndex - 1,
    changeEventsAfterMapPaint: after.length,
    /** How long the post-paint activity is spread over. A stagger has a span; a single flash does not. */
    spanAfterMapPaintMs: after.length > 0 ? after[after.length - 1].atMs - anchorMs : 0,
    afterMapPaint: after,
  };
}

async function measureOne({ browser, baseUrl, viewportSpec, cookie, outDir, windowMs }) {
  const context = await browser.newContext({
    viewport: viewportSpec.viewport,
    deviceScaleFactor: viewportSpec.deviceScaleFactor,
    isMobile: viewportSpec.isMobile,
    hasTouch: viewportSpec.hasTouch,
    baseURL: baseUrl,
  });
  if (cookie) await context.addCookies([{ ...cookie, url: baseUrl, httpOnly: false, sameSite: 'Lax' }]);
  const page = await context.newPage();

  // `requestAnimationFrame` deltas, installed before any app script runs so the very first frames
  // after navigation are in the sample. rAF is the honest instrument here: it is the clock the
  // animation itself is driven by, so a frame it misses is a frame the animation missed.
  await page.addInitScript(() => {
    window.__frameTimes = [];
    let last = null;
    const tick = (now) => {
      if (last !== null) window.__frameTimes.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const client = await context.newCDPSession(page);
  const frames = [];
  const frameTimestamps = [];
  let firstTimestamp = null;
  client.on('Page.screencastFrame', async (payload) => {
    if (firstTimestamp === null) firstTimestamp = payload.metadata.timestamp;
    frames.push(payload.data);
    frameTimestamps.push((payload.metadata.timestamp - firstTimestamp) * 1000);
    try {
      await client.send('Page.screencastFrameAck', { sessionId: payload.sessionId });
    } catch {
      /* the cast was stopped between the frame and the ack */
    }
  });

  // A screencast, not a loop of `page.screenshot()`. Screenshots cost tens of milliseconds each and
  // are taken on the same thread the animation runs on, so a screenshot-sampled filmstrip measures
  // the sampler as much as the subject. The screencast is driven by the compositor's own frames.
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  await page.goto('/map', { waitUntil: 'commit' });
  await page.waitForTimeout(windowMs);
  await client.send('Page.stopScreencast');

  const frameTimes = await page.evaluate(() => window.__frameTimes ?? []);
  await context.close();

  const changes = await diffFrames(browser, frames);
  const sequence = summariseSequence(changes, frameTimestamps);

  // Read the *tail*, not the median.
  //
  // Headless Chromium's rAF is not locked to a display refresh, so on an idle page it fires far
  // faster than 60 Hz and the median lands around 8 ms. That number is not "120 fps of smooth
  // animation"; it is "nothing was happening". Reporting it as a performance result would be
  // exactly the kind of confidently-wrong claim this project's house rules forbid. What does carry
  // information is the tail — `maxMs`, and how many frames blew one or two 60 Hz budgets — because
  // a long frame is a long frame whatever the idle cadence is.
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const budget = {
    frames: frameTimes.length,
    medianMs: Number((percentile(sorted, 50) ?? 0).toFixed(2)),
    p95Ms: Number((percentile(sorted, 95) ?? 0).toFixed(2)),
    maxMs: Number(Math.max(0, ...frameTimes).toFixed(2)),
    over16_7ms: frameTimes.filter((d) => d > 16.7).length,
    over33_3ms: frameTimes.filter((d) => d > 33.3).length,
    medianCaveat:
      'Headless rAF is not vsync-locked; an idle page reports ~8ms. Compare maxMs and the ' +
      'over-budget counts between runs, not the median against 16.7.',
  };

  // The filmstrip itself, because the numbers above are a summary of it and a summary can be wrong.
  const stripDir = join(outDir, `filmstrip--${viewportSpec.id}`);
  mkdirSync(stripDir, { recursive: true });
  frames.forEach((data, index) => {
    writeFileSync(
      join(stripDir, `${String(index).padStart(3, '0')}--${Math.round(frameTimestamps[index])}ms.jpg`),
      Buffer.from(data, 'base64'),
    );
  });

  return {
    viewport: viewportSpec.id,
    sequence,
    budget,
    changeSeries: changes.map((v, i) => ({
      atMs: Math.round(frameTimestamps[i] ?? 0),
      change: v === null ? null : Number(v.toFixed(5)),
    })),
  };
}

async function main() {
  const fromCommit = arg('--from-commit', null);
  const remoteBaseUrl = arg('--base-url', process.env.PLAYWRIGHT_BASE_URL || null);
  if (!fromCommit && !remoteBaseUrl) {
    console.error('measure-motion: pass --from-commit <sha|HEAD>, or --base-url <url>.');
    process.exit(2);
  }
  const places = Number(arg('--places', '30'));
  const windowMs = Number(arg('--window', '5000'));
  const outArg = arg('--out', 'docs/evidence/qa/motion/run');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const report = {
    takenAt: new Date().toISOString(),
    commit: null,
    baseUrl: null,
    dataSource: fromCommit ? 'stub' : 'live-deployment',
    places,
    windowMs,
    browser: null,
    thresholds: { changeFraction: CHANGE_THRESHOLD, pixelTolerance: PIXEL_TOLERANCE },
    measurements: [],
    caveats: [
      'Pins are fixture rows from tests/harness/fixtures.mjs. This measures the rendering of N pins, not the real data path.',
      'It shows whether pins appear over time or at once. It cannot say whether the animation looks good; Q4 still needs a person.',
      'Software GL in headless Chromium. Comparable to another run of this tool, not to facelift-plan.md §2, which was a different measurement.',
    ],
  };

  let stub = null;
  let server = null;
  let browser = null;
  try {
    let baseUrl;
    if (fromCommit) {
      const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-motion-${process.pid}`);
      process.stderr.write(`[motion] exporting ${fromCommit}\n`);
      report.commit = exportCommit(REPO_DIR, fromCommit, appDir);
      stub = await startStubSupabase({ port: 0, places });
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: stub.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
      };
      process.stderr.write('[motion] building\n');
      const build = buildApp(appDir, env);
      if (!build.ok) {
        process.stderr.write(build.output);
        process.exit(1);
      }
      server = await startApp(appDir, await findFreePort(), env);
      baseUrl = server.url;
    } else {
      baseUrl = remoteBaseUrl;
    }
    report.baseUrl = baseUrl;

    const launched = await launchBrowser();
    browser = launched.browser;
    report.browser = launched.browserNote;
    const cookie = stub ? authCookie(stub.url) : null;

    for (const viewportSpec of GATE_VIEWPORTS) {
      process.stderr.write(`[motion] /map @ ${viewportSpec.id}, ${places} places\n`);
      report.measurements.push(
        await measureOne({ browser, baseUrl, viewportSpec, cookie, outDir, windowMs }),
      );
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
    if (stub) await stub.close();
    writeFileSync(join(outDir, 'motion.json'), JSON.stringify(report, null, 2));
  }

  for (const m of report.measurements) {
    process.stderr.write(
      `\n[motion] ${m.viewport}: map painted at ${m.sequence.mapPaintedAtMs}ms ` +
        `(${(m.sequence.mapPaintChange * 100).toFixed(1)}% of pixels); afterwards ` +
        `${m.sequence.paintsAfterMapPaint} paints, ${m.sequence.changeEventsAfterMapPaint} of them ` +
        `visible, spread over ${m.sequence.spanAfterMapPaintMs}ms\n` +
        `[motion] ${m.viewport}: frame time max ${m.budget.maxMs}ms, ${m.budget.over16_7ms} over ` +
        `16.7ms, ${m.budget.over33_3ms} over 33.3ms (median ${m.budget.medianMs}ms — see medianCaveat)\n`,
    );
  }
  process.stderr.write(`\n[motion] report -> ${join(outDir, 'motion.json')}\n`);
}

await main();
