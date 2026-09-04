import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import { filterByCategory } from '@/domain/places/category-filter';
import { filterByArea, type SentenceArea } from '@/domain/search/locality-match';
import { previewCount, type SentenceApplication } from '@/components/sheet/sentence-panel';
import type { MapPlace } from '@/components/map/types';
import type { Spot } from '@/domain/places/spot';

/**
 * **§4.3 at the page's boundary**: *"the preview count always equals the number of places that
 * appear after `Show these`. A mismatch here is the feature lying."*
 *
 * The panel's own test holds `previewCount` against a hand-written chain. This one holds it
 * against **the page's** chain — `map-page-client.tsx`'s five passes in the order that file runs
 * them, transcribed here by hand for the same reason: an equality between two paths cannot be
 * tested by sharing one helper between them. It is the fifth pass, the area, that makes this worth
 * a second file: it is the only cell the panel *derives* rather than copies out of the model's
 * answer, and it is the one `applySentence` has to re-run to know where to point the camera.
 */
function pageChain(
  places: readonly MapPlace[],
  application: SentenceApplication,
): readonly MapPlace[] {
  const byArea = filterByArea(places, application.area);
  const byTag = filterByTag(byArea, application.tags);
  const byVisit = filterByVisit(byTag, application.visit);
  const byCategory = filterByCategory(byVisit, application.category, (place) => place.category);
  return filterPlaces(byCategory, application.query);
}

function place(
  id: string,
  category: 'restaurant' | 'cafe' | 'bar',
  locality: string,
  lat: number,
  lng: number,
  tags: readonly string[] = [],
  visited = false,
): MapPlace {
  return {
    id,
    name: id,
    category,
    lat,
    lng,
    note: '',
    sourceUrl: undefined,
    visited,
    detail: { id, name: id, category, lat, lng, tags, locality } as unknown as Spot,
  };
}

const library: readonly MapPlace[] = [
  place('tlv-1', 'cafe', 'תל אביב-יפו', 32.07, 34.78, ['brunch']),
  place('tlv-2', 'cafe', 'Tel Aviv-Yafo', 32.072, 34.782, ['brunch'], true),
  place('tlv-3', 'restaurant', 'Tel Aviv', 32.074, 34.784, ['italian']),
  place('ldn-1', 'cafe', 'London', 51.5, -0.12, ['brunch']),
  place('ldn-2', 'bar', 'London', 51.51, -0.13, ['cocktails']),
];

const telAviv: SentenceArea = {
  label: 'תל אביב-יפו',
  typed: 'tel aviv',
  placeIds: ['tlv-1', 'tlv-2', 'tlv-3'],
};

const applications: readonly { readonly name: string; readonly application: SentenceApplication }[] = [
  {
    name: 'an area alone',
    application: { category: null, tags: [], visit: 'all', query: '', area: telAviv },
  },
  {
    name: 'an area and a category',
    application: { category: 'cafe', tags: [], visit: 'all', query: '', area: telAviv },
  },
  {
    name: 'an area, a tag and a visit state',
    application: { category: null, tags: ['brunch'], visit: 'not-been', query: '', area: telAviv },
  },
  {
    name: 'an area that leaves nothing once the other filters run',
    application: { category: 'bar', tags: [], visit: 'all', query: '', area: telAviv },
  },
  {
    name: 'no area at all — the Stage 1 shape, unchanged',
    application: { category: 'cafe', tags: ['brunch'], visit: 'all', query: '', area: null },
  },
];

describe('the number the panel showed is the number the page produces', () => {
  for (const { name, application } of applications) {
    it(name, () => {
      expect(previewCount(library, application)).toBe(pageChain(library, application).length);
    });
  }

  it('is 3, 2, 1, 0 and 3 respectively over this library', () => {
    expect(applications.map(({ application }) => previewCount(library, application))).toEqual([
      3, 2, 1, 0, 3,
    ]);
  });

  it('the area narrows: without it the same sentence returns more', () => {
    const [, withArea] = applications;
    const without: SentenceApplication = { ...withArea!.application, area: null };
    expect(previewCount(library, without)).toBe(3);
    expect(previewCount(library, withArea!.application)).toBe(2);
  });
});

describe('the area pass composes as AND, so its position cannot change the result', () => {
  it('first or last, the same rows come out', () => {
    const application = applications[2]!.application;
    const areaLast = filterByArea(
      filterPlaces(
        filterByCategory(
          filterByVisit(filterByTag(library, application.tags), application.visit),
          application.category,
          (p) => p.category,
        ),
        application.query,
      ),
      application.area,
    );
    expect(areaLast.map((p) => p.id)).toEqual(pageChain(library, application).map((p) => p.id));
  });
});

describe('what the camera is pointed at after an apply', () => {
  it('is the rows the new filters leave, never the area’s whole membership', () => {
    // `applySentence` frames `matchesAfter(application)`; the surface resolves those ids against
    // its own filtered `places` prop, so framing membership would name rows it cannot find and the
    // flight would be silently declined — the defect `bc7d1ea` measured on the area markers.
    const application = applications[1]!.application;
    expect(pageChain(library, application).map((p) => p.id)).toEqual(['tlv-1', 'tlv-2']);
    expect(telAviv.placeIds).toHaveLength(3);
  });

  it('has nothing to point at when the combination is empty, which is why the flight is gated', () => {
    expect(pageChain(library, applications[3]!.application)).toHaveLength(0);
  });
});

/**
 * **The area is only ever written in three places, and the raw query setter never leaves the
 * page.** A source-level guard, and it exists because the failure it guards against is invisible:
 * an area filter left behind by a route that cleared the others is a narrowing with no cause on
 * screen — the bug the `Undo` notice's staleness rule fixed, one cell over.
 *
 * Deliberately two cheap assertions rather than a parser. The one that matters is the second:
 * `onQueryChange={setQuery}` was the shape of the original defect, and it is the shape any new
 * surface will reach for first.
 */
describe('the page cannot leave an area behind', () => {
  const source = readFileSync(
    new URL('../../../src/app/map/map-page-client.tsx', import.meta.url),
    'utf8',
  );

  it('writes the area cell in exactly three places: apply, undo, and the shared clear', () => {
    expect(source.match(/setAreaFilter\(/g) ?? []).toHaveLength(3);
  });

  it('never hands the raw query setter to a surface — every route goes through `changeQuery`', () => {
    expect(source).not.toContain('onQueryChange={setQuery}');
    expect(source).toContain('onQueryChange={changeQuery}');
  });
});
