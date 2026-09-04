/**
 * The library summarised by country (`docs/ux-library-at-scale.md` §2).
 *
 * Two readers, and they must not derive it separately: the map's world-zoom band draws one marker
 * per country, and `ui/place/list-scope.ts` resolves the **country scope** a tap on one of those
 * markers puts the list into. Two call sites deriving "the countries" independently is exactly how
 * they come to disagree about what the tap selected.
 *
 * The list itself no longer renders countries. It grouped the user's other areas under country
 * rows until 2026-08-30, when the owner deleted that section outright (see `EverywhereElse` in
 * `components/sheet/place-sheet.tsx`); this computation outlived it because the map still needs
 * it.
 *
 * Pure, and separate from both renderers, so §2.5's rule — *no place ever disappears* — is
 * assertable without a WebGL context or a DOM.
 */

import type { GeoBounds, GeoPoint } from '@/domain/places/clusters';
import { bucketAreasByCountry } from '@/domain/places/country-bucket';
import { toCountryName } from '@/domain/places/country-code';
import { UNNAMED_OTHER_AREA_LABEL, type Area } from './active-area';

/**
 * The key a country is addressed by, for React keys, `icon-image` ids and the tap handler.
 *
 * A string rather than `string | null` because all three of those consumers need one, and because
 * the unflagged bucket of §2.5 is a real, tappable group rather than an absence. A space is not a
 * possible country code, so the sentinel can never collide with one.
 */
export const NO_COUNTRY_KEY = ' none';

export function countryKey(countryCode: string | null): string {
  return countryCode ?? NO_COUNTRY_KEY;
}

/** One country of the library: the map's world-zoom marker and the list's group row, undrawn. */
export interface CountrySummary<T> {
  readonly key: string;
  /** ISO 3166-1 alpha-2, or `null` for the areas whose members carry no usable country (§2.5). */
  readonly countryCode: string | null;
  /**
   * What the list calls it: the country's English name where we have a code, and
   * `UNNAMED_OTHER_AREA_LABEL` where we do not.
   *
   * **Never the area's own name, and that is a fix rather than a preference** (2026-09-02). It used
   * to fall back to `areas[0].label`, so the one Haifa save — whose `country_code` is NULL because
   * nothing ever wrote Google's own `IL` — rendered as a row reading `חיפה` directly beneath
   * `Israel`, on the map's world band and in `/profile`'s `Where you save` alike. A city presented
   * as a peer of a country says something false with no hedge in it, and the profile's
   * `N Countries` then disagreed with the list under it because that stat counts codes and the list
   * counted rows. A group we could not name a country for is a **gap**, and the shipped words for a
   * gap are `Another area` — which `list-scope.ts` already lowercases mid-sentence and which
   * carries no flag.
   */
  readonly label: string;
  readonly areas: readonly Area<T>[];
  /** Where the marker sits: the mean of the user's own saved places in the country, never a
   *  country centroid (§2.2). */
  readonly centroid: GeoPoint;
  /** The extent of the country's areas, for the camera to fit when the marker is tapped (§2.4). */
  readonly bounds: GeoBounds;
  /** Saved places in the country, across all its areas — the library's own count, before filters. */
  readonly count: number;
}

/**
 * Bucket the library's areas into countries.
 *
 * `toCountryCode` reads the *place's* stored country and is only ever consulted through
 * `areaCountry`'s plurality rule, so a place with no country of its own still lands in the country
 * of the area it sits in (§2.5). The areas handed in are the same `Area` objects the list already
 * holds, and the same objects come back inside each summary — no re-matching afterwards, and no
 * second id scheme for the same area.
 */
export function summariseByCountry<T>(
  areas: readonly Area<T>[],
  toCountryCode: (item: T) => string | null | undefined,
  toPoint: (item: T) => GeoPoint,
): readonly CountrySummary<T>[] {
  return bucketAreasByCountry(areas, toCountryCode, toPoint).map((bucket) => ({
    key: countryKey(bucket.countryCode),
    countryCode: bucket.countryCode,
    label: toCountryName(bucket.countryCode) ?? UNNAMED_OTHER_AREA_LABEL,
    areas: bucket.areas,
    centroid: bucket.centroid,
    bounds: bucket.bounds,
    count: bucket.count,
  }));
}
