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
  /** The country's English name, or — where there is no code — `Another area`. Never a city's
   *  name: a group we could not name a country for is a gap, and printing the city there would put
   *  `חיפה` in the list as a peer of `Israel`. See `CountrySummary.label`. */
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

  const summaries = summariseByCountry(areas, (place) => place.countryCode ?? null, toPoint);

  const countries = summaries.map(
    (summary): CountryCount => ({
      countryCode: summary.countryCode,
      // `summariseByCountry` owns the label, including the countryless group's — which is
      // `Another area`, never a city's name. See `CountrySummary.label`.
      label: summary.label,
      count: summary.count,
    }),
  );

  // **`cities` is counted off the same summaries the list renders, not off `areas`.** They differ
  // whenever `bucketAreasByCountry` drops a bucket it cannot place a marker for (every member's
  // coordinate invalid), and a headline saying `4 Cities` above three listed groups is exactly the
  // contradiction this page must not be able to produce. One pass, one list, both numbers.
  const cities = summaries.reduce((sum, summary) => sum + summary.areas.length, 0);

  return { cities, countries };
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
    // The countryless group is a gap, not a country: it is listed — under `Another area`, with no
    // flag and sorted last — and it is not counted here. Both halves come from the one `countries`
    // array above, so `N Countries` is always the number of *named* rows beneath it.
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
  /**
   * The name to print **as a name**, or null when we hold none. Nothing else is ever promoted into
   * this slot — see below, because something was.
   */
  readonly name: string | null;
  /**
   * The line beneath it: the address this account signs in with. `Your account` only when there is
   * neither a name nor an email, so the block is never blank; null when there is a name and no
   * email, because the name has already said whose account this is.
   */
  readonly account: string | null;
}

/**
 * Who this account is, on the one screen where the product is talking to **you** about **you**.
 *
 * ## The bug this replaced, which was a fallback working exactly as written
 *
 * Until 2026-09-01 this function took a display name and an email, and when the display name was
 * absent it returned **the email address as the `title`** — rendered beside the avatar at
 * `text-lg font-bold`, in the slot a name goes in. `profiles.display_name` is null for all eight
 * local accounts and has been for the life of the product (nothing ever wrote it: the only writer
 * is the invite-join prompt, and none of the eight has ever joined a collection by link), so **that
 * branch was not the edge case, it was the only case.** The owner reported the symptom weeks ago as
 * *"the profile screen shows a demo email"* — `demo@example.com` is the first of those eight rows —
 * and it was never root-caused, because nothing was failing: a `??` chain was doing precisely what
 * it said, one slot further up the page than it should have been.
 *
 * An email address is not a name. Putting one where a name goes states something false about the
 * user in the largest type on their own account screen. So the email keeps its place on this
 * screen — it is the useful answer to *which account am I signed in as* — and it never takes the
 * name's.
 *
 * ## Where the name comes from, in order
 *
 * 1. **`profile_names.first_name`** (`0035`) — the private name, given at sign-up, readable by its
 *    owner and by nobody else. This is what the product calls you, and this screen is the product
 *    talking to you.
 * 2. **`profiles.display_name`** — the label the user confirmed for collection peers to see. Second
 *    rather than first because it answers a different question (*what should other people call
 *    me*), but it is still a name this user typed about themselves, so addressing them by it on
 *    their own screen claims nothing they did not already say. It is the only name the eight
 *    pre-`0035` accounts can ever acquire without a new surface.
 * 3. **Nothing.** Never the email, never its local part, never a split or an initial-cap of either.
 *
 * The reverse direction — `first_name` reaching a peer — is closed in the schema rather than here:
 * `0035` writes no trigger onto `profiles` and grants no peer any read of `profile_names`.
 *
 * `last_name` is not read. It is stored because the owner asked for it and, as `0035`'s own column
 * comment records, it has no consumer anywhere in `src/`. That tension is the owner's to resolve
 * and is left visible rather than quietly closed by rendering a full name here.
 */
export function accountIdentity(input: {
  readonly firstName?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
}): AccountIdentity {
  const firstName = (input.firstName ?? '').trim();
  const displayName = (input.displayName ?? '').trim();
  const email = (input.email ?? '').trim();

  const name = firstName !== '' ? firstName : displayName !== '' ? displayName : null;
  if (name !== null) return { name, account: email === '' ? null : email };

  // No name at all: the eight accounts that predate `0035`, and anyone who signs up through a path
  // that does not collect one. The email carries the block on its own — as an address, which is
  // what `/profile` styles it as — and `Your account` is the last resort for a session Supabase
  // handed back with no email either. It claims nothing.
  return { name: null, account: email === '' ? 'Your account' : email };
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
