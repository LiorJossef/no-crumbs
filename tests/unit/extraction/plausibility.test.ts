import { describe, expect, it } from 'vitest';

import {
  evidenceFoundInCaption,
  filterPlausible,
  isHashtagOnlyEvidence,
} from '@/domain/extraction/plausibility';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate>): PlaceCandidate {
  return {
    rawName: 'Cafe Fiori',
    cityHint: null,
    countryHint: null,
    categoryHint: null,
    evidence: null,
    modelConfidence: null,
    addressHint: null,
    identifiedName: null,
    nameVariants: [],
    coordinates: null,
    areaHint: null,
    tags: [],
    dishes: [],
    whyGo: null,
    ...overrides,
  };
}

describe('filterPlausible', () => {
  it('returns the empty candidate list unchanged — the modal zero-place case', () => {
    const result = filterPlausible([], 'a caption naming no place at all, just vibes');
    expect(result.kept).toEqual([]);
    expect(Object.values(result.dropped).every((n) => n === 0)).toBe(true);
  });

  it('keeps a plausible, verbatim-evidenced candidate', () => {
    const caption = "haven't stopped thinking about Cafe Fiori since we went";
    const result = filterPlausible([candidate({ evidence: 'Cafe Fiori' })], caption);
    expect(result.kept).toHaveLength(1);
  });

  it('drops a handle', () => {
    const result = filterPlausible([candidate({ rawName: '@someuser' })], 'anything');
    expect(result.dropped.hashtag_or_handle).toBe(1);
  });

  it('drops a URL', () => {
    const result = filterPlausible([candidate({ rawName: 'https://example.com/x' })], 'anything');
    expect(result.dropped.hashtag_or_handle).toBe(1);
  });

  it('drops a hashtag-shaped bare city/country against a spaced cityHint (#telaviv vs "Tel Aviv")', () => {
    const result = filterPlausible([candidate({ rawName: '#telaviv', cityHint: 'Tel Aviv' })], 'anything');
    expect(result.kept).toHaveLength(0);
    expect(result.dropped.city_or_country_only).toBe(1);
  });

  it('drops a hashtag-shaped generic word', () => {
    const result = filterPlausible([candidate({ rawName: '#coffee' })], 'anything');
    expect(result.dropped.generic_words_only).toBe(1);
  });

  it('keeps a hashtag-shaped plausible venue name, capping confidence even when the model reported higher', () => {
    // The caption has to actually contain the tag now: the rule asks where the name is findable in
    // the caption, not how the model spelled `rawName` (see `isHashtagOnlyEvidence`).
    const result = filterPlausible(
      [candidate({ rawName: '#aroma', modelConfidence: 0.9 })],
      'morning coffee run #aroma',
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('leaves a non-hashtag candidate confidence unchanged', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori', modelConfidence: 0.9 })],
      'Cafe Fiori was great',
    );
    expect(result.kept[0]?.modelConfidence).toBe(0.9);
  });

  it('drops a bare city name equal to its own cityHint', () => {
    const result = filterPlausible([candidate({ rawName: 'Tokyo', cityHint: 'Tokyo' })], 'anything');
    expect(result.dropped.city_or_country_only).toBe(1);
  });

  it('drops a candidate made only of generic words ("this hidden gem")', () => {
    const result = filterPlausible([candidate({ rawName: 'this hidden gem' })], 'anything');
    expect(result.dropped.generic_words_only).toBe(1);
  });

  it('drops a candidate whose evidence does not occur verbatim in the caption', () => {
    const result = filterPlausible(
      [candidate({ evidence: 'a fabricated quote never in the source' })],
      'the real caption text, unrelated',
    );
    expect(result.dropped.evidence_not_in_caption).toBe(1);
  });

  it('drops a duplicate after normalisation, keeping the first occurrence', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'Cafe Fiori' }), candidate({ rawName: 'CAFE   fiori' })],
      'anything',
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.duplicate).toBe(1);
  });

  it('keeps a non-Latin-script candidate (Hebrew) instead of dropping it as empty-after-normalisation', () => {
    // Regression: `normaliseForComparison` used to strip every non-ASCII character, so a Hebrew
    // rawName normalised to '' and was wrongly caught by `isCityOrCountryOnly`'s
    // `norm.length === 0` check, as if it were a bare city/country with nothing else to it.
    const caption = 'פתוח ראשון-שבת 8:00-15:00 #נומיכפרמונש';
    const result = filterPlausible(
      [candidate({ rawName: '#נומיכפרמונש', evidence: '#נומיכפרמונש', modelConfidence: 0.8 })],
      caption,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.city_or_country_only).toBe(0);
    // still a hashtag, so still capped like any other hashtag-sourced candidate.
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('keeps a category-plus-number Hebrew hashtag (#בראסרי18) — the filter is NOT what rejected it in production', () => {
    // LIVE-HASHTAG-1. A production import dropped `#בראסרי18` ("Brasserie 18", a real Tel Aviv
    // restaurant). This test establishes which layer was responsible: every rule in this file lets
    // the candidate through, so the miss is the model not following the prompt, not the gate. The
    // digits survive `normaliseForComparison` (`\p{N}`), the English stop-word list cannot match a
    // Hebrew word, and no cityHint equals the name.
    const caption = 'המקום הכי טוב בעיר 🔥 #בראסרי18 #אוכל #תלאביב';
    const result = filterPlausible(
      [candidate({ rawName: 'בראסרי 18', cityHint: 'Tel Aviv', evidence: '#בראסרי18', modelConfidence: 0.9 })],
      caption,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.hashtag_or_handle).toBe(0);
    expect(result.dropped.city_or_country_only).toBe(0);
    expect(result.dropped.generic_words_only).toBe(0);
    expect(result.dropped.evidence_not_in_caption).toBe(0);
    // Kept, but capped and labelled: a tag with no prose behind it is weak evidence, not proof.
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
    expect(isHashtagOnlyEvidence(caption, 'בראסרי 18', '#בראסרי18')).toBe(true);
  });

  it('keeps the Latin form of the same shape (#cafe21) with the "#" still attached', () => {
    // The rawName spelling must not decide this either way — the same candidate survives whether
    // the model stripped the "#" the prompt asked it to keep or not.
    const caption = 'best flat white here #cafe21 #coffee';
    const withHash = filterPlausible([candidate({ rawName: '#cafe21', evidence: '#cafe21' })], caption);
    const withoutHash = filterPlausible([candidate({ rawName: 'Cafe 21', evidence: '#cafe21' })], caption);
    expect(withHash.kept).toHaveLength(1);
    expect(withoutHash.kept).toHaveLength(1);
  });

  it('keeps a real venue-shaped Hebrew hashtag but the plausibility gate alone cannot reject a Hebrew generic-descriptor hashtag — that discrimination is the prompt\'s job', () => {
    // `isGenericWordsOnly`'s stop-word list is English-only and a hashtag has no spaces to split
    // on, so a Hebrew "bakery in the center"-style hashtag is not caught here either; this layer
    // only guards structure (handle/URL, duplicate, verbatim evidence), not language-specific
    // genericness. Documented, not a bug to fix in this file.
    const result = filterPlausible([candidate({ rawName: '#ביקריבמרכז', evidence: '#ביקריבמרכז' })], 'anything #ביקריבמרכז');
    expect(result.dropped.generic_words_only).toBe(0);
    expect(result.kept).toHaveLength(1);
  });

  /**
   * TRACK1-STABLE. Every one of these strings is a real Gemini `evidence` value against the real
   * caption it was extracted from, taken from
   * `docs/evidence/extraction/determinism-2026-08-28.md`. Under the previous
   * `caption.includes(evidence)` test each of the first two dropped a correct, fully-addressed
   * venue and reported the import to the user as "no places found".
   */
  describe('evidence matching (measured against real model output)', () => {
    // The caption has two spaces after `אביב`; the model's quote has one. Nothing else differs.
    const braserieCaption =
      'בראסרי 18 נפתחה ממש לאחר פרוץ המלחמה בנובמבר 2023 ולאחרונה עבר מרמת אביב  ללב העיר בלבונטין 19 🙌🏻 שף המסעדה הוא שלמה שרי';
    const braserieEvidence =
      'בראסרי 18 נפתחה ממש לאחר פרוץ המלחמה בנובמבר 2023 ולאחרונה עבר מרמת אביב ללב העיר בלבונטין 19';

    const rusticoCaption =
      'תכירו את מסעדת רוסטיקו 🍽️ במקום תמצאו תפריט מגוון הכולל ראשונות, פסטות ופיצות. כתובת: בזל 42, תל אביב 📍 ויש מסעדה נוספת ברוטשילד 15, תל אביב';
    const rusticoEvidence =
      'מסעדת רוסטיקו 🍽️ במקום תמצאו תפריט מגוון... כתובת: בזל 42, תל אביב 📍 ויש מסעדה נוספת ברוטשילד 15';

    it('accepts a quote that differs from the caption only by a collapsed double space', () => {
      expect(braserieCaption.includes(braserieEvidence)).toBe(false);
      expect(evidenceFoundInCaption(braserieCaption, braserieEvidence)).toBe(true);
    });

    it('keeps the candidate that collapsed space used to delete', () => {
      const result = filterPlausible(
        [candidate({ rawName: 'בראסרי 18', addressHint: 'לבונטין 19', evidence: braserieEvidence })],
        braserieCaption,
      );
      expect(result.dropped.evidence_not_in_caption).toBe(0);
      expect(result.kept).toHaveLength(1);
    });

    it('accepts an elided quote whose segments are both real and in caption order', () => {
      expect(rusticoCaption.includes(rusticoEvidence)).toBe(false);
      expect(evidenceFoundInCaption(rusticoCaption, rusticoEvidence)).toBe(true);
    });

    it('accepts the same elision written with a real ellipsis character or in brackets', () => {
      expect(evidenceFoundInCaption(rusticoCaption, rusticoEvidence.replace('...', '…'))).toBe(true);
      expect(evidenceFoundInCaption(rusticoCaption, rusticoEvidence.replace('...', '[...]'))).toBe(true);
    });

    it('still rejects a quote the caption does not contain', () => {
      expect(evidenceFoundInCaption(braserieCaption, 'בראסרי 18 קיבלה כוכב מישלן')).toBe(false);
    });

    it('rejects an elided quote whose segments appear in the wrong order', () => {
      const caption = 'first a long enough fragment here, then a second long fragment there';
      expect(evidenceFoundInCaption(caption, 'a second long fragment there ... first a long enough fragment')).toBe(false);
    });

    it('rejects an elision whose segments are short enough to hit by accident', () => {
      // `a ... b` must not pass just because the caption contains an `a` and a `b`. Every segment
      // is under ELIDED_SEGMENT_MIN_CHARS, so the whole quote is inadmissible.
      expect(evidenceFoundInCaption('a caption about a bakery and a bar', 'a ... b')).toBe(false);
    });

    it('rejects an elided quote with one real segment and one invented one', () => {
      expect(
        evidenceFoundInCaption(rusticoCaption, 'מסעדת רוסטיקו 🍽️ במקום תמצאו תפריט מגוון... זוכת פרס המסעדה של השנה'),
      ).toBe(false);
    });

    it('rejects empty and whitespace-only evidence', () => {
      expect(evidenceFoundInCaption('any caption at all', '')).toBe(false);
      expect(evidenceFoundInCaption('any caption at all', '   \n  ')).toBe(false);
    });

    it('does not fold case, accents, punctuation or emoji — that tolerance belongs to grounding.ts', () => {
      expect(evidenceFoundInCaption('Café Levinsky 41', 'Cafe Levinsky 41')).toBe(false);
      expect(evidenceFoundInCaption('Cafe Fiori', 'CAFE FIORI')).toBe(false);
      expect(evidenceFoundInCaption('📍Ha Kosem', 'Ha Kosem!')).toBe(false);
    });
  });

  it('keeps multiple distinct plausible candidates from a list-style post', () => {
    const caption = 'Three spots: Cafe Fiori, Bar Kaymak, and Anzu Bakery were all incredible';
    const result = filterPlausible(
      [
        candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori' }),
        candidate({ rawName: 'Bar Kaymak', evidence: 'Bar Kaymak' }),
        candidate({ rawName: 'Anzu Bakery', evidence: 'Anzu Bakery' }),
      ],
      caption,
    );
    expect(result.kept.map((c) => c.rawName)).toEqual(['Cafe Fiori', 'Bar Kaymak', 'Anzu Bakery']);
  });
});

/**
 * RICH-EXT-2. The candidate this rule exists for, and the two real captions that say why it caps
 * rather than drops.
 *
 * `NOM_LIFE_CAPTION` is the verbatim caption of TikTok `7220925199297039662` (@nom_life), cached in
 * `docs/evidence/tiktok/oembed-set1-raw.json`. The candidate beneath it is the verbatim output of a
 * real `gemini-3.5-flash-lite` call on 2026-08-28, recorded in
 * `docs/evidence/extraction/raw/caption-sufficiency-trigger-live-2026-08-28.json`. One sample, so
 * it is pinned as a fixture and no rate is claimed from it.
 */
const NOM_LIFE_CAPTION =
  'our full list of #tokyorestaurant recs! hard to have everything on one list, but this is a good ' +
  'jumping off point! 😉 what are you eating first? 🍣🍜🍨 #japanesefood #japan #japanrecs ' +
  '#japantravel #japantiktok #japanlife #tokyo #tokyofood #japantok #japantrip #udon ' +
  '#tsukijifishmarket #tsukjimarket #tsukijioutermarket #japanthings #japanfood #japanfoodies ' +
  '#asiatravel #asiantiktok #japantraveltips #japantips #totoro #ghibli #studioghibli ' +
  '#hayaomiyazaki #sushi #omakase #foodtok #foodtiktok ';

/** Real caption, TikTok `7335105363756240174` (@raquelhutt). The venue exists only as a tag, and
 *  it is a real Tel Aviv restaurant — the reason this class is capped and not dropped. */
const LA_LA_LAND_CAPTION = 'One of my FAV restaurants in TLV 🇮🇱💙 #LaLaLand ';

describe('isHashtagOnlyEvidence — the hashtag-as-a-place regression (RICH-EXT-2)', () => {
  it('fires when the model strips the "#" it was asked to keep — the @nom_life defect', () => {
    // This is the whole bug. `rawName.trim().startsWith('#')` returned false for this exact string,
    // so the cap and the review screen's "Only mentioned in a hashtag" notice both stayed silent.
    expect(isHashtagOnlyEvidence(NOM_LIFE_CAPTION, 'tsukijifishmarket', null)).toBe(true);
  });

  it('caps the @nom_life candidate end to end instead of letting 0.95 through', () => {
    const result = filterPlausible(
      [
        candidate({
          rawName: 'tsukijifishmarket',
          cityHint: 'Tokyo',
          modelConfidence: 0.95,
          evidence: '#tsukijifishmarket',
        }),
      ],
      NOM_LIFE_CAPTION,
    );
    // Kept, not dropped: capping is the measured decision (see `HASHTAG_ONLY_CONFIDENCE_CEILING`).
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('still fires when the model keeps the "#"', () => {
    expect(isHashtagOnlyEvidence(NOM_LIFE_CAPTION, '#tsukijifishmarket', null)).toBe(true);
  });

  it('still fires when the model segments the run-together tag into words', () => {
    // `tightenForTagMatch` removes spaces on both sides, so "Tsukiji Fish Market" and
    // "#tsukijifishmarket" are the same string by the time they are compared.
    expect(isHashtagOnlyEvidence(NOM_LIFE_CAPTION, 'Tsukiji Fish Market', null)).toBe(true);
  });

  it('fires on the real tag-only venue too — which is why the rule caps rather than drops', () => {
    expect(isHashtagOnlyEvidence(LA_LA_LAND_CAPTION, 'La La Land', null)).toBe(true);
  });

  it('keeps the real tag-only venue rather than dropping it', () => {
    const result = filterPlausible(
      [candidate({ rawName: '#LaLaLand', modelConfidence: 0.9, evidence: '#LaLaLand' })],
      LA_LA_LAND_CAPTION,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('does NOT fire when the prose names the venue and a hashtag merely agrees with it', () => {
    // The "do not over-collapse" line: a tag that corroborates prose is corroboration, not the
    // only evidence, and the candidate keeps its full confidence and shows no hashtag notice.
    const caption = 'Cafe Fiori 📍 Yom Tov St 20, Tel Aviv-Yafo #cafefiori #telaviv';
    expect(isHashtagOnlyEvidence(caption, 'Cafe Fiori', 'Cafe Fiori')).toBe(false);
    const result = filterPlausible(
      [candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori', modelConfidence: 0.95 })],
      caption,
    );
    expect(result.kept[0]?.modelConfidence).toBe(0.95);
  });

  it('does not fire on a caption with no hashtags at all', () => {
    expect(isHashtagOnlyEvidence('Nomena Roasters, on Allenby Street', 'Nomena Roasters', null)).toBe(
      false,
    );
  });

  it('does not fire on a name the caption never contains — that is a different rule\'s job', () => {
    // Ungrounded names are `evidence_not_in_caption`'s business. This rule answers only "is the
    // evidence a tag", and must return false rather than guessing.
    expect(isHashtagOnlyEvidence(NOM_LIFE_CAPTION, 'Simhovich Cafe', null)).toBe(false);
  });

  it('reaches the verdict through `evidence` when the name was transliterated out of its script', () => {
    // `#נומיכפרמונש` → "Nomi Kfar Monash" is exactly what the prompt asks the model to do, and the
    // Latin name cannot tighten into the Hebrew tag. The verbatim evidence quote still can.
    const caption = 'עגלת קפה מעולה #נומיכפרמונש #עגלתקפה';
    expect(isHashtagOnlyEvidence(caption, 'Nomi Kfar Monash', '#נומיכפרמונש')).toBe(true);
  });

  it('fires on a Hebrew tag-only venue named nowhere in the prose', () => {
    // Real caption, TikTok cached in corpus-100: the prose says only "new cafe!! in Tower of David
    // Jerusalem" and the bakery's name is a tag.
    const caption = 'בית קפה חדש!! במגדל דוד ירושלים 😍 #הריםבייקרי #כשר #ביתקפה';
    expect(isHashtagOnlyEvidence(caption, '#הריםבייקרי', null)).toBe(true);
  });

  it('does not fire on a Hebrew venue the prose names, tag or no tag', () => {
    const caption = 'תכירו את קפה פוסלסקי, בית קפה קטן ומשפחתי בחיפה #קפהפוסלסקי';
    expect(isHashtagOnlyEvidence(caption, 'קפה פוסלסקי', null)).toBe(false);
  });

  it('leaves an already-low model confidence alone rather than raising it to the ceiling', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'tsukijifishmarket', modelConfidence: 0.2 })],
      NOM_LIFE_CAPTION,
    );
    expect(result.kept[0]?.modelConfidence).toBe(0.2);
  });

  it('leaves a null model confidence null', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'tsukijifishmarket', modelConfidence: null })],
      NOM_LIFE_CAPTION,
    );
    expect(result.kept[0]?.modelConfidence).toBeNull();
  });
});
