/**
 * The words the product uses for "I have been here", and the rules around them. Pure: no React, no
 * DOM, no Supabase — `components/sheet/visit-toggle.tsx` and `components/sheet/library-filters.tsx`
 * decide how these look, this file decides what they say.
 *
 * ## The schema's words are not the product's words
 *
 * The column is `visit_state`, its values are `want_to_go` and `visited`, and none of those three
 * strings may reach a screen (`brand-and-product-foundation.md` §4 rule 2,
 * `product-ruling-after-the-save.md` §6). They are also the wrong words for the thing: `visited`
 * reads as a system fact about a record, and what the user is saying is "been". Every string on
 * screen is produced here so there is one place to check that, and `tests/unit/ui/visit-state.test.ts`
 * asserts it directly rather than trusting a code review to catch a `visited` typed into JSX.
 *
 * ## Why "Been here" and "Been" are two strings and not one
 *
 * The control is a toggle, so the unpressed state has to name an *action* ("Been here" — press
 * this and you will have said you've been) and the pressed state has to name a *state* ("Been" —
 * this is what is true now). One string cannot be both without reading as a command the user has
 * already obeyed. `aria-pressed` carries the same distinction to a screen reader, which is why the
 * accessible name below still names the state in both directions rather than leaning on the
 * pressed bit alone.
 */

/** The control's label while the place is still outstanding: an action. */
export const BEEN_ACTION_LABEL = 'Been here';

/** The label once the mark is set: a state, and the same word the list row shows. */
export const BEEN_STATE_LABEL = 'Been';

/** **The filter's option, which is deliberately not the bare word.** The axis is named `Been` and
 *  one of its answers used to be `Been` too — *"you called the filter BEEN and the options are
 *  all/been/not been / it not intuitive"* (owner, 2026-09-02). `Been there` is the same ratified
 *  word with the subject the row needs, and it can never collide with the group that holds it.
 *  `voice-and-vocabulary.md` §3 records it. */
export const BEEN_FILTER_LABEL = 'Been there';

/** The library filter, as it reads on the chip and in the removable pill. */
export const NOT_BEEN_FILTER_LABEL = 'Not been yet';

/**
 * The toggle's accessible name.
 *
 * It names the place as well as the state because the control has three render sites — the mobile
 * sheet's detail, the desktop map popover, and any surface that renders `PlaceDetail` later — and
 * in the popover it sits next to a list of other places' rows. A screen-reader user who lands on a
 * bare "Been here" has no way to know which place they are about to mark.
 */
export function visitToggleAccessibleName(placeName: string, visited: boolean): string {
  return `${visited ? BEEN_STATE_LABEL : BEEN_ACTION_LABEL}, ${placeName}`;
}

/**
 * What the `role="status"` line says after a mark lands.
 *
 * The write is silent on screen for a keyboard or screen-reader user: the row's badge, the pin's
 * opacity and (with the filter on) the row's disappearance are all visual. So the announcement has
 * to state the *outcome*, not the gesture — "you've been" rather than "button pressed" — and it
 * names the place because with the `Not been yet` filter on, the row it refers to is already gone
 * from the list by the time it is read.
 */
export function visitChangeAnnouncement(placeName: string, visited: boolean): string {
  return visited
    ? `${placeName} marked as been.`
    : `${placeName} moved back to not been yet.`;
}

/** The row badge's accessible fragment, folded into `rowAccessibleName` so the row keeps exactly
 *  one accessible name and the badge itself stays `aria-hidden` decoration. */
export const BEEN_ROW_ANNOTATION = 'already been';

/**
 * **The library filter, as three named states rather than a boolean** —
 * `ux-visit-filter-and-chip-density-2026-09-02.md` §4.
 *
 * The boolean it replaces had two visual states for three meanings: unpressed said nothing about
 * whether been places were included, and "been only" could not be expressed at all. Three states
 * that each carry a word is what makes the control readable without pressing it.
 */
export type VisitFilter = 'all' | 'not-been' | 'been';

/** The neutral state, **as a row inside the menu and nowhere else**.
 *
 *  `All places`, not `All`: the trigger shows the axis name until something is picked, so this
 *  string can only ever be read inside the list where the other two rows give it its subject. The
 *  owner's objection to the alternative is the reason — *"if you will show the value we will have a
 *  filter named all, is this good UX?"* — a control labelled `All` names the absence of itself. */
export const ALL_FILTER_LABEL = 'All places';

/** The three, in the order they are offered. `all` first because it is the resting state. */
export const VISIT_FILTERS: readonly VisitFilter[] = ['all', 'not-been', 'been'];

/** What each state says on its segment. `Been` and `Not been yet` are ratified
 *  (`voice-and-vocabulary.md` §3) and are the same constants the rest of the product uses. */
export const VISIT_FILTER_LABEL: Record<VisitFilter, string> = {
  all: ALL_FILTER_LABEL,
  'not-been': NOT_BEEN_FILTER_LABEL,
  been: BEEN_FILTER_LABEL,
};

/** The radio group's own name — the ratified word, with the three segments as its answers. */
export const VISIT_FILTER_GROUP_LABEL = BEEN_STATE_LABEL;

/** The empty result `been` newly makes reachable. One clause, no apology; the control that undoes
 *  it is above the empty state, which is the rule the sheet already holds itself to. */
export const NO_BEEN_PLACES_LINE = 'No places you have been to yet.';

/** Whether a place is in the filtered set. The one predicate, so the pins and the rows cannot
 *  disagree — `components/map/filter-places.ts` is its only caller today. */
export function matchesVisitFilter(filter: VisitFilter, visited: boolean): boolean {
  if (filter === 'all') return true;
  return filter === 'been' ? visited : !visited;
}
