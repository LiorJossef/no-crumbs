# A collection is a scope on the map, not a second app — IA ruling

> Owner: UX / Interaction. Date: **2026-08-30**. Task **NAV-2**.
> Status: **ruling.** No shell. Nothing here was seen on a screen; every code reference is read off
> the file at the line cited.
>
> Trigger: owner input, 2026-08-30, three complaints —
> (a) `/collections` "feels disconnected and mostly empty compared with the map-based application";
> (b) Places → Collections → Tel Aviv → Fugazi stacks back buttons and "back" has no stable meaning;
> (c) the same place must not feel like a different object depending on the route used to reach it.
>
> **This supersedes** `ux-nav-collections-routes-2026-08-29.md` §1's "the back arrow stays" and the
> composition of `collections-index-client.tsx` as a standalone document. It does **not** touch
> R2 (the three-tab bar), R4 (the global `＋`), R32 (no second overlay) or `ux-collections.md`'s
> data model, sharing model or privacy boundary.

---

## 0. The ruling in one paragraph

**There is one shell — map + list + sheet — and a collection is a *scope* applied to it. The
collections index is a list inside that shell's sheet, not a page.** No new surface is invented:
the index is S4 (the saved-places list, "not a page: the sheet at full height") holding a different
list, and a scoped map is S3 with fewer pins. The two `/collections` routes keep their URLs, because
share links depend on them, and stop having their own layout, their own header, their own back
arrow and their own copy of the map's geometry. **Every route-level back control is deleted.**
Leaving a collection is the Map tab; going to the index is the Collections tab; both are already on
screen at every stop. The only back control left in the product is the one inside the sheet that
dismisses a pushed pane, and it is never on screen at the same time as anything else that could be
mistaken for it.

---

## 1. Should collections be a standalone route? — No. It is a scope. One recommendation.

`/collections/[id]` is **already** the map shell — `collection-client.tsx`'s own opening comment
says so: the same `MapSurface`, the same three-stop vaul sheet, the same left panel at `lg+`. It is
not a different kind of screen; it is `/map` with a different set of pins and a narrower set of
controls. What makes it *feel* like a different app is not the composition, it is the chrome around
it: its own back arrow, its own geometry constants, its own empty states, and an index route in
front of it that is a white document with an `<h1>` and no map at all.

So the change is subtraction, not invention:

| Today | After |
|---|---|
| `/collections` — a full-page document (`flex min-h-dvh flex-col`, its own `<header>`, its own `<h1>`) | `/collections` — **the shell**, with the sheet showing the collections list. Map mounted behind it, same material, same bar, drag down and your map is there |
| `/collections/[id]` — a hand-built copy of the shell with duplicated constants | `/collections/[id]` — **the shell in collection scope**. Same sheet, same camera code, same `PEEK_PX` |
| `/map` — the shell, scope = everywhere | unchanged |

**Why not a filter chip on `/map` with no route at all:** a share link has to land somewhere, and
`ux-collections.md` is right that a collection you can see spatially is the whole reason it is not a
note in a chat app. A URL is cheap; a *layout* is not. Keep the URL, delete the layout.

**Why the index is not a ninth surface:** it renders in the sheet, at `full`, with the same rows,
the same search-field slot and the same empty-state language as the saved list. It is S4 with
`collections` in it. If a builder finds themselves writing a page header, they have left the spec.

**Two things I am explicitly not reversing.** The Collections *tab* stays (R2 is the owner's
ruling). The pane stack inside the sheet stays — `collection-content.tsx`'s argument against
threading a variant flag through `PlaceSheet`'s eleven props is sound, and this ruling unifies the
*shell and its geometry*, not every component inside it.

---

## 2. The navigation model — two layers, one meaning for "back"

### 2.1 The layers, and there are only two

```
Layer 0 — THE SHELL                      no back control, ever
  map + sheet, at one of two scopes:
    scope = your places        /map
    scope = a collection       /collections/[id]
  and the sheet's list is one of:
    your places (scope-dependent)
    the collections index      /collections

Layer 1 — ONE PUSHED PANE                exactly one back control, top-leading
  place detail · add places · share & members · add-to-collection picker
```

**There is no layer 2.** A pane may not push a pane. `AddToCollection`'s picker, opened from a place
detail, *replaces* the detail (as it does today) and its back returns to the detail — that is still
one pane visible with one back control, not two stacked. R32 already forbids the overlay version;
this forbids the depth version.

### 2.2 What every exit means

| Control | Where | Means | Available |
|---|---|---|---|
| **Map tab** | bottom bar | your whole map, scope cleared | every route, every sheet stop |
| ~~**Collections tab**~~ | ~~bottom bar~~ | superseded 2026-08-31 — see below | — |
| **`Places` / `Collections` switch** | sheet header, leading, layer 0 | the two views of the drawer | at `half`/`full`; **not at `peek`**, where 128 px minus a 68 px floating bar leaves 46 against the switch's 56 |
| ~~**`Collections` up-link**~~ | ~~sheet header~~ | superseded 2026-08-31 — see below | — |
| **Pane back arrow** | sheet header, leading, layer 1 | dismiss this pane, return to the list under it | while a pane is open |
| **OS / browser back** | — | the previous document | always |

**Two rows were superseded on 2026-08-31 by the owner's instruction that *"the collection / places
navigation should be inside the drawer"*, and both are struck rather than deleted so the reasoning
survives.**

**The `Collections` tab** left the bottom bar because the switch reaches the same view from inside
the drawer, and two routes to one surface is how a nav becomes something nobody trusts. `BottomNav`
is `Map · Profile`. The cost, measured rather than assumed: **from a resting `/map` on a phone,
collections is now two taps** — the strip, then `Collections` — because the switch does not render at
`peek`.

**The `Collections` up-link** left the collection header because it duplicated the switch ~700 px
below it in the same column, and cost **~44 px of a list window that is about 1.4 rows at `half`**.
It also predated the merge onto one route segment: while `/collections/<id>` was its own segment the
up-link was the only way back that did not cost a document, and after the merge it was a second
control to a view one search param away.

**The invariant below is unchanged and is now easier to hold**, because the slot it governed has one
occupant instead of two. The switch is not a back-shaped control — it is a destination pair, the same
category as the tabs, and it names both destinations in words.

The invariant, and it is the answer to complaint (b): **at most one back-shaped control is on screen
at any moment.** The up-link and the pane back arrow occupy the same slot and are mutually
exclusive — the pane replaces the list header. The tabs are not back controls; they are
destinations, and each names its destination in words.

**Nothing in this product ever renders an unlabelled arrow whose destination is "wherever you came
from".** A route-level up control names where it goes (`Collections`); a pane-level control dismisses
the pane it is drawn on. Those are the only two.

### 2.3 The worst path the owner named, after this ruling

`Places → Collections → Tel Aviv → Fugazi`:

1. **Map tab.** Shell, scope = your places, sheet at `peek`.
2. **Collections tab.** Same shell, same map behind, sheet rises to `full` with the collections list.
   No back arrow appears.
3. **Tap `Tel Aviv`.** Same shell. Scope becomes the collection: the map re-frames to its places,
   the sheet settles at `half`, the header carries the `COLLECTION` kicker and the collection's name.
   One up-link, reading `Collections`.
4. **Tap `Fugazi`.** The list is replaced by the place detail. The up-link is replaced by the pane's
   back arrow. The map flies to the pin (already built — camera writer 2).

Depth from rest: **two**. Back controls visible at step 4: **one**. Exits from step 4 that need no
back at all: Map tab, Collections tab.

### 2.4 Where scope lives, and where it does not

Scope is **route state, not remembered state**. It is set by opening `/collections/[id]` and cleared
by leaving it. It does not persist across a reload of `/map`, it is not written to `localStorage`,
and there is no "you were last in a collection" restore. This keeps
`ux-navigation-structure-2026-08-29.md` §4.7 intact.

---

## 3. How scope is displayed while browsing

**No context bar, no floating chip over the map.** A pill over the map's top band costs camera
budget on short viewports, and `collection-client.tsx:52` records exactly what a phantom 100 px of
top chrome did to the fit at 640×360. `FLOATING_TOP_CHROME_PX` stays **0** in collection scope.

**Scope is stated in the sheet header**, which is the one element already present at all three stops
and already responsible for saying what the list is.

At `half` and `full`:

```
‹ COLLECTION                                        ⋯      ← kicker row: up-link (leading) + options (trailing)
Tel Aviv                                                   ← h2, the collection's name, <bdi>
7 places · You and Maya                                    ← existing meta button → share & members pane
[ Search this collection ]
```

- The kicker is the product's existing 11 px uppercase tracked mint label. **It is the up-link** —
  a single control, ≥44 px tall, leading edge, in the exact position the deleted back arrow occupied,
  so nothing has to be relearned. Its accessible name is `Collections`, never "Back".
- **RTL:** logical properties only (R34); the chevron mirrors. The uppercase kicker has no Hebrew
  equivalent (O11) — in an RTL chrome it carries by weight and mint colour, no uppercasing.
- The `⋯` options menu is unchanged and stays inline (R32).

At `peek` the single line reads the collection, not the area — the count emphasised exactly as the
area heading is today:

| State | Peek line |
|---|---|
| Collection scope | `7 in Tel Aviv` — where `Tel Aviv` is the **collection's name**, `<bdi>`-isolated |
| Collection scope, empty | `Nothing in this collection yet` |
| Your places | unchanged (`ux-stable-area-list.md`) |

There is no up-link and no ✕ at `peek`. Leaving is the Map tab, which is on screen at `peek` and is
one thumb-reachable tap. Nothing is trapped.

**Clearing scope** has exactly two forms and neither is a new control: **Map tab** → your whole map;
**Collections tab** (or the kicker) → the index. Both are one tap from every stop.

**The tab-lighting fix that makes this honest:** on `/collections/[id]` the Collections tab is an
ancestor-section match, not the current document. It renders `aria-current="true"`, not `"page"`
(`bottom-nav.tsx:184`; the defect is already recorded in
`ux-nav-collections-routes-2026-08-29.md` §5.3). On `/collections` it stays `"page"`.

---

## 4. The place is one object — complaint (c), settled

**`PlaceDetail` is the canonical place detail and there is exactly one of it.** That is already true
in code (`collection-place-detail.tsx` renders it with `variant="hosted"`, `savedPlace={null}` and a
`SharedOnlyPlaceFacts` object). This ruling makes it a rule rather than a current fact:

1. **A collection context may only ADD, through the two existing slots** (`primaryAction`, `footer`).
   It may not reorder, rename, restyle or hide any control the canonical detail draws. A collection
   showing fewer blocks is a consequence of the data it is given, never of a `readOnly` flag.
2. **What a collection adds, and the whole list:** `Added by {name}` (suppressed when it is you);
   `Save to your places` / the saved state; the **Shared note** card; `Remove from this collection`.
   Nothing else, ever.
3. **The door between the two contexts is explicit.** When `savedByMe` is true, today's inert line
   `✓ Already in your places` becomes a control: **`Open in your places →`**, which navigates to
   `/map` with that saved place's detail open. That is the honest answer to "the same place must not
   feel like a different object" — it is the same object, seen at two scopes, with a one-tap door.
   The reverse door already exists: `AddToCollection` on the canonical detail.
4. **The privacy boundary is unchanged and is not a UX concern to be softened.** A collection never
   shows the adder's own note, visit state, tags or source link. `Open in your places` shows *your*
   row, which you own.
5. **The pane header does not jump.** The place detail's back arrow keeps the position and size of
   the list's kicker row (`collection-place-detail.tsx:116-128` already does this) so the header does
   not shift when the view changes.

---

## 5. Deletions — this is the deliverable

Reduction is the point. Each line is a removal, in the order I would land it.

**Chrome and navigation (cheap, no camera change):**

1. **The standalone document layout of `/collections`.** `collections-index-client.tsx`'s
   `flex min-h-dvh flex-col` wrapper, its `<header>`, its `<h1>Collections</h1>` and its
   `max-w-[560px]` page column. The list moves into the shell's sheet / desktop panel.
2. **The lg-only `Back to the map` arrow** — `collections-index-client.tsx:60-70`. The shell is
   behind it; there is nothing to go back to.
3. **The `Back to collections` arrow** — `collection-content.tsx:124-133`. Replaced by the labelled
   `Collections` up-link in the kicker row. Net control count unchanged; the ambiguity is what is
   deleted.
4. **`EmptyIndex`'s `Go to your map` button** — `collections-index-client.tsx:183-191`. The Map tab
   is on screen, and the map itself is now visible behind the sheet. The empty index keeps its two
   lines of copy and nothing else.
5. **`aria-current="page"` on `/collections/[id]`** → `"true"`.
6. **The `＋`'s `/import` fallback on the collection routes.** R4: one global create menu on every
   tab. Today the circle on a collection route is a one-way door that loses the collection
   (`ux-nav-collections-routes-2026-08-29.md` §5.2).
7. **The bottom-padding workaround on `Drawer.Content`** in `/collections/[id]`, once the shell is
   shared — it exists only because that route has its own sheet.

**Plumbing (costly, and the reason for §7's sequencing question):**

8. **`src/app/collections/[id]/sheet-geometry.ts`** and the second declaration of `PEEK_PX`,
   `RESTING_SHEET_FRACTION` and `FLOATING_TOP_CHROME_PX`. `PEEK_PX` is mirrored in four places and
   one of them is a licence condition (`globals.css:226-240`); this deletes one mirror, it must not
   move the value.
9. **The second `Drawer.Root`, the second desktop panel and the second `MapSurface` call site** in
   `collection-client.tsx`. One shell, parameterised by scope: `places`, `initialBounds`,
   `focusPlaceIds` and the sheet's list content.
10. **`useRefitOnChange`'s private focus slot**, folded into the shell's single camera focus slot —
    the shell already has one and the reason it must stay single is documented in both files.
11. **The below-the-fold defect on `/collections/[id]`** dies with the duplicate: the shell's
    `STOP_TO_CONTENT_HEIGHT` applies, so `Add places` stops being tappable only at `full`
    (`ux-nav-collections-routes-2026-08-29.md` §5.4).

**Not deleted, and named so nobody generalises:** the pane stack in `CollectionContent`; the
`⋯` menu; `SharePanel`; `AddPlacesPanel`; the "already in" inert row treatment; the privacy
boundary; the `/collections/join/[token]` route, which keeps **no bar and no shell** — it is a
decision screen with its own exits and §4 of the NAV-3 ruling still binds.

---

## 6. States, at every stop, in collection scope

| State | `peek` | `half` / `full` |
|---|---|---|
| Loading (route transition) | previous shell stays; no skeleton, no spinner | — |
| Collection with places | `7 in Tel Aviv` | kicker + name + meta + search + rows + `Add places` |
| Collection empty, editor | `Nothing in this collection yet` | `COLL-EMPTY-1`'s working empty state (recent places), unchanged |
| Collection empty, viewer | `Nothing in this collection yet` | "{Owner} hasn't added any places", no add affordance |
| Search with no match | unchanged line | `Nothing in this collection matches that.` |
| Collection deleted / left | — | route replaced by `/collections`; the index announces nothing extra |
| Share link, signed out | — | join route, unchanged, no shell |
| Failure (a write rejects) | — | inline `role="alert"` beside the control, as today. No toast, no retry loop |

**Motion:** the scope change is a camera flight to the collection's bounds — the shell's existing
`fitBounds`, existing easing, existing `prefers-reduced-motion` behaviour. **No new animation is
introduced by this ruling.** The list swap is a plain re-render (R6). Nothing crossfades, nothing
staggers, no badge rolls. Under `prefers-reduced-motion` the camera jumps rather than flies, which
is what the shell already does.

**Accessibility:** the sheet's list stays the accessible representation of the map (R26). Focus on a
route-level scope change moves to the sheet's `<h2>` (`tabIndex={-1}`, no scroll) — the list beneath
it changed completely. Pane push/pop keeps today's focus behaviour. No live-region traffic is added;
a route change announces itself (R27). Every control named here is ≥44×44 (R30) and none is nested
inside another control's target (R31).

---

## 7. What is the owner's call, and what I am ruling myself

**I am ruling** — no owner input needed: everything in §1–§6. IA, the two-layer model, the meaning of
each exit, the deletion list, the header composition, the `Open in your places` door, and the rule
that a collection may only add to the canonical place detail through its two slots.

**Genuinely the owner's** (`working-agreement.md` §7):

1. **Sequencing.** This is a refactor of shipped, working L2 code. `L1-F8-T1` is unbuilt, four graded
   artefacts do not exist, and CI is not running. My recommendation is to land §5 items 1–7 now —
   they are chrome and route semantics, they discharge complaints (a), (b) and (c), and they touch no
   camera constant — and to hold items 8–11 until L1 is closed. Splitting it that way is my
   recommendation; **spending the time at all is the owner's call.**
2. **Whether the Collections tab survives.** If a collection is a scope, an argument exists that the
   index belongs in the create menu rather than in a third tab slot. I am **not** proposing that —
   R2 is the owner's ruling and I am keeping it — but if the owner wants the bar down to two tabs
   plus `＋`, this ruling is compatible with that and nothing above has to change.
3. **`/collections/[id]` as the permanent public URL.** Share links are in the wild; I rule keep it.
   Moving to `/map?collection=` would be a product decision about link stability, not a UX one.

**Flagged, not decided here:** O12 (should the country→city grouping return inside collections)
is untouched by this ruling and neither easier nor harder after it.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-30 | Created for `NAV-2`. Ruled: one shell, a collection is a **scope** on it and the collections index is the sheet's list, not a page; **two layers maximum** (shell → one pushed pane) with **exactly one back-shaped control on screen at any moment**; every route-level back arrow deleted in favour of the Map tab (clear scope), the Collections tab (the index) and a **labelled `Collections` up-link** in the sheet's kicker row; scope displayed in the sheet header, never as a floating chip over the map, with `FLOATING_TOP_CHROME_PX` held at 0; `aria-current="true"` on `/collections/[id]`; the canonical `PlaceDetail` may only be **added to** by a collection, through its two existing slots, and `Already in your places` becomes the explicit door `Open in your places →`; and an eleven-item deletion list split into cheap chrome work and costly plumbing work. Superseded `ux-nav-collections-routes-2026-08-29.md` §1's "the back arrow stays" |
