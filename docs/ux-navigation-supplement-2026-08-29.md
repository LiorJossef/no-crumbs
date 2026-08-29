# Navigation supplement — layering, empty states, stacked sheets

> Owner: UX / Interaction. Date: **2026-08-29**. Task **LIBRARY-IA-2-NAV**, supplement.
> Status: **rulings.** No shell, nothing verified at runtime. Arithmetic below is over values read
> off the code at the lines cited.
>
> Companion to `ux-navigation-structure-2026-08-29.md`, which is not edited. §1 here **replaces the
> reasoning** in that document's §1.1–§1.2 while leaving its ruling unchanged; §2 and §3 are new.

---

## 1. The bar floating over a raised sheet — it works for them, it does not work for us

**Ruling: layering does not discharge the collision. `ux-navigation-structure-2026-08-29.md` §1
stands unchanged — three slots in the peek row, no bar.**

But the coordinator is right that this observation kills something, and I want to be exact about
what. My main document said the refusal survived on one of its three original premises. **That
premise is now dead too.** "It collides with the peek stop" was a *space-reservation* argument, and
the screenshot proves space reservation is not required: a floating bar is a layer, not a row, and
the sheet need not shorten for it.

So all three of `collections-nav-row.tsx:3-9`'s stated costs are now gone. The refusal survives on
two costs that document never named, both of which the layering evidence *creates* rather than
removes.

### 1.1 Cost one: it puts a dead zone in the scroll, and at `half` that is disqualifying

A bar floating over the sheet cannot be tapped through, so the list must pad its bottom clear of it
— currently `pb-[calc(env(safe-area-inset-bottom)+1rem)]` (`place-sheet.tsx:394`). Additional
padding needed: a ~56 px pill + 12 px inset + 8 px clearance, less the 16 px already there ≈
**+60–76 px of scroll viewport that can hold content but can never be touched.**

Against the measurements in my audit §1.4 (header block 182 px, 812 px viewport):

| Stop | Scroll viewport today | With a floating bar | Rows visible at `min-h-16` |
|---|---|---|---|
| `half` (0.55) | 265 px | **189 px** | **4 → 2.9** |
| `full` (1.0) | 630 px | 554 px | 9.8 → 8.6 |

Twelve per cent at `full` is a fair price. **Twenty-nine per cent at `half` is not**, and `half` is
not a minor stop: it is where a place selection lands (`place-sheet.tsx:189`) and where I ruled an
area tap should land (audit §1.2). Three rows is a list you cannot read.

Their design does not pay this because **their sheet is not a full-screen surface**. Ours drags to
`1.0` (`place-sheet.tsx:87`) and covers the viewport including the safe area. Layering relocates the
collision from "two bands stacked at the bottom" to "a dead band inside the scroll"; it does not
remove it.

### 1.2 Cost two: a control parked in the flick zone

The bottom ~80 px of a phone screen is where a scroll gesture starts and ends. A floating bar is
**not inside the sheet**, so vaul's drag arbitration (`place-sheet.tsx:5-10`) does not apply to it:
a fling that begins on the bar is not a sheet drag, not a list scroll, and on release is a candidate
tap. That is a gesture conflict between scrolling and navigating, in the band where scrolling
happens most, on the product's primary surface. It is exactly the class of thing this role exists to
refuse.

Their bar avoids it because their list is a page that scrolls behind a fixed pill on a screen with no
drag semantics. Ours would be a pill over a surface that is *itself* draggable — two gesture systems
overlapping in one 80 px band.

### 1.3 Cost three, unchanged: it forces a navigation-model change on `/collections`

Restated only because it is the one cost that is independent of geometry. A persistent bar has to be
persistent on `/collections` too, and then `collections-index-client.tsx:59-68`'s back arrow and the
bar's Map slot are two controls going to the same place, one a stack and one not.

### 1.4 What we give up by refusing, stated honestly

The bar's only marginal gain over three slots in the peek row is **reachability while the sheet is
raised**. That is a real thing and I am declining it deliberately: you navigate between destinations
from rest, not from thirty rows into London, and if you are there, one drag down is the same gesture
you would use to look at the map anyway. Buying that convenience costs 29 % of the `half` stop and a
gesture conflict. The trade is clearly bad.

The three-slot peek row delivers the thing the owner actually asked for — **one tap to Collections
from the state the app opens in** — at zero pixel cost, with no gesture conflict, and without
touching `/collections`' model.

### 1.5 If the owner still wants the bar, this is the only honest version

Not offered as a hedge; offered so the choice is informed. **Do not build a bar that floats over a
sheet.** Build this instead, or nothing:

- The bar is the resting chrome and the sheet's deepest stop becomes `calc(100dvh − bar band)`, so
  the bar is never over content and there is no dead zone.
- **The peek stop is deleted.** Its two jobs — the heading-as-expander and `Add a TikTok` — move into
  the bar, which is what makes this coherent rather than two stacked bands.
- `/collections` grows the same bar and loses its back arrow.

Cost, so nobody discovers it mid-branch: `PEEK_PX` is mirrored in **four** places
(`place-sheet.tsx:80`, `query-rect.ts:47`, `globals.css:237-240`, `collection-client.tsx:28`), one of
which is the CARTO/OSM attribution padding and therefore a **licence condition**
(`globals.css:226-232`). It moves the query rect, `fitBoundsPadding` and the camera budget together,
on the path that has already produced two measured camera bugs. Plus a navigation-model change
across four routes.

That is a multi-day task with its own verification matrix, not a variation on `NAV-1`. Call it
**`NAV-ALT`** and treat it as an owner decision, not an implementation choice.

---

## 2. The empty collection that does the work — **adopt**, and it is the best idea they have shown us

**Ruling: adopt for `/collections/[id]` at zero. Refuse for the empty library. New task
`COLL-EMPTY-1`, independent of both the band and the nav work — not `LIBRARY-IA-2b`, which is the
off-screen camera recovery and shares nothing with this but a sense of emptiness.**

### 2.1 What we have

`EmptyCollection` (`collection-content.tsx:235-264`) is already better than the category norm: it
says *"Nothing in this collection yet."*, explains the shared consequence (*"Add places from your map
and everyone here will see them"*), and offers `Add places`, which opens the picker **in place** as a
view swap rather than navigating. One tap to a working surface, and `collection-content.tsx:216`
already shows discipline about not putting two identical primaries on one screen.

So this is not a broken state. It is an **instruction where it could be a working surface**, and
that is the whole of their improvement.

### 2.2 Why it is right, and why it costs nothing

`AddPlacesPanel` already receives the caller's whole library (`collection-content.tsx:487`), which
arrives `created_at desc` from `getSpots`. "Your three most recent places" is `library.slice(0, 3)`.
**No new stored field, no new query, no migration, no model call.** The empty state stops describing
the next step and becomes the next step.

It also fits the product's own posture better than the copy does: we already argue that the most
recent saves are the only reliably actionable set (`ux-library-at-scale.md` §1.1).

### 2.3 Where I change their design, and why

**One target per row, the whole row — not a trailing `+` button.** Their row has a nested `+` on the
trailing edge. We closed that pattern deliberately: a small control nested inside a row's own button
is under the touch floor and is a nested-interactive element (`ux-library-at-scale.md` §3.1, and
`place-enrichment.tsx`'s deferral before it).

We do not need it. On this surface the row is **not** an entry point to place detail — there is no
detail to open, you are building a collection — so the row's single full-width target *is* "add this
one", and the `+` is an affordance glyph at the trailing edge, `aria-hidden`, not a second target.
Same result, no nested interactive, 64 px of target instead of 24.

**After a tap the row stays and marks as added** — a check in the leading slot, inert — rather than
vanishing. That is the treatment `AddPlacesPanel` already uses for places already in the collection
(`collection-content.tsx:581-583`), and its reason applies here too: making the no-op visible rather
than mysterious. A row that disappears under the finger also shifts the two rows below it into the
tap that is still landing.

**Copy stays ours.** `An empty collection full of possibilities` is not our voice — it is a slogan
where we would state a fact. Keep the existing heading; replace the instruction line with the
working block:

```
Nothing in this collection yet.

Add some of your recent places
  ◍  Anat Bakery        Bakery · Tel Aviv-Yafo        +
  ◍  Tokii              Restaurant · Tel Aviv-Yafo    +
  ◍  HaKosem            Falafel · Tel Aviv-Yafo       +

              [ Add places ]        ← still there, for everything else
```

Viewer role (`canEdit` false, `collection-content.tsx:247`) keeps the existing "hasn't added any
places" branch and gets **none** of this — offering an add affordance to someone who cannot add is a
broken promise with a tap target on it.

### 2.4 Explicitly refuse the same pattern on the empty library

`NoPlacesYet` (`place-sheet.tsx:695-709`) must **not** grow a "here are some places" block, and the
distinction is not cosmetic:

- An empty **collection** has a source to draw from — your own saved places.
- An empty **library** has nothing. There is no content to offer.

Offering anything on the first-run screen would mean inventing it — suggested places, popular spots,
a starter set — which is recommendation, which the anti-user rule forbids outright. The empty library
screen's own header already says why it carries nothing (`place-sheet.tsx:690-694`: no carousel, no
checklist, no `0 places`, no illustration). That stands, and this ruling is the reason it will keep
standing when someone reads the collection version and generalises it.

`EmptyIndex` on `/collections` (`collections-index-client.tsx:153-179`) also stays as it is: creating
a collection is one field, and the composer is already inline below it. Nothing to improve.

---

## 3. The stacked `Collaborators` sheet — **confirmed reject**, and we already have the better version

The coordinator's read is right and I have nothing to add against it, so: **confirmed.**
`ux-library-at-scale.md` §6 forbids a sheet stacked over the places sheet by name, and
`use-non-modal-background.ts` exists because a stacked drawer once marked the whole `<main>`
`aria-hidden` and made the map page unreachable to a screen reader. That guard is a **regression
test**, not a comment — a second stacked surface is a second chance at a failure we have already
had once.

Worth adding only this: **we already ship their feature, with the better mechanic.** `SharePanel` is
a view swap inside the surface the user is already in (`collection-content.tsx:65-77`), and that
file's header states the rule and cites the same guard (`collection-content.tsx:3-15`): *"Every view
here replaces the content of the surface it is already in… It never opens a second overlay."*

So this is not a feature we are declining on principle and paying for. It is a mechanism we have
already refused, with the capability already built behind a back control instead of a stack. No
change.

---

## 4. Net effect on the plan

| | Change |
|---|---|
| `ux-navigation-structure-2026-08-29.md` §1 ruling | **Unchanged** — three slots in the peek row. |
| Its §1.1–§1.2 reasoning | **Replaced by §1 here.** All three of the original refusal's costs are now dead; the refusal stands on the `half`-stop dead zone, the flick-zone gesture conflict, and the `/collections` model cost. |
| Its §5 sequencing | **Unchanged.** Nothing enters `feat/country-band-map-layer`. |
| New | **`NAV-ALT`** (§1.5) — the only honest bar, as an owner decision with its cost stated, not an implementation option. |
| New | **`COLL-EMPTY-1`** (§2) — the working empty collection. Independent of the band and of nav; can run in parallel with either. No new field, no migration. |
| New | An explicit refusal of the same pattern on the empty library (§2.4), recorded so it is not generalised later. |
| `Collaborators` | **No change.** Confirmed reject; the capability already exists as a view swap. |
