# When we ask — the review screen's question model

> **Status 2026-08-30: UNBUILT and still the target.** No `Confidence.reason`, no Shape A/B, no
> collapse function in `src/` — the whole question model is owed. **Superseded in part:** §10 is
> replaced by `spec-no-places-found.md`, and the single-confident-result layout by
> `archive/ux-import-flatten.md` §3 (shipped). Everything else here stands as written.
>
> Owner: UX / Interaction. Date: **2026-08-28**. Task **TRACK3-ASK**, branch `feat/resolution-confidence`.
> `design-system-frontend` owns the code; this document owns the surface.
>
> Answers the owner's ruling of 2026-08-28 (`docs/archive/handoff-2026-08-28-categories-and-the-picker.md`
> §3): *"The review screen should only ask the user a question when there is a meaningful decision
> they actually need to make."*
>
> Binding inputs: `docs/working-agreement.md` §4 (trust) · `docs/brand-and-product-foundation.md` §4
> (tone) · `docs/ux-architecture.md` §11 (a11y), §12 (copy deck) · `docs/00-project-charter.md` §6
> (banned aesthetic).
>
> The scoring half of the ruling is **not** re-litigated here. `category` and `datasetConfidence` are
> already 0 in `scoring-constants.ts`; the branch guard is being designed on the same branch. This
> document takes both as given and specifies the screen.

---

## 0. What this supersedes in `docs/archive/ux-import-review-screen.md`

That spec stands except for six points, all of which predate resolution shipping:

| There | Here |
|---|---|
| §3.2 title = `identifiedName ?? rawName` | §6.1 — the title is the name **that will be saved**, which is the resolved place's name whenever a pick is in effect. Today's card titles a Google-named row with the model's guess. That is the same defect §3.2 was written to kill, resurrected by the resolver |
| §4 "our honest position is identical on every candidate" | Already false in code (`resolverPinLine`). §9 here gives every resolution state its own sentence |
| §6.1 "every selectable candidate is selected by default" | §7 — a candidate **carrying a question** starts unselected, and answering it is what selects it |
| §6.4 accounting line | §7.4 adds a second line for unanswered questions |
| §9.7 `N = 0` | §10 replaces it outright |
| §11.1 copy table | §11 here replaces every resolver-related string in it |

It also supersedes, in `src/ui/import/candidate-resolution-view.ts`, the fixed strings
`resolutionHeadline` and `resolutionExplanation` return today.

---

## 1. The rule

**Ask only when the answer changes what we save.**

Three consequences, and each one deletes something currently on screen:

1. If the top match is going to be saved whatever the user does, do not render a list. A list is a
   question. `preselect` currently renders `Matched to a place on the map` above five radio buttons
   and a sentence inviting the user to change it — a question with no question mark, on the band that
   exists precisely so we do not have to ask.
2. If two rows describe the same place, they are one row. The user cannot make a wrong choice between
   them, so there is nothing to choose.
3. If we do ask, the rows must differ in the thing the question is about. Four rows called
   "Rustico" answer nothing; four **addresses** do.

And the honesty rule that governs all the copy below:

> **The sentence explaining a question must be derived from the reason the band was not `preselect`.**
> It is a fixed string today, and on the specimen caption `📍קוהי, בן יהודה 155 תל אביב` it read
> *"The caption doesn't say which"* about a caption that names the venue **and** its street number.
> A product that invents a reason has spent the trust it needs for the times it is right.

For the record: that specimen no longer reaches this screen. Under the shipped weights it scores
`0.8 × 0.9325 + 0.2 × 1.0 = 0.946` against the runner-up's 0.587 — `preselect`, margin 0.36. The
taxonomy below is for the cases that are left.

---

## 2. Three shapes, not three bands

No new band. `preselect` / `confirm` / `no_match` are unchanged; what changes is that `confirm` is
**presented** two different ways, because it means two different things.

| Band | Reason | Shape | Card starts | Options rendered |
|---|---|---|---|---|
| `preselect` | — | **S — settled** | selected | none; behind `Not this one` |
| `confirm` | `branch` | **A — which one?** | unselected | 2–3 rows, street first |
| `confirm` | `rival` | **A — which one?** | unselected | 2–3 rows, name first |
| `confirm` | `weak_name` | **B — is this it?** | unselected | 1 proposal; rest behind a disclosure |
| `confirm` | `address_conflict` | **B — is this it?** | unselected | 1 proposal + the address comparison |
| `no_match` | — | **statement** | selected iff the model gave a pin | none |
| `failed` / `capped` / `not_attempted` | — | **statement** | selected iff the model gave a pin | none |

Shape A and Shape B are the answer to *"the confirm band is not one thing"*. Shape A means **we know
the venue and not which one of it** — the pick is the whole question. Shape B means **we found
something and are not sure it is right** — the question is whether we are right at all. A user can
tell them apart without reading a label: A is a list of equals with nothing preselected; B is one
proposal we are standing behind, with a way to reject it.

---

## 3. The reason taxonomy

Four reasons. Every one is decided by the same function that decides the band, in the same pass, and
none of them needs a signal the resolver does not already produce (§12).

**Precedence — first match wins.** Deterministic, so the copy can never be argued with.

### 3.1 `address_conflict`
The caption gave a street address, the top match has one, they are comparable, and they disagree.
Formally `candidate.addressHint !== null && addressScore(addressHint, top.place.addressLine) === 0`.
Note `addressScore` is three-valued and already exported from `domain/places/score.ts`: `null` is
*"could not compare"* and must never enter this reason.

Distinct copy: **yes**, and it earns it more than any other reason, because we can put both strings on
screen. `The caption said בזל 42 — this one is on רוטשילד 15.` That single line is the entire
decision, pre-made for the user, and it is the case `archive/handoff-2026-08-28-google-places-primary.md`
§10.3 records us handling worst.

### 3.2 `branch`
The top match and a close rival look like one venue in two places: one normalised name contains the
other, and they are more than 75 m apart. This is the branch guard's own verdict — the guard is what
*drops* the band here, so the reason travels with it rather than being re-derived.

Distinct copy: **yes**. Two branches of one chain is the one genuinely meaningful disambiguation in
the product, and it is the only case where the name is worthless as a differentiator, so the row
content has to change too (§6.2).

### 3.3 `rival`
The margin gate failed and it is not a branch: two different venues, scoring close.
`top.score ≥ preselectScore && margin < preselectMargin`, names not dominating.

Distinct copy: **yes, one sentence**, sharing Shape A's headline with `branch`. The difference is
visible in the rows themselves — the names differ — so the sentence only has to name what to compare.

### 3.4 `weak_name`
Everything else in `confirm`: `top.score < preselectScore`. The name did not match well enough,
whether there is one candidate or five.

Distinct copy: **yes, one sentence**, and it is the reason that **absorbs two of the owner's five**.

### 3.5 What I collapsed, and why

- **"the name matched only partially" and "only one candidate and the match is weak" are one reason.**
  The user's decision is identical — *is this it, yes or no* — the recovery is identical, and the
  difference between them is already visible on screen as the number of rows. Two labels for one
  decision is a taxonomy nobody can tell apart.
- **`lookup_failed` and `timed_out` share one sentence** (§9). Two ways for a network call to fail;
  one thing the user can do about it; nothing they can do differently.
- **`capped` and `not_attempted` share one sentence**, with `capped` adding its reason.
  `not_attempted` only exists on rows written before the resolver was wired in.

### 3.6 The one thing the reason must never be

`no_match` has no reason and gets no question. We looked, we found nothing, we say so (§9.1). Inventing
a reason for an absence is the same move as inventing a coordinate.

---

## 4. Collapsing before asking

Two shortlist entries are **one place** — and one row — when they are within **75 m** of each other
**and** one normalised name contains the other. Keep the higher-scoring entry.

Both halves are required. Distance alone would have merged Kohi Coffee Shop and NIKO by Sharon Cohen,
two real and different venues at בן יהודה 155. Name alone would have merged the two Rustico branches,
which is the one question worth asking. 75 m is not a new number: it is the radius `resolve_place`
already treats as one place.

The symmetry is worth stating, because it is the whole model in three lines:

| | same spot | far apart |
|---|---|---|
| **same name** | one place — collapse, never ask | branches — ask, the address is the answer |
| **different name** | rivals — ask, the name is the answer | rank decides; no question |

**Where it runs.** The band must be decided on the collapsed list, and the picker must render the
collapsed list, from **one** function used by both. If the two disagree, we will show a picker with
one row in it or auto-accept a shortlist we told the user was ambiguous. This is a coordination point
with the scoring track, not a licence for the view to filter rows on its own: `optionIndex` is an
index into the **stored** shortlist (`candidate-place.ts`'s authority boundary), so collapsing must
carry indices, never re-number them.

**Cap the list at 3.** If more than three survive the collapse, we are not asking a question the user
can answer by reading; show the top three and a fourth row, `None of these`. Measured shape of the
data supports this: Google returns exactly one result for 14 of 16 corpus candidates.

---

## 5. Shape S — settled (`preselect`, and any answered card)

No headline, no list, no chip. The card states what it will save.

```
┌───────────────────────────────────────────────┐
│ ☑  Kohi Coffee Shop                           │ ← 15px bold. THE NAME THAT WILL BE SAVED
│    The caption called it “קוהי”               │ ← 12px muted. provenance, unchanged
│    Café · בן יהודה 155, תל אביב-יפו            │ ← 13px muted. THE RESOLVED row's facts
│    ▏ “קוהי, בן יהודה 155”                      │ ← verbatim caption fragment, unchanged
├───────────────────────────────────────────────┤
│ ◎ Pin from the map data          Not this one │ ← 12px muted | 12px bold mint-700, 44px
└───────────────────────────────────────────────┘
```

- **`Not this one`** replaces the Google Maps link in the bottom-right for a settled resolved card.
  It is the copy deck's C32, finally used. It is a text button, not a link, and it is the only
  question the card asks — a question the user only sees if they were already doubting.
- The Maps link is not deleted; it moves into the revealed panel (§8), where "let me go and check"
  is the actual thought.
- Deleted here: the `Matched` chip, the `Matched to a place on the map` eyebrow, the
  `Pick a different one if this isn't it.` sentence, and the five-row radio list.

---

## 6. Shape A — which one?

The question block sits between the card body and the pin row, on its own hairline.

```
├───────────────────────────────────────────────┤
│ WHICH ONE?                                    │ ← 11px bold, tracked, uppercase, foreground
│ Two places called Rustico, 1.2 km apart.      │ ← 12px muted — DERIVED, never fixed
│ ┌───────────────────────────────────────────┐ │
│ │ ○  בזל 42                                  │ │ ← 13px bold — the differentiator
│ │    תל אביב-יפו                             │ │ ← 12px muted
│ └───────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────┐ │
│ │ ○  רוטשילד 15                              │ │
│ │    תל אביב-יפו                             │ │
│ └───────────────────────────────────────────┘ │
│ None of these                                 │ ← 44px text button
└───────────────────────────────────────────────┘
```

### 6.1 Row content, `branch`

- **Line 1 is the street address**, bold, at the weight the name normally carries. It is what the
  question is about.
- Line 2 is the locality.
- **The name is not repeated on the rows.** It is identical on all of them, it is already in the
  question sentence, and repeating it is how this control currently manages to show two rows that
  look the same.
- Where a branch has no address (`addressLine === null`), line 1 falls back to the locality and line 2
  to `No address in the map data` — never a blank row and never a row that cannot be told from its
  neighbour.

### 6.2 Row content, `rival`

- **Line 1 is the name**, bold.
- Line 2 is `{Category} · {street}, {area}`, category from `productCategoryFor` on the row's
  `providerCategory` — the vocabulary that landed yesterday, not the provider's raw slug. Category
  is doing real work here: `Café · בן יהודה 155` against `Restaurant · בן יהודה 155` is the whole
  difference between two venues at one address.

### 6.3 Nothing is preselected

No radio is checked on entry. A default here is the silent auto-accept the band exists to prevent
(`resolution-record.ts` says so, and it is right). The card is unselected and the Save count excludes
it until the user answers.

---

## 7. Shape B — is this it?

One proposal, presented as ours, with a way to reject it.

```
├───────────────────────────────────────────────┤
│ IS THIS IT?                                   │
│ The caption said בזל 42 — this one is on      │ ← the derived explanation
│ רוטשילד 15.                                    │
│ ┌───────────────────────────────────────────┐ │
│ │ Rustico                                   │ │ ← 13px bold
│ │ Restaurant · רוטשילד 15, תל אביב-יפו       │ │ ← 12px muted
│ └───────────────────────────────────────────┘ │
│ Yes, that's it        Not this one            │ ← 44px each; the left one is the card's toggle
└───────────────────────────────────────────────┘
```

The proposal is a **statement, not a control**. There is exactly one affirmative control on the card
and it is the card's own checkbox (§7.1), so a user is never looking at two things that both mean
"yes".

`Show other matches (2)` appears under the proposal when the collapsed shortlist has more than one
entry — a disclosure, not a list. Opening it renders Shape A's rows, and picking one replaces the
proposal. Most of the time it will not exist: Google returns one result for 14 of 16 corpus
candidates, and five weak names in a row is card soup asking the user to do the resolver's job five
times over.

### 7.1 The answer *is* the selection

One interaction rule across the whole screen, and it removes a control rather than adding one:

- **Shape S** — selected on entry. The server auto-accepts the top entry; nothing to send.
- **Shape A** — tapping a row picks it **and** selects the card. One tap answers the question and
  opts in to saving, which is the same intention.
- **Shape B** — tapping `Yes, that's it` (or the card's checkbox, which is the same control) sets
  the pick to the proposal's index **and** selects the card.

`optionIndex` must be sent explicitly in the Shape B case. `chooseResolvedPlace` returns `choose` for
an `ambiguous` record with no index, and the save then falls back to the model's pin — so a user who
agreed with a resolved place and got a 470 m guess saved instead would be right to call that a bug.
No API change: `/api/imports/confirm` already takes `optionIndex`.

### 7.2 Deselecting an answered card

Keeps the answer. Re-selecting does not re-ask. The pick and the selection are separate state; they
are only *set* together.

### 7.3 `Not this one` / `None of these` — the escape

One tap, always visible, never behind a menu. It reveals a panel containing, in order:

1. the remaining collapsed options as Shape A rows (omitted when there are none);
2. **`Find “{title}” on Google Maps ↗`** — the existing per-card link, moved here;
3. the consequence, stated: **`We'll leave this one off your map.`**

and it deselects the card.

**Manual add shipped on 2026-08-30** (`src/components/add/add-sheet.tsx`), so the rule that a
recovery only ever points somewhere that works is now satisfied here: `None of these` gains a primary
**`Search for it myself →`** above the consequence line. That is the one-tap manual route the role
brief asks for, and it is no longer a promise — it is a destination.

### 7.4 The footer

Adds one conditional line above the existing accounting line, 12px muted, centred:

- `1 place needs an answer.` / `{n} places need an answer.`

It replaces C41's `needs your help` — we are not stuck, we are asking. The primary button counts only
answered-and-selected candidates, so `Save 3 places →` is never a promise the request cannot keep.

---

## 8. Chips: deleted

`Needs your pick` and `Matched` both go. An unanswered card is already unmistakable — it is
unselected, and it is carrying a question block that no other card has. A chip that repeats the most
visible property of a card is chrome, and `Needs your pick` in particular is the label that made this
screen read like a work queue. `Your pick` goes too: when the question block collapses into a settled
line, that *is* the acknowledgement.

The four post-save status chips (`Saved`, `Already on your map`, `No location`, `Couldn't save`) are
untouched.

---

## 9. The honest statements — every state that gets no question

One line in the pin row, replacing today's silence. All are 12px muted with the existing `Crosshair`
glyph, except where noted.

| State | Model gave a pin | Line |
|---|---|---|
| `no_match` | yes | `Not in the map data — pin is from the caption` |
| `no_match` | no | `Not in the map data, and the caption gives no location` |
| `failed` (either reason) | either | `Couldn't check this one against the map data` |
| `capped` | either | `We didn't check this one — this post named a lot of places` |
| `not_attempted` | either | `We didn't check this one` |
| resolved & settled | — | `Pin from the map data` (unchanged) |
| unanswered question | — | `Waiting on your answer` (was `Waiting on your pick`) |

`no_match` with a model pin keeps `Check on Google Maps ↗` in the bottom-right; it is the only
verification we can offer. `failed` gets **`Try again`**, a text button that re-runs resolution for
that candidate alone — the one state where a retry is honest. If that route does not exist yet, the
line ships without the action rather than with a dead one.

The distinction between "we looked and found nothing" and "we never looked" is preserved in words,
which is the whole reason `resolution-record.ts` keeps them as different kinds.

---

## 10. "No places found" — the modal outcome

At LEVEL B's hit rate this is the **most common thing this product does**. It is currently two
implementations with different copy (`NoPlacesScreen`, and the `n === 0` branch inside
`CaptionPreviewScreen`). **One surface.** Whichever component survives, the other's content merges
into it.

What it must carry, in order:

1. **What we read.** The thumbnail, the handle link, and the caption disclosure — the same
   `Show the caption` control as the review screen. This is the single biggest change: today the
   standalone screen shows none of it, so "we read it and it names no place" is an assertion the user
   cannot check. On this screen, checking it is usually how they learn the name was only on screen in
   the video.
2. **The headline**, one of two:
   - caption present → `No places named`
   - `caption === null` → `Nothing to read`
3. **The body**, matching:
   - caption present (C70, kept verbatim): `We read @{handle}'s TikTok, but it doesn't name a place we can put on a map. Some TikToks only show the place on screen.`
   - no caption: `This TikTok has no caption, and reading captions is how we find places.`
4. **One line of capability, not blame**: `Posts that name the place in the caption work best.`
   12px muted. This is the most useful sentence we can put in front of someone 73% of the time, and
   it teaches the product's actual boundary without a word from `ux-architecture` §12's banned list.
5. **Primary: `Try another link →`** — and it must return to the paste screen with **the field
   focused and the keyboard up** (`inputmode="url"`), not a reset to an empty screen the user has to
   tap into. On a phone that is the difference between one gesture and three.
6. **Tertiary: `Open the original TikTok ↗`**, when there is a URL.

No illustration, no gradient, no mint wash celebrating an absence. The existing `MapPin` in an
accent circle stays; it is the mark of the surface, not decoration.

**A third zero state exists and must not be collapsed into this one:** the caption named places, we
found none of them, and none has a model pin. Those cards stay on screen with their §9 statements.
Never hide what we found in order to render a tidier empty state.

**Manual add landed on 2026-08-30**, so `Add a place you know` is the promoted primary here and
`Try another link` drops to secondary — `ux-architecture` §5.3's real hierarchy, finally available.
`spec-no-places-found.md` owns this screen in full and supersedes this section.

---

## 11. Every string

> **Status, corrected 2026-09-04: this section is a specification, not a record of what ships.**
> It was written in the present tense and read for weeks as a description of the live copy. It is
> not. Checked against `src/` on 2026-09-04: **none** of the strings in the table below appears in
> the application. What the review screen actually renders comes from
> `src/ui/import/candidate-resolution-view.ts` — `Which one is it?` where this table says
> `Which one?`, `Is this the place?` where it says `Is this it?`, and `Matched to a place on the
> map`, which §11.1 lists as deleted and which is still shipping. Adopting this table is real work
> on the review screen and has not been done. Until it is, read §11 and §11.1 as the target and the
> code as the truth.

Typographic quotes and apostrophes throughout (`'`, `"` `"`). Banned-word check passed on all of
them: no *model, AI, extraction, geocode, confidence, score, parse, API, pipeline*, no *"oops"*, no
*"something went wrong"*.

| Where | String |
|---|---|
| S — escape | `Not this one` |
| A — headline | `Which one?` |
| A — `branch`, addresses known | `{n} places called {name}, {d} apart.` |
| A — `branch`, caption gave no address | `{n} places called {name}. The caption doesn't say which.` |
| A — `rival` | `{n} different places match "{rawName}".` |
| A — escape | `None of these` |
| B — headline | `Is this it?` |
| B — `address_conflict` | `The caption said {addressHint} — this one is on {street}.` |
| B — `address_conflict`, no street on our row | `The caption said {addressHint}, and we can't tell if this is the same place.` |
| B — `weak_name` | `Closest match to "{rawName}". The name isn't an exact match.` |
| B — accept | `Yes, that's it` |
| B — reject | `Not this one` |
| B — disclosure | `Show other matches ({n})` / `Hide other matches` |
| escape panel — consequence | `We'll leave this one off your map.` |
| escape panel — link | `Find "{title}" on Google Maps` |
| pin row | see §9's table |
| footer | `1 place needs an answer.` / `{n} places need an answer.` |
| F10 headline | `No places named` / `Nothing to read` |
| F10 body | C70 verbatim / `This TikTok has no caption, and reading captions is how we find places.` |
| F10 capability | `Posts that name the place in the caption work best.` |
| F10 primary | `Try another link →` |
| F10 tertiary | `Open the original TikTok` |

`{d}` is a coarse distance: `120 m` under 1 km, `1.2 km` above it, one decimal, never more precision
than the question deserves. Omit the clause entirely below 100 m — at that range "apart" is not the
reason we are asking.

### 11.1 Strings to delete

**Not yet deleted** — see the status note at the head of §11. This is the list of what the adoption
of §11 would remove, and `Matched to a place on the map` and `Which one is it?` are both still on
screen today.

`Needs your pick` · `Your pick` · `Matched` · `Matched to a place on the map` ·
`Pick a different one if this isn't it.` · `The caption doesn't say which.` as a fixed string ·
`Which one is it?` (replaced by `Which one?`) · `Pick one of these to save it.` ·
`Waiting on your pick`.

---

## 12. Hebrew and bidi — the layout rules that actually bite

The interface strings are English and stay English; there is no i18n project here
(`p002-hebrew-english-is-the-language-scope`). What is Hebrew is **most of the content we
interpolate into them** — venue names, streets, localities, caption fragments — in the product's
primary market. Four rules, and every one of them is a real defect if skipped:

1. **Every interpolated provider or caption string is wrapped in `<bdi>`.** Without it,
   `The caption said בזל 42 — this one is on רוטשילד 15.` renders with the em-dash and the numbers in
   the wrong places. The quotation marks stay **outside** the isolate, or they swap ends.
2. **`dir="auto"` on every element that renders one of those strings**, including the option rows.
   A `truncate` on a Hebrew string in an LTR container clips the **beginning** of the name — the part
   that identifies it.
3. **Never truncate an option's address.** It already wraps (`break-words`) in the current
   implementation and the comment there is right: the address is the whole answer. Applies to
   `branch` rows above all.
4. **Length.** Hebrew renders ~15–20% shorter than the English equivalent, so the risk is not
   overflow but the sentence sitting oddly short next to a long Latin venue name. Nothing to do
   today; do not tune line lengths against English samples only. `{n} places called {name}` with a
   Latin `{name}` inside an otherwise-Hebrew address block is the case to check on device.

Locality strings are still rendered five different ways in one list (`תל אביב-יפו`, `Tel Aviv`,
`ת״א` — handoff §6). That is not this spec's fix, but it lands **on these rows**, where the locality
is a differentiator, so it will be conspicuous. Flagging, not scoping.

---

## 13. Accessibility

- Shape A's list keeps `role="radiogroup"`, `aria-labelledby` pointing at **the derived explanation
  sentence**, not a generic label. The announcement becomes *"Two places called Rustico, 1.2 km apart.
  בזל 42, תל אביב-יפו. Radio button, 1 of 2."*
- Shape B's proposal is not a control. Its text is referenced by the card checkbox's
  `aria-describedby`, so checking the box announces what is being agreed to.
- `Not this one` / `None of these` / `Yes, that's it` are `<button>`s, ≥44px, in DOM order after the
  options.
- Focus order per card: checkbox → option 1 … option n → escape → pin-row action. Unchanged rule from
  `ux-import-review-screen` §7: DOM order, no reordering tricks.
- **One live region on the screen**, in the footer, debounced 400 ms, announcing
  `{n} places selected, {m} need an answer`. Not per card, and never `role="status"` on the list.
- Answering a question must not move focus. The block collapses in place; focus stays on the control
  the user pressed.
- Contrast: the question block uses foreground text on the card surface, not muted-on-muted. The only
  mint on an unanswered card is the focus ring — mint means settled everywhere else on this screen,
  and an unanswered card must never carry it.

---

## 14. Motion

Two moments. Anything else is deleted.

| Moment | Intent | Timing | `prefers-reduced-motion` |
|---|---|---|---|
| Question block collapses on answer | the question is now settled; the card became one of the calm ones | height + fade 160 ms, `spatial` easing, no horizontal movement | instant swap, no height animation |
| Escape panel opens | this came from behind the row you tapped | height 200 ms, `spatial` | instant |

The card must not move in the list when it is answered — the block shrinking changes the card's own
height, which is unavoidable, but nothing reorders and nothing animates away. A card that jumps
cannot be corrected by someone who mis-tapped.

No pulse, no glow, no tick animation on the checkbox beyond the existing 120 ms fill. There is
nothing to celebrate about agreeing with us.

---

## 15. What implementation needs that does not exist yet

Deliberately short. Everything not listed here is already stored or already derivable, and that is the
main finding: `ResolveResult` carries `score`, `margin`, `nameScore`, `tokenCoverage` and the full
`ResolvedPlace` for every shortlist entry, so **distance apart, name containment, address
contradiction and match strength are all computable at read time** from data we have. `haversineKm`
already exists in `domain/places/clusters.ts` and `addressScore` is already exported from
`domain/places/score.ts`.

1. **`Confidence.reason`** — one nullable field on an existing object, written by the same code that
   decides the band, added to `StoredConfidenceSchema` in `resolution-record.ts`. Values:
   `'branch' | 'rival' | 'weak_name' | 'address_conflict' | null`.

   *Why it must be a field and not a UI derivation:* the branch guard is what drops the band to
   `confirm`, so it already knows the answer. A second derivation in the view is exactly the drift
   `candidate-resolution-view.ts`'s rule 1 forbids, and here it would show as the screen explaining a
   decision it did not make. Nullable because rows already stored have no reason; those fall back to
   `weak_name` when `score < 0.92` and `rival` otherwise, which is true of every pre-guard row.

2. **The collapse function** (§4), called once, before the band is decided, and reused by the view —
   carrying stored indices, never re-numbering them.

3. **`optionDetail` split into `street` and `area`.** A change to an existing pure function, not a new
   signal: Shape A needs the two on separate lines with different weights, and `branch` rows need the
   street alone. Keep the joined form for the settled meta line.

That is the list. If a fourth item appears during implementation, it is worth a conversation before it
is worth a field.

---

## 16. Owner decision

**One line, and it is genuinely the owner's:** when a user answers `None of these` on a candidate the
*model* placed, do we save the model's pin or nothing? **Recommendation: nothing, and say so** —
`We'll leave this one off your map.` The user has just rejected our best evidence for what this place
is; keeping an unverified 65–470 m pin under a name we could not confirm is the confidently-wrong
place the working agreement exists to prevent, and an absence we explain costs the product far less
than a wrong pin the user finds later.

---

## 17. Acceptance checks

1. Import the specimen caption `📍קוהי, בן יהודה 155 תל אביב`. **No question appears anywhere on the
   screen**, and the card reads `Kohi Coffee Shop` with `Pin from the map data`.
2. No `preselect` candidate renders a radio list on first paint. Verified by reading the DOM, not the
   screenshot.
3. A `confirm` card's explanation sentence contains a fact taken from **that** candidate — a name, an
   address, a distance or the caption's own words. No card renders a sentence that would be true of
   every card.
4. A `branch` card's two rows differ on line 1. Cover a Hebrew case: `בזל 42` and `רוטשילד 15` both
   render with their digits on the correct side.
5. The card title equals the string written to `places.name` for that candidate, for a **resolved**
   save. Read the row with `psql`, not the response body.
6. Tapping one option in Shape A both picks it and increments the Save count, in one tap.
7. `Yes, that's it` in Shape B causes `optionIndex` to be present in the confirm request body.
   Inspect the request, then inspect the persisted `places.provider` — it must not be `llm_guess`.
8. `None of these` deselects the card, states the consequence, offers the Maps link, and offers
   `Search for it myself →`, which reaches the shipped manual add.
9. The no-places screen shows the caption behind one tap, on both the standalone and in-review paths,
   and its primary returns to a **focused** URL field.
10. `prefers-reduced-motion: reduce`: answering a question changes the card with no height animation
    and no focus movement.
11. VoiceOver on a `branch` card announces the question sentence as the group label before the first
    address.
