import { describe, expect, it } from 'vitest';

import { importConfirmationText } from '@/components/map/import-confirmation';

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
