/**
 * **The active area** — which of the user's own areas the list is showing, and the rules that are
 * allowed to change it (`UX-LIST-SPEC.md`, owner request 2026-08-28).
 *
 * ## The failure this replaces
 *
 * The list used to be "every saved place whose pin is inside the map's query rect". That coupled a
 * continuous, largely unauthored input — the camera — to a destructive output: rows left the list
 * and the only way back was to reproduce a camera position by hand. The camera moves for reasons
 * the user never asked for (inertia, a `ResizeObserver` re-fit, a `fitBounds` after the container
 * finally measures, framing a pin), so `21 places in this area` became `9 places in this area` with
 * nobody touching anything.
 *
 * The coupling was right; the **granularity** was wrong. The unit of scope is a *place*, not a
 * rectangle. `domain/places/clusters.ts` already groups saved places at ~50 km on coordinates
 * (never on the `locality` string — the live library holds `London`, `Tel Aviv-Yafo`, `Tel Aviv`
 * and `תל אביב - יפו`, four spellings for two cities). So the map now answers **which of your areas
 * you are in**, and nothing else. Pan and zoom freely inside one: nothing changes at all. Cross into
 * another of your own areas, and the list switches — which is the only moment it may.
 *
 * The cluster boundary **is** the hysteresis: data-shaped rather than screen-shaped, with no pixel
 * threshold, dwell timer or "search this area" pill to tune.
 *
 * ## The one rule
 *
 * **Narrowing never navigates. Navigation is always an explicit tap.** The search box and the tag
 * chip narrow what is listed and can never move the camera or change the active area.
 *
 * ## Identity: an anchor place id, not a cluster index
 *
 * Clusters are recomputed from `places` on every library change and carry no id of their own. Naming
 * the active area by *any* place inside it, and resolving that back to "the cluster that currently
 * contains this place", survives everything that matters: a new import landing in the cluster, a
 * place being deleted from it, and the input order shifting under `created_at desc`. It also makes
 * the post-import writer trivial — set the anchor to a just-saved place id and the area resolves
 * itself the moment the refreshed rows arrive, with no waiting on the data.
 *
 * `Area.id` is the lexicographically smallest member id purely so an area has a stable React key
 * and a stable value to compare; lookup is by membership, so the id changing under an import is
 * harmless.
 *
 * Pure: no React, no DOM, no MapLibre. Every rule below is decided here so it can be tested without
 * a renderer, which is the point — these are exactly the rules that were impossible to check when
 * they lived inside a camera event handler.
 */

import {
  clusterLabel,
  haversineKm,
  type GeoBounds,
  type GeoCluster,
  type GeoPoint,
} from '@/domain/places/clusters';
import { boundsCentre, withinBounds, type ViewportBounds } from './viewport';

/** What the header says instead of a city name when the places in an area do not agree on one. */
export const UNNAMED_AREA_LABEL = 'this area';

/** The same absence, in a row that is *not* the area you are looking at — `this area` would be a
 *  lie there, and `Unnamed area` reads like a defect rather than an honest gap. */
export const UNNAMED_OTHER_AREA_LABEL = 'Another area';

/** One of the user's areas: a coordinate cluster of their saved places, plus the presentation
 *  facts the list needs. Generic over the caller's place type, exactly as `clusterByProximity` is,
 *  so this module never learns what a `MapPlace` is. */
export interface Area<T> {
  /** Stable key: the lexicographically smallest member id. Never used for lookup — see the header. */
  readonly id: string;
  /** The city name, or `null` when the members do not agree on one. */
  readonly label: string | null;
  /** The area's places, in the caller's input order (which is `created_at desc`, i.e. most recently
   *  saved first — the list's order, and it never changes on pan, zoom or resize). */
  readonly members: readonly T[];
  readonly memberIds: ReadonlySet<string>;
  /** Member coordinates, kept alongside so a camera-settled decision costs no re-projection. */
  readonly points: readonly GeoPoint[];
  readonly bounds: GeoBounds;
}

export interface AreaProjections<T> {
  readonly toId: (item: T) => string;
  readonly toPoint: (item: T) => GeoPoint;
  readonly toLocality: (item: T) => string | null;
}

/**
 * Turn clusters into areas, once per library.
 *
 * **The label is `clusterLabel`'s plurality rule, not `viewport.ts`'s 70% confidence rule**, and
 * that is a deliberate departure from the spec, decided against the real library. The 70% bar
 * existed to stop a *viewport* spanning two cities from being named after one of them — a viewport
 * can hold London and Tel Aviv at once. A 50 km single-link cluster cannot: its members are one
 * metropolitan area by construction, so the only open question is which spelling to print, and that
 * is a display choice rather than a which-city claim.
 *
 * Measured: the local Tel Aviv cluster is six `Tel Aviv-Yafo`, two `Tel Aviv` and one
 * `תל אביב - יפו` — 67%, under the old bar, so the 70% rule would render `9 places in this area`
 * and an `Another area · 9 places` row that names nowhere. All nine rows are the same city; calling
 * it `Tel Aviv-Yafo` asserts nothing the data disputes. `clusterLabel` still returns `null` on a
 * genuine tie between spellings, and `null` still prints as `this area`.
 */
export function buildAreas<T>(
  clusters: readonly GeoCluster<T>[],
  projections: AreaProjections<T>,
): readonly Area<T>[] {
  const { toId, toPoint, toLocality } = projections;
  return clusters.map((cluster) => {
    const ids = cluster.members.map(toId);
    let smallest = ids[0] ?? '';
    for (const id of ids) if (id < smallest) smallest = id;
    return {
      id: smallest,
      label: clusterLabel(cluster, toLocality),
      members: cluster.members,
      memberIds: new Set(ids),
      points: cluster.members.map(toPoint),
      bounds: cluster.bounds,
    };
  });
}

/**
 * The area named by an anchor — the place id the active-area state actually holds.
 *
 * Membership first (the anchor is a place *in* the area), then `Area.id`, so an anchor written
 * before a library change still resolves afterwards. `null` when the anchor is unset, or when the
 * place it named is gone; the caller falls back to its own default rather than this function
 * inventing one.
 */
export function resolveArea<T>(
  areas: readonly Area<T>[],
  anchorId: string | null,
): Area<T> | null {
  if (anchorId === null) return null;
  return (
    areas.find((area) => area.memberIds.has(anchorId)) ??
    areas.find((area) => area.id === anchorId) ??
    null
  );
}

/** The anchor to store for an area: the area's own stable id. */
export function anchorFor<T>(area: Area<T> | null): string | null {
  return area?.id ?? null;
}

/**
 * Which area a settled camera is over. **Only ever consulted for a user gesture** — see
 * `areaAfterCameraSettled`, which is the enforcement point.
 *
 * Most pin anchors inside the rect wins. With nothing in the rect at all (empty ocean, or a deep
 * zoom into a street with no saved places) it falls back to the area whose *bounding box* is
 * nearest the centre of the rect — which is distance zero for anywhere inside the area you are
 * already in, so standing in a quiet corner of London keeps saying London.
 *
 * **Ties prefer the current area, always.** That is what makes the boundary behave like hysteresis
 * instead of a coin flip along a line: a viewport holding four London pins and four Tel Aviv ones
 * does not oscillate, it stays where it was.
 */
export function dominantArea<T>(
  areas: readonly Area<T>[],
  rect: ViewportBounds,
  currentId: string | null,
): string | null {
  if (areas.length === 0) return null;

  let best: { id: string; score: number } | null = null;
  for (const area of areas) {
    let inRect = 0;
    for (const point of area.points) if (withinBounds(point, rect)) inRect += 1;
    if (inRect === 0) continue;
    if (best === null || inRect > best.score || (inRect === best.score && area.id === currentId)) {
      best = { id: area.id, score: inRect };
    }
  }
  if (best !== null) return best.id;

  const centre = boundsCentre(rect);
  let nearest: { id: string; km: number } | null = null;
  for (const area of areas) {
    const km = distanceToBoundsKm(area.bounds, centre);
    if (nearest === null || km < nearest.km || (km === nearest.km && area.id === currentId)) {
      nearest = { id: area.id, km };
    }
  }
  return nearest?.id ?? null;
}

/** Kilometres from a point to the nearest edge of a box — zero inside it. The box rather than the
 *  members, for the same reason `pickAnchorCluster` uses it: it over-estimates an area's extent,
 *  which is the forgiving direction for "am I still where I was?". */
function distanceToBoundsKm(bounds: GeoBounds, point: GeoPoint): number {
  const nearest: GeoPoint = {
    lat: Math.min(bounds.north, Math.max(bounds.south, point.lat)),
    lng: Math.min(bounds.east, Math.max(bounds.west, point.lng)),
  };
  return haversineKm(point, nearest);
}

/**
 * **The four-writer rule, enforced.**
 *
 * `activeAreaId` has exactly four writers: the initial anchor resolution, an area-row tap, a
 * finished import, and a *settled user gesture that crossed a boundary*. It is **never re-derived
 * from settled bounds**, and this function is the only path the fourth writer can take.
 *
 * `userInitiated` is false for every programmatic camera move — a `ResizeObserver` re-fit, the
 * initial `fitBounds`, a flight to a row's pin, the post-import flight — because those emit a
 * `moveend` with no `originalEvent` behind it. A camera the user did not move therefore cannot
 * rewrite the list, structurally rather than by a guard someone has to remember. That is the
 * specific fix for `21 places` becoming `9 places` with nobody touching anything.
 *
 * It is false for a zoom, too, and that is the second half of the promise: zooming out from Tel Aviv
 * until London's twelve pins are also on screen must not hand the list to London. The caller decides
 * what counts as a pan (`map-surface.mapcn.tsx`); this function decides nothing at all when it is
 * told the camera moved on its own.
 *
 * Returns the id to store, which is `currentId` unchanged in every case that is not a crossing.
 */
export function areaAfterCameraSettled<T>(input: {
  readonly areas: readonly Area<T>[];
  readonly currentId: string | null;
  readonly rect: ViewportBounds | null;
  readonly userInitiated: boolean;
}): string | null {
  const { areas, currentId, rect, userInitiated } = input;
  if (!userInitiated || rect === null) return currentId;
  return dominantArea(areas, rect, currentId) ?? currentId;
}

/** One `Elsewhere` row: another of the user's areas, with how many of the current matches are in it. */
export interface AreaRow {
  readonly id: string;
  /** Already resolved for display — never `null`, never `this area`. */
  readonly label: string;
  readonly count: number;
}

/**
 * The `Elsewhere` section: one row per *other* area, most places first.
 *
 * `matchIds` is the library after the search box and the tag chip, so a row reports what the user
 * would actually find there — `No matches in London` needs no escape button of its own when the
 * row below it already says `Tel Aviv-Yafo · 3 matches ›`. Areas with nothing left after the
 * filters are dropped rather than shown as `0`: a row that leads to an empty list is a broken
 * promise with a tap target on it.
 *
 * Sorted count descending, then label, then id — deterministic, so the rows do not reorder between
 * two renders of the same library.
 */
export function elsewhereRows<T>(
  areas: readonly Area<T>[],
  activeId: string | null,
  matchIds: ReadonlySet<string>,
): readonly AreaRow[] {
  const rows: AreaRow[] = [];
  for (const area of areas) {
    if (area.id === activeId) continue;
    let count = 0;
    for (const id of area.memberIds) if (matchIds.has(id)) count += 1;
    if (count === 0) continue;
    rows.push({ id: area.id, label: area.label ?? UNNAMED_OTHER_AREA_LABEL, count });
  }
  return rows.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
  );
}

/** `8 places` / `1 place` / `8 matches` / `1 match` — the trailing half of an `Elsewhere` row, and
 *  the same noun the header uses, so one screen never calls the same rows two things. */
export function areaRowCountText(count: number, filtering: boolean): string {
  if (filtering) return `${count} ${count === 1 ? 'match' : 'matches'}`;
  return `${count} ${count === 1 ? 'place' : 'places'}`;
}

/** What a screen reader hears on an area row: the name, the count, and what tapping does. */
export function areaRowAccessibleName(row: AreaRow, filtering: boolean): string {
  return `${row.label}, ${areaRowCountText(row.count, filtering)}, show on map`;
}

/** Everything the header needs to say what the list is. Shape-compatible with what the sheet's peek
 *  row and the desktop panel already render, so no surface parses a string. */
export interface AreaHeading {
  /** The whole line, e.g. `12 places in London`. */
  readonly text: string;
  /** The leading count on its own, so the peek row can emphasise it. `null` for the stateless
   *  lines (`No matches in London`, `Nothing matches "momos"`). */
  readonly count: string | null;
  /** `text` minus `count` and the space after it. Equals `text` when `count` is `null`. */
  readonly rest: string;
  /** Nothing to list in this area right now — the surface renders no rows, and the `Elsewhere`
   *  section below is the way out. */
  readonly empty: boolean;
  /** Whether this state has a control that undoes it. `clear-search` only: a tag filter is undone
   *  by its own pill directly above the list, and two controls for one state is worse than one. */
  readonly escape: 'clear-search' | null;
}

/**
 * The header line, per the spec's copy table.
 *
 * `12 places in London` · `1 place in London` · `12 places in this area`
 * `3 matches in London` · `1 match in London` · `3 matches in this area`
 * `No matches in London` — the filters match somewhere, just not here; the rows below say where.
 * `Nothing matches "momos"` — the search matches nowhere in the library. Offers `Clear search`.
 * `Nothing tagged "Momos"` — the chip matches nowhere. Its pill above is the way out.
 *
 * `Nothing saved in this area` is **gone**, and cannot recur: an area is defined by the places in
 * it, so an unfiltered area always has at least one. That deletes the state `Show my places`
 * existed to escape, and the button with it.
 */
export function areaHeading(input: {
  /** How many of the area's places survive the filters — what the list is about to render. */
  readonly countInArea: number;
  readonly area: string | null;
  /** The search box, trimmed. `''` when empty. */
  readonly searchQuery: string;
  /** The active tag as the user saw it on the chip, or `null`. */
  readonly tagLabel: string | null;
  /** How many places match the filters anywhere in the library. Distinguishes "not here" from
   *  "nowhere", which are different sentences and different ways out. */
  readonly matchesAnywhere: number;
}): AreaHeading {
  const { countInArea, area, searchQuery, tagLabel, matchesAnywhere } = input;
  const filtering = searchQuery !== '' || tagLabel !== null;

  if (filtering && matchesAnywhere === 0) {
    // Search wins the sentence when both are on: it is the thing the user typed, and the tag's own
    // pill is on screen immediately above with its own clear control.
    const text =
      searchQuery !== ''
        ? `Nothing matches "${searchQuery}"`
        : `Nothing tagged "${tagLabel ?? ''}"`;
    return {
      text,
      count: null,
      rest: text,
      empty: true,
      escape: searchQuery !== '' ? 'clear-search' : null,
    };
  }

  const where = area ?? UNNAMED_AREA_LABEL;

  if (countInArea === 0) {
    const text = `No matches in ${where}`;
    return { text, count: null, rest: text, empty: true, escape: null };
  }

  const noun = filtering
    ? countInArea === 1
      ? 'match'
      : 'matches'
    : countInArea === 1
      ? 'place'
      : 'places';
  const count = String(countInArea);
  const rest = `${noun} in ${where}`;
  return { text: `${count} ${rest}`, count, rest, empty: false, escape: null };
}

/** The heading as a sentence, for the live region and for the map's own accessible name. */
export function areaHeadingSentence(heading: AreaHeading): string {
  return `${heading.text}.`;
}

/**
 * The map's accessible name. The canvas is unreachable by a screen reader, so the one useful thing
 * it can say is what it is showing and that the list beside it is complete — `The list below names
 * all 12` is the difference between "there might be more out there" and "this is everything here".
 */
export function mapAccessibleName(heading: AreaHeading, area: string | null): string {
  const where = area ?? UNNAMED_AREA_LABEL;
  if (heading.count === null) return `Map of your saved places in ${where}.`;
  return `Map of your saved places in ${where}. The list below names all ${heading.count}.`;
}
