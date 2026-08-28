'use client';

/**
 * How been / not-been looks: the badge that says a place is done, and the chip that narrows the
 * library to the ones that are not. The write control lives in `saved-place-edits.tsx` with the
 * other Server-Action writes; `src/ui/place/visit-state.ts` owns every word either of them says.
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
 *
 * ## The filter chip is one control that is also its own dismissal
 *
 * `ActiveTagFilter` is a pill you press to clear a filter you set somewhere else (on a tag chip
 * inside a place's detail). The visit filter has no "somewhere else" — there is no per-place
 * surface that could set it — so it needs a control that is present in the list, and a second
 * control just to remove it would be two targets for one boolean. It is therefore one chip using
 * the shared pressable-chip tokens: unpressed it reads as an offer, pressed it takes the active
 * pill's fill and grows an `×`, which is the same shape and the same affordance the tag pill has.
 * `aria-pressed` carries the state; the `×` is `aria-hidden` decoration on top of it.
 */

import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BEEN_STATE_LABEL, NOT_BEEN_FILTER_LABEL } from '@/ui/place/visit-state';
import {
  CHIP_PRESSABLE,
  CHIP_PRESSABLE_ACTIVE,
  CHIP_PRESSABLE_REST,
  FILTER_KICKER,
} from './place-enrichment';

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
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--tag-selected)] px-1.5 py-0.5 text-[11px] font-bold leading-4 text-[var(--tag-selected-foreground)]',
        className,
      )}
    >
      <Check className="size-3" />
      {BEEN_STATE_LABEL}
    </span>
  );
}

/**
 * The one library filter this capability adds: show only what is still outstanding.
 *
 * Rendered under the search field on both surfaces, so it is in the same block as the search box
 * and the active-tag pill — the three narrowings sit together rather than one of them hiding
 * inside a place's detail. Hidden entirely while the library is empty, for the same reason the
 * search field is: an inert control offering work that cannot produce a result is a false
 * affordance.
 *
 * `min-h-9` (36 px) matches `ActiveTagFilter`'s pill exactly. It is under the 44 px touch floor and
 * that is the same trade the tag pill already makes and states: these sit in a header block with no
 * competing target within 12 px, they are 110–140 px wide, and a 44 px slab under the search field
 * would out-shout the field itself. Named as a trade rather than a rule met.
 */
export function NotBeenFilterChip({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <div data-vaul-no-drag className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className={FILTER_KICKER}>Showing</span>
      <button
        type="button"
        // The state model, exactly as the tag chips: a toggle says pressed / not pressed, and
        // pressing the pressed one clears. No live region and no second control needed for either.
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          CHIP_PRESSABLE,
          'min-h-9 gap-1.5',
          active ? CHIP_PRESSABLE_ACTIVE : CHIP_PRESSABLE_REST,
        )}
      >
        <span className="truncate">{NOT_BEEN_FILTER_LABEL}</span>
        {active && <X className="size-3.5 shrink-0" aria-hidden />}
      </button>
    </div>
  );
}
