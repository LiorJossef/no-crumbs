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
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Trash2, Pencil, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  deleteSavedPlace,
  setSavedPlaceVisited,
  updateSavedPlaceCategory,
  updateSavedPlaceName,
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
  DISPLAY_NAME_MAX_LENGTH,
  isDisplayNameUnchanged,
  validateDisplayName,
} from '@/domain/places/display-name';
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_CATEGORY_ORDER,
  type ProductCategory,
} from '@/domain/places/product-category';
import { SECTION_LABEL } from '@/ui/place/section-label';
import { cn } from '@/lib/utils';

/** Shown once the note gets close enough to the limit that the number is useful rather than noise. */
const COUNTER_VISIBLE_FROM = NOTE_MAX_LENGTH - 200;

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
      const result = await setSavedPlaceVisited(savedPlaceId, next);
      if (result.ok) {
        announcer?.say(ticket, visitChangeAnnouncement(placeName, next));
        return;
      }
      setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
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
          'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
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
   *  manually added place has no post, and the line read `Bar · worked out from the post` on the
   *  first one ever saved. Its category came from the map listing's own type, which is a different
   *  claim and a better one. */
  fromAPost: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ProductCategory | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateSavedPlaceCategory(savedPlaceId, next);
      if (result.ok) {
        setEditing(false);
        return;
      }
      setError(result.message);
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
                  'rounded-full px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50',
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
          {category !== null && !isOverridden && (
            <span className="text-muted-foreground">
              {fromAPost ? ' · worked out from the post' : ' · from the map listing'}
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
 * Renaming a saved place.
 *
 * A pencil beside the name rather than a row in the controls block below: this edits the *identity*
 * on the card, and a control that changes the biggest word on the screen belongs next to that word.
 * Everything else in this file is a fact about the place; this is what it is called.
 *
 * Clearing the field restores the real name, and the reset control says that name out loud rather
 * than being an unlabelled "reset" — the user has to be able to see what they are going back to.
 */
export function RenameTrigger({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      aria-label="Rename this place"
      onClick={onStart}
      data-vaul-no-drag
      className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Pencil className="size-3.5" aria-hidden />
    </button>
  );
}

export function NameEditor({
  savedPlaceId,
  displayNameOverride,
  canonicalName,
  onDone,
}: {
  savedPlaceId: string;
  displayNameOverride: string | null;
  canonicalName: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(displayNameOverride ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function save(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateSavedPlaceName(savedPlaceId, value);
      if (result.ok) {
        onDone();
        return;
      }
      setError(result.message);
    });
  }

  const validation = validateDisplayName(draft);
  const unchanged = isDisplayNameUnchanged(draft, displayNameOverride);

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged && validation.ok) save(draft);
      }}
    >
      <label htmlFor={`name-${savedPlaceId}`} className={SECTION_LABEL}>
        Name
      </label>
      <input
        id={`name-${savedPlaceId}`}
        ref={inputRef}
        dir="auto"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Escape cancels. Unlike the note, Enter *does* submit — this is a single-line label, so
          // there is no second line for Enter to be needed for.
          if (event.key === 'Escape') {
            event.stopPropagation();
            onDone();
          }
        }}
        disabled={pending}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        enterKeyHint="done"
        placeholder={canonicalName}
        aria-invalid={!validation.ok || undefined}
        aria-describedby={error ? `name-error-${savedPlaceId}` : undefined}
        data-vaul-no-drag
        className={cn(
          'h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
          !validation.ok && 'border-destructive ring-3 ring-destructive/20',
        )}
      />
      {error && (
        <p id={`name-error-${savedPlaceId}`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || unchanged || !validation.ok}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDone}
        >
          Cancel
        </Button>
        {displayNameOverride !== null && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save('')}
            className="text-xs font-bold text-brand underline-offset-4 hover:underline disabled:opacity-50"
          >
            Use{' '}
            <bdi>{canonicalName}</bdi>
          </button>
        )}
      </div>
    </form>
  );
}

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

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className={SECTION_LABEL}>Your note</p>
          <button
            type="button"
            onClick={() => {
              setDraft(note ?? '');
              setError(null);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-bold text-brand underline-offset-4 hover:underline"
          >
            <Pencil className="size-3" aria-hidden />
            {note ? 'Edit' : 'Add a note'}
          </button>
        </div>
        {note ? (
          // `whitespace-pre-wrap`: the note is prose and `validateNote` deliberately preserves its
          // newlines, so rendering it collapsed would lose the shape the user typed.
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{note}</p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nothing yet — why did you save this?
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

  const validation = validateNote(draft);
  const unchanged = isNoteUnchanged(draft, note);
  const tooLong = !validation.ok;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSavedPlaceNote(savedPlaceId, draft);
      if (result.ok) {
        setEditing(false);
        return;
      }
      setError(result.message);
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
          'w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
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
      const result = await deleteSavedPlace(savedPlaceId);
      if (result.ok) {
        onRemoved();
        return;
      }
      setConfirming(false);
      setError(result.message);
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
    </div>
  );
}
