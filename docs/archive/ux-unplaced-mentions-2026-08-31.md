# The surface for what we could not place — spec for `place_mentions`

> Owner: `ux-interaction`. Date: **2026-08-31**. Status: **spec for implementation**, one pass.
> Task `i6-mentions-ux`. No shell — nothing here is verified against the running app.
>
> Base: `entity-proposal.md` §E1/§10, `security-ruling-e1-caption-retention.md`,
> `product-edge-2026-08-31.md`, `evidence/competitors/01-assertion-audit-2026-08-31.md`,
> `voice-and-vocabulary.md`, `product-ruling-after-the-save.md` §1, `_lib/drawer-view.ts`,
> `collections-scope.tsx`, `no-places-screen.tsx`, `candidate-card.tsx`, `ux-import-review-screen.md`,
> read at `1b79e9c` on `no-crumbs-implementation`.
>
> Pattern followed throughout: `ux-import-review-screen.md`. Every state named — loading is not
> applicable here (this is a client-rendered list over already-fetched rows), but loading, empty,
> partial and failure are all covered where they exist.

---

## 1. The ruling: what this surface *is*

**It is a to-do list with a memory's voice, and it is real scope, not a log.** Stated against the four
framings the dispatch offered, in order, because the dispatch asked for a pick and a rejection, not a
survey.

**Rejected: "nothing — surfaced only at the moment of failure, never accumulated."** This is the
version that keeps `0031` a table with no reader forever, and I am not recommending it, for three
reasons that are all already on the record and that I am not re-deriving:

1. `product-edge-2026-08-31.md` §2 and §4 item 2 rule that the *retain-what-failed* half is now the
   only candidate left in the repo that could make the edge sentence true against the three
   competitors who do this exact job — and a half that is never read is not retained, it is deleted
   on a longer timer.
2. `security-ruling-e1-caption-retention.md` priced permanent retention as cheap and approved
   specifically *because* it is a relocation to a row that gets a UI — a table kept forever and never
   surfaced is the worst of both trades: the privacy cost of §1–§9 with none of the product benefit
   §0 approved it for.
3. `mvp-plan.md` already rules the no-places screen a core surface at a 73% hit rate. The screen's
   own third action — *keep for later* — makes a promise the moment it is tapped. A verb with no
   destination is a lie in the interface, which is exactly the class of thing this product refuses to
   ship (`voice-and-vocabulary.md` §1).

So: real scope, with its own addressable view. Recorded as the explicit disagreement the dispatch
asked for, not a hedge.

**Rejected as the primary home: provenance on the place that did resolve.** A mention that shares an
import with a place that *did* resolve is real and worth a small echo (§7), but it cannot be the
*primary* surface: on a modal import the failure rate is close to 100% of that import's own
candidates, and a large share of imports resolve nothing at all — an import with zero successful
places has no place to hang its mentions beside. Tying the primary surface to a resolved sibling would
make the majority case invisible, which contradicts the entire premise this table was built for.

**Rejected as a pure memory with no exit mechanic.** "This caption mentioned Café Levinsky and we
couldn't find it" is true and worth keeping, but a memory with no way to *act* on it is `imports`
under a new name — a fact retained and never used. `product-ruling-after-the-save.md` §1 already
diagnosed this exact disease in the main library: an append-only list with no completion state gets
harder to use exactly as it gets more valuable. A pure-memory reading repeats that mistake on a
smaller table.

**The ruling.** It is a **to-do**, mechanically: a row exists because the user asked to keep it, it
has exactly one useful next action, and it leaves the list the moment that action is taken or the
user declines it. But it is written like a **memory**, not a task: the row states what happened
("this caption said…"), never what is owed ("2 items need attention"), and nothing on it reads as
a chore, a badge, a streak or a count that competes with the places header. The mechanic answers the
graveyard risk; the voice answers the "does it feel like something I have" question. Both are load-
bearing and neither is optional — a to-do voiced like a chore reintroduces the graveyard psychologically
even where the exit mechanic prevents it structurally.

**One structural decision this ruling depends on, stated because it is the thing that actually stops
the graveyard.** A mention is created **only** by an explicit user tap — never automatically on every
failed import. `entity-proposal.md` §10.4 already ruled this for the deletion copy's sake and it is
the single most important fact in this document: at a ~73% failure rate, an automatic mention on every
miss would flood the list with things the user never asked to keep, and the list would be exactly the
pile `product-ruling-after-the-save.md` §1 diagnosed, at population speed nothing else in the product
runs at. **This surface only ever contains what the user chose to keep**, which is why a row can be
written in the voice of "I have this" rather than "the system generated this."

---

## 2. Where it lives

**A fourth `DrawerView`, not a route, not a third permanent tab.**

`_lib/drawer-view.ts`'s `DrawerView` union gains a fourth arm:

```
| { readonly kind: 'mentions' }
```

addressed at `/map?view=mentions`, sibling to `index` and `collection`, built the way
`collections-scope.tsx` builds those two: a scope hook that returns `null` on every other view and
does almost nothing there, so the cost of this surface is paid only by the person looking at it. This
is the "architecturally cheap" fourth view the dispatch named, and the reasoning in `drawer-view.ts`'s
own header — one segment, no remount, no flicker — applies unchanged.

**It is not a third segment on `DrawerViewSwitch`.** That pill is `Places` / `Collections`, both
permanent, always-populated concepts. A mentions arm would either show `0` most of the time — which
`bottom-nav.tsx`'s own rule already names: *"an empty tab is a promise"*, one level down — or would
need to hide itself conditionally inside a control that is not built to do that. Instead:

- **Entry point, conditional, in the places view only** — a single summary row at the **bottom of the
  saved-places list**, after every place row (and after `Everywhere else`, where it renders). Rendered
  **only when the open-mention count is greater than zero.** Nothing else on the places view changes.
- **Also present on the empty-library state**, below the primary `Add a TikTok link` button, and
  **only** when the count is greater than zero — the one deliberate amendment to `NoPlacesYet`'s
  otherwise-closed *"nothing else appears here on purpose"* rule (`place-sheet.tsx`). This is the
  highest-value placement in the whole spec: a first session that pastes six links and resolves zero
  places is the scenario `entity-proposal.md` names as the reason to build this at all, and it is
  exactly the screen a zero-place, six-mention session lands on.
- **Never in the `peek` stop.** `PEEK_PX` is a licence-mirrored constant and the peek row's one line is
  already spoken for (`{n} places` / `+n more elsewhere`). This surface waits for `half`/`full`, where
  the rest of the list already lives.
- **Never inside a collection or the collections index.** `security-ruling-e1-caption-retention.md`
  §4 makes this a security constraint, not a preference — a mention is import history and import
  history is never disclosed to a collection peer.
- **The map behind the drawer does not change on entry.** A mention has no coordinate
  (acceptance criterion 2/4, unchanged), so there is nothing to frame and nothing to draw. The camera,
  the pins and the canvas's accessible name stay exactly as the places view left them — the same
  `pins === null` "do not touch this view's camera" rule `useCollectionsScope` already applies to the
  places view itself. A frozen, unchanged map behind this list is not an oversight; it is the honest
  consequence of criterion 4, visible rather than merely tested.

### 2.1 The summary row (places view, both the sheet and the `lg+` panel)

```
⊘  3 not on the map yet                                              ⌄
```

- `MapPinOff` glyph, 16px, muted — the same glyph `candidate-card.tsx` already uses for "no
  coordinates", reused rather than invented so the meaning is already familiar the first time a user
  sees it.
- `{n} not on the map yet` — bold count, quiet rest, the same split as the peek row's own
  `{n} places` (`place-sheet.tsx`). One clause, states a fact, stops.
- A trailing chevron (`ChevronRight`, matching the collections-index row it is styled after — not
  `ChevronUp`, which this codebase reserves for "pull the sheet up").
- **Solid list-row styling, not the dashed "add new" treatment.** Dashed borders in this system mean
  *"tap to create something that doesn't exist yet"* (`New collection`); this row points at content
  that already exists, so it takes the plain hover-row treatment `collections-index-list.tsx`'s
  collection rows use — `min-h-14`, full-width, `PRESS_ROW`.
- Accessible name: `Show what's not on the map yet, 3 kept for later` — the count and the verb both
  present, because a screen reader user gets exactly one string and it has to carry both facts.
- Tapping it navigates to `/map?view=mentions` (a real `<Link>`, matching every other drawer
  navigation in this product — it must work with hydration killed).

### 2.2 The mentions view's own header

No `DrawerViewSwitch` on this view — it renders neither `Places` nor `Collections` as current, and a
two-arm control with neither arm lit is a worse affordance than no control. Instead, the header this
view owns is a **back row**, the same shape `place-desktop-panel.tsx`'s `ChevronLeft` / `Back to your
places` already uses for a pushed pane:

```
‹  Not on the map yet
   3 kept for later
```

- `IndexHeading` pattern from `collections-index-list.tsx`: `h1` at `stop === undefined` (the `lg+`
  panel), `h2` in the sheet — same size step, same reasoning, so a screen reader gets one correct `h1`
  per document regardless of viewport.
- Subtitle line, quiet, states the count again in words rather than digits-only chrome:
  `{n} kept for later`. (Not `{n} not on the map yet` twice in one screen — the heading already says
  that; the subtitle earns its line by saying something the heading didn't: how many.)
- Back control returns to `/map` (places view), a real link, not a client-only "go back" — the same
  reasoning `drawerHref` already documents for every other transition here.

---

## 3. The row

Two variants, one from each producer. Both share the container, the dismiss control and the exit
mechanics; they differ in what they have to show, because one has a caption to draw from and one does
not.

### 3.1 Variant A — named (the TikTok arm; `rawName` present)

```
┌──────────────────────────────────────────────────┐
│  "הכוסם"                                          │  ← quoted, rawName only — §3.3
│  Tel Aviv                                         │  ← cityHint, only if extracted
│  From @exploringlondon's TikTok video ↗           │  ← source line, opens the video
├──────────────────────────────────────────────────┤
│                                          Not this one │  ← dismiss, zone B
└──────────────────────────────────────────────────┘
```

- **Quoted text is `rawName` and only `rawName`**, per `security-ruling-e1-caption-retention.md` §3's
  accuracy constraint: quotation marks assert a quotation we actually took, and every other field on
  this row is our own reading, not the caption's words. `<bdi>` around it — it is very often Hebrew
  (`הכוסם`) inside an LTR row, and the same defect the collections rows already guard against
  (`collections-index-list.tsx`'s own comment on this) applies here identically.
- **Hint line** — `cityHint` if the extraction carried one, else `areaHint`, else nothing. Never
  `addressHint` on this row: an address implies a precision this entity does not have and is not
  needed to identify *which post* this is — that precision belongs to the manual-add search the row
  hands off to, not to this list.
- **No stated reason.** No "we couldn't match this", no "only mentioned in a hashtag", no per-row
  explanation of *why* it has no coordinate. This follows `no-places-screen.tsx`'s own precedent
  directly: individual failure reasons were measured wrong four times out of four
  (`spec-no-places-found.md` §3.2, cited verbatim in that file's header) and the section heading this
  row sits under — `Not on the map yet` — already states the one fact that is reliable. Repeating an
  unreliable claim on every row is worse than silence.
- **Source line is the honest recovery, not decoration.** `From @{handle}'s TikTok video` /
  `From this TikTok video` on `authorHandle` absence — the exact fallback `no-places-screen.tsx`
  already uses for `sourceLabel`, reused rather than re-invented. It is a link (`↗`), opens the
  original post in a new tab, `referrerPolicy="no-referrer"` matching every other TikTok-CDN reference
  in this codebase, and it is a *sibling* of the row's own tap target — the two-zone
  button-plus-link DOM shape `candidate-card.tsx` and `ux-import-review-screen.md` §3.4 already
  specify, for the same reason: a `<button>` may not contain an `<a>`.
- **Zone A (the row body, minus the source line) is the primary tap target.** It opens manual add,
  prefilled — §4.
- **Zone B is `Not this one`** — the dismiss action, §5.

### 3.2 Variant B — link only (the non-TikTok arm; no caption, no `rawName`)

For the case `sources` cannot hold at all: an Instagram or YouTube link, recognised and redirected
per `mvp-plan.md` §2, with nothing extracted because there was never a caption to read.

```
┌──────────────────────────────────────────────────┐
│  An Instagram link                                │  ← what we know, stated plainly
│  We don't read Instagram videos yet.              │  ← the same capability line UNSUPPORTED_HOST
│                                                    │    already ships, reused verbatim
├──────────────────────────────────────────────────┤
│  Open the link ↗              Not this one        │
└──────────────────────────────────────────────────┘
```

- **No quotation marks anywhere on this row.** There is nothing verbatim to quote — we never read the
  post — and quoting a URL or a platform name would be exactly the false-quotation error §3's rule
  exists to prevent.
- **Title line names the platform, as a fact, not a name we invented for the thing.**
  `An Instagram link` / `A YouTube link`, matching how `UNSUPPORTED_HOST`'s own headline already talks
  about it (`That link isn't from TikTok.`) rather than inventing a second phrasing for the same fact.
- **Body line is the existing capability disclosure, copied rather than rewritten**:
  `We don't read {Instagram/YouTube} videos yet.` — the `.` "yet" is load-bearing exactly as
  `spec-no-places-found.md` §5.1 already rules for the sibling case; it states a capability limit, not
  a promise.
- **There is no tap-to-prefill here — there is nothing to prefill.** The row's primary action is
  `Open the link ↗`, the same honest-recovery move `import-error-copy.ts`'s `open_link` already is for
  `UNSUPPORTED_HOST`: leaves the product, and says so with the arrow rather than pretending it does not.
- **A secondary text action, `Add a place you know`, opens manual add empty** (no prefill — there is
  no name to prefill it with). This is the same secondary offer `no-places-screen.tsx` already renders
  as `Add a place you know`; reused verbatim rather than invented.
- **Zone B is still `Not this one`.**

### 3.3 What never appears on either variant

No category. No address. No pin, no map thumbnail, no "confidence". No count that competes with the
places header (`entity-proposal.md` §9.2 excludes this explicitly — the mentions count lives only on
this row and this view's own subtitle, never beside `N places`). No badge, no chip, no colour that
implies a state machine with more than two exits. No relative timestamp ("2 days ago") — it adds a
second axis of information this list does not need to sort by (§6) and reads as a countdown, which is
exactly the pressure this design is built to avoid.

---

## 4. Resolving a mention — the primary exit

Tapping zone A on a named row (§3.1) opens the **same manual-add surface** the no-places screen
already ships (`add-by-name.tsx`), hosted inside this view rather than a new component.

**One new prop it needs, and it is small:** `initialQuery: string`, prefilling the search field with
`rawName`. Everything else about that component — no autofocus-on-arrival avoidance does not apply
here (this is not a screen 73% of imports land on uninvited; it is a screen the user navigated to on
purpose, so the field **may** autofocus, reversing that component's own no-autofocus rule for this one
host only, because the reason for that rule — an uninvited keyboard over content the user needs to
read — does not hold when there is no caption to read and the user came here to search) — the search
debounce-free single-lookup discipline, the offline check, the zero-results handling, the `Adding…`
phase — is unchanged. `cityHint`, if the row has one, feeds the same optional scoping prop the
no-places-screen host already wires.

**On a successful add — `saved` or `already_saved` — the mention closes and the user leaves this
screen entirely.** This is a deliberate asymmetry with dismissal (§5), not an inconsistency:

- The mention's pointer is set server-side (per `security-ruling-e1-caption-retention.md` §4, the
  pointer is server-written; there is no client grant on it).
- The drawer returns to the places view (`/map`), and the camera flies to the new pin — the exact
  choreography `no-places-screen.tsx`'s own `onAdded` contract already runs: *"a save from here is not
  a lesser save."* A mention that resolves deserves the same payoff a review-screen save gets, not a
  quieter one.
- If `alreadySaved` comes back true (the user had already saved this place some other way), the
  mention still closes and points at the existing row — resolving is "this is now a place on your
  map", not "this created a new place."

**Why exit rather than stay and remove the row in place.** Resolving is the payoff moment; staying in
a to-do list after crossing an item off is a worse feeling than being shown the thing you just gained.
Dismissal (§5) is the opposite kind of moment — it has no payoff to fly to — and stays in place for
exactly that reason. The two exits are not meant to feel the same, and building them identically would
flatten a distinction worth keeping.

---

## 5. Dismissing a mention — the second exit, and why it has no confirmation

`Not this one`, zone B, on every row regardless of variant. A single tap, ≥44px target, no dialog, no
"are you sure", no undo toast.

**Why no confirmation, stated rather than assumed.** This app already rules "no confirmation, ever, on
deselect" for the review screen's own toggle (`ux-import-review-screen.md` §3.4) on the grounds that
the action is cheap to reverse and low stakes. Dismissing a mention is lower stakes than that: nothing
the user has *made* is destroyed. Acceptance criterion 9 (carried from `entity-proposal.md` §9.1)
already guarantees the source TikTok, the caption and the original post are all untouched by a
dismissal — the only thing that disappears is our own note that we noticed it. If the user changes
their mind, the TikTok link still exists wherever they found it, and pasting it again and tapping
*keep for later* a second time reproduces the row. Nothing is unrecoverable in the sense that matters.
A confirmation dialog here would be ceremony over a decision that costs the user nothing to redo.

**No undo toast, and this is a scope decision, not an oversight.** A toast-with-undo pattern does not
exist anywhere else in this codebase (checked: no toast component, no snackbar). Building one for this
single control would be new UI infrastructure introduced to soften an action this document has just
argued is genuinely low-stakes — solving a problem the design does not have.

**Motion.** The row collapses in place — height and opacity, the small/reveal tier already used for
`LEAVE_REVEAL`-class removals elsewhere in this codebase, not a new timing value. The user stays on
the mentions view and can dismiss several rows in a row without being returned anywhere, which is the
point: triage is a batch activity and should not be interrupted after every item the way a resolve is.

**What actually happens to the record.** Left to `supabase-database`: either a hard `DELETE` (the
grant `security-ruling-e1-caption-retention.md` §4 explicitly permits) or an UPDATE to a
dismissed/state column (the grant §4 also describes). **The UX contract is behavioural and does not
depend on which:** once dismissed, a mention never appears in the open list again
(acceptance criterion 9's "dismissal is not deletion of what it came from" governs the `sources`/
`imports` rows, not this one), and no other surface is affected. See §8 for why this choice is not
actually free from my side.

---

## 6. Ordering, and what this list deliberately does not have

**Newest first**, matching the product's existing default sort (`recent` is the library's own
default). No sort control, no filter chips, no search field. This list is small by construction — it
only ever contains what the user explicitly chose to keep, per §1's structural ruling — and adding
retrieval machinery to a list that structurally cannot grow the way the main library does is scope the
entity does not need. If usage ever proves this list routinely holds dozens of rows, that is new
evidence and a new document; nothing here should be pre-built against a scale this design is arguing
should not happen.

No virtualisation, matching the review screen's own `N ≤ 8` reasoning extended to whatever this list's
real population turns out to be — revisit only with a measured row count that needs it.

---

## 7. The one thing added elsewhere: an echo, not a second home

Where a `saved_places` row's detail sheet (`place-sheet.tsx`) is showing a place that came from a
source with **other** mentions still open — i.e., the same TikTok named more than one place and only
some resolved — a single quiet line may appear under the existing "from the post" quote block:
`This TikTok also mentioned 2 more.` No count competing with the places header (this is a fact about
one place's detail, not a library-level count), no coordinates implied, no link to anywhere but the
mentions view itself. This is genuinely optional relative to everything above — §2's drawer view and
§3's rows are the whole of what ships if this is cut, and cutting it costs nothing on the primary
path. It is named here rather than left for someone to invent later and possibly invent as a second
primary surface, which §1 already rejected.

---

## 8. What would tell us this surface failed

The dispatch asked for one checkable thing, not a hope. Here it is, and it comes with a schema
implication that is not mine to rule on but has to be said because my own metric depends on it.

**The metric: whether the open-mention count is being worked down or only piling up.**
Concretely — measured periodically, no new instrumentation required beyond what the table already
carries (`created_at`, the resolution pointer, and *some* record of a dismissal):

- **Healthy:** the resolved count rises over time, even slowly, and the open (untouched) count does
  not grow without bound — dismissals and resolutions together keep pace with creation.
- **Failed — the second graveyard, precisely:** the open count grows every week, the resolved count
  stays flat near zero, and dismissals (if visible at all) are rare. That is the shape
  `product-ruling-after-the-save.md` §1 already diagnosed once, reproduced on a second table.

**The schema implication, flagged rather than assumed.** This metric needs to be able to tell
"dismissed" apart from "never existed", which only holds if dismissal is a state on a row that
survives (soft) rather than a hard `DELETE` that removes all trace of it. §5 deliberately left the
mechanism to `supabase-database`, on the grounds that the UX contract does not depend on which — but
**this metric does depend on which**, and a hard-delete implementation of dismissal would make the
"resolved vs. dismissed vs. ignored" split `product-edge-2026-08-31.md` §5 item 2 explicitly asks for
unmeasurable after the fact. Recorded here as a requirement on the metric, not a re-litigation of §5:
whichever mechanism ships, *something* — a state column, or a separate counter — has to be able to
answer "how many were dismissed" without needing the deleted rows to still exist.

---

## 9. Copy — every new string, and what it needs to pass

| Where | String | Notes |
|---|---|---|
| Places-view summary row | `{n} not on the map yet` | Digits always; bold count, quiet rest |
| Summary row a11y label | `Show what's not on the map yet, {n} kept for later` | |
| Mentions-view heading | `Not on the map yet` | `h1`/`h2` per stop, matching `IndexHeading` |
| Mentions-view subtitle | `{n} kept for later` | |
| Row, non-TikTok title | `An Instagram link` / `A YouTube link` | Matches `UNSUPPORTED_HOST`'s own naming |
| Row, non-TikTok body | `We don't read {Instagram/YouTube} videos yet.` | Reused verbatim from `import-error-copy.ts`'s `UNSUPPORTED_HOST` body, split per platform |
| Row, TikTok source line | `From @{handle}'s TikTok video` / `From this TikTok video` | Reused verbatim from `no-places-screen.tsx`'s `sourceLabel` |
| Row action, resolve | *(no label — the whole row is the target)* | Zone A carries no separate button text |
| Row action, non-TikTok primary | `Open the link ↗` | Matches `open_link`'s existing label pattern |
| Row action, non-TikTok secondary | `Add a place you know` | Reused verbatim from `no-places-screen.tsx` |
| Row action, dismiss | `Not this one` | New |
| Empty state heading | `Nothing kept for later.` | §10 |
| Empty state body | `When a caption names somewhere we can't place, you can keep it here and finish the job later.` | §10 |

**Every string above passes `voice-and-vocabulary.md` §7's checklist**: states a fact and stops, no
word from the right-hand column of §3 (no *"candidate"*, no *"pending"*, no *"queue"*, no *"retry"*,
no *"unresolved"*, no *"extracted"* — criterion 10, held), no exclamation mark, no machinery name, no
brand name, sentence case throughout, no editorialising about the place.

**Owed, not done here:** a formal row in `voice-and-vocabulary.md` §3 for `place mention` / the phrase
`not on the map yet`, per `entity-proposal.md` §7's own rule that *"a vocabulary row is owed per
entity before any string ships."* I own the strings (that document names `ux-interaction` as owner of
exactly this call) and I am ratifying them here; the table row itself lands in `voice-and-vocabulary.md`
in the same commit as the code, per that document's §6 rule, and I have no write access to it from
this task's scope.

### 10. The empty state

Rendered on the mentions view only when the count is zero — which, given §2's conditional entry, is a
state a user can only reach by navigating directly to `/map?view=mentions` with nothing kept (a typed
URL, a stale bookmark, or the last row just resolved/dismissed on this exact view). Designed rather
than left blank under a populated heading (`entity-proposal.md` acceptance criterion 11):

```
        Nothing kept for later.

  When a caption names somewhere we can't
  place, you can keep it here and finish
  the job later.

         [ Back to your places ]
```

No mascot on this state — see §11. One line stating what the feature is for (useful precisely because
this state is the one place in the product where nobody has seen this screen's job explained yet), and
a single way back. No CTA to start an import here: that action lives in persistent chrome
(`BottomNav`'s `＋`), and duplicating it on every empty state in the product is exactly the kind of
button-soup Charter §6 rules against.

---

## 11. The mascot question, addressed rather than left silent

**Ruling: no mascot mood on this surface, and not by default.** `crumb-mascot.tsx`'s own governing
rule — *"a face may only exist if there is a screen that needs it"* — and the `nothingFound` mood's
2026-08-31 admission was a three-commit, owner-level process specifically because a face at a moment
of failure is the loudest possible way to break the product's never-apologetic, never-charming-about-
its-own-shortfall rule (`no-places-screen.tsx`'s own header has the whole argument). This surface is
adjacent to that exact risk in one direction (an empty to-do list) and squarely inside the product's
edge argument in the other (`product-edge-2026-08-31.md` names this table as the sharpest thing the
product has), which makes it a worse place to spend a mascot decision casually than a better one. If
the owner wants a face here later, it goes through the same governed process `#4.4.1` documents —
not a default I am setting by using one in this spec.

---

## 12. Accessibility

- The summary row (§2.1) and every mention row (§3) are real interactive elements — `<Link>`/`<button>`
  with `<a>` siblings where needed, never a `<div onClick>`.
- Zone A / zone B split on every row, matching `candidate-card.tsx`'s established shape exactly: a
  `<button>` may not contain an `<a>`, so the source link (Variant A) and the `Open the link` action
  (Variant B) sit as siblings of the primary tap target, never nested inside it.
- `<bdi>` around every user- or caption-derived string that can be RTL: `rawName`, `cityHint`/
  `areaHint`. Never `dir="auto"` on the row itself — that would flip the whole row's alignment on a
  Hebrew mention while the dismiss control and every other row stayed left-aligned, producing the
  ragged-edge defect `collections-index-list.tsx` already documents and avoids for the identical
  reason.
- `Not this one` is ≥44px, reachable by keyboard, and its accessible name includes the place so a
  screen reader user dismissing several rows in a row hears which one they just removed:
  `Not this one — "הכוסם"`.
- The heading move on entering `/map?view=mentions` follows `useCollectionsScope`'s existing
  focus-claim pattern for entering a collection (§`ux-collections-as-scope.md` §6's mechanism, reused):
  focus moves to the view's own `h1`/`h2` on arrival, because the list beneath it changed completely.
- Dismissal is announced through the shell's existing debounced `role="status"` region, not a new live
  region — matching every other list-mutation announcement in this product.
- Focus order: back control → summary subtitle (not focusable) → rows in list order, each row's zone A
  before its zone B.

---

## 13. Motion

Two new behaviours; everything else (arrival of the view, the manual-add sheet, the camera flight on
resolve) is existing choreography reused, not reinvented.

| Moment | Intent | Timing | `prefers-reduced-motion` |
|---|---|---|---|
| Entering `/map?view=mentions` | "this is a different list, not the same one filtered" | The same `ENTER_SCREEN` swap `collections-scope.tsx` already uses for a view change — not a new tier | Opacity-only cross-fade, unchanged |
| A row dismissed | acknowledge the tap, remove the item, nothing else moves | Small/reveal tier (matches `LEAVE_REVEAL`), height + opacity | Instant removal, no collapse animation, list reflows once |
| A row resolved | the payoff — handled entirely by leaving this view for the existing save choreography | N/A here — see §4 | N/A here |

No new tier invented. No celebration animation on the row itself before it exits — the celebration is
the camera flight the resolve action already runs on the surface it lands on, and adding a second one
here would be redundant motion for the same event.

---

## 14. Acceptance criteria, specific enough to verify without asking me

Checked against a signed-in library at 390×844 and 1440×900, with at least one dismissed mention, one
resolved mention and two open mentions (one per variant) present.

1. **The summary row appears on the places view (sheet and panel) if and only if the open-mention
   count is greater than zero**, including on the empty-library state, and appears nowhere else — not
   in the peek stop, not inside a collection, not on the collections index.
2. **The summary row's count and the mentions-view subtitle's count agree**, and neither ever appears
   beside or combined with the places header's own count.
3. **`/map?view=mentions` renders with no map movement and no pin change** from whatever the places
   view was last showing — assert camera bounds and the pin set are byte-identical before and after
   the navigation.
4. **A Variant A row's quoted text is exactly `rawName`**, byte-for-byte, and no other field on that
   row is ever wrapped in quotation marks.
5. **A Variant B row shows no quotation marks anywhere**, and its title names the correct platform
   from the stored URL's host.
6. **Tapping zone A on a Variant A row opens manual add with the search field pre-filled with
   `rawName`** and, if a hint exists, the scoping behaves exactly as `no-places-screen.tsx`'s
   `cityHint` prop already does.
7. **A successful resolve (`saved` or `already_saved`) removes the mention from every future render of
   this list, closes the mentions view, returns to the places view, and flies the camera to the
   resulting pin** — assert both the row's absence and the camera's final bounds.
8. **Dismissing a row requires no dialog, produces no undo affordance, and removes the row from this
   session's list immediately**, while leaving the user on the mentions view.
9. **Dismissing a mention leaves its `sources` and `imports` rows, if any, completely unchanged** —
   assert by reading those rows before and after, not by reading the mention's own absence.
10. **No string on this surface contains the product name, an exclamation mark, or any word from
    `voice-and-vocabulary.md` §3's right-hand column or §4's banned list** — table-driven, per §9
    above.
11. **The zero-mention state on `/map?view=mentions` renders the written empty state**, never a blank
    list under a populated heading.
12. **Every Hebrew or other RTL `rawName`/hint renders inside `<bdi>`**, and the row's own layout does
    not flip — assert computed `direction` on the row container stays `ltr` regardless of the content
    inside it.
13. **The mascot does not appear anywhere on this surface** unless a separate owner ruling adds it —
    a guard, matching `no-places-screen.test.ts`'s own pattern for its screen.

---

## 15. Out of scope, so it is not absorbed

A count of mentions anywhere the places count appears (already excluded by `entity-proposal.md`
§9.2, reaffirmed by §3.3 above) · sort or filter controls on this list (§6) · a toast/undo system
(§5) · background re-matching, a retry queue, or any notification about a mention (already excluded
by `entity-proposal.md` §9.2) · relative timestamps on a row · a mascot mood for this surface without
a separate owner ruling (§11) · a third permanent segment on `DrawerViewSwitch` (§2) · showing this
surface inside a collection or the collections index (a security constraint, not a preference — §2)
· editing a mention's stored text · a category or address on a mention · the §7 echo, if it is cut
for cost, taking anything else in this document with it.
