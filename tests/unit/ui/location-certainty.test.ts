import { describe, expect, it } from 'vitest';

import { locationCertainty, savedOnLine } from '@/ui/place/location-certainty';

describe('locationCertainty', () => {
  it('says plainly that a model-guessed coordinate is approximate, and what that costs', () => {
    const certainty = locationCertainty('llm-guess');
    expect(certainty?.label).toBe('Approximate location');
    expect(certainty?.isApproximate).toBe(true);
    expect(certainty?.detail).toContain('street or two');
    // One dash in the rendered line, not two: the label and the sentence are joined by an em dash.
    expect(certainty?.detail).not.toContain('—');
  });

  it('names the provider where one was actually used', () => {
    // Attribution is a Google terms requirement, and "matched" is more believable with a "to what".
    expect(locationCertainty('google-places')?.label).toBe('Matched on Google Maps');
    expect(locationCertainty('overture-places')?.label).toBe('Matched in Overture Maps');
    expect(locationCertainty('google-places')?.isApproximate).toBe(false);
  });

  it('says nothing at all when the row carries no provenance', () => {
    // Five of the thirty-one live rows. Inventing a third label would be inventing a claim.
    expect(locationCertainty(null)).toBeNull();
    expect(locationCertainty(undefined)).toBeNull();
    expect(locationCertainty('')).toBeNull();
    expect(locationCertainty('something-new')).toBeNull();
  });

  it('never carries a confidence number', () => {
    // The review screen bans them by rule; `resolution_score` is a diagnostic, not a probability.
    for (const dataset of ['llm-guess', 'google-places', 'overture-places']) {
      const certainty = locationCertainty(dataset);
      expect(`${certainty?.label} ${certainty?.detail ?? ''}`).not.toMatch(/\d+\s*%/);
    }
  });
});

describe('savedOnLine', () => {
  it('leaves the year off within the current year', () => {
    expect(savedOnLine(new Date('2026-08-24T10:00:00Z'), new Date('2026-08-29T10:00:00Z'))).toBe(
      'Saved on 24 August',
    );
  });

  it('adds the year once it is no longer this one', () => {
    expect(savedOnLine(new Date('2025-12-31T10:00:00Z'), new Date('2026-08-29T10:00:00Z'))).toBe(
      'Saved on 31 December 2025',
    );
  });
});
