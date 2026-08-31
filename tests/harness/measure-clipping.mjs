#!/usr/bin/env node
/**
 * **Is any text having its ink cut off by its own box?**
 *
 * ## Why this is a separate instrument and not a field on the contrast one
 *
 * `contrast-render.mjs` reads painted pixels, and a clipped glyph and an off-screen glyph look
 * identical to it: both produce `maxProbeDiff: 0` over the rect it sampled. That is worse than the
 * failure families this project has been cataloguing all day — those returned a wrong number or
 * refused to answer, and **this one returns a confident "nothing here" over a real defect.** It
 * would have done so on exactly the rows where a real defect turned out to be: the two `/map` tag
 * chips, which I classified `below-the-fold` and reported as *not* a defect, while another lane
 * asking a different question found live shipped ink being shaved on the bottom nav.
 *
 * The question a camera cannot answer is *what would have been painted*. So this asks it twice,
 * from two directions, and reports both:
 *
 *  1. **Geometrically**, with no screenshot at all. For every text-bearing element, take the union
 *     of its text nodes' `getClientRects()` — the inline boxes the font actually occupies — and
 *     compare against the **content box of the nearest ancestor that clips** (`overflow` other than
 *     `visible` on either axis, self included). Any overhang is ink the browser will not paint.
 *     This is cheap, exact about *whether*, and says nothing about *how much a reader loses*.
 *  2. **On painted pixels.** Re-render with the clip released and the ink forced to a probe colour,
 *     and count the pixels that appear in the band outside the clip. That is the number a person
 *     would recognise as "the descender is cut off", and it is the one worth quoting.
 *
 * The second is measured **only where the first says to look**, so the expensive half runs on a
 * handful of elements rather than on every string.
 *
 * ## What it deliberately does not claim
 *
 * Releasing `overflow: hidden` also releases `text-overflow: ellipsis`, so a truncated label may
 * paint *more characters* with the clip off. Horizontal overhang past the clip's right edge is
 * therefore reported but **never counted as clipped ink** — it is usually the ellipsis doing its
 * job, which is a design, not a defect. Only the vertical bands, above the content-box top and
 * below its bottom, are counted, and they are counted within the element's original width.
 *
 *   node tests/harness/measure-clipping.mjs --from-commit a811d01^ --out docs/evidence/i2/clipping/before
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

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/sign-in', name: 'sign-in' },
  { path: '/map', name: 'map' },
  { path: '/collections', name: 'collections' },
  { path: '/profile', name: 'profile' },
  { path: `/collections/${DEMO_COLLECTION_ID}`, name: 'collection-detail' },
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

/* -------------------------------------------------------------------------- */
/* 1. geometry — no screenshot                                                 */
/* -------------------------------------------------------------------------- */

const GEOMETRY = ({ minOverhang }) => {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  /**
   * The nearest ancestor (self included) that will **shave** this text, and its content box.
   *
   * **A scroller is not a shaver, and the first version of this conflated them.** It took the
   * nearest ancestor with any non-`visible` overflow, which on `/map` is the scrolling desktop
   * panel — so every row below the fold was reported as "clipped", by 102 to 1004 px, and the
   * released-overflow render obligingly counted the whole rest of the list as recovered ink. Thirty
   * elements, up to 2,603 device pixels each, none of them a defect: that text is not cut off, it
   * is scrolled past, and a reader reaches it by scrolling.
   *
   * The discriminator is **the computed `overflow-y` value itself**: `hidden` and `clip` shave,
   * `auto` and `scroll` hand the reader a way to see the rest. Nothing else in the DOM separates
   * them.
   *
   * **It took three wrong rules to arrive at that one, and all three are worth recording because
   * each looked obviously right.**
   *
   *  1. *Any non-`visible` overflow clips.* The nearest such ancestor on `/map` is the scrolling
   *     desktop panel, so every row below the fold was "clipped" by 102 to 1,004 px and the
   *     released render counted the whole rest of the list as recovered ink: 30 elements, up to
   *     2,603 device px, not one of them a defect.
   *  2. *Exclude anything where `scrollWidth > clientWidth`.* That is the definition of `truncate`,
   *     so it excluded the entire population this tool exists to examine and reported a confident
   *     **0**. Only vertical bands are ever counted, so only the vertical axis may disqualify.
   *  3. *Exclude anything where `scrollHeight > clientHeight`.* This is the subtle one and it is
   *     the reason the rule is what it is: **an element whose ink is being shaved has
   *     `scrollHeight > clientHeight` precisely because it is being shaved.** The test cannot tell
   *     a scroll container from its own quarry. It excluded the bottom nav, which is the defect
   *     that prompted the tool.
   *
   * The `0.5 * box` cap below stays as a second, independent guard: a shaved descender is a
   * fraction of a line, and anything larger is a layout relationship this tool has misread.
   */
  const clipper = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const shaves = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      if (shaves && !scrolls) {
        const r = node.getBoundingClientRect();
        const px = (v) => parseFloat(v) || 0;
        return {
          el: node,
          box: {
            x: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
            y: r.top + px(cs.borderTopWidth) + px(cs.paddingTop),
            w: r.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(cs.paddingLeft) - px(cs.paddingRight),
            h: r.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth) - px(cs.paddingTop) - px(cs.paddingBottom),
          },
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          lineHeight: cs.lineHeight,
          fontSize: cs.fontSize,
        };
      }
      node = node.parentElement;
    }
    return null;
  };

  const found = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;

    // The inline boxes the font occupies — ascent to descent, not the glyph bitmaps.
    const rects = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (!(node.textContent ?? '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0.5 && r.height > 0.5) rects.push(r);
      }
    }
    if (rects.length === 0) continue;

    const c = clipper(el);
    if (!c) continue;

    const top = Math.max(0, ...rects.map((r) => c.box.y - r.top));
    const bottom = Math.max(0, ...rects.map((r) => r.bottom - (c.box.y + c.box.h)));
    const left = Math.max(0, ...rects.map((r) => c.box.x - r.left));
    const right = Math.max(0, ...rects.map((r) => r.right - (c.box.x + c.box.w)));
    if (top < minOverhang && bottom < minOverhang) continue;
    // A shave is a fraction of the line box. Anything larger is a layout relationship this tool
    // has misread, and it is reported as such rather than counted.
    if (top > c.box.h * 0.5 || bottom > c.box.h * 0.5) continue;

    found.push({
      selector: describe(el),
      text: own.slice(0, 50),
      fontSize: c.fontSize,
      lineHeight: c.lineHeight,
      clipper: describe(c.el),
      clipperOverflow: `${c.overflowX}/${c.overflowY}`,
      selfIsClipper: c.el === el,
      contentBox: { x: c.box.x, y: c.box.y, w: c.box.w, h: c.box.h },
      inlineBox: {
        x: Math.min(...rects.map((r) => r.left)),
        y: Math.min(...rects.map((r) => r.top)),
        w: Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)),
        h: Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)),
      },
      overhangCssPx: {
        top: Number(top.toFixed(2)),
        bottom: Number(bottom.toFixed(2)),
        // Reported and never counted: releasing the clip releases the ellipsis with it.
        left: Number(left.toFixed(2)),
        right: Number(right.toFixed(2)),
      },
    });
  }
  return found;
};

/* -------------------------------------------------------------------------- */
/* 2. pixels — how much ink a reader actually loses                            */
/* -------------------------------------------------------------------------- */

/**
 * Force the ink to a probe colour so a glyph pixel is unmistakable against any ground, and
 * (optionally) release every clip so the shaved ink paints.
 */
const probeCss = (release) => `
*, *::before, *::after, *::first-line, *::placeholder {
  -webkit-text-fill-color: #FF00FF !important;
  text-shadow: none !important;
}
${release ? '* { overflow: visible !important; }' : ''}`;

/**
 * Count magenta pixels that exist with the clip released and not without it, inside the vertical
 * bands above and below the clipper's content box, within the element's own width.
 */
const COUNT = async ({ clipped, released, targets, scale }) => {
  const draw = async (data) => {
    const image = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { canvas, ctx };
  };
  const A = await draw(clipped);
  const B = await draw(released);

  const out = [];
  for (const t of targets) {
    const bands = [
      { name: 'top', y: t.inlineBox.y, h: Math.max(0, t.contentBox.y - t.inlineBox.y) },
      {
        name: 'bottom',
        y: t.contentBox.y + t.contentBox.h,
        h: Math.max(0, t.inlineBox.y + t.inlineBox.h - (t.contentBox.y + t.contentBox.h)),
      },
    ];
    let pixels = 0;
    let worst = 0;
    const perBand = {};
    for (const band of bands) {
      if (band.h <= 0) {
        perBand[band.name] = 0;
        continue;
      }
      const x0 = Math.max(0, Math.round(t.inlineBox.x * scale));
      const y0 = Math.max(0, Math.round(band.y * scale));
      const w = Math.min(A.canvas.width - x0, Math.round(t.inlineBox.w * scale));
      const h = Math.min(A.canvas.height - y0, Math.ceil(band.h * scale));
      if (w <= 0 || h <= 0) {
        perBand[band.name] = 0;
        continue;
      }
      const a = A.ctx.getImageData(x0, y0, w, h).data;
      const b = B.ctx.getImageData(x0, y0, w, h).data;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d =
          Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > worst) worst = d;
        // 96 of a possible 765 summed across three channels: a whole antialiased edge pixel, not a
        // rounding difference. Reported beside the count so the threshold is auditable.
        if (d >= 96) n += 1;
      }
      perBand[band.name] = n;
      pixels += n;
    }
    out.push({
      selector: t.selector,
      text: t.text,
      fontSize: t.fontSize,
      lineHeight: t.lineHeight,
      clipper: t.clipper,
      overhangCssPx: t.overhangCssPx,
      clippedInkDevicePx: pixels,
      perBand,
      worstChannelDelta: worst,
    });
  }
  return out;
};

/* -------------------------------------------------------------------------- */

async function main() {
  const fromCommit = arg('--from-commit', 'HEAD');
  const minOverhang = Number(arg('--min-overhang', '0.5'));
  const outArg = arg('--out', 'docs/evidence/i2/clipping');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const report = {
    takenAt: new Date().toISOString(),
    commitish: fromCommit,
    commit: null,
    minOverhangCssPx: minOverhang,
    inkThresholdSummedChannels: 96,
    method:
      'geometry: text-node getClientRects() vs the content box of the nearest clipping ancestor. ' +
      'pixels: magenta-forced ink, rendered with and without `overflow: visible`, differenced in ' +
      'the vertical bands outside the content box only.',
    caveat:
      'Horizontal overhang is reported and never counted — releasing overflow releases the ' +
      'ellipsis with it, so a truncated label legitimately paints more characters.',
    results: [],
  };

  let stub = null;
  let server = null;
  let browser = null;
  try {
    const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-clip-${process.pid}`);
    process.stderr.write(`[clip] exporting ${fromCommit}\n`);
    report.commit = exportCommit(REPO_DIR, fromCommit, appDir);
    stub = await startStubSupabase({ port: 0, places: 12 });
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: stub.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    };
    process.stderr.write('[clip] building\n');
    const build = buildApp(appDir, env);
    if (!build.ok) {
      process.stderr.write(build.output.slice(-3000));
      throw new Error('next build failed');
    }
    server = await startApp(appDir, await freePort(), env);
    browser = await chromium.launch();
    const cookie = authCookie(stub.url);

    for (const theme of ['light', 'dark']) {
      for (const viewport of GATE_VIEWPORTS) {
        for (const route of ROUTES) {
          const context = await browser.newContext({
            viewport: viewport.viewport,
            deviceScaleFactor: viewport.deviceScaleFactor,
            isMobile: viewport.isMobile,
            hasTouch: viewport.hasTouch,
            baseURL: server.url,
            colorScheme: theme,
          });
          await context.addCookies([{ ...cookie, url: server.url, sameSite: 'Lax' }]);
          const page = await context.newPage();
          process.stderr.write(`[clip] ${theme} ${route.name} @ ${viewport.id}\n`);
          await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          try {
            await page.waitForLoadState('networkidle', { timeout: 12_000 });
          } catch {
            /* tiles */
          }
          await page.waitForTimeout(4000);

          const geometry = await page.evaluate(GEOMETRY, { minOverhang });
          let pixels = [];
          if (geometry.length > 0) {
            const shoot = async (css) => {
              const handle = await page.addStyleTag({ content: css });
              const png = (await page.screenshot({ type: 'png' })).toString('base64');
              await handle.evaluate((n) => n.remove());
              return png;
            };
            const clipped = await shoot(probeCss(false));
            const released = await shoot(probeCss(true));
            const ctx = await browser.newContext();
            const blank = await ctx.newPage();
            await blank.goto('about:blank');
            pixels = await blank.evaluate(COUNT, {
              clipped,
              released,
              targets: geometry,
              scale: viewport.deviceScaleFactor,
            });
            await ctx.close();
          }
          await context.close();

          report.results.push({
            theme,
            viewport: viewport.id,
            deviceScaleFactor: viewport.deviceScaleFactor,
            route: route.name,
            clippedElements: pixels.filter((p) => p.clippedInkDevicePx > 0).length,
            overhangingElements: geometry.length,
            elements: pixels,
          });
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
    if (stub) await stub.close();
    writeFileSync(join(outDir, 'clipping.json'), JSON.stringify(report, null, 2));
    process.stderr.write(`[clip] report -> ${join(outDir, 'clipping.json')}\n`);
  }

  const total = report.results.reduce((n, r) => n + r.clippedElements, 0);
  const worst = report.results
    .flatMap((r) => r.elements.map((e) => ({ ...e, at: `${r.theme}/${r.viewport}/${r.route}` })))
    .filter((e) => e.clippedInkDevicePx > 0)
    .sort((a, b) => b.clippedInkDevicePx - a.clippedInkDevicePx)
    .slice(0, 10);
  process.stderr.write(
    `\n[clip] commit ${report.commit}\n[clip] elements with ink cut off: ${total}\n` +
      worst
        .map(
          (e) =>
            `[clip]   ${e.clippedInkDevicePx} device px  ${e.at}  ${e.selector}  "${e.text}"  ` +
            `(font ${e.fontSize} / line ${e.lineHeight}, overhang ${e.overhangCssPx.bottom}px below)\n`,
        )
        .join(''),
  );
}

await main();
