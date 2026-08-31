'use client';

/**
 * Everything inside a collection, as one switchable stack of views: the list of places, one
 * place's detail, the picker that adds more, and the share/members panel.
 *
 * ## Why a stack and not dialogs
 *
 * Every view here replaces the content of the surface it is already in — the mobile sheet or the
 * desktop panel — and offers a back control. It never opens a second overlay.
 * `src/components/sheet/use-non-modal-background.ts` records what happens otherwise: a drawer
 * marked `<main>` `aria-hidden` and made the whole map page unreachable to a screen reader. A
 * second dialog stacked over the sheet is how that comes back, so there isn't one.
 *
 * ## Why this is not `PlaceSheet`
 *
 * `PlaceSheet` is bound to `/map`'s concerns — active areas, the tag filter, the been filter, the
 * import overlay — none of which a collection has. Reusing it would mean a variant flag threaded
 * through eleven props on the product's most important surface. What is reused instead is
 * everything below the layout: `PlaceRow`, `PlaceSearchField`, the same snap points, the same row
 * language. Same visual result, no blast radius on `/map`.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronUp,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlaceRow, PlaceSearchField } from '@/components/sheet/place-sheet';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import { STOP_TO_CONTENT_HEIGHT, type SheetStop } from '@/components/shell/sheet-geometry';
import { SharePanel } from '@/components/collections/share-panel';
import { CollectionPlaceDetail } from '@/components/collections/collection-place-detail';
import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  canEdit,
  canManage,
  memberLabel,
} from '@/domain/collections/collection';
import { filterPlaces } from '@/components/map/filter-places';
import { categoryLocalityLine } from '@/ui/place/category-display';
import {
  addPlacesToCollection,
  deleteCollection,
  removeMember,
  updateCollection,
} from '@/app/actions/collections';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';
import type { MapPlace } from '@/components/map/map-surface';
import { cn } from '@/lib/utils';

/**
 * The product's kicker: 11 px, tracked, mint — the same treatment `import-page-client.tsx` draws
 * above every screen title. Uppercasing is a Latin device with no Hebrew equivalent, so an RTL
 * chrome carries the label by weight and colour instead.
 */
/**
 * The gap between the last row of a collection and the pinned `Add places` footer above the bar.
 *
 * 12px, which is the footer's own `pt-3` — the space above the button and the space below the last
 * row are deliberately the same number, so the button reads as sitting in a band rather than
 * clamped onto the list.
 */
const LIST_END_GAP_PX = 12;

export const KICKER =
  'text-[11px] font-bold uppercase tracking-[0.14em] text-brand rtl:normal-case rtl:tracking-normal';

export type CollectionView = 'list' | 'place' | 'add' | 'share';

export interface CollectionContentProps {
  readonly collection: CollectionDetail;
  readonly currentUserId: string;
  /** The caller's own saved places, for the picker. Their own library only. */
  readonly library: readonly MapPlace[];
  readonly pins: readonly MapPlace[];
  readonly view: CollectionView;
  readonly onViewChange: (view: CollectionView) => void;
  readonly selectedItemId: string | null;
  readonly onSelectItem: (itemId: string | null) => void;
  /**
   * Which stop the shell's sheet is at, when this is rendering *in* the sheet. Absent in the `lg+`
   * panel, which has no stops.
   *
   * It exists to cap the content column's height. `Drawer.Content` is `h-full` and vaul positions
   * the sheet by translating it, so at `half` the bottom 45% of a full-height column sits below the
   * bottom of the screen: laid out, painted, hit-testable and completely unreachable, because the
   * scroll container's own bottom is off screen. That is why `Add places` was tappable only at
   * `full` (`ux-collections-as-scope.md` §5 item 11), and the cap is the fix `/map`'s list has had
   * since it hit the same wall.
   */
  readonly stop?: SheetStop;
  /** Pull the sheet open from the peek line. Absent in the `lg+` panel, which never peeks. */
  readonly onExpand?: () => void;
  /**
   * Claims the one focus move a route-level scope change is allowed (`ux-collections-as-scope.md`
   * §6): entering a collection replaces the whole list, so focus goes to its `<h2>`. Returns
   * `true` to the first caller for a given collection and `false` to every later one — this
   * component is mounted twice at once (the sheet and the `lg+` panel, one of them displayed) and
   * it re-mounts whenever a pushed pane closes, which is explicitly *not* a scope change.
   */
  readonly claimHeadingFocus?: () => boolean;
}

export function CollectionContent(props: CollectionContentProps) {
  return props.stop === undefined ? (
    <CollectionBody {...props} />
  ) : (
    <div style={{ height: STOP_TO_CONTENT_HEIGHT[props.stop] }} className="flex min-h-0 flex-col">
      <CollectionBody {...props} />
    </div>
  );
}

function CollectionBody(props: CollectionContentProps) {
  const { collection, currentUserId, view, onViewChange, selectedItemId, onSelectItem } = props;
  const selected = collection.places.find((place) => place.itemId === selectedItemId) ?? null;

  // At `peek` there are 114 px of column and the scope is the only thing worth spending them on
  // (§3 of the ruling). Ahead of the view switch, so a sheet dragged down over an open pane still
  // says which collection it is rather than clipping that pane to one line of its header.
  if (props.stop === 'peek') {
    return (
      <CollectionPeekLine
        collection={collection}
        {...(props.onExpand ? { onExpand: props.onExpand } : {})}
      />
    );
  }

  if (view === 'share') {
    return (
      <SharePanel
        collectionId={collection.id}
        collectionName={collection.name}
        role={collection.role}
        members={collection.members}
        invite={collection.invite}
        currentUserId={currentUserId}
        onBack={() => onViewChange('list')}
      />
    );
  }

  if (view === 'add') {
    return (
      <AddPlacesPanel
        collection={collection}
        library={props.library}
        onDone={() => onViewChange('list')}
      />
    );
  }

  if (view === 'place' && selected) {
    return (
      <CollectionPlaceDetail
        collectionId={collection.id}
        place={selected}
        role={collection.role}
        currentUserId={currentUserId}
        // The viewer's own library, so a place they already have opens as *their* place — their
        // note, their been mark, their TikTok — rather than as a stranger's. Same list the picker
        // uses; it was already on these props and simply was not passed on.
        library={props.library}
        onBack={() => {
          onSelectItem(null);
          onViewChange('list');
        }}
      />
    );
  }

  return <CollectionList {...props} />;
}

/**
 * The whole sheet at `peek`: which collection this is, and that there is more one drag up.
 *
 * The count carries the emphasis and the rest of the line stays quiet — the same treatment the
 * saved list's peek row gives `18 in London`, because this is that row in a different scope
 * (`ux-collections-as-scope.md` §3). The name is the **collection's**, never the area's: a
 * collection is not geography, and naming the city its pins happen to sit in would be the one
 * fact on screen contradicting the list underneath.
 */
function CollectionPeekLine({
  collection,
  onExpand,
}: {
  collection: CollectionDetail;
  onExpand?: (() => void) | undefined;
}) {
  const count = collection.places.length;

  return (
    <div className="flex min-h-0 flex-col px-5 pt-3.5">
      <div className="flex items-center" style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Show ${collection.name}`}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground"
        >
          <span className="min-w-0 truncate">
            {count === 0 ? (
              'Nothing in this collection yet'
            ) : (
              <>
                <span className="font-heading font-extrabold text-foreground">{count}</span> in{' '}
                {/* Isolated: a Hebrew collection name otherwise drags the count into its own run
                    and the line reads back-to-front. */}
                <bdi>{collection.name}</bdi>
              </>
            )}
          </span>
          <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function CollectionList({
  collection,
  currentUserId,
  pins,
  onViewChange,
  onSelectItem,
  stop,
  claimHeadingFocus,
}: CollectionContentProps) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * The one focus move §6 asks for: entering a collection is a route-level scope change, and the
   * list under the heading has changed completely.
   *
   * `checkVisibility` before claiming, not after: this component is in the document twice at once
   * (the sheet, `lg:hidden`; the panel, `hidden lg:block`) and only one of them is displayed.
   * Calling `focus()` on the hidden one is a silent no-op that would still have consumed the
   * claim, leaving nothing focused at all.
   */
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading?.checkVisibility()) return;
    if (!claimHeadingFocus?.()) return;
    // No scroll: the sheet is mid-animation into its resting stop and a scroll-into-view here
    // fights it.
    heading.focus({ preventScroll: true });
  }, [claimHeadingFocus]);

  const matches = useMemo(() => filterPlaces(pins, query), [pins, query]);
  const editable = canEdit(collection.role);
  /** Whether the pinned `Add places` footer is drawn. Whichever element is *last* in the column is
   *  the one that has to clear the floating bar, and it is one or the other, never both. */
  const hasFooter = editable && collection.places.length > 0;
  /**
   * What the floating bar costs the bottom of this column — its height in the sheet, nothing in the
   * `lg+` panel, where `BottomNav` does not render at all.
   *
   * Keyed on `stop` being present rather than on a breakpoint, because that *is* the distinction:
   * `stop` is what the shell passes to the content it puts in the sheet. A media query in
   * JavaScript would be a second, weaker way of asking the same question, and `map-page-client.tsx`
   * forbids one outright.
   */
  const barPx = stop === undefined ? 0 : BOTTOM_NAV_HEIGHT_PX;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-1">
        {/* The kicker row, and the up-link *is* the kicker: it says where it goes, in the slot the
            unlabelled back arrow used to occupy, so nothing has to be relearned. */}
        <div className="flex items-center gap-1">
          <Link
            href="/collections"
            aria-label="Collections"
            className={cn(
              KICKER,
              '-ms-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            )}
          >
            <ChevronLeft className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
            Collection
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Collection options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            data-vaul-no-drag
            className="ms-auto size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </div>

        <h2
          ref={headingRef}
          tabIndex={-1}
          className="line-clamp-2 font-heading text-base font-bold outline-none"
        >
          <bdi>{collection.name}</bdi>
        </h2>
        <button
          type="button"
          onClick={() => onViewChange('share')}
          aria-label="Who is in this collection"
          data-vaul-no-drag
          className="mt-0.5 flex min-h-6 flex-wrap items-center gap-x-1.5 rounded text-start text-[13px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* Separate elements with a literal separator, never one interpolated string: a count and
              a Hebrew name in one line of text reorder around each other. `whitespace-nowrap` so the
              wrap happens between the two facts, not inside `3 places`. */}
          <span className="whitespace-nowrap">{placeCountLabel(collection.places.length)}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Users className="size-3" aria-hidden />
            <bdi>{membersLine(collection, currentUserId)}</bdi>
          </span>
        </button>

        {/* The collection's own description, which has been read from the database and carried on
            `CollectionDetail` since collections shipped and never drawn (`growth-plan.md` §4).

            It sits *below* the count and members line rather than between that line and the name.
            The count line is a control — it opens the share view — and putting prose between a
            heading and its own button separates the two things that belong together. Under it, the
            description reads as what it is: the owner's sentence about the collection, not part of
            its identity.

            `line-clamp-3` because this is a sheet header over a list: the description is worth
            three lines of it and not more, and the limit is 500 characters. `<bdi>` rather than
            `dir="auto"`, matching the heading directly above — see the index row for why. */}
        {collection.description ? (
          <p className="mt-1.5 line-clamp-3 text-caption text-muted-foreground">
            <bdi>{collection.description}</bdi>
          </p>
        ) : null}

        {menuOpen ? (
          <CollectionMenu
            collection={collection}
            currentUserId={currentUserId}
            onShare={() => {
              setMenuOpen(false);
              onViewChange('share');
            }}
            onClose={() => setMenuOpen(false)}
          />
        ) : null}

        {collection.places.length > 0 ? (
          <div className="mt-2">
            <PlaceSearchField value={query} onChange={setQuery} label="Search this collection" />
          </div>
        ) : null}
      </div>

      <div
        data-vaul-no-drag
        className="min-h-0 flex-1 overflow-y-auto px-4"
        // Exactly the bar's height, so the last row clears it instead of ending underneath it —
        // the same price `PlaceList` pays for `BottomNav` floating over the sheet. It replaced a
        // hand-picked `5rem + safe-area`, which was a guess at a bar this route did not even
        // render until the shell mounted one (`ux-collections-as-scope.md` §5 item 7).
        //
        // Only when nothing is pinned below it. With the footer there, this list ends at the
        // footer's top edge and the bar is the footer's problem; paying here as well would be 68 px
        // of dead white between the last row and a button.
        //
        // **But not zero, which is what it was.** Measured at 390x844 with six places: at maximum
        // scroll the last row's bottom edge lands on 704.99 and the container's bottom lands on
        // 704.99 — the row is fully readable and touching the footer's hairline with nothing
        // between them, which reads as a row that has been cut rather than one that has ended.
        // `LIST_END_GAP_PX` is the footer's own `pt-3`, mirrored, so the gap above the button and
        // the gap below the last row are the same number. It is a gap, not the bar's height; the
        // paragraph above is still the reason this is not 68.
        style={{
          scrollPaddingBottom: hasFooter ? LIST_END_GAP_PX : barPx,
          paddingBottom: hasFooter ? LIST_END_GAP_PX : barPx,
        }}
      >
        {collection.places.length === 0 ? (
          <EmptyCollection collection={collection} onAdd={() => onViewChange('add')} />
        ) : matches.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing in this collection matches that.
          </p>
        ) : (
          <ul>
            {matches.map((place) => (
              <PlaceRow
                key={place.id}
                place={place}
                secondLine={secondLineFor(collection, place.id)}
                onSelect={() => {
                  onSelectItem(place.id);
                  onViewChange('place');
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Not while the collection is empty: the empty state already offers this exact button, and
          two identical primaries on one screen is a question, not an invitation. */}
      {hasFooter ? (
        /* The bar's height is in the bottom padding, because this footer is pinned to the bottom of
           the sheet's column and `BottomNav` floats over that column at every stop. Measured at
           375×812 before it was added: the button came to rest at y 754–802 against a bar occupying
           744–812, i.e. entirely behind it. This route rendered no bar at all until the shell
           mounted one, which is why the collision is new rather than long-standing. */
        <div
          className="shrink-0 border-t border-border/70 bg-card px-4 pt-3"
          style={{
            paddingBottom: `calc(env(safe-area-inset-bottom) + 0.75rem + ${barPx}px)`,
          }}
        >
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() => onViewChange('add')}
            data-vaul-no-drag
          >
            <Plus className="size-4" aria-hidden />
            Add places
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyCollection({
  collection,
  onAdd,
}: {
  collection: CollectionDetail;
  onAdd: () => void;
}) {
  const owner = collection.members.find((member) => member.role === 'owner');

  return (
    <div className="py-10 text-center">
      <p className="font-heading text-base font-bold">Nothing in this collection yet.</p>
      {canEdit(collection.role) ? (
        <>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Add places from your map and everyone here will see them.
          </p>
          <Button variant="outline" size="lg" className="mt-5 h-11" onClick={onAdd}>
            Add places
          </Button>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          <span dir="auto">
            {memberLabel({ displayName: owner?.displayName ?? null, isYou: false })}
          </span>{' '}
          hasn&apos;t added any places.
        </p>
      )}
    </div>
  );
}

/** Edit, share, leave and delete. Inline rather than a popover portal — the whole feature keeps
 *  every surface inside the sheet it was opened from.
 *
 *  The row and its first label were both `Rename` until the description field existed. A control
 *  named for one of the two things it edits is mislabelled, and `Edit` bare rather than
 *  `Edit collection` because its siblings carry the noun only where they are destructive
 *  (`Delete collection`, `Leave collection`); `Share` beside them is already bare. */
function CollectionMenu({
  collection,
  currentUserId,
  onShare,
  onClose,
}: {
  collection: CollectionDetail;
  currentUserId: string;
  onShare: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  // `?? ''` here and nowhere else. The form's value is a string because a `<textarea>`'s is;
  // `validateCollectionDescription` turns an empty one back into `null` on the way to the column,
  // so a cleared description is `NULL` and never `''` — the same empty-means-null rule a saved
  // place's note follows.
  const [description, setDescription] = useState(collection.description ?? '');
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await updateCollection(collection.id, name, description);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setEditing(false);
            onClose();
            router.refresh();
          });
        }}
      >
        <label htmlFor="edit-collection-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="edit-collection-name"
          autoFocus
          dir="auto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          className="h-11 text-base"
          data-vaul-no-drag
        />

        <label htmlFor="edit-collection-description" className="mt-1 text-sm font-medium">
          Description
        </label>
        {/* A `<textarea>`, not an `<Input>`, and that is the domain's decision rather than a
            layout preference: `validateCollectionDescription`'s docblock says *"Newlines survive;
            it is prose, not a label"*, and a single-line field silently forbids the newlines it
            deliberately preserves.

            No `(optional)` on the label. The name field carries no `(required)`, so qualifying one
            and not the other only reads correctly to somebody who already knows the convention —
            and the field saves blank, which teaches it for free.

            The placeholder is an example rather than a restatement: the label already says what the
            field is, so a placeholder saying it again is the field naming itself twice. What a
            label cannot teach is the register, and one short concrete line does. */}
        <Textarea
          id="edit-collection-description"
          dir="auto"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={COLLECTION_DESCRIPTION_MAX_LENGTH}
          placeholder="Places from the Lisbon trip"
          className="text-base"
          data-vaul-no-drag
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="h-11 flex-1" disabled={pending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (confirming === 'delete') {
    return (
      <InlineConfirm
        prompt={`Delete “${collection.name}”? Everyone loses it.`}
        confirmLabel="Delete"
        pending={pending}
        error={error}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteCollection(collection.id);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push('/collections');
          })
        }
      />
    );
  }

  if (confirming === 'leave') {
    return (
      <InlineConfirm
        prompt={`Leave “${collection.name}”? You can rejoin with the link.`}
        confirmLabel="Leave"
        pending={pending}
        error={error}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await removeMember(collection.id, currentUserId);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push('/collections');
          })
        }
      />
    );
  }

  return (
    <div className="mt-2 flex flex-col rounded-lg border border-border bg-muted/40">
      {canManage(collection.role) ? (
        <>
          <MenuRow label="Share" onClick={onShare} />
          <MenuRow label="Edit" onClick={() => setEditing(true)} />
          <MenuRow label="Delete collection" destructive onClick={() => setConfirming('delete')} />
        </>
      ) : (
        <MenuRow label="Leave collection" destructive onClick={() => setConfirming('leave')} />
      )}
    </div>
  );
}

function MenuRow({
  label,
  destructive,
  onClick,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-vaul-no-drag
      className={cn(
        'flex min-h-11 items-center px-3 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 not-last:border-b not-last:border-border/70',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {label}
    </button>
  );
}

export function InlineConfirm({
  prompt,
  body,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  /** A second line under the prompt, for a consequence the prompt has no room to state.
   *
   *  Optional because the three collection call sites do not need one: `Delete "X"? Everyone loses
   *  it.` says the consequence in the prompt. Account deletion cannot — its prompt is a question
   *  and its consequence is two clauses — so rather than a fourth confirm component, this is one
   *  optional line. */
  body?: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3" role="group">
      <p dir="auto" className="text-sm font-medium">
        {prompt}
      </p>
      {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="h-11 flex-1"
          disabled={pending}
          onClick={onConfirm}
          data-vaul-no-drag
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-11"
          onClick={onCancel}
          data-vaul-no-drag
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The picker: the caller's own library, multi-select, with places already in the collection shown
 * checked and inert. That inert state is how "re-adding is a silent no-op" becomes visible rather
 * than mysterious — the alternative is a tap that appears to do nothing.
 *
 * This is the product's only multi-select surface, deliberately: selecting several *is* the task
 * here, so no mode has to be entered or left.
 */
function AddPlacesPanel({
  collection,
  library,
  onDone,
}: {
  collection: CollectionDetail;
  library: readonly MapPlace[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // `MapPlace.id` here is the saved-place id; the collection stores place ids, so the two lists are
  // compared through the place id carried on the row's detail.
  const alreadyIn = useMemo(
    () => new Set(collection.places.map((place) => place.placeId)),
    [collection.places],
  );

  const matches = useMemo(() => filterPlaces(library, query), [library, query]);

  function toggle(placeId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-1">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Back to the collection"
            onClick={onDone}
            className="-ml-2 size-11 shrink-0 rounded-full text-muted-foreground"
            data-vaul-no-drag
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-base font-bold outline-none"
          >
            Add places
          </h2>
        </div>
        <div className="mt-2">
          <PlaceSearchField value={query} onChange={setQuery} label="Search your places" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {library.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no saved places yet. Import a TikTok first.
          </p>
        ) : (
          <ul>
            {matches.map((place) => {
              const placeId = placeIdOf(place);
              const isIn = placeId !== null && alreadyIn.has(placeId);
              const isPicked = placeId !== null && picked.has(placeId);
              return (
                <li key={place.id} className="border-b border-border/70 last:border-b-0">
                  <button
                    type="button"
                    disabled={isIn || placeId === null}
                    aria-pressed={isIn || isPicked}
                    onClick={() => placeId && toggle(placeId)}
                    data-vaul-no-drag
                    className="flex min-h-16 w-full items-center gap-3 rounded-lg py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border',
                        isIn || isPicked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {isIn || isPicked ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-1 text-sm font-bold">
                        <bdi>{place.name}</bdi>
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        <bdi>{place.detail?.locality ?? place.detail?.addressLine ?? ''}</bdi>
                      </span>
                    </span>
                    {isIn ? (
                      <span className="shrink-0 text-xs text-muted-foreground">Already in</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border/70 bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        {error ? (
          <p role="alert" className="pb-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base"
          disabled={pending || picked.size === 0}
          data-vaul-no-drag
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await addPlacesToCollection(collection.id, [...picked]);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setPicked(new Set());
              router.refresh();
              onDone();
            })
          }
        >
          {picked.size === 0
            ? 'Select places to add'
            : `Add ${picked.size} place${picked.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}

/** A library row carries its saved-place id as `id`; the place identity a collection stores lives
 *  on the `Spot` behind it. Absent only for a row not built from a real `Spot`, which cannot
 *  happen on this screen — the fallback keeps such a row visible and inert rather than crashing. */
function placeIdOf(place: MapPlace): string | null {
  return place.detail?.placeId ?? null;
}

/** `Category · Locality` for a collection row, built from the `places` row the item points at
 *  rather than from a `Spot` the caller may not have. */
function secondLineFor(collection: CollectionDetail, itemId: string): string {
  const place = collection.places.find((candidate) => candidate.itemId === itemId);
  if (!place) return '';
  return categoryLocalityLine(place.category, place.locality);
}

function placeCountLabel(count: number): string {
  if (count === 0) return 'No places yet';
  return `${count} place${count === 1 ? '' : 's'}`;
}

/**
 * "You and Maya", "You, Maya and 1 other". Always you first — a list you are in that starts with
 * someone else reads like someone else's list.
 */
function membersLine(collection: CollectionDetail, currentUserId: string): string {
  const others = collection.members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => memberLabel({ displayName: member.displayName, isYou: false }));

  if (others.length === 0) return 'Only you';
  if (others.length === 1) return `You and ${others[0]}`;
  return `You, ${others[0]} and ${others.length - 1} other${others.length - 1 === 1 ? '' : 's'}`;
}

export { placeIdOf };
