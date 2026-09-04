/**
 * **The token layer, compiled.**
 *
 * `globals.css` is the whole of the design system's registration surface, and the failure mode it
 * has is silent: a `@theme` key that is missing, misspelled or in the wrong namespace does not
 * error — Tailwind simply never generates the utility, the class does nothing, and the element
 * renders unstyled in a way that looks like a design choice. `--radius-md` is the measured case
 * (`facelift-plan.md` §1, finding 5): referenced four times in `components/ui/button.tsx`, never
 * defined, `min(var(--radius-md), 10px)` therefore invalid, the declaration dropped, and four
 * button sizes quietly rounding at 16px instead of 10 and 12 for as long as the file has existed.
 *
 * So this does not read the CSS as text and look for the strings. **It runs Tailwind** — the same
 * 4.3.3 `compile()` the PostCSS plugin calls — over the real `globals.css` and asserts that the
 * named utilities come out the other side with the values they are supposed to carry. A test that
 * only grepped for `--shadow-sheet` would have passed just as happily on `--shadows-sheet`.
 *
 * `environment: 'node'` (see `vitest.config.ts`), so there is no DOM and nothing renders here.
 * That the four button sizes *look* right is a browser at 390x844, and that evidence lives with
 * the task.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GLOBALS = path.join(ROOT, 'src/app/globals.css');

/**
 * `@import` resolution, which the PostCSS plugin normally does for us.
 *
 * `tw-animate-css` publishes its stylesheet under the `style` export condition and `shadcn`
 * under a plain subpath, and node's own resolver refuses the first outright
 * (`ERR_PACKAGE_PATH_NOT_EXPORTED`, because there is no `default`). So the manifest is read
 * directly rather than resolved — three lines, and it fails loudly on a package that moves its
 * CSS rather than silently compiling a stylesheet with a missing import.
 */
function resolveStylesheet(id: string, base: string): string {
  if (id.startsWith('.')) return path.resolve(base, id);
  const parts = id.split('/');
  const pkg = id.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? id);
  const subpath = id.length > pkg.length ? `.${id.slice(pkg.length)}` : '.';
  const dir = path.join(ROOT, 'node_modules', pkg);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  // `tailwindcss` itself resolves to the package root, whose `.` export is JavaScript.
  const entry = pkg === 'tailwindcss' && subpath === '.' ? './index.css' : manifest.exports?.[subpath];
  const file = typeof entry === 'string' ? entry : (entry?.style ?? entry?.default);
  if (!file) throw new Error(`no stylesheet export for ${id}`);
  return path.join(dir, file);
}

/** Compile `globals.css` for exactly the class names given, and return the CSS. */
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

/** The declaration block Tailwind generated for one class, whitespace collapsed. */
function rule(css: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const match = new RegExp(String.raw`\.${escaped}\s*\{([^}]*)\}`).exec(css);
  if (match?.[1] === undefined) throw new Error(`no rule generated for .${className}`);
  return match[1].replace(/\s+/g, ' ').trim();
}

/** The `:root` half of the file, where every token's actual value lives. */
function rootDeclarations(): Map<string, string> {
  const source = readFileSync(GLOBALS, 'utf8');
  const block = /^:root \{([\s\S]*?)^\}/m.exec(source);
  if (block?.[1] === undefined) throw new Error('no :root block in globals.css');
  const withoutComments = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Map<string, string>();
  for (const line of withoutComments.split('\n')) {
    const declaration = /^\s*(--[a-z0-9-]+)\s*:\s*(.+);\s*$/i.exec(line);
    if (declaration?.[1] !== undefined && declaration[2] !== undefined) {
      declarations.set(declaration[1], declaration[2].trim());
    }
  }
  return declarations;
}

/** The `.dark` block, read the same way `rootDeclarations` reads `:root`. A composition token that
 *  is declared once is a token that only has one theme's answer, which is the whole defect. */
function darkDeclarations(): Map<string, string> {
  const source = readFileSync(GLOBALS, 'utf8');
  const block = /^\.dark \{([\s\S]*?)^\}/m.exec(source);
  if (block?.[1] === undefined) throw new Error('no .dark block in globals.css');
  const withoutComments = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Map<string, string>();
  for (const line of withoutComments.split('\n')) {
    const declaration = /^\s*(--[a-z0-9-]+)\s*:\s*(.+);\s*$/i.exec(line);
    if (declaration?.[1] !== undefined && declaration[2] !== undefined) {
      declarations.set(declaration[1], declaration[2].trim());
    }
  }
  return declarations;
}

describe('globals.css registers the scales Tailwind generates utilities from', () => {
  it('defines --radius-md, the token four button sizes reference and nothing declared', () => {
    // The bug this file exists for. `button.tsx` writes `min(var(--radius-md), 10px)` and
    // `min(var(--radius-md), 12px)`; with the token undefined both are invalid values.
    const radius = rootDeclarations().get('--radius-md');
    expect(radius).toBeDefined();
    // Above both `min()` caps, so the cap is what decides the corner — and inside the ramp.
    expect(radius).toBe('0.875rem');
  });

  it('generates the named utilities the run mandates in place of arbitrary values', async () => {
    // `facelift-plan.md` §3a: these three names are what `shadow-[var(--shadow-elevated)]`,
    // `duration-[220ms]` and a bracketed cubic-bezier collapse onto.
    const css = await build(['shadow-sheet', 'duration-base', 'ease-emphasised']);
    expect(rule(css, 'shadow-sheet')).toContain('var(--shadow-sheet)');
    expect(rule(css, 'duration-base')).toContain('var(--duration-base)');
    expect(rule(css, 'ease-emphasised')).toContain('var(--ease-emphasised)');
  });

  it('covers the closed list of nine micro-animations, by name and not by number', async () => {
    // `facelift-plan.md` §3a. A duration that is not on this list does not get a utility, which
    // is the only thing keeping the list closed.
    const timings: Record<string, string> = {
      'duration-press': '90ms',
      'duration-enter': '140ms',
      'duration-couple': '160ms',
      'duration-settle': '180ms',
      'duration-stagger-row': '40ms',
      'duration-cross': '200ms',
      'duration-base': '220ms',
      'duration-tick': '400ms',
      'duration-flight': '900ms',
      'duration-stagger-pin': '60ms',
    };
    const css = await build(Object.keys(timings));
    const root = rootDeclarations();
    for (const [utility, value] of Object.entries(timings)) {
      expect(rule(css, utility), utility).toContain(`var(--${utility})`);
      expect(root.get(`--${utility}`), utility).toBe(value);
    }
  });

  it('generates the elevation, easing and type scales', async () => {
    const utilities = [
      'shadow-raised', 'shadow-sheet', 'shadow-overlay',
      'ease-standard', 'ease-emphasised', 'ease-exit',
      'text-micro', 'text-caption', 'text-reading', 'text-display', 'text-hero',
    ];
    const css = await build(utilities);
    for (const utility of utilities) expect(() => rule(css, utility), utility).not.toThrow();
    // The type scale carries its line height with it, or a 34px heading arrives at 1.5.
    expect(rule(css, 'text-display')).toContain('var(--leading-display)');
  });

  it('keeps Tailwind’s own ramps rather than replacing them', async () => {
    // Adding a key to a namespace extends it; only `--text-*: initial` would clear it. If that
    // ever inverts, several hundred `text-sm` call sites stop rendering with no error anywhere.
    const css = await build(['text-sm', 'text-base', 'text-2xl', 'shadow-sm', 'rounded-lg']);
    for (const utility of ['text-sm', 'text-base', 'text-2xl', 'shadow-sm', 'rounded-lg']) {
      expect(() => rule(css, utility), utility).not.toThrow();
    }
  });

  it('gives every :root role a utility, so no component has to reach for var()', async () => {
    // W0-3 collapses 75 raw `var(--mint-N)` call sites onto these. A role with no registered
    // utility is what forces `bg-[var(--tag)]` back into a component.
    const roles = [
      'bg-brand', 'text-brand', 'border-brand', 'text-brand-foreground', 'bg-brand-tint',
      'bg-card-2', 'text-ink-on-mint',
      'bg-tag', 'text-tag-foreground', 'bg-tag-selected', 'text-tag-selected-foreground',
      'bg-pin', 'bg-pin-selected', 'bg-pin-halo',
      'bg-success', 'text-success-foreground', 'bg-warning', 'text-warning-foreground',
      'bg-info', 'text-info-foreground',
    ];
    const css = await build(roles);
    for (const utility of roles) expect(() => rule(css, utility), utility).not.toThrow();
  });

  it('gives the two translucent surfaces a utility, in the namespace that generates one', async () => {
    /*
     * `--radius-md`'s failure mode, applied to composition. `backdrop-blur` resolves against
     * **`--blur-*`**, not `--backdrop-blur-*`: the natural-looking key would register with no
     * error, generate no class, and leave the panel unblurred in a way that reads as a design
     * choice. So this compiles the classes the two panels actually write.
     */
    const css = await build(['bg-panel', 'bg-scrim', 'backdrop-blur-panel']);
    expect(rule(css, 'bg-panel')).toContain('var(--panel)');
    expect(rule(css, 'bg-scrim')).toContain('var(--scrim)');
    expect(rule(css, 'backdrop-blur-panel')).toContain('var(--panel-blur)');
  });

  it('answers every composition token in both themes', () => {
    /*
     * The point of a composition token is that it has *two* values. `bg-white/55` had one, and the
     * one it had put the sign-in panel at 1.18:1 in dark. A `--panel` declared only in `:root` is
     * the same bug with a better name, and it would pass every other assertion in this file.
     *
     * `--panel-blur` is the deliberate exception and is asserted as one: a blur radius is a
     * geometry, and 10px is 10px in either theme. Stating that here is what stops someone adding a
     * dark value "for symmetry" and someone else later reading its absence as an oversight.
     */
    const root = rootDeclarations();
    const dark = darkDeclarations();
    for (const token of ['--panel', '--scrim', '--tint-strength', '--panel-blur']) {
      expect(root.get(token), `${token} in :root`).toBeDefined();
    }
    for (const token of ['--panel', '--scrim', '--tint-strength']) {
      expect(dark.get(token), `${token} in .dark`).toBeDefined();
      expect(dark.get(token), `${token} is the same in both themes`).not.toBe(root.get(token));
    }
    expect(dark.get('--panel-blur'), '--panel-blur is a geometry, not a colour').toBeUndefined();
  });

  it('does not paint success in the brand colour', () => {
    // The whole point of adding state colours. `--mint-400` is `--primary`; if success ever
    // equals it, "this worked" and "this is the product" are the same colour again.
    const root = rootDeclarations();
    expect(root.get('--success')).toBe('#2B7A4B');
    expect(root.get('--success')).not.toBe(root.get('--mint-400'));
    expect(root.get('--success')).not.toBe(root.get('--mint-700'));
    for (const role of ['--warning', '--info']) {
      expect(root.get(role), role).toBeDefined();
      expect(root.get(role), role).not.toBe(root.get('--mint-700'));
    }
  });

  it('leaves --shadow-elevated meaning exactly what it meant', () => {
    // Eleven call sites still write `shadow-[var(--shadow-elevated)]`; the collapse onto
    // `shadow-sheet` has to be a rename, so the two names must resolve to one value.
    const root = rootDeclarations();
    expect(root.get('--shadow-elevated')).toBe('var(--shadow-sheet)');
    expect(root.get('--shadow-sheet')).toBe('0 14px 28px -18px rgba(0, 0, 0, 0.18)');
  });

  it('parses under PostCSS, which is the parser that actually loads it', () => {
    /*
     * Tailwind's own `compile()` and Turbopack's PostCSS pipeline are **not the same parser**, and
     * the difference is not academic. Measured 2026-08-31 while writing this file: a comment
     * containing a glob with a `*` immediately before a `/` closed the comment early;
     * `compile()` accepted the file and every assertion above passed, and the dev server returned
     * **500 on every route** with `CssSyntaxError: Missed semicolon`. A token test that only runs
     * Tailwind can therefore be entirely green over a stylesheet the application cannot load.
     *
     * `postcss` is not a direct dependency — it arrives under `@tailwindcss/postcss`, which is what
     * `postcss.config.mjs` names, so this asserts against the parser the build genuinely uses. If
     * that ever stops being true the import fails loudly, which is the right way round.
     */
    const source = readFileSync(GLOBALS, 'utf8');
    expect(() => postcss.parse(source, { from: GLOBALS })).not.toThrow();
  });

  it('registers at least 60 @theme keys', () => {
    // The run's K4. Measured the same way the plan measures it, so the number in the report and
    // the number the test asserts cannot drift.
    const source = readFileSync(GLOBALS, 'utf8');
    const block = /@theme inline \{([\s\S]*?)^\}/m.exec(source);
    expect(block?.[1]).toBeDefined();
    const keys = (block?.[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => /^\s*--/.test(line));
    expect(keys.length).toBeGreaterThanOrEqual(60);
  });
});
