/**
 * **Contrast measured on painted pixels, not on a walk up the DOM.**
 *
 * ## Why this exists beside `audit-a11y.mjs` rather than inside it
 *
 * Iteration 1 reported *"11 AA failures → 0"* and the truth was 11 → 8. Two independent defects in
 * the DOM-walking instrument produced that, and both are structural rather than a typo:
 *
 *  1. **`parseRgb` is `/rgba?\(([^)]+)\)/`.** Chromium serialises a computed colour authored in a
 *     modern colour space as `oklab(...)`, `oklch(...)`, `lab(...)` or `color(srgb ...)`, and this
 *     product authors ink that way — every `color-mix(in oklab, …)` in `globals.css` and every
 *     Tailwind `/N` opacity utility, which compiles to `color-mix(in oklab, X N%, transparent)`.
 *     The regex misses all of them and returns `null`.
 *  2. **`null` from the background walk is silent.** `backgroundBehind` continues to the parent on
 *     an unparseable background and, having run out of parents, **returns white**. So an
 *     unreadable string on a dark oklab panel is scored against `#fff` and passes. The failure mode
 *     is not "no answer", it is "a confident wrong answer", which is the only kind that survives a
 *     review.
 *
 * A third limit is not a bug but bounds what the old tool can ever say: text over a gradient, a
 * `backdrop-filter` or the WebGL map is reported `indeterminate` / `overCanvas` and never scored.
 * `iteration-2-plan.md` puts a gradient mesh, an indigo glow and a grain layer behind **the whole
 * of `/` and `/sign-in`**, which is precisely where the 1.18:1 panel was hiding — so on the two
 * screens this iteration is about, the DOM walker's answer is structurally *no answer*.
 *
 * ## What this does instead
 *
 * It renders the page, hides the glyphs, photographs what is behind them, and reads the pixels.
 *
 *  1. Collect every element with its own text: the **per-line rectangles** (a `Range` over its text
 *     nodes, so the sample follows the glyphs rather than the block), the ink, the font metrics.
 *  2. Resolve the ink to sRGB **by drawing it**, not by parsing it — `fillStyle = <computed value>`
 *     onto an opaque white canvas and again onto an opaque black one. Two draws recover the alpha
 *     and the colour exactly (`a = 1 − (w − b)/255`, `C = b/a`), for any syntax the browser can
 *     parse, in any colour space, with no regex anywhere. A value the canvas cannot parse is
 *     reported `unresolvable`, never guessed.
 *  3. Hide the glyphs with `-webkit-text-fill-color: transparent` — **not** `color: transparent`,
 *     which would also blank every `currentColor` border, `bg-current` dot and icon fill and so
 *     would change the very background being measured.
 *  4. Screenshot the viewport, decode it in a blank page (a canvas is a decoder that is already
 *     installed; guardrail 13 forbids adding one), and for each line rect compute the contrast of
 *     the composited ink against **every pixel behind it**.
 *
 * Gradients, blurs, grain, the glow under the card and the live map canvas are all just pixels to
 * this, so all four become measurable rather than `indeterminate`.
 *
 * ## What it still cannot say, stated up front
 *
 *  - **Occluded text is not scored.** If something is painted over an element, the plate shows the
 *     occluder, and a ratio against it describes a composite nobody sees. Reported `occluded`.
 *  - **Pseudo-element text is counted, not scored.** `::before`/`::after` `content` has no DOM node
 *     and no `Range`, so there is no rect to sample. The count is reported so a reader knows how
 *     much was skipped; scoring it would need a per-element clip screenshot with the pseudo hidden
 *     and shown, which is a different (much slower) instrument.
 *  - **A ratio is only as real as the render.** If the map's tiles did not load, text over the map
 *     was scored against whatever the empty canvas painted. The caller records that.
 *  - **WCAG 1.4.3 exempts inactive controls**, so `[disabled]` / `[aria-disabled=true]` subtrees are
 *     reported `exemptInactive` rather than failed — the same call `audit-a11y.mjs` makes, and for
 *     the same reason it documents.
 *
 * `selfTest()` is not decoration. It runs eight constructed cases whose answers are known by hand —
 * including two the old instrument provably cannot answer — and the caller is expected to refuse to
 * report any number until it passes.
 */

/** WCAG 2.2 AA. Large text is >=24px, or >=18.66px when bold. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/* -------------------------------------------------------------------------- */
/* in-page: collect                                                            */
/* -------------------------------------------------------------------------- */

const COLLECT = () => {
  /**
   * Resolve any CSS colour string to sRGB + alpha by drawing it twice.
   *
   * `ctx.fillStyle = value` is the browser's own parser, so `oklab()`, `oklch()`, `color(srgb …)`,
   * `color-mix(…)` and plain `rgb()` all work with no syntax knowledge here at all. A value the
   * parser rejects leaves `fillStyle` at its previous value, which is what the sentinel detects —
   * so an unparseable colour is `null` and the caller must not score it.
   */
  const draw = document.createElement('canvas');
  draw.width = 2;
  draw.height = 1;
  const dctx = draw.getContext('2d', { willReadFrequently: true });
  const resolveColour = (value) => {
    if (!value) return null;
    dctx.fillStyle = '#010203';
    dctx.fillStyle = value;
    if (dctx.fillStyle === '#010203' && !/^#010203$/i.test(String(value).trim())) return null;
    dctx.globalCompositeOperation = 'source-over';
    // white ground
    dctx.clearRect(0, 0, 2, 1);
    dctx.fillStyle = '#ffffff';
    dctx.fillRect(0, 0, 1, 1);
    dctx.fillStyle = '#000000';
    dctx.fillRect(1, 0, 1, 1);
    dctx.fillStyle = value;
    dctx.fillRect(0, 0, 2, 1);
    const d = dctx.getImageData(0, 0, 2, 1).data;
    const w = [d[0], d[1], d[2]];
    const b = [d[4], d[5], d[6]];
    // a = 1 - (w - b)/255, averaged over the three channels for rounding noise
    const alphas = [0, 1, 2].map((i) => 1 - (w[i] - b[i]) / 255);
    const a = Math.min(1, Math.max(0, alphas.reduce((s, v) => s + v, 0) / 3));
    if (a <= 0.002) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: b[0] / a, g: b[1] / a, b: b[2] / a, a };
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

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  /** The rectangles the glyphs actually occupy, one per rendered line. */
  const lineRects = (el) => {
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
    return rects;
  };

  /** Is anything painted on top of this rect? Sampled at five points, topmost element wins. */
  const occlusion = (el, rect) => {
    const pts = [
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
      [rect.left + 1.5, rect.top + rect.height * 0.5],
      [rect.right - 1.5, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.5, rect.top + 1.5],
      [rect.left + rect.width * 0.5, rect.bottom - 1.5],
    ];
    let covered = 0;
    let sample = null;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (!top) continue;
      if (top === el || el.contains(top) || top.contains(el)) continue;
      covered += 1;
      sample = describe(top);
    }
    return covered >= 3 ? sample : null;
  };

  const targets = [];
  let pseudoTextNodes = 0;

  /**
   * **Placeholder ink, which has no text node and so is invisible to every DOM walk.**
   *
   * It is user-visible text on the product's front door — `you@example.com` and
   * `At least 6 characters` — and `sign-in/page.tsx`'s own header makes a specific claim about its
   * measured ratio. A checker that silently omits it is agreeing with that claim by not looking.
   *
   * Chromium returns the real value for `getComputedStyle(el, '::placeholder').color`, verified on
   * a constructed `oklab()` case before this was written. The rect is the input's content box: the
   * placeholder is drawn inside it, and an input's background is flat, so sampling the whole box is
   * the same answer as sampling the glyph line and is robust to where the text is aligned.
   */
  for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
    const ph = el.getAttribute('placeholder');
    if (!ph || !ph.trim()) continue;
    if (el.value) continue; // a filled field paints its value, not its placeholder
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const pcs = getComputedStyle(el, '::placeholder');
    const ink = resolveColour(pcs.color);
    const opacity = cumulativeOpacity(el) * (Number(pcs.opacity) || 1);
    const size = parseFloat(pcs.fontSize) || parseFloat(cs.fontSize);
    const weight = Number(pcs.fontWeight) || Number(cs.fontWeight) || 400;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    targets.push({
      selector: `${describe(el)}::placeholder`,
      text: ph.slice(0, 70),
      fontPx: Number(size.toFixed(1)),
      weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      declaredColor: pcs.color,
      ink: ink ? { r: ink.r, g: ink.g, b: ink.b, a: ink.a * opacity } : null,
      unresolvable: ink === null,
      inactive: el.disabled || el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]') !== null,
      occludedBy: occlusion(el, box),
      overCanvas: false,
      rects: [
        {
          x: box.left + padL + 1,
          y: box.top + padT + 1,
          w: Math.max(1, box.width - padL - padR - 2),
          h: Math.max(1, box.height - padT - padB - 2),
        },
      ],
    });
  }

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    for (const pseudo of ['::before', '::after']) {
      const c = getComputedStyle(el, pseudo).content;
      if (c && c !== 'none' && c !== 'normal' && /^["']/.test(c) && c.replace(/^["']|["']$/g, '').trim()) {
        pseudoTextNodes += 1;
      }
    }

    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    if (!own) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rects = lineRects(el);
    if (rects.length === 0) continue;

    const box = el.getBoundingClientRect();
    const ink = resolveColour(cs.color);
    const opacity = cumulativeOpacity(el);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const inactive = el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]') !== null;
    const occludedBy = occlusion(el, box);

    targets.push({
      selector: describe(el),
      text: own.slice(0, 70),
      fontPx: Number(size.toFixed(1)),
      weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      declaredColor: cs.color,
      ink: ink ? { r: ink.r, g: ink.g, b: ink.b, a: ink.a * opacity } : null,
      unresolvable: ink === null,
      inactive,
      occludedBy,
      overCanvas: Array.from(document.querySelectorAll('canvas')).some((c) => {
        const q = c.getBoundingClientRect();
        return box.left < q.right && box.right > q.left && box.top < q.bottom && box.bottom > q.top;
      }),
      rects: rects.map((r) => ({
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      })),
    });
  }

  return {
    targets,
    pseudoTextNodes,
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
  };
};

/**
 * Hide the glyphs and nothing else.
 *
 * `-webkit-text-fill-color` paints the glyph interior and is the *only* property that does. Using
 * `color` here would have blanked every `currentColor` border, `bg-current` dot and
 * `fill="currentColor"` icon in the tree, changing the background this instrument exists to
 * photograph — a measurement that perturbs its own subject.
 */
const HIDE_INK_CSS = `
*, *::before, *::after, *::first-line, *::first-letter, *::placeholder, *::selection {
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-decoration-color: transparent !important;
  text-shadow: none !important;
  caret-color: transparent !important;
}`;

/* -------------------------------------------------------------------------- */
/* in-page (blank page): decode the plate and score                            */
/* -------------------------------------------------------------------------- */

const SCORE = async ({ png, targets, scale, aaNormal, aaLarge }) => {
  const image = await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = `data:image/png;base64,${png}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const lum = (r, g, b) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (l1, l2) => {
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };

  const scored = [];
  for (const t of targets) {
    const ratios = [];
    const bgSeen = new Map();
    for (const rect of t.rects) {
      const x0 = Math.max(0, Math.round(rect.x * scale));
      const y0 = Math.max(0, Math.round(rect.y * scale));
      const w = Math.min(canvas.width - x0, Math.round(rect.w * scale));
      const h = Math.min(canvas.height - y0, Math.round(rect.h * scale));
      if (w <= 0 || h <= 0) continue;
      const data = ctx.getImageData(x0, y0, w, h).data;
      // Stride so a very wide paragraph does not cost a million ratio computations; the step is
      // small enough that a gradient's darkest and lightest ends are both sampled.
      const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 900)));
      for (let py = 0; py < h; py += step) {
        for (let px = 0; px < w; px += step) {
          const i = (py * w + px) * 4;
          const br = data[i];
          const bg = data[i + 1];
          const bb = data[i + 2];
          const a = t.ink.a;
          const fr = t.ink.r * a + br * (1 - a);
          const fg = t.ink.g * a + bg * (1 - a);
          const fb = t.ink.b * a + bb * (1 - a);
          ratios.push(ratio(lum(fr, fg, fb), lum(br, bg, bb)));
          const key = `${br >> 3},${bg >> 3},${bb >> 3}`;
          bgSeen.set(key, (bgSeen.get(key) ?? 0) + 1);
        }
      }
    }
    if (ratios.length === 0) {
      scored.push({ ...t, verdict: 'no-pixels' });
      continue;
    }
    ratios.sort((a, b) => a - b);
    const at = (q) => ratios[Math.min(ratios.length - 1, Math.floor(q * ratios.length))];
    const required = t.large ? aaLarge : aaNormal;
    // The judged number is the 5th percentile rather than the raw minimum: a line rect can clip a
    // border or a divider by a pixel, and one such pixel is not what a reader sees. The raw min is
    // reported beside it so a reader can tell a one-pixel artefact from a genuinely dark corner.
    const judged = at(0.05);
    const dominant = [...bgSeen.entries()].sort((a, b) => b[1] - a[1])[0];
    scored.push({
      ...t,
      rects: undefined,
      samples: ratios.length,
      min: Number(ratios[0].toFixed(2)),
      p5: Number(judged.toFixed(2)),
      median: Number(at(0.5).toFixed(2)),
      max: Number(ratios[ratios.length - 1].toFixed(2)),
      required,
      // A background that is one colour across every sample is a flat ground; several is a
      // gradient, a blur or the map. Reported because "3.9:1 over a gradient" and "3.9:1 over a
      // flat panel" are different defects.
      backgroundBuckets: bgSeen.size,
      dominantBackground: dominant ? `rgb(${dominant[0].split(',').map((v) => Number(v) * 8).join(', ')})` : null,
      verdict: judged + 0.005 < required ? 'fail' : 'pass',
    });
  }
  return scored;
};

/* -------------------------------------------------------------------------- */
/* driver                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Measure one already-navigated, already-settled page.
 *
 * `browser` is needed for the blank scoring page — the decode never happens on the page being
 * measured, so the instrument cannot perturb its subject.
 */
export async function measureContrast(browser, page, { scale }) {
  const collected = await page.evaluate(COLLECT);
  const handle = await page.addStyleTag({ content: HIDE_INK_CSS });
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  await handle.evaluate((node) => node.remove());

  const scorable = collected.targets.filter(
    (t) => t.ink && !t.unresolvable && !t.inactive && !t.occludedBy,
  );
  const ctx = await browser.newContext();
  const blank = await ctx.newPage();
  await blank.goto('about:blank');
  const scored = await blank.evaluate(SCORE, {
    png,
    targets: scorable,
    scale,
    aaNormal: AA_NORMAL,
    aaLarge: AA_LARGE,
  });
  await ctx.close();

  return {
    totalTextElements: collected.targets.length,
    scored: scored.length,
    pass: scored.filter((s) => s.verdict === 'pass').length,
    fail: scored.filter((s) => s.verdict === 'fail'),
    exemptInactive: collected.targets.filter((t) => t.inactive).length,
    occluded: collected.targets.filter((t) => !t.inactive && t.occludedBy).length,
    unresolvableInk: collected.targets
      .filter((t) => t.unresolvable && !t.inactive && !t.occludedBy)
      .map((t) => ({ selector: t.selector, declaredColor: t.declaredColor })),
    pseudoTextNodesNotScored: collected.pseudoTextNodes,
    overCanvasScored: scored.filter((s) => s.overCanvas).length,
    worst: scored
      .slice()
      .sort((a, b) => (a.p5 ?? 99) - (b.p5 ?? 99))
      .slice(0, 8)
      .map((s) => ({ selector: s.selector, text: s.text, p5: s.p5, required: s.required })),
    // Every scored row, trimmed. A reader checking coverage needs to see what *passed* as much as
    // what failed: "0 failures" and "0 failures out of 3 strings on a screen with 12" are the same
    // headline and different facts, and iteration 1's report is what that distinction cost.
    all: scored.map((s) => ({
      selector: s.selector,
      text: s.text,
      fontPx: s.fontPx,
      weight: s.weight,
      p5: s.p5,
      min: s.min,
      median: s.median,
      required: s.required,
      backgroundBuckets: s.backgroundBuckets,
      overCanvas: s.overCanvas,
      verdict: s.verdict,
    })),
    // And everything that was *not* scored, with the reason, so the skips are auditable.
    skipped: collected.targets
      .filter((t) => !(t.ink && !t.unresolvable && !t.inactive && !t.occludedBy))
      .map((t) => ({
        selector: t.selector,
        text: t.text,
        reason: t.unresolvable ? 'unresolvable-ink' : t.inactive ? 'exempt-inactive' : t.occludedBy ? `occluded-by ${t.occludedBy}` : 'no-ink',
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* known-answer self-test                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Eight cases with answers computed by hand from the WCAG formula, on a page this file builds.
 *
 * Cases 4 and 5 are the two the DOM-walking instrument provably cannot answer: ink authored in
 * `oklab`, and a background authored in `oklab`. Case 6 is text on a gradient, which that
 * instrument reports as `indeterminate`. If any case is off by more than the tolerance, this file
 * has no business emitting a number about the product.
 */
export async function selfTest(browser) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; font-family: monospace; }
    div { font-size: 16px; padding: 8px; }
    #c1 { color: #ff0000; background: #ffffff; }
    #c2 { color: rgba(0, 0, 0, 0.5); background: #ffffff; }
    #c3o { opacity: 0.5; background: #ffffff; }
    #c3 { color: #000000; }
    #c4 { color: oklab(0 0 0); background: #ffffff; }
    #c5 { color: #ffffff; background: oklab(0 0 0); }
    #c6 { color: #ffffff; background: linear-gradient(to right, #000000 0%, #000000 45%, #ffffff 55%, #ffffff 100%); width: 600px; }
    #c7 { color: color-mix(in oklab, #ffffff 100%, transparent); background: #767676; }
    #c8 { color: #ffffff; background: #ffffff; }
    #c9 { background: #ffffff; border: 0; font-size: 16px; width: 300px; }
    #c9::placeholder { color: #767676; }
  </style></head><body>
    <div id="c1">alpha bravo charlie</div>
    <div id="c2">alpha bravo charlie</div>
    <div id="c3o"><div id="c3">alpha bravo charlie</div></div>
    <div id="c4">alpha bravo charlie</div>
    <div id="c5">alpha bravo charlie</div>
    <div id="c6">alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima</div>
    <div id="c7">alpha bravo charlie</div>
    <div id="c8">alpha bravo charlie</div>
    <input id="c9" placeholder="alpha bravo charlie">
  </body></html>`;

  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const result = await measureContrast(browser, page, { scale: 1 });
  await context.close();

  // Recompute the scored rows keyed by id. `measureContrast` returns only failures in full, so
  // re-run the score with everything kept.
  const context2 = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page2 = await context2.newPage();
  await page2.setContent(html, { waitUntil: 'load' });
  const collected = await page2.evaluate(COLLECT);
  const handle = await page2.addStyleTag({ content: HIDE_INK_CSS });
  const png = (await page2.screenshot({ type: 'png' })).toString('base64');
  await handle.evaluate((n) => n.remove());
  const blankCtx = await browser.newContext();
  const blank = await blankCtx.newPage();
  await blank.goto('about:blank');
  const rows = await blank.evaluate(SCORE, {
    png,
    targets: collected.targets.filter((t) => t.ink),
    scale: 1,
    aaNormal: AA_NORMAL,
    aaLarge: AA_LARGE,
  });
  await blankCtx.close();
  await context2.close();

  const by = (id) =>
    rows.find((r) => r.selector === `div#${id}` || r.selector === `input#${id.replace('::placeholder', '')}::placeholder`);

  // Hand-computed expectations.
  //   #ff0000 on #fff: L(red) = 0.2126 -> (1.05)/(0.2126+0.05) = 3.998
  //   rgba(0,0,0,.5) on #fff -> rgb(128) -> L = 0.2158 -> 1.05/0.2658 = 3.951
  //   the same via ancestor opacity 0.5
  //   oklab(0 0 0) is black -> 21
  //   white on oklab(0 0 0) -> 21
  //   white on a half-black half-white gradient -> min ~1.0, max ~21
  //   white on #767676: L(0x76=118) = 0.1845 -> 1.05/0.2345 = 4.478  (the canonical "just under AA")
  //   white on white -> 1.0
  const cases = [
    { id: 'c1', field: 'median', expect: 4.0, tol: 0.06, why: 'plain hex ink on plain hex ground' },
    { id: 'c2', field: 'median', expect: 3.95, tol: 0.08, why: 'ink alpha composited on the ground' },
    { id: 'c3', field: 'median', expect: 3.95, tol: 0.08, why: 'ancestor opacity composited' },
    { id: 'c4', field: 'median', expect: 21.0, tol: 0.3, why: 'ink authored in oklab — the regex case' },
    { id: 'c5', field: 'median', expect: 21.0, tol: 0.3, why: 'ground authored in oklab — the silent-white case' },
    { id: 'c6', field: 'min', expect: 1.0, tol: 0.06, why: 'gradient: the unreadable end is found' },
    { id: 'c6', field: 'max', expect: 21.0, tol: 0.3, why: 'gradient: the readable end is found' },
    { id: 'c7', field: 'median', expect: 4.48, tol: 0.08, why: 'color-mix ink, the canonical 4.48 near-miss' },
    { id: 'c8', field: 'median', expect: 1.0, tol: 0.03, why: 'white on white is 1:1, not a pass' },
    { id: 'c9::placeholder', field: 'median', expect: 4.48, tol: 0.08, why: 'placeholder ink, which has no text node at all' },
  ];

  const checks = cases.map((c) => {
    const row = by(c.id);
    const got = row ? row[c.field] : null;
    return {
      case: `${c.id}.${c.field}`,
      why: c.why,
      expected: c.expect,
      got,
      ok: got !== null && got !== undefined && Math.abs(got - c.expect) <= c.tol,
    };
  });

  // The `c8` row must also be a *failure*, not merely a low number.
  const c8 = by('c8');
  checks.push({
    case: 'c8.verdict',
    why: 'a 1:1 string is reported as a failure',
    expected: 'fail',
    got: c8?.verdict ?? null,
    ok: c8?.verdict === 'fail',
  });
  // And nothing may be silently dropped.
  checks.push({
    case: 'coverage',
    why: 'all nine constructed strings were scored, none skipped',
    expected: 9,
    got: rows.length,
    ok: rows.length === 9,
  });

  return { ok: checks.every((c) => c.ok), checks, summaryFromMeasure: result.scored };
}
