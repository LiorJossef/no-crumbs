import { describe, expect, it } from 'vitest';

import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  COLLECTION_ITEM_NOTE_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  FORMER_MEMBER_LABEL,
  canEdit,
  canManage,
  isCollectionRole,
  isInviteRole,
  memberLabel,
  validateCollectionDescription,
  validateCollectionName,
  validateItemNote,
} from '@/domain/collections/collection';

describe('validateCollectionName', () => {
  it('trims and collapses interior whitespace', () => {
    // A name is a one-line label; two spellings of one label is how a list starts looking broken.
    expect(validateCollectionName('  Tel  Aviv \n eats  ')).toEqual({
      ok: true,
      value: 'Tel Aviv eats',
    });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateCollectionName('')).toEqual({
      ok: false,
      message: 'Give the collection a name.',
    });
    expect(validateCollectionName('   \n ')).toEqual({
      ok: false,
      message: 'Give the collection a name.',
    });
  });

  it('accepts exactly the limit and rejects one over it', () => {
    const exact = 'a'.repeat(COLLECTION_NAME_MAX_LENGTH);
    expect(validateCollectionName(exact)).toEqual({ ok: true, value: exact });

    const over = validateCollectionName('a'.repeat(COLLECTION_NAME_MAX_LENGTH + 3));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain('3 characters too long');
  });

  it('measures the collapsed name, so nothing it accepts can fail the column CHECK', () => {
    // The CHECK is length(btrim(name)) <= 80. Padding must not count against the user.
    const padded = `   ${'a'.repeat(COLLECTION_NAME_MAX_LENGTH)}   `;
    expect(validateCollectionName(padded).ok).toBe(true);
  });

  it('keeps a Hebrew name intact', () => {
    expect(validateCollectionName(' מסעדות בתל אביב ')).toEqual({
      ok: true,
      value: 'מסעדות בתל אביב',
    });
  });
});

describe('validateCollectionDescription', () => {
  it('turns an empty description into null rather than the empty string', () => {
    expect(validateCollectionDescription('  ')).toEqual({ ok: true, value: null });
  });

  it('preserves newlines, unlike a name', () => {
    expect(validateCollectionDescription('one\n\ntwo')).toEqual({ ok: true, value: 'one\n\ntwo' });
  });

  it('rejects one over the limit', () => {
    const over = validateCollectionDescription('a'.repeat(COLLECTION_DESCRIPTION_MAX_LENGTH + 1));
    expect(over.ok).toBe(false);
  });
});

describe('validateItemNote', () => {
  it('is shorter than a saved place note, because other people read it', () => {
    expect(COLLECTION_ITEM_NOTE_MAX_LENGTH).toBe(500);
    expect(validateItemNote('a'.repeat(COLLECTION_ITEM_NOTE_MAX_LENGTH)).ok).toBe(true);
    expect(validateItemNote('a'.repeat(COLLECTION_ITEM_NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('clears to null', () => {
    expect(validateItemNote('')).toEqual({ ok: true, value: null });
  });
});

describe('role predicates', () => {
  it('lets an owner and an editor contribute, and a viewer not', () => {
    expect(canEdit('owner')).toBe(true);
    expect(canEdit('editor')).toBe(true);
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit(null)).toBe(false);
  });

  it('reserves renaming, sharing and membership for the owner alone', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('editor')).toBe(false);
    expect(canManage('viewer')).toBe(false);
    expect(canManage(null)).toBe(false);
  });

  it('never lets `owner` reach an invite link', () => {
    expect(isInviteRole('editor')).toBe(true);
    expect(isInviteRole('viewer')).toBe(true);
    expect(isInviteRole('owner')).toBe(false);
  });

  it('recognises exactly the three stored values', () => {
    expect(isCollectionRole('owner')).toBe(true);
    expect(isCollectionRole('admin')).toBe(false);
    expect(isCollectionRole(null)).toBe(false);
    expect(isCollectionRole(undefined)).toBe(false);
  });
});

describe('memberLabel', () => {
  it('says "You" for yourself even when you have set a name', () => {
    expect(memberLabel({ displayName: 'Dana', isYou: true })).toBe('You');
  });

  it('uses a set name for someone else', () => {
    expect(memberLabel({ displayName: ' Dana ', isYou: false })).toBe('Dana');
  });

  it('has one honest fallback for the usual case of no name at all', () => {
    // profiles.display_name is null for anyone who signed up through our own form.
    expect(memberLabel({ displayName: null, isYou: false })).toBe('A collaborator');
    expect(memberLabel({ displayName: '   ', isYou: false })).toBe('A collaborator');
  });

  it('distinguishes a nameless member from a deleted one', () => {
    expect(FORMER_MEMBER_LABEL).not.toBe(memberLabel({ displayName: null, isYou: false }));
  });
});
