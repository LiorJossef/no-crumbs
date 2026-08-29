/**
 * What `/profile` says about your library, derived from rows the app already reads.
 *
 * Pure and structurally typed on purpose: the page hands these functions rows straight out of
 * `getProfilePlaces`, and a test hands them literals. Nothing here touches Supabase, so the
 * counting rules — the part that can be *wrong* rather than merely broken — are testable without a
 * database.
 *
 * **Nothing here is a new grouping.** The countries come out of the same
 * `clusterByProximity → buildAreas → summariseByCountry` chain the map's world-zoom band and the
 * list's `Elsewhere` section already run, and the categories out of the same `categoryFacets` the
 * filter bar runs. Two surfaces counting "your library by country" independently is exactly how
 * they come to disagree, and this page would have been the third.
 *
 * **What it deliberately is not.** No persona, no completion ring, no streak, no badge, no
 * score — `product-inspiration-plotline-2026-08-29.md` §4 refusals 5, 6 and 8, and `mvp-plan.md`
 * §8. Every number below is a count of the user's own rows: a fact they can check, not an
 * inference about them. `Been` sits beside `Not been yet` as two counts rather than as `1 of 32`,
 * because a fraction of an un-completable library frames it as a failure state.
 *
 * No new query, no new column, no migration.
 */

import { clusterByProximity, type GeoCluster, type GeoPoint } from '@/domain/places/clusters';
import { categoryFacets, type CategoryFacet } from '@/domain/places/category-filter';
import { toCountryName } from '@/domain/places/country-code';
import type { ProductCategory } from '@/domain/places/product-category';
import { buildAreas } from '@/ui/place/active-area';
import { summariseByCountry } from '@/ui/place/library-summary';

/** The shape the derivations need — a subset of what `saved_places` + `places` already hold. */
export interface ProfilePlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  /** `places.locality`, used **only** to label a cluster, never to group one. See `cities`. */
  readonly locality: string | null;
  /** ISO-3166 alpha-2, absent where the resolver never established one (2 of the 32 local rows). */
  readonly countryCode?: string | null;
  /** Already resolved through `productCategoryFor`, so this module never re-ranks the three claims
   *  (override, provider category, extracted hint) a second, divergent way. */
  readonly category: ProductCategory | null;
  readonly visitState: 'want_to_go' | 'visited';
  /** The post this place was saved from, or `null` for a manual save. */
  readonly creator: ProfileCreator | null;
}

export interface ProfileCreator {
  readonly handle: string | null;
  readonly name: string | null;
}

export interface ProfileStats {
  readonly saved: number;
  /**
   * **Coordinate clusters, never `places.locality`.** The local library holds six distinct
   * locality strings for two cities — `London`, `Tel Aviv-Yafo`, `Tel Aviv`, `תל אביב - יפו`,
   * `תל אביב-יפו`, `ת״א` — so `count(distinct locality)` would print `6 cities` to someone who has
   * saved places in two. That is the failure `current-state` §9.1 rules against, and
   * `clusterByProximity` at its default 50 km radius is the primitive already in the tree for it: a
   * single-link cluster of that radius is one metropolitan area by construction.
   */
  readonly cities: number;
  /** Distinct countries, by the same plurality rule the map's band uses — so a place with no
   *  country of its own still lands in the country of the area it sits in, and the two surfaces
   *  cannot disagree. A cluster nothing can name is not counted as a country. */
  readonly countries: number;
  /** `visit_state = 'visited'`. */
  readonly been: number;
  /** The other visit state. Carried rather than left to be derived so no renderer has to subtract,
   *  and so the pair reads as two facts instead of a fraction. */
  readonly notBeenYet: number;
}

/** One country of the library, ready to render: `🇬🇧 United Kingdom · 18`. */
export interface CountryCount {
  /** ISO-3166 alpha-2, or `null` for the group whose places carry no usable country at all. */
  readonly countryCode: string | null;
  /** The country's English name, or — where there is no code — the area's own name, which is the
   *  honest label for a group we could not name a country for. */
  readonly label: string;
  readonly count: number;
}

/** One creator, and how much of your library came from them. */
export interface CreatorCount {
  readonly handle: string | null;
  readonly name: string | null;
  /** What to print. The handle where there is one, because that is what the creator is called on
   *  TikTok and what the source link resolves to; the display name only as a fallback. */
  readonly label: string;
  readonly count: number;
}

/** Everything `/profile` renders, from one pass over the library. */
export interface ProfileBreakdown {
  readonly stats: ProfileStats;
  readonly countries: readonly CountryCount[];
  readonly categories: readonly CategoryFacet[];
  readonly creators: readonly CreatorCount[];
}

function toPoint(place: ProfilePlace): GeoPoint {
  return { lat: place.lat, lng: place.lng };
}

/**
 * The library's clusters. `clusterByProximity` drops items whose coordinate is invalid, so a broken
 * row cannot mint a phantom city at Null Island; it stays counted in `saved`, which is what the
 * user's library actually contains.
 */
function clusters(places: readonly ProfilePlace[]): readonly GeoCluster<ProfilePlace>[] {
  return clusterByProximity(places, toPoint);
}

/**
 * One clustering pass, shared. Single-link clustering is quadratic in the library size, and every
 * number on this page that is about *where* comes out of the same pass rather than re-running it.
 */
function geography(places: readonly ProfilePlace[]): {
  readonly cities: number;
  readonly countries: readonly CountryCount[];
} {
  const areas = buildAreas(clusters(places), {
    toId: (place) => place.id,
    toPoint,
    toLocality: (place) => place.locality,
  });

  const countries = summariseByCountry(areas, (place) => place.countryCode ?? null, toPoint).map(
    (summary): CountryCount => ({
      countryCode: summary.countryCode,
      // `summariseByCountry` already falls back to the area's own name where there is no code;
      // `toCountryName` is re-applied for nothing but clarity about where the name comes from.
      label: toCountryName(summary.countryCode) ?? summary.label,
      count: summary.count,
    }),
  );

  return { cities: areas.length, countries };
}

export function countryBreakdown(places: readonly ProfilePlace[]): readonly CountryCount[] {
  return geography(places).countries;
}

export function categoryBreakdown(places: readonly ProfilePlace[]): readonly CategoryFacet[] {
  return categoryFacets(places, (place) => place.category);
}

/**
 * Who you save from, most first.
 *
 * **Plain text, and it must stay plain text.** `product-inspiration-plotline-2026-08-29.md` §4
 * refusal 6 rules that a creator handle must not become a link: the step from "text on your own
 * page" to "tap to see their other posts" is creator discovery, which Charter §1 excludes by name.
 * This is a count of your own saves, not a signal about anyone else — refusal 5's cross-user reads
 * are a different thing and are not what this is.
 *
 * A place with no source (a manual save) counts for nobody rather than for an "Unknown" creator.
 * Ties break on the label so the order is stable between renders.
 */
export function creatorBreakdown(
  places: readonly ProfilePlace[],
  limit = 5,
): readonly CreatorCount[] {
  const counts = new Map<string, { creator: ProfileCreator; label: string; count: number }>();

  for (const place of places) {
    const creator = place.creator;
    if (creator === null) continue;
    const handle = (creator.handle ?? '').trim();
    const name = (creator.name ?? '').trim();
    const label = handle !== '' ? `@${handle}` : name;
    if (label === '') continue;

    // Keyed on the handle where there is one: two posts by the same account can carry different
    // display names (the account renamed itself between saves), and that is one creator.
    const key = handle !== '' ? `@${handle.toLowerCase()}` : `name:${name.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) counts.set(key, { ...existing, count: existing.count + 1 });
    else {
      counts.set(key, {
        creator: { handle: handle === '' ? null : handle, name: name === '' ? null : name },
        label,
        count: 1,
      });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(
      (entry): CreatorCount => ({
        handle: entry.creator.handle,
        name: entry.creator.name,
        label: entry.label,
        count: entry.count,
      }),
    );
}

function statsFrom(
  places: readonly ProfilePlace[],
  cities: number,
  countries: readonly CountryCount[],
): ProfileStats {
  let been = 0;
  for (const place of places) if (place.visitState === 'visited') been += 1;

  return {
    saved: places.length,
    cities,
    // The unnamed group is a gap, not a country, so it is listed and not counted.
    countries: countries.filter((country) => country.countryCode !== null).length,
    been,
    notBeenYet: places.length - been,
  };
}

export function deriveProfileStats(places: readonly ProfilePlace[]): ProfileStats {
  const { cities, countries } = geography(places);
  return statsFrom(places, cities, countries);
}

export function deriveProfileBreakdown(places: readonly ProfilePlace[]): ProfileBreakdown {
  const { cities, countries } = geography(places);
  return {
    stats: statsFrom(places, cities, countries),
    countries,
    categories: categoryBreakdown(places),
    creators: creatorBreakdown(places),
  };
}

export interface AccountIdentity {
  /** The strongest name we hold. Never invented — see below. */
  readonly title: string;
  /** The email, when it is not already the title. */
  readonly subtitle: string | null;
}

/**
 * **We hold a display name or we hold nothing.** `profiles.display_name` (migration `0002`) is
 * nullable and is only ever populated from the signup metadata, so most accounts have none — the
 * local database has one of three. When it is absent the email is shown *as* the identity rather
 * than being split, initial-capped or otherwise dressed up into a name the user never gave us.
 */
export function accountIdentity(input: {
  readonly displayName?: string | null;
  readonly email?: string | null;
}): AccountIdentity {
  const displayName = (input.displayName ?? '').trim();
  const email = (input.email ?? '').trim();

  if (displayName !== '') {
    return { title: displayName, subtitle: email === '' ? null : email };
  }
  if (email !== '') return { title: email, subtitle: null };
  // Reachable only if Supabase hands back a session with no email at all. Better than an empty
  // heading, and it still claims nothing.
  return { title: 'Your account', subtitle: null };
}

/**
 * `Joined August 2026`, from `profiles.created_at` — the one date we actually hold about the
 * account. (`saved_places.created_at` would give "saving since", which is a different and less
 * honest claim on an account that has saved nothing.)
 *
 * Fixed to `en-GB` and UTC rather than the server's locale and zone: the rendered string is
 * compared in a test, and a month name that changes with the machine is a flaky test rather than a
 * feature. Month precision means the timezone choice can only matter on the first of a month.
 */
export function joinedLabel(createdAt: Date | null): string | null {
  if (createdAt === null || Number.isNaN(createdAt.getTime())) return null;
  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(createdAt);
  return `Joined ${month}`;
}
