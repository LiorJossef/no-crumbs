/**
 * The bulk take-out's words (round 3 §8.2).
 *
 * These tests are about a **safety** property, not about strings for their own sake.
 * `docs/ux-two-removals-one-screen.md` defines two removals that must stay distinguishable:
 * `Delete from your places` is irreversible, `Take out of this collection` is not. The verbs
 * diverge at the first character on purpose, and the reassurance *it stays in your places* is the
 * whole of the distinction — so it must never be printed when it is false.
 */

import { describe, expect, it } from 'vitest';

import {
  TAKE_OUT_CONFIRM_LABEL,
  TAKE_OUT_LABEL,
  selectionCountLabel,
  takeOutBody,
  takeOutOutcomeMessage,
  takeOutPrompt,
} from '@/components/collections/bulk-removal';

describe('the two removals stay two', () => {
  it('never says Delete or Remove on the reversible one', () => {
    for (const copy of [
      TAKE_OUT_LABEL,
      TAKE_OUT_CONFIRM_LABEL,
      takeOutPrompt(3),
      takeOutBody({ count: 3, allSavedByViewer: true }),
      takeOutBody({ count: 3, allSavedByViewer: false }),
    ]) {
      expect(copy.toLowerCase()).not.toMatch(/\b(delete|remove|deleted|removed)\b/);
    }
  });

  it('says the product name nowhere — invite copy is not the only place it is banned', () => {
    for (const copy of [TAKE_OUT_LABEL, takeOutPrompt(2), selectionCountLabel(2)]) {
      expect(copy.toLowerCase()).not.toContain('no crumbs');
    }
  });

  it('uses the ratified noun and no synonym for it', () => {
    expect(takeOutPrompt(2)).toContain('collection');
    for (const copy of [TAKE_OUT_LABEL, takeOutPrompt(2)]) {
      expect(copy.toLowerCase()).not.toMatch(/\b(list|board|folder|album)\b/);
    }
  });
});

describe('takeOutPrompt', () => {
  it('counts in whole places, singular and plural', () => {
    expect(takeOutPrompt(1)).toBe('Take 1 place out of this collection?');
    expect(takeOutPrompt(4)).toBe('Take 4 places out of this collection?');
  });
});

describe('takeOutBody', () => {
  it('promises the places stay in your library only when that is true of all of them', () => {
    expect(takeOutBody({ count: 3, allSavedByViewer: true })).toBe(
      'Nobody here will see them any more. They stay in your places.',
    );
    // A mixed selection gets the first sentence alone. A sentence true of four places out of six
    // is a false sentence, and this one is the difference between the two removals.
    expect(takeOutBody({ count: 3, allSavedByViewer: false })).toBe(
      'Nobody here will see them any more.',
    );
  });

  it('agrees with itself at one', () => {
    expect(takeOutBody({ count: 1, allSavedByViewer: true })).toBe(
      'Nobody here will see it any more. It stays in your places.',
    );
  });
});

describe('takeOutOutcomeMessage', () => {
  it('says nothing when everything asked for went', () => {
    // The list itself is the confirmation; a toast repeating it is noise.
    expect(takeOutOutcomeMessage({ removed: 4, requested: 4 })).toBeNull();
    expect(takeOutOutcomeMessage({ removed: 0, requested: 0 })).toBeNull();
  });

  it('reports a partial run rather than smoothing it', () => {
    // `.in()` under RLS matches the rows the policy allows and silently matches zero of the rest,
    // so this is a real outcome: somebody else took a place out while this screen was open.
    expect(takeOutOutcomeMessage({ removed: 3, requested: 4 })).toBe(
      'Took 3 places out. The other one was already gone.',
    );
    expect(takeOutOutcomeMessage({ removed: 1, requested: 4 })).toBe(
      'Took 1 place out. The other 3 were already gone.',
    );
  });

  it('says so plainly when nothing matched', () => {
    expect(takeOutOutcomeMessage({ removed: 0, requested: 1 })).toBe(
      'That place was already out of this collection.',
    );
    expect(takeOutOutcomeMessage({ removed: 0, requested: 3 })).toBe(
      'Those places were already out of this collection.',
    );
  });
});

describe('selectionCountLabel', () => {
  it('counts without repeating the noun the list is made of', () => {
    expect(selectionCountLabel(0)).toBe('None selected');
    expect(selectionCountLabel(1)).toBe('1 selected');
    expect(selectionCountLabel(6)).toBe('6 selected');
  });
});
