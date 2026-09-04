/**
 * **A place name in a query, answered from the user's own library and nothing else.**
 * `docs/nls-plan.md` §5, Stage 2 — the first slice.
 *
 * The model already returns a `keyword` copied verbatim from the query. Before that keyword is
 * used as text, this module asks one question: *is it the name of somewhere this user has saved
 * places?* If it is, the answer is the **cluster** those places belong to, which is the whole
 * point — the library holds four spellings of one city (`תל אביב-יפו`, `Tel Aviv-Yafo`,
 * `Tel Aviv`, `ת״א`) and `filterBySearch('tel aviv')` finds only the rows spelled that way.
 * `clusterByProximity` has already merged all four into one area, so expanding a name match to its
 * cluster costs one pass and closes the defect §1.2 measured.
 *
 * ## What it deliberately is not
 *
 * **Not a geocoder** (§5.4). It cannot tell you where Kyoto is, only whether you saved anything
 * there, which is the question actually being asked. Nothing here contacts a provider, so this
 * slice needs no ruling on sending localities to a model (§5.5), no schema bump, no prompt change
 * and no re-run of the Stage 1 gate.
 *
 * **Not a gazetteer and not an editor.** The alias table §5.1 calls for is a *join* — query term
 * to stored keys — and it is not in this slice. Nothing here ever rewrites `places.locality`; the
 * moment it did, it would be fabrication.
 *
 * **Not a silent text search.** An unresolved name returns `null`, and the caller must keep
 * treating the keyword as text and say so. §5.1 step 4: unresolved is a real answer, and it must
 * never quietly become something that looks like it worked.
 *
 * ## Two rungs, in order, and why it stops there
 *
 * 1. **Exact, normalised.** `normalise()` is this project's single answer to "are these the same
 *    text?", so `Tel Aviv` and `tel aviv` are one name and `Tel Aviv` and `Tel Aviv-Yafo` are two.
 * 2. **The query is a whole-token prefix of a stored name.** This rung exists for one measured
 *    case: §5.6 requires `תל אביב` to work, and the library stores `תל אביב-יפו`, which normalises
 *    to `תל אביב יפו` — a different key. The direction is asymmetric on purpose: the query may be
 *    a prefix of what is stored, never the other way round, so a longer phrase cannot drag in a
 *    shorter name it merely contains.
 *
 * §5.1's alias table and Jaro-Winkler rung are **not** here. They are the two that can be wrong in
 * a way the user cannot see, and they deserve their own measurement rather than a ride on this
 * one.
 */
import {
  clusterByProximity,
  clusterLabel,
  type GeoCluster,
} from '@/domain/places/clusters';
import { normalise } from '@/domain/places/normalise';

/** The least a row has to be for this to reason about it. Structural, so `domain/` never learns
 *  about `MapPlace` — the same projection-by-argument shape `clusterByProximity` uses. */
export interface LocalityRow {
  readonly id: string;
  readonly locality: string | null | undefined;
  readonly lat: number;
  readonly lng: number;
}

export interface LocalityMatch {
  /**
   * **The library's own spelling**, never a canonical string this product picked (§5.3). `null`
   * when the cluster's spellings tie or it has none, and a caller that gets `null` must fall back
   * to the user's own words rather than inventing a name.
   */
  readonly label: string | null;
  /** The whole cluster: what the filter is. */
  readonly memberIds: readonly string[];
  /** The rows whose stored name actually matched, before expansion. Kept so a caller can say how
   *  much of the answer is the name and how much is the cluster — extracted versus inferred. */
  readonly matchedIds: readonly string[];
  /** Which rung answered. Reported rather than hidden: `prefix` is a weaker claim than `exact`. */
  readonly via: 'exact' | 'prefix';
}

/** Whether `query` is a whole-token prefix of `stored` — `tel aviv` of `tel aviv yafo`, but not
 *  `tel aviv y`. Both arguments are already normalised. */
function isTokenPrefix(query: string, stored: string): boolean {
  return stored.startsWith(`${query} `);
}

/**
 * Resolve a keyword to one of the user's own areas, or to nothing at all.
 *
 * `null` means *this is not a place name in this library* — the caller keeps the keyword as text.
 * It is never an error and never an empty result: a name that resolves always has rows behind it,
 * because the only way to resolve is to have matched a row.
 */
export function resolveLocality(
  keyword: string | null | undefined,
  rows: readonly LocalityRow[],
): LocalityMatch | null {
  const query = normalise(keyword);
  if (query === '') return null;

  const exact: LocalityRow[] = [];
  const prefixed: LocalityRow[] = [];
  for (const row of rows) {
    const stored = normalise(row.locality);
    if (stored === '') continue;
    if (stored === query) exact.push(row);
    else if (isTokenPrefix(query, stored)) prefixed.push(row);
  }

  // Exact wins outright: if any row is called exactly this, a longer name that merely starts with
  // it is a different place and must not widen the answer.
  const via = exact.length > 0 ? 'exact' : 'prefix';
  const matched = exact.length > 0 ? exact : prefixed;
  if (matched.length === 0) return null;

  const clusters = clusterByProximity<LocalityRow>(
    rows,
    (row) => ({ lat: row.lat, lng: row.lng }),
    // The same projection the page passes, so the areas this resolves to are the areas the map and
    // the sheet already draw. Omitting it would fall back to pure proximity and group neighbouring
    // cities together (`clusters.ts`'s `ClusterOptions`).
    { toLocality: (row) => row.locality },
  );

  const matchedIds = new Set(matched.map((row) => row.id));
  const hit: GeoCluster<LocalityRow>[] = clusters.filter((cluster) =>
    cluster.members.some((member) => matchedIds.has(member.id)),
  );

  // A row with no usable coordinate is dropped by `clusterByProximity` rather than parked at Null
  // Island, so a name that only ever appears on such rows resolves to no cluster at all. That is
  // an honest `null`: we know the name, we cannot say where it is.
  if (hit.length === 0) return null;

  const memberIds: string[] = [];
  for (const cluster of hit) {
    for (const member of cluster.members) memberIds.push(member.id);
  }

  return {
    label: labelFor(hit, matchedIds),
    memberIds,
    matchedIds: matched.map((row) => row.id),
    via,
  };
}

/**
 * The name to show, taken from the cluster that most of the matches live in.
 *
 * A name can honestly appear in two clusters — two Londons, or a city either side of the join
 * radius — and the answer unions both, so the label has to come from somewhere. It comes from the
 * cluster holding the most matched rows, and from `clusterLabel`, which returns the raw plurality
 * spelling and **`null` on a tie rather than flipping a coin** (§5.3). A tie between clusters is
 * `null` for the same reason.
 */
function labelFor(
  clusters: readonly GeoCluster<LocalityRow>[],
  matchedIds: ReadonlySet<string>,
): string | null {
  let best: GeoCluster<LocalityRow> | null = null;
  let bestScore = -1;
  let tied = false;
  for (const cluster of clusters) {
    const score = cluster.members.filter((member) => matchedIds.has(member.id)).length;
    if (score > bestScore) {
      best = cluster;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  if (best === null || tied) return null;
  return clusterLabel(best, (row) => row.locality);
}

/**
 * **The geography a sentence resolved to, as the four filter cells' fifth sibling.**
 *
 * Deliberately not a `LocalityMatch` or a `CountryMatch`: those are what a resolver found, this is
 * what the product will execute — the same distinction `SentenceApplication` draws against
 * `SearchIntent`.
 *
 * ## One cell for both shapes, and why it is not a sixth
 *
 * A country narrows by country code and frames through a different camera mover, so it looks like
 * a second axis. It is not, for three reasons that are all about what the product already holds:
 *
 * 1. **It is the same question.** The user typed one place name, and the answer is either one of
 *    their cities or one of their countries — never both at once. Two cells would allow a state
 *    (`Tel Aviv` AND `Italy`) that no sentence can produce and that the resolver would have to
 *    forbid at the far end.
 * 2. **§4.3's identity comes free.** Preview-equals-applied holds because the panel and the page
 *    run *one* chain of five passes. A sixth pass is a sixth place for the two chains to drift,
 *    and the acceptance gate is exactly that they cannot.
 * 3. **The chip and `Clear all` already reach this cell and only this cell.** The filter row's
 *    fifth chip is `AreaFilterContext` and `NothingHereEscape` reads that same context, both in
 *    files this change does not touch. A sixth cell would have to be threaded through both, and
 *    the one that was missed would make `Clear all` start lying again — a bug that was found and
 *    fixed on 2026-09-04.
 *
 * So both shapes are one cell, and `kind` is the only thing that differs downstream: which camera
 * mover fires on apply, and which scope it writes.
 *
 * ## Why a country still carries place ids
 *
 * A country *could* be executed as a predicate over `country_code`. Resolving it to ids at match
 * time instead means the fifth pass stays one `Set.has` for both shapes, so the panel's count and
 * the page's set are computed by the same function over the same input — which is the whole of
 * §4.3. The cost is that the set is a snapshot of the library at resolve time; the one route that
 * grows the library, `openImport`, already blanks this cell along with the other four.
 *
 * ## The name
 *
 * `SentenceArea` and `filterByArea` keep their names although a country is not an area. The filter
 * row's half of this vocabulary — `AreaFilterChip`, `AreaFilterContext` — lives in
 * `library-filter-bar.tsx`, outside this change's write scope, so a rename here would split one
 * axis's name across two files. One imperfect word beats two.
 */
interface SentenceGeographyBase {
  /**
   * What to call it. For an area, the library's own plurality spelling; `null` when the cluster's
   * spellings tie, and a caller that gets `null` must fall back to the user's own words rather
   * than inventing a name (§5.3).
   */
  readonly label: string | null;
  /** The user's own words, carried so a caller with no `label` can still say what was asked for. */
  readonly typed: string;
  /** What the filter is. */
  readonly placeIds: readonly string[];
}

export type SentenceArea =
  /** One of the user's own clusters, found by name. Applied by camera mover 4. */
  | (SentenceGeographyBase & { readonly kind: 'area' })
  /**
   * One of the countries the user has places in, found by ICU over `en`/`he` and nothing that
   * leaves the device (§5.5). Applied by camera mover 5.
   */
  | (SentenceGeographyBase & {
      readonly kind: 'country';
      /** ISO-3166-1 alpha-2 — how the page finds the country summary the camera frames. */
      readonly countryCode: string;
      /** Library rows carrying no country code at all: reported, never silently dropped (§5.6). */
      readonly unplaceable: number;
    });

/** What to show for the fifth axis: the library's own plurality spelling, the country's own name,
 *  or the user's own words. Never a canonical string this product picked (§5.3). */
export function areaLabel(area: SentenceArea): string {
  return area.label ?? area.typed;
}

/**
 * The geography pass — the fifth filter, and the one that runs first.
 *
 * Structural in `T` so `domain/` never learns about `MapPlace`, and total: no geography is no
 * narrowing, which is what makes it composable with the four that already exist. One
 * implementation for both `kind`s, which is what makes the panel's preview and the page's apply
 * literally the same code (§4.3).
 */
export function filterByArea<T extends { readonly id: string }>(
  items: readonly T[],
  area: SentenceArea | null | undefined,
): readonly T[] {
  if (area == null) return items;
  const keep = new Set(area.placeIds);
  return items.filter((item) => keep.has(item.id));
}
