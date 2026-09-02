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
 *    editors stay open with the draft in the field, the category row stays open on the chip that
 *    was pressed, and the delete confirmation stays confirming, so one more press is the retry.
 *    Tidying up after silence is what would turn a two-second signal drop into lost work.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Trash2, Pencil, Plus, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { PRESS_BUTTON, PRESS_CHIP, TINT_BEAT } from '@/lib/interaction';

/** Shown once the note gets close enough to the limit that the number is useful rather than noise. */
const COUNTER_VISIBLE_FROM = NOTE_MAX_LENGTH - 200;

/**
 * **The empty-note offer, and there is exactly one of it.**
 *
 * A dashed outline says *a field that is not filled in yet* the way a solid one cannot, and the
 * `Plus` says the verb. It is a constant rather than a class list in two components because this
 * product has two note fields on two surfaces — the private one on a saved place and the shared
 * one on a collection item — and round 3's §1.6/§11.1 complaint is precisely that the same object
 * looks like two objects. The collection surface used to answer an empty note with a kicker, a
 * pencil link and a line of placeholder prose; it now wears this.
 *
 * The words are not part of the constant: `Add a note` and `Add a shared note` name genuinely
 * different fields, and flattening that would be a lie rather than a unification.
 */
export const ADD_NOTE_PILL =
  'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-input px-3.5 text-sm font-bold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * **The one shape the card's three primary actions share** — `Open on TikTok`, `Google Maps` and
 * `Been here` — exported because the first two are anchors in `place-sheet.tsx` and only the third
 * lives here. Two files drawing "the same pill" from two class strings is how the row comes to have
 * two heights.
 *
 * Why a pill and not the full-width block this was: the block was 44 px tall and the width of the
 * card, and there were two more like it underneath (the note, the remove). Three full-width blocks
 * is a form, and a saved place is not a form — round 3 of the owner's feedback measured the primary
 * actions *below the fold* on both viewports. Side by side they cost one 44 px band instead of
 * three, which is what buys the card its zero-scroll shape.
 *
 * `min-h-11` is not negotiable and is why the row is pills rather than text links: 44 px is the
 * touch floor, and this is the row a person presses on a phone. The height is spent once for all
 * three.
 *
 * `px-3` is measured, not chosen: at `px-3.5` the three pills are 353 px against the 350 px a
 * 390 px phone gives this card, so the row wrapped into two 44 px bands and gave back most of what
 * it had just saved. At `px-3`, with no trailing arrow on the Google Maps pill, they are 333 px and
 * the row is one band with 17 px of slack. The labels are fixed strings, so that number is the same
 * on every place in the library rather than a lucky fixture.
 */
export const DETAIL_ACTION_PILL =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

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
          // and the two are ~200ms apart. `PRESS_BUTTON` rather than `PRESS_ROW`: it is a button,
          // full width or not. The bare `transition-colors` goes rather than gaining a prefix,
          // because `PRESS_BEAT`'s `motion-safe:transition` already carries colour.
          //
          // **The width is gone and the words are not.** This was `w-full rounded-lg`; it is now
          // the shared pill, third in a row beside the two links. `voice-and-vocabulary.md` §3
          // ratifies `Been here` / `Been`, so the size and the weight changed and the string did
          // not — the complaint was never the wording.
          DETAIL_ACTION_PILL,
          PRESS_BUTTON,
          pending && 'opacity-50',
          visited
            ? 'border-transparent bg-accent text-brand'
            : 'border-input text-foreground hover:bg-muted',
        )}
      >
        <Check className="size-4 shrink-0" aria-hidden />
        {visited ? BEEN_STATE_LABEL : BEEN_ACTION_LABEL}
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
 * ## Collapsed by default, one row when open
 *
 * Three chips (four with `Automatic`), down from eight with the 2026-08-29 taxonomy. Even eight was
 * more visual weight than a control most people will touch once deserves, so this
 * follows `NoteEditor`'s idiom exactly: a label, the current value, and a small pencil. Opening it
 * shows the whole vocabulary at once rather than a select — the set is closed and short, and a
 * native select on a drag sheet fights the gesture layer the same way a dialog does
 * (`place-sheet.tsx`'s `useNonModalBackground`).
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
  fromAPost,
}: {
  savedPlaceId: string;
  /** The place's current category, `null` where nothing resolved one. A null is a legitimate
   *  resting state, not an error: the row simply shows no chip as active. */
  category: ProductCategory | null;
  /** Whether `category` came from this user's override rather than the provider or the model.
   *  Decides only whether `Automatic` is offered — there is nothing to undo otherwise. */
  isOverridden: boolean;
  /** Whether this place came from a TikTok at all.
   *
   *  Only the sentence under the value depends on it, and only so that it stops being false: a
   *  manually added place has no TikTok video behind it, and the line read `Bar · from the TikTok
   *  video` on the first one ever saved. Its category came from the map listing's own type, which
   *  is a different claim and a better one. */
  fromAPost: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ProductCategory | null) {
    setError(null);
    startTransition(async () => {
      const outcome = await attemptWrite(() => updateSavedPlaceCategory(savedPlaceId, next));
      if (outcome.kind === 'ok') {
        setEditing(false);
        return;
      }
      // The row stays open on either failure. Closing it would hide the chips behind a second
      // press of `Change` at the exact moment the user wants to press one again, and on an
      // unreachable write it would also imply something settled when nothing was written.
      setError(outcome.message);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className={SECTION_LABEL}>Category</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(!editing);
          }}
          aria-expanded={editing}
          className="flex items-center gap-1 text-xs font-bold text-brand underline-offset-4 hover:underline"
        >
          <Pencil className="size-3" aria-hidden />
          {editing ? 'Done' : 'Change'}
        </button>
      </div>

      {editing ? (
        // `radiogroup` rather than a list of buttons: these are one mutually exclusive choice, and
        // a screen reader should say "2 of 4" rather than announce four unrelated controls.
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5 pt-0.5">
          {PRODUCT_CATEGORY_ORDER.map((value) => {
            const active = value === category && isOverridden;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => {
                  choose(value);
                }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-50',
                  PRESS_CHIP,
                  active
                    ? 'bg-accent text-brand'
                    : 'bg-muted text-foreground hover:bg-accent',
                )}
              >
                {PRODUCT_CATEGORY_LABEL[value]}
              </button>
            );
          })}
          {isOverridden && (
            <button
              type="button"
              role="radio"
              aria-checked={false}
              disabled={pending}
              onClick={() => {
                choose(null);
              }}
              className="rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground underline underline-offset-4 disabled:opacity-50"
            >
              Automatic
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">
          {/* A place with no category says so in words rather than showing a blank line where a
              value should be — the control is the answer to "what is this?", and silence there
              reads as a rendering fault rather than as an honest "we could not tell". */}
          {category === null ? (
            <span className="text-muted-foreground">Not set</span>
          ) : (
            PRODUCT_CATEGORY_LABEL[category]
          )}
          {/* **Where the category came from, said as a place rather than as a process.**

              This read `Restaurant · worked out from the video` until 2026-09-02. *Worked out
              from* is our machinery narrated at the user — the same voice B-T2 retired from the
              location line, which used to read `Approximate location — Worked out from the video
              rather than matched to a map listing…` and is now a mark beside the address. The two
              lines were siblings and only one of them had been fixed.

              `from the TikTok video` names an object the user already knows is there: the still at
              the top of this card is a frame of it, and the pill above opens it. That makes it
              symmetric with the other arm, `from the map listing`, which was already a thing
              rather than a procedure — and the symmetry is the point, because the whole sentence
              exists to say *you did not choose this, we did, and here is where we got it*.

              No `title` here, unlike the location mark. That mark demoted a sentence carrying a
              real consequence (the pin can be a street or two off); this one had nothing left to
              demote once the process verb was gone, and a tooltip that repeats the visible words
              is padding. `voice-and-vocabulary.md` §3.1 allows the bare `video` only as an anaphor,
              so the adjective is written out: this card names TikTok nowhere else in words — its
              link pill is icon-only. */}
          {category !== null && !isOverridden && (
            <span className="text-muted-foreground">
              {fromAPost ? ' · from the TikTok video' : ' · from the map listing'}
            </span>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
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

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft(note ?? '');
    setError(null);
    setEditing(true);
  }

  // **The empty state is one control, not a section.** It used to be a `YOUR NOTE` kicker, an
  // `Add a note` link opposite it and a full line of placeholder prose — three elements and ~56 px
  // to say that a field is empty, on the card whose primary actions round 3 measured below the
  // fold. A heading over nothing is a section that is not there yet; the offer is the whole state.
  // The words are the same words (`voice-and-vocabulary.md` §3: *note*, never *comment* or
  // *memo*), one glyph shorter, and the pencil goes with them — you cannot edit what is not
  // written, so `Plus` is the honest verb and `Pencil` stays on the filled state below.
  if (!editing && !note) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={open}
          data-vaul-no-drag
          className={cn(
            ADD_NOTE_PILL,
            PRESS_BUTTON,
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Add a note
        </button>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className={SECTION_LABEL}>Your note</p>
          <button
            type="button"
            onClick={open}
            className="flex items-center gap-1 text-xs font-bold text-brand underline-offset-4 hover:underline"
          >
            <Pencil className="size-3" aria-hidden />
            Edit
          </button>
        </div>
        {/* `whitespace-pre-wrap`: the note is prose and `validateNote` deliberately preserves its
            newlines, so rendering it collapsed would lose the shape the user typed.
            `dir="auto"`: a note is free-form prose and Tel Aviv is a target city, so it is
            routinely Hebrew — matching the identical treatment of the shared collection note in
            `collection-place-detail.tsx`, the one sibling that already had this right (rtl audit,
            `docs/rtl-audit-2026-08-31.md` finding 1).

            No empty arm any more: a note-less place returns the compact offer above and never
            reaches this branch, so the placeholder prose that used to sit here — *Nothing yet —
            why did you save this?* — has nowhere to render. */}
        <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {note}
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
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
        return;
      }
      setError(outcome.message);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`note-${savedPlaceId}`} className={SECTION_LABEL}>
        Your note
      </label>
      <textarea
        id={`note-${savedPlaceId}`}
        ref={textareaRef}
        dir="auto"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Escape cancels. Enter does NOT submit — this is a multi-line prose field, and stealing
          // Enter would make a second paragraph impossible to type.
          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
            setError(null);
          }
        }}
        rows={4}
        disabled={pending}
        aria-invalid={tooLong || undefined}
        aria-describedby={error ? `note-error-${savedPlaceId}` : undefined}
        placeholder="Why did you save this?"
        className={cn(
          // A `<textarea>` cannot be an `<Input>`, so row 9's hover is restated here rather than
          // inherited. It is the one duplicate of that chrome left in this file, and it is
          // structural rather than an oversight.
          // `TINT_BEAT` rather than a bare `motion-safe:transition-colors`: the border warming
          // under a pointer is the micro tier, and it ran at Tailwind's unnamed 150ms default
          // until the scale gave it a name.
          TINT_BEAT,
          'w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base leading-relaxed outline-none hover:border-ring/60 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
          tooLong && 'border-destructive ring-3 ring-destructive/20',
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
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={pending || tooLong || unchanged} onClick={save}>
            {pending ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </div>

      {error && (
        <p id={`note-error-${savedPlaceId}`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
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
    return (
      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          <Trash2 className="size-3.5" aria-hidden />
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
    <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
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
