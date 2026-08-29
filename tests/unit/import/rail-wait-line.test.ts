import { describe, expect, it } from 'vitest';

import { railWaitLine } from '@/ui/import/rail-wait-line';

describe('railWaitLine', () => {
  it('opens with the short promise, because most imports keep it', () => {
    expect(railWaitLine(0)).toBe('This usually takes a few seconds.');
    expect(railWaitLine(9_999)).toBe('This usually takes a few seconds.');
  });

  it('stops saying "a few seconds" once that has stopped being true', () => {
    // The whole defect: extraction is measured at 7-34s, and the screen held the opening line for
    // all of it. A promise the product has already broken reads as a hang.
    expect(railWaitLine(10_000)).not.toContain('a few seconds');
    expect(railWaitLine(10_000)).toBe('Still reading. A longer caption takes longer.');
  });

  it('gives the measured ceiling to a user who is deciding whether to cancel', () => {
    expect(railWaitLine(25_000)).toBe('Still going. A long caption can take up to half a minute.');
    expect(railWaitLine(120_000)).toBe('Still going. A long caption can take up to half a minute.');
  });

  it('never claims progress', () => {
    // No percentage, no estimate for *this* request, no step implied done. The rail's own docblock
    // forbids inventing progress and this line must not smuggle it back in as prose.
    for (const ms of [0, 5_000, 10_000, 25_000, 60_000]) {
      expect(railWaitLine(ms)).not.toMatch(/\d+\s*%/);
      expect(railWaitLine(ms)).not.toMatch(/almost|nearly|any second|shortly/i);
    }
  });
});
