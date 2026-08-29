/**
 * The library's two summary bands as GeoJSON: one feature per country, one per area
 * (`docs/ux-library-at-scale.md` §2.1–§2.3).
 *
 * Pure and separate from the layers for the reason `place-features.ts` is: the properties a
 * renderer cannot recover from — a disc whose `icon-image` was never registered, a count that
 * disagrees with the list beside it — are then assertable without a WebGL context.
 *
 * Written against the **port types** (`./types.ts`), not the domain's, so no map implementation
 * ever learns what an `Area` or a `CountrySummary` is. `map-page-client.tsx` does that mapping
 * once, from the same objects the list renders — which is what stops the map and the list deriving
 * their geography separately and quietly disagreeing.
 *
 * **Neither band clusters anything.** These are not density bubbles under another name. A country
 * feature is a country the user has saved in; an area feature is a 50 km cluster that already
 * exists and already names the list's active scope. Both are the same objects the `Elsewhere`
 * section renders as rows.
 */

import { countryDiscImageId, type DiscTheme } from './country-flag-image';
import type { MapAreaSummary, MapCountrySummary } from './types';

export interface CountryFeatureProperties {
  readonly key: string;
  /** ISO 3166-1 alpha-2, or `''` for the countryless bucket — GeoJSON properties cross into
   *  MapLibre expressions, where `null` and "absent" are the same thing and `''` is not. */
  readonly countryCode: string;
  readonly count: number;
  /** The country's English name, drawn beside the disc — see `MapCountrySummary.label`. */
  readonly label: string;
  /** The registered `icon-image` id for this country's disc, in this theme and this state.
   *
   *  Resolved into the feature rather than assembled in a layer expression, deliberately: the
   *  active-country arm would be a `['==', ['get', 'key'], null]` comparison, which is the exact
   *  shape `marker-style.ts` already documents as fatal in a MapLibre expression. */
  readonly icon: string;
}

export interface AreaFeatureProperties {
  readonly id: string;
  /** The area's own name, or `''` where the members do not agree on one — §2.3's "the marker shows
   *  the count alone", expressed as a string a `text-field` renders as nothing. */
  readonly label: string;
  readonly count: number;
}

export type CountryFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  CountryFeatureProperties
>;

export type AreaFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AreaFeatureProperties
>;

/**
 * The country band's features, positioned at the **mean of the user's own saved places** in each
 * country — never a country centroid, so the marker sits where your places are and there is no
 * gazetteer to license (§2.2).
 *
 * `activeCountryKey` earns the mint ring: at world zoom the map still says *you are here* while
 * showing everything, and it is the only state colour on the marker.
 */
export function toCountryFeatures(
  countries: readonly MapCountrySummary[],
  activeCountryKey: string | null,
  theme: DiscTheme,
): CountryFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: countries.map((country) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [country.lng, country.lat] },
      properties: {
        key: country.key,
        countryCode: country.countryCode ?? '',
        count: country.count,
        label: country.label,
        icon: countryDiscImageId(
          {
            countryCode: country.countryCode,
            ...(country.key === activeCountryKey ? { active: true } : {}),
          },
          theme,
        ),
      },
    })),
  };
}

/**
 * The area band's features — every area in the library, at every moment, not just the ones in the
 * country you last tapped.
 *
 * All of them, because the band is what you land on after tapping a country and MapLibre decides
 * what is drawn from the camera alone (§2.1). Filtering these by anything would put React state
 * back in the middle of a zoom, which is the one thing the declarative bands exist to avoid.
 */
export function toAreaFeatures(areas: readonly MapAreaSummary[]): AreaFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map((area) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [area.lng, area.lat] },
      properties: { id: area.id, label: area.label ?? '', count: area.count },
    })),
  };
}
