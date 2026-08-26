import { describe, expect, it } from 'vitest';

import { NOTE_MAX_LENGTH, isNoteUnchanged, validateNote } from '@/domain/places/note';

describe('validateNote', () => {
  it('trims surrounding whitespace and keeps the text', () => {
    expect(validateNote('  going for my birthday  ')).toEqual({
      ok: true,
      value: 'going for my birthday',
    });
  });

  it('turns an empty note into null, not the empty string', () => {
    // Two representations of "no note" is how a detail view starts rendering an empty section.
    expect(validateNote('')).toEqual({ ok: true, value: null });
    expect(validateNote('   ')).toEqual({ ok: true, value: null });
    expect(validateNote('\n\t  \n')).toEqual({ ok: true, value: null });
  });

  it('preserves newlines inside the note', () => {
    // A note is prose, unlike a place name: collapsing its line breaks would rewrite what the
    // user typed.
    expect(validateNote('  first line\n\nsecond line  ')).toEqual({
      ok: true,
      value: 'first line\n\nsecond line',
    });
  });

  it('accepts a note of exactly the limit', () => {
    const exact = 'a'.repeat(NOTE_MAX_LENGTH);
    expect(validateNote(exact)).toEqual({ ok: true, value: exact });
  });

  it('accepts a note that only fits once trimmed', () => {
    // The database checks the value it is given; this checks the trimmed value, and the trimmed
    // value is what gets written. So nothing accepted here can be rejected by the constraint.
    const result = validateNote(`  ${'a'.repeat(NOTE_MAX_LENGTH)}  `);
    expect(result).toEqual({ ok: true, value: 'a'.repeat(NOTE_MAX_LENGTH) });
  });

  it('rejects a note past the limit, saying by how much', () => {
    const result = validateNote('a'.repeat(NOTE_MAX_LENGTH + 7));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('7 characters too long');
    expect(result.message).toContain('2,000');
  });

  it('says "character" rather than "characters" when one over', () => {
    const result = validateNote('a'.repeat(NOTE_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('1 character too long');
    expect(result.message).not.toContain('1 characters');
  });

  it('states the same limit the database enforces', () => {
    // saved_places_note_check is `length(note) <= 2000` (migration 0006). A UI that enforced a
    // smaller number would lie about what the product can store.
    expect(NOTE_MAX_LENGTH).toBe(2000);
  });
});

describe('isNoteUnchanged', () => {
  it('treats both absent forms as no note', () => {
    expect(isNoteUnchanged('', null)).toBe(true);
    expect(isNoteUnchanged('', undefined)).toBe(true);
    expect(isNoteUnchanged('   ', undefined)).toBe(true);
  });

  it('ignores whitespace-only differences', () => {
    expect(isNoteUnchanged('  same text  ', 'same text')).toBe(true);
  });

  it('sees a real edit', () => {
    expect(isNoteUnchanged('new text', 'same text')).toBe(false);
    expect(isNoteUnchanged('first note', undefined)).toBe(false);
  });

  it('sees clearing an existing note as a change', () => {
    expect(isNoteUnchanged('', 'something was here')).toBe(false);
  });

  it('is false for a note that would be rejected, so the UI cannot call it a no-op', () => {
    expect(isNoteUnchanged('a'.repeat(NOTE_MAX_LENGTH + 1), null)).toBe(false);
  });
});
