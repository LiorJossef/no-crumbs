# "No places found" — specification for the modal import outcome

> Owner: UX / Interaction. Date: **2026-08-30**. Task: **L2-NOPLACES-1**. Status: **spec for
> implementation**. `design-system-frontend` owns the code; this document owns the surface.
>
> Target: `src/app/import/import-page-client.tsx` — the dead `NoPlacesScreen` (~line 1204) is
> replaced, and `CaptionPreviewScreen`'s zero-candidate branches are removed. One additive change to
> `src/app/api/imports/probe/route.ts` (§3.4). No new dependencies: Tailwind + `components/ui/*` +
> Lucide, as everywhere else in this flow.
>
> Binding inputs, in precedence order where they conflict: `00-project-charter.md` §4 (scope), §6
> (quality bar and the banned aesthetic) · `working-agreement.md` §2 (done) ·
> `brand-and-product-foundation.md` §4 (tone), §5 (visual) · `ux-architecture.md` §5.3 (F10), §8
> (S8), §11 (a11y), §12.4 (copy deck) · `ux-import-review-screen.md` (the sibling surface, whose
> language this one inherits) · owner rulings in `current-state.md` §0.2.4 and
> `product-backlog-2026-08-29.md` §16.
>
> Deviations from ratified documents are listed in §12 with reasons. Product judgements — as
> distinct from applied rules — are marked **[JUDGEMENT]** so they can be overruled knowingly.

---

## 1. The problem, stated so the design follows from it

Roughly three imports in four end here. `CLAUDE.md` calls it: *"'no places found' is the modal import
outcome, so its screen is a core surface, not an error path."* Today it is neither designed nor
reachable:

1. **`NoPlacesScreen` is unreachable.** The `no_places` `Screen` kind is declared and the component
   is rendered at `import-page-client.tsx:855`, but **nothing constructs it**. `submit()` always
   lands on `caption_preview` (line 442). Confirmed by reading the file.
2. **So the live zero case is a half-empty review screen.** `CaptionPreviewScreen` renders a "Review
   & confirm" kicker over the headline `No places named`, a source row, a collapsed caption
   disclosure, one muted grey sentence, and a border-topped footer under a large empty gap. It
   announces itself as a review of nothing.
3. **The one forward action is a lie about itself.** `Try another link →` calls `onRetry` → `reset()`
   with no `clearUrl`, so it returns to the paste screen **with the same dead link still in the
   field** and an `Add →` button that will re-read the same caption and return the same nothing.
   `ux-architecture` §5.3 explicitly requires "an empty field, focused".
4. **The capability disclosure lives in the dead component.** "Some TikToks only show the place on
   screen" — the product's main capability disclosure at this hit rate — is in `NoPlacesScreen` and
   is therefore on nobody's screen.
5. **The user leaves with less than they arrived with.** They had a video they wanted to keep. They
   leave with nothing kept, nothing added, and no route to the place they can see in the video.

**The fact that constrains the honest answer.** ~81 of the owner's 113 saved TikToks name no venue
in the caption at all. In the majority of these cases **there is genuinely nothing in the text to
find** — the video shows the place, the words do not name it. Therefore:

- This screen must never imply failure. Nothing broke.
- It must never offer a retry. A retry re-reads the same caption and returns the same nothing;
  offering it is a lie about our capability (`ux-architecture` §5.3).
- It must never explain or defend the hit rate. Owner ruling, `current-state.md` §0.2.4: the
  no-places copy **must not be rewritten to defend ~27%** — that adopts a position the owner
  declined. No "we only use official APIs", no "we're getting better at this", no roadmap promise.
- And it must still be worth the user's trip. The one thing we can honestly give them is a way to
  add the place *they* know, linked to the post they found it in.

**The sentence this screen is built on:**

> **The post didn't say. You might know. Here's the fastest way to say it — and we'll still remember
> which TikTok it came from.**

---

## 2. Scope check against Charter §4

| Element | Charter §4 status |
|---|---|
| The designed no-places screen | **In scope** — capability 7 ("designed failure state… retry, open original, or add a known place") |
| Add by name, inline on this screen | **In scope** — capability 13 ("Manual place addition (search a POI by name → select → save)"), plus the owner ruling in backlog §16 #2 taking the narrow "tell us the name" version, on this screen, explicitly distinct from the withdrawn "paste the caption" |
| Linking the manually-added place to the TikTok source | **In scope** — capability 8 ("linked to the source TikTok(s)") |
| Showing the caption back to the user | **In scope** — read-only display of content we already fetched and already display on the sibling review screen |
| Save the link for later / import history | **Out** → §13 Future |
| Any media, audio, transcript or OCR route | **Out**, hard owner constraint. Nothing in this spec touches it |
| A textarea for the user to paste post text | **Forbidden** — `ux-architecture` §5.1: *"If this screen ever grows a textarea, the product has failed its own premise."* This spec's field is a **place-name search field**, one line, `type="search"`, and it must never be widened |

**Quota.** Nothing in this spec spends provider quota except a user's own deliberate search tap. The
design makes that explicit and cheap: **no type-ahead, no keystroke search, no prefetch, no
warm-up** — one lookup per submit, exactly like a seed link costs one model call per tap. §6.4.

---

## 3. States, and how the screen knows which one it is in

### 3.1 The four honest cases

| # | Case | Condition | Why it is different |
|---|---|---|---|
| **A** | **No caption at all** | `caption === null` | We opened the post fine. There was no text. This is about the post's shape, not about our reading |
| **B** | **The caption named nothing** | caption present, zero candidates survive | The modal case. We read it; it doesn't name a place |
| **C** | **The caption named an area, not a place** | caption present, zero candidates survive, and the extraction produced a `cityHint` while dropping at least one candidate as city-or-country-only | We know *roughly where* but not *what*. The only case where knowing it changes what we can do |
| **D** | **Candidates survived, none is saveable** | `candidates.length > 0` and `saveableIndices.length === 0` | **Not this screen.** See §3.5 |

### 3.2 Is the B/C distinction worth surfacing? Partly — and only as behaviour

**[JUDGEMENT]** The brief asks whether "the caption named nothing" and "the caption named something
we could not resolve" deserve different treatments. My answer is **no as a label, yes as a
behaviour**, and the reason is evidence rather than taste:

- The individual drop reasons are **not reliable enough to make a claim to a user with**. Backlog
  §8.18 measures `evidence_not_in_caption` firing 4 times and being **wrong 4 out of 4**. A screen
  that says "we found a name but it didn't check out" would be reporting a filter's opinion as a
  fact about the user's post, on a filter we have measured as wrong.
- Surfacing "we discarded something" invites the obvious next question — *show me what you
  discarded* — and the answer would be model output we already judged to be junk. That is the
  opposite of preserving the extracted-vs-inferred distinction; it dresses noise as a finding.
- So **only one sub-case survives**: `city_or_country_only` together with a `cityHint`. That one is
  checkable (it is a place name we can resolve, not a confidence judgement), it is non-accusatory,
  and it **changes what we can offer** — it scopes the search. A distinction that changes nothing is
  chrome; a distinction that scopes a search earns its place.
- Everything else collapses into case B. Same headline, same body, same actions.

**No confidence number, band, bar or percentage appears anywhere on this screen**, and no drop counts
reach the browser (§3.4). The review screen bans them by rule; this screen inherits the ban.

### 3.3 A/B is worth surfacing outright

Case A is not our capability boundary, it is the post's. "There is no caption on this one" and "the
caption doesn't name anywhere" are different true statements, and a user who pastes three
caption-less posts in a row learns something useful from the first framing that the second would hide.

### 3.4 The contract change (server side)

`ProbeSuccess` gains **two additive fields**. Neither is a drop count and neither is model text.

```ts
/** Why this import produced no candidates. Non-null only when `candidates` is empty. */
readonly emptyReason: 'no_caption' | 'nothing_named' | 'area_only' | null;
/** The extraction's own city hint, when it produced one. The only thing we know about *where*
 *  when we know nothing about *what*. */
readonly cityHint: string | null;
```

Derivation, computed **server-side in the route**, in this order:

```
caption === null                                              → 'no_caption'
kept.length > 0                                               → null
dropped.city_or_country_only > 0 && cityHint !== null          → 'area_only'
otherwise                                                      → 'nothing_named'
```

Three notes the implementer needs:

1. **The drop counts must not leave the server.** `PlausibilityResult.dropped` is documented as
   count-only for logs (`07` §7.1). The response carries the enum, not the counts. One enum is the
   same discipline as "the browser may never send a place fact", in the other direction.
2. **A cache hit cannot distinguish B from C.** `filterPlausible` does not re-run on a cached
   extraction (`route.ts:607-616`), so `dropped` is unavailable and `emptyReason` is
   `'nothing_named'`. That is the honest floor: we do not know, so we do not claim. Do not
   reconstruct it by re-running the filter — that changes what the user sees between two identical
   imports.
3. **`cityHint` is only populated on a fresh extraction.** `extractionCityHint` is assigned in the
   non-cached branch only (`route.ts:615`), and there is no column for it — recorded in
   `current-state.md` §5.6 and backlog §5.6. Until it is persisted, a cached zero-candidate import
   is always case B. Persisting it is the cheap fix and is **not** a prerequisite for this screen.

### 3.5 Case D is a different screen, and this spec routes it away

`saveableIndices.length === 0` with candidates present is *not* "no places found" — the screen has
content, and in the `ambiguous` sub-case one tap on a shortlist option turns it saveable. It stays on
`CaptionPreviewScreen`. Today the footer collapses D into the zero case with
`n === 0 || saveableIndices.length === 0` (line 1702); after this work that condition becomes
`saveableIndices.length === 0` alone. D's own copy is out of scope here and is flagged as adjacent
work in §14.

### 3.6 The full state list for this surface

Every state the implementer must build, including the ones inside it:

| State | Trigger | Notes |
|---|---|---|
| `browse` (default) | arrival from the rail with zero candidates | §4, §5. Four copy variants A/B/C, three when C's data is unavailable |
| `browse` · no manual add | build has no place search | §5.4. **This is the shippable-today variant** |
| `search.idle` | field focused or typed into, not submitted | Nothing has been requested |
| `search.pending` | submit | One in-flight lookup, guarded like `inFlightProbe` — a second submit while one is running is refused, not queued |
| `search.results` | N ≥ 1 results | List of at most 5. Never auto-selects, even at N = 1 |
| `search.none` | 0 results | Designed, not an error. §6.6 |
| `search.failed` | lookup threw / offline / unavailable | §6.7. The typed query is **never** cleared |
| `confirm` | a result is tapped | One extra tap on purpose — Charter §3 invariant 2 is uniform across both save paths |
| `saving` | confirm tapped | Button becomes `Adding…` |
| `saved` | save returned | Leaves the flow into the map's normal post-save behaviour, including the pin flight |
| `save.failed` | save threw | Stays on `confirm` with an inline message and the same button live again |

There is no `loading` state. This screen is arrived at, never fetched.

---

## 4. Layout — mobile first (375 × 812)

The screen lives inside the existing import shell: `px-5`, `pt-[calc(env(safe-area-inset-top)+2rem)]`,
`pb-[calc(env(safe-area-inset-bottom)+1.5rem)]`, `h-dvh` standalone / `absolute inset-0` as an
overlay, `max-w-md`. Do not invent a second shell.

```
┌───────────────────────────────────────┐
│ (✕)                                   │  36px circle, 44px hit area, top-left — unchanged
│                                       │  56px clearance (existing `h-14` spacer)
│ ▪ WE READ IT                          │  ScreenKicker — mint dot + 11px tracked caps
│ No places in this one.                │  H1, font-heading, 2xl, extrabold, tabIndex={-1}
│                                       │
│ We read the caption, and it doesn't   │  15px medium, muted, max ~34ch
│ name a place we can put on a map.     │  aria-describedby target of the H1
│ Some TikToks only show the place on   │
│ screen.                               │
│                                       │
│ ┌──┐  @handle's TikTok  ↗             │  48px source row. Thumbnail slot never collapses.
│ │▓▓│  Hide the caption  ⌄             │  Both lines are 44px targets
│ └──┘                                  │
│ ┌───────────────────────────────────┐ │  ── SCROLL REGION (min-h-0, flex-1) ──
│ │ Caption text, dir="auto",         │ │  EXPANDED by default. max-h ~152px,
│ │ own scroll, tabIndex={0}          │ │  own scroll, overscroll-contain
│ └───────────────────────────────────┘ │
│                                       │  ── END SCROLL REGION ──
│ ─────────────────────────────────────  │  hairline
│ Know where this one is? Add it by     │  15px, foreground — the field's visible label
│ name.                                 │
│ ┌───────────────────────┐ ┌─────────┐ │  h-12 field + h-12 button, gap-2
│ │ Search for a place    │ │ Search →│ │  Field NEVER autofocuses
│ └───────────────────────┘ └─────────┘ │
│ (Near Tel Aviv ✕)                     │  case C only — removable scope chip
│                                       │
│      Try another TikTok               │  h-11 ghost, mint text
└───────────────────────────────────────┘
```

### 4.1 Why the field is in the thumb zone and not in the body

Three reasons, all mechanical:

1. **Reach.** On an 812pt phone the vertical middle of the screen is a stretch for a one-handed
   thumb; the bottom 200pt is not. The primary control belongs there — the same rule that put the
   paste field there on F0.
2. **Keyboard occlusion.** iOS does not reliably shrink `100dvh` when the software keyboard opens; it
   shrinks the *visual* viewport. A field in the middle of the column can end up under the keyboard
   with no scroll to recover it. A field pinned to the bottom of the flex column rises with the
   keyboard's own scroll-into-view and stays visible.
3. **It reads as an offer, not a form.** A text field at the top of a screen is a task. A text field
   in the action zone, under a sentence that names what it is for, is one of the two things you can
   do next.

### 4.2 Why the caption is expanded by default here — and collapsed on the review screen

**[JUDGEMENT]** On the review screen the caption is *evidence on demand* and collapsing it was right:
the candidates are the content, and 1,000 characters of promo copy pushed them below the fold
(`ux-import-review-screen.md` §1.1). **On this screen there are no candidates, so the caption is the
only content there is.** Collapsing it produces a screen that says "nothing here" twice — once in the
headline and once in the empty space below it.

It also does real work:

- It is the **evidence for our claim**. We assert "it doesn't name a place"; the user checks in one
  glance, and either agrees or spots the name themselves.
- Spotting the name themselves is precisely the input the field below wants. The caption and the
  field are one interaction, and they must be visible together.
- It makes the screen feel like a *reading*, not a shrug.

Hard cap `max-h-38` (~152px) with its own scroll and `overscroll-contain`, so it can never push the
field off the bottom regardless of caption length. The collapse toggle stays (`Hide the caption`), and
the state is not persisted — every arrival starts expanded.

**Case A has no caption panel at all** — no empty box, no placeholder. The row loses its second line
and the layout closes up.

### 4.3 One affordance per action

`Open the original TikTok` appears **once**, as the source row's `@handle's TikTok ↗`. It is not
repeated as a footer text link. This is a deliberate deviation from `ux-architecture` §5.3's action
stack (§12), and it closes one instance of backlog §13's recorded defect: four different labels for
one action across the product. Top placement is also the better placement — it sits with the context
it belongs to, and it is the first thing the eye reaches.

Fallback chain for the label: `@{authorHandle}'s TikTok` → `{authorName}'s TikTok` → `This TikTok`.
All three are 44px, mint, with a trailing `↗`.

**The thumbnail is optional to the layout.** Backlog §2.19 records that rendering
`probe.thumbnailUrl` hotlinks TikTok's CDN and hands them the user's IP, UA and Referer on every
import. If that is proxied or dropped, the 48px slot renders the existing muted `Link2` placeholder
and **the row must not change shape**. Do not build a layout that depends on the image existing.

### 4.4 What is deliberately not on this screen

No illustration. No empty-state mascot. No card wrapping the whole thing. No gradient beyond the
existing `--brand-wash`. No badge, chip or pill except case C's scope chip. No progress remnant from
the rail. No "Did you know…" tip. No count of how many TikToks you have imported. No suggestion of
another creator to try. Charter §6's banned aesthetic is enforced here by subtraction: the screen is
type, one hairline, one field and one caption panel.

---

## 5. Copy — the actual strings

All strings are English. `<html lang="en">` is hardcoded and there is no i18n layer; "works in
Hebrew" therefore means **written so it survives translation without restructuring**, plus bidi-safe
rendering of the Hebrew *content* the screen displays. §7 covers both.

### 5.1 The screen, by case

| Case | Kicker | H1 | Body |
|---|---|---|---|
| **A** no caption | `NO CAPTION` | `This one has no caption.` | `We opened it fine — there's just no caption to read. Some TikToks only show the place on screen.` |
| **B** nothing named | `WE READ IT` | `No places in this one.` | `We read the caption, and it doesn't name a place we can put on a map. Some TikToks only show the place on screen.` |
| **C** area only | `WE READ IT` | `No places in this one.` | `We read the caption. It points at {cityHint}, but doesn't name the place itself.` |

Notes:

- **B's H1 is C69 verbatim.** Its body is C70 restructured into two sentences so the capability
  disclosure stands alone; the disclosure sentence is C70 verbatim.
- **C drops the capability disclosure**, because C has already explained itself and a third sentence
  makes the screen wordy. The disclosure survives on A and B, which together are the overwhelming
  majority of arrivals, so §5.3's "the product's main capability disclosure" is not lost.
- **"That happens a lot." is deleted.** It ships today in the live path
  (`import-page-client.tsx:1616`) alongside "Some TikToks only show the place on screen." Two
  normalising sentences is one too many, and the second is the one that edges toward defending the
  hit rate — which the owner ruling forbids. Keep the capability fact, drop the reassurance.
- `{cityHint}` renders inside `<bdi>`. It can be Hebrew (`תל אביב`) next to English chrome.

### 5.2 The add-by-name block

| Element | String |
|---|---|
| Offer line (also the field's accessible label) | `Know where this one is? Add it by name.` |
| Field placeholder | `Search for a place` |
| Submit button | `Search →` |
| Submit, pending | `Searching…` |
| Scope chip (case C only) | `Near {cityHint}` |
| Scope chip remove, `aria-label` | `Search everywhere instead` |
| Results heading (visually hidden, `role="status"`) | `3 places match "kolamba".` / `1 place matches "kolamba".` |
| Zero results | `No places match "{query}."` + `Try a different name.` |
| Search unavailable | `Search isn't working right now. Try again in a moment.` |
| Offline | `You're offline. Check your connection and try again.` |
| Confirm card action | `Add to my map →` |
| Confirm card, provenance line | `We'll link it to this TikTok.` |
| Confirm card, back | `Back to results` |
| Confirm, saving | `Adding…` |
| Save failed | `Couldn't add that one. Try again.` |

The offer line is `ux-architecture` §5.1's framing verbatim (with "this one" for consistency with the
headline). The placeholder and the zero-results pair are §8 / C45 verbatim.

### 5.3 The secondary action

| Element | String |
|---|---|
| Forward action | `Try another TikTok` |
| Exit, when rendered as a button | `Back to the map` |

`Try another TikTok` is `IMPORT_ERROR_ACTION_LABEL.another_tiktok` — read from that map, do not add a
second literal. `Back to the map` is `IMPORT_ERROR_ACTION_LABEL.back_to_map`.

### 5.4 The shippable-today variant (no place search)

Manual add (S8 / `L1-F7-T1`) does not exist. The existing rule in `import-error-copy.ts` is right and
this screen inherits it: **a recovery only ever points somewhere that works.** So the screen renders
in two variants, gated on a single boolean the build owns (a capability flag, or the presence of the
search route — `design-system-frontend`'s call):

| | With place search | Without (today) |
|---|---|---|
| Offer line + field + Search | present, in the thumb zone | **absent entirely** — no greyed field, no "coming soon" |
| Primary action | `Search →` (in the field row) | `Try another TikTok`, `h-12`, solid mint |
| Secondary | `Try another TikTok`, `h-11` ghost | `Back to the map`, `h-11` ghost |
| Exit | ✕ top-left | ✕ top-left **and** the ghost `Back to the map` |

The second exit in the no-search variant is deliberate: with no field, the footer would otherwise hold
one button, and the ✕ is a 36px target in the top-left corner of an 812pt screen — the single hardest
place on the device for a right thumb. This is the one place the "two ways out of one screen"
inconsistency (backlog §13) is the correct answer rather than a defect, and the reason is reach.

Switching variants is a **props change, not a layout change**: block order, spacing and every string
outside the add-by-name block are identical.

---

## 6. Interaction

### 6.1 Entry

Arrival is from the rail, in the same component, with no navigation. `submit()` sets
`{ kind: 'no_places', probe: body }` when `body.candidates.length === 0`, instead of falling through
to `caption_preview`. Everything else about `submit()` — the abort controller, the race gate, the
in-flight guard — is unchanged and must stay.

The rail's last fact is already correct (`No places named`, line 439) and should be left alone; it is
the sentence that makes the transition read as a result rather than a jump.

### 6.2 Exits, and what happens to the link

| Affordance | Behaviour | The link |
|---|---|---|
| ✕ (top-left) | `leaveImport()` — overlay closes in place, standalone route pushes `/map` | Discarded with the flow. No save happened, so no `router.refresh()` |
| `Try another TikTok` | `reset({ clearUrl: true })` then focus the paste field | **Cleared.** §5.3: "returns to F0 with an empty field, focused" |
| `Back to the map` (ghost, no-search variant) | Same as ✕ | Discarded |
| `@handle's TikTok ↗` | Opens the canonical URL in a new tab. Does **not** leave the flow | Kept — the screen is still there when they come back |
| A completed add | Leaves the flow exactly as a normal confirm does, including the camera flight to the new pin | Cleared |

**The link must be cleared by `Try another TikTok`, and this is a change from today.** `reset()` was
correctly taught to *keep* the URL on Cancel (a cancel says nothing about the link being wrong). This
action says the opposite: this link is finished, we read it, there is nothing in it. Returning the
user to a paste screen pre-loaded with a link that will produce this same screen again is the flow's
worst possible loop. Pass `clearUrl: true` and move focus into the empty field.

**The `imports` row already records the attempt** (status `no_places`, with the source and its
timings). Do not claim that on screen — there is no surface where the user can see it (backlog
§5.11). §13 has the Future item.

### 6.3 Focus and the keyboard

- On arrival, focus moves programmatically to the H1 (`tabIndex={-1}`), which carries
  `aria-describedby` pointing at the body paragraph. This is what announces the news, and it is why
  no live region is needed (§8.2).
- **The search field never autofocuses.** Three in four imports land here; raising the software
  keyboard uninvited on three in four imports, over the caption the user needs to read, is the
  single worst thing this screen could do. Contrast with F0's paste field, which *should* autofocus,
  because arriving there means you already have a link.
- The field is `type="search"`, `enterKeyHint="search"`, `autoCapitalize="words"`,
  `autoCorrect="off"`, `spellCheck={false}`. `autoCapitalize="words"` is right here and wrong on the
  paste field — this is a proper noun, not a URL.
- The field and its button are in a real `<form>`; Enter and the phone keyboard's Go/Search key both
  submit. (The paste field's own `<form>` fix is the precedent — backlog §2.1.)
- Submitting blurs nothing and dismisses nothing; the keyboard closing is iOS's business, and the
  results appear above the field either way because of §6.5.

### 6.4 Search costs one lookup per tap, and the design says so

Non-negotiable, and it is a design rule, not an optimisation:

- **No type-ahead. No debounce-and-fire. No search on keystroke, blur, or paste.** One lookup happens
  when, and only when, the user submits.
- A second submit while one is in flight is **refused**, not queued and not aborted-and-restarted —
  the same shape as `inFlightProbe`, and for the same reason: five taps must not become five lookups.
- No prefetch on mount, no warm-up, nothing on hover.

This is what makes the field safe against a 100/day provider ceiling and against
`rateLimitedLocal` having no production call sites. It also happens to be the better interaction:
type-ahead over a global place index produces a flickering list that punishes typing, and the user
here is entering a name they already know.

### 6.5 Browse → search is a state change, not a growing page

When the search is submitted:

1. The **caption panel collapses automatically** and its toggle reads `Show the caption`. It has done
   its job; keeping it open would leave ~150px of read text between the query and its answer.
2. The body sentence stays. The headline stays. Nothing else moves.
3. The results occupy the scroll region, above the field.

A ✕ inside the field (standard `type="search"` clear) returns to `browse` and re-expands the caption.

Tapping a result replaces the results list with the confirm card in the same region. `Back to results`
returns. The field and the query are untouched throughout.

### 6.6 Zero results is designed, not an error

Same visual register as the screen it sits in — muted body text, no destructive colour, no icon:

```
No places match "kolamba".
Try a different name.
```

The query stays in the field so it can be edited, not retyped. No suggestions engine, no "did you
mean", no fuzzy alternatives (§8 is explicit about this and it is right — a wrong suggestion here
costs more than no suggestion).

### 6.7 Search failure and recovery

Three distinguishable causes, three strings (§5.2), one rule: **the typed query is never cleared, and
the button returns to `Search →` live.** Offline is checked with `navigator.onLine` before the request
is issued, so an offline submit costs nothing and says the true thing immediately (backlog §2.8's
defect, not repeated here).

The message renders where the results would, in `role="status"`, not as a toast and not as a
destructive banner. A failed search is not a failed import.

### 6.8 What a save from this screen writes

The place the user picks was resolved by the same resolver as any import candidate, so it carries a
real provider identity, coordinates and category. Two properties must hold, and one is a genuine
improvement over S8's standalone flow:

1. **It links the source.** `sourceId` is in hand (`ProbeSuccess.sourceId`). The user saved this
   place *because of that TikTok*, and the product's "which post made me save this?" question must
   have a real answer here. This is why inlining the search on this screen beats routing to `/add-place`
   — the standalone route would lose the source.
2. **It must not claim caption-derived provenance.** The name came from the user, not from the
   extraction. So: no `extracted_reason`, no model `tags`, no `why_go`, no `dishes` on this save.
   Whether `origin` needs a third value to express "imported post, user-named place" is
   `supabase-database`'s ruling, not mine — but the invariant is stated here because it is a UX
   invariant: **nothing on the place's detail screen may later imply the caption named it.**

`extractionId` may be `null` (persist failed). That does not block this path — a resolver-backed save
does not read the extraction row. Do not gate the field on it.

---

## 7. Hebrew, English and RTL

The UI chrome is English and LTR today. Hebrew reaches this screen as **content**: the caption, the
creator handle and name, `cityHint`, and every place name in the search results. Two obligations.

### 7.1 Bidi-safe today (required, checkable)

| Element | Requirement |
|---|---|
| Caption panel | `dir="auto"` on the panel. A Hebrew caption must render right-aligned and RTL inside an LTR screen, with no mixed-direction mangling of embedded Latin words and hashtags |
| Handle / author name | `<bdi>` around the handle. `@handle's TikTok` puts an LTR token in an English possessive; without `<bdi>` a Hebrew display name reorders the whole line |
| `{cityHint}` in body copy and in the scope chip | `<bdi>` |
| Search result name and address | `<bdi>` + `line-clamp`, **never** `truncate` — a Hebrew name truncated LTR clips its identifying start. This is backlog §5.6, already fixed on saved rows; do not reintroduce it here |
| Query echoed in `No places match "{query}"` | `<bdi>` around the query |
| Layout classes | Logical properties throughout — `ps-`/`pe-`, `ms-`/`me-`, `text-start`. No `pl-`, `pr-`, `ml-`, `mr-`, `text-left`. This is what makes an RTL chrome pass a value change rather than a rewrite |

### 7.2 Copy written to survive translation (required, reviewable)

- **No idioms, no puns, no wordplay.** Every string above is literal.
- **No string assembled from fragments in a fixed word order.** `{cityHint}` appears inside one
  complete sentence, not as `"It points at " + city + ", but"` concatenated in the component.
- **The English possessive `'s` is the one construction that does not survive.** `@handle's TikTok`
  has no direct Hebrew form; it becomes "הטיקטוק של @handle". Flagged, not fixed — it is the
  shipped label across the product and changing it is a cross-surface decision, not this screen's.
- **`Know where this one is?`** — "this one" needs a noun in Hebrew ("הסרטון הזה"). Translatable, but
  the register shifts from casual to explicit. Acceptable.
- **The uppercase tracked kicker does not exist in Hebrew.** Hebrew has no case, so
  `text-[11px] uppercase tracking-[0.14em]` renders as unstyled small text and the kicker loses its
  entire visual identity. An RTL chrome must express the kicker by weight and colour instead. This is
  a **system-level flag**, not a fix for this screen — it applies to every `ScreenKicker` in the
  product.

### 7.3 The font flag, and why this screen is the strongest case for it

**Manrope has no Hebrew subset** (backlog §12.8 — the available subsets are `cyrillic, greek, latin,
latin-ext, vietnamese`; adding `'hebrew'` fails the build). A Hebrew caption on this screen therefore
renders in a system fallback face, at a different weight and rhythm from every other word on the
screen.

This screen displays **the longest continuous Hebrew text anywhere in the product** — a full caption,
expanded by default, in the primary reading position, on the modal import outcome, in the product's
primary market. It is the strongest single argument for adding a second family (Rubik / Assistant /
Noto Sans Hebrew). Recorded here so the case is on the record when 12.8 is scheduled; **it does not
block this screen.**

---

## 8. Accessibility

### 8.1 Focus order

1. H1 (programmatic on arrival, `tabIndex={-1}`, not in the tab ring afterwards)
2. ✕ close
3. `@handle's TikTok ↗`
4. Caption toggle (`aria-expanded`, `aria-controls`)
5. Caption panel — `tabIndex={0}`, `role="group"`, `aria-label="The TikTok's caption"`. It is a
   scrollable region; a scrollable region no keyboard user can reach is a WCAG 2.1.1 failure, and one
   extra tab stop is the correct price
6. Search field
7. Scope chip remove (case C only)
8. `Search →`
9. Results, in order — each a `<button>` inside an `<li>`
10. `Try another TikTok`
11. `Back to the map` (no-search variant only)

In the `confirm` state, focus moves to the confirm card's heading; `Back to results` restores focus to
the result row that was tapped.

### 8.2 Screen-reader semantics

- **The arrival is announced by the focus move, not by a live region.** The H1 carries
  `aria-describedby={bodyId}` so headline and body are read as one utterance. The page-level
  `role="status" aria-live="polite"` region in `import-page-client.tsx` (line 768) carries failure
  copy only — **this screen must not be pushed into it.** Nothing broke; announcing it as an alert
  would be the lie the whole screen exists to avoid.
- Nothing on this screen uses `role="alert"` or `aria-live="assertive"`. Not the zero-result state,
  not the search failure.
- Search results are announced once, politely: `3 places match "kolamba".` in a `role="status"`
  region that is always mounted (a live region created in the same commit as its first message is not
  reliably announced — the pattern already used at line 768).
- **Each result button has a distinct accessible name**: `{name}, {address}`. Five buttons all
  reading "Add" is the exact defect `ux-import-review-screen.md` §1.7 found on the sibling surface.
- The scope chip's remove button: `aria-label="Search everywhere instead"`, never a bare "✕".

### 8.3 Targets, spacing and contrast

- Every interactive element ≥ 44 × 44 CSS px, including the scope chip's remove control (visual glyph
  may be 20px; the hit area may not).
- 8px minimum between adjacent targets. The field and its `Search →` button are `gap-2`.
- No `text-muted-foreground/70` and no `border-[…]/15` anywhere on this screen (backlog §13.9 — both
  are below the bar). Muted body text is `text-muted-foreground` at full opacity.
- The zero-result and search-failure messages are muted body text, not destructive red. Red is
  reserved for `save.failed`, which is a genuine failure of an action the user took.

### 8.4 Reduced motion — a complete equivalent for every animation

| Motion | Full | `prefers-reduced-motion: reduce` |
|---|---|---|
| M1 arrival | opacity 0→1 + `translateY(8px)→0`, 180ms | **opacity only**, 100ms, no translate. Not "no transition" — a hard swap severs the causal link to the rail, and opacity is not vestibular |
| M2 caption collapse/expand | height 0↔auto (or `grid-template-rows` 0fr↔1fr), 160ms; chevron rotates 180° | Instant show/hide. Chevron flips with no transition |
| M3 results appear | rows fade in together, 120ms, **no stagger** | Instant |
| M4 search pending | `Loader2` spinner replaces the button's arrow | **The spinner is removed and the label becomes `Searching…`**. Suppressing the spinner alone would leave a reduced-motion user with no pending indicator at all — this is the equivalence the rule demands, not just `animate-none` |
| M5 anything else | — | There is nothing else. No pulse, no shimmer, no icon entrance, no confetti, ever |

There is currently no global `prefers-reduced-motion` rule in the codebase (backlog §13.5); until
there is, every one of the above carries its own `motion-reduce:` variant explicitly.

### 8.5 Motion intent and timing

Easing for M1–M3 is the standard decelerate curve `cubic-bezier(0.2, 0, 0, 1)`.

**Every animation here communicates something or it is deleted** (Charter §6):

- **M1 communicates causality** — this screen is the *result* of the rail you just watched, arriving
  in the same place, not a new page. That is why it is a rise-and-fade in place and not a slide.
- **M2 communicates that the panel is one object changing size**, so a user who collapses it knows
  where it went.
- **M3 communicates arrival of an answer.** No stagger: staggering five rows here would borrow the
  review screen's signature moment for a utility list and cost frames for nothing.

This screen is **not one of Charter §6's five signature moments** and must not be dressed as one. Its
budget is one compositor-only transform+opacity on arrival plus one capped height transition.

**Expected pushback from `design-system-frontend`, pre-answered:** if animating height on the caption
panel costs layout on a mid-range phone, **drop M2 entirely** — instant show/hide is acceptable and
loses nothing this spec depends on. M1 is the one that must survive.

---

## 9. Desktop (secondary)

Desktop is the same screen in the existing centred card — `lg:w-[clamp(420px,34vw,480px)]`,
`lg:max-h-[min(52rem,calc(100vh-4rem))]`, hairline border, `--shadow-elevated`, over a dimmed map in
overlay mode. Do not design a second layout.

Three differences, all mechanical:

1. **The footer must never scroll away.** The card is `flex flex-col`; the caption/results region is
   the only `overflow-y-auto` with `min-h-0`; the add-by-name block and the secondary action are
   `shrink-0`. This is the exact defect `ux-import-review-screen.md` §1.8 found on the sibling card
   and it will recur here if the card keeps `lg:overflow-y-auto` on itself.
2. **The caption panel may be taller** — cap at ~240px on `lg`, since there is no keyboard competing
   for the viewport.
3. **The field is not in a "thumb zone"** on desktop, but it stays in the same position in the flow;
   there is no reason to reorder, and reordering would make the two breakpoints two designs.

Hover states: result rows get a `bg-muted/50` hover; nothing else gains one. No hover-only
information anywhere.

---

## 10. What to change in the code (for the implementer)

Not code — the seams, so nobody has to ask.

1. **`Screen`'s `no_places` variant becomes** `{ kind: 'no_places'; probe: ProbeSuccess }`. The
   current `{ authorHandle }` shape cannot express cases A/B/C or feed the search.
2. **`submit()`**: after the rail's final fact, branch on `body.candidates.length === 0` →
   `setScreen({ kind: 'no_places', probe: body })`, else `caption_preview` as today. Nothing else in
   `submit()` changes.
3. **Delete `NoPlacesScreen` as it stands** (lines 1204–1263) and build the screen in this spec in its
   place. Its header comment's promise — "when S8 lands, restore `Add a place you know` as the
   promoted primary" — is discharged by §5.4's two variants.
4. **`CaptionPreviewScreen` loses its zero-candidate branches**: the `probe.caption === null` and
   `n === 0` arms of the H1 (lines 1541–1547), the `n === 0` muted-sentence block (lines 1612–1617),
   and the `n === 0 ||` in the footer condition (line 1702), which becomes
   `saveableIndices.length === 0`. It becomes what its name says: a screen for reviewing candidates
   that exist.
5. **`route.ts`** gains the two additive response fields of §3.4 and the derivation. Additive only —
   existing clients ignoring them must keep working.
6. **Strings**: `Try another TikTok` and `Back to the map` are read from
   `IMPORT_ERROR_ACTION_LABEL`. The new strings in §5 need copy-deck ids from me before this doc is
   treated as the source of truth for them; until then this document is the source.
7. **`NO_CAPTION`'s entry in `IMPORT_ERROR_COPY` is very likely dead.** The route returns
   `caption: null` with zero candidates (`route.ts:565`, `583-585`) rather than throwing
   `noCaption()`. If that is confirmed, case A here is the *only* no-caption screen and the
   duplicate-screen inconsistency in backlog §13 item 5 closes with it. **Verify before deleting** —
   the constructor may still be reachable from `runImport`.

---

## 11. Acceptance criteria

Verifiable at **375 × 812** and **1280 × 720**, signed in, without asking the author. Every one is a
pass/fail.

**Reachability and routing**

1. A real TikTok whose caption names no venue lands on this screen. `NoPlacesScreen` is no longer
   unreachable, and `CaptionPreviewScreen` never renders with zero candidates.
2. A TikTok with no caption at all lands on case A, with **no caption panel** — not an empty one.
3. A caption with candidates that all fail plausibility lands on case B or C, never on a failure
   screen and never on a review screen.
4. A caption whose only place-word is a city, on a **fresh** (uncached) extraction, lands on case C
   and the scope chip names that city.
5. A candidate that survives but is unsaveable (case D) does **not** reach this screen.

**Honesty**

6. The word **"error"** appears nowhere on screen. The words **"sorry"**, **"oops"**, **"failed"**
   and **"couldn't"** appear nowhere in cases A/B/C. (`Couldn't add that one.` is permitted in
   `save.failed`, which is a real failure.)
7. **No retry affordance exists** in any of A/B/C. No button, link, or gesture re-runs the same URL.
8. **No number, percentage, band, bar or count** describing our confidence, our hit rate, or how many
   candidates were discarded appears anywhere, including in the DOM and including in `aria-label`s.
9. No sentence explains, excuses or defends the extraction hit rate.
10. `Try another TikTok` returns to a paste screen with an **empty, focused** field — verified by
    reading the field's value, not by looking at it.

**The offer**

11. In the with-search variant, adding a place takes: tap field → type → Search → tap result → tap
    `Add to my map`. **Four taps and one word of typing** from a screen the user did not ask for.
12. The search field **does not autofocus** and the software keyboard does not appear on arrival.
13. Submitting the search issues **exactly one** provider lookup. Typing issues zero. Five rapid
    submits issue one. Measured in the network panel, not asserted from the code.
14. A place added here is linked to the source TikTok — verified by reading the persisted row, and by
    the place's detail screen showing the post.
15. A place added here carries **no** `extracted_reason`, `tags`, `why_go` or `dishes`.
16. In the no-search variant, no field, no greyed control and no "coming soon" is rendered, and the
    footer's primary is `Try another TikTok`.
17. Every action on screen reaches a destination that works. There is no button whose label names
    something the build does not have.

**Reading and language**

18. When a caption exists it is **visible without any interaction**, capped in height, with its own
    scroll, and it can never push the primary action off the bottom — tested with a 2,000-character
    caption.
19. A Hebrew caption renders RTL and right-aligned inside the panel, with embedded Latin words and
    hashtags in the correct order.
20. A Hebrew place name in a search result is not clipped at its identifying start.
21. `grep` finds no `text-left`, `pl-`, `pr-`, `ml-`, `mr-` in this screen's markup.

**Accessibility**

22. On arrival, VoiceOver/NVDA reads the headline **and** the body sentence, from the focus move,
    with no live-region announcement and no `alert` role.
23. Tab order matches §8.1 exactly, including the caption panel as a reachable scroll region.
24. Five search results produce five **distinct** accessible names.
25. Every interactive element measures ≥ 44 × 44 CSS px in the inspector, including the scope chip's
    remove control.
26. With `prefers-reduced-motion: reduce`, no element translates, and the pending state still reads
    `Searching…`. Verified with the OS setting, not with a class name.

**Layout**

27. At 375 × 812 with the keyboard open, the search field and its button are fully visible.
28. At 1280 × 720 with a long caption, the add-by-name block and the secondary action are visible
    without scrolling the card.
29. Switching between the two variants changes no spacing, no block order and no string outside the
    add-by-name block.

**Regression**

30. Cancel during the rail still keeps the pasted link (that behaviour is not this screen's and must
    not be collateral damage).
31. A TikTok that *does* yield candidates still lands on the review screen, unchanged.

---

## 12. Deviations from ratified documents, with reasons

| Document | Ratified | This spec | Why |
|---|---|---|---|
| `ux-architecture` §5.3 | `Open the TikTok` as a tertiary footer text link | It appears once, in the source row at the top | Two affordances for one action on a small screen is backlog §13's recorded "four labels for one action" defect. Top placement sits with its context and is the first thing the eye reaches |
| `ux-architecture` §5.3 | Primary = `Try another TikTok` | Primary = the name search, where it exists; `Try another TikTok` demotes to secondary | §5.3's rule is "forward, not retry". A name field is *more* forward than starting over: it honours the intent the user arrived with instead of discarding it. **[JUDGEMENT]** |
| `execution-plan` L1-F4-T1 exit criterion | *"The word 'error' and the word 'caption' appear nowhere on screen"* | "error" holds. **"caption" is used.** | "Caption" is not implementation vocabulary — it is TikTok's own user-facing word, it is absent from `ux-architecture` §12's banned list, and it already ships on the review screen. Avoiding it forces vaguer copy ("the text", "what it said"), which is less honest and less concrete. **[JUDGEMENT] — flagged for overrule; if it stands, cases A and B need a rewrite and the review screen needs one too** |
| `ux-architecture` §12.4 C70 | One sentence | Split into two; the second is C70's disclosure verbatim | The disclosure is the load-bearing half and reads stronger standing alone |
| Live copy (`import-page-client.tsx:1616`) | `That happens a lot.` | Deleted | Two normalising sentences is one too many, and this is the one that edges toward defending the hit rate, which the owner ruling in `current-state` §0.2.4 forbids |
| `ux-architecture` §8 | Manual add is a route (S8 `/add-place`) reached from failure screens | The search is **embedded on this screen** | A route loses `sourceId`, and the product's "which TikTok made me save this?" question would get "none" for a place the user found in a TikTok. Embedding also makes it zero taps to reach instead of one |
| `ux-import-review-screen.md` | Caption collapsed by default | **Expanded by default here** | On that screen the candidates are the content; here there are none, so the caption *is* the content. §4.2 |
| `ux-architecture` §5.3 / §12.4 C71 | Actions include `Add a place you know` unconditionally | Gated on the capability existing | `import-error-copy.ts`'s existing rule: a recovery only ever points somewhere that works |

---

## 13. Future — outside Charter §4, recorded not proposed

Each of these was considered and is **not** in the spec above.

1. **Keep the link for later.** Backlog §3.7. The `imports` row already records every attempt with its
   source and status; what is missing is a surface (backlog §5.11). "Saved to try again later" is a
   real answer to "the user leaves with nothing", but it needs an import-history surface to be
   truthful, and inventing one here would be scope creep with a data-retention question attached.
2. **Suggest the creator's other posts.** Requires a creator graph. Charter §1 forbids it.
3. **Batch paste / the TikTok data export.** Backlog §14.4 is explicit and correct that landing it
   before this screen has a forward path manufactures ~73 dead ends. This screen is that path;
   sequencing stays with the orchestrator.
4. **Learn from the add.** If a user names a place on a caption we read as empty, that pair is a
   free extraction-quality signal. Recording it is a data-collection decision with a privacy
   dimension, not a UX one.
5. **A Hebrew UI.** §7.2's kicker problem and §7.3's font problem are the two structural blockers;
   both are product-wide, neither belongs to this screen.

---

## 14. Adjacent work this spec touches but does not own

- **Case D copy** (§3.5) — candidates present, none saveable. Currently shares this screen's footer
  and should not. Needs its own small spec.
- **`NO_CAPTION`'s dead copy-map entry** (§10.7).
- **`cityHint` has no column** — persisting it makes case C survive a cache hit. `current-state` §5.6.
- **Manrope has no Hebrew** — backlog §12.8; §7.3 is the strongest argument for scheduling it.
- **The thumbnail hotlinks TikTok's CDN** — backlog §2.19; §4.3 makes this screen indifferent to the
  fix either way.
- **No global `prefers-reduced-motion` rule** — backlog §13.5; §8.4 carries its own until there is
  one.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-30 | Created for L2-NOPLACES-1. Decided: four cases (A no caption / B nothing named / C area only / D routed away) with the B-vs-C distinction surfaced **as behaviour, not as a label** and only for the one drop reason that is reliable and changes what we can offer; the caption **expanded by default** because it is the only content on the screen and the evidence for our own claim; an **embedded** place-name search in the thumb zone as the primary action, never autofocused, **one lookup per submit**, linked to the source TikTok and carrying no caption-derived provenance; two variants so the screen ships today without S8 and gains it as a props change; `Try another TikTok` **clearing the link**, which today it does not; a single `Open the TikTok` affordance in the source row; and a full reduced-motion equivalent including a text pending state. Three product judgements flagged for overrule: the search as primary over `Try another TikTok`, the caption expanded by default, and the use of the word "caption" against `execution-plan` L1-F4-T1's exit criterion |
