'use client';

/**
 * One place, as seen from inside a collection.
 *
 * **What is on this screen is the whole privacy claim of the feature, made concrete.** It shows the
 * shared identity of the place (name, category, address), the note written *for the collection*,
 * and who put it there. It does not show — and cannot, because no policy grants it — the adder's
 * own note, their been / not-been mark, their tags, or the TikTok they saved it from. That is why
 * the sentence on the share panel is checkable rather than a reassurance.
 *
 * The one thing it says about the *caller's* own library is whether they already have this place,
 * which is their own row and nobody else's.
 *
 * ## It is `PlaceDetail`, not a second copy of it
 *
 * A collection is a scoped view of places, so this reads as the same kind of screen as the standard
 * detail — and it now *is* that component (`components/sheet/place-sheet.tsx`), rendered with
 * `variant="hosted"`. It used to be a hand-copied layout that had to be kept in step by hand: the
 * same 2xl heading, the same `Category · Locality` line, the same address row, the same section
 * rhythm, all written twice.
 *
 * Two props are what make that reuse safe rather than dangerous:
 *
 *  - **`savedPlace={null}`.** `PlaceDetail` renders six controls that write to a `saved_places`
 *    row, and it used to take that row's id from `place.id`. Here `place.id` is a **collection
 *    item** id, so naive reuse would have aimed five writes at a row this caller does not own.
 *    The prop is required and undefaulted, so no host can arrive at that by omission — and it
 *    carries the row's id and its visit state *together*, so "there is a row" and "we know nothing
 *    about it" is not a state anyone can express. A collection never learns anybody's visit state.
 *  - **a `SharedOnlyPlaceFacts` detail.** Every private block in `PlaceDetail` — the thumbnail, the
 *    caption quote, the model's sentence, the tags, `Open TikTok`, the match-certainty line, the
 *    saved-on line — renders only when its field is present, and the object passed here carries
 *    none of them. The boundary is a property of the data, not of a `readOnly` flag somebody has to
 *    remember; the type pins each of those keys to `never`, so adding one is a compile error.
 *
 * What is left is what this screen has that the standard one does not, passed into two slots:
 * `Added by …` and `Save to your places` where the been / not-been toggle sits (the "what does this
 * do to *your* library" position, which is the whole point of somebody else's recommendation), and
 * the shared note plus `Remove from this collection` in the footer.
 *
 * The shared note is a **secondary card near the bottom**, not the body of the screen. It used to
 * render as an always-open three-row textarea directly under the address, above every action, so an
 * empty note — the normal state — was the visual centre of a place's detail. It is an annotation
 * about this place *in this collection*; it is placed and weighted like one.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Pencil, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/collections/collection-content';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import { canEdit, memberLabel, FORMER_MEMBER_LABEL } from '@/domain/collections/collection';
import { SECTION_LABEL } from '@/ui/place/section-label';
import {
  removeCollectionItem,
  saveCollectionPlace,
  updateCollectionItemNote,
} from '@/app/actions/collections';
import type { CollectionPlace } from '@/app/collections/_lib/get-collections';
import type { CollectionRole } from '@/domain/collections/collection';
import type { SharedOnlyPlaceFacts } from '@/domain/places/spot';

/** The quiet mint text action, as used for the external links and the note affordance in the
 *  standard detail view. `min-h-11` is the one addition: the note's affordance sits alone in
 *  whitespace on a phone rather than in that view's dense row of links. */
const TEXT_ACTION =
  'inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-bold text-[var(--mint-700)] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50';

export function CollectionPlaceDetail({
  collectionId,
  place,
  role,
  currentUserId,
  onBack,
}: {
  collectionId: string;
  place: CollectionPlace;
  role: CollectionRole;
  currentUserId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const editable = canEdit(role);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * The place, with only what a `places` row says about it.
   *
   * Typed `SharedOnlyPlaceFacts` rather than left to inference on purpose: the type pins every
   * overlay key to `never`, so a later edit that reaches for the adder's note or source link stops
   * at the compiler instead of at a collaborator's screen (and anything it does not name is an
   * excess property on this literal, which is also an error). `CollectionPlace` carries none of
   * those fields either — the query never selects them — so the boundary holds in two independent
   * places.
   */
  const facts: SharedOnlyPlaceFacts = {
    placeId: place.placeId,
    addressLine: place.addressLine,
    locality: place.locality,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A back arrow rather than `PlaceDetail`'s close "×", and this is the one navigation
          divergence: every view in `CollectionContent` — share, add, place — replaces the content
          of the same surface and returns to the list. An "×" would promise a close that does not
          exist here. Same position and same size as the list's own back control, so the header does
          not jump when the view changes — which is why it is a header row of this component and not
          something `PlaceDetail` draws inside its own scrolling column (`variant="hosted"` is that
          component agreeing to render no navigation of its own). */}
      <div className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the collection"
          onClick={onBack}
          data-vaul-no-drag
          className="-ml-2 size-11 shrink-0 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
      </div>

      <PlaceDetail
        place={{
          name: place.name,
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          // The adder's TikTok is theirs. Stated rather than omitted, because the prop is required.
          sourceUrl: undefined,
          detail: facts,
        }}
        // No `saved_places` row is in play here. `place.itemId` is a collection item and
        // `place.placeId` is a shared place; neither is a row this caller may write a note, a
        // category, a visit state or a deletion to.
        savedPlace={null}
        onClose={onBack}
        variant="hosted"
        primaryAction={
          <div className="flex flex-col gap-3">
            {/* Attribution is shown only when it was not you: a twelve-row collection where every
                line reads "Added by you" is noise dressed as information.

                It leads this block rather than sitting down with the provenance the standard sheet
                puts at its foot, because in a shared collection *who recommended this* is a reason
                to read on, not a footnote about how the row got here. */}
            {place.addedBy !== currentUserId ? (
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <span>Added by</span>
                <span className="font-bold">
                  {place.addedBy === null
                    ? FORMER_MEMBER_LABEL
                    : memberLabel({ displayName: place.addedByName, isYou: false })}
                </span>
              </p>
            ) : null}

            {/* Somebody adds a place, and everyone else can take it. It saves as `origin = 'manual'`
                because that is true — the recommendation came from a person, not from a TikTok this
                user imported. */}
            {place.savedByMe ? (
              // Deliberately not the button shape: nothing here can undo a save, so an element that
              // looks like the control above it would be a false affordance.
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Check className="size-4 shrink-0" aria-hidden />
                Already in your places
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11 w-full justify-center gap-2 rounded-lg text-sm font-bold"
                disabled={pending}
                data-vaul-no-drag
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await saveCollectionPlace(place.placeId);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    router.refresh();
                  })
                }
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                Save to your places
              </Button>
            )}

            {error && !confirming ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        }
        footer={
          <>
            <SharedNote
              collectionId={collectionId}
              itemId={place.itemId}
              note={place.note}
              editable={editable}
            />

            {editable ? (
              <div className="border-t border-border/70 pt-4">
                {confirming ? (
                  <InlineConfirm
                    prompt="Remove from this collection?"
                    confirmLabel="Remove"
                    pending={pending}
                    error={error}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() =>
                      startTransition(async () => {
                        const result = await removeCollectionItem(collectionId, place.itemId);
                        if (!result.ok) {
                          setError(result.message);
                          return;
                        }
                        router.refresh();
                        onBack();
                      })
                    }
                  />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-11 w-full justify-start px-1 text-destructive"
                    onClick={() => {
                      setError(null);
                      setConfirming(true);
                    }}
                    data-vaul-no-drag
                  >
                    Remove from this collection
                  </Button>
                )}
                {/* Both strings say "from this collection" so it is never mistaken for deleting the
                    place out of anyone's own library, which this does not do. */}
              </div>
            ) : null}
          </>
        }
      />
    </div>
  );
}

/**
 * The shared note, as a card.
 *
 * Closed by default, and that is the fix. An always-open textarea is a 90 px bordered box whose
 * resting state is empty, and it was sitting above every action on the screen — so the loudest
 * thing about a place somebody recommended was a form nobody had filled in. Closed, it is a label
 * and one line: either the note, or a `Add a shared note` affordance in the same quiet mint the
 * standard sheet's own note editor uses.
 *
 * Save-on-blur is kept — the field is the control, and this feature has no Save buttons anywhere
 * else — and blurring also closes it, so an empty textarea can never be what the screen comes to
 * rest on. Escape cancels without writing, which is what a keyboard user reaches for and what the
 * standard note editor already does; `stopPropagation` keeps it from being read as "close the
 * sheet".
 */
function SharedNote({
  collectionId,
  itemId,
  note,
  editable,
}: {
  collectionId: string;
  itemId: string;
  note: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Set by Escape so the blur that follows the unmount cannot write the draft it just discarded. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Absent when empty and there is nothing to be done about it, never "No note yet".
  if (!editable && !note) return null;

  const fieldId = `shared-note-${itemId}`;

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if ((value.trim() || null) === note) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateCollectionItemNote(collectionId, itemId, value);
      if (!result.ok) {
        // Stays open: the draft is still the only copy of what the user wrote.
        setError(result.message);
        return;
      }
      setError(null);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-border/70 bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        {/* A `<label>` exactly when there is a field for it to name, and the same words either way,
            so the section never renames itself as it opens. */}
        {editing ? (
          <label htmlFor={fieldId} className={SECTION_LABEL}>
            Shared note
          </label>
        ) : (
          <p className={SECTION_LABEL}>Shared note</p>
        )}
        {editable && !editing ? (
          <button
            type="button"
            data-vaul-no-drag
            onClick={() => {
              setValue(note ?? '');
              setError(null);
              cancelled.current = false;
              setEditing(true);
            }}
            className={`${TEXT_ACTION} -my-1 shrink-0 text-xs`}
          >
            <Pencil className="size-3" aria-hidden />
            {note ? 'Edit' : 'Add a shared note'}
          </button>
        ) : null}
      </div>

      {editing ? (
        <textarea
          id={fieldId}
          ref={textareaRef}
          dir="auto"
          value={value}
          maxLength={500}
          rows={3}
          aria-busy={pending || undefined}
          data-vaul-no-drag
          placeholder="Everyone in this collection can see this"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Escape cancels. Enter does not submit — a shared note is prose, and stealing Enter
            // would make a second line impossible to type.
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            cancelled.current = true;
            setValue(note ?? '');
            setError(null);
            setEditing(false);
          }}
          onBlur={commit}
          className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      ) : note ? (
        <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {note}
        </p>
      ) : (
        // Editors only — a viewer with no note returned above.
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Nothing yet — everyone here will see what you write.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
