#!/usr/bin/env node
/**
 * Known-answer check on the **inactive-state predicate** that `audit-a11y.mjs` and
 * `contrast-render.mjs` use to decide which text WCAG 1.4.3 exempts from contrast scoring.
 *
 * Why this exists as its own runner: the predicate is the one place where those two instruments
 * can *silently stop measuring something*. Everything they exempt is text nobody scored, and an
 * exemption that is too wide is invisible in the report — `exemptInactive` goes up by one and no
 * failure is ever printed. Both harnesses cost minutes (they export a commit and build the app),
 * so the predicate had no fast test of its own. It does now: this launches one Chromium, builds a
 * fixture page containing every shape the product's components actually render, and asks for the
 * answers.
 *
 * It reads the predicate **out of the two harness files** rather than re-declaring it, so a drift
 * between the copies is a failure here, and so the thing under test is the shipped code.
 *
 *   node tests/harness/inactive-state-check.mjs
 *
 * Exit 0 = every case matched. Exit 1 = a case is wrong, or the two copies have drifted.
 */

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The predicate as it was written before this check existed — kept so the cases can show which
 *  answers actually changed, and which were already right. Attribute-only, via `closest()`. */
const OLD = `(el) => el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]') !== null`;

/** Pull `const isInactive = …;` out of a harness file, between its marker comments. */
function extractPredicate(file) {
  const src = readFileSync(resolve(HERE, file), 'utf8');
  const block = src.match(/--8<-- inactive-state[\s\S]*?--8<-- end inactive-state --8<-- \*\//);
  if (!block) throw new Error(`${file}: no inactive-state block`);
  const start = block[0].indexOf('const isInactive =');
  const end = block[0].lastIndexOf('};');
  if (start < 0 || end < start) throw new Error(`${file}: no isInactive arrow function in the block`);
  return block[0].slice(start + 'const isInactive ='.length, end + 2).trim();
}

/**
 * The fixture. Every row is a shape this product renders, or a shape a browser can reach and the
 * predicate must not get wrong.
 *
 * `menuitem-property` is the case that motivated the change. Base UI's `useButton` writes
 * `element.disabled` **directly on the DOM node** for composite items (`internals/use-button/
 * useButton.mjs`) and `Menu.Item` renders a `<div>` by default, so the disabled state can live on
 * a property that no attribute reflects — a `<div>` has no `disabled` content attribute and does
 * not match `:disabled`. An attribute selector reads nothing there.
 */
const FIXTURE = `<!doctype html><meta charset="utf-8"><body>
  <button id="native-attr" disabled>Add</button>
  <button id="native-prop">Save</button>
  <div id="menu" role="menu">
    <div id="menuitem-aria" role="menuitem" aria-disabled="true" tabindex="0">Delete list</div>
    <div id="menuitem-property" role="menuitem" tabindex="0">Leave collection</div>
    <div id="menuitem-live" role="menuitem" tabindex="0">Rename</div>
  </div>
  <div id="row" aria-disabled="true"><span id="row-child">Already saved</span></div>
  <button id="enabled">Add →</button>
  <button id="aria-false" aria-disabled="false">Share</button>
  <input id="field" placeholder="Paste a TikTok link" disabled>
  <fieldset id="fs" disabled><button id="in-fieldset">Submit</button></fieldset>
  <select id="sel" disabled><option id="opt">Cafe</option></select>
</body>`;

/** id → is this text part of an inactive component? Answers by hand. */
const EXPECTED = {
  'native-attr': true,
  'native-prop': true,
  'menuitem-aria': true,
  'menuitem-property': true,
  'menuitem-live': false,
  'row-child': true,
  enabled: false,
  'aria-false': false,
  field: true,
  'in-fieldset': true,
  opt: true,
};

async function main() {
  const fromContrast = extractPredicate('contrast-render.mjs');
  const fromAudit = extractPredicate('audit-a11y.mjs');

  if (fromContrast !== fromAudit) {
    console.error('DRIFT: the two harnesses no longer share one inactive-state predicate.');
    console.error('--- contrast-render.mjs ---\n' + fromContrast);
    console.error('--- audit-a11y.mjs ---\n' + fromAudit);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(FIXTURE, { waitUntil: 'load' });

  const rows = await page.evaluate(
    ({ newSrc, oldSrc, ids }) => {
      // The two states a *property* carries with no attribute behind it: a native control disabled
      // after render, and a composite item whose framework wrote the property onto a plain element.
      document.getElementById('native-prop').disabled = true;
      document.getElementById('menuitem-property').disabled = true;

      const isNew = eval(newSrc);
      const isOld = eval(oldSrc);
      return ids.map((id) => {
        const el = document.getElementById(id);
        return {
          id,
          attribute: el.hasAttribute('disabled'),
          property: el.disabled === true,
          aria: el.getAttribute('aria-disabled'),
          old: isOld(el),
          now: isNew(el),
        };
      });
    },
    { newSrc: fromContrast, oldSrc: OLD, ids: Object.keys(EXPECTED) },
  );

  await browser.close();

  let bad = 0;
  let changed = 0;
  const table = rows.map((r) => {
    const want = EXPECTED[r.id];
    const ok = r.now === want;
    if (!ok) bad += 1;
    if (r.old !== r.now) changed += 1;
    return {
      case: r.id,
      attr: r.attribute,
      prop: r.property,
      aria: r.aria ?? '—',
      expected: want,
      old: r.old,
      now: r.now,
      verdict: ok ? (r.old === want ? 'ok' : 'FIXED') : 'WRONG',
    };
  });

  console.table(table);
  console.log(
    `${rows.length} cases · ${bad} wrong · ${changed} answer(s) changed by the property/ARIA read`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

await main();
