/**
 * **Compile the real `globals.css` for a set of class names, and say what came out.**
 *
 * The token layer has exactly one failure mode and it is silent: a `@theme` key that is missing,
 * misspelled or in the wrong namespace does not error — Tailwind simply never generates the
 * utility, the class does nothing, and the element renders unstyled in a way that looks like a
 * design choice. `--radius-md` is the measured case (`facelift-plan.md` §1, finding 5): referenced
 * four times in `components/ui/button.tsx`, never defined, and four button sizes quietly rounding
 * at the wrong radius for as long as the file had existed.
 *
 * `globals.css`'s own header records the sequel, which is the same bug one level subtler:
 * `--duration-base` in `@theme` registers cleanly, errors nowhere, and generates **no
 * `duration-base` class at all**, because Tailwind's `duration` utility resolves against
 * `--transition-duration`. A key that looks right, a stylesheet that compiles, and no utility.
 *
 * So nothing here reads the CSS as text and looks for strings. **It runs Tailwind** — the same
 * 4.3.3 `compile()` the PostCSS plugin calls — over the real stylesheet, and lets the caller ask
 * what the compiler actually emitted. A check that greps for `--shadow-sheet` passes just as
 * happily on `--shadows-sheet`.
 *
 * ## Why this file exists, and the duplication it does not yet remove
 *
 * **`resolveStylesheet` and the `compile()` wrapper are copy-pasted into four committed tests** —
 * `tests/unit/ui/pointer-affordance.test.ts`, `tests/unit/ui/motion-scale.test.ts`,
 * `tests/unit/design-system/design-tokens.test.ts` and
 * `tests/unit/design-system/chrome-tokens.test.ts`. Measured 2026-08-31: normalised for
 * whitespace, three of the four hash identically and the fourth differs only in line wrapping and
 * one comment. This module is a fifth copy's worth of code written once instead, and **the four
 * have not been converted to import it** — that is a known follow-up with its own commit, deferred
 * deliberately rather than smuggled into the end of a run.
 *
 * The duplication is worth removing for a concrete reason rather than an aesthetic one: the helper
 * exists because **`tw-animate-css` publishes its stylesheet under the `style` export condition**
 * and node's own resolver refuses it outright (`ERR_PACKAGE_PATH_NOT_EXPORTED`, because there is no
 * `default`). The day that package moves its CSS, five files need the identical edit and nothing
 * connects them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The stylesheet every utility in this product is generated from. */
export const GLOBALS = join(REPO_DIR, 'src/app/globals.css');

/**
 * `@import` resolution, which the PostCSS plugin normally does for us.
 *
 * The manifest is read directly rather than resolved through node, for the reason in this file's
 * header — and it fails loudly on a package that moves its CSS rather than silently compiling a
 * stylesheet with a missing import, which would produce exactly the "generated nothing" result
 * this module exists to detect and blame it on the class name.
 */
function resolveStylesheet(id, base) {
  if (id.startsWith('.')) return resolve(base, id);
  const parts = id.split('/');
  const pkg = id.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const subpath = id.length > pkg.length ? `.${id.slice(pkg.length)}` : '.';
  const dir = join(REPO_DIR, 'node_modules', pkg);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  // `tailwindcss` itself resolves to the package root, whose `.` export is JavaScript.
  const entry = pkg === 'tailwindcss' && subpath === '.' ? './index.css' : manifest.exports?.[subpath];
  const file = typeof entry === 'string' ? entry : (entry?.style ?? entry?.default);
  if (!file) throw new Error(`no stylesheet export for ${id}`);
  return join(dir, file);
}

/** Compile `globals.css` for exactly `candidates`, and return the emitted CSS. */
export async function compileFor(candidates, stylesheet = GLOBALS) {
  const compiler = await compile(readFileSync(stylesheet, 'utf8'), {
    base: dirname(stylesheet),
    loadStylesheet: async (id, base) => {
      const file = resolveStylesheet(id, base);
      return { path: file, base: dirname(file), content: readFileSync(file, 'utf8') };
    },
    loadModule: async () => {
      throw new Error('globals.css should not load a JS plugin');
    },
  });
  return compiler.build([...candidates]);
}

/**
 * The declaration block Tailwind generated for one class, whitespace collapsed — or `null` if it
 * generated nothing at all, which is the answer this module is for.
 *
 * **The escaping is the whole of this function and its first version was wrong**, in a way worth
 * recording because the failure looks exactly like the one being tested for. A variant's colon is
 * emitted into the selector as a **backslash-escaped** `\:`, so a regex built by escaping `:` to
 * `:` matches nothing — and `motion-safe:animate-in` and `starting:opacity-0` were both reported
 * `MISS` when both compile perfectly well. Two false negatives, one of which would have "confirmed"
 * `facelift-plan.md` §3a item 6's open question about whether the `starting` variant exists in the
 * installed version. A tool that reports "this class generates nothing" has to be more careful than
 * the thing it is checking, because its output is indistinguishable from the real defect.
 */
export function ruleFor(css, className) {
  const selector = className
    .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    .replace(/:/g, '\\\\:');
  const match = new RegExp(String.raw`\.${selector}(?![\w-])[^{]*\{([^}]*)\}`).exec(css);
  return match?.[1] === undefined ? null : match[1].replace(/\s+/g, ' ').trim();
}
