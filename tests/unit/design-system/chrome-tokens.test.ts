/**
 * **The chrome layer: electric indigo, the raised card material, and the entrance's timing.**
 *
 * `iteration-2-plan.md` §2.2 ruling 1 lets a second brand colour into the system and immediately
 * fences it: *the sign-in and landing grounds, their mesh, the empty states, the edges* — and
 * **never** a pin, a category surface, a basemap layer or a filter chip. That fence is the whole
 * safety argument for overriding `brand-and-product-foundation.md` §3.1 rule 3, and a fence nobody
 * checks is a preference. So it is checked here, by source, in the direction that matters: not
 * "does the token exist" but "has it reached the data surface yet".
 *
 * Three other classes of silent failure are covered, each of which has already happened once in
 * this repository:
 *
 *  - **A `@theme` key in the wrong namespace.** `--radius-md` cost four button sizes their corners
 *    and `--blur-panel` is the same trap for `backdrop-blur`. Compiled, not grepped.
 *  - **A composition token with one value.** `--panel` was `bg-white/55` — a pigment and an alpha,
 *    correct on paper and 1.18:1 at night. A chrome token that is declared only in `:root` is that
 *    bug with a better name.
 *  - **The motion constants drifting from the CSS ones.** Motion cannot resolve a custom property,
 *    so `chrome-motion.ts` carries its own copy of the two easings. This is the `palette.ts`
 *    arrangement and it needs `palette-tokens.test.ts`'s counterpart. The same block also holds the
 *    entrance to opacity-and-transform only, which is the precondition for `reducedMotion="user"`
 *    meaning anything: a `height` or a `filter` in a variant survives the preference untouched.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import {
  CARD_VARIANTS,
  EASE_EMPHASISED,
  EASE_STANDARD,
  ITEM_VARIANTS,
  MARK_VARIANTS,
} from '@/components/brand/chrome-motion';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GLOBALS = path.join(ROOT, 'src/app/globals.css');
const SRC = path.join(ROOT, 'src');

/** `@import` resolution, lifted from `design-tokens.test.ts` — same reason, same three lines. */
function resolveStylesheet(id: string, base: string): string {
  if (id.startsWith('.')) return path.resolve(base, id);
  const parts = id.split('/');
  const pkg = id.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? id);
  const subpath = id.length > pkg.length ? `.${id.slice(pkg.length)}` : '.';
  const dir = path.join(ROOT, 'node_modules', pkg);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  const entry =
    pkg === 'tailwindcss' && subpath === '.' ? './index.css' : manifest.exports?.[subpath];
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

function rule(css: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const match = new RegExp(String.raw`\.${escaped}\s*\{([^}]*)\}`).exec(css);
  if (match?.[1] === undefined) throw new Error(`no rule generated for .${className}`);
  return match[1].replace(/\s+/g, ' ').trim();
}

/**
 * A declaration reader that survives a **multi-line value**, which `design-tokens.test.ts`'s does
 * not.
 *
 * Its regex is anchored per line, so a token whose value is a stack of four `radial-gradient()`s
 * across five lines is simply absent from the map it returns — silently, with no failure. Every
 * chrome image token is written that way, and `--brand-wash` was already, so a copy of that reader
 * would have asserted over an empty set and passed. This one reads to the terminating semicolon.
 */
function declarations(selector: ':root' | '.dark'): Map<string, string> {
  const source = readFileSync(GLOBALS, 'utf8');
  const block = new RegExp(String.raw`^${selector.replace('.', '\\.')} \{([\s\S]*?)^\}`, 'm').exec(
    source,
  );
  if (block?.[1] === undefined) throw new Error(`no ${selector} block in globals.css`);
  const withoutComments = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map<string, string>();
  for (const match of withoutComments.matchAll(/(--[a-z0-9-]+)\s*:\s*([\s\S]*?);/gi)) {
    if (match[1] && match[2]) out.set(match[1], match[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

function sources(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => ({ path: name, source: readFileSync(path.join(SRC, name), 'utf8') }));
}

/** The image tokens: gradients and a data URI, so they have no Tailwind namespace and are read
 *  through `var()` in an inline `style`. Every one is a composition value and needs two answers. */
const IMAGE_TOKENS = [
  '--chrome-mesh',
  '--chrome-bloom-a',
  '--chrome-bloom-b',
  '--chrome-glow',
  '--chrome-mark-glow',
  '--chrome-panel-wash',
  '--chrome-edge',
];

describe('the indigo ramp is the ruled value, and it is chrome only', () => {
  it('carries #5B6CFF exactly', () => {
    // `iteration-2-plan.md` §2.2 ruling 1 names one hex. It is the reason the override of §3.1
    // rule 3 is safe — it collides with none of restaurant #E8735C, café #C99A55 or bar #A288E0 —
    // so a "close enough" indigo would quietly re-open the collision the rule exists to prevent.
    expect(declarations(':root').get('--indigo-400')).toBe('#5B6CFF');
    // The ramp is one ramp in both themes, exactly as the mint is. What inverts is the role.
    expect(declarations('.dark').get('--indigo-400')).toBeUndefined();
  });

  it('inverts its readable step by theme, the way --brand does', () => {
    expect(declarations(':root').get('--chrome-accent')).toBe('var(--indigo-600)');
    expect(declarations('.dark').get('--chrome-accent')).toBe('var(--indigo-400)');
  });

  it('has not reached the map, the category palette or the basemap', () => {
    /*
     * **The fence, and the assertion this file exists for.**
     *
     * Ruling 1's second half is absolute: indigo may never paint a pin, a category surface, a
     * basemap layer or a filter chip, because on this map colour means *what a place is* and a
     * fourth hue in that vocabulary is a lie about a place. The ruling is prose in a document; this
     * is the only thing that will notice when someone reaches for the prettier colour at 2am.
     *
     * Scoped by directory rather than by file, so a *new* file under `components/map/` inherits the
     * rule instead of being outside it.
     */
    const dataSurfaces = sources().filter(
      ({ path: p }) =>
        p.startsWith('components/map/') || p.startsWith('ui/place/') || p.includes('basemap'),
    );
    expect(dataSurfaces.length).toBeGreaterThan(4);
    const offenders = dataSurfaces
      .filter(({ source }) => /--(?:indigo|chrome)-/.test(source) || /5B6CFF/i.test(source))
      .map(({ path: p }) => p);
    expect(offenders).toEqual([]);
  });
});

describe('the chrome tokens are registered in the namespace that generates a utility', () => {
  it('generates bg-chrome-accent, bg-panel-raised and backdrop-blur-panel-raised', async () => {
    // `--radius-md`'s failure mode again: `backdrop-blur` resolves against `--blur-*`, so a
    // `--backdrop-blur-panel-raised` key would register cleanly, generate nothing, and leave the
    // card unblurred in a way that reads as a design choice rather than as a bug.
    const css = await build(['bg-chrome-accent', 'bg-panel-raised', 'backdrop-blur-panel-raised']);
    expect(rule(css, 'bg-chrome-accent')).toContain('var(--chrome-accent)');
    expect(rule(css, 'bg-panel-raised')).toContain('var(--panel-raised)');
    expect(rule(css, 'backdrop-blur-panel-raised')).toContain('var(--panel-raised-blur)');
  });

  it('generates text-title, and it carries its own line height', async () => {
    // A 44px headline arriving at `1.5` is the defect the `--text-*--line-height` convention
    // exists to prevent, and it is invisible in a diff.
    const css = await build(['text-title']);
    expect(rule(css, 'text-title')).toContain('var(--text-title)');
    expect(rule(css, 'text-title')).toContain('var(--leading-title)');
  });
});

describe('every chrome composition token answers in both themes', () => {
  it('gives the mesh, the blooms, the glows, the wash and the edge two values', () => {
    const root = declarations(':root');
    const dark = declarations('.dark');
    for (const token of IMAGE_TOKENS) {
      expect(root.get(token), `${token} in :root`).toBeDefined();
      expect(dark.get(token), `${token} in .dark`).toBeDefined();
      expect(dark.get(token), `${token} is the same in both themes`).not.toBe(root.get(token));
    }
  });

  it('themes the card material and the grain strength, and does not theme the blur', () => {
    const root = declarations(':root');
    const dark = declarations('.dark');
    for (const token of ['--panel-raised', '--chrome-grain-strength']) {
      expect(root.get(token), `${token} in :root`).toBeDefined();
      expect(dark.get(token), `${token} in .dark`).toBeDefined();
      expect(dark.get(token)).not.toBe(root.get(token));
    }
    // The same statement `--panel-blur` carries: a blur radius is a geometry, and 20px is 20px in
    // either theme. Stating it here is what stops someone adding a dark value "for symmetry".
    expect(declarations('.dark').get('--panel-raised-blur')).toBeUndefined();
    // The grain tile is noise, not pigment; `mix-blend-mode: overlay` is what makes it theme-aware.
    expect(declarations('.dark').get('--chrome-grain')).toBeUndefined();
  });

  it('keeps --panel-raised distinct from --panel, which is a different surface', () => {
    // `--panel` is the full-height frosted column those two screens used to paint and is still the
    // add sheet's material. Collapsing the two would put a 0.55 alpha under the sign-in ink again.
    const root = declarations(':root');
    expect(root.get('--panel-raised')).not.toBe(root.get('--panel'));
    expect(declarations('.dark').get('--panel-raised')).not.toBe(declarations('.dark').get('--panel'));
  });
});

describe('the entrance constants agree with the stylesheet they were copied from', () => {
  const bezier = (value: string) =>
    (/cubic-bezier\(([^)]+)\)/.exec(value)?.[1] ?? '')
      .split(',')
      .map((n) => Number(n.trim()));

  it('matches --ease-emphasised and --ease-standard', () => {
    const root = declarations(':root');
    expect(bezier(root.get('--ease-emphasised') ?? '')).toEqual([...EASE_EMPHASISED]);
    expect(bezier(root.get('--ease-standard') ?? '')).toEqual([...EASE_STANDARD]);
  });

  it('animates opacity and transforms only, so reduced motion has something to drop', () => {
    /*
     * `<MotionConfig reducedMotion="user">` collapses the entrance by dropping **transform and
     * layout** animations and letting opacity through. That is only §3a's "collapse to the opacity
     * change, not to nothing" if every variant is made of exactly those two kinds of property: a
     * `height`, a `filter` or a `backgroundColor` here would survive the preference untouched and
     * nobody would notice, because the screen would still look animated.
     *
     * `opacity` is also asserted present in every one, because a variant with no opacity at all
     * would be *entirely* dropped and the element would simply pop.
     */
    const allowed = new Set(['opacity', 'x', 'y', 'scale', 'rotate', 'transition']);
    for (const [name, variants] of Object.entries({ CARD_VARIANTS, ITEM_VARIANTS, MARK_VARIANTS })) {
      for (const [state, value] of Object.entries(variants)) {
        const keys = Object.keys(value as Record<string, unknown>);
        expect(keys.filter((k) => !allowed.has(k)), `${name}.${state}`).toEqual([]);
        expect(keys, `${name}.${state} must animate opacity`).toContain('opacity');
      }
    }
  });
});
