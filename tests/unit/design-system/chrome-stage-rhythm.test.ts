/**
 * **The chrome card's rhythm, and the one screen that used to sit outside it.**
 *
 * `product-review-2026-08-31-r2.md`'s craft pass measured ten things and six of them were on two
 * files, in two opposite shapes. `ChromeStage`'s were *systemic* — one wrong property on a shared
 * component, wrong identically on the five screens that draw it, so one class repaired five
 * surfaces. The collection-join screen's were *local drift*: it was the one message surface outside
 * the system, so every value on it had been re-decided by hand and four came out different from the
 * family.
 *
 * Both shapes regress the same way — silently, and in a file whose diff looks fine. So this file
 * guards them the way `one-shell.test.ts` guards its eleven deletions: **source text, in a node
 * environment**, with comments stripped first, because every property below is JSX that needs a DOM
 * to execute and because each of these files explains its own fix in prose that a whole-file grep
 * would match instead of the code. What *renders* is a browser at 390x844 and 1440x900 in both
 * themes, and that evidence lives with the task.
 *
 * The one exception is `CHROME_MARK_INK_INSET`, which is arithmetic and is asserted against the
 * painted pixels it was derived to correct.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHROME_MARK_INK_INSET } from '@/components/brand/chrome-stage';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

const STAGE = 'components/brand/chrome-stage.tsx';
const JOIN = 'app/collections/join/[token]/page.tsx';

/** Source with block and line comments removed — `one-shell.test.ts`'s helper, same reason. */
function code(relative: string): string {
  return readFileSync(SRC + relative, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the mark sits on the rail its neighbours align to', () => {
  /**
   * **Both numbers are painted-pixel measurements, not restatements of the formula.**
   *
   * Scanned off a screenshot of `/sign-in` at 1440x900 light with the halo hidden: the headline's
   * ink began at `x = 253` (a Fraunces cap reaches its box edge, which is what makes it the
   * control) and the mark's ink began at `x = 258`. Five pixels, against 5.29 predicted from
   * `CRUMB_BOUNDS`, `CRUMB_ARTBOARD` and the Outlined keyline width. At the 44px phone mark the
   * same fraction is 4.15, measured 4.
   *
   * So this is a real assertion rather than a tautology: it fails if the outline moves, if the
   * keyline is retuned, or if the artboard's padding changes — and in every one of those cases the
   * right response is to **re-measure**, not to edit the expected number. The inset is derived from
   * those three constants precisely so it follows them; what nothing can derive is whether it still
   * lands on the rail.
   */
  it('predicts the five pixels that were measured', () => {
    expect(Math.round(CHROME_MARK_INK_INSET * 56)).toBe(5);
    expect(Math.round(CHROME_MARK_INK_INSET * 44)).toBe(4);
  });

  it('is a correction, not a redesign — under a tenth of the mark', () => {
    expect(CHROME_MARK_INK_INSET).toBeGreaterThan(0);
    expect(CHROME_MARK_INK_INSET).toBeLessThan(0.1);
  });

  /**
   * The number may not be typed. `CRUMB_HEAD_CENTRE` is derived from `CRUMB_BOUNDS` for this exact
   * reason and this follows it: a pasted `0.0944` stays behind when the shape moves, and the way
   * anybody finds out is the product's mark quietly sitting off its own rail again.
   */
  it('is spent through the size variable rather than as a pixel literal', () => {
    const source = code(STAGE);
    expect(source).toMatch(/marginInlineStart:\s*`calc\(var\(--chrome-mark-size\) \* \$\{-CHROME_MARK_INK_INSET\}\)`/);
    // One variable feeds both the mark's box and the fraction taken off it. Two copies drift.
    expect(source).toContain('size-(--chrome-mark-size)');
  });
});

describe('the stage clips the glow it hangs outside the card', () => {
  /**
   * `scrollWidth` was **418 against a 390 layout viewport** on all six screens this component
   * draws, and 0 on the two that do not use it. The cause is the `-inset-x-12` glow; the fix is a
   * clip on the stage wrapper, which is what `ChromeGround` already does for blooms that reach
   * twice as far.
   */
  it('clips horizontally, and does not become a scroll container to do it', () => {
    const source = code(STAGE);
    expect(source).toContain('overflow-x-clip');
    // `overflow-x: hidden` forces the other axis to `auto`; these screens are legitimately taller
    // than a phone and must keep scrolling vertically.
    expect(source).not.toContain('overflow-x-hidden');
  });
});

describe('the identity does not move when the copy rewraps', () => {
  /**
   * `justify-center` on the editorial half centred the column *containing the lockup*, so the mark
   * sat 57 / 79.5 / 132.5px below the card top across five siblings and the sign-in↔sign-up toggle
   * moved it 11px. Measured after: one offset per breakpoint across all five, 33 at 390 and 57 at
   * 1440, unchanged by the toggle.
   *
   * The centring is still on the form half, where the reason it was added — 80px of dead space
   * under the landing CTA — actually lives.
   */
  it('centres the form half and no longer the half that carries the mark', () => {
    const sections = code(STAGE).match(/<section className="[^"]+"/g) ?? [];
    expect(sections).toHaveLength(2);

    const [editorial, form] = sections;
    expect(editorial).not.toContain('justify-center');
    expect(form).toContain('justify-center');
  });

  /**
   * The card's four vertical paddings were 36 / 32 / 28 / 32 on a phone and 56 / 56 / 56 / 56 at
   * `lg`. An optical decision about text above a rule versus a label below one is arguable; one
   * that exists at one breakpoint and vanishes at the other is a leftover.
   */
  it('sets the same vertical padding on both halves at both breakpoints', () => {
    const sections = code(STAGE).match(/<section className="[^"]+"/g) ?? [];
    for (const section of sections) {
      expect(section).toContain('py-8');
      expect(section).toContain('lg:py-14');
      expect(section).not.toMatch(/\bp[tb]-\d/);
      expect(section).not.toMatch(/\blg:p[tb]-\d/);
    }
  });
});

describe('the invite screen is inside the system', () => {
  /**
   * It is the product's **only** unauthenticated acquisition surface — Charter §1 refuses
   * discovery, so a shared collection link is the sole way a second person ever arrives — and it
   * was the one message surface drawing its own shell. Four measured divergences followed from
   * that one fact, and adopting the composition is what resolves them rather than four nudges.
   */
  it('is drawn as the shared card, with the ground the other front doors stand on', () => {
    const source = code(JOIN);
    expect(source).toContain('<ChromeStage');
    expect(source).toContain('<ChromeGround />');
  });

  /**
   * The four values that had been re-decided by hand:
   *
   *  - `leading-tight` over `text-display`, which carries its own line height and is a token for
   *    exactly that reason — 42.5px against the family's 38.08;
   *  - `h-14`, 56px at both breakpoints against `h-12 lg:h-13`, and no desktop type step;
   *  - `h-[30px] w-[30px]`, an arbitrary mark size with no desktop step;
   *  - `mt-2` on the CTA, the spacing that went with the hand-made shell.
   *
   * The mark is now the lockup's, which also settles the second half of C6: it renders through
   * `ChromeMark` and carries the face, on the one screen `voice-and-vocabulary.md` §2 treats as a
   * front door.
   */
  it('re-decides none of the values the composition already owns', () => {
    const source = code(JOIN);
    expect(source).not.toContain('leading-tight');
    expect(source).not.toContain('h-14');
    expect(source).not.toContain('h-[30px]');
  });

  /** Both CTAs on this route are the family's primary action, class for class. */
  it('sizes both of its buttons the way every other primary action is sized', () => {
    const buttons = code(JOIN).match(/className="[^"]*\bh-12\b[^"]*"/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button).toContain('lg:h-13');
      expect(button).toContain('lg:text-reading');
    }
  });
});
