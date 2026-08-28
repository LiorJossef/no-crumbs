/**
 * The render-time decisions behind extraction v2's three new fields (`src/ui/place/enrichment.ts`).
 *
 * Every string in here is a real one: the tags, quotes and sentences come from the four captions
 * this database actually holds, because the whole point of the `whyGo` rule is how it behaves on
 * the output the model really produces rather than on something invented to make it pass.
 *
 * There is no component test alongside this: the unit tier runs in `environment: 'node'` with no
 * DOM and no testing-library, which is exactly why every judgement worth asserting was put in a
 * pure module and the `.tsx` left holding only markup. The rendering itself is verified in a
 * browser at both breakpoints.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_ROW_TAGS,
  MIN_NEW_WORDS,
  ROW_TAG_PIXEL_BUDGET,
  enrichmentOf,
  newWordCount,
  rowAccessibleName,
  splitRowTags,
  whyGoEarnsItsPlace,
} from '@/ui/place/enrichment';
import type { Spot } from '@/domain/places/spot';

const BARE_SPOT: Spot = {
  id: 'a4c1f0a4-0000-4000-8000-000000000001',
  placeId: 'a4c1f0a4-0000-4000-8000-0000000000f1',
  name: 'The Laughing Yak',
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 51.4682,
  lng: -0.0689,
  visitState: 'want_to_go',
};

describe('enrichmentOf', () => {
  it('gives an empty shape for a spot that carries none of the v2 fields', () => {
    // The state of all twenty rows in the database today: nothing was backfilled, so this is the
    // normal path, not a defensive one.
    expect(enrichmentOf(BARE_SPOT)).toEqual({ tags: [], whyGo: null, dishes: [] });
  });

  it('gives an empty shape for a place built without a spot at all', () => {
    expect(enrichmentOf(undefined)).toEqual({ tags: [], whyGo: null, dishes: [] });
  });

  it('reads the three fields when the read path populated them', () => {
    const spot = {
      ...BARE_SPOT,
      tags: ['nepalese', 'market stall'],
      whyGo: 'The momos sell out before two.',
      dishes: ['momos'],
    } as Spot;

    expect(enrichmentOf(spot)).toEqual({
      tags: ['nepalese', 'market stall'],
      whyGo: 'The momos sell out before two.',
      dishes: ['momos'],
    });
  });
});

describe('splitRowTags', () => {
  it('shows everything and offers no count when the list fits', () => {
    expect(splitRowTags(['nepalese', 'market stall'])).toEqual({
      shown: ['nepalese', 'market stall'],
      overflow: 0,
    });
  });

  it('keeps the widest prefix that fits — the extractor emits tags most-salient-first and the database preserves that order', () => {
    // The real Kiaans Tooting list. Two whole chips, not three squeezed ones: `Pan Asian` (65 px)
    // + `Market Stall` (81 px) + `Hidden Gem` (70 px) is 216 px against a list column measured at
    // **192 px** on desktop. One budget has to serve both breakpoints and it has to be the
    // narrower one, so a phone — whose column is ~294 px and could hold all three — shows two as
    // well. That is the trade, stated: a whole label on both surfaces beats a third label that
    // only fits on one of them.
    expect(
      splitRowTags(['pan asian', 'market stall', 'hidden gem', 'street food', 'late night']),
    ).toEqual({
      shown: ['pan asian', 'market stall'],
      overflow: 3,
    });
  });

  it('drops a tag that would only fit by truncating, rather than truncating all three', () => {
    // The real Sycamore list, and the reason the character budget exists at all: at 390 px these
    // three chips fitted only as `Seasonal I… Hotel Resta… Modern Italian Sma…`, which is less
    // readable than two whole labels and a count. Verified on screen, not only here.
    expect(
      splitRowTags(['seasonal italian', 'hotel restaurant', 'modern italian small plates']),
    ).toEqual({
      shown: ['seasonal italian', 'hotel restaurant'],
      overflow: 1,
    });
  });

  it('still shows the first tag when that tag alone blows the budget', () => {
    // The one unavoidable ellipsis: the alternative is a row that says `+1` and nothing else.
    expect(splitRowTags(['modern israeli tasting counter', 'natural wine'])).toEqual({
      shown: ['modern israeli tasting counter'],
      overflow: 1,
    });
  });

  it('fits three short Hebrew tags, which are shorter than their Latin equivalents', () => {
    expect(splitRowTags(['בורקס', 'מאפייה', 'hidden gem'])).toEqual({
      shown: ['בורקס', 'מאפייה', 'hidden gem'],
      overflow: 0,
    });
  });

  it('never reports a negative overflow for an empty list', () => {
    expect(splitRowTags([])).toEqual({ shown: [], overflow: 0 });
  });

  it('never shows more than its published count cap, however short the tags', () => {
    expect(splitRowTags(['a1', 'b2', 'c3', 'd4', 'e5']).shown).toHaveLength(MAX_ROW_TAGS);
    expect(ROW_TAG_PIXEL_BUDGET).toBe(205);
  });

  it('counts a chip\'s own padding, not just its characters', () => {
    // Measured on this database after `Kohi Coffee Shop` was saved. 30 characters total, which sat
    // well inside the old 34-character budget — and rendered as three truncated chips, the exact
    // outcome the budget exists to prevent. Three chips cost three lots of padding.
    expect(splitRowTags(['japanese', 'specialty coffee', 'bakery'])).toEqual({
      shown: ['japanese', 'specialty coffee'],
      overflow: 1,
    });
  });
});

describe('rowAccessibleName', () => {
  it('is unchanged for a place with no tags', () => {
    expect(rowAccessibleName('HaKosem', [])).toBe('Open HaKosem');
  });

  it('names the tags a sighted user can see, in display casing', () => {
    // `aria-label` replaces the button's contents, so a chip inside it is announced nowhere else.
    expect(rowAccessibleName('Kiaans Tooting', ['pan asian', 'market stall'])).toBe(
      'Open Kiaans Tooting, tagged Pan Asian, Market Stall',
    );
  });

  it('counts the tags it did not name rather than reading all five', () => {
    expect(
      rowAccessibleName('Kiaans Tooting', [
        'pan asian',
        'market stall',
        'hidden gem',
        'street food',
        'late night',
      ]),
    ).toBe('Open Kiaans Tooting, tagged Pan Asian, Market Stall and 3 more');
  });

  it('carries a Hebrew tag through unchanged — there is no casing to apply', () => {
    expect(rowAccessibleName('Anat Bakery', ['בורקס'])).toBe('Open Anat Bakery, tagged בורקס');
  });
});

describe('newWordCount', () => {
  it('ignores connectives, so a sentence built only from them adds nothing', () => {
    expect(newWordCount('It is in the market.', ['market'])).toBe(0);
  });

  it('folds punctuation and case the way the rest of the codebase does', () => {
    // `Pan-Asian` in prose and `pan asian` as a stored tag are the same two words, because both go
    // through `normalise()` — the repo's single answer to "are these the same text?".
    expect(newWordCount('Pan-Asian small plates.', ['pan asian'])).toBe(2); // small, plates
  });

  it('treats an unrecognised script as new information rather than as filler', () => {
    // There is no Hebrew connective list, and that is the safe direction: an unknown word counts as
    // new, so the sentence gets shown rather than silently hidden.
    expect(newWordCount('חומוס טרי כל בוקר', [])).toBe(4);
  });
});

describe('whyGoEarnsItsPlace', () => {
  const LONDON_QUOTE = 'The Laughing Yak Nepalese kitchen tucked away in Market Peckham';

  it('refuses an absent sentence', () => {
    expect(whyGoEarnsItsPlace(null, {})).toBe(false);
    expect(whyGoEarnsItsPlace(undefined, {})).toBe(false);
    expect(whyGoEarnsItsPlace('   ', {})).toBe(false);
  });

  it('suppresses the measured London case: a paraphrase of the quote and the tags beside it', () => {
    // Real output, and the reason this rule exists. Its only new content word is "discover".
    const whyGo = 'Discover a Nepalese kitchen tucked away in the market.';
    expect(
      newWordCount(whyGo, [LONDON_QUOTE, 'nepalese', 'market stall', 'The Laughing Yak', 'London']),
    ).toBe(1);
    expect(
      whyGoEarnsItsPlace(whyGo, {
        reason: LONDON_QUOTE,
        tags: ['nepalese', 'market stall'],
        name: 'The Laughing Yak',
        locality: 'London',
      }),
    ).toBe(false);
  });

  it('shows a sentence that carries something the quote and the tags cannot', () => {
    expect(
      whyGoEarnsItsPlace('Go before ten, the pistachio croissant sells out.', {
        reason: 'Anat Bakery',
        tags: ['bakery', 'hidden gem'],
        dishes: ['pistachio croissant'],
        name: 'Anat Bakery',
        locality: 'Tel Aviv-Yafo',
      }),
    ).toBe(true);
  });

  it('shows a sentence on a place whose caption gave no quote at all', () => {
    // Seven of the twenty saved rows have no `extracted_reason`. On those the model's sentence is
    // the only prose there is, and suppressing it would leave the detail view with nothing to say.
    expect(
      whyGoEarnsItsPlace('A tiny counter doing sabich to order.', {
        reason: null,
        tags: ['israeli'],
        name: 'HaKosem',
      }),
    ).toBe(true);
  });

  it('suppresses a sentence that only restates the dishes', () => {
    expect(
      whyGoEarnsItsPlace('Known for the sabich.', {
        reason: null,
        dishes: ['sabich'],
        name: 'HaKosem',
      }),
    ).toBe(false);
  });

  /**
   * The threshold, pinned against every `why_go` the v2 extractor has actually produced on this
   * database — not against sentences written to make it pass. If a future prompt change moves this
   * distribution, these cases fail, which is the point: the constant was measured and it should not
   * drift silently. See `MIN_NEW_WORDS` for the full table.
   */
  describe('measured against real v2 output', () => {
    const shownIf = (whyGo: string, ctx: Parameters<typeof whyGoEarnsItsPlace>[1]) =>
      whyGoEarnsItsPlace(whyGo, ctx);

    it('sits above the listicle filler the model actually writes', () => {
      expect(MIN_NEW_WORDS).toBe(4);

      // 1 new word: the whole sentence is the quote in softer words.
      expect(
        shownIf('Experience East meets West fusion inside The Prince Akatoki London Hotel in Marylebone.', {
          reason: 'Tokii London, East meets West inside The Prince Akatoki London Hotel in Marylebone',
          tags: ['fusion', 'hotel restaurant'],
          name: 'Tokii',
          locality: 'London',
        }),
      ).toBe(false);

      // 2 new words — "find" and "spot". A verb phrase wrapped around the quote.
      expect(
        shownIf('Find this hidden spot inside Eccleston Yards in Belgravia.', {
          reason: 'Jones Family Kitchen - hidden inside Eccleston Yards in Belgravia',
          tags: ['hidden gem'],
          name: 'Jones Family Kitchen',
          locality: 'London',
        }),
      ).toBe(false);

      // 3 new words — the highest-scoring paraphrase in the sample, still filler.
      expect(
        shownIf("Enjoy delicious artisan pasta in Brixton's Market Row.", {
          reason: 'La Nonna in Market Row, Brixton',
          tags: ['italian', 'pasta', 'artisan'],
          name: 'La Nonna Brixton',
          locality: 'London',
        }),
      ).toBe(false);
    });

    it('sits below every sentence that carried real information', () => {
      // 5, 7 and 8 new words: a closing time, a changing menu, a six-seat counter — none of which a
      // tag or a caption substring on this screen says.
      expect(
        shownIf('A neighbourhood bakery that sells out by eleven on a Friday.', {
          reason: null,
          tags: ['בורקס', 'מאפייה', 'hidden gem'],
          dishes: ['בורקס תפוחי אדמה', 'cheese danish'],
          name: 'Anat Bakery',
          locality: 'Tel Aviv-Yafo',
        }),
      ).toBe(true);

      expect(
        shownIf('The menu changes with the season and the room is quiet enough to talk.', {
          reason: '✨ Sycamore Restaurant for seasonal Italian plates inside Middle Eighty Hotel in Covent Garden',
          tags: ['seasonal italian', 'hotel restaurant', 'modern italian small plates'],
          name: 'Sycamore Vino Cucina',
          locality: 'London',
        }),
      ).toBe(true);

      expect(
        shownIf('Go on a weeknight — the counter is six seats and the queue starts at seven.', {
          reason: 'Kiaans Tooting pan-Asian inside Tooting Market',
          tags: ['pan asian', 'market stall', 'hidden gem', 'street food', 'late night'],
          dishes: ['chilli oil wontons', 'crispy sea bass'],
          name: 'Kiaans Tooting',
          locality: 'London',
        }),
      ).toBe(true);
    });
  });
});
