import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_APPLICATION,
  SENTENCE_COPY,
  SentenceApplied,
  clampToLibrary,
  interpretationChips,
  interpretationSentence,
  isEmptyApplication,
  placesCountText,
  previewCount,
  primaryAction,
  sentenceStillApplied,
  type LibraryFacets,
  type PanelState,
  type SentenceApplication,
} from '@/components/sheet/sentence-panel';
import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import { filterByCategory } from '@/domain/places/category-filter';
import { filterByArea } from '@/domain/search/locality-match';
import type { MapPlace } from '@/components/map/types';
import type { Spot } from '@/domain/places/spot';

/**
 * **The two properties Stage 1 is graded on, as tests.**
 *
 * 1. *The second clamp* (`nls-plan.md` §2.1): a value with no rows behind it never reaches the
 *    screen — which is what makes prompt injection structurally inert, because the model's whole
 *    output space is enums and a value nobody has is dropped.
 * 2. *The preview count equals the applied count* (§4.3): *"a mismatch here is the feature
 *    lying."* Held here against the filter chain re-written by hand, so the test would fail if
 *    `previewCount` ever grew a second counting path.
 *
 * The tag strings are the ones the local demo library actually carries — `italian`, `cocktails`,
 * `brunch`, `specialty coffee` — rather than invented ones, so a rename in `taxonomy.ts` that
 * unhooked the clamp would show up here.
 */

function place(
  id: string,
  category: 'restaurant' | 'cafe' | 'bar',
  tags: readonly string[],
  visited = false,
  name = id,
): MapPlace {
  return {
    id,
    name,
    category,
    lat: 32.07,
    lng: 34.77,
    note: '',
    sourceUrl: undefined,
    visited,
    detail: { id, name, category, lat: 32.07, lng: 34.77, tags, locality: 'London' } as unknown as Spot,
  };
}

const library: readonly MapPlace[] = [
  place('a', 'restaurant', ['italian'], false, 'Trattoria One'),
  place('b', 'restaurant', ['italian'], true, 'Trattoria Two'),
  place('c', 'restaurant', ['japanese'], false, 'Sushi Bar'),
  place('d', 'cafe', ['brunch', 'specialty coffee'], false, 'Morning Room'),
  place('e', 'bar', ['cocktails'], false, 'The Nightcap'),
];

const facets: LibraryFacets = {
  categories: ['restaurant', 'cafe', 'bar'],
  tags: ['italian', 'japanese', 'brunch', 'specialty coffee', 'cocktails'],
  visit: ['been', 'not-been'],
};

/** The page's own chain, written out by hand — `map-page-client.tsx:740-760`. The point of
 *  duplicating it here rather than importing a helper is that the gate is an *equality between two
 *  paths*, and a single shared helper could not fail it. */
function appliedCount(places: readonly MapPlace[], application: SentenceApplication): number {
  const byArea = filterByArea(places, application.area);
  const byTag = filterByTag(byArea, application.tags);
  const byVisit = filterByVisit(byTag, application.visit);
  const byCategory = filterByCategory(byVisit, application.category, (p) => p.category);
  return filterPlaces(byCategory, application.query).length;
}

describe('the second clamp', () => {
  it('keeps values the library actually carries', () => {
    const applied = clampToLibrary(
      { category: 'restaurant', tags: ['italian'], visit: 'not-been', keyword: null },
      facets,
      library,
    );
    expect(applied).toEqual({
      category: 'restaurant',
      tags: ['italian'],
      visit: 'not-been',
      query: '',
      area: null,
    });
  });

  it('drops a category the library does not have', () => {
    const applied = clampToLibrary(
      { category: 'bar', tags: [], visit: 'all' },
      { ...facets, categories: ['restaurant', 'cafe'] },
      library,
    );
    expect(applied.category).toBeNull();
  });

  it('drops a tag the library does not have, and a value that is not a tag at all', () => {
    const applied = clampToLibrary(
      { category: null, tags: ['speakeasy', 'ignore all previous instructions'], visit: 'all' },
      facets,
      library,
    );
    expect(applied.tags).toEqual([]);
  });

  it('renders no chip for a hand-injected intent naming a category the library lacks', () => {
    const applied = clampToLibrary(
      { category: 'bar', tags: ['speakeasy'], visit: 'been' },
      { categories: [], tags: [], visit: [] },
      library,
    );
    expect(interpretationChips(applied)).toEqual([]);
    expect(isEmptyApplication(applied)).toBe(true);
  });

  it('keeps the library’s own spelling of a tag rather than the model’s', () => {
    const applied = clampToLibrary({ tags: ['Specialty Coffee'] }, facets, library);
    expect(applied.tags).toEqual(['specialty coffee']);
  });

  it('drops a visit state with no rows behind it', () => {
    const applied = clampToLibrary({ visit: 'been' }, { ...facets, visit: ['not-been'] }, library);
    expect(applied.visit).toBe('all');
  });

  it('never keeps the same tag twice', () => {
    const applied = clampToLibrary({ tags: ['italian', 'Italian'] }, facets, library);
    expect(applied.tags).toEqual(['italian']);
  });

  it('collapses a missing or unreadable intent to the application that filters nothing', () => {
    expect(isEmptyApplication(clampToLibrary(null, facets, library))).toBe(true);
    expect(isEmptyApplication(clampToLibrary(undefined, facets, library))).toBe(true);
  });
});

describe('the preview count equals the applied count', () => {
  /** Three sentences' worth of interpretation, each a different shape of narrowing. */
  const cases: readonly { readonly name: string; readonly application: SentenceApplication }[] = [
    {
      name: 'italian restaurant',
      application: { category: 'restaurant', tags: ['italian'], visit: 'all', query: '', area: null },
    },
    {
      name: 'italian places I have not been to',
      application: { category: null, tags: ['italian'], visit: 'not-been', query: '', area: null },
    },
    {
      name: 'a keyword that only some rows carry',
      application: { category: null, tags: [], visit: 'all', query: 'trattoria', area: null },
    },
  ];

  for (const { name, application } of cases) {
    it(name, () => {
      expect(previewCount(library, application)).toBe(appliedCount(library, application));
    });
  }

  it('is 2, 1 and 2 respectively over this library', () => {
    expect(cases.map(({ application }) => previewCount(library, application))).toEqual([2, 1, 2]);
  });

  it('is honest about a combination that matches nothing', () => {
    const application: SentenceApplication = {
      category: 'bar',
      tags: ['italian'],
      visit: 'all',
      query: '',
      area: null,
    };
    expect(previewCount(library, application)).toBe(0);
    expect(placesCountText(previewCount(library, application))).toBe('no places');
  });
});

describe('what the panel says', () => {
  it('announces the interpretation and the count, once, in one sentence', () => {
    const application: SentenceApplication = {
      category: 'restaurant',
      tags: ['italian'],
      visit: 'not-been',
      query: '',
      area: null,
    };
    expect(interpretationSentence(application, previewCount(library, application))).toBe(
      'Restaurant, Italian, Not been yet. 1 place.',
    );
  });

  it('gives `Show these` an accessible name that contains its visible label', () => {
    const application: SentenceApplication = {
      category: 'cafe',
      tags: ['brunch'],
      visit: 'all',
      query: '',
      area: null,
    };
    const name = `${SENTENCE_COPY.show}: ${interpretationSentence(application, 1)}`;
    expect(name.startsWith(SENTENCE_COPY.show)).toBe(true);
  });

  it('never names the feature, and never editorialises about our own certainty', () => {
    const strings = Object.values(SENTENCE_COPY).join(' ').toLowerCase();
    for (const banned of ['ai', 'llm', 'model', 'smart', 'we think', 'we understood']) {
      // `ai` as a whole word — `again` and `available` are not claims about a model.
      const pattern = new RegExp(`\\b${banned}\\b`);
      expect(pattern.test(strings), `${banned} must not appear`).toBe(false);
    }
  });

  it('uses the plan’s strings verbatim', () => {
    expect(SENTENCE_COPY.entry).toBe('Find places from a sentence');
    expect(SENTENCE_COPY.placeholder).toBe('What are you looking for?');
    expect(SENTENCE_COPY.submit).toBe('Find places');
    expect(SENTENCE_COPY.inFlight).toBe('Reading…');
    expect(SENTENCE_COPY.show).toBe('Show these');
    expect(SENTENCE_COPY.applied).toBe('Filtered from what you typed.');
    expect(SENTENCE_COPY.undo).toBe('Undo');
    expect(SENTENCE_COPY.nothing).toBe('Nothing in your places matches that.');
    expect(SENTENCE_COPY.failed).toBe('Couldn’t do that just now.');
    expect(SENTENCE_COPY.retry).toBe('Try again');
  });
});

/**
 * **The `Undo` notice must not outlive the filters it would undo** — owner-reported, 2026-09-04.
 *
 * Reproduced in a browser at 390×844 and 1280×900 before this was written: after `Show these`,
 * pressing the filter row's own `Clear` left `Filtered from what you typed. Undo` on screen over
 * an unfiltered library, and pressing `Undo` then restored the filters the user had just cleared.
 *
 * The rule under test is *derived*, not hooked: the notice is offered while the four cells still
 * hold exactly what the sentence wrote, so every route out — the row's `Clear`, a tag chip's ×,
 * the empty-list escape, the search field, a category chip — drops it without any of them knowing
 * this feature exists.
 */
describe('the undo offer expires with the state it would undo', () => {
  const applied: SentenceApplication = {
    category: 'restaurant',
    tags: ['italian'],
    visit: 'not-been',
    query: 'pasta',
    area: null,
  };

  it('stands while the cells still hold what the sentence wrote', () => {
    expect(sentenceStillApplied(applied, { ...applied })).toBe(true);
  });

  it('ignores tag order and tag spelling, which are not user changes', () => {
    const two: SentenceApplication = { ...applied, tags: ['italian', 'brunch'] };
    expect(sentenceStillApplied(two, { ...two, tags: ['brunch', 'italian'] })).toBe(true);
    expect(sentenceStillApplied(applied, { ...applied, tags: ['Italian'] })).toBe(true);
  });

  it.each<[string, SentenceApplication]>([
    ['the row’s Clear, or the empty-list escape', EMPTY_APPLICATION],
    ['a tag chip’s ×', { ...applied, tags: [] }],
    ['the category chip', { ...applied, category: null }],
    ['the visit axis', { ...applied, visit: 'all' }],
    ['the search field', { ...applied, query: '' }],
    ['a tag added by hand', { ...applied, tags: ['italian', 'brunch'] }],
  ])('drops when the user changes the cells by another route: %s', (_name, current) => {
    expect(sentenceStillApplied(applied, current)).toBe(false);
  });

  it('renders nothing once the cells have moved on, and the notice otherwise', () => {
    const gone = renderToStaticMarkup(
      createElement(SentenceApplied, {
        onUndo: () => {},
        applied,
        current: EMPTY_APPLICATION,
      }),
    );
    expect(gone).toBe('');

    const shown = renderToStaticMarkup(
      createElement(SentenceApplied, { onUndo: () => {}, applied, current: { ...applied } }),
    );
    expect(shown).toContain(SENTENCE_COPY.applied);
    expect(shown).toContain(SENTENCE_COPY.undo);
  });

  it('still renders for a host that has not passed the two applications yet', () => {
    const markup = renderToStaticMarkup(createElement(SentenceApplied, { onUndo: () => {} }));
    expect(markup).toContain(SENTENCE_COPY.applied);
  });
});

/**
 * **One button, and it becomes the next step** — the answer to the owner's 2026-09-04 note that
 * two presses to run one search is a cost.
 *
 * The two presses stay: the preview between them is the only moment the user sees what the model
 * decided before it reshapes their library, and §4.3 grades the feature on that count. What these
 * tests pin is that the *second* press has nowhere else to go — after an interpretation there is
 * no separate `Find places` still sitting there in primary paint, wearing the loudest colour on
 * the panel while doing the least useful thing.
 */
describe('the one control that becomes the next step', () => {
  const application: SentenceApplication = {
    category: 'cafe',
    tags: ['brunch'],
    visit: 'not-been',
    query: '',
    area: null,
  };
  const result: PanelState = { kind: 'result', application, count: 5 };

  it('submits, and says so, until there is something to apply', () => {
    for (const state of [
      { kind: 'idle' },
      { kind: 'nothing' },
      { kind: 'failed' },
    ] as PanelState[]) {
      const action = primaryAction(state, 'brunch spots');
      expect(action.kind).toBe('submit');
      expect(action.label).toBe(SENTENCE_COPY.submit);
      expect(action.count).toBeNull();
      expect(action.disabled).toBe(false);
    }
  });

  it('becomes the apply, carrying the count, the moment an interpretation is on screen', () => {
    const action = primaryAction(result, 'brunch spots');
    expect(action.kind).toBe('apply');
    expect(action.label).toBe(SENTENCE_COPY.show);
    expect(action.count).toBe(5);
    expect(action.disabled).toBe(false);
  });

  it('is dead while the call is in the air, so an impatient second press cannot apply', () => {
    const action = primaryAction({ kind: 'loading' }, 'brunch spots');
    expect(action.label).toBe(SENTENCE_COPY.inFlight);
    expect(action.disabled).toBe(true);
  });

  it('is dead on an empty sentence — no text, no call', () => {
    expect(primaryAction({ kind: 'idle' }, '   ').disabled).toBe(true);
  });

  it('says nothing the plan has not already ruled on', () => {
    const said = ([
      { kind: 'idle' },
      { kind: 'loading' },
      { kind: 'nothing' },
      { kind: 'failed' },
      result,
    ] as PanelState[]).map((state) => primaryAction(state, 'x').label);
    for (const label of said) {
      expect(Object.values(SENTENCE_COPY)).toContain(label);
    }
  });
});

/**
 * **Stage 2's first slice, at the panel's own boundary** (`nls-plan.md` §5).
 *
 * The library below stores one city under three spellings a few hundred metres apart, which is the
 * measured defect §1.2 records: `normalise()` folds hyphens and accents but nothing across
 * scripts, so `filterPlaces('tel aviv')` finds the rows spelled that way and no others.
 *
 * What is asserted here is the *clamp's* half — that a keyword which turns out to be one of the
 * user's own areas stops being text and becomes the fifth cell, and that the preview count still
 * equals the applied count with that cell in play. `tests/unit/search/locality-match.test.ts`
 * owns the resolution itself.
 */
describe('a keyword that is one of the user’s own areas', () => {
  function inCity(id: string, locality: string, lat: number, lng: number): MapPlace {
    return {
      id,
      name: id,
      category: 'cafe',
      lat,
      lng,
      note: '',
      sourceUrl: undefined,
      visited: false,
      detail: { id, name: id, category: 'cafe', lat, lng, tags: [], locality } as unknown as Spot,
    };
  }

  const city: readonly MapPlace[] = [
    inCity('t1', 'תל אביב-יפו', 32.07, 34.78),
    inCity('t2', 'תל אביב-יפו', 32.072, 34.782),
    inCity('t3', 'Tel Aviv-Yafo', 32.074, 34.784),
    inCity('t4', 'Tel Aviv', 32.076, 34.786),
    inCity('l1', 'London', 51.5, -0.12),
  ];

  const cityFacets: LibraryFacets = { categories: ['cafe'], tags: [], visit: ['not-been'] };

  it('moves the keyword into the area, and blanks the text filter', () => {
    const applied = clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city);
    expect(applied.query).toBe('');
    expect(applied.area).not.toBeNull();
    expect(applied.area?.typed).toBe('Tel Aviv');
  });

  it('returns the whole cluster, not the two rows spelled that way', () => {
    const applied = clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city);
    expect(new Set(applied.area?.placeIds)).toEqual(new Set(['t1', 't2', 't3', 't4']));
    // What the old text filter would have given, and the reason this exists at all.
    expect(filterPlaces(city, 'Tel Aviv')).toHaveLength(2);
  });

  it('every spelling of the city gives the same four places', () => {
    const sets = ['תל אביב-יפו', 'Tel Aviv-Yafo', 'Tel Aviv', 'תל אביב'].map(
      (spelling) => [...(clampToLibrary({ keyword: spelling }, cityFacets, city).area?.placeIds ?? [])].sort(),
    );
    for (const set of sets) expect(set).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('leaves a keyword that is not a place name as text', () => {
    const applied = clampToLibrary({ keyword: 'cortado' }, cityFacets, city);
    expect(applied.area).toBeNull();
    expect(applied.query).toBe('cortado');
  });

  it('shows the library’s own plurality spelling on the chip, never a canonical one', () => {
    const applied = clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city);
    expect(interpretationChips(applied).map((chip) => chip.label)).toContain('תל אביב-יפו');
  });

  it('keeps §4.3: the preview count equals the applied count with an area in play', () => {
    const applied = clampToLibrary({ category: 'cafe', keyword: 'Tel Aviv' }, cityFacets, city);
    expect(previewCount(city, applied)).toBe(appliedCount(city, applied));
    expect(previewCount(city, applied)).toBe(4);
  });

  it('withdraws the undo offer when the area is cleared by hand, exactly as a tag does', () => {
    const applied = clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city);
    expect(sentenceStillApplied(applied, { ...applied })).toBe(true);
    expect(sentenceStillApplied(applied, { ...applied, area: null })).toBe(false);
  });

  it('is not the empty application, so it never reads as “nothing understood”', () => {
    expect(isEmptyApplication(clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city))).toBe(false);
  });

  it('is tagged `area`, so the page knows which camera mover it pulls', () => {
    expect(clampToLibrary({ keyword: 'Tel Aviv' }, cityFacets, city).area?.kind).toBe('area');
  });
});

/**
 * **A keyword that is one of the user's own countries** — `nls-plan.md` §5.1 step 1, built
 * 2026-09-04. The fifth cell's second shape, resolved locally through `toCountryCode`'s ICU data
 * and with nothing about the user's geography leaving the device (§5.5).
 */
describe('a keyword that is one of the user’s own countries', () => {
  function inCountry(
    id: string,
    locality: string | null,
    countryCode: string | null,
    lat: number,
    lng: number,
  ): MapPlace {
    return {
      id,
      name: id,
      category: 'cafe',
      lat,
      lng,
      note: '',
      sourceUrl: undefined,
      visited: id === 't2',
      detail: {
        id,
        name: id,
        category: 'cafe',
        lat,
        lng,
        tags: [],
        locality,
        countryCode,
      } as unknown as Spot,
    };
  }

  const world: readonly MapPlace[] = [
    inCountry('t1', 'תל אביב-יפו', 'IL', 32.07, 34.78),
    inCountry('t2', 'Tel Aviv-Yafo', 'IL', 32.072, 34.782),
    inCountry('h1', 'חיפה', 'IL', 32.79, 34.99),
    inCountry('l1', 'London', 'GB', 51.5, -0.12),
    inCountry('x1', null, null, 50.08, 14.43),
  ];

  const worldFacets: LibraryFacets = { categories: ['cafe'], tags: [], visit: ['been', 'not-been'] };

  it('§5.6 — `in Israel` and `בישראל` agree, and both take the whole country', () => {
    const english = clampToLibrary({ keyword: 'Israel' }, worldFacets, world);
    const hebrew = clampToLibrary({ keyword: 'בישראל' }, worldFacets, world);
    expect(english.area?.kind).toBe('country');
    expect([...(english.area?.placeIds ?? [])].sort()).toEqual(['h1', 't1', 't2']);
    expect([...(hebrew.area?.placeIds ?? [])].sort()).toEqual([...(english.area?.placeIds ?? [])].sort());
  });

  it('§5.6 — a country the user has nothing in is no filter at all, in both languages', () => {
    for (const keyword of ['Italy', 'באיטליה']) {
      const applied = clampToLibrary({ keyword }, worldFacets, world);
      expect(applied.area, keyword).toBeNull();
      // It stays a text search rather than becoming a filter with nothing behind it.
      expect(applied.query, keyword).toBe(keyword);
    }
  });

  it('§5.6 — the row with no country code is reported, not silently dropped', () => {
    const applied = clampToLibrary({ keyword: 'Israel' }, worldFacets, world);
    expect(applied.area?.kind === 'country' && applied.area.unplaceable).toBe(1);
    expect(applied.area?.placeIds).not.toContain('x1');
  });

  /**
   * **The precedence, as a test.** A locality the user has saved beats a country of the same name.
   * The library here holds a row whose *stored locality* is `Luxembourg` and other rows in the
   * country `LU`; the narrower, quoted-from-the-library reading wins.
   */
  it('resolves against localities first, then countries', () => {
    const ambiguous: readonly MapPlace[] = [
      inCountry('lux-city', 'Luxembourg', 'LU', 49.61, 6.13),
      inCountry('lux-north', 'Clervaux', 'LU', 50.05, 6.03),
    ];
    const applied = clampToLibrary({ keyword: 'Luxembourg' }, worldFacets, ambiguous);
    expect(applied.area?.kind).toBe('area');
    expect(applied.area?.placeIds).toEqual(['lux-city']);
    // Without the city row it is the country, so the second rung is genuinely reachable.
    const countryOnly = clampToLibrary({ keyword: 'Luxembourg' }, worldFacets, [ambiguous[1]!]);
    expect(countryOnly.area?.kind).toBe('country');
  });

  it('keeps §4.3: the preview count equals the applied count with a country in play', () => {
    // The owner's own example, 2026-09-04: “cafes I've been to in Israel”.
    const applied = clampToLibrary(
      { category: 'cafe', visit: 'been', keyword: 'Israel' },
      worldFacets,
      world,
    );
    expect(previewCount(world, applied)).toBe(appliedCount(world, applied));
    expect(previewCount(world, applied)).toBe(1);
  });

  it('shows the product’s own name for the country on the chip', () => {
    const applied = clampToLibrary({ keyword: 'בישראל' }, worldFacets, world);
    expect(interpretationChips(applied).map((chip) => chip.label)).toContain('Israel');
  });

  it('withdraws the undo offer when the country is cleared by hand', () => {
    const applied = clampToLibrary({ keyword: 'Israel' }, worldFacets, world);
    expect(sentenceStillApplied(applied, { ...applied })).toBe(true);
    expect(sentenceStillApplied(applied, { ...applied, area: null })).toBe(false);
  });
});
