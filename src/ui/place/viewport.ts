/**
 * What the saved-places list says about itself when the map is the query — `L1-F5-T2`, specified in
 * `docs/ux-map-is-the-query.md` §2 and §6.
 *
 * Pure, no React, no DOM, no MapLibre. It lives in `ui/` for the same reason `enrichment.ts` does:
 * none of it is a fact about a place. Which of three spellings of one city to print, and whether a
 * mixed viewport has earned a name at all, are presentation judgements — the places are the same
 * places either way.
 *
 * ## The change this file encodes
 *
 * The header used to read `20 places saved`: a number, about nowhere, unchanged by anything the user
 * did to the map. The map was a scoping control wired to nothing, which is why it read as
 * decoration. Now the list is exactly what is inside the viewport and the header names the area —
 * `12 places in London`.
 *
 * ## Why `3 of 20` is retired rather than extended
 *
 * There are two narrowings live at once now (the viewport, and the search), so a denominator has
 * become ambiguous — is `20` the library, or what is in view? `3 matches in London` has no
 * denominator to misread, cannot be heard as "you have three places", and names the thing the user
 * is looking at. The noun carries the meaning: it changes from `places` to `matches` exactly when a
 * second filter is applied, which is the whole difference in one word.
 *
 * The library total is therefore not displayed anywhere on `/map`. It is a collection metric, and
 * this product does retrieval.
 */

import { normalise } from '@/domain/places/normalise';
import { haversineKm, type GeoPoint } from '@/domain/places/clusters';

/**
 * The share of in-view places that must agree on a city before the header will name it.
 *
 * 70% rather than a plain plurality. A viewport holding seven London places and five Tel Aviv ones
 * is genuinely not "London", and saying so would be the product asserting something false about
 * what is on screen — the failure this whole feature exists to fix, in the opposite direction. Two
 * clusters visible at a continental zoom fall out of this rule on their own; no separate rule for
 * that case is needed, and none should be added.
 */
export const AREA_LABEL_CONFIDENCE = 0.7;

/** What the header knows about a place. Deliberately not `MapPlace` — this file has no business
 *  with pins, notes or source links, and a projection keeps it testable with object literals. */
export interface ViewportPlace {
  readonly locality?: string | null;
}

/**
 * The area's name, or `null` when the places in view do not agree on one.
 *
 * Grouping is on `normalise()` — the project's one answer to "are these the same text?"
 * (`current-state.md` §7) — and the value returned is the most common **raw** spelling inside the
 * winning group, so the user sees a real city name rather than the normalised key `tel aviv yafo`.
 *
 * **What that grouping does and does not do, measured rather than assumed.** `normalise()` folds
 * casing, accents and punctuation, so `Café Florentin`'s `Tel Aviv-Yafo` and a hypothetical
 * `tel aviv-yafo` are one group. It does **not** bridge `Tel Aviv-Yafo` and `Tel Aviv`: those
 * normalise to `tel aviv yafo` and `tel aviv`, which are different keys, and no amount of
 * normalising makes them the same — the difference is a real word, not a formatting choice.
 * Bridging them would mean prefix or similarity matching, which is the entity-resolution project
 * `current-state.md` §4 explicitly rules out of scope, and which would also happily merge two cities
 * that genuinely share a prefix.
 *
 * So the thing that actually protects the real library is the **confidence threshold**, not the
 * grouping. The live Tel Aviv cluster is six `Tel Aviv-Yafo` to two `Tel Aviv`: the majority group
 * is 75%, clears the bar, and the header reads `8 places in Tel Aviv-Yafo`. Had the split been
 * closer the header would read `8 places in this area`, which is not wrong — it is the honest answer
 * when the rows themselves do not agree what the city is called. Being vague beats being confidently
 * wrong, and it never shows the user two names for one place.
 *
 * Places with no locality join a `null` group that can never win. They dilute the confidence share,
 * which is correct: a viewport that is half unlabelled places has not earned a name.
 */
export function areaLabel(places: readonly ViewportPlace[]): string | null {
  if (places.length === 0) return null;

  // key → every raw spelling seen for it, in first-seen order, with a count each.
  const groups = new Map<string, Map<string, number>>();
  for (const place of places) {
    const raw = place.locality?.trim();
    if (!raw) continue;
    const key = normalise(raw);
    if (key === '') continue;
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
    groups.set(key, spellings);
  }
  if (groups.size === 0) return null;

  let winner: { key: string; count: number; spellings: Map<string, number> } | null = null;
  for (const [key, spellings] of groups) {
    let count = 0;
    for (const n of spellings.values()) count += n;
    // Strictly greater, so a tie between two *different* cities keeps the incumbent and then fails
    // the confidence test below — a tied viewport is exactly the ambiguous case.
    if (!winner || count > winner.count) winner = { key, count, spellings };
  }
  if (!winner) return null;
  if (winner.count / places.length < AREA_LABEL_CONFIDENCE) return null;

  // Within the winning group the tie is between spellings of one city, which is a casing/punctuation
  // choice rather than a which-city choice. First-seen wins, which `Map` iteration order gives us.
  let label: string | null = null;
  let best = 0;
  for (const [raw, n] of winner.spellings) {
    if (n > best) {
      best = n;
      label = raw;
    }
  }
  return label;
}

/**
 * The rectangle the map reports as "what is on screen" — field-for-field the `LatLngBoundsHint` the
 * map surface speaks, redeclared here so this file never imports from `components/`.
 */
export interface ViewportBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

/**
 * Whether a place's pin anchor is inside the query rect.
 *
 * The **anchor point**, not the icon's bounding box and not its label: the anchor is the only thing
 * stable across zoom levels, so it is the only rule that gives the same answer twice
 * (`ux-map-is-the-query.md` §1 rule 1).
 *
 * Longitude is compared with a wrap branch rather than a plain `>=`/`<=` pair. The surface reports
 * unwrapped longitudes, so a viewport straddling the antimeridian arrives with `east < west`; the
 * plain comparison would then match nothing and the list would go empty. Crossing 180° is not a
 * supported *feature* — no saved place is anywhere near it — but it must not silently empty the
 * list, which is the difference between an unsupported case and a bug.
 *
 * This lives here rather than using MapLibre's own `LngLatBounds.contains()` because the page client
 * is on the product side of the map port and must not import a vendor SDK.
 */
export function withinBounds(point: GeoPoint, bounds: ViewportBounds): boolean {
  if (point.lat < bounds.south || point.lat > bounds.north) return false;
  return bounds.west <= bounds.east
    ? point.lng >= bounds.west && point.lng <= bounds.east
    : point.lng >= bounds.west || point.lng <= bounds.east;
}

/** The centre of a rect, for the nearest-first sort. Longitude is averaged through the same wrap
 *  branch as `withinBounds`, so a straddling viewport does not put its centre on the far side of
 *  the globe. */
export function boundsCentre(bounds: ViewportBounds): GeoPoint {
  const lat = (bounds.north + bounds.south) / 2;
  if (bounds.west <= bounds.east) return { lat, lng: (bounds.west + bounds.east) / 2 };
  const lng = (bounds.west + bounds.east + 360) / 2;
  return { lat, lng: lng > 180 ? lng - 360 : lng };
}

/** Everything the header needs to say what it is looking at. */
export interface ViewportHeading {
  /** The whole line, e.g. `12 places in London`. */
  readonly text: string;
  /** The leading count, as its own string, so a surface can emphasise it without parsing `text`.
   *  `null` for the states that have no count (`Nothing saved in this area`). */
  readonly count: string | null;
  /** `text` minus `count` and the space after it — the unemphasised remainder. Equals `text` when
   *  `count` is `null`. */
  readonly rest: string;
  /** Whether this heading is reporting an empty result, so a surface can render the matching escape
   *  (`Show my places` / `Show all matches`) without re-deriving the condition. */
  readonly empty: boolean;
}

/**
 * The header line for the current viewport, per the string matrix in `ux-map-is-the-query.md` §2.2.
 *
 * `inViewCount` is how many saved places are inside the query rect **after** the search has been
 * applied, because that is what the list is showing and the header must never disagree with the rows
 * beneath it.
 */
export function viewportHeading(
  inViewCount: number,
  area: string | null,
  searchActive: boolean,
): ViewportHeading {
  // `saved` appears in exactly one string on this screen, and it is load-bearing there: it says the
  // map is fine, your library just does not reach here.
  if (inViewCount === 0) {
    const text = searchActive ? 'No matches in this area' : 'Nothing saved in this area';
    return { text, count: null, rest: text, empty: true };
  }

  const where = area === null ? 'this area' : area;
  const noun = searchActive
    ? inViewCount === 1
      ? 'match'
      : 'matches'
    : inViewCount === 1
      ? 'place'
      : 'places';
  const count = String(inViewCount);
  const rest = `${noun} in ${where}`;
  return { text: `${count} ${rest}`, count, rest, empty: false };
}

/**
 * The heading as a sentence, for the one place a screen reader hears it (a keyboard-driven camera
 * move, or an explicit `Show my places`). `ux-map-is-the-query.md` §7.1 is deliberate that a pan by
 * pointer announces nothing at all.
 */
export function viewportHeadingSentence(heading: ViewportHeading): string {
  return `${heading.text}.`;
}

/**
 * The list's order: nearest to the centre of the map first.
 *
 * The map is the query, so the centre of the map is the query point, and the top of the list is then
 * the pins the user's eye is already on. That is what makes the list and the map read as one object
 * rather than two views that happen to share data — and it is why near-me needs no sort of its own
 * later: near-me is "put the viewport on me", and this ordering already answers it.
 *
 * The spec (§6) suggested an equirectangular approximation here. This uses `haversineKm` instead —
 * it is already written, already tested, and is the project's only distance function. Two distance
 * functions that disagree by a rounding error in the fourth decimal is a worse outcome than the
 * handful of microseconds saved at the few dozen places a viewport can hold.
 *
 * Distances are never displayed. Distance from a map centre is not a fact about the world, and
 * showing it would invite the user to read it as distance from themselves.
 *
 * Stable: equal distances keep their input order, so the caller's own ordering (most recently saved
 * first) survives as the tiebreak without this function needing to know about it.
 */
export function sortByDistanceFromCentre<T>(
  places: readonly T[],
  centre: GeoPoint,
  toPoint: (place: T) => GeoPoint,
): readonly T[] {
  return places
    .map((place, index) => ({ place, index, km: haversineKm(toPoint(place), centre) }))
    .sort((a, b) => a.km - b.km || a.index - b.index)
    .map((entry) => entry.place);
}
