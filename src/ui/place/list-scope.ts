/**
 * **The list scope** — what the sidebar is a list *of*, and the rules allowed to change it
 * (owner requirement, 2026-08-29).
 *
 * ## What this adds to `active-area.ts`, and what it overrules
 *
 * `active-area.ts` answered one question: *which of your areas are you in*. That was the right
 * answer while the map only ever drew pins, and it is still the answer inside the area and pin
 * bands. It became the wrong answer the day the map grew a country band: at world zoom the screen
 * shows `United Kingdom 18` and `Israel 13`, there is no single city on it, and the list underneath
 * still said `12 places in London`. The list was describing a place the map had stopped showing.
 *
 * So scope is now a three-state thing rather than one anchor:
 *
 *  - **`global`** — the whole library. What the list means when the map is drawing countries.
 *  - **`country`** — one country of it. What a country tap now selects.
 *  - **`area`** — one ~50 km cluster. Exactly what `activeAreaId` meant, unchanged.
 *
 * **This reverses a documented decision, deliberately.** Camera mover 5 in `map-page-client.tsx`
 * was specified to move the camera and *nothing else* — "you have chosen a country, not a place, so
 * the sheet keeps saying exactly what it said". The owner used that and rejected it: tapping
 * `United Kingdom 18` and landing on a list still headed `13 places in Tel Aviv-Yafo` reads as a
 * broken control. A country tap now writes the scope as well as flying the camera, which makes
 * mover 5 a **writer** too, and the enumeration in that file has to say so.
 *
 * ## The band is the trigger, not the rectangle
 *
 * The rule that survives from `active-area.ts` — *the camera may not quietly rewrite the list* — is
 * kept by making the only camera-driven transition a **discrete** one. `scopeAfterCameraSettled`
 * switches on `bandForZoom`, which changes at two numbers and is the same thing the map itself
 * swaps layers on. A pan of any size that stays in one band changes the scope only by the rule
 * that already existed (`dominantArea`: an area-scoped list follows the user across a 50 km cluster
 * boundary), and a pan inside one area is a no-op down to object identity.
 *
 * That is the owner's third requirement — "do not refilter on every small map pan" — expressed as a
 * property of the state machine rather than as a threshold someone has to tune.
 *
 * ## Two preconditions this module cannot enforce, and the caller must
 *
 *  1. **`userInitiated` has to become true for a user's own zoom.** `ViewportChangeMeta` currently
 *     documents it as false for "a zoom of any kind", which was correct when a zoom could only ever
 *     hand the list to another city by accident. Under the band rule a zoom is the *only* gesture
 *     that can cross a band, so with the flag as it stands today every transition below is dead
 *     code. It must stay false for every programmatic move — that is the whole guard, and it is
 *     what stops a re-fit or a post-import flight rewriting the list.
 *  2. **The zoom has to be reported.** It now is (`ViewportChangeMeta.zoom`/`.band`).
 *
 * Pure: no React, no DOM, no MapLibre. The one import from `components/` is `zoom-bands.ts`, which
 * is itself pure and is the single definition of where a band starts — its own docblock forbids
 * re-deriving those numbers, and a second copy of them here is exactly the drift it warns about.
 */

import { bandForZoom } from '@/components/map/zoom-bands';
import { toCountryName } from '@/domain/places/country-code';
import {
  areaHeading,
  dominantArea,
  resolveArea,
  UNNAMED_OTHER_AREA_LABEL,
  type Area,
  type AreaHeading,
} from './active-area';
import type { CountrySummary } from './library-summary';
import { withinBounds, type ViewportBounds } from './viewport';

/**
 * What the list is showing.
 *
 * A discriminated union rather than a pair of nullable ids (`activeAreaId` + `activeCountryKey`,
 * with `both null` meaning global) because those are four states for three meanings, and the fourth
 * — an area and a country at once — has no rendering. One value, one truth, and an exhaustive
 * `switch` at every consumer.
 *
 * `area` still carries an **anchor place id** rather than a cluster index, for the reason
 * `active-area.ts` gives at length: clusters are rebuilt on every library change and carry no id of
 * their own, so only a place id survives an import landing in the area or a deletion from it.
 * `country` carries a `CountrySummary.key`, which is stable in the same way — it is the ISO code,
 * or the countryless sentinel.
 */
export type ListScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'country'; readonly key: string }
  | { readonly kind: 'area'; readonly anchor: string };

/** One frozen global scope, so "nothing changed" is object identity and a React `setState` bails
 *  out instead of re-rendering every surface on the page. */
export const GLOBAL_SCOPE: ListScope = Object.freeze({ kind: 'global' as const });

/** A country marker or a country group heading was tapped. */
export function scopeForCountryTap(key: string): ListScope {
  return { kind: 'country', key };
}

/** An area marker or an `Elsewhere` row was tapped — the gesture `active-area.ts` calls writer 2. */
export function scopeForAreaTap(anchor: string): ListScope {
  return { kind: 'area', anchor };
}

/** Value equality, for the caller's converge-during-render write and its `useMemo` guards. The
 *  union is three shallow shapes, so this is total and stays total under an exhaustive `switch`. */
export function sameScope(a: ListScope, b: ListScope): boolean {
  if (a === b) return true;
  switch (a.kind) {
    case 'global':
      return b.kind === 'global';
    case 'country':
      return b.kind === 'country' && b.key === a.key;
    case 'area':
      return b.kind === 'area' && b.anchor === a.anchor;
  }
}

/** What every resolved scope carries, whatever its kind — so a surface can read the membership and
 *  the count without narrowing first, and only narrows when it wants the country or the area. */
interface ScopeContents<T> {
  /**
   * The scope in canonical form, ready to store. For an area it is the area's own stable id even
   * when the stored anchor was some other member — which is what makes writing it back after a
   * fallback converge in one render instead of oscillating.
   */
  readonly scope: ListScope;
  /** Every area in scope, in library order. One area for an area scope; the country's areas for a
   *  country; all of them for global. */
  readonly areas: readonly Area<T>[];
  /**
   * Every saved place in scope, **before** the filters.
   *
   * A set of ids rather than the places themselves, deliberately: the caller filters its own
   * `matches` array against this, which keeps the list in library order (`created_at desc`).
   * Concatenating areas would produce a different order per scope, and the order of the list is a
   * thing the user notices.
   */
  readonly memberIds: ReadonlySet<string>;
  /** `memberIds.size` — the library's own count for this scope, before any filter. */
  readonly count: number;
}

/** The concrete thing the list should render. */
export type ResolvedScope<T> =
  | (ScopeContents<T> & {
      readonly kind: 'global';
      /** Every country, for the grouped global list — the accessible rendering of the country
       *  band, and the reason the two must come from one computation (`library-summary.ts`). */
      readonly countries: readonly CountrySummary<T>[];
    })
  | (ScopeContents<T> & { readonly kind: 'country'; readonly country: CountrySummary<T> })
  | (ScopeContents<T> & { readonly kind: 'area'; readonly area: Area<T> });

/**
 * The scope, resolved against the library as it is right now.
 *
 * `null` when the stored scope names something that no longer exists — an area whose last place was
 * deleted, a country emptied by the same deletion. This degrades exactly the way `resolveArea`
 * does, and for the same reason: the caller owns what to fall back *to*, and a resolver that
 * invented a default would hide a deletion behind a silent jump.
 *
 * Global always resolves, including over an empty library. "Everything you saved" is still a
 * well-formed answer when the answer is nothing, and the empty-library screen is a different
 * surface's job.
 */
export function resolveScope<T>(
  areas: readonly Area<T>[],
  countries: readonly CountrySummary<T>[],
  scope: ListScope,
): ResolvedScope<T> | null {
  switch (scope.kind) {
    case 'global': {
      const memberIds = unionMemberIds(areas);
      return {
        kind: 'global',
        scope: GLOBAL_SCOPE,
        countries,
        areas,
        memberIds,
        count: memberIds.size,
      };
    }
    case 'country': {
      const country = countries.find((candidate) => candidate.key === scope.key);
      if (country === undefined) return null;
      const memberIds = unionMemberIds(country.areas);
      return {
        kind: 'country',
        scope: scopeForCountryTap(country.key),
        country,
        areas: country.areas,
        memberIds,
        count: memberIds.size,
      };
    }
    case 'area': {
      const area = resolveArea(areas, scope.anchor);
      if (area === null) return null;
      return {
        kind: 'area',
        scope: scopeForAreaTap(area.id),
        area,
        areas: [area],
        memberIds: area.memberIds,
        count: area.memberIds.size,
      };
    }
  }
}

/**
 * Where the list goes when the stored scope named something deleted: the caller's preferred area if
 * it still exists, else global.
 *
 * The preferred area is the page's own anchor cluster — the area holding the most recently saved
 * place. Falling back to *global* rather than to some other city is the honest move when even that
 * is gone: the user has just deleted the thing the list was about, and answering with a different
 * city they did not ask for is how a deletion turns into a teleport.
 */
export function fallbackScope<T>(
  areas: readonly Area<T>[],
  preferredAreaId: string | null,
): ListScope {
  if (preferredAreaId !== null && resolveArea(areas, preferredAreaId) !== null) {
    return scopeForAreaTap(preferredAreaId);
  }
  return GLOBAL_SCOPE;
}

/** `resolveScope` with `fallbackScope` already applied — total, because global always resolves. The
 *  one the page renders from; the nullable version above is for callers that need to *know* the
 *  stored scope died (to write the correction back to state). */
export function resolveScopeOrFallback<T>(
  areas: readonly Area<T>[],
  countries: readonly CountrySummary<T>[],
  scope: ListScope,
  preferredAreaId: string | null,
): ResolvedScope<T> {
  const resolved = resolveScope(areas, countries, scope);
  if (resolved !== null) return resolved;
  // `fallbackScope` only ever returns a resolvable area or global, and global always resolves — so
  // the second arm is unreachable. It is written out rather than asserted with `!` so that a future
  // third fallback cannot make this function lie silently.
  return resolveScope(areas, countries, fallbackScope(areas, preferredAreaId))
    ?? resolveGlobal(areas, countries);
}

function resolveGlobal<T>(
  areas: readonly Area<T>[],
  countries: readonly CountrySummary<T>[],
): ResolvedScope<T> {
  const memberIds = unionMemberIds(areas);
  return { kind: 'global', scope: GLOBAL_SCOPE, countries, areas, memberIds, count: memberIds.size };
}

/**
 * **The only camera-driven writer of the scope**, and the successor to `areaAfterCameraSettled`.
 *
 * The whole transition table:
 *
 * | Band the camera settled in | Scope now | Scope after |
 * |---|---|---|
 * | any | any | **unchanged** when `userInitiated` is false, or there is no rect or zoom |
 * | `country` | `global` | unchanged (identity) |
 * | `country` | `country` / `area` | `global` — the map is drawing countries, so the list is too |
 * | `area` / `pin` | `global` | the area under the camera, or its country if two of that country's areas are on screen |
 * | `area` / `pin` | `country` | unchanged — a pan is not a country change |
 * | `area` / `pin` | `area` | `dominantArea`, i.e. unchanged unless the pan crossed a 50 km cluster boundary |
 *
 * `userInitiated === false` changing nothing at all is the guard that carries over verbatim from
 * `areaAfterCameraSettled`, and it is doing more work here than it was: a country tap now flies the
 * camera *and* writes a country scope, so the flight that follows must not immediately overwrite
 * what the tap just wrote. It cannot, because that flight is programmatic.
 *
 * Returns `scope` **by identity** in every case that is not a transition, so a settled pan inside
 * one area costs a `setState` that bails out rather than a re-render of every surface.
 */
export function scopeAfterCameraSettled<T>(input: {
  readonly scope: ListScope;
  /** The zoom the camera came to rest at. `null` from a surface that cannot report one, which is
   *  treated exactly like a missing rect: decide nothing. */
  readonly zoom: number | null;
  readonly userInitiated: boolean;
  readonly areas: readonly Area<T>[];
  readonly countries: readonly CountrySummary<T>[];
  readonly rect: ViewportBounds | null;
}): ListScope {
  const { scope, zoom, userInitiated, areas, countries, rect } = input;
  if (!userInitiated || rect === null || zoom === null) return scope;

  if (bandForZoom(zoom) === 'country') {
    return scope.kind === 'global' ? scope : GLOBAL_SCOPE;
  }

  if (scope.kind === 'global') return restoredScope(areas, countries, rect) ?? scope;

  // A country scope is only ever entered by an explicit tap, and only an explicit tap leaves it.
  // Panning across the Channel at area-band zoom is possible and does not re-country the list:
  // "only update when clusters change or when clicking a specific cluster" (owner, requirement 3),
  // and a country is a thing you chose rather than a thing you drifted into.
  if (scope.kind === 'country') return scope;

  const currentId = resolveArea(areas, scope.anchor)?.id ?? scope.anchor;
  const next = dominantArea(areas, rect, currentId) ?? currentId;
  return next === currentId ? scope : scopeForAreaTap(next);
}

/**
 * Leaving the country band: what the list becomes.
 *
 * The area under the camera, except when the camera is showing **two or more areas of one
 * country** — then the country is what is on screen and the country is what the list says. That is
 * not an extra rule so much as the one that makes the two routes to the same view agree: a country
 * tap lands inside the area band by construction (`COUNTRY_LANDING_ZOOM`), and zooming manually to
 * the same camera has to produce the same heading, or the list's state would depend on how you got
 * there.
 *
 * The countryless bucket is excluded from that promotion. Its areas are the ones we could not place,
 * grouped by an admission rather than by a country, so "you are looking at two of them" is not a
 * fact about anywhere. It stays tappable — an explicit tap on that group is still a country scope.
 *
 * `null` only when there are no areas at all, which keeps the list global.
 */
function restoredScope<T>(
  areas: readonly Area<T>[],
  countries: readonly CountrySummary<T>[],
  rect: ViewportBounds,
): ListScope | null {
  const areaId = dominantArea(areas, rect, null);
  if (areaId === null) return null;

  const country = countries.find(
    (candidate) =>
      candidate.countryCode !== null && candidate.areas.some((area) => area.id === areaId),
  );
  if (country !== undefined && areasOnScreen(country.areas, rect) >= 2) {
    return scopeForCountryTap(country.key);
  }
  return scopeForAreaTap(areaId);
}

/** How many of these areas have at least one pin in the rect. The anchor point, exactly as
 *  `dominantArea` counts — an area is "on screen" when one of your places in it is. */
function areasOnScreen<T>(areas: readonly Area<T>[], rect: ViewportBounds): number {
  let count = 0;
  for (const area of areas) {
    if (area.points.some((point) => withinBounds(point, rect))) count += 1;
  }
  return count;
}

function unionMemberIds<T>(areas: readonly Area<T>[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const area of areas) for (const id of area.memberIds) ids.add(id);
  return ids;
}

/**
 * What the heading calls this scope — the `in ___` half of every line, and the same string the
 * map's accessible name uses.
 *
 * `null` only for an unnamed area, which is `areaHeading`'s existing `this area` case and is left
 * to it rather than resolved twice.
 *
 * | Scope | Reads |
 * |---|---|
 * | area | `London` · `null` -> `this area` |
 * | country | `the United Kingdom` · `Israel` |
 * | global, 2+ countries | `3 countries` |
 * | global, exactly 1 | that country — the global list and its list hold the same places, so the |
 * |  | sentence is true either way and `31 places in 1 country` is not English anyone writes |
 * | global, 1 countryless bucket over 2+ areas | `your library` — see below |
 * | global, empty library | `your library` |
 *
 * **The single-country shortcut cannot be taken for the countryless bucket with more than one area
 * in it**, and that was a real sentence until it was tested. The bucket's label is
 * `library-summary.ts`'s "name it after the place it actually contains" rule, which reads the
 * *first* area — so a library of three saves in Kowloon and two in Osaka, none of them carrying a
 * country, rendered `5 places in Kowloon` over a list that plainly held Osaka too. The shortcut is
 * sound whenever the label speaks for everything under it: a real country contains all of its own
 * areas by construction, and a one-area bucket is that one area. Neither holds here, and
 * `1 countries` is not the repair, so the honest answer is the one the empty library already gives.
 */
export function scopeLabel<T>(resolved: ResolvedScope<T>): string | null {
  switch (resolved.kind) {
    case 'area':
      return resolved.area.label;
    case 'country':
      return countryLabel(resolved.country);
    case 'global': {
      const countries = resolved.countries;
      if (countries.length === 0) return 'your library';
      const only = countries[0];
      if (countries.length === 1 && only !== undefined) {
        return only.countryCode !== null || only.areas.length === 1
          ? countryLabel(only)
          : 'your library';
      }
      return `${countries.length} countries`;
    }
  }
}

/**
 * A country as a heading says it, article and all.
 *
 * The article is a display rule over ICU's English name, not a table of 250 countries: names
 * beginning `United`, and names ending `Islands` or `Republic`, take `the`, plus the handful of
 * plurals ICU renders without one. A name this misses reads slightly clipped (`in Netherlands`);
 * it never says anything untrue, which is the direction to fail in for a copy rule.
 *
 * The countryless bucket keeps `library-summary.ts`'s label, lowercased when that label is the
 * `Another area` fallback — mid-sentence, `9 places in Another area` reads like a proper noun for
 * a place that does not exist.
 */
function countryLabel<T>(country: CountrySummary<T>): string {
  if (country.countryCode === null) {
    return country.label === UNNAMED_OTHER_AREA_LABEL
      ? UNNAMED_OTHER_AREA_LABEL.toLowerCase()
      : country.label;
  }
  const name = toCountryName(country.countryCode) ?? country.label;
  return takesDefiniteArticle(name) ? `the ${name}` : name;
}

/** ICU English names that read wrong without `the`. See `countryLabel`. */
const ALWAYS_ARTICLED: ReadonlySet<string> = new Set([
  'Netherlands',
  'Philippines',
  'Bahamas',
  'Maldives',
  'Gambia',
  'Comoros',
]);

function takesDefiniteArticle(name: string): boolean {
  return (
    name.startsWith('United ') ||
    name.endsWith(' Islands') ||
    name.endsWith(' Republic') ||
    ALWAYS_ARTICLED.has(name)
  );
}

/**
 * The heading, for any scope.
 *
 * Deliberately **not** a second copy table. Every state the owner asked for — `31 places in 3
 * countries`, `12 matches in 3 countries`, `18 places in the United Kingdom` — is `areaHeading`'s
 * existing `<count> <noun> in <where>` with a different `where`, and so is every one of its harder
 * states: `Nothing matches "momos"`, `You've been to all of them`, `7 to go in the United Kingdom`,
 * the `Clear search` escape and the two notes. Forking that logic to gain three sentences would
 * mean maintaining the been/not-been vocabulary, the filtered/unfiltered nouns and the
 * here-vs-nowhere distinction in two places, and they would eventually disagree.
 *
 * So this function's whole job is choosing `where`, and the result is an `AreaHeading` — the same
 * shape the sheet's peek row and the desktop panel already render, so no surface parses a string or
 * learns a second model.
 */
export function scopeHeading<T>(input: {
  readonly scope: ResolvedScope<T>;
  /** How many of the scope's places survive the filters — what the list is about to render. */
  readonly countInScope: number;
  readonly searchQuery: string;
  readonly tagLabel: string | null;
  readonly notBeenOnly?: boolean;
  /** Matches anywhere in the library, not just in scope. Distinguishes "not here" from "nowhere",
   *  which are different sentences with different ways out. */
  readonly matchesAnywhere: number;
}): AreaHeading {
  return areaHeading({
    countInArea: input.countInScope,
    area: scopeLabel(input.scope),
    searchQuery: input.searchQuery,
    tagLabel: input.tagLabel,
    ...(input.notBeenOnly === undefined ? {} : { notBeenOnly: input.notBeenOnly }),
    matchesAnywhere: input.matchesAnywhere,
  });
}

/**
 * Which country marker carries the "you are here" ring (`MapSummaries.activeCountryKey`).
 *
 * `null` under a global scope, and that is the point rather than a gap: at world zoom with the whole
 * library listed, no single country is the one you are in, and ringing one would contradict the list
 * directly under it.
 */
export function activeCountryKey<T>(
  resolved: ResolvedScope<T>,
  countries: readonly CountrySummary<T>[],
): string | null {
  switch (resolved.kind) {
    case 'global':
      return null;
    case 'country':
      return resolved.country.key;
    case 'area': {
      const found = countries.find((country) =>
        country.areas.some((area) => area.id === resolved.area.id),
      );
      return found?.key ?? null;
    }
  }
}

/**
 * The area the `Elsewhere` section should exclude, if any.
 *
 * `null` for a country or global scope, because those list several areas above it and there is no
 * single one to subtract. What `Elsewhere` should *become* under those scopes is a surface
 * question (`elsewhere-groups.ts`), not this module's — this only answers what the scope is.
 */
export function scopeAreaId<T>(resolved: ResolvedScope<T>): string | null {
  return resolved.kind === 'area' ? resolved.area.id : null;
}
