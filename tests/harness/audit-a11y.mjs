#!/usr/bin/env node
/**
 * W7-6's three static checks, run against a commit: **contrast at AA, 44px touch targets, and a
 * visible focus ring on everything the keyboard can reach.**
 *
 * Exit criterion, verbatim: *no contrast failure at AA; no touch target under 44px; the map holds
 * frame rate while the sheet is open.* The frame-rate half is `measure-motion.mjs`; this is the
 * other three, and it runs them in **both themes**, because `.dark` became reachable in `373c655`
 * and nobody has swept the rendered dark product — only the palette it is built from.
 *
 * ## The honest-result rule this file is built around
 *
 * A contrast checker that walks the DOM is wrong in three situations, and all three occur in this
 * product. It is worth more to name them than to emit a number for them:
 *
 *  1. **Text over the map.** The map is a WebGL canvas. Its pixels are not in the DOM, so an
 *     element sitting over it has no resolvable background and any ratio computed for it is
 *     fiction. These are reported `overCanvas` and **never counted as passes or failures.**
 *  2. **Text over a gradient, an image or a `backdrop-blur`.** `facelift-plan.md` finding 12 counts
 *     six blurred surfaces over that canvas. A blurred surface's effective background is whatever
 *     is behind it at that instant, which is not a colour. Reported `indeterminate`.
 *  3. **Cumulative opacity.** A 45% disabled state on an ancestor changes the text's effective
 *     colour without changing its `color`. This composites ancestor opacity before comparing, which
 *     is the whole point of checking the disabled states.
 *
 * So every text node lands in exactly one of `pass`, `fail`, `overCanvas` or `indeterminate`, and
 * the summary prints all four. **An `indeterminate` is not a pass**, and a run with many of them is
 * a run that checked less than it looks like it did.
 *
 * ## Focus is measured with the keyboard, not with `.focus()`
 *
 * `:focus-visible` is a heuristic on the *input modality*: a programmatic `element.focus()` does not
 * generally match it in Chromium, so a checker built on `.focus()` would report a missing ring on
 * every element in the product. This tabs — real `Tab` presses — and reads `document.activeElement`
 * at each stop. That also yields the keyboard-reachable set for free, which is the thing worth
 * knowing.
 *
 *   node tests/harness/audit-a11y.mjs --from-commit HEAD --places 3 --out docs/evidence/qa/a11y
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

/** WCAG 2.2 AA. Large text is >=24px, or >=18.66px when bold. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3;
/** `facelift-plan.md` §1 and the state matrix. */
const MIN_TARGET_PX = 44;

const ROUTES = [
  { path: '/', name: 'landing', auth: 'out' },
  { path: '/sign-in', name: 'sign-in', auth: 'out' },
  { path: '/map', name: 'map', auth: 'in' },
  { path: '/profile', name: 'profile', auth: 'in' },
  { path: '/collections', name: 'collections', auth: 'in' },
  { path: '/import', name: 'import', auth: 'in' },
  { path: `/collections/${DEMO_COLLECTION_ID}`, name: 'collection-detail', auth: 'in' },
];

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  const value = process.argv[i + 1];
  return i === -1 || value === undefined || value.startsWith('--') ? fallback : value;
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
  } catch (bundled) {
    return {
      browser: await chromium.launch({ channel: 'chrome' }),
      note: `system Chrome (${String(bundled).split('\n')[0]})`,
    };
  }
}

/** Everything that runs inside the page. One `evaluate`, so the DOM is read in one consistent state. */
const IN_PAGE = ({ aaNormal, aaLarge, minTarget }) => {
  const parseRgb = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg, bg) => {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  };
  const cumulativeOpacity = (el) => {
    let o = 1;
    let node = el;
    while (node && node !== document.documentElement) {
      const v = Number(getComputedStyle(node).opacity);
      if (Number.isFinite(v)) o *= v;
      node = node.parentElement;
    }
    return o;
  };

  /** The first opaque background behind `el`, or a reason it cannot be resolved. */
  const backgroundBehind = (el) => {
    let node = el;
    while (node) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        return { kind: 'indeterminate', why: 'background-image or gradient' };
      }
      if (cs.backdropFilter && cs.backdropFilter !== 'none') {
        return { kind: 'indeterminate', why: 'backdrop-filter' };
      }
      const c = parseRgb(cs.backgroundColor);
      if (c && c.a >= 0.95) return { kind: 'colour', colour: c };
      if (c && c.a > 0) return { kind: 'indeterminate', why: 'translucent background' };
      node = node.parentElement;
    }
    return { kind: 'colour', colour: { r: 255, g: 255, b: 255, a: 1 } };
  };

  const overCanvas = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return Array.from(document.querySelectorAll('canvas')).some((c) => {
      const q = c.getBoundingClientRect();
      return r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
    });
  };

  /* --8<-- inactive-state (kept identical in contrast-render.mjs; tests/harness/inactive-state-check.mjs
     extracts both copies and runs the known-answer matrix against each) --8<-- */
  /**
   * WCAG 1.4.3's "inactive user interface component", read from every channel this product's own
   * components use to say it, not from the content attribute alone.
   *
   *  - the DOM **property**: the state the browser and the frameworks act on. Base UI's `useButton`
   *    mutates `element.disabled` on composite items directly (`internals/use-button/useButton.mjs`),
   *    so on those the attribute and the property can disagree and only the property is current.
   *  - the **attribute**: React's own output for `<button disabled>` / `<input disabled>`, which is
   *    how every disabled control in `src/app` is written.
   *  - **`aria-disabled="true"`**: what a *composite* item carries instead. `useFocusableWhenDisabled`
   *    sets `aria-disabled` and withholds `disabled` whenever `focusableWhenDisabled` is on, which
   *    is unconditional for `Menu.Item` and `Combobox.Item` — so a disabled menu row has no
   *    `disabled` attribute and no property at all.
   *
   * An ancestor walk, not `closest()`, because a selector cannot ask about the property.
   */
  const isInactive = (el) => {
    for (let n = el; n instanceof Element; n = n.parentElement) {
      if (n.disabled === true) return true;
      if (n.hasAttribute('disabled')) return true;
      if (n.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  };
  /* --8<-- end inactive-state --8<-- */

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  // ---- contrast -------------------------------------------------------------
  const contrast = { pass: 0, fail: [], overCanvas: 0, indeterminate: 0, exemptInactive: 0 };
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (overCanvas(el)) {
      contrast.overCanvas += 1;
      continue;
    }
    const bg = backgroundBehind(el);
    if (bg.kind !== 'colour') {
      contrast.indeterminate += 1;
      continue;
    }
    const fg = parseRgb(cs.color);
    if (!fg) {
      contrast.indeterminate += 1;
      continue;
    }
    const effective = over({ ...fg, a: fg.a * cumulativeOpacity(el) }, bg.colour);
    // WCAG 1.4.3 exempts "text that is part of an inactive user interface component" outright, so a
    // disabled control is not a contrast failure however pale it is. This was not a hypothetical:
    // the first run of this tool reported the `/import` `Add →` button at 2.33:1 across all four
    // theme/viewport combinations, and it is `disabled={!canSubmit}` with an empty field — the only
    // state the harness can reach without typing. Scoring it would have been the single loudest
    // number in the report and it would have been wrong.
    const inactive = isInactive(el);
    if (inactive) {
      contrast.exemptInactive += 1;
      continue;
    }
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? aaLarge : aaNormal;
    const r = ratio(effective, bg.colour);
    if (r + 0.005 < required) {
      contrast.fail.push({
        selector: describe(el),
        text: own.slice(0, 60),
        ratio: Number(r.toFixed(2)),
        required,
        fontPx: Number(size.toFixed(1)),
        weight,
        color: cs.color,
        background: `rgb(${Math.round(bg.colour.r)}, ${Math.round(bg.colour.g)}, ${Math.round(bg.colour.b)})`,
      });
    } else {
      contrast.pass += 1;
    }
  }

  // ---- touch targets --------------------------------------------------------
  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])';
  // A `<label>` wrapping a control *is* that control's hit area — clicking anywhere in it activates
  // the input. The first run of this tool flagged sign-in's `Remember me` checkbox at 16×16, which
  // is its visual size and not its target: it sits inside `<label class="flex items-start gap-2">`.
  // Measuring the input alone is a false positive, so the label counts as the enclosing control.
  const HIT_AREA = `${INTERACTIVE}, label`;
  const targets = { pass: 0, fail: [] };
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // A control inside a bigger control is hit through its parent; measuring it alone is a false
    // positive, and this product nests an <a> inside a padded row on purpose.
    const parentControl = el.parentElement?.closest(HIT_AREA);
    const box = parentControl ? parentControl.getBoundingClientRect() : r;
    const w = Math.max(r.width, box.width);
    const h = Math.max(r.height, box.height);
    if (w + 0.5 < minTarget || h + 0.5 < minTarget) {
      targets.fail.push({
        selector: describe(el),
        text: (el.textContent ?? '').trim().slice(0, 40),
        label: el.getAttribute('aria-label') ?? null,
        width: Number(w.toFixed(1)),
        height: Number(h.toFixed(1)),
      });
    } else {
      targets.pass += 1;
    }
  }

  return { contrast, targets };
};

/** Tab through the page and record whether each stop shows a focus indicator. */
async function auditFocus(page, maxStops = 40) {
  const stops = [];
  const seen = new Set();
  await page.evaluate(() => document.body.focus?.());
  for (let i = 0; i < maxStops; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const describe = (e) => {
        const id = e.id ? `#${e.id}` : '';
        const cls = typeof e.className === 'string' && e.className
          ? `.${e.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
        return `${e.tagName.toLowerCase()}${id}${cls}`;
      };
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      // Tailwind's ring is a box-shadow. `none` means no ring.
      const hasRing = cs.boxShadow !== 'none' && cs.boxShadow !== '';
      return {
        selector: describe(el),
        text: (el.textContent ?? '').trim().slice(0, 40),
        label: el.getAttribute('aria-label') ?? null,
        matchesFocusVisible: el.matches(':focus-visible'),
        hasOutline,
        hasRing,
        outline: cs.outline,
        boxShadow: cs.boxShadow.slice(0, 80),
        width: Number(r.width.toFixed(1)),
        height: Number(r.height.toFixed(1)),
      };
    });
    if (stop === null) continue;
    const key = `${stop.selector}|${stop.text}|${stop.width}x${stop.height}`;
    if (seen.has(key)) break; // wrapped around
    seen.add(key);
    stops.push(stop);
  }
  return stops;
}

async function main() {
  const fromCommit = arg('--from-commit', 'HEAD');
  const places = Number(arg('--places', '3'));
  const outArg = arg('--out', 'docs/evidence/qa/a11y');
  const outDir = isAbsolute(outArg) ? outArg : join(REPO_DIR, outArg);
  mkdirSync(outDir, { recursive: true });

  const report = {
    takenAt: new Date().toISOString(),
    commit: null,
    dataSource: 'stub',
    places,
    buildMode: 'next build + next start',
    thresholds: { aaNormal: AA_NORMAL, aaLarge: AA_LARGE, minTargetPx: MIN_TARGET_PX },
    browser: null,
    results: [],
    caveats: [
      'Signed-in screens are stub-backed: layout and colour are real, the data is not.',
      'Text over the map canvas is never scored — a WebGL surface has no DOM background and any ratio for it would be fiction.',
      'Text over a gradient, an image or a backdrop-filter is reported indeterminate, not passed.',
      'Production build. Dev-mode captures are excluded from every claim here.',
    ],
  };

  let stub = null;
  let server = null;
  let browser = null;
  try {
    const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-a11y-${process.pid}`);
    process.stderr.write(`[a11y] exporting ${fromCommit}\n`);
    report.commit = exportCommit(REPO_DIR, fromCommit, appDir);
    stub = await startStubSupabase({ port: 0, places });
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: stub.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    };
    process.stderr.write('[a11y] building\n');
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

    for (const theme of ['light', 'dark']) {
      for (const viewport of GATE_VIEWPORTS) {
        for (const route of ROUTES) {
          const context = await browser.newContext({
            viewport: viewport.viewport,
            deviceScaleFactor: viewport.deviceScaleFactor,
            isMobile: viewport.isMobile,
            hasTouch: viewport.hasTouch,
            baseURL: server.url,
            // The provider's default preference is `system`, so emulating the device setting is a
            // truer switch than seeding localStorage — it exercises the same path a real user does.
            colorScheme: theme,
          });
          if (route.auth === 'in') {
            await context.addCookies([{ ...cookie, url: server.url, sameSite: 'Lax' }]);
          }
          const page = await context.newPage();
          process.stderr.write(`[a11y] ${theme} ${route.name} @ ${viewport.id}\n`);
          await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          try {
            await page.waitForLoadState('networkidle', { timeout: 15_000 });
          } catch {
            /* tiles */
          }
          await page.waitForTimeout(2500);

          const resolvedTheme = await page.evaluate(() =>
            document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          );
          const statics = await page.evaluate(IN_PAGE, {
            aaNormal: AA_NORMAL,
            aaLarge: AA_LARGE,
            minTarget: MIN_TARGET_PX,
          });
          const focus = await auditFocus(page);
          await context.close();

          report.results.push({
            theme,
            resolvedTheme,
            viewport: viewport.id,
            route: route.name,
            ...statics,
            focus: {
              stops: focus.length,
              noIndicator: focus.filter((f) => !f.hasOutline && !f.hasRing),
              notFocusVisible: focus.filter((f) => !f.matchesFocusVisible).length,
            },
          });
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
    if (stub) await stub.close();
    writeFileSync(join(outDir, 'a11y.json'), JSON.stringify(report, null, 2));
  }

  let contrastFails = 0;
  let targetFails = 0;
  let focusFails = 0;
  let indeterminate = 0;
  for (const r of report.results) {
    contrastFails += r.contrast.fail.length;
    targetFails += r.targets.fail.length;
    focusFails += r.focus.noIndicator.length;
    indeterminate += r.contrast.indeterminate;
    if (r.theme !== r.resolvedTheme) {
      process.stderr.write(
        `[a11y] WARNING ${r.route} @ ${r.viewport}: asked for ${r.theme}, document resolved ${r.resolvedTheme}\n`,
      );
    }
  }
  process.stderr.write(
    `\n[a11y] ${report.results.length} page-runs\n` +
      `[a11y] contrast: ${contrastFails} failures, ${indeterminate} indeterminate (NOT passes)\n` +
      `[a11y] targets under ${MIN_TARGET_PX}px: ${targetFails}\n` +
      `[a11y] keyboard stops with no visible indicator: ${focusFails}\n` +
      `[a11y] report -> ${join(outDir, 'a11y.json')}\n`,
  );
}

await main();
