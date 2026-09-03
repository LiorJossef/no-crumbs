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

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlinePanel } from '@/components/ui/inline-menu';
import { InlineConfirm } from '@/components/collections/collection-content';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import {
  DETAIL_FIELD_ROW,
  DETAIL_FIELD_VALUE,
  DisclosureChevron,
} from '@/components/sheet/saved-place-edits';
import { useDetailPanelOpen } from '@/ui/place/detail-panel-open';
import {
  canEdit,
  memberLabel,
  COLLECTION_ITEM_NOTE_MAX_LENGTH,
  FORMER_MEMBER_LABEL,
} from '@/domain/collections/collection';
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
      {/* One back control on this screen, always this one. It used to be lendable: the
          add-to-a-collection picker replaced the whole pane and borrowed this slot for its own
          dismissal (`HostedPaneBackContext`, deleted once it had no consumers). Since 2026-09-03
          the picker opens as a panel under
          its own row and replaces nothing, so there is no second pane to come back from and
          nothing ever borrows it. */}
      <div className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the collection"
          onClick={onBack}
          data-vaul-no-drag
          className="-ms-2 size-11 shrink-0 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
      </div>

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
    </div>
  );
}

/**
 * The shared note, as **the same row, opening the same way, as every other field on this card**.
 *
 * It has been three shapes in three days and the last one is the reason this exists. It was a
 * bordered, muted-filled card with a `SHARED NOTE` kicker and a mint `Edit` link; on 2026-09-02 it
 * became a `DETAIL_FIELD_ROW` with a pencil and its own always-visible editor. Then `bd6f46a`
 * rebuilt `Add to a collection`, `Category` and `Your note` so that all three **disclose one
 * panel** under a rotating chevron — and this row, on the one screen where all four are drawn
 * together, kept the pencil and kept replacing itself. Three rows answering one way and a fourth
 * answering another, in a single flush list, is the owner's "patches" complaint reproduced
 * (feedback 2.1). The row now matches: label, value, `DisclosureChevron`, and an `InlinePanel`
 * directly underneath.
 *
 * **The shared qualifier stays in the words, never in the shape.** A shared note and a private one
 * are different fields with different audiences, and the label is where that is said — `Shared
 * note` inline once there is one, `Add a shared note` as the offer, and the placeholder saying who
 * can read it at the moment you are writing it. Nothing about *what* this field is, who may edit
 * it or where it is written has changed here; only how it opens.
 *
 * **Save-on-blur is gone, and it had to be.** Inside a panel the commit pair is what you press, so
 * a blur commit would fire on the way to `Cancel` and write the draft the user was abandoning.
 * `Your note` directly above already commits with a button pair; two adjacent notes with two
 * commit models is exactly the incoherence being removed. Escape still cancels without writing,
 * and an outside press still leaves the draft alone — the note is the one thing on this card the
 * user made themselves, and a mistimed tap must not take it.
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

  // Absent when empty and there is nothing to be done about it, never "No note yet".
  if (!editable && !note) return null;

  const fieldId = `shared-note-${itemId}`;

  function open() {
    setDraft(note ?? '');
    setError(null);
    // The sheet goes to `full` before the panel takes room in the column — the same channel the
    // three rows above use, and `undefined` on every host that provides none.
    raiseSheet?.();
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setError(null);
    // Focus returns to the row that opened the panel, never to `<body>`. `requestAnimationFrame`
    // because the panel is unmounted in this same commit, and `preventScroll` because the card is
    // a scrolling column inside a drag sheet.
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  const trimmed = draft.trim();
  const tooLong = trimmed.length > COLLECTION_ITEM_NOTE_MAX_LENGTH;
  const unchanged = (trimmed || null) === note;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateCollectionItemNote(collectionId, itemId, draft);
      if (!result.ok) {
        // Stays open with the draft in the field: it is still the only copy of what was written.
        setError(result.message);
        return;
      }
      setError(null);
      setEditing(false);
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      router.refresh();
    });
  }

  // **One line, label leading**, exactly as `Your note` draws it: the label appears only once
  // there is a note to name, because `Shared note` over `Add a shared note` says the same thing
  // twice and empty is the state most rows are in. The value is clamped — pressing the row opens
  // the editor with the whole note in it, and an unbounded prose block in a resting row is what
  // pushed this card's controls below the fold.
  const line = (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      {note && <span className={cn(SECTION_LABEL, 'shrink-0')}>Shared note</span>}
      {/* `dir="auto"`: a shared note is free-form prose and is routinely Hebrew. */}
      <span
        dir="auto"
        className={cn(
          DETAIL_FIELD_VALUE,
          'min-w-0 flex-1',
          note ? 'line-clamp-2 whitespace-pre-wrap text-foreground' : 'text-muted-foreground',
        )}
      >
        {note ?? 'Add a shared note'}
      </span>
    </span>
  );

  return (
    <div className="flex flex-col">
      {/* A viewer who may not edit still sees the note; they get a paragraph rather than a control,
          at the same inset and the same height so the column's edge and rhythm do not move. */}
      {editable ? (
        <button
          ref={triggerRef}
          type="button"
          data-vaul-no-drag
          aria-haspopup="dialog"
          aria-expanded={editing}
          aria-controls={editing ? panelId : undefined}
          onClick={() => (editing ? close() : open())}
          className={cn(DETAIL_FIELD_ROW, PRESS_ROW)}
        >
          {line}
          <DisclosureChevron open={editing} />
        </button>
      ) : (
        <div className="flex min-h-12 w-full items-center gap-2 px-1">{line}</div>
      )}

      {editing && (
        <InlinePanel
          id={panelId}
          axisClear={null}
          triggerRef={triggerRef}
          onEscape={close}
          // A press elsewhere does not discard a draft — same rule as `Your note`.
          onOutsidePress={() => {}}
        >
          {/* The panel is the surface, so the field draws nothing of its own: no border, no fill,
              no radius, no ring. A bordered box inside a bordered panel is the "patch" material
              the card spent this week removing. */}
          <div className="flex flex-col gap-2 px-2 py-1.5">
            <label htmlFor={fieldId} className={cn(SECTION_LABEL, 'sr-only')}>
              Shared note
            </label>
            <textarea
              id={fieldId}
              ref={textareaRef}
              dir="auto"
              value={draft}
              rows={3}
              disabled={pending}
              aria-busy={pending || undefined}
              aria-invalid={tooLong || undefined}
              aria-describedby={error ? `shared-note-error-${itemId}` : undefined}
              data-vaul-no-drag
              // Who can see it, said at the moment it is being written, which is where it is
              // actionable — and it is why this field needs no kicker of its own.
              placeholder="Everyone in this collection can see this"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Escape cancels. Enter does not submit — a shared note is prose, and stealing
                // Enter would make a second line impossible to type.
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                close();
              }}
              className={cn(
                // `text-base` is the iOS zoom floor; `md:text-sm` is the desktop step.
                // `resize-none` because the panel caps its own height and a hand-dragged field
                // would fight that cap.
                'w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm',
                tooLong && 'text-destructive',
              )}
            />

            {/* The house commit pair, in the order and at the size `Your note` uses. */}
            <div className="flex items-center justify-end gap-2">
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

            {error ? (
              <p
                id={`shared-note-error-${itemId}`}
                role="alert"
                className="text-micro font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
        </InlinePanel>
      )}

      {/* A failure that happens while the panel is closed still has to be said somewhere. */}
      {error && !editing ? (
        <p role="alert" className="px-1 pt-1 text-micro font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
