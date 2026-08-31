/**
 * **A visitor with no JavaScript, on a dark device, gets the dark theme — and a visitor who chose
 * Light never does.**
 *
 * ## The gap
 *
 * The theme *preference* lives in `localStorage`, so it genuinely cannot work without JavaScript;
 * `app/profile/theme-choice.tsx` correctly hides itself there. The **device's** preference needs no
 * JavaScript at all, and `theme.ts`'s `DEFAULT_PREFERENCE` is `'system'` — without JS, `'system'`
 * is the only preference that exists. Until `globals.css` grew its `prefers-color-scheme` block the
 * product rendered light regardless, which is the one preference nobody had expressed.
 *
 * ## What actually has to be right, and it is not the media query
 *
 * The failure this file exists to prevent is the **opposite** of the gap: a user whose stored
 * choice is Light, on a dark device, with JavaScript on, getting a dark page. The rule's whole
 * correctness rests on `:root:not([data-theme])` being an exact *"the init script did not run"*
 * seam rather than an approximation of one, so that is asserted directly against the script rather
 * than assumed from reading it — `THEME_INIT_SCRIPT` is a hand-written string that no type checks.
 *
 * ## And the duplication
 *
 * CSS has no way to say *"these declarations apply for `.dark`, or under this media query"* in one
 * rule — a media query wraps whole rules, so a selector list cannot have one member gated by it. So
 * the night palette is written twice, which this repository allows only under one condition, stated
 * on `--chrome-mark-glow` and `--mascot-keyline`: **a deliberate duplication needs a test that makes
 * drift impossible.** This is that test. It compares the two blocks declaration for declaration.
 *
 * Source text rather than a rendering, and deliberately the same reader shape as
 * `dark-theme.test.ts` and `palette-tokens.test.ts` next door: `environment: 'node'`, no style
 * engine. What a text reader cannot check is what a browser actually paints with scripting off, so
 * that is measured separately and the numbers are in the task's report, not asserted here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFERENCE, THEME_ATTRIBUTE, THEME_INIT_SCRIPT } from '@/lib/theme';

const GLOBALS = readFileSync(
  fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)),
  'utf8',
);

/** `--name: value;` pairs, spanning newlines — `--chrome-mesh` is five stacked gradients over six
 *  lines, and a line-at-a-time parser silently misses it. No CSS value here contains a `;`. */
function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

function darkClassBlock(): string {
  const m = /^\.dark \{([\s\S]*?)^\}/m.exec(GLOBALS);
  if (m?.[1] === undefined) throw new Error('no `.dark` block in globals.css');
  return m[1];
}

function noJsBlock(): { selector: string; body: string } {
  const m =
    /^@media \(prefers-color-scheme: dark\) \{\n {4}([^{]+)\{([\s\S]*?)^ {4}\}\n^\}/m.exec(GLOBALS);
  if (m?.[1] === undefined || m[2] === undefined) {
    throw new Error('no top-level `@media (prefers-color-scheme: dark)` block in globals.css');
  }
  return { selector: m[1].trim(), body: m[2] };
}

describe('the seam the no-JS rule hangs off', () => {
  it('is written by the init script on both branches, in every case', () => {
    /*
     * Ten combinations of stored preference x device scheme, evaluated against a stub document.
     * `data-theme` present in ten of ten is the whole argument: with scripting on the attribute is
     * always there and the media rule can never match, so a stored Light on a dark device stays
     * light. If a future edit made the script write the attribute only on the dark branch, this
     * fails here rather than as a dark flash on somebody's front door.
     */
    const run = (stored: string | null, deviceDark: boolean, throws = false) => {
      const attrs: Record<string, string> = {};
      const classes = new Set<string>();
      const style: Record<string, string> = {};
      const fn = new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT);
      fn(
        {
          getItem: () => {
            if (throws) throw new Error('site data blocked');
            return stored;
          },
        },
        { matchMedia: () => ({ matches: deviceDark }) },
        {
          documentElement: {
            classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
            setAttribute: (k: string, v: string) => {
              attrs[k] = v;
            },
            style,
          },
        },
      );
      return { attribute: attrs[THEME_ATTRIBUTE], dark: classes.has('dark') };
    };

    for (const stored of ['light', 'dark', 'system', null, 'not-a-preference']) {
      for (const deviceDark of [false, true]) {
        const result = run(stored, deviceDark);
        expect(result.attribute, `stored=${stored} deviceDark=${deviceDark}`).toMatch(/^(light|dark)$/);
      }
    }

    // The one case the script leaves the attribute off, and it is the case the media rule should
    // win. `try/catch` swallows the whole body, so nothing is written at all.
    expect(run(null, true, true).attribute).toBeUndefined();
    // And the runtime agrees with what the stylesheet will have painted, so nothing flashes back:
    // `ThemeProvider.readStoredPreference` returns this on throw, and `'system'` on a dark device
    // resolves to dark.
    expect(DEFAULT_PREFERENCE).toBe('system');
  });

  it('is selected on with exactly the attribute, and at a specificity that beats :root', () => {
    const { selector } = noJsBlock();
    expect(selector).toBe(':root:not([data-theme])');
    /*
     * `:root:not([data-theme])` is (0,2,0) — `:root` plus `:not()` taking its argument's (0,1,0) —
     * so it overrides the light palette on `:root` (0,1,0). `html:not([data-theme])` would be
     * (0,1,1) and would *lose*, silently, which is the plausible wrong edit. It also sits above
     * `.dark` (0,1,0), which is harmless: the script writes the class and the attribute together,
     * so the two can never match the same element, and if they somehow did they would paint the
     * same palette.
     */
    expect(selector).not.toMatch(/^html/);
    expect(selector).not.toContain('.dark');
  });
});

describe('the night palette, written twice and pinned together', () => {
  it('declares exactly what `.dark` declares, value for value', () => {
    const dark = declarations(darkClassBlock());
    const noJs = declarations(noJsBlock().body);

    expect(dark.size, 'the `.dark` block should not be empty').toBeGreaterThan(50);
    expect([...noJs.keys()]).toEqual([...dark.keys()]);
    for (const [name, value] of dark) {
      expect(noJs.get(name), `${name} differs between \`.dark\` and the no-JS block`).toBe(value);
    }
  });

  it('adds `color-scheme: dark`, which is the one thing `.dark` does not carry', () => {
    /*
     * With scripting on, `applyTheme` writes `color-scheme` as an inline style, so `.dark` has
     * never needed it. With scripting off nothing writes it, and without it a dark page keeps white
     * scrollbars, white form controls and a white overscroll — the most obvious tell that a dark
     * mode was painted on rather than declared. Asserted by name so the exception stays the only
     * one: the test above already proves nothing *else* differs.
     */
    expect(noJsBlock().body).toMatch(/^\s*color-scheme: dark;$/m);
    expect(darkClassBlock()).not.toContain('color-scheme');
  });

  it('is the only `prefers-color-scheme` rule in the file', () => {
    /*
     * One rule, one seam. A second one — a component reaching for the device directly — is how the
     * class strategy stops being the single source of truth, which is the defect `theme.ts`'s
     * header records three modules having had before `resolveTheme` existed.
     */
    expect(GLOBALS.match(/prefers-color-scheme/g)).toHaveLength(1);
  });
});
