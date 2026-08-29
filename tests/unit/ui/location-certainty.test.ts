import { afterEach, describe, expect, it, vi } from 'vitest';

import { locationCertainty, savedOnLine, visitedOnLine } from '@/ui/place/location-certainty';

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

describe('visitedOnLine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a month, not a day', () => {
    // `visited_at` is when the mark was made in this app. A to-the-day date on a record-keeping
    // timestamp reads as a claim about the visit itself.
    expect(visitedOnLine(new Date('2026-08-24T10:00:00Z'), new Date('2026-08-29T10:00:00Z'))).toBe(
      'Marked as been in August',
    );
  });

  it('adds the year once it is no longer this one', () => {
    expect(visitedOnLine(new Date('2025-12-31T10:00:00Z'), new Date('2026-08-29T10:00:00Z'))).toBe(
      'Marked as been in December 2025',
    );
  });

  it('says nothing when the row has no timestamp', () => {
    // `0006`'s CHECK only forbids a timestamp without the state, so `visited` with a null
    // `visited_at` is a real row. Guessing a month for it would be inventing the fact.
    expect(visitedOnLine(null, new Date('2026-08-29T10:00:00Z'))).toBeNull();
    expect(visitedOnLine(undefined, new Date('2026-08-29T10:00:00Z'))).toBeNull();
  });

  it('says "marked", never "you went"', () => {
    // The product may not claim a visit date the user never gave it.
    const line = visitedOnLine(new Date('2026-03-02T10:00:00Z'), new Date('2026-08-29T10:00:00Z'));
    expect(line).toContain('Marked as been');
    expect(line).not.toMatch(/you (went|visited|were)/i);
  });

  it('pins the locale, so a Hebrew-defaulting device still reads English', () => {
    // The device's own locale must not leak into a line the rest of the sentence is English in —
    // dropping the locale argument is exactly how "August" becomes "אוגוסט" mid-phrase, and it is
    // invisible on an en-GB machine. This asserts the argument is passed, not that ICU works.
    const format = vi.spyOn(Date.prototype, 'toLocaleDateString');
    visitedOnLine(new Date('2026-08-24T10:00:00Z'), new Date('2026-08-29T10:00:00Z'));
    expect(format).toHaveBeenCalledWith('en-GB', expect.objectContaining({ month: 'long' }));
  });

  it('carries a non-Latin month name through unharmed if one ever reaches it', () => {
    // Node here is en-GB and the locale is pinned, so a Hebrew month cannot arrive today. Standing
    // in one anyway is what proves the line is a plain concatenation: no slicing, no casing, no
    // assumption that a month name is ASCII. A `he` build of this string is a copy decision, and
    // it must not also be a crash.
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('אוגוסט');
    expect(visitedOnLine(new Date('2026-08-24T10:00:00Z'), new Date('2026-08-29T10:00:00Z'))).toBe(
      'Marked as been in אוגוסט',
    );
  });
});
