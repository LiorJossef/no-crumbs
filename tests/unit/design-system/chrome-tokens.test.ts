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
import {
  MASCOT_BLUSH,
  MASCOT_CRUST,
  MASCOT_GOLD,
  MASCOT_INK,
  MASCOT_INK_FLAT,
  MASCOT_INK_NIGHT,
} from '@/components/brand/mascot-colors';

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

/**
 * Source with every comment removed.
 *
 * **Three guards in this repository have now been fooled by prose, all on the same day**, and the
 * failure is always the same shape: a regex over raw source cannot tell a comment from a call site.
 * `bg-white/55` quoted in a file header tripped the composition guard; four mascot hex literals
 * quoted in a doc comment pushed `K12` from 26 to 27; and the assertion below tripped on
 * `--chrome-panel-wash` being *named in the comment explaining why it was removed*.
 *
 * The existing guards work around this by asking authors never to quote the thing — `page.tsx` and
 * `error.tsx` both carry a paragraph describing old class names in words for exactly that reason.
 * That is a real cost: **the clearest thing a comment can say about a removed token is its name.**
 * Stripping comments first is four lines and it lets both the guard and the prose be correct.
 *
 * Deliberately narrow: it strips block comments (which covers the JSX `{...}` form) and `//` to
 * end of line. A `//` inside a string literal would be over-stripped, which can only ever make
 * this assertion weaker on a line that is not a call site for a custom property; nothing in
 * `src/` reads a URL out of a class string.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
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

describe('the mascot\u2019s gold is admitted to chrome and fenced off the data surface', () => {
  /*
   * **Owner ruling, 2026-08-31 — the second time §3.1 rule 3 is set aside for chrome.**
   *
   * The mascot's gold may appear on the sign-in and landing grounds, their mesh, the empty states
   * and the edges. It may **never** appear on a pin, a category surface, a basemap layer or a
   * filter chip — the identical fence indigo already carries.
   *
   * **The reason is honoured rather than merely overridden, and the numbers are why the ruling
   * could be granted narrowly.** Measured in Lab, `MASCOT_GOLD` sits **6° and ΔE 17** from the
   * *night* café `#C99A55` — a real collision, and closer than the restaurant/café pair the
   * facelift retuned for being confusable at ΔE 20.1. Against the *light* café `#6F4A2B` it is 19°
   * and ΔE 54, which is safe; against mint it is **102°**. So the sentence "gold sits a few degrees
   * from the café amber" is true of exactly one of the two category palettes — the one that did not
   * exist when the rule was written — and `/sign-in` and `/` carry no category colour at all, so on
   * the surfaces where gold is admitted the collision is measurably impossible.
   *
   * Which makes the fence, not the permission, the thing that has to hold. This is built and
   * verified failing **before** any gold is used.
   */
  const MASCOT_PALETTE = [
    MASCOT_GOLD,
    MASCOT_CRUST,
    MASCOT_INK,
    MASCOT_BLUSH,
    MASCOT_INK_FLAT,
    MASCOT_INK_NIGHT,
  ];

  it('never reaches the map, the category palette or the basemap', () => {
    /*
     * **This is a superset of `crumb-mascot.test.ts`'s rule-5 assertion and does not replace it.**
     * That one names two files and looks for two module specifiers, which is the right shape for
     * the mascot lane to own. This one is scoped by *directory*, so a new file under
     * `components/map/` inherits the rule instead of being born outside it, and it catches three
     * routes that an import check cannot see: a pasted hex literal, a `--chrome-*` custom property
     * carrying gold into a style expression, and `mascot-colors` reached through a re-export.
     *
     * A hex is matched case-insensitively and by value rather than by name — someone typing
     * `#f2c46b` into a MapLibre paint expression is exactly the 2am failure this exists for, and it
     * would not mention the mascot anywhere.
     */
    const dataSurfaces = sources().filter(
      ({ path: p }) =>
        p.startsWith('components/map/') || p.startsWith('ui/place/') || p.includes('basemap'),
    );
    expect(dataSurfaces.length).toBeGreaterThan(4);
    const hexes = new RegExp(MASCOT_PALETTE.map((h) => h.slice(1)).join('|'), 'i');
    const offenders = dataSurfaces
      .filter(
        ({ source }) =>
          /mascot-colors|crumb-mascot/.test(source) || hexes.test(source) || /--chrome-/.test(source),
      )
      .map(({ path: p }) => p);
    expect(offenders).toEqual([]);
  });

  it('is spelled by identity wherever chrome uses it, so it cannot drift from the character', () => {
    /*
     * The same rule the halo already follows, extended to the ground: any gold in `globals.css`'s
     * chrome tokens must be one of the mascot's own values. A stylesheet cannot import a constant,
     * so the copy is checked rather than forbidden — and the check is what makes it a copy rather
     * than a second decision.
     *
     * Written as "every warm stop is a mascot colour" rather than as a list of tokens, so a gold
     * introduced into a *new* chrome token is covered the day it appears rather than the day
     * somebody remembers to add it here.
     */
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const allowed = new Set(MASCOT_PALETTE.map((h) => rgb(h).join(',')));
    for (const theme of [':root', '.dark'] as const) {
      for (const [name, value] of declarations(theme)) {
        if (!name.startsWith('--chrome-')) continue;
        for (const m of value.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
          const [r, g, b] = m.slice(1, 4).map(Number) as [number, number, number];
          // Warm = red leads blue by enough to be a pigment rather than a neutral or a cool.
          if (r - b < 40) continue;
          expect(
            allowed.has([r, g, b].join(',')),
            `${theme} ${name} carries a warm colour rgb(${r},${g},${b}) that is not the mascot's`,
          ).toBe(true);
        }
      }
    }
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

  it('generates text-display-lg at the design system\u2019s Display cap, with its line height', async () => {
    // A headline arriving at `1.5` is the defect the `--text-*--line-height` convention exists to
    // prevent, and it is invisible in a diff.
    const css = await build(['text-display-lg']);
    expect(rule(css, 'text-display-lg')).toContain('var(--text-display-lg)');
    expect(rule(css, 'text-display-lg')).toContain('var(--leading-display-lg)');
    // 2.5rem is 40px, which is `no-crumbs-design-system.html` §The system's Display cap verbatim.
    expect(declarations(':root').get('--text-display-lg')).toBe('2.5rem');
  });

  it('does not carry a --text-title, because that name means 22px', () => {
    /*
     * **A ratchet on a name, not on a value.**
     *
     * `--text-title: 2.75rem` existed here for a few hours and was wrong twice over: the design
     * system's **Title** step is 22px, for a line like *"12 restaurants here"*, and 44px is four
     * over its **Display** cap — the step whose own demo string is *"Your places are waiting."*,
     * this product's sign-in headline. A token that takes a specified name and means a different
     * size is worse than no token, because every later reader is misled in the same direction.
     */
    expect(declarations(':root').get('--text-title')).toBeUndefined();
    expect(declarations(':root').get('--leading-title')).toBeUndefined();
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

  it('has no gradient painted on the card\u2019s content half', () => {
    /*
     * `--chrome-panel-wash` was a mint-to-nothing sweep across the editorial half of the card in
     * light and an indigo one at night. It is gone, and this is the ratchet that keeps it gone:
     * `no-crumbs-design-system.html` §The system bans *"decorative gradients on content"* outright,
     * and that ban is about **where** a gradient is rather than which hue it is — so re-adding it in
     * mint, or in the house ramp, or at half the alpha, would be the same defect.
     *
     * The mesh, the two blooms, the glow and the lit edge all survive, and the distinction is worth
     * stating because it is the whole rule: every one of those is painted *around* the reading
     * surface. A sweep behind the headline and the subhead is painted *on* it.
     */
    expect(declarations(':root').get('--chrome-panel-wash')).toBeUndefined();
    expect(declarations('.dark').get('--chrome-panel-wash')).toBeUndefined();
    // Comments stripped first, so the component may still *name* the token in the paragraph that
    // explains why it went — see `withoutComments`. What is forbidden is a call site.
    const offenders = sources()
      .filter(({ source }) => withoutComments(source).includes('--chrome-panel-wash'))
      .map(({ path: p }) => p);
    expect(offenders).toEqual([]);
  });

  it('lights the mark in the mascot\u2019s own crust, and does not restate its value', () => {
    /*
     * **The fourth deliberate literal-versus-token duplication, held to the same rule as the other
     * three.**
     *
     * `--chrome-mark-glow` in light is the mascot's crust at a low alpha, because a halo should
     * read as the light coming off the character rather than as a second colour behind it. A
     * stylesheet cannot import a TypeScript constant, so `globals.css` carries a copy — exactly the
     * arrangement `ui/place/palette.ts`, `brand-colors.ts` and `mascot-colors.ts` already carry,
     * and exactly the arrangement `palette-tokens.test.ts` exists to keep honest.
     *
     * **This is what stops a silent inheritance across a lane boundary.** The character belongs to
     * one lane and the light behind it to another, and this token has now been wrong twice for the
     * same reason: each time it was chosen against a mark that later changed underneath it. If
     * `MASCOT_CRUST` moves, this fails, and the halo is re-decided rather than left pointing at a
     * colour the character no longer is.
     *
     * **Both themes**, which is the one place this file asserts a token is the *same* colour twice.
     * Everywhere else two values are required, because a pigment tuned on paper does not survive
     * near-black. A halo is the exception: it lights a **character** rather than a surface, and the
     * character is the same object in both themes. Only the alpha moves, and the alpha is not
     * asserted — a ground needs more light before a glow registers on it, and how much is a
     * judgement made by looking.
     */
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const theme of [':root', '.dark'] as const) {
      const glow = declarations(theme).get('--chrome-mark-glow') ?? '';
      const stops = [...glow.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) =>
        m.slice(1, 4).map(Number),
      );
      // A two-hue halo is a fringe, not a glow, so every stop is checked rather than the first.
      expect(stops.length, `${theme} --chrome-mark-glow should be rgba() stops: ${glow}`).toBeGreaterThan(1);
      for (const stop of stops) expect(stop, `${theme} --chrome-mark-glow`).toEqual(rgb(MASCOT_CRUST));
    }
    // Mint and gold may not meet: §3.1 rule 3, which the indigo override does not touch.
    for (const theme of [':root', '.dark'] as const) {
      const glow = declarations(theme).get('--chrome-mark-glow') ?? '';
      expect(glow, `${theme} halo must not reach for the mint ramp`).not.toMatch(/var\(--mint|168,\s*236,\s*226/);
    }
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
