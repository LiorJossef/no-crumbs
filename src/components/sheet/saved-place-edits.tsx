'use client';

/**
 * The edits a user can make to a place they already saved — `L1-F7-T2` for the note and the delete,
 * the category since 2026-08-28, and the been / not-been mark (`L1-F12-T1`). All of them live here
 * rather than inside `PlaceDetail` because `place-sheet.tsx` is already 900 lines, and because they
 * share one idiom: a `useTransition` around a Server Action, an inline error, and no optimistic
 * update.
 *
 * ## One component pair, two surfaces
 *
 * `PlaceDetail` has exactly two render sites — the mobile vaul sheet and the desktop map popover
 * (`map-surface.mapcn.tsx`). Putting these inside it means delete and note-editing arrive on both
 * at once, rather than a mobile affordance and a desktop one drifting apart.
 *
 * ## Why the confirmation is inline and not a dialog
 *
 * Deleting is irreversible and destructive, so it needs a confirm step. It does **not** get a modal.
 * On mobile the detail already lives inside a vaul drag sheet, and a dialog stacked on a drag sheet
 * fights the gesture layer and the focus trap (`useNonModalBackground` exists precisely because
 * that layering is already delicate — see `place-sheet.tsx`). On desktop it lives inside a
 * pin-anchored popover on the map, where a centred modal would tear the user away from the thing
 * they are deleting. A two-step inline confirmation is smaller, works identically in both, and
 * keeps the place's name on screen while you decide.
 *
 * ## Why nothing here is optimistic
 *
 * A delete that removes the pin before the row is gone, and then has to put it back, is worse than
 * a delete that takes 200ms. The same goes for a note. Both actions call `revalidatePath('/map')`
 * on success, so the server data is what updates the list and the pins — this file never edits a
 * local copy of the library, which means the screen can never disagree with the database about what
 * is saved.
 *
 * ## Every write goes through `attemptWrite`, and none of them `await`s an action directly
 *
 * Until 2026-09-01 all five did, bare, inside `startTransition`. A Server Action is a `fetch`, so
 * an offline press produced a rejection rather than a result; React escalated it to
 * `app/error.tsx`, and the whole segment went with it — map, seven pins, the open place, and on the
 * note path the sentence the user had just typed. Measured offline at both breakpoints
 * (`docs/product-review-2026-09-01-r5.md` §2 finding 1). Every action here already returned a
 * `Result`; a `Result` simply cannot express *the server never answered*.
 *
 * `ui/place/write-failure.ts` holds that rule and the reasoning. What each control does with it is
 * below and differs per control, because the two failures are not the same news:
 *
 *  - **`refused`** — the server said no. That is settled, so a control may act on it: the delete
 *    confirmation collapses, because there is nothing left to confirm.
 *  - **`unreachable`** — nothing was sent or nothing came back, so nothing was written and the
 *    user's intent is untouched. Every control here keeps its exact state: the note and name
 *    editors stay open with the draft in the field, the category panel stays open on the choice
 *    that was pressed, and the delete confirmation stays confirming, so one more press is the retry.
 *    Tidying up after silence is what would turn a two-second signal drop into lost work.
 */

import { useEffect, useId, useRef, useState, useTransition, type RefObject } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlinePanel, MENU_ROW, MENU_ROW_PAINT } from '@/components/ui/inline-menu';
import { useDetailPanelOpen } from '@/ui/place/detail-panel-open';
import {
  deleteSavedPlace,
  setSavedPlaceVisited,
  updateSavedPlaceCategory,
  updateSavedPlaceNote,
} from '@/app/actions/saved-places';
import { useAnnouncer } from '@/ui/place/announce';
import {
  BEEN_ACTION_LABEL,
  BEEN_STATE_LABEL,
  visitChangeAnnouncement,
  visitToggleAccessibleName,
} from '@/ui/place/visit-state';
import { NOTE_MAX_LENGTH, isNoteUnchanged, validateNote } from '@/domain/places/note';
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_CATEGORY_ORDER,
  type ProductCategory,
} from '@/domain/places/product-category';
import { SECTION_LABEL } from '@/ui/place/section-label';
import { attemptWrite } from '@/ui/place/write-failure';
import { cn } from '@/lib/utils';
import { PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';
import { TRIGGER_PAINT, TRIGGER_TARGET } from '@/components/sheet/library-filter-bar';

/** Shown once the note gets close enough to the limit that the number is useful rather than noise. */
const COUNTER_VISIBLE_FROM = NOTE_MAX_LENGTH - 200;

/**
 * **The field row — one shape for everything that edits one field of your record of a place.**
 *
 * `Add to a collection`, `Category`, `Your note` and the collection's `Shared note` were four
 * different components until 2026-09-02: a boxed full-width row, an inline mint `Change` link, a
 * dashed `+ Add a note` pill and a bordered panel. Four shapes for one job, on one card, is the
 * whole of the owner's "inconsistent action components" complaint
 * (`docs/ux-place-card-unification-2026-09-02.md` §4.2, which is the ruling this implements).
 *
 * The row is **label, value, glyph**: `SECTION_LABEL` at 11 px where the value needs naming, the
 * value at 14 px, and one 12 px trailing chevron. **Every row opens the same way** — the row stays
 * exactly where it is, the chevron rotates, and what it needs appears in an `InlinePanel` directly
 * underneath (`DisclosureChevron`). Empty is the *same row* with a muted value (`Not set`,
 * `Add a note`), never a different component, so filling a field never swaps the thing you pressed.
 *
 * `min-h-12` is 48 px, above the 44 px touch floor, because these rows stack flush against each
 * other and a run of them has to read as a list. **No border, no fill, no radius at rest** — the
 * radius and the tint arrive on hover and focus only. That is what lets four of them sit together
 * without the card turning into a form.
 *
 * This deliberately replaces `ADD_NOTE_PILL`, deleted here. That constant existed so the private
 * note and the shared note would look like one object — a real goal it solved by inventing an
 * eighth shape. This solves it, and the category row, and the collection row, with one.
 */
export const DETAIL_FIELD_ROW =
  'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-start outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50';

/** The same row with its editor open: same inset, same minimum height, still no border and no
 *  fill. An open field must not become a panel — that is how the shared note ended up looking like
 *  a different object from the private one. */
export const DETAIL_FIELD_OPEN = 'flex min-h-12 w-full flex-col justify-center gap-1 px-1 py-1.5';

/** The value line inside a field row. Muted when it is an offer, foreground when it is a value. */
export const DETAIL_FIELD_VALUE = 'text-sm leading-snug';

/**
 * **The one trailing glyph a field row draws, and the one thing it promises**: a panel opens
 * directly underneath this row, and the row stays exactly where it is.
 *
 * It replaces two glyphs that each promised something that stopped being true. The pencil said
 * *type here* on a row that offers a list of choices, and the collections row's `ChevronRight`
 * said *this replaces the pane* — which, since the picker opens in place, nothing on this card
 * does any more. Three rows that open the same way now say so with the same mark.
 *
 * Copied from the share panel's value trigger (`share-panel.tsx` l. 519–530), including the rule
 * that matters: the rotation is driven by state, not by a `data-` attribute, so under
 * `prefers-reduced-motion` the transition drops and the glyph still **ends rotated**. Losing the
 * transition must never lose the state.
 */
export function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        'size-3 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-cross',
        open && 'rotate-180',
      )}
    />
  );
}

/**
 * Focus goes back to the row that opened the panel, never to `<body>`.
 *
 * `requestAnimationFrame` because the panel is unmounted in the same commit: focusing the row
 * before React has removed the node it currently sits in is how focus lands on the document.
 * `preventScroll` because the card is a scrolling column inside a drag sheet, and a focus-driven
 * scroll there moves the whole card under the user's thumb.
 */
function returnFocus(ref: RefObject<HTMLButtonElement | null>) {
  requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
}

/**
 * **The card's one act, and it stopped being a bespoke pill on 2026-09-03** — `Been here`.
 *
 * It keeps everything that made it the primary: it is first in the band, it is the only bordered
 * control on the card, and it is the one thing the product wants a returning user to come back and
 * do. What it gave up is a shape that existed nowhere else. `DETAIL_ACTION_PILL` was `min-h-11
 * rounded-full border px-4 text-sm font-bold` — 44 px of paint, bold, at body size — where the
 * product's own pill is `TRIGGER_TARGET` + `TRIGGER_PAINT`: 32 px of paint inside a 44 px target,
 * a hairline border, `text-xs font-medium`. Two objects wearing one silhouette, and this was the
 * one nothing else in the product wore. A bordered bold slab on a card where nothing else is
 * bordered is a generic outline button, which is the register Charter §6 bans.
 *
 * **On is `bg-accent text-brand`, which is exactly what `BeenBadge` already wears**
 * (`visit-state.tsx` l. 45–58, adopted for this precise reason). The control that sets the state
 * and the badge that reports it are now one object at two sizes.
 *
 * Still not mint and still not filled when off: the promotion is by subtraction. Mint means
 * *create* on the `＋` and *this is narrowing your library* on a pressed filter chip, and a third
 * meaning would undo `ux-collection-actions-2026-09-03.md` §4.
 */

/**
 * **A control that leaves the product, one step quieter than the primary** — `Open on TikTok` and
 * `Open in Google Maps` in `place-sheet.tsx`.
 *
 * The owner rejected dissolving these two into the address line and the creator credit (spec §R2,
 * overridden 2026-09-03): *"if the creator name is clickable, it's not clear that it opens the
 * original TikTok, and if the address is clickable, it's not clear that it opens Google Maps."* So
 * they stay explicit and stay labelled, and the hierarchy comes from weight instead — no border,
 * no fill, `font-medium` rather than `font-bold`, against a bordered bold pill.
 *
 * It is not a new shape: this is the class string band 2's other-sources rows already use, minus
 * their `w-full`. That row is a platform mark, a label and a trailing arrow, which is exactly what
 * these two are. `min-h-11` because the paint got quieter and the target did not.
 */
export const DETAIL_OUT_LINK =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-brand outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * "I've been here" — the one control that lets the library resolve rather than only grow.
 *
 * ## Why it is a toggle and not a checkbox, a menu item or a two-step confirm
 *
 * Marking is cheap to undo and costs nothing when wrong: the place stays on the map, keeps its
 * note, keeps its pin, and one more tap puts it back. A confirmation step for an action with no
 * consequence is ceremony, which is why `RemoveSavedPlace` below has two steps and this has one.
 * `aria-pressed` rather than a checkbox because the control's own label changes with its state —
 * `Been here` is an offer, `Been` is a fact — and that is a button's idiom, not an input's.
 *
 * ## Why it sits first among the three controls
 *
 * Category and note are things you set once, near the save. This is the thing you come *back* to a
 * saved place to do, weeks later, and it is the only control on this screen the product is asking
 * you to use repeatedly. It is still inside the same controls block as the note rather than up
 * beside the place's name: the header block is identity (name, category, tags) and a control that
 * changes state does not belong in it.
 *
 * ## Not optimistic, and no camera move
 *
 * Same rule as every other write here: `revalidatePath('/map')` is what updates the row's badge and
 * the pin's opacity, so the screen can never disagree with the database about where you have been.
 * Nothing in this component touches `focusPlaceIds` or any other camera mover — marking is a state
 * change, not a navigation, and the map must not fly anywhere because you said you had been
 * somewhere.
 *
 * The announcement goes through the page's single `role="status"` line
 * (`src/ui/place/announce.ts`), because for a keyboard or screen-reader user the *effect* of this
 * press is entirely visual: a badge appears, a pin fades, and with `Not been yet` on the row it
 * refers to leaves the list. The ticket is taken before the request, so two quick presses can never
 * leave the older sentence on screen.
 */
export function BeenToggle({
  savedPlaceId,
  placeName,
  visited,
}: {
  savedPlaceId: string;
  placeName: string;
  visited: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const announcer = useAnnouncer();

  function toggle() {
    // Re-entry guard rather than `disabled`, and the difference is a real accessibility bug rather
    // than a style choice. Measured 2026-08-28 at 1440x900: `disabled={pending}` removed the
    // button from the focus order the instant it was activated, so a keyboard user pressing Space
    // was dropped onto `<body>` and lost their place in a scrolling detail view. `aria-busy` says
    // the same thing to assistive technology without taking focus away, and this guard gives the
    // same protection against a second write landing on a stale `visited`.
    if (pending) return;
    const next = !visited;
    // Claimed now, not when the request resolves — see `announce.ts` for why the order has to be
    // the order of the gestures rather than of the responses.
    const ticket = announcer?.begin() ?? 0;
    setError(null);
    startTransition(async () => {
      // Nothing to revert on a failure, because nothing moved: `visited` is a prop and the badge
      // only changes when the revalidated row arrives. An unreachable press therefore leaves the
      // control exactly as the user found it, saying why, with one press left to retry.
      const outcome = await attemptWrite(() => setSavedPlaceVisited(savedPlaceId, next));
      if (outcome.kind === 'ok') {
        announcer?.say(ticket, visitChangeAnnouncement(placeName, next));
        return;
      }
      // Deliberately no announcement on failure: the ticket is spent, and the `role="alert"` below
      // is already read. Announcing "marked as been" for a write that did not happen would be the
      // one thing worse than silence.
      setError(outcome.message);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        aria-pressed={visited}
        // The place is named as well as the state: this control has three render sites, and in the
        // desktop map popover it sits a few nodes away from a list of other places' rows.
        aria-label={visitToggleAccessibleName(placeName, visited)}
        aria-busy={pending || undefined}
        onClick={toggle}
        // `data-vaul-no-drag`: inside the mobile sheet a press that begins here would otherwise be
        // read as the start of a sheet drag and the tap would be swallowed.
        data-vaul-no-drag
        className={cn(
          // The matrix's press column, which this control did not have. It is the one action in
          // the detail view whose result is a colour change *on itself*, so without a press the
          // only confirmation a tap landed was the same thing that confirms the write succeeded —
          // and the two are ~200ms apart. `PRESS_CHIP` rather than `PRESS_BUTTON` now that the
          // paint is a 32 px pill: the press scale belongs to the size of the thing pressed, and
          // it is the same one every other trigger wearing this pill takes.
          //
          // **The words did not change.** `voice-and-vocabulary.md` §3 ratifies `Been here` /
          // `Been`; the size and the weight changed and the string did not, because the complaint
          // was never the wording.
          TRIGGER_TARGET,
          PRESS_CHIP,
          pending && 'opacity-50',
        )}
      >
        <span
          className={cn(
            TRIGGER_PAINT,
            // **36 px of paint rather than the shared 32, and this is the one hand-tuned number
            // here.** Measured at 390×844 in both themes: at `h-8` the OFF pill reads, but the ON
            // state — `bg-accent` is a 2 % wash and the border goes transparent — came out paler
            // and smaller than the two `text-sm` mint links beside it, so the card's one act was
            // the quietest thing in its own band. One step of the graded retreat the spec
            // pre-authorises (`h-8` → `h-9` → `h-10`); stopped at the first that reads. The border
            // does not come back and no fill is added.
            'h-9',
            // `BeenBadge`'s own paint. The hover pair is restated because the resting pill's
            // — a warmed border and a 5 % mint wash — is invisible on a filled ground, and
            // `cn` keeps the later of two rules for one property.
            visited &&
              'border-transparent bg-accent text-brand group-hover/trigger:border-transparent group-hover/trigger:bg-accent',
          )}
        >
          <Check className="size-3.5 shrink-0" aria-hidden />
          {visited ? BEEN_STATE_LABEL : BEEN_ACTION_LABEL}
        </span>
      </button>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The user's own note: read, edit, clear. The only user-writable text on a saved place — `0015`
 * keeps `extracted_reason` system-derived, and the UPDATE column grant is what enforces that, not
 * this component's restraint.
 *
 * `key`ing this component on the saved place's id at the call site is what resets the draft when
 * the user selects a different place; it deliberately does not sync `draft` from props in an
 * effect, which would throw away half-typed text whenever the server revalidated.
 */

/**
 * The user's own word for what this place is.
 *
 * ## Why this exists at all
 *
 * `saved_places.category_override` has been in the schema since `0019` and `productCategoryFor`
 * has ranked it above both the provider's registration and the model's guess since the day that
 * function shipped — and **nothing ever wrote it**. The reconciliation was reading a column that
 * could not be filled. This is the missing half, and it is additive: no schema change, no new
 * authority, no new rendering path.
 *
 * It earns its place because the two claims underneath it are both wrong sometimes and in opposite
 * ways. The model reads a caption *about* a place and files a gelateria as a `shop`. The provider
 * files a real café as a `restaurant`, which is Google's taxonomy rather than a disagreement about
 * the venue. The person who saved it has been there.
 *
 * ## A value trigger, and it commits on choose
 *
 * The row shows the current value and opens a panel of choices under itself — the same trigger and
 * the same menu material the share panel and the library's filter bar already use. Three choices,
 * four with `Automatic`, down from eight with the 2026-08-29 taxonomy: the whole vocabulary at
 * once rather than a select, because the set is closed and short and a native select on a drag
 * sheet fights the gesture layer the same way a dialog does (`place-sheet.tsx`'s
 * `useNonModalBackground`).
 *
 * **What went, on 2026-09-03: the grey filled chips and the 11 px mint `Done`.** Grey fill existed
 * nowhere else on this card, and `Done` was the card's third answer to "how do I commit here" —
 * at the smallest type on the surface, in the colour that already means *create*, and in the word
 * the library header uses to leave multi-select. A choice commits itself, so there was nothing
 * left for it to close.
 *
 * ## "Automatic" is an option, not an absence
 *
 * When the user has overridden the category, the row offers `Automatic` alongside the three. It
 * writes SQL `NULL`, which is a different statement from every chip on the row: it means *stop, use
 * whatever you work out*, so a better provider category tomorrow still reaches this place. Freezing
 * today's derivation into the column would opt the place out of every future improvement, silently.
 *
 * It used to be distinguishable from picking `Place`, the old eighth value. There is no `Place`
 * any more — a place we cannot categorise simply has none — so `Automatic` is now the only way to
 * say "I have no opinion", which is what it always meant.
 *
 * Not optimistic, for the same reason nothing else here is: `revalidatePath('/map')` is what
 * updates the pin colour, the pin glyph and the line under the name, so the screen can never
 * disagree with the database about what a place is.
 */
export function CategoryEditor({
  savedPlaceId,
  category,
  isOverridden,
}: {
  savedPlaceId: string;
  /** The place's current category, `null` where nothing resolved one. A null is a legitimate
   *  resting state, not an error: the row simply shows no row ticked. */
  category: ProductCategory | null;
  /** Whether `category` came from this user's override rather than the provider or the model.
   *  Decides only whether `Automatic` is offered — there is nothing to undo otherwise. */
  isOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const raiseSheet = useDetailPanelOpen();

  function choose(next: ProductCategory | null) {
    setError(null);
    startTransition(async () => {
      const outcome = await attemptWrite(() => updateSavedPlaceCategory(savedPlaceId, next));
      if (outcome.kind === 'ok') {
        // **Choosing is the commit, so choosing is also the close** — the ruling the library's
        // filter bar already runs on (`library-filter-bar.tsx` l. 665, owner 2026-09-02). Focus
        // goes back to the row, which now shows the value that was chosen.
        setOpen(false);
        returnFocus(triggerRef);
        return;
      }
      // The panel stays open on either failure. Closing it would hide the choices behind a second
      // press at the exact moment the user wants to press one again, and on an unreachable write it
      // would imply something settled when nothing was written.
      setError(outcome.message);
    });
  }

  // The value line. It stays on the row while the panel is open: the row is the trigger and the
  // panel is what it opened, so nothing about the row changes shape.
  //
  // **` · from the TikTok video` / ` · from the map listing` is gone** (2026-09-03, spec §R5). It
  // was the *fourth* statement on one card that this place came from a video — after the still,
  // the creator credit and the TikTok control — and the card's complaint was repetition, not a
  // missing provenance. What the sentence protected survives elsewhere: the pin's provenance is
  // still on the record line at the bottom, and the category is still a claim the user can
  // overrule by pressing this row.
  const value =
    // A place with no category says so in words rather than showing a blank line where a value
    // should be — the control is the answer to "what is this?", and silence there reads as a
    // rendering fault rather than as an honest "we could not tell".
    category === null ? (
      <span className="text-muted-foreground">Not set</span>
    ) : (
      PRODUCT_CATEGORY_LABEL[category]
    );

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setError(null);
    // Before the panel, not after: at `peek` or `half` the column is too short to divide between
    // a card and a menu, so the sheet is raised first. `undefined` on every host that does not
    // provide the channel — the desktop popover, the panel, `/collections/[id]`.
    raiseSheet?.();
    setOpen(true);
  }

  /** One row of the panel. `role="radio"` inside a `radiogroup`, so a screen reader says "2 of 4"
   *  rather than announcing four unrelated controls. The paint is the house menu row — no fill
   *  anywhere, the tick in the indicator column, which is what every other menu in the product
   *  already looks like. */
  function choiceRow(key: string, label: string, active: boolean, next: ProductCategory | null) {
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={active}
        disabled={pending}
        data-vaul-no-drag
        onClick={() => {
          choose(next);
        }}
        className={cn(MENU_ROW, PRESS_ROW, 'w-full disabled:opacity-50')}
      >
        <span className={cn(MENU_ROW_PAINT, 'text-sm')}>
          {/* `invisible`, not absent: the column exists in every row, so all four labels sit at
              one inline offset. */}
          <Check
            aria-hidden
            className={cn('size-3.5 shrink-0 text-brand', !active && 'invisible')}
          />
          {label}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        ref={triggerRef}
        type="button"
        data-vaul-no-drag
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          // Opening by pointer leaves focus on the trigger, so a handler only on the panel never
          // fires — the defect `library-filter-bar.tsx` measured on its own inline triggers.
          if (event.key !== 'Escape' || !open) return;
          event.stopPropagation();
          setOpen(false);
        }}
        className={cn(DETAIL_FIELD_ROW, PRESS_ROW)}
      >
        {/* **One line, label leading** (spec §A2, 2026-09-03). Stacking an 11 px label over a
            14 px value, three rows running, is the grammar of a settings form, and the owner's
            complaint about the card was exactly that it read like work. The label survives here
            and nowhere else on the card: a bare `Café` row would be a word with no claim
            attached, where `In tel aviv food` and a note say what they are by themselves. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className={cn(SECTION_LABEL, 'shrink-0')}>Category</span>
          <span className={cn(DETAIL_FIELD_VALUE, 'min-w-0 flex-1 text-foreground')}>{value}</span>
        </span>
        <DisclosureChevron open={open} />
      </button>

      {open && (
        <InlinePanel
          id={panelId}
          axisClear={null}
          triggerRef={triggerRef}
          onEscape={() => {
            setOpen(false);
            returnFocus(triggerRef);
          }}
          // No focus move: the press has already landed on whatever the user meant to touch.
          onOutsidePress={() => setOpen(false)}
        >
          <div role="radiogroup" aria-label="Category" className="flex flex-col">
            {PRODUCT_CATEGORY_ORDER.map((choice) =>
              choiceRow(
                choice,
                PRODUCT_CATEGORY_LABEL[choice],
                choice === category && isOverridden,
                choice,
              ),
            )}
            {isOverridden &&
              // "Automatic" writes SQL NULL: *stop, use whatever you work out*, so a better
              // provider category tomorrow still reaches this place. A row with an empty
              // indicator, not an underlined word floating after the choices — it is one of the
              // four things this control can be set to, and it is spelled like the other three.
              choiceRow('automatic', 'Automatic', false, null)}
          </div>
          {error && (
            <p role="alert" className="px-2 pb-1 pt-1.5 text-micro font-medium text-destructive">
              {error}
            </p>
          )}
        </InlinePanel>
      )}
    </div>
  );
}

/**
 * **The rename control is gone from the UI, and `saved_places.display_name` is not.**
 *
 * `RenameTrigger` (a pencil beside the name) and `NameEditor` (the inline field it opened) lived
 * here until 2026-09-02. The owner's round-3 feedback removed them from the card: a control that
 * one person in a hundred touches was permanent chrome next to the biggest word on the screen, on
 * the surface whose whole complaint was that the things people *do* use had been pushed below the
 * fold.
 *
 * **This is a UI removal, not a data change.** The column, `updateSavedPlaceName` in
 * `app/actions/saved-places.ts`, `domain/places/display-name.ts` and `0018`'s column grant all
 * stay exactly as they are, so every renamed row keeps its name, `detail.displayNameOverride`
 * still reaches the card, and putting the control back is a component rather than a migration.
 *
 * One thing the pencil was carrying that the card still needs: it was the *fixed chrome* the RTL
 * audit measured `<bdi>` against on the name heading (`docs/rtl-audit-2026-08-31.md` findings 2
 * and 4). The heading keeps its `<bdi>` and its comment — the close × is chrome beside the same
 * name, and a Hebrew name with no isolation would still drag the identity block's alignment.
 */

export function NoteEditor({
  savedPlaceId,
  note,
}: {
  savedPlaceId: string;
  note: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const raiseSheet = useDetailPanelOpen();

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft(note ?? '');
    setError(null);
    // The sheet goes to `full` before the panel takes room in the column — the same channel the
    // other two rows use, and the reason the record line and the removal stay reachable.
    raiseSheet?.();
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setError(null);
    returnFocus(triggerRef);
  }

  const validation = validateNote(draft);
  const unchanged = isNoteUnchanged(draft, note);
  const tooLong = !validation.ok;

  function save() {
    setError(null);
    startTransition(async () => {
      // The one control on this screen where a failure could destroy something the user made. Two
      // things keep the note: `attemptWrite` never throws, so the editor is not torn down with the
      // segment, and `setEditing(false)` happens **only** on `ok`, so the `<textarea>` stays
      // mounted with `draft` untouched. `keepsDraft` then says so on screen, because a person who
      // has just watched a save fail has no reason to believe their words survived it.
      const outcome = await attemptWrite(() => updateSavedPlaceNote(savedPlaceId, draft), {
        keepsDraft: true,
      });
      if (outcome.kind === 'ok') {
        setEditing(false);
        returnFocus(triggerRef);
        return;
      }
      setError(outcome.message);
    });
  }

  // **Empty and filled are the same row, and open and closed are the same row too.** The empty
  // state used to be a dashed `+ Add a note` pill and the filled one a label with a mint `Edit`
  // link; both were replaced by this one row in 2026-09-02, and on 2026-09-03 the *open* state
  // stopped replacing it as well. The row stays, its chevron rotates, and the editor appears in
  // the panel underneath — which is exactly what the two rows above it do.
  // `whitespace-pre-wrap` because `validateNote` preserves the newlines the user typed, and
  // rendering the note collapsed would lose the shape they gave it.
  return (
    <div className="flex flex-col">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (editing ? close() : open())}
        data-vaul-no-drag
        aria-haspopup="dialog"
        aria-expanded={editing}
        aria-controls={editing ? panelId : undefined}
        className={cn(DETAIL_FIELD_ROW, PRESS_ROW)}
      >
        {/* **The label goes when the row is an offer** (spec §A2). `Your note` over `Add a
            note` said the same thing twice, and the empty state is the one every place starts
            in — so the commonest shape of this row was two lines to carry one. Once there is a
            note the label comes back, inline: it is what tells your own words apart from the
            note a collection shares with everyone.

            The value is clamped rather than fully drawn: pressing the row opens the editor with
            the whole note in it, and an unbounded prose block in a resting row is what pushed
            the controls below the fold in round 3. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          {note && <span className={cn(SECTION_LABEL, 'shrink-0')}>Your note</span>}
          {/* `dir="auto"`: a note is free-form prose and Tel Aviv is a target city, so it is
              routinely Hebrew (rtl audit, `docs/rtl-audit-2026-08-31.md` finding 1). */}
          <span
            dir="auto"
            className={cn(
              DETAIL_FIELD_VALUE,
              'min-w-0 flex-1',
              note ? 'line-clamp-2 whitespace-pre-wrap text-foreground' : 'text-muted-foreground',
            )}
          >
            {note ?? 'Add a note'}
          </span>
        </span>
        <DisclosureChevron open={editing} />
      </button>

      {editing && (
        <InlinePanel
          id={panelId}
          axisClear={null}
          triggerRef={triggerRef}
          onEscape={close}
          // A press elsewhere does **not** discard a draft. The note is the one thing on this card
          // the user made themselves, and dismissing it the way a menu is dismissed would lose it
          // to a mistimed tap; the panel stays and `Cancel` remains the way out.
          onOutsidePress={() => {}}
        >
          {/* The panel is the surface, so the field draws nothing: no border, no fill, no radius
              and no ring of its own. A bordered box inside a bordered panel was the only box on a
              card that otherwise draws none — the "patch" the owner named. Focus is carried by the
              caret and by the panel the field sits in. */}
          <div className="flex flex-col gap-2 px-2 py-1.5">
            <label htmlFor={`note-${savedPlaceId}`} className={cn(SECTION_LABEL, 'sr-only')}>
              Your note
            </label>
            <textarea
              id={`note-${savedPlaceId}`}
              ref={textareaRef}
              dir="auto"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Escape cancels. Enter does NOT submit — this is a multi-line prose field, and
                // stealing Enter would make a second paragraph impossible to type.
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  close();
                }
              }}
              // Three lines, not four: one line of `text-base leading-relaxed` back to the column,
              // on the surface whose height budget is the reason the removal used to sit under the
              // bottom bar.
              rows={3}
              disabled={pending}
              aria-invalid={tooLong || undefined}
              aria-describedby={error ? `note-error-${savedPlaceId}` : undefined}
              placeholder="Why did you save this?"
              className={cn(
                // `text-base` is the iOS zoom floor and is not negotiable on the phone; `md:text-sm`
                // is the desktop step. `resize-none`, because the panel caps its own height against
                // `--sheet-content-height` and a hand-dragged field would fight that cap.
                'w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm',
                tooLong && 'text-destructive',
              )}
            />

            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  'text-xs font-medium text-muted-foreground',
                  // Hidden rather than absent until it matters: a live counter on an empty field is
                  // noise, and a limit nobody is near is not information.
                  draft.trim().length < COUNTER_VISIBLE_FROM && 'invisible',
                  tooLong && 'text-destructive',
                )}
                aria-hidden={draft.trim().length < COUNTER_VISIBLE_FROM}
              >
                {draft.trim().length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  data-vaul-no-drag
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || tooLong || unchanged}
                  data-vaul-no-drag
                  onClick={save}
                >
                  {pending ? 'Saving…' : 'Save note'}
                </Button>
              </div>
            </div>

            {error && (
              <p
                id={`note-error-${savedPlaceId}`}
                role="alert"
                className="text-micro font-medium text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </InlinePanel>
      )}
    </div>
  );
}

/**
 * Removing a saved place. Two steps, deliberately: the first click only reveals the second.
 *
 * The copy says "Remove from your places", not "Delete place" — because that is what actually
 * happens. `places` is shared across users (charter invariant 4) and is never touched; only this
 * user's `saved_places` row and its provenance links go. Telling a user they are deleting a place
 * when they are deleting their own bookmark of it would be the UI describing the wrong operation.
 *
 * `onRemoved` deselects. The map page also self-corrects — its render-time guard drops a `selected`
 * place that is no longer in the list once the revalidated data arrives — but waiting for that
 * would leave the detail open over a place that is gone for as long as the round trip takes.
 */
export function RemoveSavedPlace({
  savedPlaceId,
  placeName,
  onRemoved,
}: {
  savedPlaceId: string;
  placeName: string;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const outcome = await attemptWrite(() => deleteSavedPlace(savedPlaceId));
      if (outcome.kind === 'ok') {
        onRemoved();
        return;
      }
      // The one place the two failures diverge. A **refusal** is settled news — the row is gone,
      // or the caller is signed out — and there is nothing left to confirm, so the confirmation
      // collapses and the message appears under the trigger. **Silence** settles nothing: the
      // place is still there, still the one they meant to remove, so the confirmation stays open
      // and `Remove` is one press away. Collapsing it would make a signal drop cost the user the
      // whole two-step gesture again.
      if (outcome.kind === 'refused') setConfirming(false);
      setError(outcome.message);
    });
  }

  if (!confirming) {
    // No rule of its own: band 3 already carries the only hairline above it, and a third divider
    // on a card the spec gives exactly two is the "floating fragment" again. 12 px under the
    // record lines is the band's own group-to-group step.
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          /* **The glyph is gone and the air is the demotion** (spec §A6). A trash icon was the
             only icon in this band, so the eye landed on the irreversible action before it landed
             on anything the user came for; `font-bold` on top of that made the loudest thing at
             the foot of the card the one that destroys a row. `font-medium`, no glyph, and the
             space above it does the separating instead — no divider, because a rule here would
             make the removal look like a section of the card rather than its exit. */
          className="mt-5 flex items-center self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Remove from your places
        </button>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The name stays on screen while you decide — the whole reason this is inline rather than a
          modal that would cover the thing being removed. */}
      <p className="text-sm leading-relaxed text-foreground">
        Remove <span className="font-bold">{placeName}</span> from your places? Your note goes with
        it.
      </p>
      {/* Focus lands on Cancel, not on Remove. The confirm step exists to make the product's one
          irreversible action deliberate, and autofocusing the destructive button undoes exactly
          that: a keyboard user who presses Space or Enter out of habit has deleted a place, and a
          screen-reader user is told "Remove" before they are told what is being removed.
          The sentence above is read first either way, because focus moving into this block
          announces the group. */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={remove}
        >
          {pending ? 'Removing…' : 'Remove'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
          autoFocus
        >
          Cancel
        </Button>
      </div>
      {/* The confirm step needs its own error slot now that it can stay open through a failure.
          Before, every failure collapsed the step, so the one paragraph in the branch above was
          enough; an unreachable delete that keeps the confirmation would otherwise set a message
          nothing renders — a silent failure inside the fix for a silent failure. */}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
