# UX Architecture — TikTok → Map

> Status: **v1 proposal, for review by design-system-frontend → nextjs-architect → maps-geospatial →
> security → product → qa, in that order.**
> Binding context: [`00-project-charter.md`](00-project-charter.md) v2 (§4 scope contract, §6 quality
> bar), [`02-risks-and-unknowns.md`](02-risks-and-unknowns.md) v2 (R0 = 19 days),
> [`03-university-requirements.md`](03-university-requirements.md) (M4 requires core UX planning
> before implementation — this file is that artefact).
>
> **Hard rules this document is built on:**
> 1. TikTok is the only V1 source. The flagship path is: paste a URL, get pins.
> 2. **The user is never asked for a caption, a description, a transcript, or any post text.** No
>    failure state, no retry, no "advanced" affordance may ever offer it. If a TikTok cannot be read,
>    we say so and offer three non-text recoveries.
> 3. Nothing reaches the map without an explicit confirmation tap.
> 4. Mobile is the design source of truth. Desktop is an adaptation, specified only where it diverges.
> 5. No implementation vocabulary in any user-facing string. The copy deck (§12) is the enforcement
>    mechanism; strings not in the deck do not ship.
>
> Dependencies not yet resolved that this document is exposed to: **D2** (map/places provider),
> **D3** (import execution model — determines whether §3 can stream real stages), **D4** (confidence
> model — determines the mix of candidate states in §4). Every place where I am guessing is labelled
> `[NEEDS D#]`.

---

## 1. Information architecture

### 1.1 Principle

The map is the application shell, not a page inside it. There is no dashboard, no home feed, no tab
bar of equals. Every other surface is either **a layer over the map** (sheet, panel, modal) or **a
full-screen task that returns to the map** (import review, sign-in).

Consequence for navigation: the app has exactly one persistent destination (`/map`) and one primary
action (add a TikTok). Everything else is reached from those two.

### 1.2 Surface inventory (V1, complete)

| # | Route | Surface | Purpose | Layer | Deep-linkable |
|---|-------|---------|---------|-------|---------------|
| S1 | `/` | Entry | One screen: what this is, one sentence, sign-in CTA. Authenticated visitors are redirected to `/map` server-side. | full | yes |
| S2 | `/signin` | Auth | Supabase Auth. Method set by D8. Single screen, no marketing. | full | yes |
| S3 | `/map` | **Map home** | The product. Full-bleed map + saved pins + collapsed sheet + Add action. This is the root destination and the back-stop of every flow. | shell | yes |
| S4 | `/map` + sheet expanded | **Saved places list** | Capability 11. Text search + category filter over saved places, sorted by distance when location is known, else by recency. *This is not a separate page* — it is the map's bottom sheet at full height (mobile) / the left panel (desktop). | layer over S3 | no (client state) |
| S5 | `/place/[placeId]` | **Place detail** | Capability 12. What the place is + which TikTok(s) made me save it. Renders as a bottom sheet over the map (mobile) / right panel (desktop). Refresh-safe. | layer over S3 | yes |
| S6 | `/import` | **Add a TikTok** | The flagship entry. URL field, acknowledgement, progress. Modal over the map on mobile; centred modal on desktop. | layer over S3 | yes |
| S7 | `/import/[importId]` | **Review & confirm** | The disambiguation surface (§4). Full screen on mobile (it is a task, not a peek); right panel on desktop. Refresh-safe and resumable. | full (mobile) | yes |
| S8 | `/add-place` | **Add a place you know** | Capability 13, secondary. POI search → select → save. Sheet over the map. | layer over S3 | yes |
| S9 | `/account` | Account | Email, sign out, location-permission state and how to change it, delete my data. Deliberately dull. | full | yes |
| S10 | — | **First run** | Not a route: the state of `/map` when the user has zero saved places (§9). | state of S3 | n/a |

Ten surfaces, of which four are the product (S3, S6, S7, S5) and one is the cold-start (S10). Nothing
else is committed. If the schedule slips, S9 collapses to a menu popover and S8 is the first cut
after that — in that order.

**Explicitly not built:** settings pages, onboarding carousel, notifications, activity/history log,
import history list, profile, collections, share. An import that is complete has no artefact of its
own — its output is pins.

### 1.3 Mobile IA (source of truth)

```
┌─────────────────────────────┐  ← status bar / safe-area top
│  ⌕  Search              ⚙  │  floating controls, 44px, translucent scrim
│                             │
│                             │
│         M A P               │  full-bleed, 100dvh, brand surface
│      (pins, clusters)       │
│                             │
│                    ⊕ Near me│  right edge, above sheet, thumb arc
│                             │
├─────────────────────────────┤
│  ──                         │  grab handle
│  12 places saved            │  collapsed sheet peek (~120px)
│  ┌───────────────────────┐  │
│  │  ＋  Add a TikTok      │  │  primary action, 56px, full width
│  └───────────────────────┘  │
└─────────────────────────────┘  ← safe-area bottom inset
```

- No bottom tab bar. The list is the sheet; the map is the background; the primary action lives in
  the thumb zone permanently. This removes a whole navigation concept and a whole class of
  "which tab am I on" state.
- Sheet has three stops: **peek** (~120px + safe area, shows count + Add), **half** (55dvh, list of
  nearest/recent places), **full** (top inset + 8px, list with search field focused-able and
  filters). §6.5 specifies gesture arbitration.
- `Search` (top-left) is a shortcut that opens the sheet to *full* and focuses the search field. It
  is not a separate surface.
- `⚙` opens a 3-item popover: Account, How this works, Sign out. Not a page.

### 1.4 Desktop IA (adaptation)

```
┌──────────────┬────────────────────────────────────────────┐
│ 12 places    │                                            │
│ ⌕ Search     │                                            │
│ [All][Food]  │                M A P                       │
│ ───────────  │           (pins, clusters)                 │
│ • Coffee Bar │                                            │
│ • Sushi Ran  │                                    ⊕ Near me│
│ • ...        │                                            │
│ ───────────  │                                            │
│ ＋ Add TikTok │                                            │
└──────────────┴────────────────────────────────────────────┘
   380px fixed                    remainder
```

Divergences, and only these:
1. The sheet becomes a persistent 380px left panel (list always visible; no peek/half/full states).
2. Place detail (S5) opens as a **right** panel, 400px, so list and detail coexist; the map narrows
   rather than being covered. Camera re-fits the visible map rect, not the window.
3. Import (S6) and review (S7) are a single centred modal, 520px wide, with the map dimmed behind at
   40% — the pins-entering moment (§10.4) is visible through the dim as the modal dismisses.
4. Hover states exist (marker hover = label tooltip). They exist nowhere on mobile and no behaviour
   may depend on them.

Above 1600px the map does **not** get a max-width container. The map fills. Card-in-a-container
layouts are the banned aesthetic.

### 1.5 Route-to-state mapping `[NEEDS nextjs-architect]`

- S5, S6, S7, S8 are real routes so that refresh, back, and a shared link all behave. On mobile they
  render as sheets over a persistent map; this requires the map to survive navigation between these
  routes without remounting (a remount = camera reset = the worst bug in this product). Proposed
  mechanism: a single `app/(map)/layout.tsx` owning the map instance, with S5/S6/S7/S8 as child
  routes rendered into a sheet slot. Confirm this is achievable with the App Router without
  intercepting-routes complexity we cannot afford.
- Sheet stop (peek/half/full) is client state only, never a URL. It must not create history entries.
- Back from S5 → S3 restores the previous camera and the previous sheet stop.

---

## 2. The flagship flow, state by state

Ten states. Every state below defines: **See · Do · Copy · Expected duration · Overrun behaviour.**

State ids are used by the copy deck (§12) and by QA.

### F0 — Entry to the import

**See:** `/map` (or first-run S10). Tap `＋ Add a TikTok`. Sheet rises to a 320px modal containing a
single field. Field autofocuses; keyboard opens; `inputMode="url"`, `enterKeyHint="go"`,
`autocapitalize=off`, `autocorrect=off`, `spellcheck=false`.
**Do:** paste; or tap `Paste` (clipboard read behind this gesture — permitted, one tap, and it is the
only reason the button exists); or dismiss.
**Copy:** Title `Add a TikTok`. Placeholder `Paste a TikTok link`. Helper, one line, below field:
`Copy the link in TikTok — Share → Copy link.` Button `Paste`.
**Duration:** user-paced.
**Overrun:** none. If the field is empty and untouched for 12s, the helper line swaps to the same
sentence with a small inline illustration of TikTok's Share → Copy link. No nagging, no modal.

```
┌─────────────────────────────┐
│  Add a TikTok           ✕   │
│                             │
│  ┌───────────────────┐┌───┐ │
│  │ Paste a TikTok li…││Pas│ │  ← 48px field, 44px Paste
│  └───────────────────┘└───┘ │
│  Copy the link in TikTok —  │
│  Share → Copy link.         │
└─────────────────────────────┘
```

### F1 — Validating (client, sub-frame)

**See:** as text is entered, a URL that we recognise causes the field's trailing slot to become a
small TikTok mark and the submit button to become enabled. Nothing else moves.
**Do:** submit (Enter / `Add`).
**Copy:** button `Add`. On unrecognised text: `That doesn't look like a TikTok link.` inline, below,
non-blocking, appears only on blur or submit — **never while typing**.
**Duration:** <16ms, local regex/URL parse.
**Overrun:** n/a.

Rules: we accept `tiktok.com/@user/video/…`, `vm.tiktok.com/…`, `vt.tiktok.com/…`, `m.tiktok.com/…`,
with any query junk, and full text pastes that *contain* one of those (TikTok's share text includes
prose — we extract the URL silently and never mention that we did). Rejecting a paste because it had
extra words around the link would be a self-inflicted wound.

### F2 — Accepted (the instant acknowledgement)

This state exists because the work is not instant and the acknowledgement must be. It is entered
**before any server response**, on submit, unconditionally.

**See:** the input field morphs upward into a **source card** — TikTok mark, the URL's shortened
form (`tiktok.com/@handle`), and a live stage rail beneath it (§3). The keyboard dismisses. The
modal grows to its progress height (~380px). The Add button is gone; a `Cancel` text button appears.
**Do:** cancel. Nothing else. There is no "add another while this runs" in V1.
**Copy:** the first rail line is already active: `Reading the TikTok…`
**Duration:** the transition is 220ms; the state itself lasts until F3 events arrive.
**Overrun:** if no server acknowledgement (HTTP response or first stage event) within **2.5s**, the
rail stays on stage 1 and the reassurance line appears (§3.3). We do not surface a network error
until 20s (§3.4).

Non-negotiable: F2 paints from client state. It must never wait on a round trip. If D3 lands on a
synchronous request/response model, F2 still renders immediately and the response resolves F3–F5 in
one go — in which case the rail replays honestly but fast (§3.2 minimum-dwell rule).

### F3 — Reading the TikTok

**See:** rail stage 1 active with looping indicator; stages 2 and 3 present but dim (the user can see
how many steps there are — this is what makes 12s tolerable).
**Copy:** `Reading the TikTok…` → on completion the line settles to `Read the TikTok` with the
creator handle appended if we have it: `Read @handle's TikTok`.
**Duration:** unknown; assume 0.8–4s `[NEEDS D3 measurement]`.
**Overrun:** at 4s in this stage, reassurance line `Still reading — this one's taking a moment.` At
20s total, F9 (failure).

### F4 — Finding the places

**See:** stage 1 settled with a tick; stage 2 active.
**Copy:** `Finding the places…` → settles to `3 places found` / `1 place found`. If zero: the rail
does not lie about success — stage 2 settles to `No places named` and we go straight to F10.
**Duration:** assume 1–5s `[NEEDS D3]`.
**Overrun:** at 5s, reassurance `Almost there.` No second reassurance; repeated reassurance reads as
panic.

### F5 — Matching locations

**See:** stage 3 active. This stage may carry a count-in-progress if resolution is per-candidate and
we can stream it: `Matching locations… 2 of 3`. If we cannot stream per-candidate progress, the plain
label is used. Counting up from a known denominator is the only place a number is allowed, because it
is real.
**Copy:** `Matching locations…` → settles to `Ready to check` (not "Done", not "Complete").
**Duration:** assume 0.5–4s, scales with N `[NEEDS D3]`.
**Overrun:** at 6s, reassurance `Checking a few possibilities.`

### F6 — Handoff to review

**See:** the modal does not become the review screen in place — that would make review feel like a
step 4 of a wizard the user is trapped in. Instead: the source card slides to the top and *becomes
the review header*; the rail collapses into the found-count line; the candidate rows animate in
(§10.3). On mobile the surface expands to full screen and the route becomes `/import/[importId]`.
**Do:** review (§4).
**Copy:** header `3 places found` + subline `From @handle's TikTok`.
**Duration:** 320ms transition.
**Overrun:** n/a.

### F7 — Confirmation

**See:** §4.
**Do:** confirm selection.
**Copy:** primary button, live count: `Save 3 places` / `Save 1 place` / disabled state `Select a place to save`.
**Duration:** user-paced. This is the one place in the flow where we want the user to slow down.
**Overrun:** none. If the surface is abandoned, the import remains resumable (§4.7) — but nothing is
saved.

### F8 — Pins land

**See:** the review surface dismisses downward; the map is revealed already animating its camera to
fit the new pins; pins drop in staggered; a compact toast confirms. §10.4 owns the choreography.
**Copy:** toast `3 places added to your map.` Action inside toast: `View list`. Toast lives 4s.
**Duration:** 1.3s total choreography, then the map is fully interactive. Interaction is not blocked
during the choreography — a user gesture cancels the camera animation immediately and the pins snap
in. Never trap a user inside an animation.
**Overrun:** if the write fails after confirmation, the pins do not appear and we show the failed
save state: `Couldn't save those places. Try again.` with `Try again` — the selection is preserved
client-side so the retry is one tap, not a re-review.

### F9 — Couldn't read this TikTok

§5.1.

### F10 — Read, but no places named

§5.3.

### Flow summary

```
F0 paste ──F1 valid──▶ F2 accepted (instant, 220ms)
                          │
                          ├─▶ F3 reading ──▶ F4 finding ──▶ F5 matching
                          │        │             │              │
                          │        └─fail────────┴──────────────┴──▶ F9 couldn't read
                          │                      └─0 places──────────▶ F10 no places named
                          │
                          └──▶ F6 handoff ──▶ F7 review/confirm ──▶ F8 pins land ──▶ /map
                                                    │
                                                    └─partial────────▶ §5.2 shown inline in F7
```

---

## 3. Progress design under uncertainty

The requirement: read as premium at 1.5s **and** at 12s, and never lie about the current stage.
Duration is unknown and being measured. So the design cannot be calibrated to a duration — it must be
**duration-agnostic by construction**.

### 3.1 The decision: a three-stage rail, driven by real events, with no percentage

```
┌─────────────────────────────┐
│  ⬛ tiktok.com/@handle       │  source card
│                             │
│  ✓  Read @handle's TikTok   │  settled: tick + fact
│  ◍  Finding the places…     │  active: looping indicator
│  ·  Matching locations      │  pending: dim, no indicator
│                             │
│  Still reading — this one's │  reassurance (conditional)
│  taking a moment.           │
│                    Cancel   │
└─────────────────────────────┘
```

Rules that make it work at both ends of the range:

1. **No percentage, no filling bar, no time estimate.** A determinate bar is a promise we cannot
   keep; a filling bar that stalls at 80% is the single most common way apps feel cheap. The active
   stage indicator is a **loop with no endpoint semantics** — a 1400ms breathing arc, not a track
   filling left to right.
2. **All three stages are visible from the first frame.** Structure visible = bounded wait. This is
   what buys us tolerance at 12s. The user knows there are three things, not an unknown number.
3. **A stage only settles when the server says so, and it settles into a *fact*, not a status** —
   `3 places found`, not `Step 2 complete`. Facts accumulate; by the end the panel is a short honest
   receipt of what happened. This is also the honesty mechanism: the rail cannot show progress it
   does not have.
4. **Minimum dwell 450ms per stage, floor ~1.0s total.** If the whole pipeline returns in 600ms, we
   still play the three stages at 450ms each. Rationale: a flash of three states in 200ms reads as a
   glitch, and the acknowledgement is the moment the product earns trust. This is a perceived-quality
   floor, not a fake delay: the work genuinely happened, we are only pacing its presentation. Cap:
   never delay the *result* by more than 900ms total.
5. **Never regress.** A settled stage never un-settles. If the server retries internally, the rail
   does not show it.

At 1.5s this plays as a confident three-beat cascade. At 12s it is a legible checklist with two
completed facts and one honest "still working" — which is the same design, not a different one.

### 3.2 If we cannot stream stage events `[NEEDS D3 — blocking for this section]`

I need one of these from the architect, in preference order:

- **(a) Streamed stage events** — SSE, a streamed server-action/route response, or a status row polled
  every 600ms. Enables the rail exactly as specified. Cheapest acceptable version: a `imports` row
  with a `stage` column and a 600ms poll. I would spend budget here; it is the difference between
  premium and generic.
- **(b) Single request/response, no intermediate visibility** — then the rail is **not** simulated.
  It degrades to **one** honest stage: `Finding the places in this TikTok…` with the same looping
  indicator and the same elapsed-aware reassurance ladder, and the facts appear all at once on
  completion. Fewer, truer states.

**I will not accept a third option where stages advance on a client-side timer.** That is lying about
what stage we are in, and it breaks immediately in the 12s case (the rail finishes while the server is
still working, which is worse than no rail at all).

### 3.3 Reassurance ladder (elapsed-aware, honest, non-repeating)

| Elapsed in current stage | Behaviour |
|---|---|
| 0–4s | Rail only. No extra copy. |
| 4s | One reassurance line fades in under the rail, specific to the stage (§12). |
| 8s | `Cancel` button gains a visible border (was text-only). We make leaving easier, we do not push. |
| 12s | Reassurance line swaps once: `Still going. You can leave this open.` |
| 20s | Hard stop → F9 failure state, with the failure attributed honestly (§5.1). |

Slow networks: the rail is unaffected because it does not depend on payload size. If the *client* is
offline at submit, we never enter F2 — we show inline `You're offline. Check your connection and try
again.` and keep the pasted URL in the field. If connectivity drops mid-import with mechanism (a), the
poll/stream failure is treated as "unknown, still possible": rail freezes on its last true state,
reassurance becomes `Lost connection — waiting.`, and reconnection resumes from the server's true state.
On reconnect after completion, we land the user directly in F7 review.

### 3.4 Timeout

20s client-side hard stop. It is a **client presentation timeout, not a cancellation** — the server
job (if async) may still complete. So F9's copy after a timeout is a distinct variant:
`This is taking longer than usual.` with `Keep waiting` · `Start over` · `Add a place you already
know`. `Keep waiting` returns to the rail with the reassurance ladder reset once, and a second
timeout at 40s is final.

`[NEEDS nextjs-architect]` — is 20s inside or outside the Vercel function limit on our plan? If the
platform kills the request at 10s or 15s, the client timeout must be *below* the platform's, and
mechanism (a) becomes mandatory rather than preferred.

---

## 4. Review and disambiguation (S7) — the hardest surface

Design target: **a confident user with one thumb saves 3 places in under 4 seconds and one tap.** An
uncertain user resolves an ambiguity in two taps. Nobody types unless a place could not be matched at
all.

### 4.1 Anatomy

```
┌─────────────────────────────┐
│ ‹   3 places found          │  header; ‹ = leave without saving
│     From @handle's TikTok ▸ │  ▸ opens the TikTok (external)
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ ☑  Coffee Bar Kikar     │ │  CONFIDENT — preselected
│ │    Café · Tel Aviv      │ │
│ │                Not this ›│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ☐  Sushi Ran            │ │  AMBIGUOUS — not preselected
│ │    Which one?           │ │
│ │    ⟨ Dizengoff 99 ⟩     │ │  branch options, stacked rows
│ │    ⟨ Ibn Gabirol 30 ⟩   │ │  (not a horizontal carousel)
│ │              Search  ›  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ☐  "the beach place"    │ │  UNRESOLVED
│ │    We couldn't match    │ │
│ │    this one.            │ │
│ │  ┌───────────────────┐  │ │
│ │  │ Search for it     │  │ │  44px, primary-on-row
│ │  └───────────────────┘  │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │     Save 1 place        │ │  sticky, 56px, live count
│ └─────────────────────────┘ │
│  Nothing is saved yet.      │  one-line reassurance, 12px
│                             │
└─────────────────────────────┘
      ↑ safe-area inset bottom
```

Three candidate states, visually distinguished by **structure, not colour**: confident rows are
compact and checked; ambiguous rows are taller and contain a choice; unresolved rows contain an
action. A colour-blind user, or a user in sunlight, still sees three different shapes.
`[NEEDS D4]` — the confident/ambiguous/unresolved thresholds and whether "ambiguous" can carry more
than 3 branches.

### 4.2 The four interactions

**Confirm all (the 90% path).** Confident candidates arrive preselected. The primary button already
reads `Save 3 places`. One tap. Done. Ambiguous and unresolved candidates arrive **unselected** —
they cannot be swept in accidentally, and the count in the button is always the truth.

**Reject one.** Tap anywhere on the row (the whole row is the checkbox target, min 64px tall) to
deselect. Deselected rows dim to 55% and lose their check; they stay in place — they do not animate
away, because a row that disappears cannot be undone by a user who mis-tapped. Button count
decrements with a 160ms number transition. No confirmation dialog, ever.

**Correct one.** Two entry points, same destination:
- Ambiguous row: tap a branch → the row collapses to the confident form with the chosen branch's
  name and address, and becomes checked. Two taps total (choose, then Save). Choosing a branch is
  also the selection — we do not require a separate check.
- Confident row that is wrong: `Not this ›` (a 44px text target on the row's trailing edge) →
  reveals up to 2 alternates inline if resolution produced any, plus `Search for it`. If there are no
  alternates, `Not this ›` goes straight to search. Never a dead end.

**Search manually.** One tap from any row opens the **place search sheet**: a full-height sheet,
search field prefilled with the name as the TikTok wrote it (that string is the most valuable hint we
have and the user should see we kept it), results as a plain list of `Name · category · address`,
biased toward the city hint if we have one and toward map centre otherwise. Tap a result → sheet
dismisses → the row becomes confident, checked, and briefly highlights (§10.3) so the user sees where
their choice landed. Sheet has one escape: `Cancel` restores the row untouched. This is the same
component as S8 manual add — build it once. `[NEEDS maps-geospatial]` — is a typeahead/autocomplete
endpoint available under D2's licensing, and is it billed per keystroke session or per request? If
per-keystroke cost is a problem, the field submits on Enter/`Search` instead of typing-ahead, which I
can live with.

### 4.3 Why this is not data entry

- Zero required typing on the happy path and on the ambiguous path.
- The only free-text input in the entire flagship flow is the URL field and the optional manual
  search.
- Every row shows the *place*, not the extraction. No confidence percentages, no scores, no "match
  quality 0.82". If we are unsure we say `Which one?`; if we failed we say `We couldn't match this
  one.`
- No form chrome: no labels above fields, no fieldsets, no "step 2 of 3".

### 4.4 N = 1

The surface does not change shape (consistency beats bespoke), but the header reads `1 place found`
and, if it is confident, the primary button is `Save this place` and the row is expanded to show
address and category. One candidate is the most common case for a single-recommendation TikTok and it
should feel like a *result*, not a list of one.

### 4.5 N ≈ 7 (the upper bound)

The list scrolls; the primary button is sticky above the safe-area inset and never scrolls away. A
`Select all` / `Deselect all` text control appears in the header **only when N ≥ 4**. Scroll position
is preserved when returning from the search sheet. Rows are virtualised only if measurement demands
it (it will not at N ≤ 7 — do not build virtualisation).

### 4.6 Partial resolution inside review

If some candidates resolved and some did not, that is not an error banner — it is exactly the row
states above, and the header still reads `3 places found`. The honest accounting appears in the
sticky footer as a second line when at least one row is unresolved: `1 place needs your help.`
See §5.2 for the case where the *pipeline* partially failed rather than the resolution.

### 4.7 Abandonment and resumption

Leaving the review (back, `‹`, app switch, refresh) saves nothing and shows no dialog. On return to
`/map`, the peek sheet shows a single quiet resume row above the Add button:
`3 places waiting from @handle · Review` — one line, dismissible, expires after 24h. This is the only
"pending work" concept in the product; there is no import history. `[NEEDS nextjs-architect]` — this
requires the import + candidates to be persisted server-side pre-confirmation. If that costs a table
and a cleanup job we do not have time for, the fallback is: resumption is client-only
(sessionStorage), and the row does not survive a cold start. Acceptable degradation.

---

## 5. Failure states

Three distinct failures, three distinct designs. They must not share a template, because they are not
the same news.

### 5.1 Could not read the TikTok (F9)

The premise failed. This is the one that must feel designed rather than apologetic.

```
┌─────────────────────────────┐
│  ⬛ tiktok.com/@handle       │  source card stays — we keep
│                             │  the user's context
│  We couldn't read this      │  24px, tight leading
│  TikTok yet.                │
│                             │
│  Some TikToks don't share   │  one sentence, no blame,
│  enough for us to work      │  no jargon, no apology loop
│  with. It's worth a retry.  │
│                             │
│  ┌───────────────────────┐  │
│  │        Retry          │  │  56px primary
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Open the TikTok       │  │  44px secondary
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Add a place you know  │  │  44px secondary
│  └───────────────────────┘  │
└─────────────────────────────┘
```

- The word **"yet"** carries real weight: it says the fault is transient and ours, not the user's.
- `Retry` re-runs the same URL; on a second identical failure the primary and the first secondary
  swap places (Retry demotes to a text link) so we stop pushing an action that is not working. A
  third retry is allowed but not encouraged. `[NEEDS security/devops]` — retry counts against the
  per-user rate limit; if the limit is hit the copy becomes `You've tried this a few times. Give it a
  few minutes.` — never a raw rate-limit message.
- `Open the TikTok` opens the original in the TikTok app/site. Purpose: the user still gets their
  content back. This is the honesty move — we failed, here is your thing.
- `Add a place you know` routes to S8 with a light framing line: `Know where this one is? Add it by
  name.` This converts a failed import into a saved place, which protects the cold-start problem
  (R5) precisely when it is most at risk.
- **Nowhere on this screen, or behind any disclosure on it, is there a field for post text.** No
  "advanced", no "help us out", no "paste the caption instead". If this screen ever grows a textarea,
  the product has failed its own premise.
- The timeout variant (§3.4) uses a different headline and a different action set.

### 5.2 Partial success — 2 of 3 places resolved

This is a **success** with an asterisk, and it is presented as a success. It never uses the word
"error", never uses a warning colour, and never blocks saving the two that worked.

Presentation: the normal review surface (§4), header `3 places found`, two confident rows, one
unresolved row with `Search for it`. The footer's second line reads `1 place needs your help.` The
primary button reads `Save 2 places` and is fully enabled — **the user can save the good ones and
walk away**, and if they do, the unresolved one is simply not saved and is not nagged about. No "you
have unfinished items" dialog on exit.

If the *pipeline* partially failed (e.g. we read the TikTok and found three names but the matching
step died on one), the row copy is `We couldn't match this one.` — indistinguishable from a
low-confidence miss, because the distinction is our problem, not the user's.

### 5.3 Read successfully, no places named (F10)

Different news: nothing is broken; this TikTok just is not about a place. Blaming ourselves here
would be dishonest and would make the user retry pointlessly.

```
┌─────────────────────────────┐
│  ⬛ tiktok.com/@handle       │
│                             │
│  No places in this one.     │
│                             │
│  We read it, but it doesn't  │
│  name a place we can put on │
│  a map. Some TikToks only   │
│  show the place on screen.  │
│                             │
│  ┌───────────────────────┐  │
│  │ Try another TikTok    │  │  primary — keeps momentum
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Add a place you know  │  │
│  └───────────────────────┘  │
│  Open the TikTok            │  text link, tertiary
└─────────────────────────────┘
```

- Primary action is **forward**, not retry — retrying the same URL will produce the same answer and
  offering it would be a lie about our capability.
- The third sentence quietly teaches the capability boundary ("only show the place on screen")
  without jargon. This is the honest expression of the LEVEL A/B/C boundary from D1, translated to
  human. If D1 lands on LEVEL B, this sentence becomes the product's main capability disclosure and
  should also appear once in first-run (§9).
- No `Retry`. `Try another TikTok` returns to F0 with an empty field, focused.

### 5.4 Other failures, specified briefly

| Failure | Treatment |
|---|---|
| Offline at submit | Inline under field, keep the URL, no state change: `You're offline. Check your connection and try again.` |
| Not a TikTok link | Inline on blur/submit (§F1). Never a modal. |
| Private / removed video | Own copy: `This TikTok isn't public, so we can't read it.` Actions: `Open the TikTok` · `Add a place you know`. No Retry — retry cannot help. `[NEEDS social-integration]` — can we distinguish this case from a generic read failure? If not, it collapses into 5.1 and this row is deleted. |
| Save failed after confirm | §F8 overrun. Selection preserved, one-tap retry. |
| Rate limit hit | `You've added a lot of TikToks in the last few minutes. Try again shortly.` No numbers, no "429". |
| Signed out mid-flow | Preserve the URL/selection through the auth round trip and return to the exact state. If that is expensive, at minimum preserve the URL. |
| Location unavailable/timeout | §6.7 fallback. Never an error dialog. |
| Map tiles fail to load | Map surface renders the brand background colour with pins still positioned; a small text pill: `Map is having trouble loading.` Pins and the list must not depend on tiles. `[NEEDS maps-geospatial]` — is this achievable with the D2 renderer, or does a tile failure blank the canvas? |

---

## 6. Map experience

### 6.1 Marker language

One pin shape for every saved place. Category is expressed by a **small monochrome glyph inside the
pin**, not by pin colour. Rationale: a multicoloured pin palette is the fastest route to the "card
soup" aesthetic at map scale, it collapses under clustering, and it fails accessibility as a sole
information channel. Colour is reserved for **state**: saved (default surface), selected (accent),
and — only during the import moment — newly added (accent, decaying to default after 4s).

Three sizes only: cluster, pin, selected pin. No hover-grow on mobile (there is no hover).

Category glyph set for V1, deliberately small: eat · drink · sleep · see · shop · other. Six. If the
places provider returns 200 categories we map them down to six; the user never sees provider
taxonomy. `[NEEDS maps-geospatial]` — provide the provider→six mapping table; if a category is
unknown, it is `other`, and `other` must look intentional, not broken.

### 6.2 Selected marker

Tap a pin → pin scales to 1.25 with a thin accent ring, gains elevation; **all other pins drop to
40% opacity** (this, not the pin's own change, is what makes the selection legible on a busy map);
the sheet rises to half height with the place detail (S5). The camera pans only if the pin would be
covered by the sheet — it offsets by the minimum needed, never a full re-centre, and never zooms.
Camera moves that were not asked for are the main reason map UIs feel out of control.

Deselect: tap the map background, drag the sheet down, or back. Camera does not move on deselect.

### 6.3 Clustering

Cluster when pins would overlap, not at a fixed count. Cluster marker: a filled disc with the count,
one accent, three size tiers (2–9, 10–49, 50+). Tap a cluster → camera fits the cluster's bounds
with padding that accounts for the sheet, easing per §10.4; if the cluster cannot be split further
(identical coordinates), expand into a small stacked list in the sheet instead of zooming forever.

`[NEEDS maps-geospatial]` — clustering implementation and its frame cost at ~300 markers on a
mid-range Android (A6). If native clustering in the chosen renderer is cheap, use it; do not build a
custom clusterer for V1.

### 6.4 Camera choreography after an import (the signature moment)

Sequence, owned by §10.4:
1. Review surface begins dismissing (240ms) — the map is already visible beneath.
2. Camera animates to fit the new pins' bounds, with padding = sheet peek height + safe area, at a
   zoom capped so a single new pin does not slam to street level (max zoom ~15). 700ms.
3. New pins drop in, staggered 70ms, in **geographic order from the camera's centre outward** (not
   list order) — the stagger then reads as spatial, which is the whole point.
4. Toast: `3 places added to your map.`
5. Accent decays to default over 4s.

Special case, and it matters: if the new pins are far from the current viewport (e.g. the user is in
Tel Aviv, the TikTok is Tokyo), do **not** fly across the globe — a 3-second swoop across an ocean
looks impressive once and is annoying forever, and it also destroys the user's sense of place.
Instead: cross-fade the camera (fade out 180ms → jump → fade in 220ms) and the toast becomes
`3 places added in Tokyo.` `[NEEDS maps-geospatial]` — threshold for "far" (proposal: destination
bounds not intersecting current viewport, or > ~500km centre-to-centre) and whether the renderer can
do a clean fade-jump-fade without a white flash.

### 6.5 Bottom sheet vs detail panel, and gesture arbitration

Mobile sheet (S4/S5) rules — this is the highest-risk interaction in the product (A6):

- The sheet is dragged **only** by (a) the grab handle + header strip (56px tall target), and (b) the
  content area when it is scrolled to the top and the drag is downward. Anywhere else, vertical drag
  scrolls the content.
- The map handles gestures only in the region not covered by the sheet. A drag starting on the sheet
  never pans the map; a drag starting on the map never moves the sheet. No shared hit areas.
- At `peek`, the map is fully interactive and the sheet is 120px + inset. At `half`, the map is
  interactive in the visible region. At `full`, the map is not interactive (it is not visible enough
  to be) and a tap on the small remaining map strip collapses the sheet to peek rather than
  interacting with the map.
- Snap points only, no free positioning. Velocity-based snapping: a fast flick skips a stop.
- The sheet respects `visualViewport`: when the keyboard opens (search field at `full`), the sheet
  height is bound to the visual viewport, not `100vh`, so the field is never behind the keyboard.
- Height uses `dvh`, with the peek and the primary button positioned against
  `env(safe-area-inset-bottom)`. iOS toolbar collapse must not move the primary action.

`[NEEDS design-system-frontend]` — implementation choice for the sheet. Strong preference for a
maintained primitive (Vaul, or Radix Dialog + a small drag layer) over a bespoke gesture
implementation; I do not think we can afford to write and debug an original sheet in 19 days, and a
janky sheet destroys the premium claim faster than any other single defect.

Desktop: no sheet, no gestures, no drag. Left list panel and right detail panel are static; the map
region is the only gesture surface. This is why the desktop adaptation is cheap and why it must not
drive the design.

### 6.6 "What have I saved around here?"

Expressed as **two** interactions, not a search box:

1. **`Near me`** — a pill on the map's right edge, above the sheet, in the thumb arc. Tap → (permission
   flow §6.7) → camera to the user's position at neighbourhood zoom → sheet rises to `half` with the
   list re-sorted by distance and each row showing `320 m`. The heading in the sheet becomes
   `Near you`.
2. **`Search this area`** — appears as a pill at the top of the map **only after the user has panned
   the camera** away from its previous position by more than ~40% of the viewport. Tap → the sheet
   list filters to the current viewport bounds and the heading becomes `In this area`. This works
   with **no permission at all**, which is why it exists: the "what did I save here" question is
   answerable to a user who denied location, and to a user planning a trip to a city they are not in.

Both are viewport/geography-driven; neither requires typing. The text search in the sheet exists for
capability 11 but is not the primary retrieval path — geography is.

### 6.7 Location permission

**Never on first load. Never on sign-in. Never on the map's first render.** The ask happens at
exactly one place: the first tap of `Near me`.

Why there: the user has just expressed the intent that the permission serves, so the ask has an
obvious payoff and a one-sentence justification. Asking earlier trains a refusal we can never undo
(browser permission denials are effectively permanent from our side).

Pre-prompt (ours, before the browser's):

```
┌─────────────────────────────┐
│  Show what's near you       │
│                             │
│  We'll use your location to │
│  sort your places by        │
│  distance. It stays on your │
│  device — we never save it. │
│                             │
│  ┌───────────────────────┐  │
│  │  Use my location      │  │  → triggers browser prompt
│  └───────────────────────┘  │
│         Not now             │
└─────────────────────────────┘
```

The middle sentence is a factual claim about our implementation (R9: live position never persisted
server-side). `[NEEDS security]` — confirm the claim is exactly true, including logs and analytics,
before this copy ships. If it is not true, the copy changes; the copy does not get vaguer.

- `Not now` dismisses; the pre-prompt returns at most once more, on a later session.
- **Denied**: the `Near me` pill is replaced permanently by `Search this area` (§6.6.2) — the user
  loses distance sorting and nothing else. One-time inline note in the sheet header:
  `Location is off, so we're showing this area instead.` with a `How to turn it on` link to S9. No
  repeated prompts, no nag banner, no dead button that re-triggers a blocked prompt.
- **Unavailable / times out (>8s)**: silently fall back to `Search this area` behaviour with a small
  pill `Couldn't find your location.` Never a modal.
- **Coarse / indoors**: if accuracy is worse than ~1km we still use it but do not draw a false
  precision dot — the accuracy circle is rendered honestly.

---

## 7. Place detail (S5)

```
┌─────────────────────────────┐   mobile: sheet at half, expandable to full
│  ──                         │
│  Coffee Bar Kikar           │  22px
│  Café · Rothschild 12,      │  15px, secondary
│  Tel Aviv                   │
│  320 m away                 │  only if location known
│                             │
│  ┌────┐ Saved from          │  ← the answer to "which TikTok?"
│  │ ▶  │ @handle             │     thumbnail 64px if available
│  │thmb│ Added 3 Aug         │
│  └────┘        Open TikTok ›│
│                             │
│  ┌─────────┐ ┌───────────┐  │
│  │Directions│ │  Remove   │  │  44px each
│  └─────────┘ └───────────┘  │
└─────────────────────────────┘
```

**Contents, in priority order:** name · category + address · distance (conditional) · the source
block · directions · remove. That is all. No notes, no ratings, no photos gallery, no opening hours
in V1 unless the provider gives them for free in the payload we already fetch `[NEEDS
maps-geospatial]` — and if it does, hours go *below* the source block, because the source block is
the product's differentiator and must never be pushed below the fold.

**The source block is mandatory and never empty.** It is the charter's invariant 3 made visible. It
carries: creator handle, date saved, a thumbnail if the source mechanism gives us one, and
`Open TikTok ›`. If we have no thumbnail, the slot becomes a TikTok mark on a flat surface — the slot
never collapses, because its presence is the promise.

**Multiple sources** (charter invariant 4 — one place, many sources): the block becomes
`Saved from 2 TikToks` with two stacked rows, newest first. This is the most satisfying state in the
product and should look deliberate, not like a repeated list.

**Return to the map without losing context:** drag down, tap the map, or back → sheet returns to its
*previous* stop (peek or half), the pin deselects, other pins return to full opacity, and **the
camera does not move**. The camera is only ever moved by: Near me, Search this area, cluster tap,
import choreography. Nothing else. That rule is what makes the map feel like a place rather than a
slideshow.

**Remove**: single confirm inline on the row (`Remove` → `Remove from map?` with `Remove`/`Cancel`
replacing the row's content for 4s), then the pin fades out over 240ms and a toast offers `Undo` for
5s. Undo is cheaper than a dialog and kinder than either. `[NEEDS nextjs-architect]` — soft delete or
hard delete with client-held undo buffer; I prefer the latter (no schema cost).

---

## 8. Manual place addition (S8)

Secondary by construction. Its IA position enforces this: it is **not** on the map's primary surface.
It is reachable from exactly three places, all of them contextual:

1. The failure states (§5.1, §5.3) — `Add a place you know`.
2. The sheet's overflow: the `⚙` popover has no entry for it; instead the sheet at `full` has a
   single text row at the very bottom of the list: `Add a place by name`.
3. First run (§9), as the third option, visually subordinate.

There is **no floating "+" that adds a place**. The floating primary action is always `Add a TikTok`.
A user who never opens a failure state may never discover manual add, and that is the correct
outcome for this product's positioning.

Flow, three states, reusing the §4.2 search sheet component:

| State | See / Do / Copy |
|---|---|
| A | Search sheet, field focused. Placeholder `Search for a place`. Results biased to map centre (and to user location if already granted — this flow never asks for permission). |
| B | Tap a result → the sheet collapses to a confirm card: name, category, address, `Add to my map` (56px) and `Cancel`. One extra tap on purpose: it keeps invariant 2 (nothing saved without confirmation) uniform across both paths. |
| C | Saved → sheet dismisses, single pin drops with the §10.4 choreography (one pin, so no stagger), toast `Added to your map.` |

Empty results: `No places found for "xyz".` + `Try a different name.` No suggestions engine.

Manually added places have **no source block**. Their detail sheet shows `Added by you · 3 Aug` in the
source slot — same slot, same weight, honest content. This keeps the "which TikTok made me save
this?" question answerable with a real answer ("none — you did") rather than an absence.

---

## 9. Empty and first-run states

The cold-start problem (R5) is a design problem, not a copy problem: **the first session must end
with pins on the map.**

### 9.1 Never a bare empty map

At zero saved places, `/map` renders the brand map style, camera at a wide-but-not-global view of the
user's approximate region if we can infer it cheaply from locale/timezone (no permission, no IP
geolocation call) `[NEEDS nextjs-architect — is timezone→region a free inference we already have?]`,
else a fixed pleasant default. The map is real, styled, and slightly dimmed, with the first-run card
in the thumb zone:

```
┌─────────────────────────────┐
│                             │
│      (styled map, dimmed)   │
│                             │
├─────────────────────────────┤
│  Your map starts here.      │  24px
│  Paste a TikTok you saved   │  15px
│  and we'll put its places   │
│  on the map.                │
│                             │
│  ┌───────────────────┐┌───┐ │
│  │ Paste a TikTok li…││Pas│ │  ← the URL field IS the
│  └───────────────────┘└───┘ │     first-run screen.
│                             │     No carousel, no tour.
│  Try an example             │  text link
│  Add a place by name        │  text link, subordinate
└─────────────────────────────┘
```

Design decisions here that matter:
- The first-run screen **is** the import field. Not a welcome screen that leads to the import field.
  Zero taps between arrival and the primary action.
- `Try an example` runs a known-good TikTok URL from the evaluation set through the real pipeline.
  It is not a canned animation and not seeded fake data — it is the real product, and it guarantees
  the user sees the magic moment even if their own first URL fails. This is my highest-value
  onboarding lever and it costs almost nothing to build. `[NEEDS product + social-integration]` —
  nominate 1 example URL that is stable, public, multi-place, and non-embarrassing. If the pipeline
  is non-deterministic enough that the example can fail, this link must be cut rather than shipped
  flaky.
- No progress meters, no "3 of 5 steps to get started", no gamified counters (charter §4 bans
  gamification and it would cheapen this).

### 9.2 After the first import

The map has 1–3 pins. Two things happen, once, ever:
1. A single coach line in the sheet peek, dismissible, no overlay, no spotlight:
   `Tap a pin to see the TikTok it came from.`
2. The peek's primary action stays `Add a TikTok`, and the count line reads `3 places saved` — which
   is itself the motivation. We do not tell the user to add more; we show them how little they have
   and how easy adding is.

### 9.3 Other empty states

| Surface | Empty state |
|---|---|
| Sheet list, zero places | Not reachable — first-run owns this. |
| Search in sheet, no matches | `Nothing matches "xyz".` + `Clear search` |
| Category filter, no matches | `No places in this category yet.` (filter chip stays visible so the cause is obvious) |
| `Search this area`, nothing in viewport | `Nothing saved in this area.` + `Show all places` (zooms to fit all pins) |
| `Near me`, nothing within 50km | `Nothing saved near you yet.` + `Add a TikTok` |

Every empty state names the cause and offers exactly one way out. None of them uses an illustration
of an empty box.

---

## 10. Signature motion — intent and timing

Global character: **motion originates from the object that caused it** and communicates either
progress, origin, or spatial relationship. Nothing decorative. No parallax, no glow, no
scale-on-scroll, no looping ambient animation anywhere except the active progress indicator.

Easing character (names, not curves — design-system owns the tokens):
`entrance` = fast-out/slow-in, decisive; `exit` = slow-out/fast-in, quicker than entrance;
`spatial` = symmetric ease-in-out for camera and sheet; `settle` = a light spring with ≤6% overshoot,
used only for pins and the sheet.

Effort priority: **4 > 2 > 3 > 1 > 5.** Moment 4 is the product.

### 10.1 TikTok accepted (F1→F2)

**Communicates:** "your link is now the subject of this screen; work has begun."
**Timing:** 220ms total. Field morphs into the source card (position+size, `entrance`); keyboard
dismisses; rail's first stage indicator starts at 120ms — *before* the morph completes, so the
overlap reads as urgency. Must paint within 100ms of the tap.
**Reduced motion:** no morph. Field is replaced by the source card with a 100ms opacity crossfade.
Rail appears immediately, static, first stage marked active.

### 10.2 Processing / discovery (F3–F5)

**Communicates:** "still working, and here is which of three things we are on."
**Timing:** active-stage indicator loops at 1400ms, sinusoidal, breathing — an arc that grows and
recedes, never a track that fills. Stage settle: 180ms — indicator collapses to a tick,
label crossfades to the fact, and the next stage's indicator starts 80ms later. Reassurance line:
240ms fade in, no movement.
**Reduced motion:** no loop. The active stage carries a static indicator and the label is announced
via `aria-live="polite"`. Settle is an instant swap. `aria-busy` on the panel throughout.

### 10.3 Candidates appearing (F6)

**Communicates:** "these came out of that TikTok" — hence they enter from the source card's edge.
**Timing:** rows enter with 8px upward translate + fade, 200ms each, `entrance`, staggered 40ms,
stagger capped at 6 rows (row 7+ enters with row 6). Total ≤ 440ms. The checkbox on preselected rows
animates to checked 120ms *after* its row lands, so the user sees the pre-selection happen rather
than finding it already done — that is what makes the preselection feel like a decision we made for
them, not a trap.
Row correction (branch chosen / search result applied): row height animates 200ms `spatial` and the
row flashes a 400ms accent wash so the user's eye finds the changed row.
**Reduced motion:** all rows appear together, 100ms fade, no translate, no stagger. Checked state is
present on first paint. The correction wash becomes a static 2s accent border.

### 10.4 Pins entering the map (F8) — the hero

**Communicates:** the conversion completing. Video → place → *there*, on the map, in the world.
This is the moment the product's premise becomes physical. Budget the polish here.

Timeline (total 1.3s, interruptible at any point by user gesture):

| t | Event |
|---|---|
| 0 | Review surface begins exit: translate down + fade, 240ms, `exit`. Map dim lifts over the same 240ms. |
| 120 | Camera begins fitting new-pin bounds (overlaps the exit deliberately — the map is already moving as the surface clears, which reads as one action rather than two). 700ms, `spatial`, zoom capped at ~15. |
| 640 | Pins begin dropping: each pin enters at 1.6× scale, 60% opacity, 12px above its anchor, and lands with `settle` over 260ms. Stagger 70ms, ordered outward from camera centre. A brief ground shadow scales with it. |
| 640+ | Newly added pins carry the accent fill. |
| ~1000 | Toast fades in (160ms), 4s life. |
| ~1300 | Accent decays to default fill over 4s, `spatial`. |

For the far-away case (§6.4): 180ms map fade-out → camera jump → 220ms fade-in, then the same pin
drop. Total 1.1s, no ocean swoop.
For a single pin (manual add): no stagger, same drop, no camera fit beyond a gentle pan-into-view.
**Reduced motion:** camera moves with duration 0 (jump). Pins appear at final position with a 140ms
opacity fade, all together, no scale, no overshoot, no shadow. The accent fill still applies and
still decays (colour change over 4s is not motion). Toast appears without movement. The moment
survives as *state change* rather than *animation* — the user still sees "these are the new ones."

### 10.5 Place detail and save

**Communicates:** the pin and the sheet are the same object at two scales.
**Timing:** sheet rises 280ms `settle`; the selected pin scales to 1.25 over 160ms starting at the
same instant; other pins fade to 40% over 200ms. Sheet dismiss 220ms `exit`; pin returns over 160ms.
Save/Add confirm: button label crossfades to a tick over 160ms, then the sheet exits — no full-screen
success state, no confetti.
Remove: pin fades + scales down 240ms; the toast with `Undo` slides up 200ms.
**Reduced motion:** sheet appears/disappears with a 120ms fade, no translate. Pin selection is a
static ring + the other pins' opacity change applied instantly. Button confirm swaps to a tick
instantly.

### 10.6 Motion budget

60fps on a mid-range Android is an acceptance criterion (charter §6). Constraints handed to Frontend:
animate only `transform` and `opacity`; never animate layout properties on the map surface; no
simultaneous camera animation + sheet drag; pin entrance must not trigger a full marker-layer
re-render per pin `[NEEDS maps-geospatial — is a staggered per-marker entrance affordable in the D2
renderer, or must we fake the stagger with a CSS-overlay layer?]`. If staggered pin entry is
expensive, the fallback is a single 300ms fade-in of the whole new-pin set plus the accent decay —
and I would rather have that at 60fps than a stagger at 30fps.

---

## 11. Accessibility

### 11.1 Targets and spacing

Minimum 44×44px for every interactive element; 56px for primary actions; 64px minimum row height in
the candidate list. Minimum 8px between adjacent targets. The `Not this ›` control on a candidate row
gets a 44px target even though its glyph is 16px.

### 11.2 Focus order

- **Import modal (F0–F5):** focus moves to the URL field on open (this is a deliberate autofocus — it
  is the entire purpose of the surface). Order: field → Paste → Add → Cancel/close. Focus is trapped
  in the modal. On transition to F2, focus moves to the progress panel's container (which is
  `aria-live="polite"`, `aria-busy="true"`) so a screen-reader user hears stage changes without
  hunting.
- **Review (S7):** on open, focus lands on the header (`3 places found`), not on the first row —
  landing on a checkbox would announce a control before the context. Order: header → source link →
  Select all (if present) → row 1 checkbox → row 1's `Not this` → row 1's branches → row 2 … →
  primary Save. The primary Save is last in DOM order and sticky in layout; do not reorder DOM to
  achieve stickiness.
- **Search sheet:** focus to the field; results are a listbox; Escape restores focus to the row that
  opened it — the exact row, not the top of the list.
- **Place detail sheet:** focus to the place name (as a heading); Escape/close returns focus to the
  marker's proxy control (§11.4), not to the map container.
- Every sheet and modal traps focus and returns it to the invoking element. No exceptions.

### 11.3 URL input keyboard behaviour

`type="url"` `inputMode="url"` `enterKeyHint="go"` `autocomplete="off"` `autocapitalize="off"`
`autocorrect="off"` `spellcheck="false"`. Enter submits. The keyboard dismisses on submit (blur
before the F2 transition, so the sheet does not animate while the viewport is resizing — two
simultaneous viewport changes is where iOS jank lives). Validation errors are announced via a
`role="status"` region tied to the field with `aria-describedby`, and are never announced while
typing.

### 11.4 Map content for screen readers

The map canvas is not made accessible by ARIA on a canvas. Instead:

- The map container is `role="application"` with an `aria-label` stating the count:
  `Map of your 12 saved places`, plus `aria-describedby` pointing at a sentence explaining that the
  list below contains the same places.
- **The sheet list is the accessible equivalent of the map, and it is not a duplicate**: it is the
  same data, always rendered, always in the DOM, ordered by distance or recency. We get the
  accessible alternative for free because we chose to make the list the sheet rather than a separate
  page. This is the main accessibility payoff of the IA decision in §1.3.
- Markers get keyboard-focusable proxy buttons in a DOM layer over the canvas, in the same order as
  the list, each labelled `Coffee Bar Kikar, café, 320 metres away`. Enter opens the detail sheet.
  `[NEEDS maps-geospatial + design-system-frontend]` — cost of the proxy-marker layer. If it is
  expensive, the acceptable V1 reduction is: markers are not individually keyboard-focusable, the map
  is `aria-hidden="true"`, and the list is the *sole* keyboard/screen-reader path to place detail —
  which is compliant and honest, provided every map-only action (Near me, Search this area, cluster
  expansion) has a list-side equivalent. I need a decision on this early; retrofitting it is worse
  than either choice.
- Clusters are announced as `Group of 7 places, activate to zoom in`.
- Camera movements are not announced. Announcing pans would be unusable. The *result* is announced:
  after `Near me` / `Search this area` / an import, one `aria-live="polite"` message —
  `Showing 4 places near you.` / `3 places added to your map.`

### 11.5 Candidate list semantics

Each row is a labelled checkbox in a `role="group"` with `aria-labelledby` on the header. Row labels
carry state in words, not colour: `Coffee Bar Kikar, café, Tel Aviv. Selected. Confident match.` /
`Sushi Ran. Needs a choice: two possible locations.` / `The beach place. We couldn't match this one.`
Branch options are radios within the row's group. The primary button's label updates
(`Save 3 places`) and that change is announced once, debounced 400ms, so rapid toggling does not
spam.

### 11.6 Contrast intent

Body and all place names: ≥ 4.5:1 against their surface. Secondary metadata: ≥ 4.5:1 (we do not use
the 3:1 large-text exemption for anything the user needs to read — addresses are exactly the content
people read in bad light). Interactive borders, the pin ring, and the focus ring: ≥ 3:1.
Map-surface text (pin labels, cluster counts) is the hardest case because the map style is variable:
require ≥ 4.5:1 against the *worst* map background the style can produce, which in practice means
pins and clusters carry their own opaque surface rather than sitting directly on tiles.
Focus ring: 2px, ≥3:1 against both the element and its surface, never `outline: none`, visible on the
map layer too. Deselected/dimmed candidate rows at 55% must still meet 4.5:1 — dimming applies to the
row surface, not to the text colour.
`[NEEDS design-system-frontend]` — the map style (D9) must be chosen with these ratios as a
constraint, not decorated afterwards.

### 11.7 Safe areas and viewport

`100dvh` for the map; peek height and the sticky primary button padded by
`env(safe-area-inset-bottom)`; top controls padded by `env(safe-area-inset-top)`; landscape adds
left/right insets. The sticky primary action must not move when the iOS browser toolbar
collapses/expands — bind to `visualViewport` where needed. Test matrix minimum: iOS Safari (notch and
Dynamic Island), Android Chrome, desktop Chrome/Safari/Firefox.

### 11.8 Reduced motion

Every animation in §10 has an explicit equivalent, listed there. Policy: `prefers-reduced-motion:
reduce` removes translate, scale, spring, stagger and camera easing; it keeps opacity crossfades
under 150ms and it keeps colour transitions (accent decay). It never removes *information* — the
new-pin accent, the settled stage facts, and the corrected-row highlight all survive as static
states. There is no separate reduced-motion codepath for the flow logic; only the presentation layer
differs. QA must run the golden path with reduced motion on.

---

## 12. Copy deck

Every user-facing string in the flagship flow and the failure states. Strings not in this table do not
ship.

**Banned words:** [`voice-and-vocabulary.md`](voice-and-vocabulary.md) §4 holds the list, and it holds
it alone. The list used to be duplicated here and the copy went out of date the day §4 added nine
words to it — two copies of one list is how a third gets written.

**Mechanics** — sentence case, no exclamation marks, digits always, per-string pluralisation, dates
`3 Aug` / `3 Aug 2025`, distances `320 m` / `1.4 km` / `12 km` — are
[`voice-and-vocabulary.md`](voice-and-vocabulary.md) §5, for the same reason.

> **Reconciled 2026-08-31**, in one edit, from three stacks that all landed on this section at once:
> the eight drift rows in [`overnight-copy-deck.md`](overnight-copy-deck.md) §8, that document's own
> new ids, and the **TikTok noun→adjective pass**
> ([`tiktok-copy-pass-2026-08-31.md`](tiktok-copy-pass-2026-08-31.md), 17 ids). They overlapped on
> C62, C70 and C71, which is why this is one edit and not three.
>
> **The standing rule that makes another reconciliation unnecessary**
> (`voice-and-vocabulary.md` §6): *a string changes in code and this deck follows in the same commit,
> or it does not change.* Everything below was measured against the code, not carried forward — where
> a row quotes a string, it quotes what actually ships.

### 12.1 Import

| ID | Surface / state | String | Notes |
|---|---|---|---|
| C01 | F0 title | `Add a TikTok link` | Was `Add a TikTok`. §3.1: the name is an adjective, never a noun. |
| C02 | F0 placeholder | `Paste a TikTok link` | |
| C03 | F0 helper | `Copy the link in TikTok — Share → Copy link.` | The only instruction in the product. |
| C04 | F0 button | `Paste` | |
| C05 | F1 submit | `Add` | |
| C06 | F1 invalid | `That doesn't look like a TikTok link.` | **`MALFORMED_URL` only.** `UNSUPPORTED_HOST` and `UNSUPPORTED_URL` get their own screens — this sentence is false for all three of an Instagram link, a profile link and a photo post. The old note ("on blur/submit only") invited exactly the bug `use-import-run.ts` documents fixing. |
| C07 | F1 offline | `You're offline. Check your connection and try again.` | |
| C08 | F2–F5 cancel | `Cancel` | |
| C09 | F3 active | `Reading the TikTok video…` | The verb `reading` is protected by §3; only the noun moved. |
| C10 | F3 settled | `Read @{handle}'s TikTok video` | Falls back to `Read the TikTok video` with no handle. |
| C11 | F3 reassurance (4s) | `Still reading — this one's taking a moment.` | |
| C12 | F4 active | `Finding the places…` | |
| C13 | F4 settled, N≥2 | `{n} places found` | Held ~700ms as the payoff beat. |
| C14 | F4 settled, N=1 | `1 place found` | |
| C15 | F4 settled, N=0 | `No places named` | Rail fact only; screen becomes F10. **Takes the same ~700ms hold as C13** — the count beat does not run at N=0, so the modal outcome arrives on the same beat as a success (`overnight-copy-deck.md` §9.2). |
| C16 | F4 reassurance (5s) | `Almost there.` | |
| C17 | F5 active | `Matching locations…` | |
| C18 | F5 active, streamed | `Matching locations… {i} of {n}` | Only if per-candidate progress is real. |
| C19 | F5 settled | `Ready to check` | |
| C20 | F5 reassurance (6s) | `Checking a few possibilities.` | |
| C21 | 12s, any stage | `Still going. You can leave this open.` | Replaces the stage reassurance. |
| C22 | Degraded single-stage (§3.2b) | `Finding the places in this TikTok video…` | Used only if stages cannot be streamed. |

### 12.2 Review

| ID | Surface / state | String | Notes |
|---|---|---|---|
| C30 | S7 header | `{n} places found` / `1 place found` | |
| C31 | S7 subline | `@{handle}'s TikTok video` | Falls back to `This TikTok video`. Tappable → opens the video. **Two corrections in one row:** the noun, and the deck's `From ` prefix, which the shipped subline (`review-screen.tsx`) has never carried. |
| C32 | Confident row trailing | `Not this` | |
| C33 | Ambiguous row prompt | `Which one?` | |
| C34 | Ambiguous row escape | `Search` | |
| C35 | Unresolved row body | `We couldn't match this one.` | |
| C36 | Unresolved row action | `Search for it` | |
| C37 | Primary, N≥2 selected | `Save {n} places` | |
| C38 | Primary, 1 selected | `Save this place` | |
| C39 | Primary, 0 selected | `Select a place to save` | Disabled. |
| C40 | Footer reassurance | `Nothing is saved yet.` | Always present. Shortened 2026-09-02: the 56px primary directly above it already reads `Save 1 place`, so the instruction half was the button's line, not the reassurance's. The fact — that nothing has been written — is Charter §3 invariant 2 and survives. |
| C41 | Footer, unresolved present | `{n} place needs your help.` / `{n} places need your help.` | |
| C42 | Header, N≥4 | `Select all` / `Deselect all` | |
| C43 | Resume row on `/map` | `{n} places waiting from @{handle}` + `Review` | |
| C44 | Search sheet placeholder | `Search for a place` | |
| C45 | Search sheet, no results | `No places found for "{query}".` + `Try a different name.` | |
| C46 | Search sheet cancel | `Cancel` | |

### 12.3 Success

| ID | Surface / state | String |
|---|---|---|
| C50 | Toast after import, N≥2 | `{n} places added to your map.` |
| C51 | Toast after import, N=1 | `Added to your map.` |
| C52 | Toast, far-away import | `{n} places added in {city}.` |
| C53 | Toast action | `View list` |
| C54 | Toast after manual add | `Added to your map.` |
| C55 | Toast after remove | `Removed.` + `Undo` |

### 12.4 Failure

| ID | Surface / state | String | Notes |
|---|---|---|---|
| C60 | F9 headline | `We couldn't read this TikTok video yet.` | One word longer than the string it replaces, in the largest type in the failure family. Taken anyway: `this video` drops the platform on a screen whose whole subject is the platform's post, and `that link` is false — we read the link fine. |
| C61 | F9 body | `Some TikTok videos don't share enough for us to work with. It's worth a retry.` | A plural settles the noun test outright: you can only pluralise a count noun. |
| C62 | F9 actions | `Retry` · `Open on TikTok` | `Add a place you know` is **withheld while it has no destination from this screen** — `import-error-copy.ts`'s standing rule that a recovery only ever points somewhere that works. Manual add shipped 2026-08-30, so restoring it is a live question with no owner yet; recorded rather than silently dropped. |
| C63 | F9 after repeated failure | `Still no luck with this one.` | |
| C64 | Timeout headline | `This is taking longer than usual.` | |
| C65 | Timeout actions | `Keep waiting` · `Start over` · `Add a place you already know` | Same gate as C62. |
| C66 | Private/removed video | `This TikTok video isn't public, so we can't read it.` | Row is deliberately unused today (`import-error-copy.ts`). |
| C67 | — | **Retired** | ~~`You've added a lot of TikTok links in the last few minutes. Try again shortly.`~~ Described a **per-user limit the product does not have** (`security.md` R-1). Worse, it was the nearest thing to the state that does occur — the day's model allowance running out, which is shared and not the user's doing — so shown there it blamed the user for someone else's usage. That state now has its own code and its own rows, C170–C172. A deck row for an unreachable state is how it gets rebuilt. |
| C68 | — | **Retired** | ~~`You've tried this a few times. Give it a few minutes.`~~ Same reason as C67, and it promised a wait of minutes for a ceiling that can be a day. |
| C69 | F10 headline | `No places in this one.` | Unchanged, and the rename to No Crumbs touched it nowhere — `voice-and-vocabulary.md` §2's health check. |
| C70 | F10 body | `We read the caption, and it doesn't name a place we can put on a map. Some TikTok videos only show the place on screen.` | **The one row where a spec beats the running code** — `spec-no-places-found.md` §5.1 case B is ratified, owned and is what W6-5 builds. Cases A and C live there too and have no ids here. |
| C71 | F10 actions | `Try another TikTok link` (secondary) · the embedded name search (primary) · `@{handle}'s TikTok video ↗` in the source row | `spec-no-places-found.md` §4.3, §5.3, §12. Opening the original appears **once**, at the top, never as a footer link. |
| C72 | Save failed | `Couldn't save those places.` + `Try again` | |
| C73 | Map tiles failed | `Map is having trouble loading.` | |
| C74 | Location notices | `Location is off for this site. Pick an area from your list instead.` · `This browser can't share your location. Pick an area from your list instead.` · `Your location is only rough here, so distances are hidden.` | The shipped family (`near-me.ts`). **`How to turn it on` is deleted** — it never existed, and a deck row naming an unbuilt action is how it gets built by accident. |
| C75 | Location timeout | `Couldn't find your location. Try again, or pick an area from your list.` | Shipped wording; the deck's shorter version offered no next move. |
| C76 | Signed out mid-flow | `Sign in again to finish adding this.` | |
| C170 | Can't find places today, headline | `We can’t find places right now.` | The state C67/C68 were being shown for, said honestly. `find places`, not `read`: the read succeeded, and stage B — `Finding the places…` (C12) — is what failed. `right now`, not `today`: a provider ceiling can be per-minute as well as per-day and nothing reads which, so `right now` is true under either. Ruled in [`product-ruling-quota-copy-2026-08-31.md`](product-ruling-quota-copy-2026-08-31.md) §3; **fixed, not paraphrasable**. |
| C171 | Can't find places today, body | `We read it fine. Try it again tomorrow.` | The load-bearing sentence: every other screen in this family is about the link, so the trained response is to fetch a different one — which fails identically. It is measured, not reassurance: the extractor is stage B and the source fetch is stage A, so the caption is already in hand by the time this can be raised. `tomorrow` is the only duration that cannot over-promise under either ceiling. |
| C172 | Can't find places today, actions | `Back to the map` | No retry and no second link — both spend the same empty allowance. **No `Open on TikTok`**, and that is a repo rule rather than a preference: across the shipped table it appears on exactly the codes where *the read failed* and on none of the three where it succeeded. Leaving is the recovery here, which is true on no other screen in this family. |

### 12.5 Map, detail, first run

| ID | Surface | String | Notes |
|---|---|---|---|
| C80 | Sheet peek count | `12 in London` · `12 in London · +20 more` | The short form, given pre-split as `heading.count` + `heading.shortRest` so the row renders it and never parses it. The deck's old `{n} places saved` is a generation behind the code. |
| C81 | Sheet primary | `Add a TikTok link` | Was `Add a TikTok`. |
| C82 | Map pill | `Near me` | |
| C83 | Map pill after pan | `Search this area` | |
| C84 | Sheet heading | `12 places in London` · `1 place in London` · `12 places in this area` · `3 matches in London` · `1 match in London` · `3 matches in this area` · `No matches in London` · `Nothing matches "momos"` · `Nothing tagged "Momos"` · `7 to go in London` · `You've been to all of them.` | The shipped family, from `active-area.ts`'s `areaHeading`. Two deck rows never described eleven strings, and the visit filter's own nouns are load-bearing — the generic version produced `Nothing tagged ""`. |
| C85 | — | **Retired**, folded into C84 | `Near you` / `In this area` were the two rows that stood in for the family above. |
| C86 | Location pre-prompt title | `Show what's near you` | |
| C87 | Location pre-prompt body | `We'll use your location to sort your places by distance. It stays on your device — we never save it.` | |
| C88 | Location pre-prompt actions | `Use my location` · `Not now` | |
| C89 | Detail source block | `Saved from` / `Saved from {n} TikTok videos` | |
| C90 | Detail source, manual | `Added by you · {date}` | |
| C91 | Detail actions | `Directions` · `Remove` · `Open on TikTok` | **One label for one action, product-wide.** This button had three names — `Open TikTok` here, `Open the TikTok` in the failure screens, `Open the post in TikTok` in the expired-link body. All three collapse to this. |
| C92 | Remove confirm | `Remove from map?` · `Remove` · `Cancel` | |
| C93 | First run headline | `Your map starts here.` | Shipped verbatim as `EMPTY_LIBRARY_HEADING`. |
| C94 | First run body | `Paste a TikTok link and the places it talks about land on your map.` | The shipped string (`EmptyLibraryLine`) beats the deck's, and *land on your map* is the product's own best verb — `voice-and-vocabulary.md` §6's ruling, applied. |
| C95 | First run tertiary | `Try an example` · `Add a place by name` | |
| C96 | First coach line | `Tap a pin to see the TikTok video it came from.` | |
| C97 | Cluster label (SR) | `Group of {n} places, activate to zoom in` | |
| C98 | — | **Retired** | `Nothing saved in this area.` + `Show all places` described a state that **cannot occur**: an area is defined by the places in it, so an unfiltered area always has at least one (`active-area.ts`). That deleted the state and the button with it. A deck row for an unreachable state is how it gets rebuilt. |
| C99 | Empty near me | `Nothing saved near you yet.` | The string ships (`near-me.ts`) as a notice. **The `Add a TikTok` action attached to it does not exist** — recorded rather than carried, per the same rule as C74. |

### 12.6 What this reconciliation did not reach — owed, and named so it is not lost

**§12 is now correct. §1–§11 of this document are not, and the gap is bigger than §12's was.**

The noun→adjective sweep found roughly **35 further sites in §1–§11** carrying the bare noun. They
are not all engineering prose — several are literal copy blocks that specify a string
(`**Copy:** Title \`Add a TikTok\``, §2's F1; `Reading the TikTok…`, §F3; §5.1's and §5.3's mockups
and action lists; §9's first-run panel; §7's `Saved from 2 TikToks`), plus a dozen ASCII mockups that
draw the old wording inside a box.

It was left deliberately rather than missed. Reconciling §1–§11 is a different and much larger edit
than the one this section was scoped for, and doing it in the same pass would have buried a checkable
17-id correction inside an unreviewable diff.

**Two things follow.** Until it is done, **§12 is the only part of this document whose strings may be
copied into code** — §1–§11's copy blocks are historical. And when it is done, the same rule applies
as everywhere else: it lands as one edit, against the code, in one commit.

---

## 13. Open questions

### For `design-system-frontend`
1. **Bottom sheet primitive.** Vaul / Radix + drag layer / bespoke? I have specified three snap
   points, velocity snapping, `visualViewport` binding and content-scroll arbitration (§6.5). Which
   of those is free with the primitive and which do I have to pay for? If bespoke is the only option,
   tell me now and I will cut to two snap points (peek/full).
2. **Tokens (D9).** I need motion duration/easing tokens named as in §10, an accent that survives the
   §11.6 contrast constraint *on top of the map style*, and a six-glyph category set. Which lands
   first — tokens or the map style? They constrain each other.
3. **Map-marker proxy layer** for keyboard focus (§11.4) — build it, or take the documented reduction?
4. Toast component: do we already have one with an action slot and a 4–5s life, or is that new work?
5. Number transitions on the Save button (§10.3) — cheap, or delete?

### For `nextjs-architect`
1. **Map instance persistence across routes** (§1.5). Can S5/S6/S7/S8 be child routes of a layout that
   owns the map without a remount, without intercepting routes? If not, I need to know before I
   commit to deep-linkable sheets, and the fallback is client-state sheets with no deep links.
2. **Stage events (§3.2) — this is the blocking one.** (a) streamed/polled real stages or (b) single
   response? My progress design has two different shapes depending on the answer and I would rather
   build one.
3. **Platform timeout.** What is the actual maximum request duration on our plan? My 20s client stop
   must sit inside it.
4. **Pre-confirmation persistence** of an import and its candidates (§4.7 resume). Table + cleanup, or
   client-only?
5. **Remove**: soft delete vs hard delete with a client undo buffer (§7).
6. Cheap region inference for the first-run camera from locale/timezone (§9.1) — free, or skip?

### For `maps-geospatial`
1. **Staggered per-marker entrance** (§10.4) — affordable in the D2 renderer at 60fps on mid-range
   Android, or do we fake it in a DOM overlay, or do we take the whole-set fade fallback?
2. **Fade-jump-fade camera** for far-away imports (§6.4) without a white flash — possible? And the
   distance threshold for "far".
3. **Clustering**: native in the renderer? Frame cost at ~300 markers? Behaviour for identical
   coordinates?
4. **Typeahead search** (§4.2): available under D2 licensing, and is it billed per keystroke session?
   If costly, I fall back to submit-on-Enter.
5. **Category taxonomy → six glyphs** mapping table, plus what fraction lands in `other`.
6. **Tile-failure behaviour** (§5.4): do pins survive a tile outage or does the canvas blank?
7. Does the place payload we already fetch include opening hours / a photo for free (§7), or is that a
   second billed call? If second call, hours are cut.
8. Viewport-bounds query shape for `Search this area` — and does it need PostGIS (A4)?

---

## 14. Things I have specified that I suspect are expensive

Ranked by my confidence that they will hurt, with the cut I am pre-authorising in each case.

| # | Specified | Why it may be expensive | Pre-authorised cut |
|---|---|---|---|
| 1 | **Real streamed stage events** (§3.1) | Requires either a status row + polling or a streamed response; touches D3 which is unresolved. | Degrade to the single honest stage (§3.2b). The flow still works; it is just less impressive. **Do not simulate stages.** |
| 2 | **Persistent map across sheet routes** (§1.5) | App Router remount risk; a camera reset here is a product-killing bug. | Sheets become client state, lose deep links, keep the map. Deep links are worth less than camera stability. |
| 3 | **Staggered pin entrance ordered outward from centre** (§10.4) | Per-marker animation in a WebGL renderer is often awkward; the geographic ordering adds a sort and per-marker delay. | Whole-set 300ms fade + accent decay. Keep the accent decay — it carries the information. |
| 4 | **Marker proxy layer for keyboard/SR** (§11.4) | A synced DOM layer over a moving canvas is real work and a perf risk. | Map `aria-hidden`, list is the sole a11y path, every map action mirrored in the list. Decide early. |
| 5 | **Three-stop sheet with content-scroll arbitration** (§6.5) | The classic source of gesture bugs; iOS keyboard + `dvh` + drag together is the worst corner in mobile web. | Two stops (peek/full), and `full` is a plain full-screen sheet with no drag-to-dismiss (button close only). |
| 6 | **Pre-confirmation resume row** (§4.7) | Needs server-side persistence of unconfirmed imports plus expiry. | sessionStorage-only resume, or cut resume entirely — abandonment simply loses the import. |
| 7 | **`Try an example`** (§9.1) | Cheap to build, but depends on a stable public TikTok surviving 19 days and the pipeline being deterministic enough not to embarrass us in a demo. | Cut if flaky. But try hard to keep it: it is the best answer to R5 and the safest thing to show an examiner. |
| 8 | **Undo on remove** (§7) | Small, but it is an extra state and a timer. | Replace with the inline confirm only. |
| 9 | **Per-candidate `{i} of {n}` matching progress** (C18) | Requires streaming granularity below stage level. | Plain `Matching locations…`. |
| 10 | **Fade-jump-fade far-away camera** (§6.4) | Renderer-dependent; risk of a white flash that looks broken. | Plain instant `jumpTo` with the toast naming the city. Still better than an ocean swoop. |

If everything in this table were cut, the flagship flow would still be: instant acknowledgement →
one honest progress state → a thumb-optimised review screen → pins on a map with a source link. That
residue is the product, and it is the version I would defend in a demo. Everything above it is
ordered polish.
