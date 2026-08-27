import { describe, expect, it } from 'vitest';

import { applyGrounding, venueQueryString } from '@/domain/extraction/grounding';
import type { PlaceCandidate } from '@/domain/types';

const CAPTION =
  '✨ Sycamore Restaurant for seasonal Italian plates inside Middle Eighty Hotel in Covent Garden ' +
  '✨ Kiaans Tooting pan-Asian inside Tooting Market';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'Sycamore Restaurant',
    cityHint: 'London',
    countryHint: null,
    areaHint: 'Covent Garden',
    categoryHint: 'restaurant',
    addressHint: null,
    evidence: 'Sycamore Restaurant',
    modelConfidence: 0.8,
    identifiedName: 'Sycamore Restaurant',
    nameVariants: [],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
    ...overrides,
  };
}

/**
 * `whyGo` is the field that could turn schema v2 into a machine for confident invention, so most
 * of this file is about it. The rule under test: the model may write its own sentence, but only if
 * it pays for it with a caption fragment we can find. When the fragment is not there, the sentence
 * goes — and the candidate stays, because dropping a real venue over a shaky summary would be a
 * worse product, not a safer one.
 */
describe('applyGrounding — whyGo', () => {
  it('keeps a summary whose groundedIn fragment is in the caption', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'Italian small plates in a Covent Garden hotel.', groundedIn: 'seasonal Italian plates inside Middle Eighty Hotel' } })],
      CAPTION,
    );
    expect(candidates[0]?.whyGo?.text).toBe('Italian small plates in a Covent Garden hotel.');
    expect(counters.why_go_ungrounded).toBe(0);
  });

  it('discards a summary whose citation is not in the caption, and keeps the candidate', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'Famous for its tasting menu.', groundedIn: 'the twelve-course tasting menu' } })],
      CAPTION,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.rawName).toBe('Sycamore Restaurant');
    expect(candidates[0]?.whyGo).toBeNull();
    expect(counters.why_go_ungrounded).toBe(1);
  });

  it('tolerates punctuation and emoji differences in the citation', () => {
    // The gate is normalised on purpose: a curly apostrophe or a dropped "✨" must not cost a true
    // summary. `evidence` stays a strict substring test, because dropping a whole candidate is a
    // heavier consequence.
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'Pan-Asian food in a market hall.', groundedIn: 'Kiaans Tooting, pan Asian inside Tooting Market!' } })],
      CAPTION,
    );
    expect(candidates[0]?.whyGo).not.toBeNull();
    expect(counters.why_go_ungrounded).toBe(0);
  });

  it('treats an empty citation as a missing one', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'Worth a visit.', groundedIn: '   ' } })],
      CAPTION,
    );
    expect(candidates[0]?.whyGo).toBeNull();
    expect(counters.why_go_ungrounded).toBe(1);
  });

  it('counts a summary that is really a verbatim caption slice, without discarding it', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'seasonal Italian plates inside Middle Eighty Hotel', groundedIn: 'seasonal Italian plates' } })],
      CAPTION,
    );
    // Still true, so still kept — but it is the v1 behaviour (a caption substring), which is what
    // this counter exists to make visible rather than let it creep back in unnoticed.
    expect(candidates[0]?.whyGo).not.toBeNull();
    expect(counters.why_go_verbatim_copy).toBe(1);
  });

  it('discards a summary whose citation is only the place name', () => {
    // The real failure, transcribed. Caption: `Resturants in Tel Aviv 📍Ha Kosem #foodie ...`.
    // `gemini-3.5-flash-lite` answered "Grab a legendary falafel pita in Tel Aviv." citing
    // `"Ha Kosem"` — a genuine substring, so the first gate passed it, while "legendary",
    // "falafel" and "pita" are all things the model knows and the caption never said.
    const { candidates, counters } = applyGrounding(
      [
        candidate({
          rawName: 'Ha Kosem',
          identifiedName: 'HaKosem',
          nameVariants: [],
          areaHint: null,
          cityHint: 'Tel Aviv',
          evidence: 'Ha Kosem',
          whyGo: { text: 'Grab a legendary falafel pita in Tel Aviv.', groundedIn: 'Ha Kosem' },
        }),
      ],
      'Resturants in Tel Aviv 📍Ha Kosem #foodie #restaurant #telaviv #israel',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.whyGo).toBeNull();
    expect(counters.why_go_cites_only_the_name).toBe(1);
    expect(counters.why_go_ungrounded).toBe(0);
  });

  it('discards a citation that is the name wrapped in connectives', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ whyGo: { text: 'A place in Covent Garden.', groundedIn: 'at Sycamore Restaurant' } })],
      'Go to eat at Sycamore Restaurant',
    );
    expect(candidates[0]?.whyGo).toBeNull();
    expect(counters.why_go_cites_only_the_name).toBe(1);
  });

  it('keeps a citation that carries the name plus a real claim', () => {
    const { candidates, counters } = applyGrounding(
      [
        candidate({
          whyGo: {
            text: 'Italian small plates in a Covent Garden hotel.',
            groundedIn: 'Sycamore Restaurant for seasonal Italian plates',
          },
        }),
      ],
      CAPTION,
    );
    expect(candidates[0]?.whyGo).not.toBeNull();
    expect(counters.why_go_cites_only_the_name).toBe(0);
  });

  it('leaves a null summary null and counts nothing', () => {
    const { candidates, counters } = applyGrounding([candidate()], CAPTION);
    expect(candidates[0]?.whyGo).toBeNull();
    expect(counters.why_go_ungrounded).toBe(0);
    expect(counters.why_go_cites_only_the_name).toBe(0);
    expect(counters.why_go_verbatim_copy).toBe(0);
  });
});

describe('applyGrounding — dishes', () => {
  it('keeps a dish the caption names and drops one it does not', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ dishes: ['seasonal Italian plates', 'twelve-course tasting menu'] })],
      CAPTION,
    );
    expect(candidates[0]?.dishes).toEqual(['seasonal Italian plates']);
    expect(counters.dish_not_in_caption).toBe(1);
  });

  it('matches through case and punctuation', () => {
    const { candidates } = applyGrounding([candidate({ dishes: ['Pan-Asian'] })], CAPTION);
    expect(candidates[0]?.dishes).toEqual(['Pan-Asian']);
  });
});

describe('applyGrounding — tags', () => {
  it('canonicalises, de-duplicates and drops name/category echoes', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ tags: ['italian', 'Italian', 'restaurant', 'Sycamore Restaurant', 'Hotel restaurant'] })],
      CAPTION,
    );
    expect(candidates[0]?.tags).toEqual(['italian', 'hotel restaurant']);
    expect(counters.tag_dropped).toBe(3);
  });

  it('does not require a tag to appear in the caption', () => {
    // Deliberate, and the one v2 field with no substring gate: `Hotel Restaurant` is a reading of
    // "inside Middle Eighty Hotel", not a quote from it. Stated here so nobody later assumes a gate
    // exists that does not.
    const { candidates } = applyGrounding([candidate({ tags: ['Hotel Restaurant'] })], CAPTION);
    expect(candidates[0]?.tags).toEqual(['hotel restaurant']);
  });
});

/**
 * `nameVariants` (v3) is the only field here whose reference is not the caption, because a
 * translation cannot be a caption substring — `מתחת לעץ` -> `Under the Tree` is the case the
 * whole field exists for, and any containment test would kill it. What is testable is the hygiene:
 * the contract says a variant is the name in the *other* form, so `rawName` returned to us is not
 * one, and two spellings of one variant are not two.
 */
describe('applyGrounding — nameVariants', () => {
  it('keeps a translated variant that appears nowhere in the caption', () => {
    // The money case, from `docs/evidence/places/bilingual-expansion.md`: the caption says
    // `מתחת לעץ`, the index row says `Under the Tree`, and no gate in this file may object.
    const { candidates, counters } = applyGrounding(
      [
        candidate({
          rawName: 'מתחת לעץ',
          identifiedName: 'מתחת לעץ',
          nameVariants: ['Under the Tree'],
          evidence: 'מתחת לעץ',
          areaHint: null,
          whyGo: null,
        }),
      ],
      'בית קפה חדש בבן יהודה — מתחת לעץ',
    );
    expect(candidates[0]?.nameVariants).toEqual(['Under the Tree']);
    expect(counters.name_variant_dropped).toBe(0);
  });

  it('drops a variant that is just rawName again', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ rawName: 'קוהי', nameVariants: ['  קוהי  ', 'Kohi'] })],
      'קוהי, בן יהודה 155',
    );
    expect(candidates[0]?.nameVariants).toEqual(['Kohi']);
    expect(counters.name_variant_dropped).toBe(1);
  });

  it('folds case, accents and blanks rather than searching twice for one name', () => {
    const { candidates, counters } = applyGrounding(
      [candidate({ rawName: 'קפה אירופה', nameVariants: ['Cafe Europa', 'café europa', '   '] })],
      'קפה אירופה ברוטשילד',
    );
    expect(candidates[0]?.nameVariants).toEqual(['Cafe Europa']);
    expect(counters.name_variant_dropped).toBe(2);
  });

  it('leaves an empty list empty — the correct answer for a Latin-only venue', () => {
    const { candidates, counters } = applyGrounding([candidate()], CAPTION);
    expect(candidates[0]?.nameVariants).toEqual([]);
    expect(counters.name_variant_dropped).toBe(0);
  });
});

describe('venueQueryString', () => {
  it('composes name, area, city and country', () => {
    expect(
      venueQueryString({ rawName: 'La Nonna', identifiedName: null, areaHint: 'Brixton', cityHint: 'London', countryHint: 'UK' }),
    ).toBe('La Nonna, Brixton, London, UK');
  });

  it('prefers the identified name', () => {
    expect(
      venueQueryString({ rawName: 'Sycamore Restaurant', identifiedName: 'Sycamore', areaHint: null, cityHint: 'London', countryHint: null }),
    ).toBe('Sycamore, London');
  });

  it('does not repeat a qualifier the name already carries', () => {
    // The measured n=20 finding is that the area qualifier helps a free-form geocoder, so it must
    // survive — but a model that still writes it into the name must not produce "La Nonna Brixton,
    // Brixton".
    expect(
      venueQueryString({ rawName: 'La Nonna Brixton', identifiedName: null, areaHint: 'Brixton', cityHint: 'London', countryHint: null }),
    ).toBe('La Nonna Brixton, London');
  });

  it('is just the name when there are no hints', () => {
    expect(
      venueQueryString({ rawName: 'Port Said', identifiedName: null, areaHint: null, cityHint: null, countryHint: null }),
    ).toBe('Port Said');
  });
});
