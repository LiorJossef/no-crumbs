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
  kind: 'area',
  label: 'תל אביב-יפו',
  typed: 'tel aviv',
  placeIds: ['tlv-1', 'tlv-2', 'tlv-3'],
};

/**
 * The fifth cell's **other** shape (`nls-plan.md` §5.1 step 1). A country narrows by country code
 * and flies through a different camera mover, but it is executed by the same single pass over the
 * same ids — which is exactly why §4.3's identity survives it, and why this file asserts the
 * identity over both shapes rather than only over the one it was written for.
 */
const israel: SentenceArea = {
  kind: 'country',
  label: 'Israel',
  typed: 'Israel',
  placeIds: ['tlv-1', 'tlv-2', 'tlv-3'],
  countryCode: 'IL',
  unplaceable: 0,
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
  {
    name: 'a country alone',
    application: { category: null, tags: [], visit: 'all', query: '', area: israel },
  },
  {
    // The owner's own example, 2026-09-04: *"cafes I've been to in Israel"*. Category, visit and a
    // country at once — the combination the country slice was reasoned from.
    name: 'a country, a category and a visit state — “cafes I’ve been to in Israel”',
    application: { category: 'cafe', tags: [], visit: 'been', query: '', area: israel },
  },
  {
    name: 'a country the filters empty out',
    application: { category: 'bar', tags: [], visit: 'all', query: '', area: israel },
  },
];

describe('the number the panel showed is the number the page produces', () => {
  for (const { name, application } of applications) {
    it(name, () => {
      expect(previewCount(library, application)).toBe(pageChain(library, application).length);
    });
  }

  it('is 3, 2, 1, 0, 3, 3, 1 and 0 respectively over this library', () => {
    expect(applications.map(({ application }) => previewCount(library, application))).toEqual([
      3, 2, 1, 0, 3, 3, 1, 0,
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

  it('for a country, is the rows the new filters leave inside it — “cafes I’ve been to in Israel”', () => {
    expect(pageChain(library, applications[6]!.application).map((p) => p.id)).toEqual(['tlv-2']);
  });

  it('a country the filters empty out is gated the same way an area is', () => {
    expect(pageChain(library, applications[7]!.application)).toHaveLength(0);
  });
});

/**
 * **The landing clamp, read off the page's source.**
 *
 * Owner, 2026-09-04: *"NLS results should always land on pins, not clusters."* Both sentence
 * triggers — the city one and the country one — go through `SENTENCE_LANDING_ZOOM`, whose floor is
 * the pin band. A regex, because the alternative is a WebGL context: it cannot say where the camera
 * came to rest, and it is not asked to. It sees one of the two triggers quietly going back to a
 * framing with no floor, which is the regression this rule has.
 */
describe('a sentence that moves the camera lands on pins', () => {
  const source = readFileSync(
    new URL('../../../src/app/map/map-page-client.tsx', import.meta.url),
    'utf8',
  );

  it('clamps both sentence triggers through one range floored at the pin band', () => {
    expect(source).toContain('minZoom: PIN_BAND_MIN + BAND_EDGE_GUARD');
    expect(source.match(/\.\.\.SENTENCE_LANDING_ZOOM/g) ?? []).toHaveLength(2);
  });

  it('no longer frames a resolved city through the floorless `framePlaces`', () => {
    const apply = source.slice(source.indexOf('const applySentence'), source.indexOf('const undoSentence'));
    expect(apply).not.toContain('camera.framePlaces(');
    expect(apply.match(/camera\.frameBounds\(/g) ?? []).toHaveLength(2);
  });
});

/**
 * **The area is only ever written in three places, and the raw query setter never leaves the
 * page.** A source-level guard over `map-page-client.tsx`.
 *
 * Its subject changed on 2026-09-04 and the assertions did not, which is worth stating. It was
 * written to hold *"every route that clears a filter clears the area"* — necessary while the area
 * had no control of its own, because an area left behind by a route that cleared the others was a
 * narrowing with no cause on screen. The area now has a chip in the filter row
 * (`library-filter-bar.tsx`, `tests/unit/sheet/area-filter-chip.test.ts`), so that rule is retired
 * and the axes compose. What survives is the narrower, permanent claim: **the cell has exactly
 * three writers** — apply, undo, and the one shared clear the chip and `Clear` both call — so a
 * new surface cannot start writing the area from somewhere nobody is looking, and no surface is
 * ever handed the raw query setter. `onQueryChange={setQuery}` was the literal shape of the `Undo`
 * staleness bug and it is the shape the next surface will reach for first.
 */
describe('the page keeps the area cell to three writers', () => {
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

  /**
   * **The composing rule, as the only two callers of the shared clear.**
   *
   * The axes narrow independently: adding a tag, a category, a visit state or a word must not drop
   * the city, which is the whole point of giving the area a chip. So `clearAreaFilter()` is called
   * as a statement by exactly the two routes that mean *leave this narrowing entirely* —
   * `openImport` and `revealSavedPlace`, both of which already blank every other cell — plus once
   * as the chip's own handler, which is a reference rather than a call.
   *
   * A regex over the source and not a claim about behaviour: it cannot see what a press does, and
   * it is not asked to. It sees a filter handler quietly growing a sixth `clearAreaFilter()`,
   * which is the regression this rule has.
   */
  it('calls the shared clear from the two whole-narrowing exits, and hands it to the chip', () => {
    expect(source.match(/^ *clearAreaFilter\(\);$/gm) ?? []).toHaveLength(2);
    expect(source.match(/onClear: clearAreaFilter/g) ?? []).toHaveLength(1);
  });
});
