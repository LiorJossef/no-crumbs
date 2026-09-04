/**
 * E-T4 (feedback round 3 §2.7) — the review modal's option block stops shouting.
 *
 * The feedback is about weight, not words: "From the caption" / "From the map data" / "WHICH ONE IS
 * IT?" are ruled copy and none of it changed here. What changed is the treatment, and these are the
 * two things a later restyle could quietly put back. Read on the source, in the style
 * `provenance-badge.test.ts` established, because nothing in this suite renders React.
 *
 * **This is not the acceptance test.** Whether the modal reads lighter is a person looking at it at
 * 390×844 and at desktop; that check is owed and was not performed here.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const CARD = readFileSync('src/app/import/screens/review/candidate-card.tsx', 'utf8');

/** Comments stripped: this file's own prose explains the rules and would match them. */
const code = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The option-list block, from the group label to the end of the radio row's classes. */
const optionStart = code.indexOf('${optionsId}-label');
const optionBlock = code.slice(optionStart, code.indexOf('aria-hidden', optionStart));

describe('the “which one is it?” block', () => {
  it('no longer spends the screen’s loudest type on the question', () => {
    // Uppercase + 0.08em tracking at 11px is the heaviest label treatment this screen owns, and it
    // sat over a radio group that already announces itself.
    expect(optionBlock).not.toContain('uppercase');
    expect(optionBlock).not.toContain('tracking-[');
  });

  it('keeps the ruled words exactly — this was a weight change, not a rewrite', () => {
    // The strings live in `ui/import/candidate-resolution-view.ts` and are read, never restated.
    expect(code).toContain('{resolutionHeadline(view)}');
    expect(code).toContain('{resolutionExplanation(view)}');
  });

  it('still labels the radio group with the heading it renders', () => {
    // Lightening a label must not turn it into decoration: `aria-labelledby` points at this id.
    expect(code).toContain('id={`${optionsId}-label`}');
    expect(code).toContain('aria-labelledby={`${optionsId}-label`}');
  });
});

describe('the option rows', () => {
  it('paint no border until one is chosen, and keep the metrics either way', () => {
    expect(optionBlock).toContain("isChosen ? 'border-brand bg-accent/40' : 'border-transparent");
    // `border` itself stays on the base class list, so the chosen row does not shift by a pixel.
    expect(optionBlock).toContain('rounded-lg border px-3 py-2');
  });

  it('keeps the 44px touch floor and the wrapping address', () => {
    // Two things density work is most likely to take: the touch target and the address that is the
    // only way to tell two branches of a chain apart.
    expect(optionBlock).toContain('min-h-11');
    expect(code).toContain('break-words');
  });
});
