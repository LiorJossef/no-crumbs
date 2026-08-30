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

/** Every match of `pattern` across `src/**` `.tsx`, with the file it came from — the file is what
 *  makes a failure actionable rather than a number that went up. */
function matches(pattern: RegExp): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const { path, source } of componentSources()) {
    for (const match of source.matchAll(pattern)) found.push({ path, text: match[0] });
  }
  return found;
}

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
