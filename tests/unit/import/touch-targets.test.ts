/**
 * W7-6 in the import flow — every interactive element is at least 44 × 44.
 *
 * `spec-no-places-found.md` §8.3 sets the bar at 44, which is WCAG 2.5.5 (AAA) rather than 2.5.8's
 * 24px AA minimum. That is this project's own bar and it is the one the accessibility sweep scores
 * against, so it is the one asserted here.
 *
 * **The import screens are the blind spot this file exists for.** They are reachable only through
 * `_lib/dev-screen.ts`'s `?state=` seam, and dev mode is excluded from every claim in this repo —
 * so the sweep that scored 162 elements for contrast and 146 for focus rings covered none of them.
 * A source scan is a weaker instrument than a rendered measurement, and it is the one available.
 *
 * It found three, where one had been reported: both close affordances at 36px, **and the review
 * screen's caption toggle at 24px** — on the flagship confirm surface, and its own sibling on the
 * no-places screen was already 44. Worth stating because of how the third was nearly missed: the
 * first version of this scan matched `<button[^>]*?className=`, and `onClick={() => …}` contains a
 * `>`, so it silently skipped every element with an arrow function before its class string. The
 * walk below is written not to have that hole, and the self-test at the bottom is what proves it.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importClientFiles } from './import-client-source';

/** `size-9` → 36. Tailwind's spacing scale is 0.25rem per unit at a 16px root. */
const PX_PER_UNIT = 4;
const BAR_PX = 44;

interface Target {
  readonly path: string;
  readonly line: number;
  readonly tag: string;
  readonly classes: string;
  readonly smallestPx: number;
}

/**
 * Every `<button>`, `<a>` and `<Link>` in the flow that declares an explicit height, with the
 * smallest one it declares.
 *
 * Scans forward from each opening tag to the **first nested element**, rather than to the first
 * `>` — an attribute value holding an arrow function contains one, and stopping there is how a
 * 24px target hid from the first version of this.
 */
function targets(): readonly Target[] {
  const found: Target[] = [];
  for (const path of importClientFiles().filter((p) => p.endsWith('.tsx'))) {
    const source = readFileSync(path, 'utf8');
    for (const opening of source.matchAll(/<(button|a|Link)[\s>]/g)) {
      const from = opening.index;
      let window = source.slice(from, from + 1200);
      const nested = /\n\s*<[A-Za-z]/.exec(window.slice(opening[0].length));
      if (nested !== null) window = window.slice(0, opening[0].length + nested.index);
      const classes = /className=(?:\{)?(?:cn\()?\s*["'`]([^"'`]*)["'`]/.exec(window)?.[1];
      if (classes === undefined) continue;
      const units = [...classes.matchAll(/\b(?:size|h|min-h)-(\d+(?:\.\d+)?)\b/g)].map((m) =>
        Number(m[1]),
      );
      if (units.length === 0) continue;
      found.push({
        path,
        line: source.slice(0, from).split('\n').length,
        tag: opening[1]!,
        classes,
        smallestPx: Math.min(...units) * PX_PER_UNIT,
      });
    }
  }
  return found;
}

describe('every target in the flow clears 44px', () => {
  it('declares no interactive element shorter than the bar', () => {
    const under = targets()
      .filter((t) => t.smallestPx < BAR_PX)
      .map((t) => `${t.path}:${String(t.line)} <${t.tag}> ${String(t.smallestPx)}px — ${t.classes}`);
    expect(under).toEqual([]);
  });

  it('is looking at something, and at the elements it claims to be', () => {
    // A guard that scans nothing passes silently. These are the counts that make the assertion
    // above mean anything, and the tags it is meant to reach.
    const all = targets();
    // Eleven today. Only elements that declare an explicit height are in scope — a text
    // link sized by its own line box is not something this scan can measure.
    expect(all.length).toBeGreaterThanOrEqual(11);
    expect(new Set(all.map((t) => t.tag))).toEqual(new Set(['button', 'a', 'Link']));
    expect(new Set(all.map((t) => t.path)).size).toBeGreaterThan(4);
  });

  it('sees past an arrow function in an attribute, which is how it missed one before', () => {
    // The review screen's caption toggle carries `onClick={() => setCaptionOpen(…)}` before its
    // class string. A scan that stopped at the first `>` never reached it, and a 24px target on
    // the flagship confirm screen went unreported.
    const toggle = targets().find(
      (t) => t.path.endsWith('review/review-screen.tsx') && t.classes.includes('text-caption'),
    );
    expect(toggle, 'the review screen caption toggle').toBeDefined();
    expect(toggle?.smallestPx).toBe(44);
  });
});

describe('the close affordance grew its target without moving its circle', () => {
  const shell = readFileSync('src/app/import/screens/import-shell.tsx', 'utf8');

  it('is a 44px box around a 36px circle, on both entry points', () => {
    // `spec-no-places-found.md` §4's own wording: "36px circle, 44px hit area".
    expect((shell.match(/size-11 items-center justify-center lg:left-6/g) ?? []).length).toBe(2);
    expect((shell.match(/flex size-9 items-center justify-center rounded-full bg-accent/g) ?? []).length).toBe(2);
  });

  it('compensates with a negative margin, so no inset value had to move', () => {
    // On an absolutely positioned box a −4px margin pulls the border box up and left of its
    // `left`/`top`, so the circle centred inside the 44px box lands on the pixel it landed on
    // before — at both breakpoints, with `left-5`/`lg:left-6` untouched.
    expect((shell.match(/-m-1 left-5 top-\[calc\(env\(safe-area-inset-top\)\+2rem\)\]/g) ?? []).length).toBe(2);
    expect(shell).toContain('lg:left-6 lg:top-6');
  });

  it('keeps the hover firing from the whole target, not just the circle', () => {
    expect((shell.match(/group-hover:bg-accent\/80/g) ?? []).length).toBe(2);
    expect((shell.match(/className="group absolute/g) ?? []).length).toBe(2);
  });
});
