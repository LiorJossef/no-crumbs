import { describe, expect, it } from 'vitest';
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_CATEGORY_ORDER,
  isProductCategory,
  productCategoryFor,
  productCategoryFromProvider,
} from '@/domain/places/product-category';

/**
 * The provider strings below are real values, not invented ones: every one appears in the Tel Aviv
 * Overture extract loaded into `poi_index`, or in Google Places' `primaryType`. The point of the
 * mapping is that it is right about the data we actually receive.
 */
describe('productCategoryFromProvider', () => {
  it('reads the long tail through suffix rules rather than a table', () => {
    // 130+ distinct `*_restaurant` values exist in the Tel Aviv extract alone. None of them is
    // enumerated in the exceptions table, and all of them must still be restaurants.
    for (const raw of [
      'italian_restaurant',
      'middle_eastern_restaurant',
      'himalayan_nepalese_restaurant',
      'molecular_gastronomy_restaurant',
      'fish_and_chips_restaurant',
    ]) {
      expect(productCategoryFromProvider(raw)).toBe('restaurant');
    }
    expect(productCategoryFromProvider('cocktail_bar')).toBe('bar');
    expect(productCategoryFromProvider('sports_bar')).toBe('bar');
    expect(productCategoryFromProvider('health_food_store')).toBe('shop');
    expect(productCategoryFromProvider('seafood_market')).toBe('shop');
  });

  it('is right about the values a suffix rule would get wrong', () => {
    // Each of these is why the exceptions table exists. A naive `endsWith` would file the first
    // three as shops and the last two as bars.
    expect(productCategoryFromProvider('coffee_shop')).toBe('cafe');
    expect(productCategoryFromProvider('ice_cream_shop')).toBe('dessert');
    expect(productCategoryFromProvider('bagel_shop')).toBe('bakery');
    // A real production row, 2026-08-29: Google returns `pastry_shop` for a patisserie.
    expect(productCategoryFromProvider('pastry_shop')).toBe('bakery');
    expect(productCategoryFromProvider('smoothie_juice_bar')).toBe('dessert');
    expect(productCategoryFromProvider('salad_bar')).toBe('restaurant');
  });

  it('reads a pub as a bar even though it has no _bar to match on', () => {
    expect(productCategoryFromProvider('pub')).toBe('bar');
    expect(productCategoryFromProvider('irish_pub')).toBe('bar');
    expect(productCategoryFromProvider('gastropub')).toBe('bar');
  });

  it('returns null for a category that is not a place to eat, rather than guessing', () => {
    // `poi_index` is not filtered to food and drink on the way in, so a resolver can hand us any
    // of these. Guessing `shop` for a barber would be inventing a fact about the place.
    for (const raw of ['barber', 'notary_public', 'topic_publisher', 'professional_sports_team']) {
      expect(productCategoryFromProvider(raw)).toBeNull();
    }
  });

  it('treats absent, blank and unknown alike — all null', () => {
    expect(productCategoryFromProvider(null)).toBeNull();
    expect(productCategoryFromProvider(undefined)).toBeNull();
    expect(productCategoryFromProvider('   ')).toBeNull();
    expect(productCategoryFromProvider('something_we_have_never_seen')).toBeNull();
  });

  it('is case- and whitespace-insensitive, because two providers write it two ways', () => {
    expect(productCategoryFromProvider('  Ice_Cream_Shop ')).toBe('dessert');
  });
});

describe('productCategoryFor', () => {
  it('shows Gelalucci as a dessert, which is the bug this module was written for', () => {
    // Real row, read out of the local database on 2026-08-28: the model said `shop` because the
    // caption is about ice cream, the provider said `ice_cream_shop`, and the library rendered
    // "Shop".
    expect(
      productCategoryFor({ providerCategory: 'ice_cream_shop', extractedHint: 'shop' })
    ).toBe('dessert');
  });

  it('prefers the provider over the model, because the venue outranks a caption', () => {
    expect(
      productCategoryFor({ providerCategory: 'coffee_shop', extractedHint: 'restaurant' })
    ).toBe('cafe');
  });

  it('falls through to the model when the provider string is unreadable, not to other', () => {
    // The important half of this: an unreadable provider category must not *consume* the slot and
    // lose a category we do have.
    expect(productCategoryFor({ providerCategory: 'barber', extractedHint: 'cafe' })).toBe('cafe');
    expect(productCategoryFor({ providerCategory: null, extractedHint: 'bakery' })).toBe('bakery');
  });

  it('lets the user overrule both', () => {
    expect(
      productCategoryFor({ override: 'bar', providerCategory: 'ice_cream_shop', extractedHint: 'shop' })
    ).toBe('bar');
  });

  it('keeps an unparseable override outranking the system, at other', () => {
    // `category_override` is free text with no CHECK. If a user has written something we cannot
    // render, the answer is not to quietly go back to disagreeing with them.
    expect(
      productCategoryFor({ override: 'my favourite', providerCategory: 'coffee_shop' })
    ).toBe('other');
  });

  it('is total — no claims at all still yields a renderable category', () => {
    expect(productCategoryFor({})).toBe('other');
    expect(productCategoryFor({ override: null, providerCategory: null, extractedHint: null })).toBe(
      'other'
    );
  });
});

describe('the vocabulary itself', () => {
  it('labels every value, in one table', () => {
    for (const category of PRODUCT_CATEGORY_ORDER) {
      expect(PRODUCT_CATEGORY_LABEL[category]).toBeTruthy();
    }
    expect(Object.keys(PRODUCT_CATEGORY_LABEL).sort()).toEqual([...PRODUCT_CATEGORY_ORDER].sort());
  });

  it('accepts every extraction hint, so widening one vocabulary never orphans a place', () => {
    // The superset claim in the module header, checked at runtime as well as at compile time.
    for (const hint of ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other']) {
      expect(isProductCategory(hint)).toBe(true);
    }
  });

  it('rejects a raw provider string as a product category', () => {
    expect(isProductCategory('ice_cream_shop')).toBe(false);
    expect(isProductCategory(null)).toBe(false);
  });
});
