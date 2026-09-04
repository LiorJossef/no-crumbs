'use client';

/**
 * **Type a sentence, see what it would do, then decide.** `docs/nls-plan.md` §3, Stage 1.
 *
 * The model proposes; only the user changes the result set. This surface is the whole of that
 * sentence: an entry control, one input with **no live behaviour at all**, one explicit submit, a
 * preview of the filters the sentence resolved to with a count of what they would leave, and a
 * `Show these` that writes the four filter cells `map-page-client.tsx` already owns.
 *
 * **There is one button, and it becomes the next step.** `Find places` turns into
 * `Show these · {n} places` in the same place at the same size once an answer is back, and turns
 * back the moment the sentence is edited — the input's `onChange` already returns the panel to
 * `idle`, so re-running needs no control of its own and no string that §3.4 does not have. Two
 * presses are still two presses, deliberately: the preview between them is the only moment the
 * user sees what the model decided before it reshapes their library, and §4.3 grades the feature
 * on it. What was removed is the second press's cost, not the press.
 *
 * ## Why it is a separate surface rather than a mode on the search field
 *
 * The existing `PlaceSearchField` filters on every keystroke, literally, with zero latency, and it
 * is untouched. Owner ruling 2026-09-04 (`nls-plan.md` §7.4): one control with two rules — live
 * while typing, interpretive on Enter — is unreadable, and on a phone the keyboard's Search key
 * would be actively lying about what it does. So this input has **no** keystroke behaviour, which
 * is the entire reason it is a different box. Submit is a real button; Return submits on the
 * desktop popover only, where there is no second behaviour to collide with (§3.3).
 *
 * ## The second clamp lives here, and it is the design
 *
 * `domain/search/intent.ts` clamps server-side against the vocabulary the client sent. This file
 * clamps **again**, against the facets that are live in this render, before anything is drawn —
 * `clampToLibrary`. It is not belt-and-braces: it is what makes every chip on screen have rows
 * behind it, and it is why prompt injection is structurally inert. The model's whole output space
 * is four enums and one grounded string; a value with nothing behind it never reaches the screen.
 *
 * The area is the same rule taken one step further: the model never names a place at all, and the
 * *keyword it copied out of the user's own sentence* is resolved against the user's own saved
 * localities here. So an area chip cannot name anywhere the user has not saved something, for the
 * same structural reason a category chip cannot name a category they do not have.
 *
 * ## The preview count is an acceptance gate
 *
 * §4.3: *"The preview count always equals the number of places that appear after `Show these`. A
 * mismatch here is the feature lying."* It is guaranteed by construction rather than by care:
 * `previewCount` runs `filterByArea → filterByTag → filterByVisit → filterByCategory →
 * filterPlaces` over the same library, in the same order, with the same arguments the apply will
 * write. There is no second counting path, and `tests/unit/sheet/sentence-panel.test.ts` holds
 * the two to each other — including the area pass, which is the one that could most easily drift,
 * because it is the only cell the panel *derives* rather than copies out of the model's answer.
 *
 * The number counts the library narrowed by **every filter and no scope** — which is exactly what
 * the map's pins draw and what the page's existing results live region announces
 * (`useResultAnnouncement(query, activeTags, visitFilter, matches.length)`). The list is that same
 * set narrowed once more by the current scope, so quoting the list's length here would be quoting
 * a number the page never announces.
 *
 * ## One live region, and it is not a new one
 *
 * The interpretation is announced politely once while the panel is open (§3.5). On **apply** the
 * panel closes and the page's existing region reports the new count — deliberately not a second
 * region, because `ux-map-is-the-query.md` §7.1 records that a second one destroys the page for a
 * screen-reader user. The two never coexist: this region unmounts with the panel.
 *
 * ## What this file must never grow
 *
 * A camera move — **still, and now that Stage 2's first slice has landed the rule is worth more,
 * not less.** A resolved area is a set of the user's own rows, and where the camera goes when one
 * is applied is the page's decision, made in `applySentence` beside mover 4's own writes and
 * enumerated in that file's mover list (`nls-plan.md` §5.2). Nothing here moves anything: this
 * panel's only outputs are the five filter values it hands over, and
 * `map-page-client.tsx`'s rule stands unchanged — typing is not a camera mover.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Popover } from '@base-ui/react/popover';
import { MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlinePanel } from '@/components/ui/inline-menu';
import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import type { MapPlace } from '@/components/map/types';
import { filterByCategory } from '@/domain/places/category-filter';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import type { ProductCategory } from '@/domain/places/product-category';
import { isPrimaryCategory } from '@/domain/places/taxonomy';
import {
  areaLabel,
  filterByArea,
  resolveLocality,
  type SentenceArea,
} from '@/domain/search/locality-match';
import { cn } from '@/lib/utils';
import { ENTER_POPOVER, PRESS_CHIP } from '@/lib/interaction';
import { categoryDisplay } from '@/ui/place/category-display';
import { isSameTag } from '@/ui/place/tag-filter';
import { VISIT_FILTER_LABEL, type VisitFilter } from '@/ui/place/visit-state';
import { TRIGGER_TARGET, type FilterSurface } from './library-filter-bar';

/**
 * **Every string this surface says, fixed by `nls-plan.md` §3.4 and quoted verbatim.**
 *
 * The feature has **no visible name** and cannot acquire one here: `voice-and-vocabulary.md` §4
 * bans `AI`, `LLM` and `model` outright, "smart" is a euphemism for exactly those, and it is an
 * adjective about how good our own machinery is. The controls say what they do. `We think you
 * meant…` and `We understood…` are banned by the same rule — both editorialise about our own
 * certainty.
 *
 * The one deviation from the table, stated rather than hidden: the count pluralises
 * (`1 place` / `12 places`) instead of printing the template's `{n} places` literally at one. Every
 * other count in this product already pluralises — `areaRowCountText`, `profile-menu.tsx`,
 * `import-confirmation.tsx` — and `1 places` on the one screen that is about being careful with
 * words would read as a bug.
 */
export const SENTENCE_COPY = {
  entry: 'Find places from a sentence',
  placeholder: 'What are you looking for?',
  submit: 'Find places',
  inFlight: 'Reading…',
  show: 'Show these',
  applied: 'Filtered from what you typed.',
  undo: 'Undo',
  nothing: 'Nothing in your places matches that.',
  failed: 'Couldn’t do that just now.',
  retry: 'Try again',
} as const;

/** `12 places` / `1 place` / `no places` — §3.2's honest empty preview, in the noun the rest of the
 *  product already uses for the same rows. */
export function placesCountText(count: number): string {
  if (count === 0) return 'no places';
  return `${count} ${count === 1 ? 'place' : 'places'}`;
}

/**
 * The four filter cells, as values `map-page-client.tsx` can write directly.
 *
 * Deliberately **not** `SearchIntent`: an intent is what a model proposed, this is what this
 * product will execute. `tags` carries the library's *own* spelling of each tag rather than the
 * taxonomy key, because `setActiveTags` and every chip downstream speak stored strings.
 */
export interface SentenceApplication {
  readonly category: ProductCategory | null;
  readonly tags: readonly string[];
  readonly visit: VisitFilter;
  readonly query: string;
  /**
   * **One of the user's own areas, when the keyword turned out to be the name of one**
   * (`nls-plan.md` §5, Stage 2). `null` is the ordinary case and means the keyword stayed text.
   *
   * It is a *filter* and not a scope, and that is load-bearing: the preview count is the library
   * narrowed by every filter and **no** scope, and the map's pins ignore the scope entirely, so an
   * area expressed as a scope would make this panel promise a number neither surface shows. §4.3
   * is what that would break.
   */
  readonly area: SentenceArea | null;
}

/** The application that filters nothing — what an unreadable answer and a fully clamped one both
 *  collapse to. One "nothing understood" state, not two. */
export const EMPTY_APPLICATION: SentenceApplication = {
  category: null,
  tags: [],
  visit: 'all',
  query: '',
  area: null,
};

export function isEmptyApplication(application: SentenceApplication): boolean {
  return (
    application.category === null &&
    application.tags.length === 0 &&
    application.visit === 'all' &&
    application.query.trim() === '' &&
    application.area === null
  );
}

/**
 * **The facets that are live in this render** — the second clamp's whole input.
 *
 * `categories` and `visit` are the values that have rows behind them right now; `tags` are the
 * library's own stored tag strings. Computed on the page, from the same library the filters run
 * over, so the window where the library changed between the server's clamp and this one is closed.
 */
export interface LibraryFacets {
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly visit: readonly string[];
}

/** The raw intent the route returns, as this surface reads it. Every field optional and unknown-ish
 *  on purpose: it has crossed a network and nothing about it is guaranteed. */
export interface InterpretedIntent {
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly visit?: string;
  readonly keyword?: string | null;
}

/**
 * **The second clamp.** An intent in, only what this library can execute out.
 *
 * A category absent from the facets, a tag absent from the tag list, a visit state with no rows —
 * each is dropped before it can become a chip. Tags are matched with `isSameTag` (the same key
 * equality `filterByTag` uses) and the **facet's** spelling is what survives, so the chip, the
 * filter and the pill above the list all name the tag the same way.
 *
 * Pure, total, no React: the property "every chip has rows behind it" is a fact about this
 * function and is tested as one.
 */
export function clampToLibrary(
  intent: InterpretedIntent | null | undefined,
  facets: LibraryFacets,
  places: readonly MapPlace[],
): SentenceApplication {
  if (intent === null || intent === undefined) return EMPTY_APPLICATION;

  const rawCategory = typeof intent.category === 'string' ? intent.category : null;
  const category =
    rawCategory !== null && isPrimaryCategory(rawCategory) && facets.categories.includes(rawCategory)
      ? rawCategory
      : null;

  const tags: string[] = [];
  for (const raw of intent.tags ?? []) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const live = facets.tags.find((candidate) => isSameTag(candidate, raw));
    if (live === undefined || tags.some((kept) => isSameTag(kept, live))) continue;
    tags.push(live);
  }

  const rawVisit = typeof intent.visit === 'string' ? intent.visit : 'all';
  const visit: VisitFilter =
    (rawVisit === 'been' || rawVisit === 'not-been') && facets.visit.includes(rawVisit)
      ? rawVisit
      : 'all';

  const query = typeof intent.keyword === 'string' ? intent.keyword.trim() : '';

  /**
   * **The keyword gets one question asked of it before it is used as text: is it the name of
   * somewhere this user has saved places?** (`nls-plan.md` §5.1.)
   *
   * `resolveLocality` answers against the library and nothing else — no geocoder, no gazetteer,
   * no provider — so it can only ever name an area the user already has, and `null` is a real
   * answer meaning *this is not a place name here*, which leaves the keyword as text.
   *
   * When it resolves, the keyword **moves**: `query` is blanked and the area carries the
   * narrowing. Leaving both on would AND a substring match against the cluster and gut it — the
   * library stores four spellings of Tel Aviv, so `filterPlaces('tel aviv')` keeps 2 of the 25
   * rows the area holds, which is the exact defect this closes.
   */
  const match = resolveLocality(query, localityRows(places));
  const area: SentenceArea | null =
    match === null
      ? null
      : { label: match.label, typed: query, placeIds: match.memberIds };

  return { category, tags, visit, query: area === null ? query : '', area };
}

/** `MapPlace` as the least the resolver needs. The locality projection is the page's own —
 *  `place.detail?.locality` — so the areas this resolves to are the areas the map and the sheet
 *  already draw rather than a second clustering with its own opinion. */
function localityRows(places: readonly MapPlace[]) {
  return places.map((place) => ({
    id: place.id,
    locality: place.detail?.locality ?? null,
    lat: place.lat,
    lng: place.lng,
  }));
}

/**
 * **The preview count, computed by running the filters the apply will run.**
 *
 * The same four passes in the same order as `map-page-client.tsx:740-760`. Not a separate count
 * path, and it must never become one: §4.3 makes the equality an acceptance gate, and the only way
 * to hold two code paths to one number is to have one code path.
 */
export function previewCount(
  places: readonly MapPlace[],
  application: SentenceApplication,
): number {
  // The area pass runs **first**, the same position it holds on the page — five passes composing
  // as AND, so the order cannot change the result, but keeping them in one order keeps the two
  // readings of the chain comparable by eye.
  const byArea = filterByArea(places, application.area);
  const byTag = filterByTag(byArea, application.tags);
  const byVisit = filterByVisit(byTag, application.visit);
  const byCategory = filterByCategory(byVisit, application.category, (place) => place.category);
  return filterPlaces(byCategory, application.query).length;
}

/** One chip's worth of the interpretation: what axis it is on, and what it says. */
export interface InterpretationChip {
  readonly key: string;
  readonly label: string;
}

/** The interpretation as plain outline chips, in the order a person would say it: what kind of
 *  place, what it is like, whether you have been, and the words you used. */
export function interpretationChips(
  application: SentenceApplication,
): readonly InterpretationChip[] {
  const chips: InterpretationChip[] = [];
  if (application.category !== null) {
    chips.push({
      key: `category:${application.category}`,
      label: categoryDisplay(application.category).label ?? application.category,
    });
  }
  for (const tag of application.tags) {
    chips.push({ key: `tag:${tag}`, label: tagDisplayLabel(tag) });
  }
  if (application.visit !== 'all') {
    chips.push({ key: `visit:${application.visit}`, label: VISIT_FILTER_LABEL[application.visit] });
  }
  if (application.area !== null) {
    // The library's **own** spelling of the place, never a canonical string this product picked
    // (§5.3) — a library written `תל אביב-יפו` must not get a chip saying `Tel Aviv`. With no
    // plurality spelling to quote, `areaLabel` falls back to the user's own words.
    chips.push({ key: 'area', label: areaLabel(application.area) });
  }
  if (application.query.trim() !== '') {
    chips.push({ key: 'keyword', label: `“${application.query.trim()}”` });
  }
  return chips;
}

/**
 * What the panel announces, and what `Show these` is called.
 *
 * `Restaurant, Italian, not been yet. 12 places.` — the whole interpretation plus the count, once.
 * The button's accessible name is this sentence prefixed by its own visible text, so label-in-name
 * (WCAG 2.5.3) holds: the visible string `Show these` is contained in the spoken one.
 */
export function interpretationSentence(
  application: SentenceApplication,
  count: number,
): string {
  const chips = interpretationChips(application)
    .map((chip) => chip.label)
    .join(', ');
  return chips === '' ? placesCountText(count) : `${chips}. ${placesCountText(count)}.`;
}

/** What the panel is doing right now. Five states, exactly the five §3 names. */
export type PanelState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'result'; readonly application: SentenceApplication; readonly count: number }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'failed' };

/**
 * **What the panel's one button is right now.**
 *
 * Pure, because the property that matters is a property of the states rather than of the markup:
 * there is exactly one control, and it is the apply iff an interpretation is on screen. Held to
 * that in `tests/unit/sheet/sentence-panel.test.ts`, which cannot press a button.
 */
export function primaryAction(
  state: PanelState,
  sentence: string,
): {
  readonly kind: 'submit' | 'apply';
  readonly label: string;
  readonly count: number | null;
  readonly disabled: boolean;
} {
  if (state.kind === 'result') {
    return { kind: 'apply', label: SENTENCE_COPY.show, count: state.count, disabled: false };
  }
  return {
    kind: 'submit',
    label: state.kind === 'loading' ? SENTENCE_COPY.inFlight : SENTENCE_COPY.submit,
    count: null,
    // Disabled while the call is in the air, which is also what makes an impatient second press
    // on the same pixel harmless: it cannot reach the apply, because the apply does not exist yet.
    disabled: sentence.trim() === '' || state.kind === 'loading',
  };
}

export interface SentencePanelProps {
  /** Where this host draws floating things. Constant per host, never a `matchMedia` read at render
   *  time — both hosts are in the DOM at once behind CSS gates (`library-filter-bar.tsx`). */
  readonly surface?: FilterSurface;
  /** Inline only: the sheet is told a panel is about to want room in it, exactly as the filter
   *  axes do. At `half` the column leaves ~83 px for the list, which is not a panel and a list. */
  readonly onPanelOpen?: () => void;
  /** The whole library — what the preview count is computed over, and what the filters will run
   *  over after apply. */
  readonly places: readonly MapPlace[];
  /** The live facets, for the second clamp and for the vocabulary sent with the request. */
  readonly facets: LibraryFacets;
  /** Write the four cells and take the snapshot that `Undo` restores. The page owns both. */
  readonly onApply: (application: SentenceApplication) => void;
  readonly className?: string;
}

export function SentencePanel({
  surface = 'popover',
  onPanelOpen,
  places,
  facets,
  onApply,
  className,
}: SentencePanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  /** Abandon whatever is in the air. A user who closes the panel must not be paying for an answer
   *  nobody will read — the route composes this signal with the adapter's 6 s cap. */
  const abort = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const openPanel = useCallback(() => {
    onPanelOpen?.();
    setOpen(true);
  }, [onPanelOpen]);

  /** Closing, with focus. `MenuAxis` records why this is not optional on the inline surface: the
   *  panel is plain DOM that unmounts under the user's focus, and at 390×844 that left
   *  `document.activeElement` on `<body>` — the next Tab restarted from the top of the sheet. */
  const close = useCallback(() => {
    abort();
    setOpen(false);
    setState({ kind: 'idle' });
    triggerRef.current?.focus();
  }, [abort]);

  /** Closing without claiming focus — the press has already landed on whatever the user meant to
   *  touch. See `InlinePanel`'s `onOutsidePress`. */
  const dismiss = useCallback(() => {
    abort();
    setOpen(false);
    setState({ kind: 'idle' });
  }, [abort]);

  /** Focus moves to the input on open (§3.5). The popover surface also gets it from Base UI's own
   *  initial focus, and both are idempotent. */
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  /**
   * The one call, made by an explicit submit and by nothing else.
   *
   * No debounce, no cache, no gate: the owner's 2026-09-04 ruling deleted the whole "when do we
   * call?" subsystem from V1, leaving exactly one call per submit. A failure keeps the panel open
   * with the sentence still in it, so the user edits rather than retypes (§6.2) — which is why
   * nothing here clears `sentence`.
   */
  const submit = useCallback(async () => {
    const query = sentence.trim();
    if (query === '') return;
    abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/search/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          // The library's own vocabulary. The route sanitises it against the closed taxonomy
          // before its clamp reads it, so this is a claim rather than a grant.
          vocabulary: {
            categories: facets.categories,
            tags: facets.tags,
            visit: facets.visit,
            origins: [],
          },
        }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      const ok =
        typeof body === 'object' &&
        body !== null &&
        (body as { ok?: unknown }).ok === true &&
        response.ok;
      if (!ok) {
        // Every failure is one screen. Quota exhaustion is never mentioned to a user (§6.2), so
        // `rate-limited`, `quota`, `unavailable` and a dead network are deliberately the same
        // three words and the same `Try again`.
        setState({ kind: 'failed' });
        return;
      }
      const application = clampToLibrary(
        (body as { intent?: InterpretedIntent }).intent,
        facets,
        places,
      );
      if (isEmptyApplication(application)) {
        setState({ kind: 'nothing' });
        return;
      }
      setState({ kind: 'result', application, count: previewCount(places, application) });
    } catch (error) {
      // An abort is the user closing the panel or submitting again, not a failure to report.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ kind: 'failed' });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [abort, facets, places, sentence]);

  const apply = useCallback(
    (application: SentenceApplication) => {
      onApply(application);
      setOpen(false);
      setState({ kind: 'idle' });
      triggerRef.current?.focus();
    },
    [onApply],
  );

  /**
   * **Focus is contained while the panel is open, and Escape closes it — both on a *native*
   * listener rather than a React prop, because a React prop does not fire here.**
   *
   * Measured at 390×844 on this tree, and **it is `Tab` specifically, not every key** — an earlier
   * draft of this comment said "a keydown", which was wrong and was corrected once someone went and
   * measured it. `non-modal-drawer.tsx`'s `releaseTab()` swallows `Tab` before it reaches
   * `document`, where Next's App Router root holds React's delegated listener, and returns early
   * for every other key. That is deliberate: it exists to stop Radix's unconditional focus loop.
   *
   * So `onKeyDown` on this container never saw `Tab` — the first Tab out of the input landed on the
   * `Been` trigger, outside a panel §3.5 calls a dialog. A listener bound to the node itself sees
   * the event on the way past, one hop before the drawer swallows it. Escape *would* have worked
   * through a React prop; it is on the same native listener only because its partner is.
   *
   * The containment is Tab-wrapping only: no scroll lock and no scrim, because on the phone this
   * panel is part of the sheet's own column rather than a layer over it. The desktop popover also
   * has Base UI's `modal="trap-focus"`; the two are idempotent.
   */
  /**
   * **The node as state, not as a ref, because the popup does not exist yet when `open` flips.**
   *
   * Measured at 1280×900: an effect keyed on `open` ran with `bodyRef.current === null` — Base UI
   * portals the popup's children in a later pass — so the listener was never attached and Tab
   * walked straight out into the panel's filter bar. A callback ref re-renders exactly when the
   * node arrives and again when it leaves, which is the one thing that cannot be mistimed.
   */
  const [bodyNode, setBodyNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = bodyNode;
    if (!open || node === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // At `full` the sheet is a dialog and Escape would otherwise be read as "close the sheet",
        // throwing the user out of the panel they are typing in.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || node === null) return;
      /**
       * **Tabbability is read off the elements, not off their attributes.**
       *
       * `button:not([disabled])` was the obvious selector and it is wrong in this codebase:
       * `components/ui/button.tsx` renders through Base UI, which sets the `disabled` *property*
       * without writing the attribute, so the selector kept a `Find places` that cannot be
       * focused — the wrap anchored on an element the browser skips, and the first Tab left the
       * panel. `.disabled` and `tabIndex` are what the browser itself uses; `getClientRects()`
       * drops anything not rendered.
       */
      const focusable = [
        ...node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
      ].filter(
        (element) =>
          !(element as HTMLButtonElement).disabled &&
          element.tabIndex >= 0 &&
          element.getClientRects().length > 0,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    }
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [open, close, bodyNode]);

  /** The one button, decided in one place. */
  const action = primaryAction(state, sentence);

  const body = (
    <div
      ref={setBodyNode}
      className="flex flex-col gap-2 p-2"
      // Inside a vaul drawer a press that begins here would be read as the start of a sheet drag
      // and the tap swallowed — the same attribute every row and every field in the sheet carries.
      data-vaul-no-drag
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          /*
           * **Return submits on the popover surface only** (§3.3). This input has no second
           * behaviour to collide with, so a desktop Return is safe here in a way the rejected
           * design in §7.4 was not. On the phone the keyboard's key is left alone: `Find places`
           * is a real button, and a `Search`-labelled key that means "interpret my sentence" is
           * the lie that ruling was made against.
           *
           * It does whatever the one button below currently is — so a desktop user who reads the
           * interpretation and presses Return again applies it rather than paying for the same
           * call twice. One control, one key, one meaning at a time.
           */
          if (surface !== 'popover') return;
          if (state.kind === 'result') apply(state.application);
          else void submit();
        }}
      >
        <Input
          ref={inputRef}
          type="text"
          value={sentence}
          onChange={(event) => {
            setSentence(event.target.value);
            // **Nothing filters as you type, and nothing is even remembered from the last answer.**
            // A stale interpretation under an edited sentence would be a preview of a question
            // nobody asked.
            if (state.kind !== 'idle' && state.kind !== 'loading') setState({ kind: 'idle' });
          }}
          // **Logical, from the first line.** `dir="auto"` means a Hebrew sentence lays itself out
          // right-to-left without a mode to set, and the padding below is `ps-`/`pe-` rather than
          // the existing field's physical `left-4` / `right-1.5` (§6.2's RTL row).
          dir="auto"
          enterKeyHint={surface === 'popover' ? 'search' : 'enter'}
          aria-label={SENTENCE_COPY.placeholder}
          placeholder={SENTENCE_COPY.placeholder}
          className="h-11 rounded-lg px-3 text-start text-sm font-medium"
        />
        {state.kind === 'result' && (
          /* Plain outline chips (§3.1), **directly above the control they explain** — the reading
             order is the sentence you typed, what it became, and the one thing to do about it.
             Never the active filter pill: that pill means "this is on", and an offer wearing it
             would be lying about state before the user agreed to anything (§7.5 rule 3). */
          <ul className="flex flex-wrap gap-1.5 px-0.5">
            {interpretationChips(state.application).map((chip) => (
              <li
                key={chip.key}
                dir="auto"
                className="flex h-7 items-center rounded-full border border-border/70 px-2.5 text-xs font-medium text-foreground"
              >
                {chip.label}
              </li>
            ))}
          </ul>
        )}

        <Button
          /**
           * **One control that becomes the next step, rather than two controls to choose between.**
           *
           * Owner, 2026-09-04: *"im not sure that the fact the user should click 2 times (one find,
           * one apply) is a good behavior."* The two presses stay — the preview between them is
           * what stops a wrong interpretation silently reshaping the library, and §4.3 grades this
           * feature on it. What was removed is the *cost* of the second one. Until now `Find
           * places` stayed filled and primary after an answer came back and `Show these` was added
           * below it as an outline button, so the loudest control on the panel was the one that
           * would merely re-run the same call, and the finger had to travel past it to a weaker
           * target. Now the same button, in the same place, at the same size, becomes
           * `Show these · {n} places`: the second press lands where the first one left.
           *
           * **`type="button"`, and that is what keeps Return off this surface on a phone.** As
           * `type="submit"` the browser fires a *click* on it for an implicit form submission, so
           * Return in the input reached this handler and submitted — measured at 390×844, past the
           * `surface === 'popover'` guard on the form, which is exactly the behaviour §3.3
           * forbids. As a plain button the implicit submission still raises the form's `submit`
           * event, where the guard is, and nothing else runs.
           */
          type="button"
          onClick={() => (state.kind === 'result' ? apply(state.application) : void submit())}
          disabled={action.disabled}
          // The whole interpretation, so label-in-name holds: the visible `Show these` is the
          // first thing in the spoken name. Idle needs none — its visible text is its name.
          {...(state.kind === 'result'
            ? {
                'aria-label': `${SENTENCE_COPY.show}: ${interpretationSentence(
                  state.application,
                  state.count,
                )}`,
              }
            : {})}
          className={cn(
            'h-11 w-full rounded-lg text-sm font-bold',
            action.count !== null && 'justify-between',
          )}
        >
          {action.count === null ? (
            action.label
          ) : (
            <>
              <span>{action.label}</span>
              {/* `text-primary-foreground/70`, not `text-muted-foreground`: on a filled button the
                  muted token is a light grey on mint and fails contrast in the light theme. */}
              <span className="text-xs font-medium text-primary-foreground/70">
                {placesCountText(action.count)}
              </span>
            </>
          )}
        </Button>
      </form>

      {/* **The panel's own polite region, and it lives and dies with the panel.** The page's
          results region is the one that speaks on apply; this one is unmounted by then, so a
          screen-reader user never has two regions competing (`ux-map-is-the-query.md` §7.1). */}
      <div aria-live="polite" className="sr-only">
        {state.kind === 'result'
          ? interpretationSentence(state.application, state.count)
          : state.kind === 'nothing'
            ? SENTENCE_COPY.nothing
            : ''}
      </div>

      {state.kind === 'nothing' && (
        <p className="px-1 text-sm font-medium text-muted-foreground">{SENTENCE_COPY.nothing}</p>
      )}

      {state.kind === 'failed' && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-sm font-medium text-muted-foreground">{SENTENCE_COPY.failed}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void submit()}
            className="shrink-0 font-semibold"
          >
            {SENTENCE_COPY.retry}
          </Button>
        </div>
      )}
    </div>
  );

  const triggerFace = (
    <span className="flex h-8 max-w-full items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium text-muted-foreground group-hover/trigger:border-brand group-hover/trigger:bg-primary/15 group-hover/trigger:text-foreground group-focus-visible/trigger:ring-3 group-focus-visible/trigger:ring-ring/50 motion-safe:transition-colors motion-safe:duration-press">
      <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{SENTENCE_COPY.entry}</span>
    </span>
  );

  if (surface === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-1.5', className)}>
        <button
          ref={triggerRef}
          type="button"
          data-vaul-no-drag
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !open) return;
            event.stopPropagation();
            close();
          }}
          className={cn(TRIGGER_TARGET, PRESS_CHIP)}
        >
          {triggerFace}
        </button>
        {open && (
          <InlinePanel
            id={panelId}
            /* **No kicker.** `InlinePanel` prints one because a filter axis's panel is full-width
               under a *row* of triggers and cannot sit beneath the pill that was pressed. This
               trigger is a row of its own and the panel opens directly under it, so the axis word
               would be the same five words twice, one line apart — measured at 390×844. The dialog
               still carries them as its accessible name. */
            axisClear={null}
            onEscape={close}
            onOutsidePress={dismiss}
            triggerRef={triggerRef}
          >
            {/* The dialog role and its name. `InlinePanel` prints the axis word as its kicker, so
                the name a screen reader hears is the same words a sighted user reads. */}
            <div role="dialog" aria-label={SENTENCE_COPY.entry}>
              {body}
            </div>
          </InlinePanel>
        )}
      </div>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) openPanel();
        else dismiss();
      }}
      // Focus is contained; the page keeps working. Not `true`: that would lock document scroll
      // and disable pointer interaction with a live map beside the panel — `profile-menu.tsx`
      // records the same call for the same reason.
      modal="trap-focus"
    >
      <Popover.Trigger
        render={
          <button
            ref={triggerRef}
            type="button"
            className={cn(TRIGGER_TARGET, PRESS_CHIP, className)}
          >
            {triggerFace}
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup
            id={panelId}
            aria-label={SENTENCE_COPY.entry}
            className={cn(
              'w-[min(22rem,calc(100vw-2rem))] max-h-[min(32rem,var(--available-height))] overflow-y-auto overscroll-contain',
              'rounded-2xl border border-border/70 bg-popover shadow-[var(--shadow-elevated)] outline-none',
              ENTER_POPOVER,
            )}
          >
            {body}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * **Are the four filter cells still exactly what the sentence wrote into them?**
 *
 * The one question that decides whether `Undo` is still a truthful offer. Order-insensitive on
 * tags and key-equal through `isSameTag`, the same equality `filterByTag` and the clamp use, so a
 * tag re-spelled between the facet and the pill does not read as a change the user made.
 */
export function sentenceStillApplied(
  applied: SentenceApplication,
  current: SentenceApplication,
): boolean {
  return (
    applied.category === current.category &&
    applied.visit === current.visit &&
    applied.query === current.query &&
    applied.tags.length === current.tags.length &&
    applied.tags.every((tag) => current.tags.some((live) => isSameTag(live, tag))) &&
    sameArea(applied.area, current.area)
  );
}

/** Two areas are the same narrowing when they hold the same rows. Compared by membership rather
 *  than by label, because the label is a display choice and the rows are the filter. */
function sameArea(a: SentenceArea | null, b: SentenceArea | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.placeIds.length !== b.placeIds.length) return false;
  const mine = new Set(a.placeIds);
  return b.placeIds.every((id) => mine.has(id));
}

/**
 * **The applied notice and its `Undo`** — one transaction back to the previous filters and scope.
 *
 * Rendered by the page under the filter row while a sentence's filters are on. It is not part of
 * the panel because the panel is closed by then: the notice is about the *library*, not about the
 * surface that changed it, and it has to survive the panel unmounting.
 *
 * **It survives the panel, not the filters.** Owner-reported, 2026-09-04, and reproduced at both
 * breakpoints: clearing the filters by any other route — the row's own `Clear`, a tag chip's ×,
 * the empty-list escape, the search field — left this notice on screen, and pressing `Undo` then
 * *restored* the filters the user had just deliberately cleared. So the snapshot is meaningful for
 * exactly as long as the state it would undo is still on screen, and staleness is **derived** from
 * comparing the cells rather than hooked onto each clear handler: there are at least four such
 * routes today and a fifth would silently miss a hook.
 *
 * The `Undo` press itself is not a user change read through this gate — it writes the previous
 * cells and drops the snapshot in the same handler, so this component unmounts rather than
 * observing its own write.
 *
 * `applied` and `current` are optional only so the notice keeps compiling against a host that has
 * not passed them yet; with either missing it renders unconditionally, which is the old behaviour
 * and the bug. `onStale` lets the host drop the snapshot as well as hide it — without it a user
 * who manually rebuilds the exact applied filters would see the notice return.
 *
 * **No live region.** The page's existing results region already announced the new count when the
 * filters changed; a second announcement of the same fact is the defect §3.5 names.
 */
export function SentenceApplied({
  onUndo,
  applied,
  current,
  onStale,
  className,
}: {
  readonly onUndo: () => void;
  /** What the sentence wrote into the four cells. */
  readonly applied?: SentenceApplication;
  /** What those four cells hold right now. */
  readonly current?: SentenceApplication;
  /** Told once, when the two stop agreeing. */
  readonly onStale?: () => void;
  readonly className?: string;
}): ReactNode {
  const stale =
    applied !== undefined && current !== undefined && !sentenceStillApplied(applied, current);

  useEffect(() => {
    if (stale) onStale?.();
  }, [stale, onStale]);

  if (stale) return null;

  return (
    <div
      data-vaul-no-drag
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2',
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{SENTENCE_COPY.applied}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onUndo}
        className="shrink-0 font-semibold"
      >
        {SENTENCE_COPY.undo}
      </Button>
    </div>
  );
}
