'use client';

/**
 * One place, as seen from inside a collection.
 *
 * **A place is one object, whatever route reached it** — `docs/product-ruling-one-place-one-object.md`
 * R1. This screen *is* `PlaceDetail`, the component `/map` renders, with `variant="hosted"`. The
 * collection may only **add**, through the two slots that component exposes: `Added by …` in
 * `primaryAction`, the shared note and `Remove from this collection` in the footer. It reorders
 * nothing, renames nothing, hides nothing.
 *
 * ## One component, two callers — and the difference is whose row is in hand
 *
 *  - **A place the viewer saved themselves.** Their own `saved_places` row is already loaded on
 *    this route (the library the picker uses), so it is passed straight through: their note, their
 *    been mark, their category, their TikTok. Withholding it was never a privacy boundary — it was
 *    the viewer's own data hidden from the viewer, which is exactly the complaint that produced R1:
 *    the same place opened from a collection looked like a different application.
 *  - **A place somebody else added that the viewer does not have.** Here the narrowing below *is*
 *    the privacy claim of the feature, made concrete. No policy grants the adder's private note,
 *    their been / not-been mark or the TikTok they saved it from, and none of it appears. (R2's
 *    "the source travels with the place" is a separate `SECURITY DEFINER` read, not something this
 *    component can reach for; until it exists, another member's row stays out of view entirely.)
 *
 * Two props carry that difference, and both are deliberately hard to get wrong:
 *
 *  - **`savedPlace`.** `PlaceDetail` renders six controls that write to a `saved_places` row, and
 *    it used to take that row's id from `place.id`. On this route `place.itemId` is a **collection
 *    item** id and `place.placeId` is a shared place; neither is writable by this caller, so naive
 *    reuse would have aimed five writes at the wrong rows. The prop stays required and undefaulted
 *    so no host can arrive at that by omission, and it carries the id and the visit state
 *    *together*, so "there is a row" and "we know nothing about it" is not a state anyone can
 *    express. The only id ever placed in it here is the viewer's own saved-place id, read off
 *    their own library row.
 *  - **the facts object.** Every private block in `PlaceDetail` — the thumbnail, the caption quote,
 *    the model's sentence, the tags, `Open on TikTok`, the match-certainty line, the saved-on line —
 *    renders only when its field is present. For a place the viewer does not own, what is passed
 *    is a `SharedOnlyPlaceFacts` literal, whose type pins each of those keys to `never`: the
 *    boundary is a property of the data rather than of a `readOnly` flag somebody has to remember,
 *    and a later edit that reaches for the adder's note stops at the compiler instead of at a
 *    collaborator's screen. `CollectionPlace` carries none of those fields either — the query never
 *    selects them — so the boundary holds in two independent places.
 *
 * `library` is required for the same reason: a host that forgot to pass it would quietly render
 * every one of the viewer's own places as though it belonged to a stranger.
 *
 * The shared note is a **secondary card near the bottom**, not the body of the screen. It used to
 * render as an always-open three-row textarea directly under the address, above every action, so an
 * empty note — the normal state — was the visual centre of a place's detail. It is an annotation
 * about this place *in this collection*; it is placed and weighted like one.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/collections/collection-content';
import {
  HostedPaneBackContext,
  type HostedPaneBackControl,
} from '@/components/collections/add-to-collection';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import {
  DETAIL_FIELD_OPEN,
  DETAIL_FIELD_ROW,
  DETAIL_FIELD_VALUE,
} from '@/components/sheet/saved-place-edits';
import { canEdit, memberLabel, FORMER_MEMBER_LABEL } from '@/domain/collections/collection';
import { SECTION_LABEL } from '@/ui/place/section-label';
import {
  removeCollectionItem,
  saveCollectionPlace,
  updateCollectionItemNote,
} from '@/app/actions/collections';
import type { CollectionPlace } from '@/app/collections/_lib/get-collections';
import type { CollectionRole } from '@/domain/collections/collection';
import { PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { textDirection } from '@/ui/place/text-direction';
import type { MapPlace } from '@/components/map/map-surface';
import type { PlaceDetailFacts, SharedOnlyPlaceFacts } from '@/domain/places/spot';

export function CollectionPlaceDetail({
  collectionId,
  place,
  role,
  currentUserId,
  library,
  onBack,
  floatingBarPx,
}: {
  collectionId: string;
  place: CollectionPlace;
  role: CollectionRole;
  currentUserId: string;
  /**
   * What `BottomNav` covers at the bottom of this column, from `floatingBarClearancePx(stop)`.
   *
   * Passed down rather than decided here for the reason `PlaceDetail`'s own prop names: this
   * component is mounted **twice at once** — in the collection's sheet, where the bar floats over
   * the last 68 px, and in the `lg+` panel, where the bar does not render at all — and only
   * `CollectionContent` knows which of the two it is building. Measured before it was wired, at
   * 390×844 and at maximum scroll: `Remove from this collection` came to rest at y 770–814 against
   * a bar occupying 776–844, five of five hit-test points blocked.
   */
  floatingBarPx: number;
  /** The viewer's **own** saved places — the same list the picker uses. Required, not optional:
   *  see the header for why an omitted library is a silently wrong screen rather than a safe one. */
  library: readonly MapPlace[];
  onBack: () => void;
}) {
  const router = useRouter();
  const editable = canEdit(role);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Set while a pane inside `PlaceDetail` — today only the add-to-a-collection picker — has
   *  borrowed the header's one back control. See `HostedPaneBackContext`. */
  const [paneBack, setPaneBack] = useState<HostedPaneBackControl | null>(null);
  const backHost = useMemo(() => ({ setBack: setPaneBack }), []);

  /**
   * The viewer's own save of this place, if they have one.
   *
   * Matched on the shared `places` id, which is the only identity the two sides have in common:
   * `MapPlace.id` is a `saved_places` id and `CollectionPlace.itemId` is a collection item, so
   * neither can be compared to the other. `null` is the ordinary case — most places in a shared
   * collection belong to somebody else.
   */
  const mine = library.find((entry) => entry.detail?.placeId === place.placeId) ?? null;

  /**
   * The place, with only what a `places` row says about it.
   *
   * Typed `SharedOnlyPlaceFacts` rather than left to inference on purpose: the type pins every
   * overlay key to `never`, so a later edit that reaches for the adder's note or source link stops
   * at the compiler instead of at a collaborator's screen (and anything it does not name is an
   * excess property on this literal, which is also an error). `CollectionPlace` carries none of
   * those fields either — the query never selects them — so the boundary holds in two independent
   * places.
   *
   * Used whenever `mine` is null. When it is not, the viewer's own `Spot` is passed instead — that
   * is their row, and hiding it from them was the defect R1 names.
   */
  const sharedOnly: SharedOnlyPlaceFacts = {
    placeId: place.placeId,
    addressLine: place.addressLine,
    locality: place.locality,
  };

  const facts: PlaceDetailFacts = mine?.detail ?? sharedOnly;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A back arrow rather than `PlaceDetail`'s close "×", and this is the one navigation
          divergence: every view in `CollectionContent` — share, add, place — replaces the content
          of the same surface and returns to the list. An "×" would promise a close that does not
          exist here. Same position and same size as the list's own back control, so the header does
          not jump when the view changes — which is why it is a header row of this component and not
          something `PlaceDetail` draws inside its own scrolling column (`variant="hosted"` is that
          component agreeing to render no navigation of its own). */}
      {/* One control, whatever is showing underneath: while a pane has borrowed it, it dismisses
          the pane instead of the detail, in the same slot and at the same size. Two back-shaped
          controls on one screen is what `ux-collections-as-scope.md` §2.2 forbids. */}
      <div className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={paneBack ? paneBack.label : 'Back to the collection'}
          onClick={paneBack ? paneBack.onBack : onBack}
          data-vaul-no-drag
          className="-ms-2 size-11 shrink-0 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
      </div>

      <HostedPaneBackContext value={backHost}>
        <PlaceDetail
          place={{
            // **Both of these follow `mine`, not `place`, and they must move together with
            //  `detail`.** `CollectionPlace` carries the shared `places` name and a category
            //  `getCollection` derives with `override: null` — correct for somebody else's place,
            //  and stale for your own. Mixing the two sources is worse than either: `detail`
            //  supplies `categoryIsOverridden`, so a screen showing the derived category *and*
            //  `isOverridden: true` prints a system guess as if it were your choice, and ticks the
            //  wrong chip — one tap on the chip that already looks selected then overwrites the
            //  override you actually set.
            name: mine ? mine.name : place.name,
            category: mine ? mine.category : place.category,
            lat: place.lat,
            lng: place.lng,
            // Your own TikTok when this is your place; otherwise nothing — the adder's is theirs.
            // Stated rather than omitted, because the prop is required.
            sourceUrl: mine ? mine.sourceUrl : undefined,
            detail: facts,
          }}
          /* **The id here must be a `saved_places` id and nothing else.** `place.itemId` is a
             collection item and `place.placeId` is a shared place; aiming a write at either would
             hit a row this caller does not own, which is the exact hazard that made this prop
             required and undefaulted. `mine.id` is the viewer's own saved-place id, so it is the
             only value that may appear here. `null` when they have no row: every mutation in
             `PlaceDetail` is gated on this object. */
          savedPlace={
            mine
              ? {
                  id: mine.id,
                  visited: mine.visited,
                  // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes` is on and
                  // "absent" is the honest shape for a marked row with no timestamp. Same
                  // construction as `/map`'s call site (`place-sheet.tsx`), deliberately.
                  ...(mine.detail?.visitedAt ? { visitedAt: mine.detail.visitedAt } : {}),
                }
              : null
          }
          onClose={onBack}
          floatingBarPx={floatingBarPx}
          variant="hosted"
          primaryAction={
            <div className="flex flex-col gap-3">
              {/* Attribution is shown only when it was not you: a twelve-row collection where every
                  line reads "Added by you" is noise dressed as information.

                  It leads this block rather than sitting down with the provenance the standard sheet
                  puts at its foot, because in a shared collection *who recommended this* is a reason
                  to read on, not a footnote about how the row got here. */}
              {place.addedBy !== currentUserId ? (
                <p className="flex items-center gap-1 text-micro font-medium text-muted-foreground">
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
                  user imported.

                  Nothing at all once the viewer's own row is in hand: the Been-here toggle now
                  occupies this position, and an inert `Already in your places` sitting beside a live
                  control that says more is noise. */}
              {mine ? null : place.savedByMe ? (
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
          /* The shared note is a field row, so it joins the card's field-row list flush under
             `Your note` rather than sitting below the destructive action. */
          fields={
            <SharedNote
              collectionId={collectionId}
              itemId={place.itemId}
              note={place.note}
              editable={editable}
            />
          }
          footer={
            <>
              {editable ? (
                <div className="flex flex-col">
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
                    // The same component as `Remove from your places` directly above it, because
                    // it is the same kind of act: start-aligned, muted until hover, one trash
                    // glyph. Two removals on one screen are told apart by *wording and position*
                    // — `from this collection` versus `from your places` — which is what
                    // `docs/ux-two-removals-one-screen.md` §2.3 actually asks for; drawing them as
                    // two different components said they were two different kinds of thing.
                    <button
                      type="button"
                      className={cn(
                        'flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline',
                        PRESS_CHIP,
                      )}
                      onClick={() => {
                        setError(null);
                        setConfirming(true);
                      }}
                      data-vaul-no-drag
                    >
                      <Trash2 className="size-3.5 shrink-0" aria-hidden />
                      Remove from this collection
                    </button>
                  )}
                  {/* Both strings say "from this collection" so it is never mistaken for deleting the
                      place out of anyone's own library, which this does not do. */}
                </div>
              ) : null}
            </>
          }
        />
      </HostedPaneBackContext>
    </div>
  );
}

/**
 * The shared note, as **the same field row the private note wears** on `/map`.
 *
 * It was a bordered, muted-filled card holding a `SHARED NOTE` kicker and a mint `Edit` link, with
 * a dashed pill for its empty state — three appearances for one field, on two screens a user moves
 * between. It is now `DETAIL_FIELD_ROW`: label above value, pencil at the end, the offer in muted
 * ink when there is nothing written yet. The *shared* qualifier stays in the words, because a
 * shared note and a private one are different fields with different audiences; only the shape is
 * shared. Who can see it is said by the placeholder once the editor is open, where it is
 * actionable.
 *
 * Closed by default, and that is still the fix: an always-open textarea is a 90 px box whose
 * resting state is empty, sitting above every action on the screen.
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

  /** The note scope, same rule as the private note on `/map`: this is the one text on the card the
   *  user writes, so it resolves its direction from what they wrote rather than inheriting the
   *  card's, and both states share it so the block does not jump when the editor opens. */
  const noteDirection = textDirection(note);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Absent when empty and there is nothing to be done about it, never "No note yet".
  if (!editable && !note) return null;

  const fieldId = `shared-note-${itemId}`;

  function openEditor() {
    setValue(note ?? '');
    setError(null);
    cancelled.current = false;
    setEditing(true);
  }

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

  // Resting. One row for both states — an empty shared note and a written one differ by their
  // value's ink, never by their component.
  if (!editing) {
    const row = (
      <>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={SECTION_LABEL}>Shared note</span>
          <span
            className={cn(
              DETAIL_FIELD_VALUE,
              'whitespace-pre-wrap',
              note ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {note ?? 'Add a shared note'}
          </span>
        </span>
        {editable ? <Pencil className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </>
    );

    return (
      <div dir={noteDirection} className="flex flex-col">
        {/* A viewer who may not edit still sees the note; they just get a paragraph rather than a
            control, at the same inset so the column's edge does not move. */}
        {editable ? (
          <button
            type="button"
            data-vaul-no-drag
            aria-expanded={false}
            onClick={openEditor}
            className={cn(DETAIL_FIELD_ROW, PRESS_ROW)}
          >
            {row}
          </button>
        ) : (
          <div className="flex min-h-12 w-full items-center gap-2 px-1">{row}</div>
        )}
        {error ? (
          <p role="alert" className="px-1 pt-1 text-micro font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div dir={noteDirection} className={cn(DETAIL_FIELD_OPEN, 'gap-2')}>
      <label htmlFor={fieldId} className={SECTION_LABEL}>
        Shared note
      </label>

      {editing ? (
        <textarea
          id={fieldId}
          ref={textareaRef}
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
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none motion-safe:transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-micro font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
