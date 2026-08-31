/**
 * **The night palette, compiled — every role has a dark value, and the derived ones derive.**
 *
 * `globals.css`'s failure mode is silence: a `@theme` key that is missing or misspelled generates
 * no utility and the element renders unstyled in a way that looks like a design choice
 * (`design-tokens.test.ts`'s header, and `--radius-md`'s four button sizes are the measured case).
 * A dark theme adds a second, quieter version of the same failure: a role that exists in `:root`
 * and is simply *not overridden* in `.dark` keeps its light value, which on a near-black ground is
 * usually invisible rather than obviously wrong.
 *
 * `facelift-plan.md` §4 decision 3 — **a signed pass, or no toggle at all** — is what makes that
 * worth a test rather than a review. This file asserts the coverage claim mechanically: for every
 * role a person can see, `.dark` says something.
 *
 * Source text rather than rendering, like `palette-tokens.test.ts`: `environment: 'node'`, no style
 * engine. What that cannot check is substitution — whether `color-mix()` in a `:root` declaration
 * re-resolves under `.dark` — so that claim is verified in a browser instead and the measurement is
 * quoted in the block's comment. Both readings agreed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const GLOBALS = readFileSync(
  fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)),
  'utf8',
);

function block(selector: string): string {
  const match = new RegExp(String.raw`^${selector} \{([\s\S]*?)^\}`, 'm').exec(GLOBALS);
  if (match?.[1] === undefined) throw new Error(`no ${selector} block in globals.css`);
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * `--name: value;` pairs, **spanning newlines**. `--brand-wash` is three stacked
 * `radial-gradient()`s over four lines, so a line-at-a-time parser silently misses it — which is
 * how the first version of this file reported it absent from a block it was present in. No CSS
 * value here contains a `;`, so the terminator is unambiguous.
 */
function declared(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block(selector).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

const root = declared(':root');
const dark = declared('\\.dark');

/**
 * The roles a person can see, as opposed to the ones that are theme-invariant by construction.
 *
 * Durations, easings, the type scale, the radii and the raw `--mint-*` ramp are deliberately NOT
 * here: a spacing step does not change when the lights go out, and the ramp *is* the brand — a
 * brand that changes hue between themes is two brands. What is here is every surface, every ink,
 * every state and every elevation.
 */
const THEMED_ROLES = [
  'background', 'foreground', 'card', 'card-foreground', 'card-2', 'popover', 'popover-foreground',
  'border', 'input', 'muted', 'muted-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'accent', 'accent-foreground', 'ring', 'destructive',
  'brand', 'brand-foreground', 'brand-tint',
  'success', 'success-foreground', 'warning', 'warning-foreground', 'info', 'info-foreground',
  'tag', 'tag-foreground', 'tag-selected', 'tag-selected-foreground',
  'pin', 'pin-selected', 'pin-halo',
  'category-restaurant', 'category-cafe', 'category-bar', 'category-uncategorised', 'on-category',
  'wash-from', 'wash-to', 'row-selected-from', 'row-selected-to', 'brand-wash',
  'shadow-raised', 'shadow-sheet', 'shadow-overlay',
].map((name) => `--${name}`);

describe('the night palette covers every visible role', () => {
  it('overrides all of them', () => {
    const missing = THEMED_ROLES.filter((role) => !dark.has(role));
    expect(missing, `roles that keep their light value under .dark`).toEqual([]);
  });

  it('and every one of them exists in the light theme too, so neither is a superset', () => {
    expect(THEMED_ROLES.filter((role) => !root.has(role))).toEqual([]);
  });
});

describe('what .dark deliberately does not restate', () => {
  it('leaves the derived hover pair alone, so it recomputes instead of drifting', () => {
    // Both are `color-mix(in oklch, <surface>, var(--foreground) N%)` declared in `:root`. A
    // custom property's `var()`s resolve against the element it is computed on, and `.dark` sets
    // all three operands on that same element — so restating them here would be the only way to
    // get them *wrong*. Verified in a browser: under `.dark` they read
    // `color-mix(in oklch, #2a2825, #f4f2ec 5%)`, i.e. both operands followed the theme and the
    // mix flipped from darkening to lightening on its own.
    expect(root.has('--secondary-hover')).toBe(true);
    expect(root.has('--tag-selected-hover')).toBe(true);
    expect(dark.has('--secondary-hover')).toBe(false);
    expect(dark.has('--tag-selected-hover')).toBe(false);
  });

  it('leaves `--shadow-elevated` an alias rather than a fourth value', () => {
    // It is `var(--shadow-sheet)` in `:root`; restating it in `.dark` would make it a value that
    // can disagree with the thing it is named after. Browser-verified equal under `.dark`.
    expect(root.get('--shadow-elevated')).toBe('var(--shadow-sheet)');
    expect(dark.has('--shadow-elevated')).toBe(false);
  });

  it('does not move the ramp, the type scale, the radii or the timings', () => {
    for (const invariant of [
      '--mint-100', '--mint-400', '--mint-700', '--ink-on-mint',
      '--text-micro', '--text-hero', '--radius', '--radius-md',
      '--duration-press', '--duration-base', '--ease-standard',
    ]) {
      expect(root.has(invariant), invariant).toBe(true);
      expect(dark.has(invariant), `${invariant} must not change between themes`).toBe(false);
    }
  });
});

describe('the palette is warm, not the blue scaffold it replaced', () => {
  it('carries none of the abandoned "Pale Sky" values', () => {
    // The block held `--primary: #6FBEEF` and `--accent: #1E3A4A` — a light-blue exploration that
    // was never reworked against the mint ramp and that nothing ever applied. Its own comment said
    // it was a first pass and not signed off. If any of these reappear, the rebuild was reverted.
    const text = block('\\.dark').toLowerCase();
    for (const stale of ['#6fbeef', '#1e3a4a', '#14181d', '#f2f5f7', '#8b95a3']) {
      expect(text, `Pale Sky value ${stale} is back in .dark`).not.toContain(stale);
    }
  });

  it('keeps the primary button identical in both themes', () => {
    // The one component that should not change: a mint fill with dark ink, in daylight and at
    // night. Everything else inverts around it.
    expect(dark.get('--primary')).toBe(root.get('--primary'));
    expect(dark.get('--primary-foreground')).toBe(root.get('--primary-foreground'));
  });
});
