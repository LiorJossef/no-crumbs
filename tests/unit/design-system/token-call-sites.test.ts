/**
 * **A ratchet on how components are allowed to reach for colour.**
 *
 * Three counts, all of them measured the way `docs/overnight-run-plan.md` §4 measures them, so the
 * number in a report and the number in a test cannot disagree. Every one is a ceiling that may
 * fall and must never rise.
 *
 * The thing being guarded is not tidiness. A component that writes `text-[var(--mint-700)]` has
 * reached past the role layer into the ramp, and the cost lands later and elsewhere: the dark-mode
 * pass that is still owed cannot move a colour that 44 files named directly, and a chip that wants
 * "the active mint" has no name to ask for. There were 75 such call sites; there are none.
 *
 * A ceiling test is only worth having if raising it is harder than fixing the code, so:
 * **raising any number here is the regression this file exists to catch.** If a call site
 * genuinely needs the raw ramp — and after W0-3 none does — it gets a comment at the site saying
 * why, and the number below moves in the same commit, with the reason in the commit body.
 *
 * Source text, in a node environment, following `tests/unit/shell/one-shell.test.ts`: what is being
 * asserted is a property of what is *written*, not of what renders.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

function componentSources(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ path: name, source: readFileSync(SRC + name, 'utf8') }));
}

/**
 * `.ts` as well as `.tsx`, and only the composition assertions below use it.
 *
 * A Tailwind class string does not have to live in a component: `add-sheet.tsx` keeps
 * `MENU_ROW_CLASS` at module scope and `place-sheet.tsx` keeps several, and any one of them could
 * move to a plain `.ts` sibling tomorrow — `ui/place/category-display.ts` already holds a
 * `color-mix()` expression, which is a composition value in a file this suite's `.tsx`-only reader
 * cannot see. The ramp assertions above stay on `.tsx` because their numbers were measured there
 * and a ceiling test whose denominator moves is not a ceiling.
 */
function allSources(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => ({ path: name, source: readFileSync(SRC + name, 'utf8') }));
}

/** Every match of `pattern` across `src/**` `.tsx`, with the file it came from — the file is what
 *  makes a failure actionable rather than a number that went up. */
function matches(pattern: RegExp, files = componentSources()): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const { path, source } of files) {
    for (const match of source.matchAll(pattern)) found.push({ path, text: match[0] });
  }
  return found;
}

/** Where a Tailwind utility's colour goes. `text-` is deliberately absent from the surface list
 *  below and present here, because the two cases are opposites — see the second assertion. */
const SURFACE_UTILITIES = 'bg|border|from|to|via|ring|fill|stroke|outline|divide|shadow|accent|caret|decoration';

describe('components reach for roles, not for the ramp', () => {
  it('has no raw var(--mint-N) call site left', () => {
    // The run's K6, whose target is <= 10. It is 0, and 0 is what is asserted: a role exists for
    // every use the product has, so the next one to appear is an author who did not look.
    const raw = matches(/var\(--mint-[0-9]+\)/g);
    expect(raw.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });

  it('does not grow the arbitrary-value class count', () => {
    /*
     * The run's K5, target <= 60, measured at 166 before W0 and 96 after it — the 70 that went were
     * `text-[var(--mint-700)]` and its neighbours, collapsed onto named utilities rather than
     * restyled. `facelift-plan.md` §3a: now that the scales are registered, a bracket is a choice
     * to bypass the token layer rather than the only way to say something.
     *
     * Waves 2-7 take this the rest of the way down. Lower the ceiling when they do.
     */
    const arbitrary = matches(/\b(?:bg|text|border|shadow|rounded|ring|duration|ease)-\[[^\]]+\]/g);
    expect(arbitrary.length).toBeLessThanOrEqual(96);
  });

  it('does not add a hard-coded colour', () => {
    /*
     * The run's K12: the count may only go down. 26 lines across 7 files, and they are not all the
     * same kind of thing — `map-surface.live.tsx` is frozen dead code, `global-error.tsx` renders
     * without the stylesheet by construction, and `basemap-tint-layer.tsx` feeds MapLibre, which
     * cannot read a custom property (see `ui/place/palette.ts`). Each is a decision; a 27th line
     * would be an accident.
     */
    const lines = componentSources().flatMap(({ path, source }) =>
      source
        .split('\n')
        .map((line, index) => ({ path, line, number: index + 1 }))
        .filter(({ line }) => /#[0-9A-Fa-f]{6}/.test(line)),
    );
    expect(lines.length).toBeLessThanOrEqual(26);
  });
});

/**
 * **The half `K12` was structurally unable to see.**
 *
 * K12 above counts `#rrggbb`, and every one of the seven literals iteration 2 opened with —
 * `bg-white/55` ×2, `bg-black/40` ×2, `text-white` ×2, `border-white` — contains no hex at all. Nor
 * does `color-mix(in oklab, var(--category-cafe) 12%, transparent)`. So a run whose stated job was
 * to tokenise colour finished with a **1.18:1 sign-in panel** and a near-black category disc, with
 * every colour assertion green throughout (`iteration-2-plan.md` §1).
 *
 * The class is one thing said three ways: **a pigment and an alpha are not a colour.** `white`,
 * `black`, and a percentage inside a colour function all name something that has to be composited
 * before it means anything, and what it composites against changes with the theme. A token can
 * carry two values; a literal cannot carry one that is right in both.
 */
describe('composition is tokenised, not only colour', () => {
  it('has no white or black utility left anywhere in src', () => {
    /*
     * Hard zero, not a ceiling, and it can be hard because it *is* zero: `--panel`, `--scrim`,
     * `--brand-foreground` and `--pin-halo` each name what one of the seven was reaching for.
     *
     * The variant prefixes are covered by the leading `\b` — this fires on `lg:bg-white/55` and
     * `dark:bg-black/40` as readily as on the bare class, and `lg:bg-white/55` is the exact string
     * that put the product's front door at 1.18:1.
     */
    const literals = matches(
      new RegExp(String.raw`\b(?:${SURFACE_UTILITIES}|text)-(?:white|black)(?:/\d+)?\b`, 'g'),
      allSources(),
    );
    expect(literals.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });

  it('does not paint a surface in --foreground at an alpha', () => {
    /*
     * The eighth instance of the same class, found while photographing the seventh, and the worst
     * of them by area: `import-shell.tsx` scrims the desktop import overlay with
     * `lg:bg-foreground/35`. Measured in Chromium — light `oklab(0.2217 … / 0.35)`, dark
     * `oklab(0.9610 … / 0.35)`. It is a dark ink scrim in daylight and a **near-white veil over the
     * entire 1440x900 viewport** at night, which is `bg-white/55`'s bug with a token's name on it.
     *
     * `--foreground` and `--background` are the two tokens that swap ends of the ramp between
     * themes, so an alpha on either is the sharpest form of this defect. **`text-foreground/70` is
     * fine** and is deliberately not matched: dimming *ink* toward the ground is correct in both
     * themes, because the ground is what it is being dimmed toward. Painting a *surface* in the ink
     * colour is the inversion. `bg-background/50` is likewise correct and likewise unmatched — a
     * veil in the page's own ground fades the right way in both themes — which is why this names
     * `foreground` rather than "any theme token".
     *
     * A ceiling of one rather than zero because the fix is in a file this package was not given.
     * Two assertions rather than one so that *replacing* the known instance with a new one
     * elsewhere still fails: the first catches a new file, the second a second occurrence.
     * **When `import-shell.tsx` is fixed, delete `KNOWN` and leave the empty-array assertion** —
     * that is the ratchet, and it only turns one way.
     */
    const KNOWN = ['app/import/screens/import-shell.tsx'];
    const found = matches(
      new RegExp(String.raw`\b(?:${SURFACE_UTILITIES})-foreground/\d+`, 'g'),
      allSources(),
    );
    expect(found.filter((m) => !KNOWN.includes(m.path)).map((m) => `${m.path}: ${m.text}`)).toEqual([]);
    expect(found.length, found.map((m) => `${m.path}: ${m.text}`).join(', ')).toBeLessThanOrEqual(
      KNOWN.length,
    );
  });

  it('does not write a literal percentage inside a color-mix()', () => {
    /*
     * The row disc's `12%`, which is where iteration 2's third measured defect lived. A percentage
     * in a colour function is an alpha: 12% of a colour is a soft wash on a near-white card and a
     * dark olive on a near-black one, and no single number is right in both. `--tint-strength` is
     * that number, and `ui/place/category-display.ts`'s `categoryTintVar()` is the one place the
     * expression is written.
     *
     * **This is the assertion that has to be worded carefully**, because the instrument that
     * preceded it was wrong in the mirror-image way: `overnight-run-report.md` §7 records a guard
     * that grepped raw markup for `\d+%` and tripped on this very `color-mix(… 12%, transparent)`
     * while it was still correct. So the match is scoped to the inside of a `color-mix()` — where
     * a percentage genuinely is an alpha — and a `w-[80%]` or a `translate-y-1/2` is not this bug
     * and is not matched.
     *
     * `globals.css` is not read here on purpose: a percentage *defining* the token is exactly where
     * one belongs.
     */
    const mixes = matches(/color-mix\([^;\n]{0,160}?\d+(?:\.\d+)?%\s*[,)]/g, allSources());
    expect(mixes.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });
});
