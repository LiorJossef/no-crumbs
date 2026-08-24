import { describe, expect, it } from 'vitest';

import { decideCaptionSaveOutcome } from '@/domain/import/caption-save-outcome';

describe('decideCaptionSaveOutcome', () => {
  it('proceeds silently when there was nothing to save at all (empty candidate list)', () => {
    expect(decideCaptionSaveOutcome({ saved: 0, skipped: 0, failed: 0 })).toEqual({ kind: 'proceed' });
  });

  it('proceeds silently on a full success', () => {
    expect(decideCaptionSaveOutcome({ saved: 3, skipped: 0, failed: 0 })).toEqual({ kind: 'proceed' });
  });

  it('is skip_only when every candidate had no coordinates — no save attempted, distinct from proceed', () => {
    const outcome = decideCaptionSaveOutcome({ saved: 0, skipped: 3, failed: 0 });
    expect(outcome.kind).toBe('skip_only');
    expect(outcome).not.toEqual({ kind: 'proceed' });
    if (outcome.kind === 'skip_only') {
      expect(outcome.message).toMatch(/couldn.t pin a location/i);
    }
  });

  it('is hard_failure when every attempted save failed', () => {
    const outcome = decideCaptionSaveOutcome({ saved: 0, skipped: 0, failed: 2 });
    expect(outcome.kind).toBe('hard_failure');
    if (outcome.kind === 'hard_failure') {
      expect(outcome.message).toMatch(/couldn.t save that place/i);
    }
  });

  it('is hard_failure (not skip_only) when some were skipped and the rest failed, none saved', () => {
    const outcome = decideCaptionSaveOutcome({ saved: 0, skipped: 1, failed: 2 });
    expect(outcome.kind).toBe('hard_failure');
  });

  it('is partial_failure when some saved and some failed, and reports exact counts', () => {
    const outcome = decideCaptionSaveOutcome({ saved: 2, skipped: 0, failed: 1 });
    expect(outcome.kind).toBe('partial_failure');
    if (outcome.kind === 'partial_failure') {
      expect(outcome.message).toBe("Saved 2 of 3 places — 1 couldn't be saved.");
    }
  });

  it('is partial_failure (not proceed) even when some candidates were also skipped', () => {
    const outcome = decideCaptionSaveOutcome({ saved: 1, skipped: 1, failed: 1 });
    expect(outcome.kind).toBe('partial_failure');
  });
});
