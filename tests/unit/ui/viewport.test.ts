/**
 * `ui/place/viewport.ts` — the header line when the map is the query (`L1-F5-T2`).
 *
 * The localities below are the **real local library**: `London` twelve times, and `Tel Aviv-Yafo`
 * six times beside `Tel Aviv` twice. Those three spellings for two cities are the reason `areaLabel`
 * groups on `normalise()` rather than on the string, and they are in the database because the rows
 * came from different resolutions of the same place.
 */

import { describe, expect, it } from 'vitest';

import {
  areaLabel,
  boundsCentre,
  withinBounds,
  sortByDistanceFromCentre,
  viewportHeading,
  viewportHeadingSentence,
  type ViewportPlace,
} from '@/ui/place/viewport';

const withLocalities = (...localities: readonly (string | null)[]): readonly ViewportPlace[] =>
  localities.map((locality) => ({ locality }));

describe('areaLabel', () => {
  it('names a viewport where everything agrees', () => {
    expect(areaLabel(withLocalities('London', 'London', 'London'))).toBe('London');
  });

  it('prints the most common spelling, not the normalised key', () => {
    // The real Tel Aviv cluster: six `Tel Aviv-Yafo` to two `Tel Aviv`.
    const cluster = withLocalities(
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv',
      'Tel Aviv',
    );
    expect(areaLabel(cluster)).toBe('Tel Aviv-Yafo');
  });

  it('groups spellings that differ only in case, accent or punctuation', () => {
    expect(areaLabel(withLocalities('Tel Aviv-Yafo', 'tel aviv-yafo', 'TEL AVIV-YAFO'))).toBe(
      'Tel Aviv-Yafo',
    );
    expect(areaLabel(withLocalities('Café Florentin', 'Cafe Florentin'))).toBe('Café Florentin');
  });

  it('does NOT bridge `Tel Aviv` and `Tel Aviv-Yafo`, and says `this area` when they disagree', () => {
    // This is the honest limit, asserted rather than hoped for. `normalise()` folds casing, accents
    // and punctuation; it cannot fold away the word `Yafo`, and bridging it would mean prefix or
    // similarity matching — the entity-resolution project `current-state.md` §4 rules out.
    //
    // One `Tel Aviv-Yafo` against two `Tel Aviv` is 67%, under the bar, so the header says
    // `this area`. That is the right answer: the rows themselves do not agree what the city is
    // called, and being vague beats being confidently wrong.
    expect(areaLabel(withLocalities('Tel Aviv-Yafo', 'Tel Aviv', 'Tel Aviv'))).toBeNull();
  });

  it('labels the real Tel Aviv cluster correctly anyway, because the threshold carries it', () => {
    // The live library's actual split: six `Tel Aviv-Yafo` to two `Tel Aviv` is 75%, over the bar.
    // This is the assertion that the feature works on real data despite the limit above.
    const live = withLocalities(...Array<string>(6).fill('Tel Aviv-Yafo'), 'Tel Aviv', 'Tel Aviv');
    expect(areaLabel(live)).toBe('Tel Aviv-Yafo');
  });

  it('refuses to name a genuinely mixed viewport', () => {
    // Seven London, five Tel Aviv: 58%, under the bar. Calling this "London" would be the product
    // asserting something false about what is on screen.
    const mixed = withLocalities(
      ...Array<string>(7).fill('London'),
      ...Array<string>(5).fill('Tel Aviv-Yafo'),
    );
    expect(areaLabel(mixed)).toBeNull();
  });

  it('names a viewport that is mostly one city', () => {
    // Eleven of twelve is 92%.
    const nearlyAll = withLocalities(...Array<string>(11).fill('London'), 'Tel Aviv-Yafo');
    expect(areaLabel(nearlyAll)).toBe('London');
  });

  it('refuses to name a tie', () => {
    expect(areaLabel(withLocalities('London', 'Tel Aviv'))).toBeNull();
  });

  it('lets unlabelled places dilute the confidence, because they should', () => {
    // Two of four have no city at all. The viewport has not earned a name.
    expect(areaLabel(withLocalities('London', 'London', null, null))).toBeNull();
    // Three of four is 75%, over the bar.
    expect(areaLabel(withLocalities('London', 'London', 'London', null))).toBe('London');
  });

  it('names a single place by its own city, and an unlabelled one not at all', () => {
    expect(areaLabel(withLocalities('London'))).toBe('London');
    expect(areaLabel(withLocalities(null))).toBeNull();
  });

  it('returns null for an empty viewport rather than throwing', () => {
    expect(areaLabel([])).toBeNull();
  });

  it('treats a whitespace or punctuation-only locality as no locality at all', () => {
    // It does not become its own city, and it does dilute — both correct, and the second one is
    // load-bearing: two of three is 67%, under the bar, so this viewport has no confident name.
    expect(areaLabel(withLocalities('London', 'London', '   '))).toBeNull();
    expect(areaLabel(withLocalities('London', 'London', 'London', '   '))).toBe('London');
    expect(areaLabel(withLocalities('...'))).toBeNull();
  });
});

describe('viewportHeading', () => {
  it('names the area and the count', () => {
    expect(viewportHeading(12, 'London', false).text).toBe('12 places in London');
  });

  it('says "this area" when the area has no confident name', () => {
    expect(viewportHeading(12, null, false).text).toBe('12 places in this area');
  });

  it('is singular at one', () => {
    expect(viewportHeading(1, 'London', false).text).toBe('1 place in London');
    expect(viewportHeading(1, 'London', true).text).toBe('1 match in London');
    expect(viewportHeading(1, null, false).text).toBe('1 place in this area');
  });

  it('changes the noun, not the denominator, when a search is also active', () => {
    // `3 of 20` is retired: with the viewport and the search both narrowing, `20` is ambiguous.
    expect(viewportHeading(3, 'London', true).text).toBe('3 matches in London');
    expect(viewportHeading(3, 'London', true).text).not.toContain('of');
  });

  it('never prints the library total', () => {
    // Nothing in the signature can carry it, which is the point — this assertion is here so that
    // adding a `totalCount` parameter later has to argue with a test.
    expect(viewportHeading.length).toBe(3);
  });

  it('distinguishes an empty viewport from an empty search result', () => {
    const noSearch = viewportHeading(0, 'London', false);
    expect(noSearch.text).toBe('Nothing saved in this area');
    expect(noSearch.empty).toBe(true);
    expect(noSearch.count).toBeNull();

    const searching = viewportHeading(0, 'London', true);
    expect(searching.text).toBe('No matches in this area');
    expect(searching.empty).toBe(true);
  });

  it('does not name the area in either empty state', () => {
    // `Nothing saved in London` reads as a claim about London. The area label is derived from the
    // places in view, and there are none, so there is nothing to name.
    expect(viewportHeading(0, 'London', false).text).not.toContain('London');
    expect(viewportHeading(0, 'London', true).text).not.toContain('London');
  });

  it('splits the count from the rest so a surface can emphasise it without parsing', () => {
    const heading = viewportHeading(12, 'London', false);
    expect(heading.count).toBe('12');
    expect(heading.rest).toBe('places in London');
    expect(`${heading.count} ${heading.rest}`).toBe(heading.text);
  });

  it('leaves rest equal to text when there is no count', () => {
    const heading = viewportHeading(0, null, false);
    expect(heading.rest).toBe(heading.text);
  });
});

describe('viewportHeadingSentence', () => {
  it('is the heading with a full stop, for the live region', () => {
    expect(viewportHeadingSentence(viewportHeading(12, 'London', false))).toBe(
      '12 places in London.',
    );
    expect(viewportHeadingSentence(viewportHeading(0, null, false))).toBe(
      'Nothing saved in this area.',
    );
  });
});

describe('sortByDistanceFromCentre', () => {
  // Real coordinates from the London cluster.
  const SOHO = { lat: 51.5152, lng: -0.1219, name: 'Sycamore Vino Cucina' };
  const BRIXTON = { lat: 51.4618, lng: -0.1132, name: 'La Nonna Brixton' };
  const TOOTING = { lat: 51.4278, lng: -0.1706, name: 'Kiaans Tooting' };

  const order = (centre: { lat: number; lng: number }) =>
    sortByDistanceFromCentre([TOOTING, SOHO, BRIXTON], centre, (p) => p).map((p) => p.name);

  it('puts the places nearest the centre of the map first', () => {
    expect(order(SOHO)).toEqual(['Sycamore Vino Cucina', 'La Nonna Brixton', 'Kiaans Tooting']);
    expect(order(TOOTING)).toEqual(['Kiaans Tooting', 'La Nonna Brixton', 'Sycamore Vino Cucina']);
  });

  it('is stable, so the caller’s own order survives as the tiebreak', () => {
    const a = { lat: 51.5, lng: -0.1, name: 'a' };
    const b = { lat: 51.5, lng: -0.1, name: 'b' };
    const c = { lat: 51.5, lng: -0.1, name: 'c' };
    expect(sortByDistanceFromCentre([a, b, c], a, (p) => p).map((p) => p.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [TOOTING, SOHO, BRIXTON];
    sortByDistanceFromCentre(input, SOHO, (p) => p);
    expect(input[0]).toBe(TOOTING);
  });

  it('sorts an empty list without complaint', () => {
    expect(sortByDistanceFromCentre([], SOHO, (p: { lat: number; lng: number }) => p)).toEqual([]);
  });
});

describe('withinBounds', () => {
  // The real London cluster's box, as `clusterByProximity` reports it.
  const LONDON = { north: 51.518, south: 51.4277, east: -0.0682, west: -0.1706 };

  it('includes a place inside the box and excludes one outside it', () => {
    expect(withinBounds({ lat: 51.5152, lng: -0.1219 }, LONDON)).toBe(true); // Sycamore
    expect(withinBounds({ lat: 32.0524, lng: 34.7498 }, LONDON)).toBe(false); // Container, Tel Aviv
  });

  it('includes a place exactly on the edge', () => {
    // The forgiving direction: a pin drawn on the boundary is visible, so it belongs in the list.
    expect(withinBounds({ lat: 51.518, lng: -0.0682 }, LONDON)).toBe(true);
    expect(withinBounds({ lat: 51.4277, lng: -0.1706 }, LONDON)).toBe(true);
  });

  it('does not empty the list for a viewport crossing the antimeridian', () => {
    // Unwrapped longitudes arrive with east < west. A plain comparison matches nothing here, and an
    // empty list is indistinguishable on screen from the feature being broken.
    const straddling = { north: 10, south: -10, east: -170, west: 170 };
    expect(withinBounds({ lat: 0, lng: 179 }, straddling)).toBe(true);
    expect(withinBounds({ lat: 0, lng: -179 }, straddling)).toBe(true);
    expect(withinBounds({ lat: 0, lng: 0 }, straddling)).toBe(false);
  });

  it('rejects on latitude regardless of longitude', () => {
    expect(withinBounds({ lat: 60, lng: -0.1219 }, LONDON)).toBe(false);
  });
});

describe('boundsCentre', () => {
  it('is the middle of an ordinary box', () => {
    expect(boundsCentre({ north: 52, south: 50, east: 1, west: -1 })).toEqual({ lat: 51, lng: 0 });
  });

  it('does not put a straddling viewport’s centre on the far side of the globe', () => {
    expect(boundsCentre({ north: 10, south: -10, east: -170, west: 170 })).toEqual({
      lat: 0,
      lng: 180,
    });
  });
});
