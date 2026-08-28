'use client';

/**
 * The edits a user can make to a place they already saved — `L1-F7-T2` for the note and the delete,
 * and the category since 2026-08-28. All of them live here rather than inside `PlaceDetail` because
 * `place-sheet.tsx` is already 600 lines, and because they share one idiom: a `useTransition` around
 * a Server Action, an inline error, and no optimistic update.
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
import { Trash2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  deleteSavedPlace,
  updateSavedPlaceCategory,
  updateSavedPlaceNote,
} from '@/app/actions/saved-places';
import { NOTE_MAX_LENGTH, isNoteUnchanged, validateNote } from '@/domain/places/note';
import {
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_CATEGORY_ORDER,
  type ProductCategory,
} from '@/domain/places/product-category';
import { cn } from '@/lib/utils';

/** Shown once the note gets close enough to the limit that the number is useful rather than noise. */
const COUNTER_VISIBLE_FROM = NOTE_MAX_LENGTH - 200;

const LABEL = 'text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase';

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
 * Eight chips is more visual weight than a control most people will touch once deserves, so this
 * follows `NoteEditor`'s idiom exactly: a label, the current value, and a small pencil. Opening it
 * shows the whole vocabulary at once rather than a select — the set is closed and short, and a
 * native select on a drag sheet fights the gesture layer the same way a dialog does
 * (`place-sheet.tsx`'s `useNonModalBackground`).
 *
 * ## "Automatic" is an option, not an absence
 *
 * When the user has overridden the category, the row offers `Automatic` alongside the eight. It
 * writes SQL `NULL`, which is a different statement from picking `Place`: it means *stop, use
 * whatever you work out*, so a better provider category tomorrow still reaches this place. Freezing
 * today's derivation into the column would opt the place out of every future improvement, silently.
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
  category: ProductCategory;
  /** Whether `category` came from this user's override rather than the provider or the model.
   *  Decides only whether `Automatic` is offered — there is nothing to undo otherwise. */
  isOverridden: boolean;
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
        <p className={LABEL}>Category</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(!editing);
          }}
          aria-expanded={editing}
          className="flex items-center gap-1 text-xs font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
        >
          <Pencil className="size-3" aria-hidden />
          {editing ? 'Done' : 'Change'}
        </button>
      </div>

      {editing ? (
        // `radiogroup` rather than a list of buttons: these are one mutually exclusive choice, and
        // a screen reader should say "3 of 9" rather than announce nine unrelated controls.
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
                    ? 'bg-[var(--mint-100)] text-[var(--mint-700)]'
                    : 'bg-muted text-foreground hover:bg-[var(--mint-100)]',
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
          {PRODUCT_CATEGORY_LABEL[category]}
          {!isOverridden && (
            <span className="text-muted-foreground"> · worked out from the post</span>
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
          <p className={LABEL}>Your note</p>
          <button
            type="button"
            onClick={() => {
              setDraft(note ?? '');
              setError(null);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
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
      <label htmlFor={`note-${savedPlaceId}`} className={LABEL}>
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
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={remove}
          autoFocus
        >
          {pending ? 'Removing…' : 'Remove'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
