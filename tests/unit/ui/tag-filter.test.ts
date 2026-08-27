import { describe, expect, it } from 'vitest';

import { isSameTag, isTagActive } from '@/ui/place/tag-filter';

/**
 * Tag identity as the chips use it. This is the predicate that decides whether the chip you are
 * looking at is the one currently filtering — i.e. whether it renders pressed and whether tapping
 * it clears rather than re-applies. Getting it wrong shows up as a chip you cannot switch off.
 */
describe('isSameTag', () => {
  it('is true for the same stored tag', () => {
    expect(isSameTag('hidden gem', 'hidden gem')).toBe(true);
  });

  it('folds case, punctuation and accents, exactly as the rest of the codebase does', () => {
    // `tagKey` is `normalise()` + NFKC — the project's single answer to "are these the same tag?"
    // (`domain/extraction/tags.ts`). A second, quietly different rule here is how a chip ends up
    // unable to clear itself on a row written by an older code path.
    expect(isSameTag('Pan-Asian', 'pan asian')).toBe(true);
    expect(isSameTag('CAFÉ', 'cafe')).toBe(true);
  });

  it('keeps different tags apart, including one that is a prefix of another', () => {
    expect(isSameTag('pan asian', 'asian')).toBe(false);
    expect(isSameTag('hidden gem', 'hidden')).toBe(false);
  });

  it('holds for the Hebrew tags this library actually carries', () => {
    expect(isSameTag('בורקס', 'בורקס')).toBe(true);
    expect(isSameTag('בורקס', 'מאפייה')).toBe(false);
  });
});

describe('isTagActive', () => {
  it('is false when nothing is filtering', () => {
    expect(isTagActive(null, 'hidden gem')).toBe(false);
  });

  it('marks only the chip that is filtering', () => {
    expect(isTagActive('hidden gem', 'hidden gem')).toBe(true);
    expect(isTagActive('hidden gem', 'market stall')).toBe(false);
  });

  it('marks a Hebrew chip the same way', () => {
    expect(isTagActive('מאפייה', 'מאפייה')).toBe(true);
    expect(isTagActive('מאפייה', 'בורקס')).toBe(false);
  });
});
