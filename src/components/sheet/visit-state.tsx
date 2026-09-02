'use client';

/**
 * How been / not-been looks on a list row: the badge that says a place is done. This file used to
 * hold the `Not been yet` filter chip as well; the nav ruling moved that into
 * `category-filter-bar.tsx`, which is also what lifted it to the 44 px touch floor, so only the
 * badge lives here. The write control lives in `saved-place-edits.tsx` with the other
 * Server-Action writes; `src/ui/place/visit-state.ts` owns every word any of them says.
 *
 * ## The badge is a `<span>`, and that is the whole design of the list row
 *
 * The row's body sits inside one `<button>` whose job is "open this place". A toggle in there would
 * be a nested interactive element inside a 64 px target, which is the same trade that keeps the
 * row's tag chips inert (`place-enrichment.tsx`'s header measures it): at 20 px, every near-miss
 * either marks a place the user meant to open or opens one they meant to mark. So the row *reports*
 * the state and the detail view *changes* it — one tap apart, and the row keeps exactly one
 * meaning. The badge is `aria-hidden` because `rowAccessibleName` already folds the same fact into
 * the row's single accessible name; announcing it twice is worse than not announcing it.
 *
 * ## Why the badge is a tick and a word rather than a strikethrough or a grey row
 *
 * Greying the whole row says "unavailable" — the disabled idiom — about a place that is still
 * perfectly openable, and a strikethrough says "delete". Both are the wrong verb. A small filled
 * tick beside the category line says "done" and leaves the row at full contrast, which matters
 * because a place you have been to is still the thing you look up when a friend asks where to go.
 */

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BEEN_STATE_LABEL } from '@/ui/place/visit-state';

/**
 * "You have been here", on a list row and in a place's detail header.
 *
 * Deliberately not a chip: chips in this product are tags, and a tag is something the library is
 * indexed by. This is a state, so it is a tick and a word at the same weight as the category line
 * it sits beside.
 */
export function BeenBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        // **Quieter than it was, and the word is untouched.** This used to be `bg-tag-selected`
        // with white text — the deep mint the *selected tag chip* wears — at `font-bold` with a
        // 12px tick. On a row whose subject is the place's name at `text-sm`, a saturated filled
        // pill on the muted line underneath was the loudest object in the row: round 3 of the
        // owner's feedback filed it as oversized and overemphasised against the place identity,
        // which is exactly what a state marker must not be.
        //
        // `bg-accent text-brand` is not a new colour: it is the same pair the pressed `Been`
        // toggle wears in the detail (`saved-place-edits.tsx`), so the row and the control that
        // sets it now read as one fact stated twice rather than two different marks. The tick
        // stays — the badge's whole argument is that "done" is carried by shape, never by colour
        // alone — at `size-2.5`, and `font-semibold` puts it a step under the name it sits beside.
        // `voice-and-vocabulary.md` §3 ratifies the word, so `Been` is unchanged.
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-micro font-semibold leading-4 text-brand',
        className,
      )}
    >
      <Check className="size-2.5" />
      {BEEN_STATE_LABEL}
    </span>
  );
}
