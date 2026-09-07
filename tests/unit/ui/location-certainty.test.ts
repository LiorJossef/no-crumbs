import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  locationCertainty,
  savedElapsedLine,
  savedOnLine,
  visitedOnLine,
} from '@/ui/place/location-certainty';

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

/**
 * The full C130 ladder from `docs/archive/overnight-copy-deck.md` §4.1, rung by rung.
 *
 * Every rung, not a sample: the copy deck's own reason for writing all twelve out is that a rung
 * with no string is a rung a caller invents at the boundary, and the boundaries are exactly where
 * an elapsed-time helper goes wrong (59 vs 60 seconds, 6 vs 7 days, 34 vs 35, this year vs last).
 *
 * `now` is a fixed instant rather than the clock, which is what makes any of this assertable.
 */
describe('savedElapsedLine — the row\'s elapsed time', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('reads "just now" under a minute, and at the boundary', () => {
    expect(savedElapsedLine(now, now)).toBe('Saved just now');
    expect(savedElapsedLine(ago(59 * SECOND), now)).toBe('Saved just now');
    expect(savedElapsedLine(ago(60 * SECOND), now)).toBe('Saved 1 minute ago');
  });

  it('clamps a future timestamp rather than narrating clock skew', () => {
    // The row is computed against the reader's own clock and the value was written by Postgres.
    // Skew between the two is real; `in 2 hours` would be the product reporting its own plumbing.
    expect(savedElapsedLine(new Date(now.getTime() + 2 * HOUR), now)).toBe('Saved just now');
  });

  it('counts minutes, then hours, then days, with the singular written out', () => {
    // `voice-and-vocabulary.md` §5 bans `place(s)`; the same rule governs `minute(s)`.
    expect(savedElapsedLine(ago(12 * MINUTE), now)).toBe('Saved 12 minutes ago');
    expect(savedElapsedLine(ago(59 * MINUTE), now)).toBe('Saved 59 minutes ago');
    expect(savedElapsedLine(ago(HOUR), now)).toBe('Saved 1 hour ago');
    expect(savedElapsedLine(ago(5 * HOUR), now)).toBe('Saved 5 hours ago');
    expect(savedElapsedLine(ago(23 * HOUR), now)).toBe('Saved 23 hours ago');
    expect(savedElapsedLine(ago(DAY), now)).toBe('Saved 1 day ago');
    expect(savedElapsedLine(ago(3 * DAY), now)).toBe('Saved 3 days ago');
    expect(savedElapsedLine(ago(6 * DAY), now)).toBe('Saved 6 days ago');
  });

  it('reaches every week rung, which is why the ladder ends at 35 days and not 30', () => {
    expect(savedElapsedLine(ago(7 * DAY), now)).toBe('Saved 1 week ago');
    expect(savedElapsedLine(ago(13 * DAY), now)).toBe('Saved 1 week ago');
    expect(savedElapsedLine(ago(14 * DAY), now)).toBe('Saved 2 weeks ago');
    expect(savedElapsedLine(ago(28 * DAY), now)).toBe('Saved 4 weeks ago');
    expect(savedElapsedLine(ago(34 * DAY), now)).toBe('Saved 4 weeks ago');
  });

  it('hands off to the date at 35 days, in the format §5 fixes', () => {
    // `Saved 5 months ago` is vaguer than `Saved 3 Aug`, no shorter, and invents a rung. The date
    // is short-month per `voice-and-vocabulary.md` §5 — `3 Aug` within the year.
    expect(savedElapsedLine(ago(35 * DAY), now)).toBe('Saved 27 Jul');
    expect(savedElapsedLine(new Date('2026-01-03T09:00:00Z'), now)).toBe('Saved 3 Jan');
  });

  it('adds the year once it is not this one', () => {
    expect(savedElapsedLine(new Date('2025-08-03T09:00:00Z'), now)).toBe('Saved 3 Aug 2025');
  });

  it('never uses a word where the ladder uses a digit', () => {
    // No `yesterday`, no `last week`. One word form inside a numeric ladder is a special case a
    // verifier has to remember and a translator has to restructure.
    for (const days of [1, 2, 6, 7, 8, 20, 34]) {
      const line = savedElapsedLine(ago(days * DAY), now);
      expect(line).not.toContain('yesterday');
      expect(line).not.toContain('last');
      expect(line).toMatch(/\d/);
    }
  });
});
