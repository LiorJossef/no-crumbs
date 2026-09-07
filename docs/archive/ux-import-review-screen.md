# Import review & confirm — redesign spec (S7 / `CaptionPreviewScreen`)

> Owner: UX / Interaction. Date: **2026-08-26**. Status: **spec for implementation**, one pass, no new
> dependencies — Tailwind + `src/components/ui/{button,input,card}` + Lucide only.
>
> Target: `CaptionPreviewScreen` in `src/app/import/import-page-client.tsx` (currently ~line 1008),
> plus `ExtractedCandidateRow` (~line 1132), plus three small changes outside them, listed in §10.
>
> Binding inputs, in order of precedence where they conflict: `docs/working-agreement.md` §4 (trust),
> §6 (UX quality) · `docs/brand-and-product-foundation.md` §4 (tone), §5 (visual) ·
> `docs/ux-architecture.md` §4 (review surface), §11 (a11y), §12 (copy deck) ·
> `docs/execution-plan.md` L1-F3-T2.
>
> Deviations from the ratified copy deck are listed and justified in §11. Everything else in the deck
> is used verbatim.

---

## 1. What is wrong today — confirmed, corrected, extended

The four problems in the brief are all confirmed. Four more matter as much.

**Confirmed as stated.**

1. **The screen leads with an ad.** ~1000 characters of promo copy occupy the first screenful on both
   widths; the eight candidates — the entire reason the screen exists — start below the fold. The
   caption's job is *evidence on demand*, and it is already served better, per-candidate, by the
   `evidence` fragment on each card.
2. **There is no rejection.** `Done` saves all eight. This fails L1-F3-T2 ("accept, choose an
   alternative, reject, correct") and it fails `ux-architecture` §4.2 outright. It also fails the
   product's own promise: this is the one screen where we ask the user to slow down, and we give them
   nothing to do.
3. **The "95%" must go.** It is the model's self-report about its own answer. Measured: coordinates
   from this path land 65–470 m from the venue, and the same caption re-run yields different
   coordinates *and* different identified names. A number rendered to the percent is the single most
   certainty-converting element we could put on screen — working agreement §4, and `ux-architecture`
   §4.3 already forbade scores on this surface before we had the measurements. Replacement in §4.
4. **Nothing separates extracted from inferred.** `rawName` and `evidence` are verbatim and checkable
   against the caption by substring. `identifiedName`, `coordinates` and `categoryHint` are the
   model's inference. Today they are rendered in the same visual register, and the inferred name is
   labelled `Likely:` — which is the only hint, and it is a hedge word, not a provenance statement.

**Extended — four more, all of which the redesign has to fix anyway.**

5. **The card shows one name and saves a different one.** The title is `rawName`; `derivePlaceSave`
   saves `identifiedName ?? rawName`. So on a card reading **"kolamba"** with a subordinate
   *"Likely: Kolamba"*, the thing that lands on the map is "Kolamba". The review screen must show what
   will actually be saved — otherwise "explicit human confirm" is confirming something the human was
   not shown. This is the strongest argument for flipping the name hierarchy (§3.2).
6. **We already know which candidates cannot be saved, and we do not say so.** `derivePlaceSave` skips
   `coordinates === null`. The client holds `coordinates` on every candidate. So the "skip" is
   predictable at render time and is currently only discovered *after* the user presses Done, as
   `skip_only` — a post-hoc apology for something we could have stated calmly in advance. §6.6.
7. **Screen-reader semantics are wrong in two specific ways.** The `PLACES` wrapper carries
   `role="status"` (line 1075), so the entire eight-candidate list is announced as a live-region
   update. And eight identical `Check on Google Maps` links give a link-list with eight identical
   entries and no way to tell them apart.
8. **On desktop the primary action scrolls away.** The overlay card sets `lg:overflow-y-auto` on the
   card itself, so with eight candidates `Done` sits below the card's own scroll. The one action the
   screen exists for should never require scrolling to reach. §5.2.

**The frame the redesign is built on, and the sentence to hold onto:**

> **The name is evidence. The location is a guess.** The card's job is to let those two facts sit at
> two different levels of confidence without making the user learn a vocabulary.

---

## 2. Information hierarchy

Mobile order, top to bottom. Desktop is the same order in a narrower card (§5.2).

| # | Block | Height (mobile) | Notes |
|---|---|---|---|
| 1 | Close `✕` | 36px circle, 44px hit area | Unchanged, top-left, as today |
| 2 | Kicker `REVIEW & CONFIRM` | 28px | Unchanged |
| 3 | H1 `8 places found` | ~32px | Unchanged copy (deck C30) |
| 4 | **Source row** — thumbnail + handle link + caption disclosure trigger | 48px | **New composition.** Replaces today's blocks 4, 5 and 6 |
| 5 | Caption panel, **collapsed by default** | 0 / max 152px | Expands in place, own scroll, never pushes the list off screen |
| 6 | **Selection bar** — live count + `Select all`/`Deselect all` | 44px | Replaces the `PLACES` label, which is deleted |
| 7 | **One-line location honesty statement** | ~34px | Said once, properly, here — never repeated per card |
| 8 | Candidate list | scrolls | The only scrolling region |
| 9 | **Sticky footer** — accounting line (conditional) · primary · reassurance | ~112px | Pinned above the safe-area inset |

Two blocks are deleted outright:

- The full-width **`Open the original TikTok`** link — folded into the source row's handle (deck C31
  already says the subline is tappable and opens TikTok).
- The **`PLACES`** section label — the H1 already says "8 places found", and a section label above the
  only list on the screen is chrome. Block 6 takes its slot and carries real information.

### 2.1 The source row (block 4)

```
┌────┐  @exploringlondon's TikTok ↗       ← 14px medium, mint-700, opens TikTok in a new tab
│thmb│  Show the caption            ⌄     ← 13px muted, disclosure trigger, 44px hit area
└────┘
 48px
```

- Thumbnail: `probe.thumbnailUrl`, 48px, `rounded-lg object-cover`, `alt=""`. When null, the slot
  becomes a 48px `bg-muted` square with a centred muted `Link2` glyph — **the slot never collapses**;
  its presence is the provenance promise (`ux-architecture` §7).
- Handle line falls back to `This TikTok ↗` when `authorHandle` is null.
- Disclosure trigger is hidden entirely when `caption === null`; the row is then one line and the
  thumbnail centres against it.

### 2.2 The caption panel (block 5) — collapsed, and why

Collapsed is correct, and the argument is not just "it is long". The caption is *screen-level*
evidence; each card already carries the *candidate-level* fragment of it, quoted verbatim, which is
strictly more useful for the decision the user is making. The full caption answers a different, rarer
question — "what did this post actually say?" — asked by a user who already distrusts a card.

Implementation: a native `<details>` / `<summary>` pair. No dependency, keyboard-accessible for free,
and the open/closed state survives re-render without new React state.

- Trigger copy: `Show the caption` ⇄ `Hide the caption`. Chevron rotates 180° on open.
- Expanded panel: `bg-muted/50`, `rounded-lg`, `p-3`, `text-[13px] leading-relaxed`,
  **`max-h-38 overflow-y-auto overscroll-contain`** (≈152px, ~7 lines). Hard cap is the point: an
  expanded caption may never again push the candidate list below the fold.
- Placement is directly under the source row and **above** the list, not at the bottom of the screen.
  At the bottom of an eight-card scroll it would never be found; the doubt that makes someone want it
  arrives before they scan the list, not after.

---

## 3. The candidate card

### 3.1 Anatomy

```
┌───────────────────────────────────────────────┐
│ ☑  Kolamba                                    │ ← 15px bold, foreground. WHAT WILL BE SAVED
│    The caption called it "kolamba"            │ ← 12px muted. PROVENANCE OF THE NAME
│    Restaurant · 21 Kingly St, London          │ ← 13px muted
│    ▏ "kolamba for sri lankan small plates"    │ ← 12px muted, quote rail, line-clamp-2
├───────────────────────────────────────────────┤ ← hairline, border-border/60
│ ◎ Pin is approximate     Check on Google Maps↗│ ← 12px muted  |  12px bold mint-700, 44px tall
└───────────────────────────────────────────────┘
```

Two zones, separated by a hairline. **Above the rule: what we believe this place is. Below the rule:
how sure we are about where it is, and the one-tap way to find out.** That separation *is* the
extracted-vs-inferred story, expressed as structure rather than as a legend the user has to read.

### 3.2 Field-by-field

| Slot | Content | Type | Rule |
|---|---|---|---|
| Checkbox | 24px rounded square, top-aligned with the title | — | See §3.4. Replaces today's decorative `MapPin` circle, which is deleted — it carried no information and repeated eight times |
| Title | `identifiedName ?? rawName` | 15px `font-bold` foreground, `line-clamp-1` | **Changed from today.** The title must be the string `derivePlaceSave` will write. Problem 5 |
| Provenance | see below | 12px `font-medium` `text-muted-foreground`, `line-clamp-1` | Always present. This is the trust story, and it costs one line |
| Meta | `Restaurant · 21 Kingly St, London` | 13px `text-muted-foreground`, `line-clamp-1` | Sentence case, **not** the current uppercase-tracked treatment |
| Evidence | `"…"` on a quote rail | 12px `text-muted-foreground`, `line-clamp-2` | Rendered only when it adds information (§3.3) |
| Hashtag note | `Only mentioned in a hashtag.` | 12px `text-muted-foreground` | Replaces today's "confidence capped since there's no other corroboration" — "confidence" is on the deck's banned list |
| Location line | `Pin is approximate` / `We couldn't place this one` | 12px `text-muted-foreground` + 14px icon | §4 |
| Verify link | `Check on Google Maps ↗` | 12px `font-bold` mint-700, `h-11` | Accessible name must be unique per card (§7) |

**The provenance line, exactly two variants, no third:**

- `identifiedName` present and `≠ rawName` → **`The caption called it "kolamba"`**
- otherwise → **`Named in the caption`**

That is the whole extracted-vs-inferred mechanism in user language. When the title is our inference,
the line hands back the verbatim words so the user can check them against the caption (which is one
tap away, §2.2). When the title *is* the verbatim words, the line says so. No jargon, no legend, no
badge vocabulary, and it is true on every card without us grading anything.

Do not use `Likely:` anywhere. It hedges the name without saying where the name came from, which is
the opposite of what this line is for.

**Meta line composition rule** (one line, joined with ` · `, blank parts dropped):

1. Category label from the seven-value vocabulary, via a literal map — `restaurant→Restaurant`,
   `cafe→Café`, `bar→Bar`, `bakery→Bakery`, `attraction→Attraction`, `shop→Shop`, `other→Place`.
   Omitted when `categoryHint` is null.
2. Location: `addressHint` when present, else `cityHint`, else `countryHint`. If `addressHint` is
   present *and* `cityHint` is present *and* the address does not already contain the city
   (case-insensitive `includes`, same test as `googleMapsSearchUrl`), append `, {cityHint}`.
3. If nothing in (2) resolves: `Location not given`.

`countryHint` is dropped whenever a city or address exists. "LONDON, UNITED KINGDOM" on eight
consecutive cards is noise; the country is constant across an import and is in the caption anyway.

### 3.3 When to render the evidence quote

Render when `evidence` is non-empty **and** `evidence.trim().toLowerCase() !== rawName.trim().toLowerCase()`.
A quote that is just the name repeats the title and costs a line on every card.

Presentation is a **quote rail** — `border-l-2 border-border pl-2.5`, no fill — not today's filled
`bg-muted/60` box. Eight filled boxes inside eight bordered cards is exactly the "card soup" the
charter bans. `line-clamp-2`.

### 3.4 Interaction and DOM structure (load-bearing)

The card must be a large toggle target *and* contain a link. A `<button>` may not contain an `<a>`,
and a `<label>` wrapping both forwards activation unpredictably. So:

```
<li>                                  // the card: border, radius, surface
  <button type="button" role="checkbox" aria-checked>   // zone A — the whole upper block
     checkbox glyph + title + provenance + meta + evidence
  </button>
  <div>                               // zone B — sibling, NOT inside the button
     location line          <a href={googleMapsSearchUrl(c)}>Check on Google Maps ↗</a>
  </div>
</li>
```

No nesting problem, no `stopPropagation`, natural focus order (checkbox → link), and the toggle target
is still full-width and ≥72px tall. This structure is not negotiable; everything else in §3 is
styling.

- **Whole of zone A toggles.** No separate checkbox hit area.
- **No confirmation, ever**, on deselect.
- **Deselected cards stay in place** at full height — a card that animates away cannot be recovered by
  someone who mis-tapped (`ux-architecture` §4.2).

### 3.5 Card states

| State | Surface | Checkbox | Text |
|---|---|---|---|
| Selected | `bg-card border-border/70` | Mint-400 fill, `ink-on-mint` check | Full contrast |
| Deselected | `bg-muted/50 border-border/50` | Empty, `border-2 border-border` | **Full contrast — dim the surface, never the text** (`ux-architecture` §11.6) |
| No coordinates | `bg-muted/40` + `border-dashed` | Slot holds a muted `MapPinOff` glyph, **no checkbox** | Full contrast |
| Saved (post-partial-failure) | `bg-card` | Replaced by a mint `Check` glyph | Full contrast, trailing chip `Saved` |
| Failed (post-partial-failure) | `bg-card border-destructive/40` | Replaced by a muted `X` glyph | Full contrast, trailing chip `Couldn't save` |

Distinguish by **structure and glyph first, colour second** — dashed border, different glyph, different
surface. A colour-blind user in sunlight still sees three different cards.

---

## 4. Confidence — what replaces the percentage

**`modelConfidence` is not rendered. Not as a percentage, not as a bar, not as dots, and not as
words derived from it ("High"/"Medium"/"Low").** Deriving a band from a number we have measured as
unreliable does not make it more honest; it makes it harder to argue with.

What replaces it is not a per-candidate confidence at all. Our honest position is the *same on every
candidate*, so it is stated once at screen level and acknowledged in two words per card.

**Screen level (block 7), one line, under the selection bar, verbatim:**

> `We work out pins from what the caption said, so they can be a street or two off.`

Concrete, measured (65–470 m *is* "a street or two"), no jargon, no apology, and it sets the
expectation before the user has committed to anything.

**Card level, one line in zone B, verbatim, exactly one of:**

- `Pin is approximate` — has coordinates
- `We couldn't place this one` — `coordinates === null`

**Rejected alternatives, so nobody re-proposes them.** A per-card `Address from the caption` badge for
candidates with an `addressHint` was tempting — it is a genuine extracted-vs-inferred distinction. It
is rejected because the *coordinate we save is still the model's guess even when the address is
verbatim*, so the badge would imply a precision the pin does not have. The address earns its trust in
the meta line, where it reads as content rather than as a claim by us.

The verification affordance carries the load the percentage used to pretend to carry: **`Check on
Google Maps ↗` is the answer to "is this right?"**, it is one tap, it is per-card, and it is the
strongest thing on the bottom rule (12px bold mint against 12px muted).

---

## 5. Layout

### 5.1 390 × 844 (mobile, both the overlay takeover and the standalone route)

- Column: `px-5`, `pt-[calc(env(safe-area-inset-top)+2rem)]`,
  `pb-[calc(env(safe-area-inset-bottom)+1.5rem)]` — unchanged from today.
- **Header (blocks 1–7) scrolls away.** No sticky header: vertical space is the scarce resource and
  the footer keeps the count. The first candidate card must be **fully visible without scrolling** —
  that is the acceptance test for the header budget (~300px including the collapsed caption row).
- **List** is the only scroll region: `flex-1 min-h-0 overflow-y-auto overscroll-contain`, cards
  `space-y-2`.
- **Footer is sticky**, at the bottom of the flex column (`mt-auto`, not `position: fixed` — the
  existing screens' pattern, and it survives the iOS toolbar collapse), with `border-t border-border`
  and `bg-background` so scrolled content underneath stays legible. Order inside: accounting line
  (conditional) → primary button → reassurance line.
- **Primary button `h-14` (56px)**, full width — `ux-architecture` §11.1's primary-action size. Today's
  `h-12` is below the bar and this is the one action the screen exists for. The other screens in this
  flow should follow later; not in this pass.
- Card height ≈ 108–124px, so eight cards ≈ 900px of scroll against a ~540px visible list. Fine —
  no virtualisation (`ux-architecture` §4.5: do not build it at N ≤ 8).

**N = 1.** The surface does not change shape. The list does not stretch or centre; the single card
sits under the header at its natural height and the footer stays pinned to the bottom. The card
already shows category and address on every render, so §4.4's "expand N=1" requirement is satisfied by
default. The only differences are the copy: `1 place found` and `Save this place →`. Consistency
beats a bespoke single-result layout.

### 5.2 1440 × 900 (overlay card)

The card stays `clamp(420px, 34vw, 480px)`. **Do not widen it, do not go two-column, do not add a
caption pane on the side.** This is a task, not a dashboard.

The one real change: **the scroll must move from the card to the list.**

- On the overlay card's class string (`import-page-client.tsx` ~line 504), replace
  `lg:overflow-y-auto` with `lg:overflow-hidden`. `lg:max-h-[min(44rem,calc(100vh-5rem))]` stays.
- `CaptionPreviewScreen`'s root becomes `flex min-h-0 flex-1 flex-col`.
- The list region gets `min-h-0 flex-1 overflow-y-auto`.

Result: short screens (paste, rail, redirect) are still content-height and unaffected, because
`max-h` only binds when content exceeds it. The review screen with eight candidates hits 44rem, the
list scrolls inside, and the header and footer stay put. **`Save 8 places →` is never below the fold
on desktop.**

Desktop-only differences beyond that: primary button `lg:h-12`, card padding `lg:px-8 lg:py-10` as
today. Nothing else diverges.

### 5.3 What is sticky

| Region | Mobile | Desktop |
|---|---|---|
| Header (1–7) | scrolls | fixed (card is fixed-height when full) |
| List (8) | scrolls | scrolls |
| Footer (9) | **sticky** | **fixed** |

---

## 6. Selection model

### 6.1 State

`Set<number>` of **candidate indices**. This is not an arbitrary choice: `/api/imports/confirm` takes
`items: [{ candidateIndex, note }]`, so the selection set maps 1:1 onto the request body.
**No server change is required to ship per-candidate selection** — the endpoint has always accepted a
subset; the UI has just never offered one.

- **Selectable** = `candidate.coordinates !== null`. A non-selectable candidate can never enter the
  set, by construction — not "is added then filtered".
- **Default: every selectable candidate is selected.** Rationale: the primary path is "save what this
  TikTok gave me"; all-off makes the modal eight-candidate case an eight-tap chore and greets the user
  with a dead primary that reads like a form validation error. Rejection is one tap on a 72px target,
  nothing is written until Save, and the footer says so. This is `ux-architecture` §4.2's preselection
  rule, applied to the only band this path produces.
- Deselecting is instant and silent. Reselecting is the same tap.

### 6.2 Selection bar (block 6)

Shown when **N ≥ 2** (deck C42 says N ≥ 4 — deviation justified in §11).

```
8 of 8 selected                                   Deselect all
```

- Left: 13px `text-muted-foreground`, `{selected} of {selectable} selected`.
- Right: text button, 44px hit area, 13px bold mint-700. Label is **`Deselect all`** when every
  selectable candidate is selected, otherwise **`Select all`**. It only ever touches selectable
  candidates.
- When some candidates are non-selectable, the denominator is the **selectable** count, and the
  footer's accounting line explains the difference (§6.4). Never show `8 of 8` when only 7 can be
  saved.

### 6.3 Primary button copy — verbatim, all cases

| Condition | Label | Enabled |
|---|---|---|
| ≥2 selected | `Save 6 places →` | yes |
| exactly 1 selected | `Save this place →` | yes |
| 0 selected, ≥1 selectable | `Select a place to save` | **no** |
| saving | `Saving…` + spinner | no |
| after partial failure | `Continue to map →` | yes |
| N = 0, or nothing selectable at all | `Try another link` | yes |

- The trailing `→` is part of the label on primary actions (`brand-and-product-foundation` §5), and is
  absent on the disabled zero state — a dead arrow reads broken.
- The disabled button **stays visible**. A primary that disappears is more disorienting than one that
  is greyed.
- **Zero-selected additionally shows a ghost secondary** under the primary: **`Back to the map`**,
  `h-11`, `variant="ghost"`. Shown *only* in this state. The `✕` is a 36px target in the top-left
  corner — the worst position on a phone — so the one state where the primary is dead is the one state
  that needs a thumb-reachable exit.

### 6.4 Footer accounting line (conditional, above the primary)

Exactly one of these, 12px `text-muted-foreground`, centred:

- ≥1 non-selectable candidate: `1 of these has no location — it won't be saved.` /
  `2 of these have no location — they won't be saved.`
- otherwise: nothing.

### 6.5 Footer reassurance line (below the primary, always, except during partial failure)

> `Nothing is saved until you tap Save.` (deck C40)

12px `text-muted-foreground`, centred. Replaced by the notice text in the partial-failure state.

---

## 7. Accessibility

- List is a real `<ul aria-labelledby={headingId}>` of `<li>`; the H1 carries `headingId`.
- **Remove `role="status"` from the list wrapper** (today's line 1075). It turns the whole
  eight-candidate list into a live region. There is exactly one live region on this screen: a
  visually-hidden `<p role="status">` in the footer announcing `{n} places selected`, **debounced
  400ms** so rapid toggling does not spam (`ux-architecture` §11.5).
- Card checkbox: `role="checkbox"`, `aria-checked`, and `aria-describedby` pointing at the provenance
  line and the location line so the announcement carries state in words:
  `Kolamba, Restaurant, 21 Kingly St, London. The caption called it "kolamba". Pin is approximate. Selected.`
- **Non-selectable card is not a checkbox.** Zone A is a plain `<div>`; there is no control that
  implies a choice the user does not have. Its only control is the Maps link.
- **Every Maps link needs a unique accessible name.** `aria-label={`Check "${title}" on Google Maps`}`
  (and `Find "${title}" on Google Maps` on non-selectable cards). Eight identical link names is a
  screen-reader failure today.
- Focus order = DOM order, no reordering tricks: H1 → TikTok link → caption disclosure → Select all →
  card 1 checkbox → card 1 Maps link → card 2 … → primary → ghost exit. The sticky footer is last in
  DOM and sticky in layout (`ux-architecture` §11.2).
- Focus ring 2px `--ring` (mint-700), **inset** on the card's zone-A button so the rounded card border
  does not clip it.
- Hit areas: zone A ≥72px tall, Maps link `h-11`, Select all 44px, `✕` 44px hit area around the 36px
  circle.
- `aria-busy="true"` on the screen root while saving.

---

## 8. Motion — intent and timing

Five behaviours. Every one has a reduced-motion equivalent that keeps the *information*.

| Moment | Intent | Timing | `prefers-reduced-motion` |
|---|---|---|---|
| Cards appear | "these came out of that TikTok" | 8px up + fade, 200ms `entrance`, stagger 40ms, **capped at 6** (card 7+ enters with card 6) | All at once, 100ms opacity only, no translate |
| Preselection lands | the preselection is a decision we made, not a trap | Checkbox animates to checked **120ms after its own card lands** | Checked on first paint |
| Toggle | acknowledge the tap, move nothing | Checkbox fill 120ms, card surface 160ms. **No layout movement, ever** | Instant swap; colour transitions are kept |
| Caption disclosure | the caption came from behind that row | Height 200ms `spatial`, chevron 180° over 200ms | Instant, no rotation |
| Count in button | — | **Plain text swap.** Do not build a number roller (`ux-architecture` §13 Q5 — deleted) | Same |

No card exit animation on deselect. No wash, no glow, no pulse on the confidence area — there is
nothing there to celebrate.

---

## 9. States

### 9.1 Loaded (N ≥ 1, at least one selectable)
Per §2–§6. Every selectable card selected, primary reads `Save {n} places →`.

### 9.2 Saving
- Primary: `Saving…` + `Loader2` spinner, disabled.
- List: `pointer-events-none opacity-70`; root `aria-busy="true"`.
- **`✕` is disabled** for the duration — unmounting mid-request loses the result message.
- Selection bar's Select all is disabled.

### 9.3 Hard failure (nothing saved)
- Inline `role="alert"` above the primary, `text-destructive`, 13px `font-semibold`:
  - n ≥ 2: **`Couldn't save those places. Try again.`** (deck C72)
  - n = 1: **`Couldn't save that place. Try again.`**
- **Selection is preserved**; the primary reverts to `Save {n} places →`. Retry is one tap, never a
  re-review (`ux-architecture` §F8 overrun).
- Cards return to interactive.

### 9.4 Partial failure (some saved, some not)
Stay on the screen — the current behaviour is right and must be kept; navigating away loses the only
statement of what failed. Improve it:

- `saveExtractedCandidates` must stop discarding `candidateIndex`. The confirm response already
  carries it. Keep a `Map<number, 'saved' | 'already_saved' | 'skipped' | 'failed'>`.
- Each card gains a trailing chip in zone A, 11px, `rounded-full px-2 py-0.5`:
  **`Saved`** (mint-200 / mint-900) · **`Already on your map`** (muted) · **`Couldn't save`**
  (destructive/10 / destructive) · **`No location`** (muted).
- Cards become non-toggleable — the save has happened; there is nothing left to choose.
- Notice above the primary, `role="status"`, neutral (not mint, not destructive), 13px:
  **`Saved 6 places. 2 couldn't be saved.`**
- Primary becomes **`Continue to map →`**. The reassurance line is replaced by the notice.

This turns a vague sentence into a designed state, and it makes `already_saved` visible for the first
time — a re-import currently claims a fresh save it did not make on the card level.

### 9.5 `skip_only` — now structurally unreachable
Under this selection model a candidate with no coordinates can never be selected, so "everything you
asked for was skipped" cannot happen from the UI. Keep `decideCaptionSaveOutcome`'s branch as the
server-truth backstop and render it exactly like §9.3 with copy
**`Couldn't put those on the map. Nothing was saved.`** Do not delete the branch — the client's view
of `coordinates` is a convenience, and the server stays the authority.

### 9.6 A candidate with no coordinates, **before** the button is pressed
This is the state the brief singles out, and it is the one the current design gets most wrong by
deferring it to after the tap.

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   ← border-dashed, bg-muted/40
  ⊘  Bao Borough                                  ← MapPinOff glyph in the checkbox slot
     Named in the caption
     Restaurant · London
     ▏ "bao borough for the best bao"
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
  ◎ We couldn't place this one   Find on Maps ↗
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- No checkbox. Not a disabled checkbox — a control that cannot be operated is worse than no control.
- Text at **full contrast**. This is not an error and must not look degraded; it is a candidate we are
  honest about.
- Excluded from the selection denominator, the button count and the request body.
- Footer accounting line states the consequence in advance (§6.4).
- The Maps link is relabelled **`Find on Google Maps ↗`** (not "Check") — there is nothing of ours to
  check against; the user is going to look it up themselves.

This is the working agreement §4 sentence made visible: *a skipped candidate with a stated reason is a
correct outcome; a city-centre fallback pin is not.*

### 9.7 N = 0 (no candidates, or no caption)
Keep today's body copy. Primary becomes `Try another link`, ghost secondary `Back to the map`. The
full F10 treatment is L1-F4's; this is the in-scope minimum so the screen is not a dead end.

---

## 10. Changes required outside `CaptionPreviewScreen`

1. **`import-page-client.tsx` ~line 504** — overlay card class: `lg:overflow-y-auto` →
   `lg:overflow-hidden`. Required by §5.2. Safe for the other screens (they are content-height and
   `max-h` only binds when exceeded); verify the rail and paste screens at `lg` before committing.
2. **`saveExtractedCandidates`** — accept a `readonly number[]` of selected indices instead of mapping
   over all candidates, and return the per-index status map for §9.4. Signature intent:
   `(indices: readonly number[], extractionId: string | null) => Promise<SaveOutcomeDetail & { byIndex: ReadonlyMap<number, ItemStatus> }>`.
3. **`finishCaptionPreview`** — pass the selection set through; the four `decideCaptionSaveOutcome`
   branches are unchanged.

No API change. No schema change. No new dependency. `ConfirmImportRequestSchema` already accepts a
subset of indices and caps at 20, above the extractor's 12.

---

## 11. Copy — every string on this screen, and deck deviations

### 11.1 Strings

| Where | String | Source |
|---|---|---|
| Kicker | `REVIEW & CONFIRM` | existing |
| H1, N≥2 | `{n} places found` | C30 |
| H1, N=1 | `1 place found` | C30 |
| Source row | `@{handle}'s TikTok` / `This TikTok` | C31 |
| Caption trigger | `Show the caption` / `Hide the caption` | new |
| Selection bar | `{selected} of {selectable} selected` | new |
| Selection bar action | `Select all` / `Deselect all` | C42 |
| Honesty statement | `We work out pins from what the caption said, so they can be a street or two off.` | new |
| Provenance, inferred name | `The caption called it "{rawName}"` | new |
| Provenance, verbatim name | `Named in the caption` | new |
| Meta fallback | `Location not given` | new |
| Hashtag note | `Only mentioned in a hashtag.` | replaces existing |
| Location, has coords | `Pin is approximate` | new |
| Location, no coords | `We couldn't place this one` | new |
| Verify link | `Check on Google Maps` | existing |
| Verify link, no coords | `Find on Google Maps` | new |
| Accounting, 1 | `1 of these has no location — it won't be saved.` | new |
| Accounting, n | `{n} of these have no location — they won't be saved.` | new |
| Primary, n≥2 | `Save {n} places →` | C37 |
| Primary, n=1 | `Save this place →` | C38 |
| Primary, n=0 | `Select a place to save` | C39 |
| Primary, saving | `Saving…` | existing |
| Primary, partial | `Continue to map →` | existing |
| Primary, N=0 | `Try another link` | existing |
| Ghost exit | `Back to the map` | new |
| Reassurance | `Nothing is saved until you tap Save.` | C40 |
| Failure, n≥2 | `Couldn't save those places. Try again.` | C72 |
| Failure, n=1 | `Couldn't save that place. Try again.` | C72 |
| Failure, all skipped | `Couldn't put those on the map. Nothing was saved.` | new |
| Partial notice | `Saved {n} places. {m} couldn't be saved.` | replaces existing |
| Chips | `Saved` · `Already on your map` · `Couldn't save` · `No location` | new |
| Close | `Close and return to map` (aria) | existing |

Banned-word check on every new string: no *metadata, LLM, AI, model, geocode, extraction, pipeline,
parse, API, payload, confidence score, job, worker*, no *"oops"*, no *"something went wrong"*.
"Confidence" is gone from the hashtag note for exactly this reason. Every apostrophe is a typographic
`’`; every quotation mark is a typographic `“ ”`.

### 11.2 Deck deviations, declared

1. **C42 threshold moves from N ≥ 4 to N ≥ 2.** The deck assumed a mixed preselection; this path
   preselects everything, so `Deselect all` is the fast route to "I only want one of these" and it is
   just as valuable at N = 2 as at N = 4.
2. **C37/C38 gain a trailing `→`.** `brand-and-product-foundation` §5's CTA rule postdates the deck
   and applies to every primary in the product.
3. **C72 is pluralised.** The deck's single string claims a plural save that may have been singular.
4. **Nine new strings**, listed above, for surfaces the deck never specified because the deck predates
   this path existing (the model-guess coordinate path has no `CandidateResolution`, so C32–C36's
   confident/ambiguous/unresolved vocabulary has nothing to attach to yet). When the resolver lands,
   `Pin is approximate` is the string that gets replaced by a real band — and that replacement is the
   whole point of keeping it a sentence rather than a number.

---

## 12. Acceptance checks

1. On a 390×844 viewport with the @exploringlondon TikTok, **the first candidate card is fully visible
   without scrolling**, and no promotional caption text is on screen until the user asks for it.
2. On 1440×900, `Save 8 places →` is visible without scrolling the card, with all eight candidates
   loaded.
3. Deselecting three cards changes the button to `Save 5 places →` with no layout shift and no card
   movement.
4. Deselecting all leaves a disabled `Select a place to save` plus a reachable `Back to the map`.
5. A candidate with `coordinates === null` has no checkbox, does not appear in the count, and its
   consequence is stated in the footer **before** the button is pressed.
6. No percentage, bar, dot or High/Medium/Low appears anywhere on the screen.
7. The card title equals the string that `derivePlaceSave` writes to `places.name` for that candidate —
   check the persisted row with `psql`, not the response body.
8. VoiceOver/NVDA: eight distinct Maps links, one live region, card state announced in words.
9. `prefers-reduced-motion: reduce`: no stagger, no translate, checkboxes correct on first paint.
10. Partial failure keeps the user on the screen with per-card chips and a `Continue to map →`.
