import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ImportConfirmation,
  importConfirmationText,
  importLandedSomething,
} from '@/components/map/import-confirmation';

/**
 * The sentence a finished import shows over the map. Every case here is a real outcome the flow
 * produces — the re-import case in particular, which used to be reported as a full fresh save.
 */
describe('importConfirmationText', () => {
  it('reports a clean first import', () => {
    expect(importConfirmationText(8, 0, 0)).toBe('8 places added');
  });

  it('uses the singular for one place', () => {
    expect(importConfirmationText(1, 0, 0)).toBe('1 place added');
  });

  it('separates what was newly added from what was already in the library', () => {
    // Measured on a real re-import of the same London TikTok: two candidates were new, six were
    // already saved. "8 places added" would have been a lie.
    expect(importConfirmationText(8, 6, 0)).toBe('2 places added · 6 already saved');
  });

  it('says nothing was new when every place was already saved', () => {
    expect(importConfirmationText(8, 8, 0)).toBe('8 already saved');
  });

  it('names candidates the model could not place instead of dropping them silently', () => {
    expect(importConfirmationText(3, 0, 2)).toBe('3 places added · 2 couldn’t be pinned');
  });

  it('combines all three clauses when all three happened', () => {
    expect(importConfirmationText(5, 2, 1)).toBe(
      '3 places added · 2 already saved · 1 couldn’t be pinned',
    );
  });
});

/**
 * **The celebration, and the two ways it fails silently.**
 *
 * `mood="found"`, `.crumb-anim-land` and the spark pair were drawn, styled, tested and reachable
 * from nowhere until 2026-08-31 — the one moment this product exists for was marked with a lucide
 * check mark (`docs/archive/product-review-2026-08-31-r2.md` finding 5). Wiring it is a component swap; the
 * two things worth asserting are the ones a swap does not fix by itself.
 *
 * `environment: 'node'`, so the markup block is `react-dom/server` output: evidence about which
 * elements are emitted, and nothing about how they look. The photographs are the other half.
 */
describe('the one celebration the system has', () => {
  it('fires when something new landed on the map', () => {
    expect(importLandedSomething(8, 0)).toBe(true);
    expect(importLandedSomething(8, 6)).toBe(true);
    expect(importLandedSomething(1, 0)).toBe(true);
  });

  it('does not celebrate a re-import that added nothing', () => {
    /*
     * The ruling, and it is a product rule rather than a rendering detail. A re-import of the same
     * TikTok moved no pin; spending the product's single celebration on a no-op is how a beat stops
     * meaning anything. The strip still reports the number in words — nothing is hidden.
     */
    expect(importLandedSomething(8, 8)).toBe(false);
    expect(importLandedSomething(0, 0)).toBe(false);
  });

  it('is not withheld because something else could not be pinned', () => {
    // `skipped` is reported in the same sentence and is deliberately not an input to the rule: a
    // place that landed is not made less true by a candidate that could not be placed.
    const markup = renderToStaticMarkup(
      createElement(ImportConfirmation, {
        saved: 3,
        alreadySaved: 0,
        skipped: 2,
        onDismiss: () => {},
      }),
    );
    expect(markup).toContain('data-mood="found"');
  });

  it('draws the character with the landing beat when a place landed', () => {
    const markup = renderToStaticMarkup(
      createElement(ImportConfirmation, {
        saved: 3,
        alreadySaved: 0,
        skipped: 0,
        onDismiss: () => {},
      }),
    );
    expect(markup).toContain('data-mood="found"');
    expect(markup, 'the beat is the animation, not the mood').toContain('crumb-anim-land');
    // The spark pair is the `found` mood's own decoration and is what `.crumb-anim-land` animates.
    expect(markup).toContain('crumb-spark-1');
    expect(markup).toContain('crumb-spark-2');
    // A `role="status"` region already announces the sentence; a named mascot would read the
    // celebration and then the fact.
    expect(markup, 'the mascot must stay out of the accessibility tree').not.toContain(
      'aria-label="Places added',
    );
  });

  it('shows no character at all when nothing new landed', () => {
    /*
     * Not a different face: **no face.** `CRUMB_MOODS` binds every mood to a screen, and there is
     * no mood for *you already had these* — `idle` is the header and `nothingFound` is the screen
     * where the import found nothing, which is not what happened. The mood table refusing to supply
     * a ninth face is the table working.
     */
    const markup = renderToStaticMarkup(
      createElement(ImportConfirmation, {
        saved: 8,
        alreadySaved: 8,
        skipped: 0,
        onDismiss: () => {},
      }),
    );
    expect(markup).not.toContain('data-mood');
    expect(markup).not.toContain('crumb-anim-land');
    expect(markup).toContain('8 already saved');
  });
});

/**
 * **The sparks fire once.**
 *
 * `#motion`: *"It plays once, on confirm, timed to the pins dropping on the map. If it loops it
 * stops being an event and becomes wallpaper."* The stylesheet wrote that rule and then broke it
 * four lines below it — the body was `1 both` and both sparks were `infinite`, so the crumb landed
 * once and the sparks twinkled forever. It was invisible only because nothing used Land, and it
 * would have fired on the same commit that wired it.
 *
 * Asserted over **every** rule the landing beat owns rather than over the two known offenders, so a
 * third spark, a third target or a re-tuned duration inherits the rule instead of being born
 * outside it. This is exactly the class of defect that returns.
 */
describe('the landing beat is one-shot', () => {
  const GLOBALS = readFileSync('src/app/globals.css', 'utf8');

  /** Every `animation:` declaration in a rule whose selector list mentions `.crumb-anim-land`. */
  function landingAnimations(): { selector: string; value: string }[] {
    const out: { selector: string; value: string }[] = [];
    // Comment bodies quote `infinite` while forbidding it, so they are stripped before parsing.
    const css = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]*\.crumb-anim-land[^{}]*)\{([^{}]*)\}/g)) {
      const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
      for (const decl of (match[2] ?? '').matchAll(/animation:\s*([^;]+);/g)) {
        out.push({ selector, value: (decl[1] ?? '').trim() });
      }
    }
    return out;
  }

  it('finds the rules it is asserting over', () => {
    // The premise: a parser that silently matched nothing would pass every assertion below.
    const rules = landingAnimations();
    expect(rules.length, 'body, two sparks, and the reduced-motion arms').toBeGreaterThanOrEqual(4);
    const selectors = rules.map((r) => r.selector).join(' ');
    expect(selectors).toContain('crumb-spark-1');
    expect(selectors).toContain('crumb-spark-2');
  });

  it('never loops, on any of its targets', () => {
    const looping = landingAnimations().filter(({ value }) => /\binfinite\b/.test(value));
    expect(looping, 'the celebration became wallpaper').toEqual([]);
  });

  it('plays exactly once and holds its end frame', () => {
    /*
     * `both` is asserted with `1`, not instead of it. `crumb-spark`'s first and last keyframes are
     * both `opacity: 0`, so the fill is what keeps the pair invisible before its offset and
     * invisible again afterwards — without it the sparks would flash on at rest, which is the same
     * defect with the opposite sign.
     */
    for (const { selector, value } of landingAnimations()) {
      if (value === 'none') continue; // the reduced-motion arm switches loops off; see below.
      expect(value, `${selector} is not one-shot`).toMatch(/\b1 both\b/);
    }
  });

  it('collapses to a still frame under reduced motion rather than to absence', () => {
    const reduce = GLOBALS.slice(GLOBALS.indexOf('@media (prefers-reduced-motion: reduce)'));
    // The body fades in — §3a's "the opacity change alone, not nothing".
    expect(reduce).toContain('animation: crumb-appear 140ms ease-out 1 both');
    // The sparks stop moving and stay drawn: they are part of the `found` mood's own drawing, so
    // the reduced-motion user gets a still frame of the celebration rather than none of it.
    expect(reduce).toContain('.crumb-anim-land .crumb-spark-1');
    expect(reduce).toContain('.crumb-anim-land .crumb-spark-2');
  });
});

/**
 * **The stylesheet may not quote a value it does not own.**
 *
 * The `.crumb-aware` block documented the eye travel as `2.4` and `1.8` — numbers that were
 * measured, found to be 0.91 CSS px at a 44px mark, photographed as indistinguishable at the two
 * extremes, and replaced. The comment kept them beside the rule that justified replacing them, so
 * the next person to tune the eyes would have read the rejected pair as current and reverted the
 * fix (`docs/archive/product-review-2026-08-31-r2.md`, delight §3.2).
 */
describe('the awareness comment describes what ships', () => {
  const GLOBALS = readFileSync('src/app/globals.css', 'utf8');
  const AWARE = readFileSync('src/components/brand/crumb-aware.tsx', 'utf8');

  it('names the shipped travel and marks the smaller pair as rejected', () => {
    const block = GLOBALS.slice(
      GLOBALS.lastIndexOf('/**', GLOBALS.indexOf('.crumb-aware .crumb-eyes')),
      GLOBALS.indexOf('.crumb-aware .crumb-eyes'),
    );
    expect(AWARE).toContain('export const TRAVEL_X = 5;');
    expect(AWARE).toContain('export const TRAVEL_Y = 3.2;');
    expect(block).toContain('TRAVEL_X = 5');
    expect(block).toContain('TRAVEL_Y = 3.2');
    expect(block, 'the rejected pair must be labelled as rejected').toMatch(
      /2\.4[\s\S]{0,200}rejected|rejected[\s\S]{0,200}2\.4/,
    );
  });
});
