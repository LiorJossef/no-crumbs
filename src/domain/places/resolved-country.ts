/**
 * The country a resolver actually reported, carried alongside `ResolvedPlace`.
 *
 * ## Why this exists rather than a field on `ResolvedPlace`
 *
 * `ResolvedPlace` (`domain/types.ts`) is field-for-field the columns of `poi_index`, and `poi_index`
 * has no country: an Overture row's country lives on `poi_regions`, one join away. So until
 * 2026-09-02 the only country any save could ever get was the **caption's** — `derivePlaceSave`
 * runs `toCountryCode(candidate.countryHint)` and writes that, with a comment saying plainly that
 * `ResolvedPlace` carries no country.
 *
 * That is measurably lossy. Google's Text Search response carries a `country` address component
 * whose `shortText` **is** the ISO-3166-1 alpha-2 code — `IL`, `CZ` — on every result, and the
 * caption very often names no country at all. On the local library that gap is real rows:
 * `places.country_code` is NULL for saves whose Google response said `CZ`/`IL` in so many words,
 * and a NULL country is what puts a city (`חיפה`) into the map's countryless bucket beside `Israel`,
 * and what makes `/profile` say `4 Cities / 3 Countries`.
 *
 * A provider that knows the country states it here. The shape is an intersection type rather than
 * an added `ResolvedPlace` field because that field belongs in `domain/types.ts` and touching it is
 * a wider change than one adapter: this is the narrow seam, it is explicit in the adapter's own
 * return type, and it is read back through `resolvedCountryCode` — which is total, so a provider
 * that carries no country is simply `null` rather than a type error at every call site.
 */

import type { ResolvedPlace } from '../types';

/** ISO-3166-1 alpha-2 as the *provider* reported it, or `null` where it reported none. */
export interface ProviderCountry {
  readonly countryCode: string | null;
}

/** A resolved place whose provider also told us the country. */
export type ResolvedPlaceInCountry = ResolvedPlace & ProviderCountry;

/**
 * The provider's country for a resolved place, normalised, or `null`.
 *
 * Total on purpose: the shortlist is `RankedPlace`, which types its member as a plain
 * `ResolvedPlace`, so the property survives at runtime but not in the type. Reading it through one
 * validated accessor means no call site invents its own cast, and a garbage value (an empty string,
 * a three-letter code, a country *name*) is `null` rather than something that fails
 * `places_country_code_check` at the database.
 */
export function resolvedCountryCode(place: ResolvedPlace): string | null {
  const raw = (place as Partial<ProviderCountry>).countryCode;
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
