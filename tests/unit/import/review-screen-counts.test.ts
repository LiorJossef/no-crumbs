/**
 * S4 — the review screen told the user two different numbers.
 *
 * Photographed at 390×844: the H1 read **`3 places found`** and the line directly beneath it read
 * **`1 of 2 selected`**. Both were locally true. The relationship between them was nowhere on the
 * screen, so a reader could not tell whether the product had lost a place, was hiding one, or was
 * broken.
 *
 * That is `overnight-run-plan.md` §8a's **Q3** one layer up from a false claim — not a lie, but two
 * counts silently changing population between adjacent lines. It survived W6-4, which is the
 * package that reworked this exact card, so it is pinned here rather than left to be re-found.
 *
 * **The mechanism was not the capped candidate**, which is what everyone including me assumed. A
 * capped candidate is saveable and merely arrives unticked (W1-4), so it was always in the
 * denominator. The one that fell out was an `ambiguous` card with a real shortlist and no model
 * pin: `willSave` is false for it until the user picks. It was in the headline and not in the
 * denominator, and nothing said so.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseDevScreen } from '@/app/import/_lib/dev-screen';
import { isSaveable } from '@/domain/import/candidate-presentation';
import {
  arrivesTicked,
  provenanceBadge,
  resolutionView,
  willSave,
} from '@/ui/import/candidate-resolution-view';

const SCREEN = readFileSync('src/app/import/screens/review/review-screen.tsx', 'utf8');
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The screen's own arithmetic, over the dev fixture, which is shaped to hold all three states. */
function screenState() {
  const screen = parseDevScreen('review');
  if (screen?.kind !== 'caption_preview') throw new Error('expected the review screen');
  const candidates = screen.probe.candidates;
  const views = candidates.map((c) => resolutionView(c.resolution));
  const saveable = candidates.map((c, i) => willSave(isSaveable(c), views[i]!, null));
  const ticked = candidates.map((c, i) => arrivesTicked(isSaveable(c), views[i]!));
  return { candidates, views, saveable, ticked };
}

describe('the two counts describe the same population', () => {
  it('uses the headline’s number as the denominator', () => {
    // `n` is `probe.candidates.length` — the number the H1 renders. One population, one
    // denominator, and the two lines can no longer disagree about how many places there are.
    expect(CODE).toContain('{selectedCount} of {n} selected');
    expect(CODE).not.toContain('{selectedCount} of {saveableIndices.length} selected');
  });

  it('has a fixture where the old shape really did contradict itself', () => {
    // A guard that cannot fail is decoration. This asserts the defect was real and would come back
    // if the denominator were switched: three candidates, two of them saveable.
    const { candidates, saveable } = screenState();
    expect(candidates.length).toBe(3);
    expect(saveable.filter(Boolean).length).toBe(2);
    expect(candidates.length).not.toBe(saveable.filter(Boolean).length);
  });

  it('was the ambiguous candidate that fell out, not the capped one', () => {
    // Worth pinning because the wrong mechanism was assumed twice. A capped candidate is saveable
    // and merely unticked; an `ambiguous` one with no model pin is not saveable until picked.
    const { views, saveable, ticked } = screenState();
    const capped = views.findIndex((v) => v.kind === 'capped');
    const ambiguous = views.findIndex((v) => v.kind === 'ambiguous');
    expect(saveable[capped]).toBe(true);
    expect(ticked[capped]).toBe(false);
    expect(saveable[ambiguous]).toBe(false);
  });
});

describe('every place in the headline count accounts for itself', () => {
  it('gives each unticked candidate a badge that says why', () => {
    // Property 1 of the fix: a reader can account for every place in the headline. Each card
    // carries its own reason in the badge slot W6-4 promoted — `Needs your pick` on the one waiting
    // for a decision, `Not checked` on the one nobody looked up.
    const { candidates, views, ticked } = screenState();
    const reasons = candidates
      .map((c, i) => (ticked[i] ? null : provenanceBadge(isSaveable(c), views[i]!, null)?.label))
      .filter((label): label is string => label !== null && label !== undefined);
    expect(reasons).toEqual(['Needs your pick', 'Not checked']);
    // And every unticked candidate has one — no card is silently unaccounted for.
    expect(reasons).toHaveLength(ticked.filter((t) => !t).length);
  });

  it('does not square the numbers by dropping the capped candidate from the headline', () => {
    // Property 2, and the one `resolution-record.ts` makes non-negotiable: a capped candidate is
    // kept and visible rather than silently dropped. Making `3` into `2` would be W1-4 in reverse —
    // the least-verified card disappearing into a default, from the other direction.
    const { candidates, views } = screenState();
    expect(views.some((v) => v.kind === 'capped')).toBe(true);
    expect(CODE).toContain('const n = probe.candidates.length');
    expect(candidates.length).toBe(3);
  });

  it('still selects and saves over the saveable set, not the headline set', () => {
    // Property 3 of the shape: only the *displayed* denominator changed. `Select all`, the
    // all-selected test and the confirm payload are all still `saveableIndices`, because a card
    // that cannot be saved must not be tickable and must not reach the request.
    expect(CODE).toContain('setSelected(allSelected ? new Set() : new Set(saveableIndices))');
    expect(CODE).toContain('selectedCount === saveableIndices.length && saveableIndices.length > 0');
    expect(CODE).toMatch(/saveableIndices\s*\.filter\(\(i\) => selected\.has\(i\)\)/);
  });

  it('introduces no new word for the gap', () => {
    // The fix is arithmetic and hierarchy, not copy. Every label a reader sees for an unticked
    // card is one `overnight-copy-deck.md` §3.2 already ruled.
    // `skippedNotice` is deliberately not on this list: it is a shipped, ruled string about
    // candidates with no location at all, and it says a different true thing.
    for (const invented of ['unavailable', 'excluded', 'not selectable', 'unsupported', 'can’t be saved']) {
      expect(CODE.toLowerCase(), invented).not.toContain(invented.toLowerCase());
    }
  });
});
