# The bottom bar on the two collection routes

> ## ⚠ NOT SHIPPED on `/collections/[id]` — reverted by the orchestrator, 2026-08-29
>
> This document's §1 decision is sound and its reasoning is kept. **The implementation was backed
> out** because I measured it in a browser and the bar clipped the collection's own list.
>
> At 375×812 on `London 2026`, scrolled to the end: the lowest row's bottom sat at **y = 956**
> against a bar top of **744** — 212 px of list underneath the bar, and 144 px of it below the
> viewport entirely. The padding went on `Drawer.Content`, which is `h-full` and translated by vaul,
> so it does not move the scroll container's own end into view. `/map`'s sheet solved the same
> problem structurally, by binding the content column's height to its stop in `dvh`
> (`place-sheet.tsx`'s `STOP_TO_CONTENT_HEIGHT`, which is documented there as a bug fix and not a
> layout preference). This route needs the same treatment before the bar can go on it.
>
> **What survives and is kept in the tree:** the index-route work, `sheet-geometry.ts`, its ten unit
> tests, and every decision below — including the observation in the front-matter that §4.6 of the
> navigation ruling died with §1 and must not be cited later.
>
> The agent had no browser and correctly refused to claim this rendered. It did not get the
> verification wrong; nobody had done it yet. It was stopped mid-sentence while checking a vaul
> claim, so treat anything below as unfinished rather than withdrawn.


> Owner: Design System / Frontend. Date: **2026-08-29**. Task **NAV-3**, branch
> `feat/country-band-map-layer`. Working tree only — nothing committed.
>
> Follows the owner's ruling of 2026-08-29 that navigation moves to Plotline's structure, which
> reverses `ux-navigation-structure-2026-08-29.md` §1. §4's refusal list still binds **except**
> §4.6 ("a tab bar on `/collections`"), which the reversal killed along with §1 — the bar is
> already mounted there in `ddd684e`. Nobody should cite §4.6 later as if it survived.
>
> **Nothing here was seen on a screen.** I have no browser. Every number is arithmetic over
> constants read off the code at the line cited, or is read out of `node_modules/vaul/dist/index.js`.
> §6 says exactly what that leaves unverified.

---

## 1. `/collections/[id]` — the bar is mounted

**Decision: mount it, unchanged, with no camera change and one line of bottom padding inside the
sheet.**

The route is `/map` with a different set of pins — the same `MapSurface`, the same three-stop vaul
sheet below `lg`, the same left panel at `lg+`, by `collection-client.tsx`'s own opening comment. A
bar that vanishes on crossing into a screen that looks like the one you came from does not read as
"a detail pushed"; it reads as chrome that broke. That perceptual argument is the one that decided
it, because the alternative model — hide the bar on a pushed screen that owns the bottom of the
viewport, which is what iOS `hidesBottomBarWhenPushed`, Airbnb's listing page and Google Maps' place
sheet all do — is a perfectly good model that this particular route does not fit, since it does not
look pushed.

The §1.2 collision is real here and is paid the same way `ddd684e` pays it on `/map`: the sheet
yields the bar's band rather than pretending it is not there. See §3.

### What was added

`src/app/collections/[id]/collection-client.tsx`:
- `<BottomNav />` rendered before `<Drawer.Root>`, mirroring `map-page-client.tsx:725`. **No
  `onAddTikTok`** — this route has no import overlay, so the `＋` falls back to the bar's own
  `<Link href="/import">`.
- `paddingBottom: BOTTOM_NAV_HEIGHT_PX` on `Drawer.Content` (§3).

`src/app/collections/[id]/sheet-geometry.ts` (new): `PEEK_PX`, `RESTING_SHEET_FRACTION` and
`FLOATING_TOP_CHROME_PX` moved out of the client component, with their comments, so a unit test can
import them. `collection-client.tsx` imports them back and still derives `SNAP_POINTS` from
`RESTING_SHEET_FRACTION`, which is the property its comment says must not be lost. Same motive as
`query-rect.ts`'s own header: the client module transitively imports `server-only` through
`MapSurface`, so no test can reach a number that lives inside it.

`tests/unit/collections/collection-map-geometry.test.ts` (new): §2's arithmetic, checked rather
than asserted in prose.

### The back arrow stays

`collection-content.tsx:124-133`'s `Back to collections` arrow is **kept** below `lg`, unlike the
index's, which `ddd684e` removed.

The brief suggested the reason would be that the arrow goes somewhere the bar's tabs do not. It
does not — both go to `/collections`, so on the surface this is the same two-controls-one-destination
case §1.2 named. The reason it is still right to keep is different:

On `/collections/[id]` the bar renders the Collections tab **as the current one** — `bottom-nav.tsx`
matches it with `startsWith('/collections')` and gives it `aria-current` and the active background.
A lit, current-looking tab is not a discoverable way to go *up* a level; it says "you are here". On
the index the Map tab was lit for `/map`, i.e. plainly elsewhere, so the arrow beside it was pure
duplication. Here the arrow is the only affordance that says "back to the list", and it matters
most for the visitor who arrived from a share link and has no history behind them. It also sits at
the top-left of the sheet, nowhere near the bar.

## 2. The camera arithmetic — the bar costs this route nothing

The question is whether the bar sits inside occlusion `mapOcclusionInsets` already concedes, or adds
new occlusion it has to be told about. It is the former, with a wide margin, on every viewport.

The bar is `fixed`, full width, `BOTTOM_NAV_HEIGHT_PX` = **64 px** tall plus
`env(safe-area-inset-bottom)` (`bottom-nav.tsx:94`). This route declares `restingSheetFraction =
0.55` and `floatingTopChromePx = 0`, so `mapOcclusionInsets` returns a bottom inset of
`0.55 · containerHeight + inset` and `fitBoundsPadding` spends `48 + 0.55 · containerHeight` on the
bottom (`FIT_BOUNDS_PADDING` = 48, `map-surface.mapcn.tsx:129`).

The safe-area inset appears on **both** sides of the comparison — the sheet sits on it and so does
the bar — so it cancels, and the whole question is `64 ≤ 0.55 · H`.

| viewport | sheet band `0.55·H` | bar | slack | fit bottom `48 + 0.55·H` | fit top | map band left |
|---|---|---|---|---|---|---|
| 375×812 | 446.60 | 64 | 382.60 | 494.60 | 48 | 269.40 |
| 812×375 | 206.25 | 64 | 142.25 | 254.25 | 48 | 72.75 |
| 640×360 | 198.00 | 64 | 134.00 | 246.00 | 48 | 66.00 |
| 568×320 | 176.00 | 64 | 112.00 | 224.00 | 48 | 48.00 |

Three consequences, and the test file asserts all three:

1. **No new occlusion.** The bar lies wholly inside the band the camera already yields, at every one
   of the four `L2-COLL-CAM-2` viewports. `mapOcclusionInsets` needs no new parameter,
   `fitBoundsPadding` produces a byte-identical box, and the query rect — which does not inset for
   floating chrome at all, by `query-rect.ts`'s own rule — is untouched.
2. **The bar can never be the binding constraint.** Break-even is `64 / 0.55 = 116.4 px` of
   container height. Below that the bar would poke out above the sheet; above it, clearing the
   sheet implies clearing the bar. The shortest viewport in the set is 320 px, 2.7× the break-even.
   So this is arithmetic, not four lucky viewports.
3. **`L2-COLL-CAM-2` is unchanged in both directions.** That defect is a *top*-padding problem — a
   phantom 100 px of floating chrome pushing a short container into `clampFitPadding`, which then
   scales the *bottom* padding below the sheet height. The bar adds nothing to the padding box, so
   the box still fits unscaled on all four viewports and the clamp's scaling path is not reached
   (the test asserts `padding.bottom` equals the unclamped `48 + 0.55·H` exactly). The bar neither
   fixes it nor worsens it. The review's own measurement confirms the bar is not implicated: at
   640×360 the lowest pin's tip was at 163 px from the top, i.e. **197 px above the viewport
   bottom**, while the bar's top edge is at 64 px above it.

MapLibre's attribution and controls are padded by 128 px (`globals.css:237-240`, the peek height),
which is above the bar. The licence credit is not covered and nothing about it changes.

## 3. What would have sat underneath the bar, and how it was fixed

Four views can occupy this sheet — the list, a place's detail, the picker, the share panel — and
three of them end in something bottom-anchored:

| | bottom-most thing | before |
|---|---|---|
| list (editable, non-empty) | the `Add places` bar, `collection-content.tsx:217-230` | flush with the viewport bottom at `full` |
| picker | `Add N places`, `collection-content.tsx:592-622` | same |
| place detail | scroll container `pb-[calc(inset+2rem)]`, `collection-place-detail.tsx:69` | 32 px, against the bar's 64 |
| share panel | scroll container `pb-[calc(inset+2rem)]`, `share-panel.tsx:158` | 32 px |

All four live in `src/components/collections/**`, which the **desktop** panel also renders, and the
bar is `lg:hidden` — so padding them individually would mean four `lg:`-conditional paddings and
four copies of one number.

Instead the band is reserved once, on `Drawer.Content` itself, which is already `lg:hidden`:

```
style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
```

Two things make that safe, and I checked the second rather than assuming it:

- `Drawer.Content` is `h-full max-h-[100dvh]` with Tailwind's `border-box`, so the padding shrinks
  the content box and leaves the element's height alone.
- **vaul does not measure the drawer element.** `useSnapPoints`' `snapPointsOffset` is computed from
  `container.getBoundingClientRect()` or `window.innerWidth/Height` only —
  `node_modules/vaul/dist/index.js:562-596`, vaul 1.1.2. No snap point moves, so the sheet's top
  edge at `peek`, `half` and `full` is exactly where it was, and with it the camera budget, the
  query rect and the attribution padding.

A bare 64 with no `env(safe-area-inset-bottom)`, matching `place-sheet.tsx:425` and `:528`: every
bottom-anchored control inside already pays the inset itself, so adding it here would charge it
twice. Net clearance for `Add places` above the bar's pill is `64 + inset + 12 − (64 + inset)` = 12 px.

## 4. `/collections/join/[token]` — no bar, and nothing changed

**Decision: do not mount it.** Four reasons, in the order they decided it:

1. **Half of this route has no session.** The signed-out branch (`join/[token]/page.tsx:44-66`) is
   the one a link in a group chat lands on first. A `Map` tab there is a control that bounces you
   through `/sign-in`; a `Collections` tab is a control that says you have collections when the
   product does not yet know who you are.
2. **It is a decision, and it already carries its own exits.** Every state offers exactly the ways
   out it wants to offer — `Not now → /map`, `Go to your map`, `Sign in to join`. Persistent chrome
   on an accept/decline screen is an invitation to wander off mid-decision, and the one thing this
   route must not do is make joining accidental (`join-client.tsx`'s "It never auto-joins").
3. **It would land on the primary.** `JoinShell` is `mt-auto … pb-6` inside `pb-8`, so at 375×812
   the `Not now` ghost button's box ends ~56 px above the viewport bottom — inside the bar's 64 px
   band. There is no sheet here to absorb it, so paying for it would mean re-laying-out the shell
   for chrome the screen does not want.
4. **The `＋` is meaningless here.** "Add a TikTok" while deciding whether to join someone else's
   collection is an action about a different object entirely.

`bottom-nav.tsx:86-87`'s comment anticipates the join route keeping the Collections tab lit. That
`startsWith` is still needed — for `/collections/[id]` — but it is not evidence the join route was
meant to have a bar, and this ruling says it should not.

## 5. Four things I did not change and cannot change here

Each is outside NAV-3's path scope. Reporting, not fixing.

1. **`/collections`' `New collection` button is underneath the bar right now.** The sticky footer
   (`collections-index-client.tsx:96`) is `pt-3` + `h-14` + `pb-[calc(inset+0.75rem)]`, so the
   button's box spans **12+inset to 68+inset px** above the viewport bottom. The bar's pill spans
   **8+inset to 64+inset**. That is 52 px of overlap on a 56 px button — the index's scroll
   container was padded for the bar (line 83) but its sibling sticky footer was not. This is the
   one thing in this area I would fix first, and it is the orchestrator's file.
2. **The `＋` is a one-way door off `/map`.** With no `onAddTikTok` it links to `/import`, and
   `/import` closes to `/map` (`import-page-client.tsx:811`), not back where you came from. Tapping
   it from a collection loses the collection. Already live on `/collections`; now also on
   `/collections/[id]`. It needs either an opt-out on the bar or a `next` on `/import` — a
   `BottomNav` change, so I did not make it.
3. **`aria-current="page"` is a false claim on `/collections/[id]`.** The tab's own comment argues
   for `page` over `true` because it "marks the tab whose route is the current document" — but the
   `startsWith` match lights it on a route that is *not* `/collections`. `aria-current="true"` is
   the honest value for an ancestor-section match. `bottom-nav.tsx`, so not mine.
4. **`/collections/[id]`'s sheet still has the below-the-fold defect `place-sheet.tsx` fixed.**
   `Drawer.Content` is `h-full` with no per-stop content height, and vaul positions by translating,
   so at the resting `0.55` snap the bottom 45 % of the content column is below the viewport —
   which is where `Add places` and `Add N places` live. `place-sheet.tsx:100-121` records the same
   mechanism measured on `/map` ("the `Elsewhere` heading came to rest 242 px below the viewport at
   maximum scroll") and fixes it with `STOP_TO_CONTENT_HEIGHT`; `collection-client.tsx` never got
   that fix. Consequence today: the route's primary action is only tappable at `full`.
   **When that is fixed, the per-stop heights must subtract `BOTTOM_NAV_HEIGHT_PX` as well** — §3's
   padding will not save it, because a child with an explicit height sits at the top of the content
   box and does not move with the parent's `padding-bottom`. I left it alone because it changes the
   route's layout at every stop, which would tangle the on-screen verification of the bar.

## 6. What I did not verify

- **Nothing was rendered.** No browser, no screenshot, no device. I have not seen the bar on either
  route, at any viewport, in either orientation, in light or dark.
- Every pixel in §2 and §3 is arithmetic over constants, not a measurement. The one runtime claim I
  did check is the vaul one, and I checked it by reading `node_modules/vaul/dist/index.js`, not by
  observing a sheet.
- Not checked on screen and worth checking first, at 375×812 and at 568×320 or 640×360: that
  `Add places` clears the bar at `full`; that the share panel's `Replace link` row clears it; that
  the bar's pill does not collide with MapLibre's bottom-right controls; that the peek stop still
  shows the sheet header and not a strip of empty card; and that the safe-area inset is not being
  double-counted on a notched device, which is the failure mode a simulator will show and arithmetic
  will not.
- No e2e or Playwright run; the suite in `tests/e2e/**` was not touched or executed.
- The `L2-COLL-CAM-2` clipping itself is **still open and still reproducible**. §2 claims only that
  the bar does not participate in it.
