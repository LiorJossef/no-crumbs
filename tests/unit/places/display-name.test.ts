import { describe, expect, it } from 'vitest';

import {
  DISPLAY_NAME_MAX_LENGTH,
  isDisplayNameUnchanged,
  validateDisplayName,
} from '@/domain/places/display-name';

describe('validateDisplayName', () => {
  it('trims and collapses, because a name is a one-line label', () => {
    expect(validateDisplayName('  Anat  Bakery \n ')).toEqual({ ok: true, value: 'Anat Bakery' });
  });

  it('treats empty as "use the real name again", not as the empty string', () => {
    // NULL is what makes the read path fall back to places.name — and keep falling back to it if
    // that name later improves. Freezing today's value would opt the place out of every future fix.
    expect(validateDisplayName('')).toEqual({ ok: true, value: null });
    expect(validateDisplayName('   ')).toEqual({ ok: true, value: null });
  });

  it('accepts exactly the column limit and rejects one over it', () => {
    const exact = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(exact)).toEqual({ ok: true, value: exact });
    const over = validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 2));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain('2 characters too long');
  });

  it('measures the cleaned name, so nothing it accepts can fail the column CHECK', () => {
    expect(validateDisplayName(`  ${'a'.repeat(DISPLAY_NAME_MAX_LENGTH)}  `).ok).toBe(true);
  });

  it('keeps a Hebrew name intact', () => {
    expect(validateDisplayName(' מאפיית ענת ')).toEqual({ ok: true, value: 'מאפיית ענת' });
  });
});

describe('isDisplayNameUnchanged', () => {
  it('compares against the stored override, with both empties equal', () => {
    expect(isDisplayNameUnchanged('', null)).toBe(true);
    expect(isDisplayNameUnchanged('  ', null)).toBe(true);
    expect(isDisplayNameUnchanged('Anat Bakery', 'Anat Bakery')).toBe(true);
    expect(isDisplayNameUnchanged('Anat', 'Anat Bakery')).toBe(false);
    // Clearing a place that has an override IS a change: it restores the real name.
    expect(isDisplayNameUnchanged('', 'Anat Bakery')).toBe(false);
  });

  it('is never "unchanged" when the value could not be saved anyway', () => {
    expect(isDisplayNameUnchanged('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1), null)).toBe(false);
  });
});
