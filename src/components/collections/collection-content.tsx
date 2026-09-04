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

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from '@base-ui/react/menu';
import {
  ArrowLeft,
  Check,
  ChevronUp,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NothingHereEscape, PlaceRow, PlaceSearchField } from '@/components/sheet/place-sheet';
import {
  EnterSelectionButton,
  LeaveSelectionButton,
} from '@/components/sheet/library-selection';
import {
  AxisRows,
  MenuAxis,
  type AxisOption,
  type FilterSurface,
} from '@/components/sheet/library-filter-bar';
import {
  InlinePanel,
  MENU_POPUP,
  MENU_ROW,
  MENU_ROW_PAINT,
} from '@/components/ui/inline-menu';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import {
  STOP_TO_CONTENT_HEIGHT,
  floatingBarClearancePx,
  type SheetStop,
} from '@/components/shell/sheet-geometry';
import { SharePanel } from '@/components/collections/share-panel';
import { addersIn, adderFilterIsUseful } from '@/components/collections/added-by';
import {
  TAKE_OUT_CONFIRM_LABEL,
  TAKE_OUT_LABEL,
  selectionCountLabel,
  takeOutBody,
  takeOutOutcomeMessage,
  takeOutPrompt,
} from '@/components/collections/bulk-removal';
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
  removeCollectionItems,
  removeMember,
  updateCollection,
} from '@/app/actions/collections';
import type { BulkRemoveResult } from '@/app/actions/collections';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';
import { drawerHref, INDEX_VIEW } from '@/app/map/_lib/drawer-view';
import { attemptWrite } from '@/ui/place/write-failure';
import type { MapPlace } from '@/components/map/map-surface';
import { PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';
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

/**
 * **Whether `Leave collection` is painted red at rest. OPEN OWNER DECISION as of 2026-09-03 —
 * flipping this constant is the whole change, and there is nothing else to touch.**
 *
 * `true` is today's behaviour and the committed state. `false` is what
 * `ux-collection-actions-2026-09-03.md` §6 argues for: red at rest is reserved for the
 * irreversible, and leaving is reversible — its own prompt says *"You can rejoin with the link."*
 * Either way the confirm button stays `variant="destructive"`, so the second step is red in both.
 * `Delete collection` is not governed by this: it is irreversible and is always red.
 */
const LEAVE_IS_DESTRUCTIVE_AT_REST = true;

/**
 * The `Added by` row that narrows nothing, and the bucket for items with no recorded adder.
 *
 * Two sentinels because `AxisRows` speaks in strings and `collection_items.added_by` is nullable:
 * `null` in the state means "everyone", so the unattributed bucket cannot also be `null` or the two
 * are the same choice. Before this it *was* — the unattributed chip called `onChange(null)` and so
 * selected `Everyone`, which is why that bucket has never been reachable. Neither sentinel can
 * collide with a `uuid`.
 */
const EVERYONE_VALUE = 'everyone';
const NO_ADDER_VALUE = 'no-adder';

/** The axis word, on the trigger and as the group's accessible name. `Added by`, never `Saved by`:
 *  the column is `collection_items.added_by` — who put the place *into this collection*, which is
 *  not always who saved it. */
const ADDED_BY_AXIS = 'Added by';

/** The `⋯`'s accessible name, and the popup's. An unlabelled glyph names nothing. */
const COLLECTION_OPTIONS_LABEL = 'Collection options';

/* The `KICKER` class this file exported was the up-link's own styling and nothing else imported
   it. It goes with the row (`ux-collections-as-scope.md` §5 item 3, amended 2026-09-02); the
   product's other kicker is `FILTER_KICKER` in `place-enrichment.tsx`, which is a different
   token and a different job. */

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
        floatingBarPx={floatingBarClearancePx(props.stop)}
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
        floatingBarPx={floatingBarClearancePx(props.stop)}
        collection={collection}
        library={props.library}
        onDone={() => onViewChange('list')}
      />
    );
  }

  if (view === 'place' && selected) {
    return (
      <CollectionPlaceDetail
        floatingBarPx={floatingBarClearancePx(props.stop)}
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
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground',
            PRESS_ROW,
          )}
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
  library,
  pins,
  onViewChange,
  onSelectItem,
  stop,
  onExpand,
  claimHeadingFocus,
}: CollectionContentProps) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  /** Which person's places the list is narrowed to (`collection_items.added_by`), or `null` for
   *  everyone. Client-side over `collection.places`, which already carries the adder and their
   *  display name — see `added-by.ts`. */
  const [addedBy, setAddedBy] = useState<string | null>(null);
  /** Whether the list is in selection mode. Off by default and entered from `Select` on the
   *  heading's own row — the same control and the same word the library uses: browsing is what
   *  this screen is for, and a checkbox on every row all the time would make picking the loudest
   *  thing about a list you mostly read. */
  const [selecting, setSelecting] = useState(false);
  /**
   * What the `⋯` menu was asked for, rendered in the header band rather than inside the menu.
   *
   * It lives here rather than inside the menu because the menu is closed by the time any of it is
   * on screen: at `lg+` the menu is an anchored popup, and a confirm inside one is dismissed by an
   * outside press mid-decision. One confirm surface on both breakpoints.
   */
  const [menuAction, setMenuAction] = useState<'edit' | 'delete' | 'leave' | null>(null);
  const [adderOpen, setAdderOpen] = useState(false);
  /** A refused write's reason. It outlives the confirm it collapses, which is why it is here and
   *  not inside the panel that raised it. */
  const [menuError, setMenuError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirmingTakeOut, setConfirmingTakeOut] = useState(false);
  const [takeOutError, setTakeOutError] = useState<string | null>(null);
  const [takeOutNotice, setTakeOutNotice] = useState<string | null>(null);
  const [takingOut, startTakeOut] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelId = useId();
  /** The `Select` control's slot, so `Cancel` can hand focus back to the thing that opened the
   *  mode. `EnterSelectionButton` is reused verbatim and takes no ref. */
  const selectSlotRef = useRef<HTMLSpanElement>(null);
  /** A ref rather than state: it is a one-shot instruction to the effect below, and putting it in
   *  state would make `Cancel` render twice to move focus once. */
  const restoreSelectFocus = useRef(false);
  // See the heading's own comment below for why this tracks `stop` rather than a breakpoint.
  const HeadingTag = stop === undefined ? 'h1' : 'h2';
  /**
   * Where the two menus on this screen are drawn — the same question `HeadingTag` and `barPx` ask,
   * and answered from `stop` for the same reason. Both instances of this component are in the DOM
   * at once behind CSS gates, so a render-time `matchMedia` emits different markup on the server
   * and on the client; `library-filter-bar.tsx` records the hydration mismatch that shipped.
   */
  const surface: FilterSurface = stop === undefined ? 'popover' : 'inline';

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

  /** The other half of `leaveSelection({ returnFocus: true })`. It has to wait for a render: the
   *  `Select` control does not exist while `selecting` is true, so there is nothing to focus at the
   *  moment `Cancel` is pressed. */
  useEffect(() => {
    if (selecting || !restoreSelectFocus.current) return;
    restoreSelectFocus.current = false;
    selectSlotRef.current?.querySelector('button')?.focus();
  }, [selecting]);

  const editable = canEdit(collection.role);

  const adders = useMemo(
    () => addersIn(collection, currentUserId),
    [collection, currentUserId],
  );
  /**
   * Drawn when two or more people have put something here — one adder means every row returns the
   * same list. The second clause is the one the library's header already carries on `Been` and
   * `Category`: if a collaborator's places are taken out in another tab while their name is the
   * filter, the trigger has to stay, or the control that undoes the narrowing disappears while the
   * narrowing is still on.
   */
  const showAdderFilter = adderFilterIsUseful(adders) || addedBy !== null;

  /** `Everyone`, then the adders in `added-by.ts`'s order. The unattributed bucket keys on
   *  `NO_ADDER_VALUE` rather than on `null`, which is `Everyone`'s value. */
  const adderOptions = useMemo<readonly AxisOption[]>(
    () => [
      { value: EVERYONE_VALUE, label: 'Everyone' },
      ...adders.map((adder) => ({
        value: adder.userId ?? NO_ADDER_VALUE,
        label: adder.label,
        count: adder.count,
      })),
    ],
    [adders],
  );
  /** What the closed trigger says: the person, and how many of the list is theirs. */
  const activeAdder = adderOptions.find((option) => option.value === addedBy) ?? null;

  /** `collection_items.id` → the item, so the two client-side filters below can ask about the row
   *  behind a pin. `pins` is a `MapPlace[]` whose `id` is the item id (`collections-scope.tsx`);
   *  it carries the shared place facts and none of the collection's own. */
  const itemsById = useMemo(
    () => new Map(collection.places.map((place) => [place.itemId, place])),
    [collection.places],
  );

  const matches = useMemo(() => {
    const searched = filterPlaces(pins, query);
    if (addedBy === null) return searched;
    // The no-adder bucket is `NO_ADDER_VALUE` on both sides, because `null` here means `Everyone`.
    return searched.filter(
      (place) => (itemsById.get(place.id)?.addedBy ?? NO_ADDER_VALUE) === addedBy,
    );
  }, [pins, query, addedBy, itemsById]);

  /** Only ever the items still in the collection, so a selection cannot outlive a row that has
   *  been taken out in another tab. The filter and the search deliberately do *not* prune it: a
   *  pick is an explicit act, and narrowing the list is not a way of undoing one. */
  const selected = useMemo(
    () => [...picked].filter((itemId) => itemsById.has(itemId)),
    [picked, itemsById],
  );
  const allSelectedAreMine = selected.every(
    (itemId) => itemsById.get(itemId)?.savedByMe === true,
  );
  /** The caller's own library, addressed by the place identity a collection item points at. Built
   *  once per library rather than per row: the picker below already holds the same array. */
  const mineByPlaceId = useMemo(() => savedByPlaceId(library), [library]);

  /**
   * The rows, which are the pins with the caller's **own** saved row folded back in where they
   * have one — see `withMySavedDetail`. `matches` stays the pin list, because everything that
   * addresses a row (selection, `Select all`, the adder filter) works in item ids and those are
   * unchanged by the fold.
   */
  const rows = useMemo(
    () =>
      matches.map((pin) => {
        const placeId = itemsById.get(pin.id)?.placeId;
        return withMySavedDetail(
          pin,
          placeId === undefined ? undefined : mineByPlaceId.get(placeId),
        );
      }),
    [matches, itemsById, mineByPlaceId],
  );

  /** Whether every row currently on screen is picked — what turns `Select all` into `Clear`. */
  const allVisiblePicked =
    matches.length > 0 && matches.every((place) => picked.has(place.id));

  /**
   * `returnFocus` only for `Cancel`: it is the press that ended the mode, so focus goes back to
   * the `Select` control that started it and has just come back on screen. A completed take-out
   * passes nothing — the user's attention is the list that just changed, and there is no press to
   * return to. Measured before this: `document.activeElement` landed on `<body>` either way.
   */
  function leaveSelection(options?: { readonly returnFocus?: boolean }) {
    setSelecting(false);
    setPicked(new Set());
    setConfirmingTakeOut(false);
    setTakeOutError(null);
    if (options?.returnFocus === true) restoreSelectFocus.current = true;
  }

  /** Everything the mode needs dropped on the way in. Was the `Select places` menu row's body and
   *  is unchanged: both narrowings go, because selection mode hides the controls that set them,
   *  and a list still filtered by a search box that is no longer on screen is a list whose
   *  `Select all` picks a number the user cannot see. */
  function enterSelection() {
    setMenuOpen(false);
    setTakeOutNotice(null);
    setQuery('');
    setAddedBy(null);
    setSelecting(true);
  }

  function togglePick(itemId: string) {
    setTakeOutNotice(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function takeSelectionOut() {
    const ids = selected;
    if (ids.length === 0) return;
    setTakeOutError(null);
    startTakeOut(async () => {
      // `attemptWrite` and not a bare await: an offline take-out rejects inside the transition and
      // React replaces the whole segment with `app/error.tsx`, taking the list and the selection
      // with it. Every other write on this screen already goes through it.
      //
      // The counts are caught on the way past rather than returned by `attemptWrite`, whose `ok`
      // arm is deliberately payload-free (`ui/place/write-failure.ts` is shared by every write in
      // the product and belongs to another lane this wave). One local, one assignment, no widened
      // shared type.
      //
      // `.then` and not `await` inside the callback, deliberately: `write-failure-collections.test`
      // scans this file for `await <action>(` and there must be none, because that shape is what
      // every one of the nine reported sites looked like. The rejection path is identical — the
      // promise is still returned into `attemptWrite`'s `try` — so this keeps the guard honest
      // rather than widening its allow-list to admit a call it cannot tell apart from a bare one.
      const answer: { value: BulkRemoveResult | null } = { value: null };
      const outcome = await attemptWrite(() =>
        removeCollectionItems(collection.id, ids).then((result) => {
          answer.value = result;
          return result;
        }),
      );
      if (outcome.kind !== 'ok') {
        // A refused take-out collapses its confirm — the answer is on screen instead — while an
        // unreachable one keeps it, so the press is not lost with the message. Same split as the
        // menu's delete and leave.
        if (outcome.kind === 'refused') setConfirmingTakeOut(false);
        setTakeOutError(outcome.message);
        return;
      }
      setTakeOutNotice(
        answer.value?.ok === true ? takeOutOutcomeMessage(answer.value) : null,
      );
      leaveSelection();
    });
  }
  /** Whether the pinned `Add places` footer is drawn. Whichever element is *last* in the column is
   *  the one that has to clear the floating bar, and it is one or the other, never both. */
  const hasFooter = editable && collection.places.length > 0;
  /**
   * What the floating bar costs the bottom of this column — its height in the sheet, nothing in the
   * `lg+` panel, where `BottomNav` does not render at all.
   *
   * The conditional itself now lives in `sheet-geometry.ts` beside the handle and the view switch,
   * which is where the rest of the sheet's budget is declared. It was written out here first and
   * the reasoning is still the reasoning: it is keyed on `stop` being present rather than on a
   * breakpoint, because that *is* the distinction — `stop` is what the shell passes to the content
   * it puts in the sheet. A media query in JavaScript would be a second, weaker way of asking the
   * same question, and `map-page-client.tsx` forbids one outright.
   */
  const barPx = floatingBarClearancePx(stop);
  /**
   * **The sheet is told a panel is about to take room in it**, the same call `place-sheet.tsx:676`
   * makes for the library's axes, and guarded the same way. Measured at 375×812 at `half`,
   * `London 2026`: `Added by`'s trigger sits at y575 and its last row lands at y832 against a
   * column that ends at y747 with a 68 px bar floating over it — three of the four rows are
   * unreachable.
   *
   * **The guard is not decoration.** `onExpand` here is `shell.sheet.goTo('half')`, so calling it
   * at `full` *lowers* the sheet out from under the menu that is opening — measured: the heading
   * moved 76 → 441 on the press. And because it only ever reaches `half`, calling it *at* `half`
   * moves nothing either: **the overflow above is still on screen and the other half of the fix is
   * `collections-scope.tsx`, which is a different file's to make** — it passes an expander that
   * stops at `half` where `place-sheet.tsx` passes one that goes to `full`.
   */
  const expandForPanel = stop === 'full' || stop === undefined ? undefined : onExpand;

  /**
   * **An emptied list asks for the room to say so.** 2026-09-04, found in verification: at 390x844
   * the sheet's list column is 75 px at `half`, and the empty state is 284 px — so a search that
   * matched nothing rendered the top 27 px of the mascot's head and nothing else, with the sentence
   * and `Clear all` both below the fold. It was reachable by dragging, which is the same as saying
   * the reader had to guess it was there.
   *
   * It is the same channel a filter panel uses (`expandForPanel`) and the same stop, so the sheet
   * has one rule: *something needs more room than this stop has*. Guarded on the collection having
   * places at all — an empty collection draws `EmptyCollection`, which is a different state with
   * its own primary and does not want the map buried behind it.
   */
  useEffect(() => {
    if (collection.places.length === 0 || matches.length > 0) return;
    expandForPanel?.();
  }, [collection.places.length, matches.length, expandForPanel]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-1">
        {/* **No kicker row, and no `Collections` up-link** — `ux-collections-as-scope.md` §5 item
            3, amended 2026-09-02, and the document moved before this file did, which is the
            sequence that restored the link at `1db0294` when it did not.

            The row cost a measured 44 px — its own `min-h-11` — at 390×844 inside a collection at
            `half`, and deleting it moves everything below up by 36 (see the button below for the
            other 8). It bought
            a second control to a destination already one tap away and directly above it: since
            2026-08-31 the drawer's `Places / Collections` switch renders above this header at
            `half` and `full`, and inside a collection its `Collections` segment is both current and
            the way up — the same `/map?view=collections` href the up-link carried. The Map tab
            covers `peek`, where the up-link never rendered.

            The `⋯` moves onto the heading's row rather than disappearing with it. That move *is*
            the fix: the button is `size-11`, so deleting the link alone would have left the row
            standing at its full height and recovered nothing. */}
        {/*
         * **`<h1>` in the `lg+` panel, `<h2>` in the sheet — not a new decision.**
         * `ui-review-2026-08-31.md` finding 14: this rendered `<h2>Weekend list</h2>` with nothing
         * above it, so the collection's own name — already the loudest, most specific text on the
         * screen — was never the document's title.
         *
         * The tag matches `stop`, the same signal `barPx` above already reads to tell the sheet
         * instance from the panel instance, because that *is* the question: this component is in
         * the document twice at once (see `claimHeadingFocus`'s comment) and only one instance is
         * displayed at a given breakpoint, so exactly one `<h1>` ever reaches the accessibility
         * tree. A visually-hidden `<h1>` stacked above this text would have duplicated it instead of
         * promoting it — the workaround the review's own framing warned against.
         *
         * The size is untouched. This is a tag change, not a redesign: `text-base` already reads
         * correctly as a collection's title in the space this row has, and `PlaceDesktopPanel`'s
         * larger `text-2xl` belongs to a different view with a different amount of chrome above it.
         */}
        <div className="flex items-center gap-1">
          <HeadingTag
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 flex-1 line-clamp-2 font-heading text-base font-bold outline-none"
          >
            <bdi>{collection.name}</bdi>
          </HeadingTag>
          {/* Trailing on the heading's row, in the slot the kicker row's copy of it held.
              **Both margins are negative and that is the whole economy of this move.** A 44 px
              target on a row whose text is 24 px tall would make the row 44 px, and the deletion
              above would have bought 24 px instead of the row it was worth. `-my-1.5` lets the
              button keep its full 44 px hit area while contributing 32 px of layout, so the header
              recovers **36 px net** — measured at 390×844 at `half`, `London 2026`, 15 places: the
              heading's top moves 500 → 460, the search field 558 → 522 and the first place row
              614 → 578. It is 36 and not 44 because hosting a 44 px target on the heading's row
              costs something; the audit's estimate assumed it cost nothing, and the honest number
              is the one written down.

              The 2 px by which the button's box overlaps the view switch above is the switch's own
              `pb-2` padding, not its track: both segments hit-test on their centre *and* on their
              bottom edge with the button in place. `-me-2` pulls the glyph's optical edge back to
              the column's padding while the target stays 44 px. `ms-auto` is left off deliberately
              — `flex-1` on the heading already decides the position, and one rule should. */}
          {/* **`Select` is promoted out of the `⋯` menu onto this row**
              (`ux-collection-actions-2026-09-03.md` §7.1). Two reasons, and they are the two
              `library-selection.tsx` already gives for the identical control above the library: it
              costs **zero vertical pixels** on a header the owner measured as too tall, and it
              changes what a *row* does, which is not an action on the collection and so does not
              belong in an object menu. The component is reused verbatim rather than re-styled, so
              the library and the collection cannot drift into two words for one act.

              The wrapper gives `Cancel` something to hand focus back to — `EnterSelectionButton`
              takes no ref — and carries the row's vertical margin; see its own comment below. */}
          {/* **One slot, two controls, one conditional** (`ux-select-control-2026-09-03.md` §3.1
              and §5). `Cancel` stands exactly where `Select` was, at the same size and one ink
              step darker; the exit used to be at the other end of a row below, two weights
              heavier, which is the transition the owner called weird. `LeaveSelectionButton` also
              moves focus onto itself on mount, which is why the `cancelSelectionRef` this file
              used to carry is gone — the control that needs the focus now owns the move.

              The word stays `Cancel` and not `Done`: `bulk-delete.ts` rules that the reversible
              removal and the irreversible one do not share an exit word. §6 of the spec records
              honestly that the divergence is now thin, and that unifying it is the owner's call. */}
          {/* **The `-my-1.5` is the same economy the `⋯` states above, applied to the control that
              broke it.** `EnterSelectionButton` is `min-h-11` and carries no negative margin,
              correctly: in the library it owns its row and 44 px is the row. Promoted onto a
              heading whose text is 24 px, it set the row height back to 44 and handed back the
              space the `⋯` move had bought — measured at 375×812, `tel aviv food`: a 44 px row
              leaving 10 px of dead air under the title before the members line's own 2 px.
              The margin belongs here rather than inside the shared control, which must keep its
              full height where it sits on a row of its own.

              This wrapper is a box now, not `display: contents`. It has to be — `contents`
              generates no box and so cannot carry a margin. Nothing else changes: it still wraps
              exactly one button, so nothing sits between the heading and the `⋯`, and it still
              exists to give `Cancel` something to hand focus back to. */}
          {selecting ? (
            <span className="-my-1.5 flex items-center">
              <LeaveSelectionButton onLeave={() => leaveSelection({ returnFocus: true })} label="Cancel" />
            </span>
          ) : editable && collection.places.length > 0 ? (
            <span ref={selectSlotRef} className="-my-1.5 flex items-center">
              <EnterSelectionButton onEnter={enterSelection} />
            </span>
          ) : null}
          {/* Hidden while selecting (§7.7): none of its rows is available or sensible mid-selection,
              and an open options menu over a live selection is a state with no defined behaviour. */}
          {selecting ? null : (
            <CollectionOptionsTrigger
              surface={surface}
              open={menuOpen}
              onOpenChange={(next) => {
                if (next) expandForPanel?.();
                setMenuOpen(next);
              }}
              triggerRef={menuTriggerRef}
              panelId={menuPanelId}
            >
              <CollectionMenuRows
                role={collection.role}
                surface={surface}
                onShare={() => {
                  setMenuOpen(false);
                  onViewChange('share');
                }}
                onAction={(action) => {
                  setMenuOpen(false);
                  setMenuError(null);
                  setMenuAction(action);
                }}
              />
            </CollectionOptionsTrigger>
          )}
        </div>
        <button
          type="button"
          onClick={() => onViewChange('share')}
          aria-label="Who is in this collection"
          data-vaul-no-drag
          className={cn(
            'mt-0.5 flex min-h-6 flex-wrap items-center gap-x-1.5 rounded text-start text-caption text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            PRESS_CHIP,
          )}
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

        {/* **The description is drawn on the index row, and only there** (overwhelm audit §7 item
            14, and §4d's rule that a string lives in exactly one place). It sat here as a 3-line
            clamp directly above the first place row, on the surface whose header already spends its
            budget on a heading, a members line and a search field — and it is the same string the
            row you tapped to get here already shows. `collections-index-list.tsx` keeps its
            `line-clamp-1` copy, which is where a description does its work: choosing which
            collection to open. */}

        {/* **The inline half of the `⋯` menu, and it is here rather than beside its trigger on
            purpose.** Under the header block — after the meta line, before the search field — so
            the collection's identity stays visible above an open menu, and so the one thing that
            can be on screen at a time (the menu, an edit form, a confirm, a refusal) is always in
            the same band. At `lg+` the rows are in the anchored popup instead and this renders
            nothing; the band below still carries every consequence. */}
        {surface === 'inline' && menuOpen ? (
          <InlinePanel
            id={menuPanelId}
            axisClear={null}
            triggerRef={menuTriggerRef}
            /* Escape returns focus to the `⋯`; an outside press does not, because the press has
               already landed on whatever the user meant to touch. The library's filter panels make
               the same split, and this is the same component making it. */
            onEscape={() => {
              setMenuOpen(false);
              menuTriggerRef.current?.focus();
            }}
            onOutsidePress={() => setMenuOpen(false)}
          >
            <CollectionMenuRows
              role={collection.role}
              surface="inline"
              onShare={() => {
                setMenuOpen(false);
                onViewChange('share');
              }}
              onAction={(action) => {
                setMenuOpen(false);
                setMenuError(null);
                setMenuAction(action);
              }}
            />
          </InlinePanel>
        ) : null}

        {/* Every consequence of the menu, in the header band with the menu closed — the edit form,
            both confirms, and the sentence a refused write leaves behind. */}
        <CollectionActionPanel
          collection={collection}
          currentUserId={currentUserId}
          action={menuAction}
          error={menuError}
          onError={setMenuError}
          onActionChange={setMenuAction}
        />

        {collection.places.length > 0 && !selecting ? (
          <div className="mt-2">
            <PlaceSearchField value={query} onChange={setQuery} label="Search this collection" />
          </div>
        ) : null}

        {/* Who put it here (§8.1). Below the search rather than beside it: they narrow the same
            list and stacking them keeps each control full width on a 390 px phone. Drawn only when
            two or more people have added something — see `adderFilterIsUseful`.

            **One `MenuAxis`, not a strip of chips** (`ux-collection-actions-2026-09-03.md` §7.2).
            It was a horizontally scrolling, edge-bleeding row of 44 px mint-filled radio chips —
            precisely the chip wall the library's header deleted on 2026-09-02, kept alive on one
            screen. The logic underneath is untouched: `addersIn` still groups, orders and labels,
            and `adderFilterIsUseful` is still the gate. What changes is the material, and with it
            Escape, outside-press and focus-return-to-trigger, none of which the chips had.

            The wrapper wraps because `INLINE_PANEL` is `order-last w-full`: it takes the line below
            the trigger rather than displacing it. */}
        {showAdderFilter && !selecting ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5">
            <MenuAxis
              axis={ADDED_BY_AXIS}
              open={adderOpen}
              onOpenChange={(next) => {
                if (next) expandForPanel?.();
                setAdderOpen(next);
              }}
              value={activeAdder?.label ?? null}
              count={activeAdder?.count ?? null}
              active={addedBy !== null}
              surface={surface}
              axisClear={addedBy === null ? null : () => setAddedBy(null)}
            >
              <AxisRows
                surface={surface}
                value={addedBy ?? EVERYONE_VALUE}
                options={adderOptions}
                onChange={(next) => setAddedBy(next === EVERYONE_VALUE ? null : next)}
                groupLabel={ADDED_BY_AXIS}
              />
            </MenuAxis>
          </div>
        ) : null}

        {/* The selection toolbar replaces the search and the filter while it is up. Two ways of
            narrowing a list you are picking from is a way to lose track of what is picked.

            **The weight ladder is `ux-select-control-2026-09-03.md` §2, and it is the library's.**
            Both buttons were `font-semibold` and near-black, which made the two lowest-stakes
            controls in the band — leave the mode, toggle a checkbox set — the loudest things on
            the screen, above the action they exist to serve. They are `font-medium` now: the exit
            at `text-foreground`, the convenience at `text-muted-foreground`, and the count taking
            its emphasis from its content rather than from chrome. `Cancel` at `font-medium` is
            also what keeps `Select` → `Cancel` one step apart instead of three (§2, C3).

            **This is a copy of `SelectionToolbar` and it stays a copy** — see that component in
            `library-selection.tsx`, which carries the same four rules against the same
            `bulk-delete.ts` divergence table. It is not imported because it is typed on
            `LibrarySelection`, and satisfying that interface here would mean constructing an
            object whose `openConfirm`, `run` and `notice` this screen does not have. Any edit to
            the ladder is made in both places. */}
        {selecting ? (
          <div className="mt-2 flex animate-in items-center gap-2 fade-in-0 duration-enter motion-safe:slide-in-from-top-1">
            <p
              aria-live="polite"
              className={cn(
                'min-w-0 flex-1 text-sm font-medium',
                selected.length === 0 ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {selectionCountLabel(selected.length)}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="-me-3 h-11 px-3 text-sm font-medium text-muted-foreground"
              onClick={() => {
                setTakeOutNotice(null);
                // Over `matches`, which in selection mode is the whole collection — see
                // `onSelectPlaces`, which drops the search and the filter on the way in. Anchoring
                // it to what is on screen rather than to `collection.places` keeps it honest if
                // that ever changes.
                setPicked(allVisiblePicked ? new Set() : new Set(matches.map((place) => place.id)));
              }}
              data-vaul-no-drag
            >
              {allVisiblePicked ? 'Clear' : 'Select all'}
            </Button>
          </div>
        ) : null}

        {/* Only ever says something a clean run would not: a take-out that removed everything it
            was asked to is confirmed by the rows leaving the list. */}
        {takeOutNotice ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {takeOutNotice}
          </p>
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
          /* **The same empty state the library draws** — 2026-09-04. This was a bare grey sentence
             with no mark and no way out, which made it the third vocabulary for one event: the
             library's search miss, the library's filter miss and this one were three different
             objects. `NothingHereEscape` is one object with one control, and the control clears
             both axes this list narrows on, so it can never leave you on an empty list with
             nothing to press.

             The distinction the old copy drew is kept, and by construction rather than by a
             ternary: a query quotes itself, and the person filter falls to the filter sentence,
             which does not blame a search box the reader did not type in. */
          <NothingHereEscape
            searchQuery={query}
            onClear={() => {
              if (query !== '') setQuery('');
              if (addedBy !== null) setAddedBy(null);
            }}
          />
        ) : (
          <ul>
            {rows.map((place) =>
              selecting ? (
                <SelectableRow
                  key={place.id}
                  name={place.name}
                  secondLine={secondLineFor(collection, place.id)}
                  checked={picked.has(place.id)}
                  onToggle={() => togglePick(place.id)}
                />
              ) : (
                <PlaceRow
                  key={place.id}
                  place={place}
                  secondLine={secondLineFor(collection, place.id)}
                  onSelect={() => {
                    onSelectItem(place.id);
                    onViewChange('place');
                  }}
                />
              ),
            )}
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
          {selecting ? (
            confirmingTakeOut ? (
              /* The shallower of the product's two confirms, deliberately (`ux-two-removals-one-
                 screen.md` §2.4): one line, two buttons, no autofocus. The irreversible delete —
                 which lives on the place detail and nowhere near this control — names its place,
                 enumerates what is lost, says it cannot be undone and focuses Cancel. That
                 inequality is the safety mechanism, and a bulk unlink does not get to borrow the
                 heavier one just because it names six rows. */
              <InlineConfirm
                prompt={takeOutPrompt(selected.length)}
                body={takeOutBody({
                  count: selected.length,
                  allSavedByViewer: allSelectedAreMine,
                })}
                confirmLabel={TAKE_OUT_CONFIRM_LABEL}
                pending={takingOut}
                error={takeOutError}
                onCancel={() => {
                  setConfirmingTakeOut(false);
                  setTakeOutError(null);
                }}
                onConfirm={takeSelectionOut}
              />
            ) : (
              /* **Not `variant="destructive"`, and that is the ruling rather than a preference.**
                 Unlinking destroys nothing of the viewer's: the place stays in `places`, and their
                 own save of it — note, tags, Been mark — is untouched. Red here would teach that
                 this control and the irreversible delete are the same weight, which is the exact
                 confusion §2.3 removes. Red appears on this screen only inside the confirm above,
                 on its confirm button. */
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-12 w-full text-base"
                disabled={selected.length === 0}
                onClick={() => {
                  setTakeOutError(null);
                  setConfirmingTakeOut(true);
                }}
                data-vaul-no-drag
              >
                {TAKE_OUT_LABEL}
              </Button>
            )
          ) : (
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
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One row while the list is picking rather than browsing.
 *
 * **Its own row and not `PlaceRow` with a checkbox bolted on**, for one reason that is about
 * meaning rather than layout: `PlaceRow`'s `selected` prop renders `aria-current="true"`, which
 * says *this is the row you have open*. In a multi-select that is a different claim from *this row
 * is picked*, and reusing it would announce six open rows. `role="checkbox"` says the true thing,
 * and the whole row is the hit area rather than a 24 px box beside it.
 *
 * It shows the name and the `Category · Locality` line and stops. Tags, thumbnails and the been
 * badge are what you read a list for; while you are picking, they are what makes six rows hard to
 * count.
 */
function SelectableRow({
  name,
  secondLine,
  checked,
  onToggle,
}: {
  name: string;
  secondLine: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        data-vaul-no-drag
        className={cn(
          'flex min-h-16 w-full items-center gap-3 py-3.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          PRESS_ROW,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
            checked ? 'border-transparent bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {checked ? <Check className="size-3.5" /> : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-1 break-words font-heading text-sm font-bold text-foreground">
            <bdi>{name}</bdi>
          </span>
          {secondLine ? (
            <span className="line-clamp-1 break-words text-xs font-medium text-muted-foreground">
              <bdi>{secondLine}</bdi>
            </span>
          ) : null}
        </span>
      </button>
    </li>
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

/**
 * **The `⋯` trigger, and at `lg+` the popup it anchors.**
 *
 * Two surfaces, one control, and the split is the same one every menu in this product makes: an
 * anchored popup where there is room for it, an inline panel in normal flow inside the sheet, where
 * a floating layer competes with vaul's drag listener and strands a narrow menu mid-screen.
 *
 * On `inline` this renders the button alone — `children` is drawn by the caller, in the header band
 * under the meta line, so the collection's name and members stay visible above an open menu and
 * every consequence of a row lands in one place. On `popover` the rows go in the popup, where
 * anchoring them to anything else would be a menu that opened somewhere other than the thing
 * pressed.
 *
 * The `⋯` gets its open state free: `variant="ghost"` carries `aria-expanded:bg-card-2`.
 */
function CollectionOptionsTrigger({
  surface,
  open,
  onOpenChange,
  triggerRef,
  panelId,
  children,
}: {
  surface: FilterSurface;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  /** The rows. Used on `popover` only; `inline` draws them in the band — see above. */
  children: ReactNode;
}) {
  /* **Both margins stay negative, and that is still the whole economy of this row.** A 44 px target
     on a row whose text is 24 px tall would make the row 44 px, and deleting the `Collections`
     up-link would have bought 24 px instead of the 36 it is worth. `-my-1.5` keeps the full hit
     area while contributing 32 px of layout; `-me-2` pulls the glyph's optical edge back to the
     column's padding. Measured at 390×844 at `half`, `London 2026`, 15 places. */
  const face = <MoreHorizontal className="size-4" aria-hidden />;
  const shape = '-me-2 -my-1.5 size-11 shrink-0 rounded-full text-muted-foreground';

  if (surface === 'inline') {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label={COLLECTION_OPTIONS_LABEL}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        // Escape closes from the trigger as well as from inside the panel: opening by pointer
        // leaves focus here, so a handler only on the panel never fires. The library's inline axes
        // carry the identical line for the identical reason.
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return;
          event.stopPropagation();
          onOpenChange(false);
        }}
        data-vaul-no-drag
        className={shape}
      >
        {face}
      </Button>
    );
  }

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger
        render={<Button type="button" variant="ghost" size="icon-lg" className={shape} />}
        aria-label={COLLECTION_OPTIONS_LABEL}
        aria-expanded={open}
        data-vaul-no-drag
      >
        {face}
      </Menu.Trigger>
      <Menu.Portal>
        {/* `align="end"`, not `start`: the trigger is on the row's trailing edge, so a menu aligned
            to its leading edge would hang off the panel. */}
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50 outline-none">
          <Menu.Popup
            id={panelId}
            data-vaul-no-drag
            aria-label={COLLECTION_OPTIONS_LABEL}
            className={MENU_POPUP}
          >
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * **What is in the menu, after `Select` left it: three rows for a manager, one for everyone else.**
 *
 * `Select places` is gone from here (`ux-collection-actions-2026-09-03.md` §7.1) — it is a mode
 * switch on the *rows*, not an action on the collection, and it now sits on the heading. `Share`
 * stays even though the meta line opens the same view: that line is caption-weight text with no
 * control affordance a first-time user reads, and the menu exists anyway, so the duplicate is the
 * collaboration feature's only labelled entry point.
 */
function CollectionMenuRows({
  role,
  surface,
  onShare,
  onAction,
}: {
  role: CollectionDetail['role'];
  surface: FilterSurface;
  onShare: () => void;
  onAction: (action: 'edit' | 'delete' | 'leave') => void;
}) {
  // `flex-col` inline so a `<button>` fills the panel's width, which is what `Menu.Popup`'s block
  // layout gives the floating rows for free. Same technique as `AxisRows`.
  return (
    <div className={surface === 'inline' ? 'flex flex-col' : undefined}>
      {canManage(role) ? (
        <>
          <CollectionMenuRow surface={surface} label="Share" onClick={onShare} />
          <CollectionMenuRow surface={surface} label="Edit" onClick={() => onAction('edit')} />
          <CollectionMenuRow
            surface={surface}
            label="Delete collection"
            /* Red at rest is reserved for the irreversible, and this is it: everyone loses the
               collection, not just the person pressing. */
            destructive
            onClick={() => onAction('delete')}
          />
        </>
      ) : (
        <CollectionMenuRow
          surface={surface}
          label="Leave collection"
          destructive={LEAVE_IS_DESTRUCTIVE_AT_REST}
          onClick={() => onAction('leave')}
        />
      )}
    </div>
  );
}

/**
 * **One row, on the shared menu material.** It was a bespoke container — `rounded-lg border
 * bg-muted/40` with full-width 44 px bordered rows — that existed nowhere else in the product; the
 * paint now comes from `ui/inline-menu.tsx`, which is the same 40-px row inside a 44-px target the
 * library's filter menus draw.
 *
 * **One deviation from those rows, and it is deliberate: `text-sm`, not `text-xs`.** The library's
 * 12 px is calibrated for a twelve-row options list with a count column. This is a three-row command
 * list where one row is irreversible, and 12 px destructive text is a legibility problem the density
 * argument does not pay for. Same height, same radius, same offsets, same highlight.
 */
function CollectionMenuRow({
  surface,
  label,
  destructive,
  onClick,
}: {
  surface: FilterSurface;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  const face = (
    <span className={cn(MENU_ROW_PAINT, 'text-sm', destructive === true && 'text-destructive')}>
      {label}
    </span>
  );
  if (surface === 'popover') {
    return (
      <Menu.Item className={cn(MENU_ROW, PRESS_ROW)} onClick={onClick}>
        {face}
      </Menu.Item>
    );
  }
  return (
    <button type="button" onClick={onClick} data-vaul-no-drag className={cn(MENU_ROW, PRESS_ROW)}>
      {face}
    </button>
  );
}

/**
 * **Everything the menu leads to, drawn in the header band with the menu closed.**
 *
 * This is a rule rather than an implementation detail. It keeps one confirm surface across both
 * breakpoints, and it avoids a confirm inside an `lg+` popup that an outside press would silently
 * dismiss mid-decision. The band is also where a *refused* write's reason lands: that confirm has
 * collapsed, so without a component that outlives it the server's answer would collapse too and the
 * press would look ignored. An *unreachable* write keeps its confirm and its message inside it.
 *
 * All three writes go through `attemptWrite` (`ui/place/write-failure.ts`) rather than awaiting an
 * action directly. Before 2026-09-01 an offline `Save`, `Delete` or `Leave` rejected inside its
 * transition and React replaced the whole segment with `app/error.tsx` — taking the collection, the
 * list and, on the edit form, the name and description the user had just typed.
 */
function CollectionActionPanel({
  collection,
  currentUserId,
  action,
  error,
  onError,
  onActionChange,
}: {
  collection: CollectionDetail;
  currentUserId: string;
  action: 'edit' | 'delete' | 'leave' | null;
  error: string | null;
  onError: (message: string | null) => void;
  onActionChange: (action: 'edit' | 'delete' | 'leave' | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (action === 'edit') {
    return (
      <CollectionEditForm
        // Remounted per opening, so the drafts start from the collection's current values rather
        // than from whatever the last abandoned edit left in them.
        key={collection.id}
        collection={collection}
        error={error}
        onError={onError}
        onDone={() => onActionChange(null)}
      />
    );
  }

  if (action === 'delete' || action === 'leave') {
    /* The shallower of the product's two confirms, deliberately (`ux-two-removals-one-screen.md`
       §2.4): one prompt line, no body, two buttons, no autofocus, confirm first. The deeper pattern
       — a body enumerating what is lost, `Cancel` first and autofocused — belongs to the library's
       `saved_places` delete, and that inequality is the safety mechanism. */
    const isDelete = action === 'delete';
    return (
      <InlineConfirm
        prompt={
          isDelete
            ? `Delete “${collection.name}”? Everyone loses it.`
            : `Leave “${collection.name}”? You can rejoin with the link.`
        }
        confirmLabel={isDelete ? 'Delete' : 'Leave'}
        pending={pending}
        error={error}
        onCancel={() => {
          onActionChange(null);
          onError(null);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const outcome = await attemptWrite(() =>
              isDelete
                ? deleteCollection(collection.id)
                : removeMember(collection.id, currentUserId),
            );
            if (outcome.kind === 'ok') {
              router.push(drawerHref(INDEX_VIEW) as '/map');
              return;
            }
            // The two failures diverge here and nowhere else, exactly as they do on the saved
            // place's own delete. A **refusal** is settled — the collection is gone, or this caller
            // may not do this — so there is nothing left to confirm and the step collapses, which
            // is where the message then appears. **Silence** settles nothing: the collection is
            // still there, still the one they meant, so the confirmation stays and the button is
            // one press away.
            if (outcome.kind === 'refused') onActionChange(null);
            onError(outcome.message);
          })
        }
      />
    );
  }

  if (error === null) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-destructive">
      {error}
    </p>
  );
}

/**
 * The name and the description, edited in place.
 *
 * The row and its label were both `Rename` until the description field existed. A control named for
 * one of the two things it edits is mislabelled, and `Edit` is bare rather than `Edit collection`
 * because its siblings carry the noun only where they are destructive.
 */
function CollectionEditForm({
  collection,
  error,
  onError,
  onDone,
}: {
  collection: CollectionDetail;
  error: string | null;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(collection.name);
  // `?? ''` here and nowhere else. The form's value is a string because a `<textarea>`'s is;
  // `validateCollectionDescription` turns an empty one back into `null` on the way to the column,
  // so a cleared description is `NULL` and never `''` — the same empty-means-null rule a saved
  // place's note follows.
  const [description, setDescription] = useState(collection.description ?? '');

  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          // `keepsDraft`: this form holds a name and a description somebody typed. Neither failure
          // closes it — a refusal is usually about the words in the fields, and silence wrote
          // nothing at all — so the draft is on screen either way and the message says so.
          const outcome = await attemptWrite(
            () => updateCollection(collection.id, name, description),
            { keepsDraft: true },
          );
          if (outcome.kind !== 'ok') {
            onError(outcome.message);
            return;
          }
          onDone();
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
      {/* A `<textarea>`, not an `<Input>`, and that is the domain's decision rather than a layout
          preference: `validateCollectionDescription`'s docblock says *"Newlines survive; it is
          prose, not a label"*, and a single-line field silently forbids the newlines it
          deliberately preserves.

          No `(optional)` on the label. The name field carries no `(required)`, so qualifying one
          and not the other only reads correctly to somebody who already knows the convention — and
          the field saves blank, which teaches it for free.

          The placeholder is an example rather than a restatement: the label already says what the
          field is, so a placeholder saying it again is the field naming itself twice. What a label
          cannot teach is the register, and one short concrete line does. */}
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
      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="h-11 flex-1" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
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
  floatingBarPx,
}: {
  collection: CollectionDetail;
  library: readonly MapPlace[];
  onDone: () => void;
  /** What `BottomNav` covers at the bottom of this column — `floatingBarClearancePx(stop)`, and 0
   *  in the `lg+` panel. The footer below is pinned to that bottom, so without it the confirm
   *  button is painted behind the bar exactly as the list's `Add places` footer was before it was
   *  given the same number. */
  floatingBarPx: number;
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
          <PlaceSearchField value={query} onChange={setQuery} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {library.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing saved yet. Paste a TikTok link and your places show up here.
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
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-lg py-3.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                      PRESS_ROW,
                    )}
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

      <div
        className="shrink-0 border-t border-border/70 bg-card px-4 pt-3"
        // The bar's height, on the one element in this panel that is pinned to the bottom of the
        // sheet. Same treatment and same reason as the list's `Add places` footer, which was
        // measured behind the bar at 375×812 and fixed; this panel is the other half of that pair
        // and was missed.
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 0.75rem + ${floatingBarPx}px)` }}
      >
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
              // No `keepsDraft`: what this panel holds is a set of ticks, not typed text, and
              // *what you typed is still here* would be a sentence about something the user did
              // not do. The ticks are kept all the same — `setPicked(new Set())` runs on `ok`
              // only — so the retry is one press of the same button.
              const outcome = await attemptWrite(() =>
                addPlacesToCollection(collection.id, [...picked]),
              );
              if (outcome.kind !== 'ok') {
                setError(outcome.message);
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

/**
 * The caller's own saved places, addressed by the place identity behind them.
 *
 * First wins where the same place is saved twice, which the schema forbids
 * (`saved_places` is unique on `(user_id, place_id)`) — the guard is here so a duplicate would
 * pick one row rather than making the list non-deterministic.
 */
function savedByPlaceId(library: readonly MapPlace[]): ReadonlyMap<string, MapPlace> {
  const byPlaceId = new Map<string, MapPlace>();
  for (const saved of library) {
    const placeId = placeIdOf(saved);
    if (placeId === null || byPlaceId.has(placeId)) continue;
    byPlaceId.set(placeId, saved);
  }
  return byPlaceId;
}

/**
 * One collection row, wearing the caller's **own** saved row for the same place when they have one.
 *
 * ## Why the rows were poorer than the library's
 *
 * A collection pin is built from a `places` row alone (`collections-scope.tsx`'s `toMapPlace`), so
 * it carries no `detail` — and `detail` is where `PlaceRow` reads the photo, the tags, the
 * saved-ago line and the locality from. Same component, thinner input: the row fell back to the
 * category glyph, the name and a `secondLine`, and looked like a different design.
 *
 * ## What is folded in, and what is deliberately not
 *
 * **Only the caller's own row**, taken from the library array this screen already has — no new
 * query, and no new read path. Where the caller has not saved the place (someone else added it),
 * the row keeps exactly what it had: the shared identity and nothing more. That is not a gap to
 * close later. Migration `0024` opens one read path into a shared collection and it returns
 * `places` only; another member's tags, note, photo and `visit_state` have no policy that would
 * return them, and asking for them would fail at the database rather than leak. A collection shows
 * shared facts plus *your* overlay, never theirs.
 *
 * The pin's own `id`, `name`, `category` and `note` survive the fold, and all four are the
 * collection's: `id` is the item id every control on this screen addresses a row by, and the other
 * three are the shared facts the whole collection sees, not the caller's private renaming of them.
 * `savedPlaceId` is likewise not copied across — these rows are not write targets, and the detail
 * view reached from one gets its own (`collection-place-detail.tsx`).
 */
function withMySavedDetail(pin: MapPlace, mine: MapPlace | undefined): MapPlace {
  if (mine?.detail === undefined) return pin;
  return { ...pin, detail: mine.detail, visited: mine.visited };
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

export { placeIdOf, savedByPlaceId, withMySavedDetail };
