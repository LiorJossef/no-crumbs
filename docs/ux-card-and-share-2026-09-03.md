# The saved-place card and the collection Share panel — softening two surfaces

> **Spec, 2026-09-03. `ux-interaction` wrote it; `design-system-frontend` builds it.** No source file
> was touched and nothing was run — I have no shell, so every geometry figure below is either quoted
> from a measured comment in the code (attributed) or marked **ESTIMATE**.
>
> **Base commit for the reading:** `715a9aa` on `no-crumbs-implementation`.
>
> **Surfaces:** `src/components/sheet/place-sheet.tsx` (`PlaceDetail`, from :2080) plus
> `src/components/sheet/saved-place-edits.tsx` and `src/components/collections/add-to-collection.tsx`;
> and `src/components/collections/share-panel.tsx`. Mobile-first at 390×844; the same rulings apply
> unchanged in the `lg+` map popover and the `lg+` collection panel unless stated.
>
> **The owner's words this answers:** the card and the Share panel *"feel overwhelming"*; he wants
> them *"nicer, softer, more intuitive, more friendly to users"*.
>
> **Prior work this continues rather than contradicts.** `ux-overwhelm-audit-2026-09-02.md` §2 (the
> card's census and its withdrawn items), `ux-place-card-unification-2026-09-02.md` (the one field-row
> shape), `ux-collection-actions-2026-09-03.md` §2.1/§6 (the shared menu material and the
> red-at-rest rule), `ux-two-removals-one-screen.md` §2.3. Where I overturn one of them I say so by
> name. **§7.1 of the overwhelm audit — the owner's date-lines ruling — is untouched and binding: no
> date line is deleted here.**

---

## Part A — the saved-place card

### A1. Why it reads as overwhelming

Four mechanisms, none of them "too much spacing".

**1 — Three equal pills for three unequal actions, so the card has no primary.** `TikTok`,
`Google Maps` and `Been here` share one class string (`DETAIL_ACTION_PILL`,
`saved-place-edits.tsx:148`): same 44 px height, same border, same radius, same `font-bold`. Two of
them *leave the product* and one is the only write the product wants a returning user to make. Equal
paint means the eye must read three labels to find out that only one of them is about this app. A
surface with three co-equal primaries has none.

**2 — Form-like labelling: six elements to carry three facts.** `Collections`, `Category` and
`Your note` each render as an 11 px muted `SECTION_LABEL` stacked over a 14 px value with a trailing
glyph (`DETAIL_FIELD_ROW`, two lines, `min-h-12` each). Three stacked label/value pairs in a 350 px
column is the visual grammar of a settings form, and two of the three labels carry no information the
value does not: `Collections` sits above `In tel aviv food`, and `Your note` sits above `Add a note`.

**3 — Repetition of the two facts the card is already loudest about.** *Café* appears in the identity
line and again as the Category row's value. The source appears **four** times: the still, `Saved from
@danielle___tal`, the TikTok pill, and the ` · from the TikTok video` clause hanging off the category.
The audit already counted this (§2b); it has not been cut.

**4 — Undifferentiated quiet matter at the bottom, including the destructive one.** `Matched on
Google Maps`, `Saved on 2 September` and `🗑 Remove from your places` are three short muted lines in a
row. The irreversible action is told apart from two record lines only by a 14 px trash glyph — which
is simultaneously *too quiet to be safe* and *too noisy to be calm*, because the glyph is the only
icon in that region and it pulls the eye to the one thing nobody came for.

Net at rest: seven type/weight registers stacked in one column, and nothing on screen saying which
single thing to press.

### A2. Intended reading order and weight

| # | Band | Element | Weight |
|---|---|---|---|
| 1 | identity | Source still | quiet (recognition aid, not content) |
| 2 | identity | Place name | **primary** |
| 3 | identity | `Café · ראשון לציון` | secondary |
| 4 | identity | Tag chips | secondary |
| 5 | identity | Address line — **and it is the way to Google Maps** | secondary |
| 6 | identity | Source line — `Saved from @handle`, **and it is the way to TikTok** | quiet |
| 7 | action | `Been here` / `Been`, alone | **primary — the card's one primary action** |
| 8 | action | `Been on 3 Aug` | quiet |
| 9 | band 2 | quote → why-go → dishes → other sources | secondary, unchanged |
| 10 | band 3 | `Add a note` / the note | secondary |
| 11 | band 3 | `In tel aviv food ›` · `Category  Café ✎` | quiet |
| 12 | band 3 | Nearby | quiet, unchanged |
| 13 | band 3 | `Matched on Google Maps · Saved on 2 September`, one line | quiet |
| 14 | band 3 | `Remove from your places` | demoted |

The descent reads as a sentence: *what it is → what kind → where it is → where it came from → what
you do about it.*

Two order changes are load-bearing. **The source line moves up beside the address** (both are "where",
one physical and one provenance) instead of floating inside the action block. **`Your note` moves to
the top of band 3, above `Collections` and `Category`** — a note is the user's own words and the only
field row anyone opens twice; `Collections` and `Category` are set-once corrections and belong under
it. This reverses the ordering comment at `place-sheet.tsx:2837-2841`, which grouped been + collections
as "intent" controls; that argument dissolves the moment `Been` leaves band 3's neighbourhood, which
it did when it moved into the action row.

### A3. Rulings

**R1 — Merge the Google Maps pill into the address line.** The address row already carries a `MapPin`
and is the fact the link is about. It becomes an `<a href={googleMapsUrl}>` with the existing
`aria-label="Open in Google Maps"`, `title`, `target="_blank"`, `rel="noopener noreferrer"`,
`data-vaul-no-drag`, a `min-h-11` box and a trailing `ArrowUpRight size-3.5 opacity-70`. The
approximate mark stays on that row, **outside the link** — it is our word about the address, and it
must not become part of a pressable that opens somebody else's map. When there is no `addressLine`
(the `llm-guess` rows), the same row renders with the pin glyph and the place name in place of the
address, so the capability never disappears.

*Attribution check, flagged rather than claimed:* Google's condition is discharged by the visible
`Matched on Google Maps` in the record line (R7), which is required to stay and which renders exactly
on the rows whose content came from Google. **If the orchestrator judges that a visible "Google Maps"
word must also sit on the control, take the fallback in R3 instead of dropping R1 silently.**

**R2 — Merge the TikTok pill into the source line.** Whichever of the two creator credits is on
screen becomes the link, and the existing conditional guarantees exactly one is: `Saved from @handle`
in band 1 when there is no quote, the `<figcaption>` under the quote when there is. Shape, both
places: `PlatformMark size-4` + the existing text + `ArrowUpRight size-3.5`, `min-h-11`,
`text-brand`, `aria-label="Open on TikTok"`, `data-vaul-no-drag`. When a save has a TikTok URL and no
handle at all, band 1's line renders as the mark + `Open on TikTok`. No visible string is invented;
`Open on TikTok` is the ratified sentence already on the pill's `aria-label`.

**R3 — `Been here` is the single primary, and it becomes so by subtraction.** With R1 and R2 landed
it is the only member of the action row, so it keeps `DETAIL_ACTION_PILL` unchanged — same paint,
same 44 px, same `aria-pressed` idiom. **Do not promote it to mint.** House mint means *create* (the
`＋`) and *this is narrowing your library* (a pressed filter chip); a third meaning on the card would
undo `ux-collection-actions-2026-09-03.md` §4 the week it shipped. One bordered pill on a card where
nothing else is bordered is already the loudest control on the surface.

*Fallback if R1 is refused:* keep a `Google Maps` control but strip its border and pill — render it
as a quiet `text-brand` text link with a trailing arrow in the source line's row. `Been here` must
remain the only bordered pressable in band 1 under every variant of this spec.

**R4 — The three field rows lose their two-line stack.** `DETAIL_FIELD_ROW` keeps `min-h-12`, its
zero-border/zero-fill rest state and its hover tint, but lays out as **one line**: an optional muted
leading label, the value, then the trailing glyph. Per row:

| Row | At rest, after | Label |
|---|---|---|
| Collections | `In tel aviv food ›` / `Add to a collection ›` | **deleted** — `In …` names itself |
| Category | `Category  Café ✎` | **kept** — a bare `Café` row would be meaningless and would restate the identity line |
| Your note | `Add a note ✎` (empty) · `Your note  <text> ✎` (filled, `line-clamp-2`) | kept only when filled |

The open editors are unchanged in every respect (`DETAIL_FIELD_OPEN`, the `Done` control, the
textarea, the radiogroup, the counter, the error slots). This is a rest-state change only.

**R5 — Delete the category provenance clause.** ` · from the TikTok video` / ` · from the map
listing` (`saved-place-edits.tsx:386-390`) goes, and with it the `fromAPost` prop's only consumer.
Ranked as item 8 in the overwhelm audit, no rule conflict, and it is the fourth statement on one card
that this place came from a video.

**R6 — The destructive action loses its glyph and gains air.** `Remove from your places` stays last,
stays muted at rest, stays two-step, keeps its copy verbatim and keeps `Cancel` autofocused in the
confirm. Two changes: **delete the `Trash2` glyph** (it is the only icon in that region and it is what
makes the quiet corner noisy), and give the control **20 px above it** — the band's own group step —
so it is separated from the record line rather than stacked on it. No new divider: `place-sheet.tsx:731`
is right that a third hairline on a two-hairline card is the floating fragment we removed.

**R7 — The two record lines become one.** `Matched on Google Maps · Saved on 2 September`, joined by
the product's existing ` · `, `text-micro font-medium text-muted-foreground`, allowed to wrap. Both
strings are verbatim and both survive: the Google attribution is intact and the owner's date ruling is
honoured. When only one of the two exists, the line is that one alone with no separator.

**Cumulative removal:** 2 pills, 2 field-row labels, 1 provenance clause, 1 whole line, 1 glyph, and
3 two-line rows become 3 one-line rows. **ESTIMATE ~90–110 px** recovered at 390 px and no capability
lost.

### A4. The snap-state constraint — respected in intent, superseded in arithmetic

`place-sheet.tsx:2564-2604` records the measurement honestly: `BottomNav` is `fixed`, `z-50`, and
covers y 776–844, so the honest fold at `half` is 776, giving the card a 324 px budget; across eight
saved places the action band clears it on **one**, and the comment concludes that closing the gap
"deletes something — the still, the tags, or the `half` stop itself".

**My hierarchy respects the rule that band-1 arithmetic serves — `Been here` is the first control on
the card, and after R1–R3 it is the only one — and deliberately supersedes zero-scroll-at-`half` as a
design target.** `half` is a preview: a still, a name, a category line and an address, with the card
scrolled to reach anything else. That is a legitimate stop, and the sheet's own scroll affordance plus
the popover's `scroll-fade-b` already say there is more. Continuing to buy pixels against a 53–92 px
deficit is what produced the three-pill row in the first place. What R1–R7 give back is real but is
spent on calm, not on chasing the fold.

**What must still hold in every snap state,** and it is checkable: no control is *obscured* by the
bottom bar at `peek`, `half` or `full`. The `floatingBarPx` margin at `place-sheet.tsx:2372` already
guarantees it and nothing here touches it.

### A5. Copy — verbatim

Only one string is deleted and none is invented.

| String | Ruling |
|---|---|
| ` · from the TikTok video` / ` · from the map listing` | **Deleted** (R5). Strike from `ux-architecture.md` §12 in the same commit — `voice-and-vocabulary.md` §6 |
| `Collections` (field label) | **Deleted** (R4). The value `In tel aviv food` carries the noun |
| `Your note` (field label, empty state only) | **Deleted** (R4). `Add a note` carries it |
| `Matched on Google Maps` · `Saved on 2 September` | **Unchanged wording**, joined by ` · ` (R7) |
| `Open on TikTok` · `Open in Google Maps` | Unchanged; they move from a pill's `aria-label` to a row's |
| `Been here` / `Been` · `Been on 3 Aug` | Unchanged. Ratified in `ui/place/visit-state.ts` |
| `Remove from your places` and its confirm sentence | Unchanged, verbatim |
| `Add to a collection` · `Add a note` · `Not set` · `Category` | Unchanged |

Checked against `voice-and-vocabulary.md`: no banned word enters, no brand name appears (the card is
not one of §2's six surfaces), sentence case throughout, digits, no exclamation, `link`/`place`/`note`
are the ratified nouns, and `TikTok` stays an adjective in `Open on TikTok`.

### A6. Explicitly not changed

- **`Matched on Google Maps` is not deleted, shortened or made conditional beyond its current gate.**
  Google's terms require it (`place-sheet.tsx:2935-2938`).
- **`Saved on …`, `Been on …` and the list row's `Saved 3 days ago` all stay.** Owner ruling,
  2026-09-02, recorded in `ux-overwhelm-audit-2026-09-02.md` §7.1. This spec does not rediscover them.
- **No capability is dropped.** TikTok and Google Maps are still one tap; the field rows still write;
  remove is still two-step; the picker, the nearby list, the extra-sources list and the tags are
  untouched.
- **The still, the tags, the quote/why-go/dishes shape and the extracted-vs-inferred rule** —
  untouched. The quote stays the first prose on the card and the model's sentence stays quieter than
  it and stays unlabelled.
- **Band structure and its two hairlines**, `data-vaul-no-drag` on every control, the `floatingBarPx`
  margin, the RTL machinery (`<bdi>`, the mirrored quote entities, `ms-auto`), the popover's `max-h`
  and `compact` still — all untouched.
- **`Been` does not become mint** (R3).

### A7. Acceptance checklist — 390×844, sheet at `full`, a saved place with a still, tags, a note and a quote

1. Band 1 contains **exactly one** bordered or filled pressable, and it reads `Been here` or `Been`.
   There is no row of three pills anywhere on the card.
2. The address line carries the pin glyph and a trailing ↗ and is the only route to Google Maps; there
   is no separate `Google Maps` pill.
3. The creator handle appears **once** on screen, wears the platform mark and a trailing ↗, and is the
   only route to TikTok; there is no separate TikTok pill.
4. `Collections`, `Category` and `Your note` each occupy **one** line at rest (the filled note may
   clamp to two). No 11 px label sits stacked above a value anywhere on the card.
5. The word `Category` appears at most once; `Café` at most twice; the string `from the TikTok video`
   appears nowhere.
6. `Matched on Google Maps` is present and shares one line with `Saved on 2 September`.
7. `Remove from your places` is the last element, has no trash glyph, and has visible air (≥20 px)
   between it and the record line above.
8. At `peek`, `half` and `full`, no control is drawn underneath the bottom bar.

---

## Part B — the collection Share panel

### B1. Why it reads as overwhelming

**Five full-width blocks of near-equal weight, in an order that puts configuration before the act.**
The first thing on screen after the heading is a *setting* — a 48 px two-option segmented control
(`share-panel.tsx:441-467`), which is also an eighth pill vocabulary in a product the overwhelm audit
already caught running seven (§6). Below it, a bordered `Input` at `h-12` displaying a raw
`https://…/collections/join/<uuid>` truncated mid-token — 40-odd characters nobody will read, verify
or retype, drawn at the same width and nearly the same height as the `h-14` primary button beneath it,
so the reader has to work out by trial which of two identical slabs is a display and which is the act.
Then **three full paragraphs at `text-sm leading-relaxed`** (~55 words) land immediately after the
primary, in the position where a person has just finished acting. Then two `text-sm font-bold` text
links, `Replace link` and `Turn the link off`, sitting side by side at identical weight with nothing
between them and nothing above them — the panel's most consequential control wears the same clothes
as its least. Everything is full-bleed to the same gutter, so shape carries no information at all: a
control, a display, an explanation and a list are four identical rectangles.

Count: **6 blocks, 1 primary, 0 hierarchy** — and the act is third.

### B2. Intended reading order and weight

| # | Element | Weight |
|---|---|---|
| 1 | `‹ Share` heading row | quiet, unchanged |
| 2 | `People with the link can [View ⌄]` — one sentence, one inline trigger | secondary |
| 3 | `Share link` / `Copy invite` | **primary — the panel's one primary action** |
| 4 | The link itself, one quiet truncated line + copy icon | quiet |
| 5 | The three privacy sentences | quiet |
| 6 | `Replace link` · `Turn the link off`, below a hairline | demoted |
| 7 | `In this collection` + member rows | secondary, unchanged |

The act moves above the link display and directly under the sentence that describes it. The role
control does not disappear — it becomes part of the sentence, which is where a person reads it anyway.

### B3. Rulings

**S1 — The segmented control becomes an inline value trigger inside the sentence.** One line replaces
a `<legend>` plus two 48 px pills: `People with the link can` followed by a value-bearing trigger
reading `View ⌄` / `Edit ⌄`. Material: **the shared menu material lifted for
`ux-collection-actions-2026-09-03.md` §2.1** — `PANEL_SURFACE` / `INLINE_PANEL` inline on the phone,
`MENU_POPUP` anchored at `lg+`, `MENU_ROW` + `MENU_ROW_PAINT` rows at `text-sm`, 32 px of paint in a
44 px target, chevron rotating 180° on open. Two rows: `View`, `Edit`.

Not `MenuAxis` itself — that composes a filter's accessible name (`"…, showing all"`) and this is not
a filter. A plain `<button aria-expanded aria-haspopup="menu">` with accessible name
`What people with the link can do` (the existing string, moved off the deleted `role="radiogroup"`)
and the visible value beside it. `roleSwitchNotice` and its confirm block are untouched and still
render in flow directly under this line.

**ESTIMATE:** ~92 px (legend + 48 px pills + gaps) becomes ~44 px, and the panel loses a pill
vocabulary.

**S2 — `Share link` is the panel's one primary and moves above the link field.** Unchanged geometry
(`h-14 w-full text-base font-bold`, filled), unchanged label logic (`shareButtonLabel`), unchanged
`Copied` acknowledgement. It is the only filled or full-width button in the panel; nothing else may be
either.

**S3 — The link stops being an input box.** Same `<input readOnly>` element and the same
select-on-focus, select-on-click and `fieldRef` fallback path — the capability to grab the bare URL is
untouched — but demoted to one quiet line: no border, no card fill, `text-xs text-muted-foreground`,
`truncate`, `min-h-11`, with the existing 44 px copy icon button beside it (`aria-label="Copy the
invite link"`, unchanged). **End-truncation with an ellipsis, never the current mid-token break** — a
URL cut in the middle of a token reads as corruption; one cut at the end reads as "there is more, and
you do not need it". It sits **below** the primary, because it is the fallback path, not the act.

**S4 — The privacy block keeps every word and loses a third of its area.** All three sentences of
`PRIVACY_BLOCK` render, always, verbatim, in order, never behind a disclosure — hiding a privacy
statement behind a tap is the wrong trade and the pair in sentences 2 and 3 is load-bearing
(`share-panel.tsx:16-21`). The only change is register: `text-sm leading-relaxed` → `text-xs
leading-relaxed`, `gap-2` → `gap-1`, `border-t` above it kept. It becomes reference material sitting
under an act, which is what it is. **No compression, no paraphrase, no "your private data stays
private".**

**S5 — `Replace link` and `Turn the link off` are demoted and separated.** They move below their own
`border-t border-border/60 pt-4`, after the privacy block, with nothing sharing their row but each
other. `font-bold` → `font-medium`; both stay `text-muted-foreground` at rest; both keep `min-h-11`,
the hover underline and `PRESS_CHIP`. **Neither is red at rest** — turning the link off is reversible
(its own prompt says everyone already in stays in, and a new link is one tap), so
`ux-collection-actions-2026-09-03.md` §6's rule applies: red at rest is reserved for the irreversible,
and red appears only on the confirm button. That is already how they render; the ruling is that the
differentiation comes from **separation and weight**, not colour. Both confirms are unchanged.

**S6 — Nothing else moves.** The heading row, the member list, `LeaveCollection`, the error slots and
the panel-local live region keep their positions and their code.

**Cumulative:** one pill vocabulary deleted, one bordered box deleted, ~55 words demoted a size step,
two text links separated from the flow above them, and the primary action promoted from third to
first below the sentence. **ESTIMATE ~110–130 px** shorter above the member list at 390 px, with every
capability intact.

### B4. Copy — verbatim

**No new user-facing string.** One string moves.

| String | Ruling |
|---|---|
| `People with the link can` | Kept, and it stops being a `<legend>` — it is now the first half of a sentence the trigger completes |
| `View` / `Edit` | Kept (`inviteRoleLabel`), now menu rows and the trigger's value |
| `What people with the link can do` | Kept, moved from the `radiogroup`'s `aria-label` to the trigger's accessible name |
| `Share link` / `Copy invite` / `Copied` | Unchanged |
| `Copy the invite link` | Unchanged |
| The three `PRIVACY_BLOCK` sentences | **Unchanged, verbatim, all three, always visible** |
| `Switching makes a new link. The one you shared before stops working.` | Unchanged |
| `Replace the link? The old one stops working.` · `Turn the link off? Nobody new can join. Everyone already in stays in.` | Unchanged, verbatim |
| `Replace link` · `Turn the link off` · `Replace` · `Turn it off` · `Cancel` | Unchanged |
| `Create a link` · `Make a new link` · `Working…` | Unchanged |
| `In this collection`, the member rows, `Leave collection` | Unchanged |

Checked against `voice-and-vocabulary.md`: `link` never becomes *URL*; `collection` is the only noun
for the object; no *member* appears as a user-facing word (the heading is `In this collection`); no
brand name — invite copy is explicitly banned from carrying it (§2); sentence case, digits, no
exclamation, and `Working…` keeps its real ellipsis while running.

### B5. Explicitly not changed

- **`PRIVACY_BLOCK` is not shortened, merged, paraphrased or hidden.** Its second and third sentences
  are a matched pair naming fields; if a field ever moves between shared and private, both change
  together.
- **`shareMessage` and its disclosure boundary** — no place count, no place names, no inviter name.
- **One live link per collection**, `createInvite`'s revoke-then-insert, and `roleSwitchNotice`'s
  honest wording about the old link dying.
- **This panel is never a dialog.** No portal, no scrim, no `aria-hidden` on the background, no focus
  trap — `use-non-modal-background.ts` exists because of that bug and `ux-collections.md` §8.1 names
  this panel as the likely place to reintroduce it. The role menu on the phone is an inline panel in
  normal flow for the same reason.
- **The heading focus move on mount**, the panel-local `role="status"` region, the copy fallbacks
  (clipboard → select-the-field), and the Web-Share `AbortError` handling.
- **The member list and `MemberRow`'s `⋯`**, including the Hebrew-name layout rules at
  `share-panel.tsx:687-698`.

### B6. Acceptance checklist — 390×844, owner viewing a collection with a live link

1. Between the `Share` heading and the primary button there is **one** line of chrome — a sentence
   ending in a `View ⌄` / `Edit ⌄` trigger. No two-pill segmented control appears anywhere.
2. `Share link` is the only filled and the only full-width button in the panel.
3. There is no bordered input box. The link is one quiet muted line, truncated **at the end** with an
   ellipsis, with the copy icon beside it, positioned **below** the primary button.
4. The three privacy sentences are all present, verbatim, and the block is visually quieter than the
   link row above it.
5. `Replace link` and `Turn the link off` sit on their own row beneath a hairline, both muted, neither
   bold, neither red.
6. Nothing between the heading and `In this collection` is red at rest.
7. Every control's pressable box is ≥44 px, and the last member row is clear of the bottom bar.
8. Counting blocks between the heading and `In this collection`: **five or fewer** (sentence, button,
   link row, privacy, link management).

---

## Part C — motion, accessibility, and how to cut this for concurrent build

### C1. Motion

Nothing new is animated. Two beats only, both already in the system:

- **The role menu opening (S1):** the `enter` beat — `animate-in fade-in-0
  motion-safe:slide-in-from-top-1 duration-enter` (140 ms). Under `prefers-reduced-motion` it
  collapses to **the opacity change alone, not to nothing** (`facelift-plan.md` §3a). The chevron
  rotates 180° over `duration-cross`; under reduced motion the transition drops but the **end state
  stays rotated** — never the state, only the transition.
- **Presses:** `PRESS_ROW` on the new address and source rows and on menu rows, `PRESS_CHIP` on the
  role trigger and the two demoted link controls, `PRESS_BUTTON` unchanged on `Been`. The 90 ms beat,
  unchanged.
- **No height transition** anywhere — not when the role menu opens, not when a field row opens, not
  when the confirm appears. Layout thrash inside a scrolling sheet for no information, same rule as
  `ux-collection-actions-2026-09-03.md` §8.
- `Copied` is a label swap with no animation.

### C2. Accessibility

- **The address row and the source row are now links, so they are in the tab order** where a pill used
  to be — net zero tab stops on the card, and two of the three former stops are gone. Card tab order:
  play glyph (if any) → close × → address/Google Maps → source/TikTok → `Been` → tags → band 2 links →
  note → collections → category → nearby → remove.
- Both new links keep `target="_blank"` with the ratified accessible name, and `data-vaul-no-drag` so
  a press on them is not read as the start of a sheet drag.
- The `~ Approximate location` mark stays **outside** the address link, so it is never announced as
  part of the link's name and never becomes pressable.
- The role trigger is `aria-expanded` + `aria-haspopup="menu"` with accessible name `What people with
  the link can do`; the two rows are a real menu at `lg+` and a plain list of buttons in flow on the
  phone. Escape closes and returns focus to the trigger; choosing a row closes and returns focus to
  the trigger, which now shows the pick.
- The link field keeps `aria-label="Invite link"` and stays selectable at `text-xs`; the copy button
  keeps its own 44 px target and its own name.
- Panel tab order: back → heading → role trigger → (open menu) → `Share link` → link field → copy →
  `Replace link` → `Turn the link off` → member rows.
- Contrast: every demotion above lands on `text-muted-foreground` at 12 px, which is an existing
  token pairing already used for the record lines. **No new colour and no new type step is introduced
  anywhere in this spec.**

### C3. Independently buildable pieces

`design-system-frontend` is the roster's single build owner, so this is cut to land in any order:

| Lane | Contains | Files |
|---|---|---|
| **A** | R1, R2, R3 fallback, R7 — band 1's action row and the record line | `place-sheet.tsx` |
| **B** | R4, R5, R6 — the field rows, the provenance clause, the remove glyph | `saved-place-edits.tsx`, `add-to-collection.tsx` (the label deletion only) |
| **C** | S2, S3, S4, S5 — the Share panel's order, the link row, the privacy register, the two links | `share-panel.tsx` |
| **D** | S1 — the role trigger on the shared menu material | `share-panel.tsx` + whichever of `ui/inline-menu.tsx` / `library-filter-bar.tsx` exports the five constants |

A and B are disjoint files and disjoint regions. C and D touch the same file, so they are **one lane
in sequence**, C first — C is pure composition and D depends on the menu-material extraction that
`ux-collection-actions-2026-09-03.md` §2.1's build note already put on the table. If that extraction
has not landed, ship C alone and hold D; the panel is materially calmer without it.

**Every string deleted in Part A must be struck from `ux-architecture.md` §12 in the same commit** —
`voice-and-vocabulary.md` §6, and it is three commits' worth of edits, not one.

### C4. What I could not check

I have no shell. Every pixel figure here is an **ESTIMATE** or is quoted from a measured comment in
the source with its file:line. Nothing in this document is verified against a running app, and the
`Been here`-above-the-fold arithmetic in §A4 is quoted from `place-sheet.tsx:2564-2604`, not
re-measured. Before treating any number here as fact, measure at 390×844 and 1440×900.

---

## Owner ruling, 2026-09-03 — R2 (dissolve the pills) is overridden

The spec's ruling that `Google Maps` merges into the address line and `TikTok` merges into the
creator credit is **rejected by the owner**, in his words:

> I agree that the three pills competing with each other is a problem, but I don't think dissolving
> TikTok and Google Maps into the existing content is the right solution. Both interactions become
> too implicit. If the creator name is clickable, it's not clear that it opens the original TikTok,
> and if the address is clickable, it's not clear that it opens Google Maps.

The diagnosis stands and the goal is unchanged — three co-equal primaries means none. What changes
is the mechanism: **differentiate the weights, keep all three controls explicit.**

- `Been here` is the single primary and carries the visual weight. Still not mint (§R2's reason
  holds: mint means create).
- `TikTok` and `Google Maps` stay as labelled, visibly pressable controls, one step quieter than
  `Been here` — they recede, they do not disappear.
- The icon-only `TikTok` control **gains a word**. It is the same implicitness the owner objects to,
  already shipped: a bare glyph does not say where it goes.

Every other ruling in this document is unaffected — the one-line field rows, the deleted
`Collections` / empty `Your note` labels, the deleted `· from the TikTok video` clause, the joined
record line, and the demoted `Remove from your places`.

This also retires §R1's Google-attribution fallback question: the word `Google Maps` stays on the
control, so the attribution is discharged on the control *and* on the provenance line.

---

## Rulings, 2026-09-04 — the compaction pass

The owner asked for the card to be *"more compact and unified with the product (font, buttons),
less overwhelming"*, then handed over ownership for the day. `design-system-frontend` measured the
card; `ux-interaction` ruled on the two items that were not the implementer's to take. Recorded
here because the reasoning constrains what may be done to this card later, not just what was done.

### What the measurement found, and it changes two premises

- **The `lg+` card is set in Helvetica Neue, not Manrope.** `maplibre-gl.css` fonts the map
  container and the popover inherits it — 36 Helvetica nodes against 1 Manrope. That is the literal
  answer to "unified with the product (font)", and it is one property in `globals.css`. It also
  takes ~52 px off the desktop card, because the action row stops wrapping.
- **The loudest object on the card is a tag.** Chips are `font-bold` on a filled ground with a
  border; `Been here`, the primary, is `font-medium`. Band 1 holds five bordered pressables against
  §A7's "exactly one", four of them heavier than the primary. That, and not spacing, is the
  "overwhelming".
- **41 of 60 saved places clip `Been here` at 390x812** today, one of them completely. The
  handoff's "taller cards" was a large understatement, and its denominator was wrong too: the
  control is 48 px, not 36.

### R4's 48 px field row is withdrawn — rows go to `min-h-11`

The 48 was derived for a **two-line** row: an 11 px label over a 14 px value. R4 deleted the second
line and kept the number, in a clause listing what does *not* change. So it was the content's
height and the content is gone. The card already refutes the one post-R4 justification — the nearby
rows and the extra-source rows are borderless `min-h-11` rows in flush runs, near byte-identical
apart from 4 px.

**It buys 0 px above the fold.** It is a vocabulary change — four target heights to three, seven
control shapes to six — and must not be cited as a fold fix. The rows then sit exactly on the 44 px
floor with no headroom, so they are verified as targets and not only as layout.

### No tag cap — the 1-in-60 clip ships

After the still comes down to 112 px, exactly one row still clips its primary: `Kohi בית קפה יפני`,
by 23 px at 390x812. Capping the card's tag list to one row would close it and was refused.
`TagFacetBar` was deleted on 2026-08-29 for precisely this — a cap that hid tags the user then had
no way to reach — and `TagChipList`'s own docblock says the detail wraps freely *because* the
detail scrolls. The list row truncates because the card does not; cap the card and progressive
disclosure loses its terminal. "Reveal on expand" is not a third option: the chips are pressable
filter controls, so a non-pressable `+2` is dead text naming content it will not give you, and a
pressable one is an eighth control shape whose expansion pushes `Been here` down by the 40 px the
cap just saved.

**MORN-4 §2(c) is restated rather than quietly complied with.** Its operative content was never "no
clipping" — it was two failures measured at 13 of 48 px. The rule is now: *the fold may cut the
primary only while the entire label is drawn and a thumb aimed at the visible centre cannot reach
`BottomNav`.* At 33 of 48 px both hold, with roughly 2 px of margin.

**The reopen trigger, and it will fire.** Tags are absent on most places today and extraction v2
fills them going forward, so every future three-or-four-tag save is another `Kohi`. If more than
one row clips at 844, or more than three at 812, the escalation is MORN-4 §5's sticky action row —
not a cap, and not more shrinking.

### The `Kohi` residue — ruled 2026-09-04, the trigger does not fire

The compaction shipped and the one remaining clipped row was re-measured on the finished tree.

| 390x812 | before the chip change | after |
|---|---|---|
| `Been here` visible height, of 48 px | 30.6 px | **32.6 px** |
| visible centre → `BottomNav` top | 13.3 px | **14.3 px** |
| label ink → `BottomNav` top | −3.4 px | **−1.4 px** |
| label ink → scroll clip | −1.4 px | **+0.6 px** |

At **390x844 `Been here` is not clipped at all** — the full 48 px is drawn.

**The reopen trigger was "under 31 px at 812". It reads 32.6. It does not fire, and I am not
escalating.** No sticky action row, no cap, no further shrinking. The chip change was worth exactly
the 2.00 px it was estimated at.

**The residue, stated rather than rounded away.** The restated §2(c) asks for the *entire label*
drawn, and 1.4 px of the glyph bottoms still sit behind `BottomNav`'s translucent top rim at 812.
The ink now clears the scroll container (+0.6 px, where it was cut by 1.4 px before), `Been here`
has no descenders, and the crop confirms the words and their check read cleanly — so this is
accepted, not satisfied. If the rule is ever re-litigated, that 1.4 px is the case to argue about.

**One number in the record could not be reproduced and is not being explained away.** The CARD-2
sweep reported 28.6 px at 812; the reconstructed "before" in the follow-up run measured 30.6 px on
the same row, and the three commits in between are all header-side and should not move the detail
card. The 2.00 px delta is the reliable part of both runs; treat 32.6 as the standing number and
re-measure before relying on either.
