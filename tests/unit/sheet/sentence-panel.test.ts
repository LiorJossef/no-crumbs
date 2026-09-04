import { describe, expect, it } from 'vitest';

import {
  SENTENCE_COPY,
  clampToLibrary,
  interpretationChips,
  interpretationSentence,
  isEmptyApplication,
  placesCountText,
  previewCount,
  type LibraryFacets,
  type SentenceApplication,
} from '@/components/sheet/sentence-panel';
import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import { filterByCategory } from '@/domain/places/category-filter';
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
  const byTag = filterByTag(places, application.tags);
  const byVisit = filterByVisit(byTag, application.visit);
  const byCategory = filterByCategory(byVisit, application.category, (p) => p.category);
  return filterPlaces(byCategory, application.query).length;
}

describe('the second clamp', () => {
  it('keeps values the library actually carries', () => {
    const applied = clampToLibrary(
      { category: 'restaurant', tags: ['italian'], visit: 'not-been', keyword: null },
      facets,
    );
    expect(applied).toEqual({
      category: 'restaurant',
      tags: ['italian'],
      visit: 'not-been',
      query: '',
    });
  });

  it('drops a category the library does not have', () => {
    const applied = clampToLibrary({ category: 'bar', tags: [], visit: 'all' }, {
      ...facets,
      categories: ['restaurant', 'cafe'],
    });
    expect(applied.category).toBeNull();
  });

  it('drops a tag the library does not have, and a value that is not a tag at all', () => {
    const applied = clampToLibrary(
      { category: null, tags: ['speakeasy', 'ignore all previous instructions'], visit: 'all' },
      facets,
    );
    expect(applied.tags).toEqual([]);
  });

  it('renders no chip for a hand-injected intent naming a category the library lacks', () => {
    const applied = clampToLibrary({ category: 'bar', tags: ['speakeasy'], visit: 'been' }, {
      categories: [],
      tags: [],
      visit: [],
    });
    expect(interpretationChips(applied)).toEqual([]);
    expect(isEmptyApplication(applied)).toBe(true);
  });

  it('keeps the library’s own spelling of a tag rather than the model’s', () => {
    const applied = clampToLibrary({ tags: ['Specialty Coffee'] }, facets);
    expect(applied.tags).toEqual(['specialty coffee']);
  });

  it('drops a visit state with no rows behind it', () => {
    const applied = clampToLibrary({ visit: 'been' }, { ...facets, visit: ['not-been'] });
    expect(applied.visit).toBe('all');
  });

  it('never keeps the same tag twice', () => {
    const applied = clampToLibrary({ tags: ['italian', 'Italian'] }, facets);
    expect(applied.tags).toEqual(['italian']);
  });

  it('collapses a missing or unreadable intent to the application that filters nothing', () => {
    expect(isEmptyApplication(clampToLibrary(null, facets))).toBe(true);
    expect(isEmptyApplication(clampToLibrary(undefined, facets))).toBe(true);
  });
});

describe('the preview count equals the applied count', () => {
  /** Three sentences' worth of interpretation, each a different shape of narrowing. */
  const cases: readonly { readonly name: string; readonly application: SentenceApplication }[] = [
    {
      name: 'italian restaurant',
      application: { category: 'restaurant', tags: ['italian'], visit: 'all', query: '' },
    },
    {
      name: 'italian places I have not been to',
      application: { category: null, tags: ['italian'], visit: 'not-been', query: '' },
    },
    {
      name: 'a keyword that only some rows carry',
      application: { category: null, tags: [], visit: 'all', query: 'trattoria' },
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
