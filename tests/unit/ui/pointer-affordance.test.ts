/**
 * **Every interactive element offers the cursor it has earned, and the affordance is in one place.**
 *
 * ## The bug this exists to keep fixed
 *
 * Tailwind v3 shipped `cursor: pointer` on `<button>` in preflight. **v4 removed it**, on the
 * grounds that the CSS spec's default for a button is `cursor: default`. This codebase is on
 * 4.3.3, so every `<button>` in the product was showing an arrow where a hand belongs. Measured in
 * a browser at commit `9a95444`, seven routes x two themes x two gate viewports: **216 of 260
 * `<button>` samples computed `cursor: default`**, which deduplicates to **53 distinct elements** —
 * against 21 that were right because their author had remembered to write `cursor-pointer` at the
 * call site. Anchors were never affected (112 samples, all `pointer`, from the UA stylesheet).
 *
 * A regression here is silent in every other test in this repository: it changes no markup, no
 * string, no colour and no layout. It changes what the product feels like, and only in a browser.
 * So the assertions below are on the **compiled stylesheet** rather than on a class list — the
 * question is what the cascade produces, which is the question the class list cannot answer.
 *
 * ## Why the rules are in `@layer base` and this file asserts that specifically
 *
 * There are 60 raw `<button>` elements across 24 files against 81 `<Button>` call sites, and the
 * raw ones are the FAB, the nav tabs, the sheet handle and the map controls. A fix on the primitive
 * covers 57% of the product and leaves the rest to be remembered one author at a time. A fix in
 * `base` covers the *element* — and `base` loses to every utility, so `cursor-default`,
 * `cursor-grab` and `disabled:cursor-default` still win at a call site that means them. That
 * layering is the design, so it is asserted rather than assumed.
 *
 * ## The stylesheet resolver below is duplicated from `design-system/design-tokens.test.ts`
 *
 * Deliberately, and it is fifteen lines. That file does not export it, it is owned by a different
 * lane, and importing across two suites to save a helper couples them for nothing. If the import
 * shape of `globals.css` changes both files fail loudly on the same line, which is the behaviour
 * that matters.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import { ChromeStage } from '@/components/brand/chrome-stage';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GLOBALS = path.join(ROOT, 'src/app/globals.css');

function resolveStylesheet(id: string, base: string): string {
  if (id.startsWith('.')) return path.resolve(base, id);
  const parts = id.split('/');
  const pkg = id.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? id);
  const subpath = id.length > pkg.length ? `.${id.slice(pkg.length)}` : '.';
  const dir = path.join(ROOT, 'node_modules', pkg);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  const entry = pkg === 'tailwindcss' && subpath === '.' ? './index.css' : manifest.exports?.[subpath];
  const file = typeof entry === 'string' ? entry : (entry?.style ?? entry?.default);
  if (!file) throw new Error(`no stylesheet export for ${id}`);
  return path.join(dir, file);
}

async function build(candidates: readonly string[]): Promise<string> {
  const compiler = await compile(readFileSync(GLOBALS, 'utf8'), {
    base: path.dirname(GLOBALS),
    loadStylesheet: async (id: string, base: string) => {
      const file = resolveStylesheet(id, base);
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') };
    },
    loadModule: async () => {
      throw new Error('globals.css should not load a JS plugin');
    },
  });
  return compiler.build([...candidates]);
}

/**
 * **The `@layer base` block `globals.css` itself authors**, whitespace collapsed.
 *
 * The compiled sheet contains *two*: Tailwind's preflight comes first and this one comes last, and
 * naively slicing from the first `@layer base` to the next section swallows preflight and the whole
 * `:root` — which is how a first draft of this file "passed" an assertion about `!important` that
 * was really reading `[hidden] { display: none !important }`.
 *
 * Order in the file is not what decides the cascade here, and that is worth stating because it
 * looks wrong: Tailwind emits this block *after* `@layer utilities`, yet base still loses to every
 * utility. Cascade layers are ordered by **first declaration**, and preflight declares `base`
 * before `utilities` exists. That is the whole mechanism the fix rests on, so the test below
 * asserts the rules are inside a `base` block rather than asserting anything about position.
 */
function baseLayer(css: string): string {
  const marker = '@layer base';
  const start = css.lastIndexOf(marker);
  expect(start, 'globals.css emits no @layer base').toBeGreaterThan(-1);
  let depth = 0;
  let i = css.indexOf('{', start);
  const open = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(open, i + 1).replace(/\s+/g, ' ');
}

let css = '';
let base = '';

beforeAll(async () => {
  css = await build([
    'shadow-cta-halo',
    'hover:shadow-cta-halo',
    'cursor-default',
    'group-focus-within/field:text-foreground',
    'group-hover/switch:underline',
  ]);
  base = baseLayer(css);
});

describe('the pointer cursor, restored in the token layer', () => {
  it('gives a bare <button> a pointer, in base', () => {
    // The whole bug, in one assertion: `preflight.css` in the installed Tailwind contains the
    // string `cursor` exactly once, in a comment about Safari's spin buttons. Nothing else in the
    // pipeline puts a hand on a button.
    expect(base).toMatch(/(^|[ ,])button[ ,][^{]*\{ cursor: pointer;/);
  });

  it('covers the controls a button is not: role, summary, select, and the four input types', () => {
    const rule = base.match(/[^{}]*\{ cursor: pointer; \}/)?.[0] ?? '';
    expect(rule).toContain("[role='button']");
    expect(rule).toContain('summary');
    expect(rule).toContain('select');
    for (const type of ['checkbox', 'radio', 'submit', 'button', 'reset']) {
      expect(rule, type).toContain(`[type='${type}']`);
    }
  });

  it('gives a checkbox label a pointer and a text-field label none', () => {
    // Clicking a checkbox's label toggles a control, so the label is a button-shaped thing. A label
    // over a text field only moves focus into it, and a text cursor already promises that. The
    // `> input` child combinator is what tells the two apart, so it is asserted rather than the
    // looser descendant form somebody will reach for next.
    const rule = base.match(/[^{}]*\{ cursor: pointer; \}/)?.[0] ?? '';
    expect(rule).toMatch(/label:has\(> input:where\(\[type='checkbox'\], \[type='radio'\]\)\)/);
  });

  it('takes the promise back off an inactive control', () => {
    expect(base).toMatch(/button:disabled[^{]*\{ cursor: default;/);
    expect(base).toMatch(/\[aria-disabled='true'\][^{]*\{ cursor: default;/);
  });

  it("gives the sheet's drag handle grab and grabbing, not pointer", () => {
    // The one element in the product that carries a React click handler without being a button or
    // an anchor (measured at 9a95444, where it computed `cursor: auto`). It is a *drag* affordance
    // first, so a hand-with-a-finger over it would promise the wrong gesture. `data-vaul-handle` is
    // vaul's own attribute, so this reaches both sheets without either file knowing.
    expect(base).toMatch(/\[data-vaul-handle\][^{]*\{ cursor: grab;/);
    expect(base).toMatch(/\[data-vaul-handle\]:active[^{]*\{ cursor: grabbing;/);
  });

  it('stays a floor rather than a ceiling: a call site can still override it', () => {
    /*
     * The `base` layer losing to `utilities` is the entire design of the fix — it is what lets
     * `cursor-grab` on the map, `disabled:cursor-default` in `candidate-card.tsx` and the fields'
     * `disabled:cursor-not-allowed` keep working with no `!important` anywhere. Two ways to break
     * it, both silent everywhere else in this repository: move the rules out of `base`, or make
     * them important.
     *
     * `cursor-default` is compiled as a candidate above precisely so this can check a real utility
     * rather than a hypothetical one.
     */
    expect(css).toContain('.cursor-default');
    for (const rule of base.split('}')) {
      if (rule.includes('cursor:')) expect(rule, rule.trim()).not.toContain('!important');
    }
  });
});

describe('the primary CTA answers a pointer with light', () => {
  it('registers shadow-cta-halo as a utility rather than leaving a bracket to the call site', () => {
    expect(css).toContain('.hover\\:shadow-cta-halo:hover');
  });

  it('restates the resting elevation inside the halo, because box-shadow is not additive', () => {
    // A hover naming only the glow would *replace* `shadow-raised` and flatten the control at the
    // moment it is being reached for. The two are one value because they are one appearance.
    const decl = css.match(/--shadow-cta-halo:\s*var\(--shadow-raised\),[^;]*;/);
    expect(decl, 'the token must open with var(--shadow-raised)').not.toBeNull();
    expect(decl?.[0]).toContain('var(--brand)');
  });

  it('takes its pigment from --brand, which inverts by theme on its own', () => {
    // `--mint-700` on paper and `--mint-400` at night. A second literal under `.dark` would be a
    // copy that can drift; there is deliberately none, so this asserts there is none.
    const dark = css.slice(css.indexOf('.dark'));
    expect(dark).not.toContain('--shadow-cta-halo:');
  });
});

describe('the entrance gains a closing beat, and the mark gains a breath', () => {
  it('sweeps the lit edge exactly once', () => {
    expect(css).toContain('@keyframes chrome-edge-sweep');
    const rule = css.match(/\[data-chrome-motion='edge-sweep'\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('animation-name: chrome-edge-sweep');
    expect(rule).toContain('animation-iteration-count: 1');
  });

  it('breathes the mark halo on opacity alone, never on scale', () => {
    // The halo's box was cut back to match the lockup's gap precisely so it stops where the
    // wordmark begins. A `scale` here would grow it back over the ink and rebuild a measured
    // defect, so the keyframes are asserted to contain nothing but opacity.
    const frames = css.match(/@keyframes chrome-mark-breathe\s*\{[^@]*?\n\}/)?.[0] ?? '';
    expect(frames).toContain('opacity');
    expect(frames).not.toContain('transform');
    expect(frames).not.toContain('scale');
  });

  it('collapses both correctly under prefers-reduced-motion', () => {
    // Neither collapses to the generic fade, and each for its own reason. The spark ends at
    // `opacity: 0`, so the generic collapse — which ends at 1 — would park a bright blob in the
    // middle of the card's top edge for the rest of the session. The halo is a loop, and a loop
    // collapsed to an opacity change is the continuous pulse the motion rules ban outright.
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\[data-chrome-motion='edge-sweep'\]\s*\{\s*animation: none;\s*display: none;/);
    expect(reduced).toMatch(/\[data-chrome-motion='mark-breathe'\]\s*\{\s*animation: none;/);
  });

  it('puts both hooks in the rendered card, so the rules have something to target', () => {
    // A `@keyframes` with no element carrying its `data-entrance` is dead CSS that reads like a
    // working animation — the exact failure the mascot rig had before `globals.css` grew its other
    // end. `environment: 'node'`, so this is `react-dom/server` markup and evidence about which
    // attributes are emitted and nothing else.
    const markup = renderToStaticMarkup(
      createElement(ChromeStage, { editorial: null, form: null }),
    );
    expect(markup).toContain('data-chrome-motion="edge-sweep"');
    expect(markup).toContain('data-chrome-motion="mark-breathe"');

    /*
     * And neither is a `data-entrance`, which is a contract rather than a naming preference.
     * `[data-entrance]` means *a staggered beat of the arrival that ends fully opaque*; the shared
     * rule gives every one of them `animation-fill-mode: both` and the reduced-motion block
     * collapses the lot to one fade on that basis. These two override every property of that rule
     * and opt out of the collapse — one ends at `opacity: 0` by design and the other never ends.
     * Filed under `data-entrance` they made `verify-i2.mjs`'s reduced-motion probe report an
     * `invisibleAtRest` element on `/` and `/sign-in`, which is that gate's name for the blank
     * front door. Nothing was broken and the gate could no longer say so.
     */
    expect(markup).not.toContain('data-entrance="edge-spark"');
    expect(markup).not.toContain('data-entrance="mark-halo"');
  });
});
