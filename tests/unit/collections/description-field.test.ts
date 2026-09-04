import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  validateCollectionDescription,
} from '@/domain/collections/collection';

/**
 * The collection description was queried, mapped and rendered (W5-6) while **no code path could put
 * anything in the column**: the create hook passed `''` and the edit form passed the collection's
 * own value straight back. This pins the four properties of the fix that a later edit could undo
 * without failing anything else, from `overnight-copy-deck.md` §12.6.
 *
 * Source text for the three that are facts about what is *written* — `vitest.config.ts` runs in
 * node and this is a client component with no DOM here — and the real function for the one that is
 * a fact about behaviour.
 */
const FORM = 'src/components/collections/collection-content.tsx';

describe('the collection description can be written', () => {
  const source = readFileSync(FORM, 'utf8');

  it('sends the field, not the collection it was seeded from', () => {
    // The defect this replaces, exactly: `updateCollection(id, name, collection.description ?? '')`
    // typechecks, saves, and can never change the column.
    expect(source).toContain('updateCollection(collection.id, name, description)');
    expect(source).not.toMatch(/updateCollection\([^)]*collection\.description/s);
  });

  it('is a textarea, because the domain preserves newlines', () => {
    // `validateCollectionDescription` says so in its own docblock: "Newlines survive; it is prose,
    // not a label." A single-line input silently forbids them.
    expect(source).toContain('<Textarea');
  });

  it('imports both limits rather than retyping them', () => {
    expect(source).toContain('maxLength={COLLECTION_NAME_MAX_LENGTH}');
    expect(source).toContain('maxLength={COLLECTION_DESCRIPTION_MAX_LENGTH}');
    expect(source).not.toMatch(/maxLength=\{\d+\}/);
  });

  it('holds a string while the column holds null', () => {
    // Why the form may carry `''` and the column may not: a cleared description has to arrive as
    // absent, or both render sites draw an empty paragraph. `collection.test.ts` already pins
    // empty-to-null; what is asserted here is the pairing — the form seeds from `?? ''` in exactly
    // one place, and the validator is what puts the `null` back.
    expect(source).toContain("useState(collection.description ?? '')");
    expect(validateCollectionDescription(' Places from the Lisbon trip ')).toEqual({
      ok: true,
      value: 'Places from the Lisbon trip',
    });
  });

  it('writes no second message for an over-long description', () => {
    const result = validateCollectionDescription('x'.repeat(COLLECTION_DESCRIPTION_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
    // The form renders whatever the action returns and invents nothing of its own.
    expect(source).not.toContain('too long');
  });
});
