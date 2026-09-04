#!/usr/bin/env node
/**
 * **Does this class actually generate a rule? Ask before you write it, not after.**
 *
 * ## What this is for, and why the four tests do not already cover it
 *
 * `design-tokens.test.ts`, `chrome-tokens.test.ts`, `motion-scale.test.ts` and
 * `pointer-affordance.test.ts` all compile the real `globals.css` and assert that named utilities
 * come out with the values they should. They guard **what already exists** — a class that is
 * written, used and asserted.
 *
 * This answers the same question for a class that does **not exist yet**, which is where the time
 * is actually lost. The sequence that costs an hour is: register a token, write the class, build,
 * look at the screen, see nothing, and start debugging the component. Tailwind does not error on a
 * missing `@theme` key; it emits no rule, the class is inert, and the element renders unstyled in a
 * way that looks like a design choice rather than a failure.
 *
 * This project has paid that hour at least twice. `globals.css`'s own header records the second:
 * `--duration-base` in `@theme` registers cleanly, errors nowhere, and generates **no
 * `duration-base` class**, because the `duration` utility resolves against `--transition-duration`.
 * One `node` invocation would have said so.
 *
 * It also answers questions about the *installed* Tailwind that documentation cannot, because the
 * answer depends on the version in `node_modules`. `facelift-plan.md` §3a item 6 says of the
 * `starting` variant *"confirm against the installed 4.3.3 before relying on it"* — this is that
 * confirmation, and it takes one line.
 *
 * ## Usage
 *
 *   node tests/harness/compile-probe.mjs duration-base motion-safe:animate-in starting:opacity-0
 *   node tests/harness/compile-probe.mjs --raw duration-screen        # dump the whole stylesheet
 *   node tests/harness/compile-probe.mjs --stylesheet path/to.css bg-brand
 *
 * Prints `OK <the declarations Tailwind emitted>` or `MISS` per candidate, and **exits non-zero if
 * anything missed**, so it composes into a shell check rather than only into a pair of eyes.
 *
 * A `MISS` means "the compiler emitted no rule for this selector". It does not mean the class is
 * wrong in every case — an arbitrary variant or a `@media`-only utility can be legitimate and still
 * not match here — so read the CSS with `--raw` before concluding, which is exactly what
 * `ruleFor`'s own docblock warns about after its first version reported two false negatives.
 */

import { compileFor, GLOBALS, ruleFor } from './tailwind-compile.mjs';

const argv = process.argv.slice(2);
const raw = argv.includes('--raw');
const sheetAt = argv.indexOf('--stylesheet');
const stylesheet = sheetAt === -1 ? GLOBALS : argv[sheetAt + 1];
// `sheetAt + 1` is only the stylesheet path when the flag is actually present. Guarding on
// `sheetAt !== -1` is load-bearing: without it the sentinel makes the skipped index `0`, and the
// probe silently drops its **first** candidate — which it did, on its first run, swallowing the
// `duration-base` this file's own header uses as the worked example. A tool whose failure mode is
// "quietly answers a smaller question than you asked" is the exact thing it exists to catch.
const stylesheetArg = sheetAt === -1 ? -1 : sheetAt + 1;
const candidates = argv.filter(
  (arg, index) => !arg.startsWith('--') && index !== stylesheetArg,
);

if (candidates.length === 0) {
  console.error(
    'usage: node tests/harness/compile-probe.mjs [--raw] [--stylesheet <css>] <class> [<class>…]',
  );
  process.exit(2);
}

const css = await compileFor(candidates, stylesheet);

if (raw) {
  console.log(css);
  process.exit(0);
}

let missed = 0;
for (const candidate of candidates) {
  const rule = ruleFor(css, candidate);
  if (rule === null) missed += 1;
  console.log(`${rule === null ? 'MISS' : 'OK  '} ${candidate}${rule === null ? '' : `  ${rule}`}`);
}

if (missed > 0) console.error(`\n${missed} of ${candidates.length} generated no rule.`);
process.exit(missed > 0 ? 1 : 0);
