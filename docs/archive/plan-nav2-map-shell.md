# NAV2 plumbing — one map shell, parameterised by scope

> Task `NAV2-DESIGN`, branch `refactor/collections-as-map-scope`. **A plan, not code.** Nothing
> under `src/` was edited. Spec: [`ux-collections-as-scope.md`](../ux-collections-as-scope.md) §5
> items 8–11. Every line/number below is read off the file cited, at the state of `main` (72d3f43);
> the branch carries no commits yet.
>
> Scope note: the implementation lands almost entirely in `src/components/**`, which is
> `design-system-frontend`'s and `maps-geospatial`' tree, not the architect's. The orchestrator has
> to serialise those agents against this work — two agents in `place-sheet.tsx` is how a 1 200-line
> refactor gets lost.

---

## 1. The seam

`map-page-client.tsx` is 1 150 lines, of which maybe 90 are shell. The rest is `/map`'s scope. The
dividing question that gets the same answer every time: **would `/collections/[id]` need this if it
had a map and a sheet?** Where the answer is yes it is shell; where it is no it is scope.

### 1.1 Shell — the composition and its geometry

| Thing | Where it is today | Why it is shell |
|---|---|---|
| The `MapSurface` call site | `map-page-client.tsx:892`, `collection-client.tsx:140` | Two call sites for one port. Item 9. |
| `Drawer.Root` / `Portal` / `Content` / `Handle` | inside `PlaceSheet` (`place-sheet.tsx:284-355`), and again in `collection-client.tsx:157-173` | Item 9. |
| The snap state (`snap`, `previousStop`, `lastSelectedId`) | `PlaceSheet`'s `SheetState` (`:212-232`); `collection-client.tsx:70`'s `snap` | Both routes have three stops and both need "rise to half when something opens, restore when it closes". |
| `SNAP_POINTS`, `PEEK_PX`, `SHEET_HALF_FRACTION`, `STOP_TO_SNAP`, `STOP_TO_CONTENT_HEIGHT`, `snapToStop` | `place-sheet.tsx:87-140`; duplicated in `[id]/sheet-geometry.ts` and again as a third local `FLOATING_TOP_CHROME_PX` in `collection-client.tsx:52` | Item 8. |
| `useNonModalBackground(true)` | called in both (`place-sheet.tsx:234`, `collection-client.tsx:113`) | One document, one `aria-hidden` policy. |
| The `full`-stop collapse scrim | `place-sheet.tsx:268-280` | Applies to any full-height sheet. The collection route simply lacks it — a bug, not a difference. |
| The `lg+` left panel frame (`pointer-events-none` wrapper, `w-[clamp(320px,26vw,392px)]`, hairline, `bg-card/85`, backdrop blur) | `place-desktop-panel.tsx:100-102` and copied at `collection-client.tsx:176-180` | Item 9. **The frame** is shell; its *contents* are scope. |
| The camera focus slot | `focusPlaceIds` + `focusBounds` on `/map` (`:255,261`); `focusPlaceIds` on the collection route (`:80`) written by `useRefitOnChange` and `selectItem` | Item 10. See §2.3 — this is the one genuinely hard piece. |
| `selectedId` (the **id**, never the object) | `map-page-client.tsx:158`; `selectedItemId` at `collection-client.tsx:69` | Both hold an id for the same reason (`map-page-client.tsx:140-157`: holding the object made the detail a snapshot). |
| The one `role="status" aria-live="polite"` region and `AnnounceContext` | `map-page-client.tsx:936-938` | A document has one live region. The collection route has none today, so its been-badge writes go nowhere. |
| `CollectionsContext` provider | mounted identically in both (`:884`, `:133`) | Already duplicated for the same stated reason. |
| `BottomNav` | `map-page-client.tsx:966`; **not rendered at all on `/collections/[id]`** | See §4.1 — this is a live defect and an ordering constraint. |
| `AddSheetHost` + `addOpen` | `map-page-client.tsx:174-180, 1005` | Spec item 6: one create menu on every tab. |

### 1.2 Scope — `/map`-only, and the collection route deliberately has none of it

`activeTag` · `notBeenOnly` · `activeCategory` · `query` · `scope`/`listScope`/`activeAreaId` ·
`clusters` · `areas` · `countries` · `summaries` · `anchorCluster` · `preferredAreaId` ·
`tagMatches`/`visitMatches`/`categoryMatches`/`matches`/`inScope`/`otherPlaces`/`matchIds` ·
`facets` · `heading` · `canvasName` · `useNearMe`/`distances`/`listed` · `handleViewportChange` ·
`selectArea` · `focusCountry` · `goToUserLocation` · `showImport`/`importSeedUrl`/`lastImport` ·
`ImportConfirmation` · `useResultAnnouncement`/`filterSentence` · the account chip
(`map/page.tsx:76`, `hidden lg:flex`).

`collection-client.tsx`'s header already says this ("no active area … no tag chip, no been filter,
no import overlay"), and `collection-content.tsx:15-20` argues, correctly, against threading a
variant flag through `PlaceSheet`'s eleven props to get it.

### 1.3 The seam, in one sentence

**The shell owns the box, the drawer, the stops, the camera slot and the selected id. The scope
owns what goes in the list, what a pin means, and every filter.** Nothing crosses as a boolean
variant: everything the two routes differ on is *data* the scope hands down (`places`,
`initialBounds`, a resting stop, the two content slots), which is the difference between one
parameterised shell and one shell with a `readOnly` flag in it.

---

## 2. The proposed API

Two new files, both under a new `src/components/shell/`:

```
src/components/shell/sheet-geometry.ts   — the stops and the numbers, React-free
src/components/shell/use-map-shell.ts    — the shell's state: snap, selection, camera slot
src/components/shell/map-shell.tsx       — the composition: map + drawer + panel + bar
```

`sheet-geometry.ts` must stay free of React **and** free of any transitive `server-only` import.
That is the whole reason `[id]/sheet-geometry.ts` exists (its own header says so), and the shared
module inherits the job — the numbers are the part most worth unit-testing and `map-surface` cannot
be imported from a test.

### 2.1 A hook plus a component, not a render-prop tower

The route client needs to *write* the camera (a country tap, a refit, a place tap) from handlers
that live above the shell in the tree. A child cannot expose an imperative API upward without a
ref, so the state lives in a hook the route calls, and the component is handed the result:

```ts
// use-map-shell.ts
export type SheetStop = 'peek' | 'half' | 'full';

export type CameraFocus =
  | { readonly kind: 'places'; readonly ids: readonly string[] }
  | { readonly kind: 'bounds'; readonly request: FocusBoundsRequest };

export interface MapShellState {
  readonly focus: CameraFocus | null;
  readonly camera: {
    /** Frame exactly these places. Fresh array every call — the flight is keyed on identity. */
    readonly framePlaces: (ids: readonly string[]) => void;
    /** Frame this box, resting inside this zoom range. */
    readonly frameBounds: (request: FocusBoundsRequest) => void;
  };
  readonly sheet: { readonly stop: SheetStop; readonly goTo: (stop: SheetStop) => void };
  readonly selectedId: string | null;
  readonly setSelectedId: (id: string | null) => void;
}

export function useMapShell(options: { readonly restingStop: SheetStop }): MapShellState;
```

This is the pattern the repo already uses (`useNearMe`, `useCreateCollection`), so it invents no
mechanism. `MapShell` is then presentational over that state:

```tsx
interface MapShellProps {
  readonly shell: MapShellState;

  // map
  readonly places: readonly MapPlace[];
  readonly initialBounds?: LatLngBoundsHint;
  /** Where this scope's sheet rests. Drives the initial snap AND the camera's bottom budget. */
  readonly restingStop: SheetStop;
  /** Depth of floating chrome over the map's top edge. `undefined` = /map's 56/100 defaults. */
  readonly floatingTopChromePx?: number;
  /** The place whose detail the map itself should draw at lg+. `null` = no popover. */
  readonly selectedPlace: MapPlace | null;
  readonly selectedOcclusionFraction?: number;
  readonly summaries?: MapSummaries;
  readonly onAreaClick?: (areaId: string) => void;
  readonly onCountryClick?: (key: string) => void;
  readonly onViewportChange?: (b: LatLngBoundsHint, m: ViewportChangeMeta) => void;
  readonly accessibleName?: string;
  readonly controlSlot?: ReactNode;

  // content
  /** The sheet's content, given the stop it must render at. */
  readonly sheetContent: (stop: SheetStop) => ReactNode;
  /** The lg+ left panel's content. The frame is the shell's; this is what goes in it. */
  readonly panelContent: ReactNode;

  // chrome
  /** `＋`. Omitted means no create menu on this scope — but per item 6 it never is. */
  readonly onAdd?: () => void;
  /** A full takeover (the import overlay). While set, the sheet and the bar are UNMOUNTED. */
  readonly overlay?: ReactNode;
  /** Rendered after the sheet in the portal order — today's `AddSheetHost` slot. */
  readonly modalSlot?: ReactNode;
  readonly announcement?: string;
}
```

`sheetContent` is a **function of the stop**, not a node. That is what makes item 11 die: the shell
puts `STOP_TO_CONTENT_HEIGHT[stop]` on the column it renders the result into, so
`Add places` stops being reachable only at `full` without `CollectionContent` knowing anything about
sheets. `PlaceList` already takes `stop`; `CollectionContent` starts taking it (and only to be
handed back — it does not branch on it).

### 2.2 Where `selected` lives, and the trap in unifying it

`selectedId` lives in the shell (it drives the raise-to-half and the restore-on-close, which is
`PlaceSheet:220-230` lifted verbatim). **`selectedPlace` — the resolved object handed to
`MapSurface` for its `lg+` pin popover — stays a scope prop, and the collection scope passes
`null`.**

Do not be tempted to pass it. `map-surface.mapcn.tsx:1196` builds the popover's write target with
`savedPlaceRef(selected)`, and a collection pin's `MapPlace` (`collection-client.tsx:toMapPlace`)
carries no `savedPlaceId`, so the popover would render `PlaceDetail` with `savedPlace={null}` —
no shared note, no `Added by`, no `Remove from this collection`, none of the four things §4 item 2
says a collection must add. Unifying the popover means teaching the surface the collection's two
slots, which is a bigger, separate change. `selectedPlace={null}` says "this scope has no map-drawn
detail" as data, not as a flag, and desktop keeps today's left-panel detail.

Consequence to state plainly: after this refactor, a place opened from a collection is still shown
in the left panel at `lg+` while a place opened from `/map` is shown in a map popover. That is
today's behaviour on both routes, unchanged — but it is *not* the "one object" §4 is reaching for,
and it should be written down as the remaining gap rather than quietly left.

### 2.3 The camera focus slot — collapsing three slots to one

Today there are **three** state cells across two routes:

| Slot | Writers |
|---|---|
| `/map`'s `focusPlaceIds` (`:255`) | movers 2, 3, 4, 7 |
| `/map`'s `focusBounds` (`:261`) | movers 5, 8 |
| the collection route's `focusPlaceIds` (`:80`) | `useRefitOnChange`, `selectItem` |

The shell holds **one** cell of type `CameraFocus | null`, and `MapShell` spreads it back onto the
surface's two existing props:

```tsx
{...(shell.focus?.kind === 'places' ? { focusPlaceIds: shell.focus.ids } : {})}
{...(shell.focus?.kind === 'bounds' ? { focusBounds: shell.focus.request } : {})}
```

Every writer becomes `camera.framePlaces(...)` / `camera.frameBounds(...)`, each call allocating a
fresh object so identity-keying still fires. `useRefitOnChange` keeps its signature — it already
"reports into the caller's single focus slot rather than owning one of its own" (its own header) —
and simply gets `camera.framePlaces` passed in. That is item 10, done by deleting a `useState`.

The surface needs **no change**: `:1046` and `:1085` are two independent effects, each guarded by
its own already-flown ref, and each early-returns on a falsy prop.

**The one real behavioural difference, and it must be measured not argued.** Today `/map` never
clears `focusPlaceIds` — the comment at `:255-263` is explicit that clearing it is what once threw
the camera across the world. With one cell, a `frameBounds` write makes `focusPlaceIds` *absent* on
the next render. The `focusPlaceIds` effect early-returns on absent, so nothing flies; and the
surface's resize path replays a recorded `Framing`, not the props, so a resize after a country tap
is unaffected. I believe this is behaviour-preserving. I have not run it. It gets its own commit
(§3, C2) precisely so a bisect lands on it.

### 2.4 `RESTING_SHEET_FRACTION` and `FLOATING_TOP_CHROME_PX` — props, and here is the arithmetic

Both stay **per-scope**, and neither may be collapsed to one value. They are not style; they are the
camera's budget, and each has already produced a measured defect at the wrong value.

**`restingSheetFraction`.** Not passed on `/map` (the surface then uses `SHEET_PEEK_PX` = 128, i.e.
the peek strip); `0.55` on `/collections/[id]`.

- Force `0.55` everywhere → `/map`'s `fitBounds` concedes 447 px of an 812 px phone instead of
  128 px, so the home overview (mover 1, the whole library under `HOME_LANDING_ZOOM`) is squeezed
  into the top 45 % of the screen and the country pills — which already claim a
  `summaryPillFitAllowance` — get pushed toward `clampFitPadding`. A visible regression on the
  product's first screen.
- Force the peek default everywhere → straight back into `L2-COLL-CAM-2`: measured at 640×360, the
  collection route's padding came to 394 px of a 360 px container, the clamp scaled the box, and the
  lowest pin's tip landed at 163 px against a sheet top of 162 px.

So: **the scope declares `restingStop`, and the shell derives both the initial snap and the camera
fraction from it** — `peek → undefined`, `half → HALF_FRACTION`, `full → HALF_FRACTION`. One
constant, one direction of derivation, which is exactly the failure mode `[id]/sheet-geometry.ts`
records having already fallen through (`SNAP_POINTS[1] ?? 0.55` silently becoming `undefined`).
`full` is capped at `HALF_FRACTION` deliberately: a full sheet occludes everything, so there is no
honest framing for it, and the useful framing is the one the user sees when they drag it down.

**`floatingTopChromePx`.** Not passed on `/map` (56 at `lg+`, 100 below); `0` on
`/collections/[id]`, and it must be `0` on `/collections` too — the account chip lives in
`map/page.tsx` and is `hidden lg:flex`, so neither collections route has ever had top chrome. §3 of
the ruling makes the `0` load-bearing by forbidding a scope chip over the map, so this prop is the
mechanical enforcement of a UX ruling and should carry a comment saying so.

**`PEEK_PX` does not move.** 128, mirrored in four places: `place-sheet.tsx:87`,
`[id]/sheet-geometry.ts:16`, `query-rect.ts:47` (`SHEET_PEEK_PX`) and `globals.css:239`
(`padding-bottom: calc(128px + env(safe-area-inset-bottom) + 0.25rem)`, the CARTO/OSM attribution
condition). This refactor deletes **one** mirror — the collection copy — leaving three. Do not try
to unify the CSS one: a `var()` indirection on a licence condition buys nothing and adds a way for
attribution to disappear. `query-rect.ts` cannot import from `components/sheet` without inverting
the map→sheet direction; leave it mirrored and pin it with a test (§4.4).

---

## 3. The commits, in order

Conventional Commit subjects; each is a coherent subtask with its own verification.
**`/map` behaviour must be identical after every one of them.**

Two cheap chrome deletions come first because they are free and independent of the plumbing.

---

**C0 — `fix(nav): light the Collections tab as a section, not a page`**
Spec item 5. `bottom-nav.tsx:184` — `aria-current="page"` → `"true"` when the current path is under
`/collections/` but is not `/collections`.
*Files:* `src/components/nav/bottom-nav.tsx`.
*Verify:* read the rendered attribute on both routes with VoiceOver / the a11y tree.

**C1 — `refactor(sheet): one module for the sheet's stops and its geometry`**
Spec item 8, first half. New `src/components/shell/sheet-geometry.ts` exporting `SheetStop`,
`PEEK_PX`, `HALF_FRACTION`, `SNAP_POINTS`, `STOP_TO_SNAP`, `STOP_TO_CONTENT_HEIGHT`, `snapToStop`,
`restingSheetFractionFor(stop)`. `place-sheet.tsx` imports instead of declaring and re-exports
`SHEET_HALF_FRACTION` as an alias for one commit, so `map-page-client.tsx` does not change.
`[id]/sheet-geometry.ts` becomes a two-line re-export so the existing test keeps passing.
*Files:* `src/components/shell/sheet-geometry.ts` (new), `src/components/sheet/place-sheet.tsx`,
`src/app/collections/[id]/sheet-geometry.ts`, `tests/unit/shell/sheet-geometry.test.ts` (new).
*Verify:* `npm run test` — `collection-map-geometry.test.ts` passes **unchanged**, which is the
point; the new test pins `PEEK_PX === SHEET_PEEK_PX === the literal in globals.css`.
No runtime change at all: pure re-export.

**C2 — `refactor(map): one camera focus slot, written by every mover`**
Spec item 10's precondition. New `src/components/shell/use-map-shell.ts`. `map-page-client.tsx`
adopts it: `focusPlaceIds` and `focusBounds` deleted, movers 2–8 write through `camera`, the two
props spread onto `MapSurface` from the union. No JSX restructuring, no new component.
*Files:* `src/components/shell/use-map-shell.ts` (new), `src/app/map/map-page-client.tsx`,
`tests/unit/shell/camera-focus.test.ts` (new).
*Verify:* the new unit test (last writer wins; a fresh identity per call; a `bounds` write leaves
`focusPlaceIds` absent). Then **drive `/map`** at 375×812 and at `lg`: initial framing on sign-in
(mover 1), tap a country pill (5), tap an area pill (4), tap a list row (3), near-me (8), run an
import (2), manual add from `＋` (7). Each has to move the camera exactly as it does on `main` —
this is the step where `/map` can silently change, and it is isolated for that reason.

**C3a — `refactor(sheet): lift the drawer and its stops into MapShell`**
Spec item 9, first half. New `src/components/shell/map-shell.tsx` owning `useNonModalBackground`,
the full-stop collapse scrim, `Drawer.Root/Portal/Content/Handle`, the
`STOP_TO_CONTENT_HEIGHT[stop]` column, the `MapSurface` call, the `role="status"` region, the
`overlay`/`modalSlot`/`onAdd` chrome. `PlaceSheet` loses its drawer and its snap state and becomes
the `sheetContent` renderer. `/map` is still the only caller.
*Files:* `src/components/shell/map-shell.tsx` (new), `src/components/sheet/place-sheet.tsx`,
`src/app/map/map-page-client.tsx`.
*Verify:* `/map` at 375×812 and 812×375 — the peek line and its `+N more`, drag peek↔half↔full,
select from the list (rises to half), close the detail (restores the *previous* stop, not peek),
tap the full-stop scrim, open the import overlay (**the sheet and the bar must unmount, §4.2**),
`＋` → create menu → manual add. VoiceOver: the map page is still reachable behind the sheet.
`npm run test:e2e -- map-accessibility smoke`.

**C3b — `refactor(sheet): the desktop panel frame belongs to the shell`**
Spec item 9, second half. The `pointer-events-none` wrapper + the `w-[clamp(320px,26vw,392px)]`
frosted column move from `place-desktop-panel.tsx` into `map-shell.tsx`'s `panelContent` slot;
`PlaceDesktopPanel` renders contents only.
*Files:* `src/components/shell/map-shell.tsx`, `src/components/sheet/place-desktop-panel.tsx`,
`src/app/map/map-page-client.tsx`.
*Verify:* `/map` at `lg` and at 1440 — panel width, hairline, blur, scroll reset on area change,
the map reachable either side of it.

**C4 — `feat(collections): render a collection through the map shell`**
Spec items 7, 9, 10, 11. `collection-client.tsx` calls `useMapShell({ restingStop: 'half' })` and
renders `<MapShell restingStop="half" floatingTopChromePx={0} selectedPlace={null}>` with
`CollectionContent` in both slots. Deletes: its `Drawer.Root`, its copied desktop panel, its
`MapSurface` call, its `snap` state, its local `FLOATING_TOP_CHROME_PX`, `useRefitOnChange`'s
private slot, **and `src/app/collections/[id]/sheet-geometry.ts`**. Deletes
`collection-content.tsx`'s `pb-[calc(env(safe-area-inset-bottom)+5rem)]` workaround. **Mounts
`BottomNav` — see §4.1.** The file should drop from 259 lines to well under 100.
*Files:* `src/app/collections/[id]/collection-client.tsx`,
`src/app/collections/[id]/sheet-geometry.ts` (deleted),
`src/components/collections/collection-content.tsx`,
`tests/unit/collections/collection-map-geometry.test.ts` (re-pointed at the shared module, plus a
`/map` arm).
*Verify:* re-measure `L2-COLL-CAM-2` at 375×812, 812×375, 640×360, 568×320 — every pin clears the
sheet. `Add places` reachable at `half` (item 11). Tap a row → the camera flies (writer 2 survives).
Add a place → the map re-frames (writer 1 survives). Share panel raises to `full`. `/map` untouched.

**C5 — `feat(collections): the Collections up-link replaces the back arrow`**
Spec items 3 and 6. `collection-content.tsx:124-133`'s unlabelled `ArrowLeft` becomes the kicker
row's labelled `Collections` up-link (accessible name `Collections`, never "Back"); the `＋` on the
collection routes opens the shared create menu instead of falling through to `/import`
(`bottom-nav.tsx:222-228`'s no-`onAdd` arm). Also fixes the known R4 violation: `Add to a
collection` currently draws `Back to the place` inside the detail while the host's back arrow is
still in the header.
*Files:* `src/components/collections/collection-content.tsx`,
`src/components/collections/add-to-collection.tsx`, `src/app/collections/[id]/collection-client.tsx`.
*Verify:* walk `Places → Collections → Tel Aviv → Fugazi → Add to a collection` and count
back-shaped controls at every stop. The answer must be ≤ 1, everywhere.

**C6 — `feat(collections): the index is the sheet's list, not a page`**
Spec items 1, 2, 4. `/collections/page.tsx` also loads the library (`getSpots()`);
`collections-index-client.tsx` loses `flex min-h-dvh flex-col`, its `<header>`, its `<h1>`, its
`max-w-[560px]` column, the `lg`-only `Back to the map` arrow (`:60-70`) and `EmptyIndex`'s
`Go to your map` button (`:183-191`), and renders inside
`<MapShell restingStop="full" floatingTopChromePx={0}>`.
*Files:* `src/app/collections/page.tsx`, `src/app/collections/collections-index-client.tsx`.
*Verify:* drag the index sheet down and the map is there, framed like `/map`'s. Empty index still
reads its two lines. Collections tab still `aria-current="page"` here.

**C7 — `test(shell): keep the second shell from growing back`**
A source-text guard (the technique `tests/unit/app/shell.test.ts` already uses for the viewport
line): nothing under `src/app/collections/**` declares `PEEK_PX`, `RESTING_SHEET_FRACTION`,
`FLOATING_TOP_CHROME_PX` or `Drawer.Root`. Cheap, and it is the only thing that makes eleven
deletions stay deleted.

---

## 4. Risks

### 4.1 The bottom bar is not on `/collections/[id]` at all — a hard ordering constraint

`grep -rn BottomNav src` returns `map-page-client.tsx:966`, `profile/page.tsx:70` and
`collections-index-client.tsx:54`. **`collection-client.tsx` does not render it.** So on
`/collections/[id]` today the *only* exit is the `Back to collections` arrow the spec deletes.

- §2.3 of the ruling ("Exits from step 4 that need no back at all: Map tab, Collections tab") is
  false on that route right now.
- The up-link C5 puts in the arrow's place is itself an exit (to `/collections`, which *does* have
  the bar), so this is not a trap — but until C4 mounts the bar, leaving a collection for the map is
  two taps and the ruling's "one thumb-reachable tap" is not true. **C4 should land before or with
  C5**; if C5 lands first, say out loud that the bar is still missing.
- And `tests/unit/collections/collection-map-geometry.test.ts` is, in its entirety, arithmetic about
  a bar that route does not render. It is green and it is about nothing. Mounting the bar in C4 is
  what makes that test start being true — which is a good reason to keep it rather than delete it,
  but its header needs correcting in the same commit.

### 4.2 The import overlay's mobile takeover breaks silently

`map-page-client.tsx:940-966` unmounts `PlaceSheet` **and** `BottomNav` under `!showImport`, and the
comment there explains exactly why: vaul portals to `document.body` *after* this subtree, so at
matched z-indices the sheet paints over anything rendered here regardless of JSX order. If
`MapShell` renders the drawer unconditionally, mobile import stops being an opaque takeover and the
places list bleeds through. Hence the `overlay` prop, and hence "while set, the sheet and the bar
are unmounted" is part of the contract, not an implementation detail.

The mirror-image trap is one line below it: `AddSheetHost` is **not** guarded, because unmounting a
*modal* vaul drawer mid-open leaves `document.body` with a scroll lock and a `pointer-events: none`
nobody can see. `modalSlot` must render unconditionally. Both of these are load-bearing and neither
is visible in a type signature.

### 4.3 What else breaks quietly

- **`useNonModalBackground(true)` moves, and both call sites must not survive.** It is not
  refcounted — each caller installs its own `MutationObserver` and its cleanup disconnects only its
  own. Two callers are redundant rather than conflicting (the removal is idempotent), so this will
  not fail loudly if `PlaceSheet` forgets to drop its call; it will just run twice forever. Grep for
  it after C3a and C4.
- **`STOP_TO_CONTENT_HEIGHT` applied to `CollectionContent` shortens its column at `half`.** Its
  own `min-h-0 flex-1 overflow-y-auto` should adapt, but the `pb-…5rem` it currently carries was
  compensating for the missing height cap. Removing both in one commit is right and must be checked
  at 375×812 *and* 812×375 before it is called done.
- **The `data-testid`s.** `place-sheet` and `collection-sheet` are referenced by **no** test in
  `tests/` (grepped). Collapse to one `data-testid="place-sheet"` and note that nothing depends on
  it, rather than preserving both out of caution.
- **Selection semantics on the collection route are two pieces of state, not one** —
  `selectedItemId` *and* `view`. The shell's `selectedId` drives the raise-to-half; `view` stays in
  `collection-client`. Do not try to derive one from the other; `view` has four values and three of
  them have no place.
- **Focus on a scope change** (§6: focus moves to the sheet's `<h2>`, `tabIndex={-1}`, no scroll) is
  new — it exists on neither route today. It is a route change between two documents, so it is not
  free; budget it, or write down that it was skipped.
- **`/collections` now ships the whole library in its RSC payload** so the map behind the index has
  pins. Fine at the owner's 113 places; it is an unmeasured claim at 2 000, and it should be said
  out loud rather than discovered.

### 4.4 Tests that pin the current structure, and the new ones

| Test | What it pins | What C1–C4 do to it |
|---|---|---|
| `tests/unit/collections/collection-map-geometry.test.ts` | imports `@/app/collections/[id]/sheet-geometry`, and 4 viewports of fit-padding arithmetic | **Breaks on deletion.** Must be re-pointed in the same commit that deletes the file (C4). Add a `/map` arm (peek-resting) so both scopes' budgets are pinned in one place. |
| `tests/unit/map/query-rect.test.ts`, `camera-library-shapes.test.ts`, `pin-band-floor.test.ts` | the camera arithmetic under the focus slot | Should pass untouched. If C2 breaks one of these, the collapse is not behaviour-preserving — stop. |
| `tests/unit/app/shell.test.ts` | the source-text assertion technique | Precedent for C7 and for the `globals.css` mirror test. |
| `tests/e2e/map-accessibility.spec.ts`, `smoke.spec.ts` | the only `/map` e2e | Run after C3a and C3b. Note six import specs fail identically on `main` (TikTok oEmbed + model); those are not yours. |

New, and each earns its place:

1. `tests/unit/shell/sheet-geometry.test.ts` — `PEEK_PX === 128`; `=== SHEET_PEEK_PX` from
   `query-rect.ts`; `=== ` the literal in `globals.css` (read the file). That last one is the
   licence-condition mirror and is the single most valuable new test here.
2. `tests/unit/shell/camera-focus.test.ts` — the focus reducer: last writer wins, a fresh identity
   per call, a `bounds` write leaves no `focusPlaceIds`, `restingSheetFractionFor('peek')` is
   `undefined`.
3. C7's "no second shell" source guard.

There is no jsdom in this repo (`vitest.config.ts` sets `environment: 'node'`), so **none of the
drag, snap, focus or paint-order behaviour above can be unit-tested.** All of it is verified by
driving the app at four viewports. Say so; do not let a green `npm run test` stand in for it.

---

## 5. Where I think the spec is wrong, or more expensive than it looks

1. **Item 7 names the wrong file.** There is no bottom-padding workaround on
   `/collections/[id]`'s `Drawer.Content` — that element carries none. The workaround is
   `pb-[calc(env(safe-area-inset-bottom)+5rem)]` on `CollectionContent`'s scroll container. Right
   deletion, wrong address, and it can only go together with `STOP_TO_CONTENT_HEIGHT`.

2. **Item 10 bills a `/map` change as a collections change.** "Fold `useRefitOnChange`'s private
   slot into the shell's single focus slot" presumes the shell has one. `/map` has **two**
   (`focusPlaceIds` + `focusBounds`); the collection route has one. Acquiring the single slot is a
   change to the eight-mover machinery on the product's main surface, and it is the riskiest thing
   in this plan. It is C2, on its own, before any collections file is touched.

3. **Item 9's "one `MapSurface` call site" quietly implies one `selected`, and that regresses §4.**
   See §2.2: a collection pin has no `savedPlaceId`, so a shared popover renders the *degraded*
   detail — no shared note, no `Added by`, no `Remove`. The deletion list and the "one object"
   ruling pull in opposite directions here. My answer is `selectedPlace={null}` in collection scope,
   which preserves today's behaviour on both routes and leaves the desktop asymmetry as a named,
   written-down gap rather than an accident.

4. **The ruling assumes a bar that is not there.** §2.3 and §3's "Leaving is the Map tab, which is
   on screen at `peek`" are false on `/collections/[id]` today. Not a flaw in the ruling's model —
   it is right that the bar should be there — but it turns "delete the back arrow" from a
   subtraction into a subtraction *plus* an addition, and it makes the commit order load-bearing.

5. **§7's split of 1–7 (cheap) from 8–11 (costly) does not survive contact with the files.**
   Item 3 (the up-link) needs the shell's header slot; item 7 needs the shell's height cap; items 1,
   2 and 4 need the index to be inside the shell. Only items 5 and 6 are genuinely free. The honest
   split is: 5 and 6 now, then the plumbing, then 1–4 and 7 as consequences.

6. **`/collections`' own camera numbers are not specified.** §3 fixes `FLOATING_TOP_CHROME_PX = 0`
   for collection *scope* but says nothing about the index route, and nothing about where its sheet
   rests. My reading: `0` and `restingStop: 'full'`. That means the index's initial `fitBounds`
   happens entirely behind a full-height sheet — harmless, and the framing is correct the moment it
   is dragged down, but somebody should agree that on purpose rather than discover it.

7. **The cost.** This is presented as removing a duplicate. It is not. `place-sheet.tsx` is 1 509
   lines and owns the drawer; `map-page-client.tsx` is 1 150 lines of camera argument, most of it
   comments recording defects that were paid for in production; and `collection-content.tsx:15-20`
   argues *against* exactly this unification, on grounds that are still sound for the panes if not
   for the shell. Seven commits, and the regression surface of the middle three is the entire
   product's main screen, which has no jsdom and therefore no automated coverage of the behaviour
   being moved. I would budget several sessions and independent QA on `/map` after C2 and C3a
   specifically — not because the design is doubtful, but because "`/map` is unchanged" is a claim
   that can only be made by using it.

---

---

## 6. Named gaps, after C1–C4 landed

Written down rather than left to be rediscovered.

1. **A collection's place detail is not drawn on the map at `lg+`.** `/map` opens a place in the
   surface's own pin-anchored popover; a collection opens it in the sheet below `lg` and in the left
   panel above it. That asymmetry is *today's* behaviour on both routes and this refactor did not
   change it — but it is not the "one object" §4 of the ruling is reaching for.

   The blocker is concrete: a collection pin's `MapPlace` carries no `savedPlaceId` (its `id` is a
   collection item id), so `savedPlaceRef` returns `null` and the popover would render `PlaceDetail`
   with no write target — losing the shared note, `Added by` and `Remove from this collection`,
   which is exactly the list §4 item 2 says a collection must add. Closing it means teaching the
   surface's popover the two slots `CollectionPlaceDetail` uses, which is a change to
   `components/map/**`, not to the shell. `MapShell`'s `selectedPlace` prop is where it would be
   turned on: a collection passes `null` today.

2. **The `Collections` up-link and the `Collections` tab are two controls to one destination**, both
   on screen at `half` and `full` now that the shell mounts the bar. §2.2 of the ruling lists both
   deliberately and §2.3 shows them coexisting, so this is the ruling working as written — but it is
   the same "two controls, one destination" the `Back to the map` arrow was deleted for, and it is
   worth the owner looking at it on a screen.

3. **`/collections/[id]`'s desktop camera opens further out than its mobile camera does.** Observed
   at 1440×900: fifteen central-London pins framed at roughly half of England, where the same
   collection at 375×812 frames London correctly and `/map`'s desktop framing is correct. The three
   camera-relevant props (`initialBounds`, the resting fraction, `floatingTopChromePx`) are
   value-for-value what the route passed before this refactor, and `mapOcclusionInsets` already
   ignores the sheet fraction at `lg+`, so I believe it pre-existed — but I could not prove that
   without running `main`, which would have meant switching branches. Unattributed, not dismissed.

| Date | Change |
|---|---|
| 2026-08-30 | Created for `NAV2-DESIGN`. Design only; no `src/` file touched. |
| 2026-08-30 | C1–C4 implemented. §6 added: the three gaps left open. C0/C5's chrome half landed separately (`261c90b`, `3f42927`, `4bd3ab1`), and the ordering warning in §4.1 was discharged — C4 mounts the bar. |
