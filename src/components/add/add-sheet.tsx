'use client';

/**
 * `ADD-2` — the one creation sheet, opened by the `＋` in the bottom nav.
 *
 * The owner's ruling (2026-08-29) is that `＋` means the same thing on every screen. It was briefly
 * contextual — `Add a TikTok link` on `/map`, `New collection` on `/collections` — and that was
 * rejected: a button that changes what it does when the page under it changes is a button you have
 * to read before you can press. So `＋` opens **this**, everywhere, and the choice is made inside
 * the sheet where it can be seen. There is deliberately no route-awareness anywhere in this file.
 *
 * The second half of the ruling is that adding never leaves the map. This is a sheet over the
 * current view, with a backdrop; dismissing it — swipe down, backdrop tap, Escape, close button —
 * puts you back exactly where you were. That is the whole reason it is not the `/import` route:
 * navigating unmounts the MapLibre canvas, and remounting costs a style fetch, a tile round trip
 * and a camera reset.
 *
 * ## One drawer, three panes — not three drawers
 *
 * Stacked sheets on a phone are two drag layers competing for the same downward swipe, and vaul
 * does not nest cleanly. So there is exactly one `Drawer.Root`, one gesture surface, one backdrop,
 * and the content inside it swaps:
 *
 *  - `menu`       — the two things you can create.
 *  - `place`      — one field that searches your library, takes a TikTok link, or names a place.
 *  - `collection` — one name field.
 *
 * The pane change is animated; the drawer's own open/close is not animated differently per pane,
 * so the sheet always arrives and leaves the same way regardless of where you were in it.
 *
 * ## Presentational, and strictly so
 *
 * Every piece of state that outlives the sheet belongs to the caller: the query, the matching
 * places, what a TikTok submit does, what creating a collection does. This file performs no fetch,
 * no navigation and no server action. The one thing it owns is which pane is showing, because that
 * dies with the sheet.
 *
 * ## Split into shell and panes on purpose
 *
 * The shell renders through a Radix portal, which produces **nothing at all** under
 * `react-dom/server`, and this repo's unit setup is `environment: 'node'` with no jsdom (see
 * `tests/unit/sheet/library-filter-bar.test.ts`'s header). Exporting the panes is what makes their
 * markup — labels, input attributes, which rows exist — assertable at any level at all.
 */

import { Drawer } from 'vaul';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Library,
  MapPin,
  Plus,
  Search,
  X,
} from 'lucide-react';

import { PlatformMark } from '@/components/brand/platform-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ENTER_NEWS, ENTER_SURFACE, PRESS_ROW } from '@/lib/interaction';
import { COLLECTION_NAME_MAX_LENGTH } from '@/domain/collections/collection';
import { IMPORT_ERROR_COPY } from '@/ui/import/import-error-copy';
import {
  addSubmitIntent,
  manualAddLabel,
  manualAddSeed,
  universalInput,
} from './universal-input';

/**
 * The list-row vocabulary, copied verbatim from `sheet/elsewhere-section.tsx` where the same two
 * strings define every navigational row in the product. Copied rather than imported because that
 * file does not export them and it is outside this task's path scope — **the right end state is one
 * exported pair**, and this comment is the note asking for it rather than a third row style
 * pretending to be a new idea.
 *
 * (`CollectionsNavRow` matched them by hand and was the third wearer of this pair. It was deleted
 * on 2026-08-31 — the drawer's `Places / Collections` switch reaches the same view from the top of
 * the same column — so the count is two.)
 */
const LEADING_SLOT = 'flex size-8 shrink-0 items-center justify-center';
// The bare `transition-colors` this used to carry is gone, replaced by `PRESS_ROW` — which is
// `button.tsx`'s own move. `PRESS_BEAT`'s `motion-safe:transition` carries colour *and* transform
// on one declaration with one duration, so an un-prefixed `transition-colors` beside it did
// nothing but run the hover fade for users who had asked for reduced motion. The press itself is
// the matrix's missing column: every row in this sheet is a target a thumb lands on, and none of
// them acknowledged the landing.
const ROW_BASE = `flex w-full items-center gap-3 rounded-lg py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 ${PRESS_ROW}`;

export type AddPane = 'menu' | 'place' | 'collection';

/** A saved place that matches what is typed. Supplied by the caller, already filtered and already
 *  ordered — this surface renders the list it is given and never re-sorts it. `secondary` is the
 *  `Category · City` line the rest of the product uses; `null` renders a single-line row. */
export interface AddSheetResult {
  readonly id: string;
  readonly name: string;
  readonly secondary: string | null;
}

export interface AddSheetProps {
  readonly open: boolean;
  /** Called with `false` for every dismissal path — swipe, backdrop, Escape, close button. The
   *  caller decides what "closed" means; this component never closes itself. */
  readonly onOpenChange: (open: boolean) => void;

  /**
   * Which pane a *fresh* open starts on. `'menu'` — the `＋` behaviour, and the default.
   *
   * It is a prop for one caller only: focusing the map's search field is also supposed to raise
   * this sheet, and landing that on the menu would make the user choose "add a place" before they
   * could type the thing they were already typing. That is an entry point, not per-route
   * behaviour: `＋` passes nothing and always gets the menu.
   */
  readonly initialPane?: AddPane;

  // — the `place` pane —
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly results: readonly AddSheetResult[];
  readonly onSelectResult: (id: string) => void;
  /** The link, already extracted from whatever surrounded it and already accepted by
   *  `canonicaliseTikTokUrl`. Never the raw field contents. */
  readonly onSubmitTikTok: (url: string) => void;
  /** `text` is the name to start from and may be `''` — the row is offered whatever is in the
   *  field, including nothing. */
  readonly onAddManually: (text: string) => void;
  /** Something the caller started is still running. Disables the submit affordances rather than
   *  the field, so a slow import never eats what someone is typing. */
  readonly placeBusy?: boolean;
  /** One line from the caller, under the field. This component produces no errors of its own
   *  beyond the clipboard hint. */
  readonly placeError?: string | null;

  // — the `collection` pane —
  /** Presentational only: this file never calls the `createCollection` server action. The caller
   *  runs it, sets `collectionPending`, and closes the sheet (or sets `collectionError`). */
  readonly onCreateCollection: (name: string) => void;
  readonly collectionPending?: boolean;
  readonly collectionError?: string | null;
}

/**
 * Which pane the sheet shows after `open` changes.
 *
 * Reopening resets to the entry pane; **closing does not**, because the drawer animates out and
 * flipping the content back to the menu mid-slide would show the user a pane they never asked for
 * on the way past. Exported because it is the whole reset rule, and it is the one piece of the
 * shell that a node-environment test can reach.
 */
export function paneOnOpenChange(current: AddPane, open: boolean, entry: AddPane): AddPane {
  return open ? entry : current;
}

export function AddSheet(props: AddSheetProps) {
  const { open, onOpenChange, initialPane = 'menu' } = props;

  // `lastOpen` in state rather than a ref so the reset is computed during render, per React's own
  // "adjusting some state when a prop changes" pattern — the same shape `PlaceSheet` uses for its
  // snap restore.
  const [state, setState] = useState<{ pane: AddPane; lastOpen: boolean }>({
    pane: initialPane,
    lastOpen: open,
  });
  if (open !== state.lastOpen) {
    setState({ pane: paneOnOpenChange(state.pane, open, initialPane), lastOpen: open });
  }

  const setPane = (pane: AddPane) => setState((s) => ({ ...s, pane }));
  const close = () => onOpenChange(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      // Modal, unlike `PlaceSheet`: this sheet is a task with a backdrop, and while it is up the
      // map behind it is not something to interact with. That also means Radix's own dismissal —
      // Escape, and a pointer-down on the overlay — *is* the backdrop-tap requirement, already
      // implemented and already correct, rather than a tap-catcher of our own.
      modal
      // Vaul defaults this to `false`, which leaves focus on the `＋` inside a modal dialog. Each
      // pane also moves focus explicitly on mount; this covers the frame before that runs.
      autoFocus
      // Swipe-down-to-dismiss, from any pane. Vaul's own gesture arbitration handles the rest: a
      // drag that starts on a field or on the results list is not a sheet drag
      // (`data-vaul-no-drag` below).
      dismissible
    >
      <Drawer.Portal>
        {/* The backdrop. Compositor-only (`opacity`), painted by vaul's own enter/exit animation,
            and the map keeps rendering underneath it — nothing here unmounts or resizes the
            canvas, so there is no re-render storm behind the sheet. */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Drawer.Content
          data-testid="add-sheet"
          data-pane={state.pane}
          // `h-auto` + `max-h`: the sheet is exactly as tall as its content, so the menu is two
          // rows rather than a half-screen of nothing. `85dvh` is the ceiling once a results list
          // is long, and `dvh` survives the mobile URL bar with no JS and no resize listener.
          className="fixed inset-x-0 bottom-0 z-50 flex h-auto max-h-[85dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-[var(--shadow-elevated)] outline-none"
        >
          <Drawer.Handle className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />
          <PaneSwitch pane={state.pane}>
            {state.pane === 'menu' && (
              <AddMenu
                Title={Drawer.Title}
                onClose={close}
                onChoosePlace={() => setPane('place')}
                onChooseCollection={() => setPane('collection')}
              />
            )}
            {state.pane === 'place' && (
              <AddPlacePane
                Title={Drawer.Title}
                onClose={close}
                {...(initialPane === 'menu' ? { onBack: () => setPane('menu') } : {})}
                value={props.value}
                onValueChange={props.onValueChange}
                results={props.results}
                onSelectResult={props.onSelectResult}
                onSubmitTikTok={props.onSubmitTikTok}
                onAddManually={props.onAddManually}
                busy={props.placeBusy ?? false}
                error={props.placeError ?? null}
              />
            )}
            {state.pane === 'collection' && (
              <NewCollectionPane
                Title={Drawer.Title}
                onClose={close}
                {...(initialPane === 'menu' ? { onBack: () => setPane('menu') } : {})}
                onCreateCollection={props.onCreateCollection}
                pending={props.collectionPending ?? false}
                error={props.collectionError ?? null}
              />
            )}
          </PaneSwitch>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The pane change, which is the medium tier of the motion scale (`lib/interaction.ts`).
 *
 * `opacity` and `transform` only — nothing here triggers layout, and nothing here animates the
 * drawer's own height, because vaul measures the content to compute its drag geometry and an
 * animating height would move the target under the user's thumb.
 *
 * `ENTER_SURFACE`: 220 ms on the emphasised curve, fading and shifting 8px in from the trailing
 * edge. Sideways rather than upward because inside a drawer the vertical axis belongs to the
 * drawer, and a pane that also rises fights the surface carrying it. Under
 * `prefers-reduced-motion` the shift drops and the fade stays, which is §3a's *"collapse to the
 * opacity change, not to nothing"* — this fires alongside a focus move, and a 220 ms cross-fade
 * carries none of the vestibular risk a translate does.
 *
 * ## This was two Motion components and a hook, and dropping them is the point
 *
 * It rendered a `<motion.div>` whose `initial`/`animate` came from `useReducedMotion()`. Three
 * things go away with it:
 *
 *  1. **`motion/react` leaves `/map`'s bundle.** This file was its only importer on that route —
 *     `chrome-motion.ts` is imported by nothing in `src/` any more and `sign-in/page.tsx` is a
 *     different entry. Measured below in the task's report, not asserted here.
 *  2. **A render-time branch on a device preference.** `useReducedMotion()` reads `matchMedia`
 *     synchronously on the client and returns `false` on the server; `chrome-motion.ts`'s header
 *     records what that cost on `/sign-in` — two renders emitting different `style` attributes and
 *     React logging a hydration mismatch on the product's front door, for reduced-motion users
 *     only. This tree is portalled and never server-rendered, so it did not have that bug; it had
 *     the shape of it, which is the thing worth removing.
 *  3. **A fourteenth duration.** `0.14` written as a JavaScript number is not on the closed list
 *     and no guard could see it. It is now `--duration-base` by name.
 *
 * The exit is still a straight replacement rather than an animation, and that has not changed:
 * `key` alone gives the remount and the enter, which is the half a user perceives. It used to be
 * an `<AnimatePresence mode="wait">` and it did not work — measured in a browser, not reasoned.
 * Choosing `Add a place` set `state.pane` correctly (`data-pane="place"`) while the rendered child
 * stayed the menu, settled at `opacity: 1; transform: none`, indefinitely: the old pane never
 * exited, so under `mode="wait"` the new one never mounted. The create menu's only two actions
 * were both dead. `LEAVE_SURFACE` exists in the vocabulary for surfaces that can hold a leaving
 * element mounted; this one cannot, and an exit animation on a pane change is not worth a state
 * machine that can strand the whole feature.
 */
function PaneSwitch({ pane, children }: { pane: AddPane; children: ReactNode }) {
  return (
    <div key={pane} className={cn('flex min-h-0 flex-col', ENTER_SURFACE)}>
      {children}
    </div>
  );
}

/** Every pane's top row: back (when there is somewhere to go back to), the heading that gives the
 *  dialog its accessible name, and close. One component so the three panes cannot drift into three
 *  headers. */
function PaneHeader({
  Title,
  title,
  onBack,
  onClose,
}: {
  Title: ElementType;
  title: string;
  onBack?: (() => void) | undefined;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus lands on the heading of whichever pane just arrived, unless that pane has a field to
  // type in — those take it back on their own mount effect, which runs after this one.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex items-center gap-1 px-3 pt-2">
      {onBack !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={onBack}
          data-vaul-no-drag
          className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
      )}
      <Title
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          'flex-1 font-heading text-lg font-extrabold tracking-tight text-foreground outline-none',
          onBack === undefined && 'pl-2',
        )}
      >
        {title}
      </Title>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Close"
        onClick={onClose}
        data-vaul-no-drag
        className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

export const MENU_TITLE = 'Create';

/**
 * The menu pane — the two things `＋` can make, as rows rather than as buttons.
 *
 * Rows, because that is the vocabulary the rest of the product uses for "pick one of these"
 * (`ElsewhereSection`), and because a row can carry the second line that makes the choice obvious
 * without a tooltip. Two big buttons would have been a third pattern for the same job.
 */
export function AddMenu({
  Title = 'h2',
  onClose,
  onChoosePlace,
  onChooseCollection,
}: {
  Title?: ElementType;
  onClose: () => void;
  onChoosePlace: () => void;
  onChooseCollection: () => void;
}) {
  return (
    <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <PaneHeader Title={Title} title={MENU_TITLE} onClose={onClose} />
      <ul className="flex flex-col px-4 pt-1">
        <MenuRow
          icon={<MapPin className="size-4 text-muted-foreground" aria-hidden />}
          label="Add a place"
          hint="From a TikTok link, or by name"
          onSelect={onChoosePlace}
        />
        <MenuRow
          icon={<Library className="size-4 text-muted-foreground" aria-hidden />}
          label="Create a collection"
          // Not "Group places into a list you can share": `voice-and-vocabulary.md` §3 has one word
          // for this thing and it is the one in the label above, so the hint's job is the fact the
          // label leaves out — that it can be shared.
          hint="Places you can share"
          onSelect={onChooseCollection}
        />
      </ul>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        data-vaul-no-drag
        className={cn(ROW_BASE, 'min-h-14')}
      >
        <span className={LEADING_SLOT} aria-hidden>
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-heading text-sm font-bold text-foreground">{label}</span>
          <span className="text-xs font-medium text-muted-foreground">{hint}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

export const PLACE_TITLE = 'Add a place';
/**
 * The two lines shown against a link we recognised and cannot read (W1-5).
 *
 * Read from `IMPORT_ERROR_COPY` rather than written out, because `/import` already ships this exact
 * news and growth defect G4 was, at root, two surfaces disagreeing about one URL. A literal here
 * would be a third wording waiting to drift. The entry's `kicker` ("Not TikTok") is deliberately
 * not carried across: this sheet has no kicker slot, and adding one for a two-line notice would be
 * a new component in a package whose exit criterion needs none.
 */
const UNSUPPORTED_HOST_COPY = IMPORT_ERROR_COPY.UNSUPPORTED_HOST;

const FIELD_LABEL = 'Paste a TikTok link or search your places';
const FIELD_PLACEHOLDER = 'Paste a link, or search';

/**
 * Why the clipboard button says nothing on success and one quiet line on failure.
 *
 * `navigator.clipboard.readText` does not exist in Firefox and is permission-gated in Safari, so
 * this button cannot be assumed to work. It is still rendered unconditionally: feature-detecting at
 * render time would mean either a hydration mismatch (the server cannot know) or a `useEffect`
 * flicker, and the failure is cheap — the field is left exactly as it was and the user long-presses
 * to paste as they always have. What is not acceptable is a fake success, so there is no toast, no
 * tick and no "Pasted!" that fires when nothing was read.
 */
type PasteHint = 'none' | 'unavailable' | 'empty' | 'narrowed';

const PASTE_HINT_COPY: Record<Exclude<PasteHint, 'none'>, string> = {
  unavailable: 'Couldn’t read your clipboard — paste into the field instead.',
  empty: 'Nothing on your clipboard yet.',
  narrowed: 'Took the link out of what you pasted.',
};

export interface AddPlacePaneProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly results: readonly AddSheetResult[];
  readonly onSelectResult: (id: string) => void;
  readonly onSubmitTikTok: (url: string) => void;
  readonly onAddManually: (text: string) => void;
  readonly onClose: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly busy?: boolean;
  readonly error?: string | null;
  /** The element that carries the heading. `AddSheet` passes `Drawer.Title`, which is what gives
   *  the dialog its accessible name; the default is a plain `<h2>` so this pane renders — and can
   *  be asserted — outside a dialog. */
  readonly Title?: ElementType;
}

export function AddPlacePane({
  value,
  onValueChange,
  results,
  onSelectResult,
  onSubmitTikTok,
  onAddManually,
  onClose,
  onBack,
  busy = false,
  error = null,
  Title = 'h2',
}: AddPlacePaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteHint, setPasteHint] = useState<PasteHint>('none');
  const hintId = useId();
  const listId = useId();

  const input = universalInput(value);
  const isLink = input.kind === 'tiktok';
  /**
   * A link we recognised and cannot read (W1-5, growth defect G4). Kept separate from `isLink`
   * deliberately: widening `isLink` would put `Add this TikTok link` under an Instagram URL, which is
   * the opposite of the news this state exists to deliver.
   */
  const unsupportedLink = input.kind === 'unsupported-link';
  // A link is not a search term. "Nothing you've saved matches https://vm.tiktok.com/…" would be a
  // true statement nobody asked for, so the results list is simply not the answer to a link —
  // including one we cannot read, which is still a link and still not a search term.
  const shownResults = isLink || unsupportedLink ? [] : results;
  const firstResultId = shownResults[0]?.id ?? null;

  // The pane mounts when it is entered, so mount *is* "the user just came here". After
  // `PaneHeader`'s own focus move, which runs first (child effects before parent effects).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function submit() {
    if (busy) return;
    const intent = addSubmitIntent(input, firstResultId);
    switch (intent.kind) {
      case 'none':
        return;
      case 'tiktok':
        onSubmitTikTok(intent.url);
        return;
      case 'select':
        onSelectResult(intent.id);
        return;
      case 'manual':
        onAddManually(intent.text);
        return;
    }
  }

  async function pasteFromClipboard() {
    setPasteHint('none');

    // SSR and Firefox both land here. `?.` on `readText` rather than on `clipboard` alone: the
    // object exists in Firefox, the method does not.
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.readText !== 'function') {
      setPasteHint('unavailable');
      return;
    }

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Permission refused, or a gesture the browser did not accept as trusted. The field is left
      // exactly as the user left it.
      setPasteHint('unavailable');
      return;
    }

    if (text.trim() === '') {
      setPasteHint('empty');
      return;
    }

    // What TikTok's share sheet copies is `caption … link … #hashtags`. Narrowing it to the link is
    // the same rule the `/import` field applies on paste, and the hint says so — a field that
    // silently shows something other than what was on the clipboard is a field the user cannot
    // trust.
    const pasted = universalInput(text);
    const next = pasted.kind === 'tiktok' ? pasted.url : text.trim();
    onValueChange(next);
    setPasteHint(pasted.kind === 'tiktok' && next !== text.trim() ? 'narrowed' : 'none');
    inputRef.current?.focus({ preventScroll: true });
  }

  const hint = pasteHint === 'none' ? null : PASTE_HINT_COPY[pasteHint];

  return (
    <div className="flex min-h-0 flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <PaneHeader Title={Title} title={PLACE_TITLE} onBack={onBack} onClose={onClose} />

      {/* A real `<form>`, so Enter on a keyboard and Go on a phone both do the thing. Backlog item
          2.1 is that the import field had neither; `addSubmitIntent` is that contract, and it is
          asserted without a DOM. */}
      <form
        data-vaul-no-drag
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2 px-5"
      >
        <div className="relative">
          {/*
            **The leading glyph is state, not decoration**, and that is the whole reason a platform
            mark is allowed to be here at all.

            This field is a search box at least as often as it is a link box — it takes a TikTok
            link, a place name, or a query against your own library, which is why the resting glyph
            is `Search`. A platform mark pinned here permanently would claim the field only accepts
            one of the three, which is a false affordance.

            So it swaps on `isLink`, which is `input.kind === 'tiktok'` — the same value that
            decides whether the submit button below exists. The field is saying *I recognise this
            as a TikTok link*, at the moment it becomes true, and the two halves of that moment
            cannot disagree because they read one boolean. An Instagram or YouTube URL is a
            different `kind` and takes the `unsupportedLink` branch, so it never gets this mark —
            which is the same fence the failure screen's `open_link` carries.

            **`text-brand`, where the paste screen's copy of this glyph is `text-muted-foreground`,
            and the difference is exactly the argument.** There the mark is a constant affordance
            and a saturated glyph would read as a state the field is in; here it *is* the state.
          */}
          {isLink ? (
            <PlatformMark className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand" />
          ) : (
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          )}
          <Input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
              setPasteHint('none');
            }}
            aria-label={FIELD_LABEL}
            placeholder={FIELD_PLACEHOLDER}
            {...(hint !== null || error !== null ? { 'aria-describedby': hintId } : {})}
            {...(shownResults.length > 0 ? { 'aria-controls': listId } : {})}
            // A field that might hold a URL: autocapitalising it, autocorrecting it or underlining
            // it in red are a phone keyboard trying to help with something it cannot help with.
            // `inputMode` stays `text` rather than `url` because this field is a search box at
            // least as often as it is a link box, and a URL keyboard has no space bar.
            inputMode="text"
            enterKeyHint="go"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            // Not `type="search"`: WebKit's own clear "×" is a 12 px target sitting exactly where
            // the buttons below live, and it is invisible in dark mode.
            type="text"
            dir="auto"
            className={cn(
              'h-12 rounded-lg border-2 border-input pl-10 text-base font-medium',
              value === '' ? 'pr-14' : 'pr-24',
            )}
          />

          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {value !== '' && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear"
                onClick={() => {
                  onValueChange('');
                  setPasteHint('none');
                  inputRef.current?.focus({ preventScroll: true });
                }}
                className="size-10 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
            {/* Inside the field, because the thing it fills is the field. One tap is the point —
                the alternative is long-press, wait, choose Paste. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Paste from clipboard"
              onClick={() => void pasteFromClipboard()}
              className="size-10 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ClipboardPaste className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        {/* One slot for both lines so they can never stack into a two-line shove of the list.
            `role="status"` because the clipboard hint arrives without the user looking for it. */}
        {unsupportedLink ? (
          /*
           * The recognised redirect (`brand-and-product-foundation.md` §1): we know what this link
           * is, we cannot read it, and the next move is the manual-add row already below. Muted and
           * `role="status"`, never `text-destructive` or `role="alert"` — **nothing failed here**,
           * and dressing a boundary as an error is how a product teaches users it is broken.
           *
           * Both strings are read from `IMPORT_ERROR_COPY.UNSUPPORTED_HOST` rather than written
           * again, so this surface and `/import` cannot drift into two wordings for one piece of
           * news — which is exactly the defect G4 turned out to be.
           */
          <p id={hintId} role="status" className="text-sm font-medium text-muted-foreground">
            <span className="block text-foreground">{UNSUPPORTED_HOST_COPY.headline}</span>
            {UNSUPPORTED_HOST_COPY.body}
          </p>
        ) : (
          (error !== null || hint !== null) && (
            <p
              id={hintId}
              role="status"
              className={cn(
                'text-sm font-medium',
                error !== null ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {error ?? hint}
            </p>
          )
        )}

        {/* The primary action, and only when there is something to be primary about. A disabled
            "Add" under an empty field is a promise the screen cannot keep; with a link in the box
            this is the one obvious next step. */}
        {isLink && (
          <Button
            type="submit"
            disabled={busy}
            className="h-12 w-full gap-2 rounded-lg text-base font-bold"
          >
            {/* The solid weight, because this is a primary mint button that adds a TikTok link —
                the same role `place-sheet.tsx` and `place-desktop-panel.tsx` carry, and the arm the
                map's `＋` actually routes through. `platform-mark.test.ts` enumerates the three, so
                a fourth surface reaching for the heavy weight fails rather than ships.

                Not while `busy`: `Adding…` is a progress state and the glyph would sit beside a
                sentence about our own machinery rather than about the platform. */}
            {!busy && <PlatformMark variant="solid" className="size-5" />}
            {busy ? 'Adding…' : 'Add this TikTok link'}
          </Button>
        )}
      </form>

      <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto px-4">
        {shownResults.length > 0 && (
          <ul id={listId} aria-label="Matching places">
            {shownResults.map((result) => (
              <li key={result.id} className="border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelectResult(result.id)}
                  className={cn(ROW_BASE, 'min-h-14')}
                >
                  <span className={LEADING_SLOT} aria-hidden>
                    <MapPin className="size-4 text-muted-foreground" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {/* `<bdi>` so a Hebrew name inside this LTR row keeps its own direction
                        without dragging the row's alignment with it. */}
                    <span className="line-clamp-1 font-heading text-sm font-bold text-foreground">
                      <bdi>{result.name}</bdi>
                    </span>
                    {result.secondary !== null && (
                      <span className="line-clamp-1 text-xs font-medium text-muted-foreground">
                        <bdi>{result.secondary}</bdi>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Only when a search actually came back empty — not under an empty field, where "nothing
            matches" would be reporting on a question nobody has asked. */}
        {input.kind === 'text' && shownResults.length === 0 && (
          <p className="py-2 text-sm font-medium text-muted-foreground">
            Nothing you’ve saved matches that.
          </p>
        )}

        {/* Always present, under everything else: the way in for a place that never came from a
            TikTok. Last row rather than a second primary button because in the common case the
            list above it is the answer. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAddManually(manualAddSeed(input))}
          data-vaul-no-drag
          className={cn(
            'mt-1 flex min-h-12 w-full items-center gap-2 rounded-lg px-1 text-left text-sm font-bold text-brand outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
            PRESS_ROW,
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span className="line-clamp-1">{manualAddLabel(input)}</span>
        </button>
      </div>
    </div>
  );
}

export const COLLECTION_TITLE = 'New collection';

export interface NewCollectionPaneProps {
  /** Presentational only. The caller owns `createCollection`; this pane hands it a name. */
  readonly onCreateCollection: (name: string) => void;
  readonly onClose: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly Title?: ElementType;
}

/**
 * One field and one button, matching the inline compose form on `/collections` — same label, same
 * placeholder, same 80-character limit taken from the domain rather than retyped, so the two
 * entry points to the same table cannot disagree about what a name is.
 *
 * `autoCapitalize="sentences"` here and `off` on the place field above: this one is a title
 * someone is writing, not a link they are pasting.
 */
export function NewCollectionPane({
  onCreateCollection,
  onClose,
  onBack,
  pending = false,
  error = null,
  Title = 'h2',
}: NewCollectionPaneProps) {
  const [name, setName] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);

  const canSubmit = !pending && name.trim().length > 0;

  return (
    <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <PaneHeader Title={Title} title={COLLECTION_TITLE} onBack={onBack} onClose={onClose} />
      <form
        data-vaul-no-drag
        className="flex flex-col gap-2 px-5 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onCreateCollection(name.trim());
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
          Name this collection
        </label>
        <Input
          id={fieldId}
          ref={fieldRef}
          dir="auto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Tel Aviv food"
          enterKeyHint="done"
          autoCapitalize="sentences"
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          aria-invalid={error !== null}
          {...(error !== null ? { 'aria-describedby': errorId } : {})}
          className="h-12 rounded-lg border-2 border-input px-4 text-base font-medium"
        />
        {error !== null && (
          <p id={errorId} role="alert" className={cn('text-sm font-medium text-destructive', ENTER_NEWS)}>
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 h-12 w-full rounded-lg text-base font-bold"
        >
          {pending ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </div>
  );
}
