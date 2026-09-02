'use client';

/**
 * One tag, held as the library's active filter — the other half of "make the chips do what they
 * look like they do". `domain/places/search.ts` already made tags *searchable*; this makes them
 * *tappable*, which is the retrieval gesture the tag vocabulary was built for (see
 * `domain/extraction/tags.ts`, which has said "the filter chips read" since it was written).
 *
 * ## Why a filter dimension of its own, rather than writing into the search box
 *
 * The cheap version of this feature is `onClick={() => setQuery(tag)}`: no new state, no new
 * component, the existing machinery does the rest. It was rejected for three reasons, in order of
 * how much they cost.
 *
 * 1. **It would move the camera, and the camera is parked.** `map-page-client.tsx`'s
 *    `useSearchFlight` flies the map to the results half a second after the query settles (camera
 *    mover 3). A chip tap that set the query would therefore pan and zoom the map — the exact
 *    behaviour the owner has objected to in `current-state.md` §0.1b, arriving through a new door.
 *    Suppressing the flight for chip-set queries means teaching the search hook the difference
 *    between a query the user typed and a query a chip wrote, which is a second dimension anyway,
 *    only hidden inside a string.
 * 2. **A tag is an identity, a query is a substring.** Search is token-AND substring matching over
 *    name, category, locality, note, tags and dishes. `Wine` as a query matches a place whose note
 *    says "great wine list"; `wine` as a tag means the extractor labelled the place `wine`. The
 *    chip says the second thing, so it must not quietly do the first — a control that means
 *    something slightly different from what it is is worse than no control.
 * 3. **The two are not the same thing to undo.** With one text field holding both, the user cannot
 *    tell which part of the narrowing came from the chip they tapped, and `Clear search` throws
 *    away both. As separate dimensions they compose as AND — the tag narrows the library, the text
 *    narrows within it — and each is dismissed on its own.
 *
 * The cost is one `useState`, one predicate and one pill. That is small enough that "simpler is
 * better" does not settle it in the query's favour.
 *
 * ## Why a context rather than props
 *
 * Chips are leaves in three different trees: the mobile sheet's detail, the desktop map's
 * pin-anchored popover (rendered inside `components/map/**`, which this agent does not own the
 * mechanics of), and any surface that renders `PlaceDetail` later. Threading a callback to all of
 * them means editing the map surface's props to carry a filter concern through it.
 *
 * A `null` context is a first-class state and it is the default: with no provider a chip renders
 * exactly as it did before this change — an inert `<span>`, no hover, no focus ring, no button. So
 * every existing call site, test and mock keeps its old behaviour without opting out of anything.
 */

import { createContext, use } from 'react';
import { tagDisplayLabel, tagKey } from '@/domain/extraction/tags';

/** What a chip needs to know to be a control. `null` where there is no filter to drive. */
export interface TagFilter {
  /**
   * The tags currently narrowing the library, as stored (lowercase, normalised).
   *
   * **A list, not one tag** (owner, 2026-09-02: *"tags from a multi select list with a search"*).
   * It used to be `activeTag: string | null`, so choosing a second tag replaced the first and
   * there was no way to ask "brunch **and** wine". They compose as AND, which is what makes each
   * count in the list a true statement of what selecting the next one produces.
   */
  readonly activeTags: readonly string[];
  /** Toggle: an active tag comes off, any other goes on. One tap either way. */
  readonly onToggleTag: (tag: string) => void;
}

export const TagFilterContext = createContext<TagFilter | null>(null);

/** The active filter, or `null` when this subtree has no provider — see the header for why that is
 *  a supported state and not a misconfiguration. */
export function useTagFilter(): TagFilter | null {
  return use(TagFilterContext);
}

/**
 * Whether two tag strings are the same tag.
 *
 * `tagKey` rather than `===` because the column is not guaranteed to hold canonical strings: the
 * database's `normalize_tag()` lowercases and trims but does not fold accents or punctuation, so a
 * row written through a path that skipped `canonicaliseTag` can hold `pan-asian` where the
 * application would have written `pan asian`. `tagKey` is this codebase's single answer to "are
 * these the same tag?", and using anything else here would be a second, quietly different one.
 */
export function isSameTag(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

/** Whether this tag is one of the ones currently filtering. `false` for no filter at all. */
export function isTagActive(activeTags: readonly string[], tag: string): boolean {
  return activeTags.some((active) => isSameTag(active, tag));
}

/**
 * One tag chip's worth of fact: a tag the library actually contains, how it is written, and how
 * many of the counted places carry it.
 *
 * `tag` is the **stored** string (lowercase, normalised) because that is what `onToggleTag` takes;
 * `label` is `tagDisplayLabel`'s rendering of it, resolved here so that no surface re-implements
 * casing and so the label a user taps is the label the count is about.
 */
export interface TagFacet {
  readonly tag: string;
  readonly label: string;
  /** Places in the counted set carrying this tag. **Never 0** — see `tagFacets`. */
  readonly count: number;
}

/** The caller's projection onto a place's tags, so this module never learns about `MapPlace` — the
 *  same shape `categoryFacets` takes its `CategoryOf` by. */
export type TagsOf<T> = (place: T) => readonly string[] | null | undefined;

/**
 * How many chips a *chip row* will draw. The category bar can never have more than three; a tag
 * vocabulary is open, and a real library's tail is a long list of tags carried by one place each.
 *
 * **The library's tag control no longer uses this** (owner, 2026-09-02). A cap is what a chip row
 * needs, because its cost is horizontal space it does not have; the filter panel now draws tags as
 * a **searchable, scrolling list**, whose cost is bounded by its own `max-h` however many tags
 * there are. Capping a searchable list would be worse than pointless — it would hide tags the user
 * can no longer reach *by searching for them*, which is the one thing the list exists to allow. So
 * `useLibraryTagFacets` passes its own limit and its own floor, and this default survives for any
 * caller that is still a row.
 *
 * Twelve is a judgement and is stated as one: it is roughly two phone-widths of scrolling, and a
 * chip below it is a filter whose result the user could have reached by reading the list. Active
 * tags are pinned in regardless of where they rank, because a control that disappears when you use
 * it is the defect this file refuses everywhere else.
 */
export const MAX_TAG_FACETS = 12;

/**
 * How many places a tag must cover before it earns a chip.
 *
 * The cap above bounds the row's length and nothing else, so a library whose tail is long enough
 * fills all twelve slots with tags carried by **one place each**. Round 5 measured exactly that:
 * fifteen chips, twelve of them singletons, 372 px — 41% of the phone viewport — of controls
 * standing between the user and the first place. The owner's round-3 feedback photographed the same
 * row (`Bakery`, `Asian`, `Italian`, `Brunch`, `Mediterranean`, `Middle Eastern`, `Desserts`,
 * `Japanese`, `SpecialtyCoffee`) and called it what it is: the list is below the fold.
 *
 * A singleton chip is a filter whose entire result the user can already see. It costs a row of
 * screen to save a glance — which is this file's own argument, one line up, against a chip "whose
 * result the user could have reached by reading the list". The cap was the wrong instrument for it:
 * a length bound cannot tell a useful tag from a unique one.
 *
 * Two is the smallest number that expresses "this groups something". It is deliberately not
 * proportional to library size — a threshold that moves as places are saved makes chips vanish for
 * reasons the user cannot see.
 *
 * The active tag is still pinned in regardless, by the same rule and for the same reason: a control
 * that disappears when you use it is the defect this file already refuses.
 */
export const MIN_TAG_FACET_COUNT = 2;

/**
 * The tags present in `places`, with counts, most-used first.
 *
 * ## Every rendered chip yields at least one place, and that is the whole rule
 *
 * `overnight-copy-deck.md` §9.1 rules it and it is not close: the facet is built from counts over
 * the user's own rows, so a chip can never offer a tag no place carries. A tag with no places is a
 * control that does nothing, which is worse than an absent control — this file's own header makes
 * the same argument one level up ("a control that means something slightly different from what it
 * is is worse than no control").
 *
 * **An empty input therefore produces an empty array, and the caller draws nothing at all** — not a
 * disabled row, not a "no tags yet" line, not a placeholder. That is the rule
 * `profile/page.tsx:159` and `categoryFacets` already follow: a heading over nothing is a promise
 * the data cannot keep. It is also the common case, because nothing was backfilled and every place
 * saved before extraction v2 has no tags at all.
 *
 * ## What it should be counted over
 *
 * The same seam `categoryFacets` documents: the library narrowed by **every other filter and not by
 * the tag itself**, so each count is a true statement of what pressing the chip produces.
 *
 * ## Ordering, and why not alphabetical
 *
 * Count descending, ties broken by the stored key's code-unit order. Deliberately **not**
 * `localeCompare`: tags are free-form and this library mixes Hebrew and Latin, so a locale-aware
 * comparison would order the row differently depending on the runtime's collation data — a
 * genuinely non-deterministic bar, which is the same objection `categoryFacets` records against
 * sorting its own chips by label.
 *
 * Counting is keyed on `tagKey`, so a place carrying `pan asian` and `pan-asian` — which the
 * database's `normalize_tag()` permits, see `isSameTag` — is counted once, and the label rendered
 * is the first spelling encountered rather than an arbitrary one.
 */
export function tagFacets<T>(
  places: readonly T[],
  tagsOf: TagsOf<T>,
  /** The tags currently filtering, if any. Pinned into the result even when the cap would have
   *  dropped them, so a selected tag is always on screen. Never pinned at a count of 0: the tag
   *  filter has its own dismiss control above the list, so a zero-count tag here would be a second
   *  way out that says nothing true. A bare string is accepted for the single-tag callers that
   *  predate multi-select. */
  keepTags: string | readonly string[] | null = null,
  limit: number = MAX_TAG_FACETS,
  /** The floor a tag must clear to earn a chip — see `MIN_TAG_FACET_COUNT`. A parameter rather
   *  than a constant read inline so a caller that genuinely wants every tag (and a test asserting
   *  a property that has nothing to do with the floor) can say `1` out loud instead of shaping its
   *  fixtures around a default. */
  minCount: number = MIN_TAG_FACET_COUNT,
): readonly TagFacet[] {
  const keep: readonly string[] =
    keepTags === null ? [] : typeof keepTags === 'string' ? [keepTags] : keepTags;
  const counts = new Map<string, { tag: string; count: number }>();

  for (const place of places) {
    // One place counts once per tag however many times it carries it.
    const seen = new Set<string>();
    for (const tag of tagsOf(place) ?? []) {
      const key = tagKey(tag);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }

  const ordered = [...counts.entries()]
    // A tag carried by one place is not a grouping — see `MIN_TAG_FACET_COUNT`. The active tag is
    // exempt, because the row must never drop the chip the user is currently filtering by.
    .filter(([, { tag, count }]) => count >= minCount || isTagActive(keep, tag))
    .sort(([keyA, a], [keyB, b]) => b.count - a.count || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([, { tag, count }]): TagFacet => ({ tag, label: tagDisplayLabel(tag), count }));

  if (ordered.length <= limit) return ordered;

  const shown = ordered.slice(0, limit);
  const missing = keep.filter((tag) => !shown.some((facet) => isSameTag(facet.tag, tag)));
  if (missing.length === 0) return shown;

  // An active tag ranked below the cap. They replace the last chips rather than being appended, so
  // the row's length is the one number this function promises.
  const pinned = ordered.filter((facet) => isTagActive(missing, facet.tag));
  return [...shown.slice(0, Math.max(limit - pinned.length, 0)), ...pinned];
}
