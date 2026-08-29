/**
 * `ui/place/active-area.ts` — which of the user's own areas the list is showing, and the four
 * writers allowed to change it (`docs/ux-stable-area-list.md`).
 *
 * The fixtures below are the **real local library**: twelve places in London, and nine around Tel
 * Aviv carrying three spellings of one city (`Tel Aviv-Yafo` six times, `Tel Aviv` twice, and the
 * Hebrew `תל אביב - יפו` once). Those spellings are why an area is a coordinate cluster and never a
 * `locality` string, and the 6/9 = 67% majority is why the label rule here is `clusterLabel`'s
 * plurality rather than the 70% confidence bar the viewport header used to apply.
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity } from '@/domain/places/clusters';
import {
  anchorFor,
  areaAfterCameraSettled,
  areaHeading,
  areaHeadingSentence,
  areaRowAccessibleName,
  areaRowCountText,
  buildAreas,
  dominantArea,
  mapAccessibleName,
  resolveArea,
  UNNAMED_AREA_LABEL,
  type Area,
} from '@/ui/place/active-area';
import type { ViewportBounds } from '@/ui/place/viewport';

interface TestPlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
}

const projections = {
  toId: (place: TestPlace) => place.id,
  toPoint: (place: TestPlace) => ({ lat: place.lat, lng: place.lng }),
  toLocality: (place: TestPlace) => place.locality,
};

/** Spread a run of places over a few hundred metres so they cluster but do not coincide. */
function city(
  prefix: string,
  count: number,
  centre: { lat: number; lng: number },
  localities: readonly (string | null)[],
): TestPlace[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    lat: centre.lat + index * 0.004,
    lng: centre.lng + index * 0.004,
    locality: localities[index] ?? localities[localities.length - 1] ?? null,
  }));
}

const LONDON = { lat: 51.5119, lng: -0.1276 };
const TEL_AVIV = { lat: 32.0704, lng: 34.7796 };

const londonPlaces = city('ldn', 12, LONDON, ['London']);
const telAvivPlaces = city('tlv', 9, TEL_AVIV, [
  'Tel Aviv-Yafo',
  'Tel Aviv-Yafo',
  'Tel Aviv-Yafo',
  'Tel Aviv-Yafo',
  'Tel Aviv-Yafo',
  'Tel Aviv-Yafo',
  'Tel Aviv',
  'Tel Aviv',
  'תל אביב - יפו',
]);

/** The library as the page holds it: `created_at desc`, so the Tel Aviv saves are the recent ones. */
const library: readonly TestPlace[] = [...telAvivPlaces, ...londonPlaces];

function areasOf(places: readonly TestPlace[] = library): readonly Area<TestPlace>[] {
  return buildAreas(clusterByProximity(places, projections.toPoint), projections);
}

/** A rect around a point, in degrees — `withinBounds` takes north/south/east/west. */
function rectAround(point: { lat: number; lng: number }, spanDeg = 0.1): ViewportBounds {
  return {
    north: point.lat + spanDeg,
    south: point.lat - spanDeg,
    east: point.lng + spanDeg,
    west: point.lng - spanDeg,
  };
}

const areaNamed = (areas: readonly Area<TestPlace>[], label: string): Area<TestPlace> => {
  const found = areas.find((area) => area.label === label);
  if (!found) throw new Error(`no area labelled ${label}`);
  return found;
};

describe('buildAreas', () => {
  it('groups the library into one area per city, not one per locality spelling', () => {
    const areas = areasOf();
    expect(areas).toHaveLength(2);
    expect(areas.map((area) => area.members.length).sort((a, b) => a - b)).toEqual([9, 12]);
  });

  it('names the Tel Aviv area despite three spellings and a 67% majority', () => {
    // The 70% confidence bar the viewport header used would return `null` here and print
    // `9 places in this area` for nine rows that are all one city.
    expect(areaNamed(areasOf(), 'Tel Aviv-Yafo').members).toHaveLength(9);
  });

  it('keeps the input order of the members, which is the list order', () => {
    const area = areaNamed(areasOf(), 'Tel Aviv-Yafo');
    expect(area.members.map((place) => place.id)).toEqual(telAvivPlaces.map((place) => place.id));
  });

  it('leaves the label null when the members name nowhere', () => {
    const areas = areasOf(city('x', 3, LONDON, [null]));
    expect(areas[0]?.label).toBeNull();
  });

  it('gives an area a stable id that does not depend on input order', () => {
    const forwards = areasOf(library);
    const backwards = areasOf([...library].reverse());
    expect(forwards.map((a) => a.id).sort()).toEqual(backwards.map((a) => a.id).sort());
  });
});

describe('resolveArea', () => {
  it('finds the area by any member id, not only by the area id', () => {
    const areas = areasOf();
    const london = areaNamed(areas, 'London');
    const member = london.members[7];
    expect(resolveArea(areas, member?.id ?? null)?.id).toBe(london.id);
  });

  it('survives a library change that moves the area id', () => {
    const areas = areasOf();
    const london = areaNamed(areas, 'London');
    // A new save lands in London with an id that sorts before every existing one, so `Area.id`
    // changes. An anchor written before the import still resolves, because lookup is by membership.
    const anchor = anchorFor(london);
    const afterImport = areasOf([
      { id: 'aaa-new', lat: LONDON.lat, lng: LONDON.lng, locality: 'London' },
      ...library,
    ]);
    const resolved = resolveArea(afterImport, anchor);
    expect(resolved?.label).toBe('London');
    expect(resolved?.members).toHaveLength(13);
  });

  it('returns null for an unset anchor and for a place that is gone', () => {
    const areas = areasOf();
    expect(resolveArea(areas, null)).toBeNull();
    expect(resolveArea(areas, 'deleted-id')).toBeNull();
  });
});

describe('dominantArea', () => {
  it('picks the area with the most pins in the rect', () => {
    const areas = areasOf();
    expect(dominantArea(areas, rectAround(LONDON), null)).toBe(areaNamed(areas, 'London').id);
    expect(dominantArea(areas, rectAround(TEL_AVIV), null)).toBe(
      areaNamed(areas, 'Tel Aviv-Yafo').id,
    );
  });

  it('prefers the current area on a tie, so a boundary does not oscillate', () => {
    const equal = [
      ...city('a', 2, LONDON, ['London']),
      ...city('b', 2, { lat: LONDON.lat + 1.2, lng: LONDON.lng }, ['Watford']),
    ];
    const areas = areasOf(equal);
    // A rect holding both areas' pins in equal number.
    const both: ViewportBounds = { north: LONDON.lat + 2, south: LONDON.lat - 1, east: 2, west: -2 };
    const london = areaNamed(areas, 'London').id;
    const watford = areaNamed(areas, 'Watford').id;
    expect(dominantArea(areas, both, london)).toBe(london);
    expect(dominantArea(areas, both, watford)).toBe(watford);
  });

  it('falls back to the nearest area when the rect holds no pins at all', () => {
    const areas = areasOf();
    // A quiet corner of Greater London with nothing saved in it.
    const empty = rectAround({ lat: 51.42, lng: -0.02 }, 0.01);
    expect(dominantArea(areas, empty, null)).toBe(areaNamed(areas, 'London').id);
  });

  it('has no answer when the library is empty', () => {
    expect(dominantArea([], rectAround(LONDON), null)).toBeNull();
  });
});

describe('areaAfterCameraSettled — the four-writer rule', () => {
  const areas = areasOf();
  const london = areaNamed(areas, 'London').id;
  const telAviv = areaNamed(areas, 'Tel Aviv-Yafo').id;

  it('ignores a camera the user did not move, even over another area', () => {
    // This is the `21 -> 9` fix: a ResizeObserver re-fit, the initial fitBounds, a flight to a pin
    // and the post-import flight all land here with `userInitiated: false`.
    expect(
      areaAfterCameraSettled({
        areas,
        currentId: london,
        rect: rectAround(TEL_AVIV),
        userInitiated: false,
      }),
    ).toBe(london);
  });

  it('switches on a settled user pan that crossed into another area', () => {
    expect(
      areaAfterCameraSettled({
        areas,
        currentId: london,
        rect: rectAround(TEL_AVIV),
        userInitiated: true,
      }),
    ).toBe(telAviv);
  });

  it('holds the area for a pan that stayed inside it', () => {
    expect(
      areaAfterCameraSettled({
        areas,
        currentId: london,
        rect: rectAround(LONDON, 0.04),
        userInitiated: true,
      }),
    ).toBe(london);
  });

  it('holds the area when there is no rect yet', () => {
    expect(
      areaAfterCameraSettled({ areas, currentId: london, rect: null, userInitiated: true }),
    ).toBe(london);
  });
});

describe('areaRowCountText', () => {
  it('uses the same noun the header does', () => {
    expect(areaRowCountText(8, false)).toBe('8 places');
    expect(areaRowCountText(1, false)).toBe('1 place');
    expect(areaRowCountText(3, true)).toBe('3 matches');
    expect(areaRowCountText(1, true)).toBe('1 match');
  });

  it('says what tapping the row does', () => {
    expect(areaRowAccessibleName({ id: 'a', label: 'Tel Aviv-Yafo', count: 8 }, false)).toBe(
      'Tel Aviv-Yafo, 8 places, open this area',
    );
  });
});

describe('areaHeading', () => {
  const base = { area: 'London', searchQuery: '', tagLabel: null, matchesAnywhere: 12 };

  it('names the area and the count', () => {
    expect(areaHeading({ ...base, countInArea: 12 }).text).toBe('12 places in London');
    expect(areaHeading({ ...base, countInArea: 1 }).text).toBe('1 place in London');
  });

  it('splits the count out so the peek row can emphasise it without parsing', () => {
    const heading = areaHeading({ ...base, countInArea: 12 });
    expect(heading.count).toBe('12');
    expect(heading.rest).toBe('places in London');
    expect(`${heading.count} ${heading.rest}`).toBe(heading.text);
  });

  it('drops the unit noun for the peek row, which has three controls to fit', () => {
    // The peek row renders `count` and `shortRest`; the sheet's own heading renders `text`. The
    // short form exists because the row is now Collections + heading + Add inside ~335 px.
    expect(areaHeading({ ...base, countInArea: 18 }).shortRest).toBe('in London');
    expect(areaHeading({ ...base, countInArea: 1 }).shortRest).toBe('in London');
    expect(areaHeading({ ...base, countInArea: 3, searchQuery: 'momos' }).shortRest).toBe(
      'in London',
    );
  });

  it('keeps `to go`, which is a state and not a unit', () => {
    // `7 in London` would answer a question the user did not ask. Only `place`/`places` and
    // `match`/`matches` are droppable — a map supplies those words for itself.
    const heading = areaHeading({ ...base, countInArea: 7, notBeenOnly: true });
    expect(heading.shortRest).toBe('to go in London');
    expect(heading.shortRest).toBe(heading.rest);
  });

  it('equals `rest` where there is no count to shorten around', () => {
    const nowhere = areaHeading({
      ...base,
      countInArea: 0,
      searchQuery: 'momos',
      matchesAnywhere: 0,
    });
    expect(nowhere.count).toBeNull();
    expect(nowhere.shortRest).toBe(nowhere.rest);

    const notHere = areaHeading({ ...base, countInArea: 0, searchQuery: 'momos' });
    expect(notHere.count).toBeNull();
    expect(notHere.shortRest).toBe(notHere.rest);
  });

  it('changes the noun exactly when a filter is on', () => {
    expect(areaHeading({ ...base, countInArea: 3, searchQuery: 'momos' }).text).toBe(
      '3 matches in London',
    );
    expect(areaHeading({ ...base, countInArea: 1, tagLabel: 'Hidden Gem' }).text).toBe(
      '1 match in London',
    );
  });

  it('falls back to "this area" when the area has no agreed name', () => {
    expect(areaHeading({ ...base, area: null, countInArea: 12 }).text).toBe(
      `12 places in ${UNNAMED_AREA_LABEL}`,
    );
  });

  it('says the matches are elsewhere, and offers no escape button for it', () => {
    // The `Elsewhere` rows below the header already name where they are, with counts, one tap away.
    const heading = areaHeading({ ...base, countInArea: 0, searchQuery: 'momos', matchesAnywhere: 3 });
    expect(heading.text).toBe('No matches in London');
    expect(heading.empty).toBe(true);
    expect(heading.escape).toBeNull();
  });

  it('says the search matches nowhere, and offers the one control that undoes it', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      searchQuery: 'momos',
      matchesAnywhere: 0,
    });
    expect(heading.text).toBe('Nothing matches "momos"');
    expect(heading.escape).toBe('clear-search');
  });

  it('names the tag when the chip is what matched nothing, and leaves its pill to clear it', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      tagLabel: 'Momos',
      matchesAnywhere: 0,
    });
    expect(heading.text).toBe('Nothing tagged "Momos"');
    expect(heading.escape).toBeNull();
  });

  it('never produces "Nothing saved in this area" — an area always has a place in it', () => {
    const areas = areasOf();
    for (const area of areas) {
      const heading = areaHeading({
        ...base,
        area: area.label,
        countInArea: area.members.length,
        matchesAnywhere: library.length,
      });
      expect(heading.empty).toBe(false);
    }
  });
});

describe('the spoken heading', () => {
  it('is the line as a sentence', () => {
    const heading = areaHeading({
      countInArea: 12,
      area: 'London',
      searchQuery: '',
      tagLabel: null,
      matchesAnywhere: 12,
    });
    expect(areaHeadingSentence(heading)).toBe('12 places in London.');
  });

  it('tells a screen reader the list beside the canvas is complete', () => {
    const heading = areaHeading({
      countInArea: 12,
      area: 'London',
      searchQuery: '',
      tagLabel: null,
      matchesAnywhere: 12,
    });
    expect(mapAccessibleName(heading, 'London')).toBe(
      'Map of your saved places in London. The list below names all 12.',
    );
  });

  it('claims no count when the heading has none', () => {
    const heading = areaHeading({
      countInArea: 0,
      area: 'London',
      searchQuery: 'momos',
      tagLabel: null,
      matchesAnywhere: 3,
    });
    expect(mapAccessibleName(heading, 'London')).toBe('Map of your saved places in London.');
  });
});

/**
 * The heading with the been / not-been filter on (`L1-F12-T1`).
 *
 * Two of these are bug tests rather than feature tests. Before the filter was a third dimension,
 * `matchesAnywhere === 0` with no search and no tag produced `Nothing tagged ""` — a sentence about
 * a tag nobody applied, assembled from an empty string — and a non-empty result read `7 matches in
 * London`, which is true and answers a question the user did not ask. Both are what criterion 14
 * ("a bare number with an ambiguous denominator is a fail") and criterion 15 ("the all-filtered
 * state is designed, not empty") exist to catch.
 */
describe('areaHeading with the not-been-yet filter', () => {
  const base = { area: 'London', searchQuery: '', tagLabel: null, matchesAnywhere: 12 };

  it('counts what it is actually counting when the visit filter is the only one on', () => {
    expect(areaHeading({ ...base, countInArea: 7, notBeenOnly: true }).text).toBe(
      '7 to go in London',
    );
    expect(areaHeading({ ...base, countInArea: 1, notBeenOnly: true }).text).toBe(
      '1 to go in London',
    );
  });

  it('still splits the count out for the peek row', () => {
    const heading = areaHeading({ ...base, countInArea: 7, notBeenOnly: true });
    expect(heading.count).toBe('7');
    expect(heading.rest).toBe('to go in London');
    expect(`${heading.count} ${heading.rest}`).toBe(heading.text);
    expect(heading.empty).toBe(false);
  });

  it('writes the all-been state rather than leaving a blank list', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      matchesAnywhere: 0,
    });
    expect(heading.text).toBe("You've been to all of them");
    expect(heading.empty).toBe(true);
    // No `Clear search` escape: the `Not been yet` chip directly above is the way back, and two
    // controls for one state is worse than one.
    expect(heading.escape).toBeNull();
  });

  it('never assembles a sentence about a tag nobody applied', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      matchesAnywhere: 0,
    });
    expect(heading.text).not.toContain('tagged');
    expect(heading.text).not.toContain('""');
  });

  it('says where, when the area is done but others are not', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      matchesAnywhere: 4,
    });
    expect(heading.text).toBe("You've been to all of them in London");
    expect(heading.empty).toBe(true);
  });

  it('hands the sentence back to the generic noun as soon as a second filter is on', () => {
    // With a search or a tag also narrowing, the result is an intersection and no single question
    // names it — `matches` is the honest word.
    expect(
      areaHeading({ ...base, countInArea: 3, notBeenOnly: true, searchQuery: 'momos' }).text,
    ).toBe('3 matches in London');
    expect(
      areaHeading({ ...base, countInArea: 3, notBeenOnly: true, tagLabel: 'Hidden Gem' }).text,
    ).toBe('3 matches in London');
  });

  it('lets the search keep its own nowhere-sentence and its own escape', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      searchQuery: 'momos',
      matchesAnywhere: 0,
    });
    expect(heading.text).toBe('Nothing matches "momos"');
    expect(heading.escape).toBe('clear-search');
  });

  it('leaves every unfiltered heading exactly as it was', () => {
    // The parameter is optional and defaults to off, so no existing call site changes meaning.
    expect(areaHeading({ ...base, countInArea: 12 }).text).toBe('12 places in London');
    expect(areaHeading({ ...base, countInArea: 12, notBeenOnly: false }).text).toBe(
      '12 places in London',
    );
  });
});

describe('the line under an achievement heading', () => {
  const base = { area: 'London', searchQuery: '', tagLabel: null, matchesAnywhere: 12 };

  it('is null everywhere except the all-been states', () => {
    expect(areaHeading({ ...base, countInArea: 12 }).note).toBeNull();
    expect(areaHeading({ ...base, countInArea: 7, notBeenOnly: true }).note).toBeNull();
    expect(
      areaHeading({ ...base, countInArea: 0, searchQuery: 'momos', matchesAnywhere: 0 }).note,
    ).toBeNull();
    expect(areaHeading({ ...base, countInArea: 0, matchesAnywhere: 3, searchQuery: 'x' }).note)
      .toBeNull();
  });

  it('points at the import when the whole library is done', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      matchesAnywhere: 0,
    });
    expect(heading.note).toBe(
      'Nothing left on your list. Paste a TikTok and it starts filling up again.',
    );
  });

  it('points at the other areas when only this one is done', () => {
    const heading = areaHeading({
      ...base,
      countInArea: 0,
      notBeenOnly: true,
      matchesAnywhere: 4,
    });
    expect(heading.note).toBe('Your other areas still have places waiting.');
  });
});
