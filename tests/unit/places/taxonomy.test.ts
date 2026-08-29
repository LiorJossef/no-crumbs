/**
 * The taxonomy's own invariants (`domain/places/taxonomy.ts`).
 *
 * None of these are about model behaviour. They are the structural claims the vocabulary makes
 * about itself — that its keys are the canonical form of its labels, that the extraction schema
 * and the display vocabulary agree, and that the prompt cannot offer a tag the pipeline would
 * throw away. Every one of them is the kind of thing that stays true for months and then quietly
 * stops being true in a commit that looked like a rename.
 */
import { describe, expect, it } from 'vitest';

import { canonicaliseTags, tagKey } from '@/domain/extraction/tags';
import { EXTRACTED_CATEGORY_HINTS } from '@/domain/places/category-hint';
import { isProductCategory } from '@/domain/places/product-category';
import {
  MAX_SUB_TAGS_PER_PLACE,
  PRIMARY_CATEGORIES,
  PRIMARY_CATEGORY_SCOPE,
  SUB_TAGS,
  SUB_TAG_ALIAS_PAIRS,
  SUB_TAG_KEYS,
  SUB_TAG_LABELS,
  isPrimaryCategory,
  isSubTag,
  resolveSubTag,
  subTagLabel,
} from '@/domain/places/taxonomy';

describe('sub-tag keys and labels', () => {
  it('keys every label to its own canonical form', () => {
    // The load-bearing one. The model is shown the label and the pipeline stores the key, so a
    // label that does not canonicalise to its own key is a tag the model can emit, the whitelist
    // can accept, and no filter chip can ever find again. `Beer & Pub` is the entry that makes
    // this a real risk rather than a formality: `normalise` drops the ampersand.
    for (const key of SUB_TAG_KEYS) {
      expect(tagKey(SUB_TAGS[key])).toBe(key);
    }
  });

  it('offers the labels in the same order as the keys', () => {
    expect(SUB_TAG_LABELS).toEqual(SUB_TAG_KEYS.map((key) => SUB_TAGS[key]));
  });

  it('carries the fifteen labels the specification lists', () => {
    expect(SUB_TAG_LABELS).toEqual([
      'Italian',
      'Japanese',
      'Asian',
      'Middle Eastern',
      'Mexican',
      'American',
      'Mediterranean',
      'Bakery',
      'Desserts',
      'Specialty Coffee',
      'Brunch',
      'Cocktails',
      'Wine Bar',
      'Beer & Pub',
      'Speakeasy',
    ]);
  });

  it('accepts every one of its own labels through the pipeline that stores them', () => {
    // End to end for one tag at a time: the exact string the prompt shows the model, through
    // `canonicaliseTags`, arriving as the key. A label the prompt offers and the gate drops would
    // be an instruction the product punishes the model for following.
    for (const key of SUB_TAG_KEYS) {
      expect(canonicaliseTags([SUB_TAGS[key]])).toEqual([key]);
    }
  });

  it('renders a stored key back as its label, and says nothing about a tag it does not know', () => {
    expect(subTagLabel('beer pub')).toBe('Beer & Pub');
    expect(subTagLabel('specialty coffee')).toBe('Specialty Coffee');
    // Tags saved under the open vocabulary are still in the database. This returns null rather
    // than inventing a label for them, so a caller has to decide what to do about it.
    expect(subTagLabel('hidden gem')).toBeNull();
  });
});

describe('resolveSubTag', () => {
  it('is the identity on a listed key', () => {
    for (const key of SUB_TAG_KEYS) expect(resolveSubTag(key)).toBe(key);
  });

  it('accepts a spelling variant of a listed label', () => {
    // `Cocktail` **is** `Cocktails`; `Beer and Pub` is `Beer & Pub` with the ampersand written out.
    expect(resolveSubTag('cocktail')).toBe('cocktails');
    expect(resolveSubTag('dessert')).toBe('desserts');
    expect(resolveSubTag('beer and pub')).toBe('beer pub');
    expect(resolveSubTag('bakeries')).toBe('bakery');
    expect(resolveSubTag('speciality coffee')).toBe('specialty coffee');
  });

  it('accepts a term the specification says the label covers', () => {
    // The owner widened the table on 2026-08-29 ("map obvious equivalents"), and the rule that
    // stops that becoming taste is written on `SUB_TAG_ALIASES`: an alias is admitted only where
    // the specification's own coverage text already names the source. Each of these is quoted from
    // it — `Italian (pizza, pasta)`, `Mediterranean (Greek, coastal, seafood)`, `Asian (…,
    // pan-Asian)`, `Japanese (sushi, ramen, izakaya)`, `Mexican (tacos, …)`.
    expect(resolveSubTag('pasta')).toBe('italian');
    expect(resolveSubTag('greek')).toBe('mediterranean');
    expect(resolveSubTag('pan asian')).toBe('asian');
    expect(resolveSubTag('ramen')).toBe('japanese');
    expect(resolveSubTag('tacos')).toBe('mexican');
  });

  it('accepts a Hebrew label as its English equivalent', () => {
    // The prompt requires English and `p11` measured that requirement leaking anyway; five Hebrew
    // tags reached the live library under the open vocabulary.
    expect(resolveSubTag('מאפייה')).toBe('bakery');
    expect(resolveSubTag('מאפים')).toBe('bakery');
  });

  it('does not round a different concept onto its nearest neighbour', () => {
    // The other side of the same rule, and each of these is a real tag from the live library with
    // a tempting neighbour. Nothing says `Wine Bar` covers a wine *style*; `schnitzel` and `matcha`
    // are dishes, which have their own field; `market stall` is a venue type and `marylebone` is a
    // neighbourhood `locality` already holds. Rounding is how a closed vocabulary quietly reopens.
    expect(resolveSubTag('natural wine')).toBeNull();
    expect(resolveSubTag('hidden gem')).toBeNull();
    expect(resolveSubTag('schnitzel')).toBeNull();
    expect(resolveSubTag('matcha')).toBeNull();
    expect(resolveSubTag('market stall')).toBeNull();
    expect(resolveSubTag('marylebone')).toBeNull();
    // The specification gives bare `street food` to Middle Eastern *and* to Mexican, so on its own
    // it names neither — an alias here would pick one at random.
    expect(resolveSubTag('street food')).toBeNull();
    expect(resolveSubTag('')).toBeNull();
  });

  it('resolves every alias to a key that exists, and never off one listed tag onto another', () => {
    for (const [src, dst] of SUB_TAG_ALIAS_PAIRS) {
      expect(isSubTag(dst)).toBe(true);
      expect(resolveSubTag(src)).toBe(dst);
      // A source that is itself a listed tag would silently rewrite good data — a place tagged
      // `Bakery` becoming `Desserts` because someone added a plausible-looking row.
      expect(isSubTag(src)).toBe(false);
    }
  });

  it('keys every alias in the canonical form the gate will hand it', () => {
    // `resolveSubTag` runs *after* `canonicaliseTag`, so an alias keyed `Pan-Asian` would never
    // match anything. Asserted rather than assumed: the table is hand-written.
    for (const [src] of SUB_TAG_ALIAS_PAIRS) expect(tagKey(src)).toBe(src);
  });
});

describe('primary categories', () => {
  it('is the vocabulary the extraction schema emits', () => {
    expect([...EXTRACTED_CATEGORY_HINTS]).toEqual([...PRIMARY_CATEGORIES]);
  });

  it('is a subset of the display vocabulary, so every extracted category can be rendered', () => {
    // `ProductCategory` is deliberately wider — it also reads the resolver's Google taxonomy and
    // rows saved before this narrowing. What must never happen is the reverse: a category the
    // extractor can emit that the renderer has no word for.
    for (const category of PRIMARY_CATEGORIES) expect(isProductCategory(category)).toBe(true);
  });

  it('describes every category it defines, because the prompt is built from that map', () => {
    for (const category of PRIMARY_CATEGORIES) {
      expect(PRIMARY_CATEGORY_SCOPE[category]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('recognises its own values and nothing else', () => {
    expect(isPrimaryCategory('cafe')).toBe(true);
    // The four that left on 2026-08-29. They are still legal `ProductCategory` values and still
    // render; they are no longer things a model may say.
    expect(isPrimaryCategory('bakery')).toBe(false);
    expect(isPrimaryCategory('dessert')).toBe(false);
    expect(isPrimaryCategory('shop')).toBe(false);
    expect(isPrimaryCategory('other')).toBe(false);
    expect(isPrimaryCategory(null)).toBe(false);
  });
});

describe('the cap', () => {
  it('is what canonicaliseTags enforces, not a second opinion about it', () => {
    const everyLabel = [...SUB_TAG_LABELS];
    expect(canonicaliseTags(everyLabel)).toHaveLength(MAX_SUB_TAGS_PER_PLACE);
  });
});
