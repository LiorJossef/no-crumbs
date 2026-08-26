/**
 * Text search over the user's **own saved places** — `L1-F6-T2`, the sheet/panel field in
 * `ux-architecture.md` §1.3/§1.4. Not to be confused with POI search (`L1-F7-T1`, S8), which asks
 * the resolver about places the user has never saved; this file only narrows a list we already
 * hold in memory.
 *
 * ## Why it reuses `normalise()`
 *
 * The library has `Café Florentin` and `Nordoy Café` in it. A search that fails on `cafe` because
 * the user did not type the acute accent is not a rough edge, it is the field not working — and
 * the reverse (`café` failing to find a row stored without the accent) is just as bad. The project
 * already owns exactly one answer to "when are two place names the same name": `normalise()`
 * (NFKD → strip combining marks → drop punctuation → collapse whitespace). Search uses it rather
 * than growing a second, quietly different one, so `Café`/`cafe`, `Tel Aviv-Yafo`/`tel aviv` and
 * `Sycamore Vino Cucina & Bar`/`sycamore bar` all behave the way the resolver already says they do.
 *
 * ## The matching rule
 *
 * Every whitespace-separated token of the query must appear **somewhere** in the place's searchable
 * text — token-AND, substring, order-independent. So `london cafe` finds cafés in London,
 * `tel aviv` finds both `Tel Aviv` and `Tel Aviv-Yafo`, and typing more never widens the result.
 * Substring rather than prefix because the library is small and forgiving beats clever here:
 * `nonna` should find `La Nonna Brixton`.
 *
 * Tokens are matched against the fields joined by a space. That can't produce a false match across
 * a field boundary, because a token never contains whitespace (it is what splitting on whitespace
 * produced) and the separator always does.
 *
 * ## Which fields are searchable, and why exactly these
 *
 * **You can search anything the row shows you.** Name, category, locality and the user's own note
 * are the four things a list row renders (`PlaceRow`), so every match is explainable by looking at
 * the result — the user is never left staring at a row wondering what it matched.
 *
 * Deliberately excluded: `reason` (the model's sentence about why the post recommended the place)
 * and `addressLine`. Both would find real matches, and neither is on screen, so both produce rows
 * that look like bugs. Adding them is a change to what a row displays first, not a change here.
 *
 * ## Client-side, on purpose
 *
 * This runs over the places already loaded into `/map`, so typing narrows the list **and the pins**
 * in the same frame with no request, no spinner and no map flicker — which is what "consistently"
 * in the exit criterion actually costs. It is O(places × fields) per keystroke: at the hundreds of
 * saved places this product realistically reaches, that is microseconds. A library large enough to
 * feel it needs a server-side query and a different interaction (debounce, pending state), and that
 * is a real change, not a tuning knob.
 */

import { normalise, tokenise } from './normalise';

/**
 * The searchable projection of a saved place: exactly the fields a list row renders. Nullable and
 * optional throughout because the read model is (`Spot`'s `category`, `locality` and `note` are all
 * genuinely absent on some rows) — an absent field simply contributes nothing to match against.
 */
export interface SearchablePlace {
  readonly name: string;
  readonly category?: string | null;
  readonly locality?: string | null;
  readonly note?: string | null;
}

/**
 * Whether this query filters anything at all. Blank (or whitespace-only) is **not** a filter: the
 * field is empty, so the list is everything. Callers use this to decide whether to show the "no
 * matches" copy or the plain list — a query of `''` matching nothing would be absurd.
 */
export function isSearchActive(query: string): boolean {
  return query.trim() !== '';
}

/**
 * The query as match tokens. Empty for a blank query — and also for a query made **entirely** of
 * characters `normalise()` drops (`"..."`, `"&&"`), which is a real state, not an impossible one:
 * see `filterBySearch` for what it does with it.
 */
export function toSearchTokens(query: string): readonly string[] {
  return tokenise(query);
}

/** One place's searchable text, normalised and joined. Exported for the tests, not for callers. */
export function toSearchHaystack(place: SearchablePlace): string {
  return [place.name, place.category, place.locality, place.note]
    .map((field) => normalise(field))
    .filter((field) => field !== '')
    .join(' ');
}

/** Whether one place matches an already-tokenised query. Empty tokens match everything — the
 *  caller decides whether empty tokens should have been asked about at all. */
export function matchesSearchTokens(
  place: SearchablePlace,
  tokens: readonly string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = toSearchHaystack(place);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * The filter itself, generic over the caller's own place type so `domain/` never learns about
 * `MapPlace` (a UI port) — the caller supplies the projection.
 *
 * Three cases, and the middle one is the interesting one:
 *  - blank query → everything, unchanged (the same array identity, so React memoisation upstream
 *    doesn't churn on a field the user has not typed in);
 *  - a query the normaliser reduces to nothing (`"..."`) → **nothing**. The alternative, showing
 *    everything, reads on screen as "the search box is broken"; showing nothing at least agrees
 *    with what the user typed, and the "Nothing matches …" copy names the query back to them;
 *  - otherwise → the places whose searchable text contains every token.
 */
export function filterBySearch<T>(
  places: readonly T[],
  query: string,
  toSearchable: (place: T) => SearchablePlace,
): readonly T[] {
  if (!isSearchActive(query)) return places;

  const tokens = toSearchTokens(query);
  if (tokens.length === 0) return [];

  return places.filter((place) => matchesSearchTokens(toSearchable(place), tokens));
}
