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
import { tagKey } from '@/domain/extraction/tags';

/** What a chip needs to know to be a control. `null` where there is no filter to drive. */
export interface TagFilter {
  /** The tag currently narrowing the library, as stored (lowercase, normalised). */
  readonly activeTag: string | null;
  /** Toggle: the active tag turns the filter off, any other tag replaces it. One tap either way. */
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

/** Whether this tag is the one currently filtering. `false` for no filter at all. */
export function isTagActive(activeTag: string | null, tag: string): boolean {
  return activeTag !== null && isSameTag(activeTag, tag);
}
