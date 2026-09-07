# The place card, unified — UX spec

**Task** W2-H · **Author** `ux-interaction` · **Date** 2026-09-02
**Base** branch `no-crumbs-implementation`, HEAD `c78c787`
**Build owner** `design-system-frontend`. This document is the source of truth for the change; I
write no production code.

**Brief.** The owner's diagnosis of 2026-09-02 (inconsistent action components, broken RTL/LTR
alignment, typographic dissonance, uneven vertical rhythm, mixed contexts) is taken as given and is
not re-derived below. Two owner rulings constrain the answer:

1. **Labels stay, and get quieter.** The same set of section labels survives. They lose the shout.
   No label is deleted, and no label is added to a block that lacks one without the reason stated.
2. **Scope is both screens** — the Places card and the collection place detail.

---

## 0. The structural fact the brief half-states, and it changes the shape of the work

`docs/` has three times recorded a card fix landing on one host and not the other. That risk is real
but it does **not** live where a reader would guess, so this is stated once, plainly, and every task
below is written against it:

| Host | File | What it renders | Obligation in this change |
| --- | --- | --- | --- |
| H1 · `/map`, phone sheet | `place-sheet.tsx` → `PlaceDetail`, `variant="sheet"` | **the card** | changed here |
| H2 · `/map`, `lg+` map popover | `map-surface.mapcn.tsx` → `MapPopup` → the same `PlaceDetail`, `variant="popover"` | **the card**, 320 px wide | inherits H1; variant overrides re-specified in §6 |
| H3 · `/collections/[id]`, phone sheet | `collection-place-detail.tsx` → the same `PlaceDetail`, `variant="hosted"` + two slots | **the card + collection slots** | slots changed here (§4.4) |
| H4 · `/collections/[id]`, `lg+` panel | same component, same variant, mounted in the panel column | **the card + collection slots** | inherits H3 |
| H5 · `/map`, `lg+` left panel | `place-desktop-panel.tsx` | **the list column only — no card at all** | **no change** |

So: **`PlaceDetail` is already one implementation across four hosts.** The desktop card is the map
popover, not the left panel. `place-desktop-panel.tsx` renders `PlaceRow`s, a heading, a search
field and a filter bar; it contains no part of the card and must not be edited by this task.

Where drift can actually enter, and therefore what §7's acceptance list checks:

- **the two collection slots** (`primaryAction`, `footer`) in `collection-place-detail.tsx`, which
  are the one place a second visual language for a card block can be written;
- **the `variant` class overrides** inside `PlaceDetail`, which is where a fix can be made true at
  `sheet` and false at `popover`;
- **the six copies of the micro-label** (§3), which is how one type value became two spellings and
  two letterspacings.

---

## 1. Section inventory as it stands today

Order is render order. "Both" means the block is in `PlaceDetail` and therefore reaches all four
card hosts identically.

| # | Block | Where | Shape today | What is inconsistent about it |
| --- | --- | --- | --- | --- |
| 1 | Source still + Been badge + play glyph | both | 160 px band (112 at popover) | fine; not touched |
| 2 | Name `h2`, `Category · Locality`, tag chips, close × | both | 24 px extrabold; 14 px muted; chips | the category line is `dir="auto"` and flips its own alignment independently of the heading's `<bdi>` |
| 3 | Address + approximate mark | both | icon + `<bdi>` + grey pill | fine |
| 4 | `Saved from @handle` | both | 12 px muted | third distinct "quiet metadata" type value on the card (12 px here, 11 px two blocks later) |
| 5 | Action band: TikTok · Google Maps · Been here | both | three 44 px `DETAIL_ACTION_PILL`s | the only coherent component vocabulary on the card |
| 6 | `Been on …` | both | 11 px muted | correct; owner has ruled it stays |
| 7 | `primaryAction` slot | H3/H4 only | `Added by …` 12 px + full-width outline `Save to your places` | its type values are invented locally |
| 8 | Caption quote + `@handle` | both | `figure`, 2 px start rule, 14 px | fine; the one block whose shape carries meaning |
| 9 | Model's sentence (`whyGo`) | both | **unlabelled 14 px muted paragraph, 20 px of air on both sides** | the owner's "floating, completely unlabeled paragraph" |
| 10 | `2 more posts` + source rows | both | 12 px muted line + 44 px rows | the line is a section label wearing body type |
| 11 | `DISHES MENTIONED` + text line | both | local `Kicker`: `text-micro` bold uppercase `.1em` | shouty; and a *second spelling* of the same label |
| 12 | `Add to a collection` | both | **full-width 48 px boxed row, folder glyph, trailing chevron** | pattern #2 |
| 13 | `CATEGORY` + `Change` + value line | both | `SECTION_LABEL` + **inline mint text link with a 12 px pencil** | pattern #3 |
| 14 | Note — empty | both | **dashed-outline 44 px pill, `+ Add a note`** | pattern #4 |
| 14b | Note — filled | both | `YOUR NOTE` + `Edit` text link + prose | pattern #3 again, for a block that looked like pattern #4 one state ago |
| 14c | Note — editing | both | textarea + `Cancel` / `Save note` `Button`s | pattern #5 (the only Save buttons in the product) |
| 15 | `ALSO NEARBY` / `n MORE NEARBY` + rows | H1/H2 | **inline** `text-micro` bold uppercase **`.14em`** | a *third* spelling, at a different letterspacing from #11 |
| 16 | `Matched on Google Maps` (12 px) + `Saved on …` (11 px) | both | two muted lines, two sizes | two type values for one footnote |
| 17 | `Remove from your places` | both | hairline + start-aligned text button, trash glyph | pattern #6 |
| 18 | `footer` slot — shared note | H3/H4 | **bordered, muted-filled rounded card** containing `SHARED NOTE` + `Edit`; empty state is the dashed pill | pattern #7: the same field as #14 wearing a panel |
| 19 | `footer` slot — remove | H3/H4 | hairline + **full-width ghost destructive `Button`, no glyph** | pattern #8: the same action as #17, a different component |

**Count.** Nine actions on one card, drawn from **eight** different components. Five spellings of a
44-or-48 px pressable. Four type values for quiet metadata (11/12/13/14 px). Three spellings of an
11 px label at two letterspacings. One 20 px gap doing every job in the column.

That is the diagnosis in inventory form; the rest of this document is the answer.

---

## 2. The two zones, and the divider between them

The owner's fifth bullet — *descriptive place metadata blended directly into personal user
actions* — is the load-bearing one. Everything else follows from fixing it.

The card becomes **three bands, separated by two hairlines**:

```
BAND 1 — THE PLACE
  still · name · category · locality · tags
  address + approximate mark
  action bar  (TikTok · Google Maps · Been here)   ← see the trade below
  been-on line
  primaryAction slot  (collections: Added by … / Save to your places)
  ────────────────────────────────────────────  hairline A
BAND 2 — FROM THE POST                              ← absent entirely for a manual add
  “quote” + @handle
  the model's sentence                              ← stays unlabelled, see §3.4
  Dishes mentioned
  More posts
  ────────────────────────────────────────────  hairline B
BAND 3 — YOURS
  collection · category · note · shared note        ← one field-row list, flush
  record lines: Matched on Google Maps / Saved on …
  Remove from your places | Remove from this collection
```

**Hairline** — `border-t border-border/60`, spanning the content width (inset by the card's gutter,
never full-bleed; the gutter differs per variant and a negative margin would have to be re-derived
four times). 20 px above, 20 px below. Exactly two of them, and a band that renders nothing takes
its hairline with it — a hairline with no content under it is the "floating fragment" reintroduced.

**The action bar stays in band 1, and that is a deliberate exception to the segmentation rule.**
`Been here` is a personal action sitting in the descriptive band. The alternative is a measured
regression: `place-sheet.tsx:2450`–`2490` records that moving the band above the quote is what put
the card's primary actions above the fold at 390×844 (`The Laughing Yak`: 933 → 846) and what took
the popover's slack from 39 px to 122 px. The band is three one-press, no-form actions with no
field, no label and no open state; band 3 is the fields. The distinction the user experiences is
*press once* versus *edit something*, and that reads correctly. Cost, stated: a purist reading of
"segment metadata from actions" is not satisfied. I take the fold.

---

## 3. The label treatment

### 3.1 One constant, one type value

`src/ui/place/section-label.ts` keeps its name and its job and changes its value:

```
SECTION_LABEL = 'text-micro font-medium text-muted-foreground'
```

- **11 px** (`text-micro`, `0.6875rem`, `--leading-micro` 1.45) — replaces the hard-coded
  `text-[11px]`, which is the same size written a second way and is why the audit found "two
  spellings".
- **font-medium (500)**, not 700.
- **sentence case in the source string**. No `uppercase` utility, so `Your note` is what is in the
  markup and what a screen reader reads.
- **no `tracking-[0.1em]`, no `tracking-[0.14em]`** — normal tracking. Letterspaced 11 px is the
  single loudest thing on the current card.
- ink stays `text-muted-foreground`. **Builder check:** measure the light-theme contrast of
  `--muted-foreground` on `--card` at 11 px/500. If it is under 4.5:1 the fix is the token, not a
  bespoke ink on this label — raise it and report; do not fork a colour here.

Label strings, sentence case: `Category` · `Your note` · `Shared note` · `Dishes mentioned` ·
`Also nearby` / `3 more nearby` · `More posts`. No wording changes — `voice-and-vocabulary.md` §3
already ratifies each of these words; only the case moves.

### 3.2 Six copies become one, plus one deliberate survivor

| Copy | File | Disposition |
| --- | --- | --- |
| `SECTION_LABEL` | `src/ui/place/section-label.ts` | **the constant.** Rewritten as above |
| `Kicker` | `place-enrichment.tsx:339-345` | **deleted.** `DishLine` imports `SECTION_LABEL` |
| inline nearby label | `place-sheet.tsx:2726` | **deleted.** Imports `SECTION_LABEL` |
| local duplicate | `share-panel.tsx:176` | **deleted.** Imports `SECTION_LABEL` |
| `text-micro … uppercase` on three auth screens | `sign-in-client.tsx:115`, `reset-client.tsx:181`, `new-password-client.tsx:136` | **out of scope for this task, and named as a follow-up.** They are field labels and should adopt this constant, but they also carry a `group-focus-within:text-foreground` behaviour that is a form-field concern, not a card concern. Do not sweep them into this commit |
| `FILTER_KICKER` | `place-enrichment.tsx:171` | **stays uppercase, unchanged.** It labels a *filter control*, not a card section, and it lives on a surface this task does not touch |

The screen-level brand kickers (`import/screens/*`, `error.tsx`, `not-found.tsx`) are a different
device — brand ink, `.14em`, naming a whole screen. They are not field labels and they stay.

### 3.3 The one label that is re-styled rather than added

`More posts` (today `moreSourcesLine(n)` at `text-xs font-medium text-muted-foreground`,
`place-sheet.tsx:2647`) already exists as a line above its list. It becomes a `SECTION_LABEL`. This
is **not** a new label — it is an existing line given the type of the job it was already doing.

### 3.4 The one block that stays unlabelled, and why

The model's sentence (`WhyGoLine`) gets **no label**, on purpose, and this is the reason required by
ruling 1: `place-enrichment.tsx:378-390` and `enrichment.ts` carry the codebase's central invariant
— the creator's verbatim words render as a quotation, the model's paraphrase renders as quiet
unquoted prose, and *the shape is what distinguishes them*. Labelling it (`In short`, deleted for
this reason) puts a caption on the paraphrase and invites it to be read as another extracted claim.

Its *floating* is fixed by position, not by a label: it moves **into band 2 as the quote's
sibling at an 8 px gap** — directly under the `figcaption`, at the quote's own start inset, sharing
the quote's 2 px start rule region. It then reads as "and here is what that amounts to", which is
what it is. When there is no quote it renders at band 2's start with no rule and no indent.

---

## 4. One action-component vocabulary

Four shapes. Every action on both screens is assigned to exactly one of them. Nothing else may be
introduced by this change.

### 4.1 Shape A — the action pill (`DETAIL_ACTION_PILL`, unchanged)

44 px, `rounded-full`, 1 px border, 14 px bold, in one wrapping band.
**Rule: a press does the thing, immediately, with no field and no open state.**

| Action | Fill | Note |
| --- | --- | --- |
| Open on TikTok | icon only, mint ink, `border-input` | unchanged; the `aria-label`/`title` argument at `place-sheet.tsx:2514` stands |
| Google Maps | label, mint ink, `border-input` | unchanged |
| Been here / Been | `Check` + label; pressed = `bg-accent text-brand` | unchanged |

Measured width budget (333 px at 390 px viewport, 281 px at the 288 px popover column) is a
constraint on this band and may not be spent. No fourth pill.

### 4.2 Shape B — the field row (`DETAIL_FIELD_ROW`, **new, and the heart of this change**)

One shape for **everything that edits one field of your record of this place**. It replaces the
full-width boxed row, the dashed pill, and both inline `Change` / `Edit` text links.

```
┌──────────────────────────────────────────────┐
│  Category                                    │   ← SECTION_LABEL, 11px/500, muted
│  Bar · from the TikTok video           ✎     │   ← 14px/400 foreground; trailing glyph 12px muted
└──────────────────────────────────────────────┘   min-height 48px, label→value gap 4px
```

- `min-h-12` (48), full width, **no border, no fill, no radius at rest**; `rounded-lg` +
  `hover:bg-muted/60` + `focus-visible:ring-3 ring-ring/50` on interaction, and `PRESS_ROW`.
- Padding `px-1`, matching the collection row today so the label's ink aligns with the card's other
  text at the same optical inset.
- **Trailing glyph, and it names what pressing does — this is the whole disambiguation:**
  - `ChevronRight` (12 px, muted, `end`-anchored) ⇒ **pressing replaces the pane.** Exactly one
    member: `Add to a collection`.
  - `Pencil` (12 px, muted) ⇒ **pressing opens this row in place.** `Category`, `Your note`,
    `Shared note`.
- **Empty state is the same row with a muted value**, never a different component:
  `Your note` / *Add a note* · `Shared note` / *Add a shared note* · `Category` / *Not set* ·
  `Collections` / *Add to a collection*. Value ink `text-muted-foreground` when it is an offer,
  `text-foreground` when it is a value.
- Adjacent field rows are **flush — 0 px gap, no separators**. A run of 48 px rows reads as a
  structured list; 20 px between each is what makes them "floating fragments".
- Open state: the row's label stays, the value line is replaced in place by the editor (chip
  `radiogroup` for category, `textarea` for the notes), the trailing glyph becomes a text `Done` at
  11 px mint for category and the existing `Cancel` / `Save note` pair for the note. The row's
  height grows; it does not become a panel and it grows no border.
- Errors render under the row, `role="alert"`, 11 px destructive, 4 px gap.

**This overrides `ADD_NOTE_PILL`'s stated rationale, deliberately.** That constant
(`saved-place-edits.tsx:86-100`) exists to make the private note and the shared note look like one
object — a real goal, solved by inventing an eighth shape. Shape B solves the same problem *and*
the category row *and* the collection row with one component. `ADD_NOTE_PILL` is deleted, not
retained for another caller.

### 4.3 Shape C — the destructive text action

Start-aligned, above a hairline, `pt-4`: 14 px bold, `text-muted-foreground`, `hover:text-destructive`
+ underline, a 14 px `Trash2` glyph. This is `RemoveSavedPlace`'s current shape and it is correct.

`Remove from this collection` **adopts it** (today it is a full-width ghost `Button` with no glyph,
`collection-place-detail.tsx:325-338`). Two removals that look different is the confusability
`ux-two-removals-one-screen.md` §2.3 wants — but that document's protection is *position and
wording*, not *component*, and the wording already carries it: `from your places` versus
`from this collection`. Both keep their existing two-step inline confirmation unchanged.

### 4.4 Shape D — the full-width primary button, and there is exactly one

`Save to your places` (H3/H4 only): `h-11 w-full`, outline, centred, `Plus` glyph. Unchanged.
It is the only "acquire this place" action in the product and it is not a field edit; it earns the
one full-width block on the card. **No other action may take this shape.**

### 4.5 The assignment table the builder checks against

| Action | Shape | Host |
| --- | --- | --- |
| Open on TikTok | A | all |
| Google Maps | A | all |
| Been here / Been | A | H1–H4 where a saved row exists |
| Add to a collection | **B**, chevron | H1–H4 |
| Category / Change | **B**, pencil | all |
| Add a note / Your note | **B**, pencil | all |
| Add a shared note / Shared note | **B**, pencil | H3/H4 |
| Save to your places | D | H3/H4 |
| Remove from your places | C | all |
| Remove from this collection | **C** | H3/H4 |
| Play the source | (unchanged glyph on the still) | all |
| Close / Back | (unchanged; `hosted` draws none) | per variant |

---

## 5. Vertical rhythm

Five values. Nothing else appears in the card's column.

| Value | Used for |
| --- | --- |
| **0** | between adjacent field rows (shape B). They are a list |
| **4 px** | a `SECTION_LABEL` to its own value or field; a row to its own error line |
| **8 px** | siblings inside one group: quote → `@handle` → the model's sentence; the action band → `Been on …`; a label → its chip row; a label → its list |
| **12 px** | group to group *inside* a band: identity → address → action bar → primaryAction; dishes → more posts; the field-row list → the record lines → the destructive action |
| **20 px** | above and below each hairline, and nothing else |

The current `gap-5` on the card's two column wrappers is **removed**; spacing becomes explicit per
adjacency. That is the entire "uneven vertical rhythm" fix: today one 20 px gap separates a label
from a paragraph, a paragraph from a form, and a form from a delete button, so the column encodes no
relationships at all.

**Popover (H2) override:** 20 → **16** at the hairlines; 12 / 8 / 4 / 0 unchanged. Nothing else in
this spec varies by variant.

The card's gutters do not change: 20 px at `sheet`, 16 px at `hosted`, 0 with an internal 16 px at
`popover` (the still is full-bleed there).

---

## 6. RTL and mixed script

**This is a block-alignment and scan-rhythm problem, not a bidi ordering problem.**
`docs/rtl-audit-2026-08-31.md` findings 2–4 already establish that mixed-run *ordering* inside the
heading, the address and the quote is correct — `<bdi>` and the mirrored `&ldquo;`/`&rdquo;`
entities are doing their job and **none of that is touched**. What the owner is seeing is this:

on one Hebrew place the card today contains blocks that each resolve their own paragraph direction —
the heading is `<bdi>`-isolated inside an LTR column (left), `Category · Locality` is `dir="auto"`
(right), the address is LTR chrome with a `<bdi>` (left), the quote is `dir="auto"` (right), the
note is `dir="auto"` (right), the dish line is an LTR paragraph of `dir="auto"` spans (left). The
column alternates left-start and right-start six times. There is no vertical edge to scan.

### 6.1 The rule: two direction scopes, never per-block

1. **The card scope.** One direction is resolved **once**, from the place's own name (falling back
   to the address line, then to the locality), and applied to `PlaceDetail`'s scroll column as an
   explicit `dir`. Every prose block inherits it. Every `dir="auto"` on an individual block inside
   the card is **removed**: the category line, the dish line's outer paragraph, the quote, the
   `whyGo` line, the resting note paragraph.
2. **The note scope.** The user's own note — private and shared, resting *and* editing — resolves
   its own direction from the note text, once, shared by both states so the block does not jump
   when the editor opens. This is the one field the user authors, and a caret on the wrong side of
   a Hebrew textarea is a real defect, not an aesthetic one.

Foreign runs inside either scope keep `<bdi>` isolation, which is what preserves the ordering the
audit verified. Chrome inside the card uses logical properties only — `ms-`/`me-`, `ps-`/`pe-`,
`start-`/`end-`, `border-s` — and the quote's rule becomes `border-s-2` so it sits on the reading
start on both sides. `text-left` may not appear anywhere in the card.

Add `textDirection(sample: string | null | undefined): 'rtl' | 'ltr'` to `src/ui/place/` (one
helper, first strong-directional character, defaulting `ltr`) so both scopes are decided by one
function rather than two heuristics.

**Cost, stated:** a Hebrew caption quote on a Latin-named place renders with correct ordering but
LTR alignment (ragged right). That is accepted. The alternative is the per-block flipping the owner
is complaining about, and the quote's start rule marks its reading start regardless.

---

## 7. Out of scope — do not touch in this change

- `place-desktop-panel.tsx` in its entirety, and `PlaceRow` / `SelectablePlaceRow` — the list is not
  the card. `Saved 3 days ago` on the row keeps its current type.
- The peek row, the search field, `LibraryFilterBar`, `SortControl`, `FILTER_KICKER`.
- **The category colour system** — pins, chips, counts. `facelift-plan.md:144` locks it. This spec
  spends none of it: no shape here is distinguished by category colour.
- The source still: its height, its `compact` variant, the play glyph, the been badge, the refresh
  behaviour, the 160/112 px budget.
- The popover's `max-h-[min(50vh,28rem)]`, `w-80`, and scroll-fade. The fold argument is settled and
  is not reopened by a spacing change.
- The action band's membership, wording and measured widths.
- All motion: `PRESS_*`, `TINT_BEAT`, the heading's entrance, `prefers-reduced-motion` handling. No
  new animation is introduced by this spec and none is removed.
- Copy: no user-facing string changes except case (`DISHES MENTIONED` → `Dishes mentioned`).
- The auth screens' field labels (follow-up, §3.2), the import screens' brand kickers, dark theme
  tuning, and the `SharedNote` save-on-blur behaviour.
- Any data, action, policy or migration. This is presentation only; not one Server Action signature
  changes.

---

## 8. Build order — five pieces, four of them independent

The build owner is the roster's bottleneck, so this is cut to land in separate commits, and only one
edge is a real dependency.

| Task | Scope | Depends on |
| --- | --- | --- |
| **H-1** label constant | `section-label.ts` rewrite; delete `Kicker`, the inline nearby label, `share-panel.tsx`'s duplicate; sentence-case the five strings | — |
| **H-2** the field row | add `DETAIL_FIELD_ROW`; adopt in `CategoryEditor`, `NoteEditor` (delete `ADD_NOTE_PILL`), `AddToCollection` | H-1 (uses the constant) |
| **H-3** bands and rhythm | the two hairlines, the 0/4/8/12/20 scale, `whyGo` moved to the quote group, the two record lines unified at 11 px, the popover's 16 px override | — |
| **H-4** collection slots | `SharedNote` → field row; `Remove from this collection` → shape C; `Added by …` → record-line type | H-2 |
| **H-5** direction | `textDirection()`, the card scope, the note scope, remove per-block `dir="auto"`, logical properties, `border-s-2` on the quote | — |

H-1, H-3 and H-5 may be built in any order or in parallel. H-2 then H-4 is the one ordering.

---

## 9. Acceptance list

Checked at **390×844** (H1, and H3 via a collection) and **1440×900** (H2 the map popover, and H4
the collection panel). Every item is observable on screen; none is satisfied by reading the diff.

**Labels**

1. No uppercase text appears anywhere inside the card on any of the four hosts.
2. Every section label renders at 11 px / 500 / normal tracking / muted, and there is exactly one
   class string in `src/` producing it.
3. `grep` for `tracking-[0.1em]` and `tracking-[0.14em]` returns no hit in `place-sheet.tsx`,
   `place-enrichment.tsx`, `saved-place-edits.tsx`, `collection-place-detail.tsx`, `share-panel.tsx`.
4. `text-[11px]` appears nowhere in those five files.
5. A screen reader reads `Your note`, not `Y O U R  N O T E` or `YOUR NOTE`.

**Action vocabulary**

6. Exactly four pressable shapes exist on the card: the 44 px pill band, the 48 px field row, the
   destructive text action, the one full-width primary button.
7. `Add to a collection`, `Category` and `Your note` are visually the same row, differing only in
   label, value and trailing glyph.
8. The trailing glyph predicts the behaviour: only the chevron row replaces the pane; both pencil
   rows open in place.
9. An empty note and a filled note are the **same row** — opening/filling changes the value, never
   the component. No dashed outline exists anywhere.
10. On H3/H4 the shared note is that same row, not a bordered card.
11. `Remove from your places` and `Remove from this collection` are the same component, both with a
    trash glyph, both start-aligned above a hairline. Both still confirm in two steps.
12. `Save to your places` is the only full-width button on the card.
13. Every pressable is ≥ 44 px tall; hit-test five points on `Been here` and on the last field row
    at 390×844 in the phone sheet at `half` and at `full` — none is blocked by `BottomNav`.

**Structure and rhythm**

14. Exactly two hairlines are visible on a fully-populated `/map` place; a manual-add place (no
    post) shows exactly one, with no empty band above or below it.
15. Adjacent field rows are flush — no gap and no separator between `Category` and `Your note`.
16. Only 0/4/8/12/20 px vertical gaps occur in the card's column (16 in place of 20 at the popover).
17. The model's sentence sits 8 px under the quote's attribution, sharing its start inset — not
    alone in 20 px of air.
18. `Matched on Google Maps` and `Saved on …` render at one type value, adjacent, above the
    destructive action. **Both date lines are present**: `Saved on …` here and `Been on …` 8 px
    under the action band, both 11 px / 500 / muted.

**Direction**

19. Open a Hebrew place (e.g. `קפה קיוסק Rothschild`): the name, the category line, the address, the
    quote and the dish line all start on the **same edge**. One vertical scan line, top to bottom.
20. Open a Latin-named place with Hebrew content: same test, same result, mirrored.
21. Mixed-run ordering is unchanged from the audit — the address's pin glyph stays on the reading
    start, the quote's opening mark on the reading start, `+2` and distance labels on the reading end.
22. Typing a Hebrew note puts the caret on the right; the block does not jump position or alignment
    between resting and editing.
23. No `text-left`, `ml-`, `mr-`, `left-`, `right-` in the card's own class strings.

**Cross-host parity — the check this document exists for**

24. The same place, opened at H1 and at H2, shows the same blocks in the same order with the same
    components; only the gutter, the still's height and the 16-vs-20 band gap differ.
25. The same place, opened at H3 and at H4, likewise.
26. A place the viewer has saved, opened from `/map` and then from a collection containing it, shows
    the same card with two additions (`Added by …` where relevant, `Shared note`) and one
    substitution (`Remove from this collection` beneath `Remove from your places`).
27. `place-desktop-panel.tsx` is untouched in the diff.
28. A place the viewer has **not** saved, seen inside a collection, still renders no note, no been
    toggle, no TikTok pill and no category row — the field-row list is shorter, not emptier-looking,
    and band 3 shows only what exists.

---

## 10. Open, and marked rather than guessed

- **OQ-1 (needs a ruling, does not block the build).** The action band's placement in band 1 is the
  one place this spec trades the owner's "segment metadata from actions" against a measured fold
  win. If the owner would rather the band moved into band 3, that is one move of a JSX block plus a
  re-measure of the fold at 390×844 and of the popover's slack — but it will put `Been here` below
  the fold again on the longest cards, which is exactly what round 3 filed. I have taken the fold.
  Built as specified either way; say the word and it moves.
- **OQ-2.** If `--muted-foreground` measures under 4.5:1 at 11 px on `--card`, the token moves and
  every 11 px line in the product moves with it. That is a tokens change and is outside this task's
  write scope; report it rather than forking an ink.
