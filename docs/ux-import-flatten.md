# Flattening the import flow — two taps of "Add", and a review step with nothing to review

> Owner: UX / Interaction · 2026-08-30 · **spec for `design-system-frontend`**.
> Scope: the two things the owner asked for and nothing else. No new component, no new screen, no
> new state machine — every change below is a deletion or a branch inside a file that already exists.

---

## 1. What is wrong

1. **You press Add twice.** The `＋` sheet has a button called `Add this TikTok`. Pressing it closes
   the sheet, opens the import overlay, and puts your link in a field under a second button called
   `Add →`. Nothing happens until you press that one too. This is not a design decision — the
   overlay takes an `initialUrl` prop and simply never submits it.
2. **The review screen asks a question when there is only one answer.** One confident place still
   arrives as a tickbox inside a bordered card under the heading `REVIEW & CONFIRM`, with the
   place's name in 15px inside the card and the word `1 place found` in 24px above it. The tickbox
   has one legal value. The heading names a process, not the result.
3. **A found bug, and it is the "confidently wrong place" case.** When a candidate is in the
   `confirm` band (chip: `Needs your pick`) *and* the model gave a coordinate, the card is
   pre-ticked, `Save this place →` is live, and pressing it writes the model's guessed pin — while
   the correct provider row sits unpicked in the list directly above. The card's pin line reads
   `Pin is approximate`, because `resolverPinLine` returns `null` for that combination and the
   screen falls back to `locationLine`. So the one card that would save a guess is the one card
   that does not say so. Fix in §4.

---

## 2. Part B — the double Add

### Tap counts today, phone, link already on the clipboard

**TikTok, from `/map`:**

| # | Tap | |
|---|---|---|
| 1 | `＋` | opens the create menu |
| 2 | `Add a place` | opens the field |
| 3 | clipboard button in the field | |
| 4 | **`Add this TikTok`** | closes the sheet, opens the overlay — **starts nothing** |
| 5 | **`Add →`** | ← redundant. Same link, same intent, second button |
| 6 | `Save this place →` | after the 7–34 s wait |

**6 taps, two of them called Add.** From `/collections` or `/profile` the same import is **4 taps**,
because `＋` there is a plain link to `/import` and never shows the sheet. The core surface is the
slow one.

**Manual add, from `/map`:** `＋` → `Add a place` → type → `Add "Kohi" manually` = **3 taps**, saves
immediately, and the place's detail card opens as the receipt. No redundant tap. Nothing to fix.

### The change

`ImportPageClient` submits the URL it was handed instead of asking for it again.

- When `initialUrl` is present, the overlay opens **in the rail**, already running. Tap 5 is deleted.
- `initialUrl` is passed by exactly one caller (`AddSheetHost.onSubmitTikTok` → `openImport(url)`),
  and that caller only fires when the user pressed a submit button. **Write that contract into the
  prop's doc comment** — it is now load-bearing, because the prop spends a model call. Renaming it
  to `submittedUrl` is welcome but optional.
- Fire once. The existing `inFlightProbe` ref already refuses a concurrent submit; add a ref so a
  re-render or a StrictMode double-mount cannot fire a second time.
- Everything downstream is untouched: same route, same rail, same `no_places` screen, same review,
  same Cancel (which returns to the paste screen with the link intact, as it does today).

**Result: 5 taps, one Add.** The paste screen still exists and is unchanged for everyone who reaches
`/import` directly or with an empty field.

---

## 3. Part A — one confident result

### When it collapses

**`candidates.length === 1` and its `resolutionView` is `matched`.** That is the existing
`preselect` band, derived server-side by `deriveResolution` — no new threshold, no new number, and
it is the one boundary we have measured (Google: 15/16 correct top-1, **0 wrong auto-matches**).

Everything else — two or more candidates, `ambiguous`, `unresolved`, `failed`, `capped` — renders
exactly as it does today. **The collapse never applies to a candidate whose pin came from the
caption**, so it can never be the thing that hides a guess.

**Amended 2026-09-02 — nor to a result already saved from this same link.** The collapsed branch
renders **no checkbox at all** (measured: zero elements with `role="checkbox"`). That was correct
while the collapsed state was always a place you were about to add — there is one thing on screen
and the primary button acts on it, so a tick would be furniture.

It stopped being correct when a re-import learned to say *"It's not selected below. Select it to add
it again."* On a single-candidate re-paste, that sentence sat above a layout with nothing to select:
the screen named a control it had removed. Found by putting it on a phone, not by a test.

So a single result that is **already added from this video** does not collapse. The alternative was
to make the sentence true by withdrawing the offer, which fixes the wording by taking away the
user's ability to add the place deliberately — the wrong half to give up. The condition is keyed on
the already-added count and never on selection, so the layout cannot change under the user's thumb
as they tick.

This narrows the rule in one state; the measured `preselect` boundary above is untouched.

### What the user sees

```
[✕]

1 PLACE FOUND                              ← kicker, was REVIEW & CONFIRM
Kohi בית קפה יפני                          ← H1: the name that will be saved
Café · Yehuda Halevi 42, Tel Aviv-Yafo     ← existing candidateMeta line

[thumb]  @tlvfoodie's TikTok ↗
         Show the caption ⌄

◎ Pin from the map data        Check on Google Maps ↗
Not this place? ⌄

──────────────────────────────────────
[      Save this place →      ]   h-14
Nothing is saved until you tap Save.
```

**Deleted in this state:** the tickbox (one legal value is not a control), the `Matched` chip (there
is nothing on screen to contrast it with — the pin line already says where the coordinate came
from), the card's border and surface (one card is not a list), and the duplicated name, since the
H1 is now the name rather than the count.

**Kept, deliberately:** the source row and thumbnail (the provenance promise), `Show the caption`,
the pin-provenance line verbatim from `resolverPinLine`, `Check on Google Maps`, `Not this place?`,
and `Nothing is saved until you tap Save.` — the save is still an explicit human confirm, which
Charter §3 invariant 2 requires and which is the product's moat against mio's silent saves.

### Correcting a wrong result — one tap

- **`Not this place?`** is the existing control and it stays. One tap opens the shortlist in place;
  picking a row re-titles the H1 to what will now be saved and the chip logic already flips to
  `Your pick`.
- When the shortlist holds only the one row, `Not this place?` is not rendered (today's rule, and it
  is right — it would offer a different one when there is no different one). The correction there is
  `Check on Google Maps` to look, and `Back to the map` to not save it. **`Add a place you know` as
  a promoted recovery is a separate, bigger change — see Future.**

---

## 4. The provenance fix (small, separable, do it in the same PR)

`resolverPinLine` in `src/ui/import/candidate-resolution-view.ts` must also return
`'Pin from the caption'` when the view is `ambiguous`, no option is picked, and the model has
coordinates. Today it returns `null` for that case and the card falls back to `Pin is approximate`,
which describes a match we do not have. The function's own comment excludes `ambiguous` on the
grounds that "the pin is waiting on a decision, not on the data" — true only when there is no model
coordinate to save instead, which is not this case.

---

## 5. Copy

| Where | String | Note |
|---|---|---|
| Kicker, collapsed state | `1 PLACE FOUND` | replaces `REVIEW & CONFIRM`. Deck C30's words, moved |
| H1, collapsed state | the place name | `savedPlaceName(view, pick) ?? candidateTitle(...)`, `<bdi>`, `line-clamp-2` — Hebrew names must not clip at the start |
| Meta | unchanged (`candidateMeta`) | |
| Pin line | unchanged (`resolverPinLine`) | `Pin from the map data` in this state |
| Shortlist trigger | `Not this place?` | unchanged |
| Primary | `Save this place →` | unchanged |
| Reassurance | `Nothing is saved until you tap Save.` | unchanged |

Deck deviation, declared: at N = 1 the count is not information — you can see there is one — so
`1 place found` moves to the kicker and the H1 carries the name. No new strings.

---

## 6. Acceptance

Signed in, at 390×844 and 1440×900, against a real cached TikTok (a cached URL costs zero model
calls):

1. `＋` → `Add a place` → paste → `Add this TikTok` lands on the **rail**, already running. The word
   "Add" appears on exactly one button between the `＋` and the save.
2. Cancelling from that rail returns to the paste screen with the link still in the field.
3. Pasting the same link twice in quick succession issues **one** request (check the network panel,
   not the code).
4. A one-candidate `matched` import shows: no tickbox, no card border, the place's name as the
   largest text on screen, and one primary button.
5. Tapping `Not this place?` and choosing a different row changes the H1 to the chosen name; Save
   writes that row (check the persisted `places` row, not the response body).
6. A one-candidate `ambiguous` import is **unchanged** — chip `Needs your pick`, shortlist open — and
   its pin line now reads `Pin from the caption` rather than `Pin is approximate`.
7. A zero-candidate import still lands on `NoPlacesScreen`, unchanged.
8. `prefers-reduced-motion`: no new motion is introduced by any of the above.
9. Hebrew: a Hebrew place name as the H1 reads right-to-left and is not clipped at its start.

---

## 7. Not changing, and why

- **The `＋` create menu.** It is an owner ruling (2026-08-29): one create menu on every tab, the
  choice made inside the sheet. Its tap is not the redundant one — the second `Add` is.
- **The confirm step itself.** Charter §3 invariant 2: pre-selected, never silently saved. The
  collapse removes the sub-decisions, not the decision.
- **Multi-candidate review.** Tickboxes and `Select all` earn their place at N ≥ 2.
- **The paste screen, the rail, the failure screens, `NoPlacesScreen`.**
- **The band thresholds.** Retuning `preselect`/`confirm` is a measured domain decision, not a
  layout one.
- **Manual add.** 3 taps, no confirm screen, and that is correct: the user typed the name, so it is
  not our inference, and the save is reversible with the detail card as its receipt.

---

## 8. Two decisions that are the owner's, not mine

1. **Does `Add a place` deserve its own tap?** Every core-loop import pays one tap for a menu whose
   second row (`Create a collection`) is a rare action. The alternative that keeps the ruling intact
   is one pane: `＋` opens the field directly with `Create a collection` as a row inside it, so the
   choice is still visible inside the sheet. That would make the import 4 taps. It is a change to a
   ruling the owner made, so it is theirs to take.
2. **`Needs your pick` is measured as mostly needless.** On the Google scoreboard, 3 of 16
   candidates land in the `confirm` band with **0 genuine ambiguities and 0 wrong auto-matches** —
   three questions asked for nothing. Widening `preselect` would make more single results collapse
   under §3, which is the owner's complaint answered at the source rather than in the layout. It
   trades a question for a risk, and it needs a measurement pass, so it should not ride along with
   this work.

---

## 9. Future (one line each, not in this spec)

- `NoPlacesScreen` still withholds `Add a place you know` on the grounds that S8 does not exist — it
  now does (manual add, 2026-08-30). The modal import outcome is missing its main recovery.
- `＋` links to `/import` on `/collections` and `/profile` instead of opening the create menu, which
  contradicts the 2026-08-29 ruling and makes the same import cost fewer taps off the core surface.
- Manual add never reports `alreadySaved`, so re-adding a place you already have looks like a fresh
  save.
- An import whose one candidate resolved to a single shortlist row has no in-product correction
  path at all — only Google Maps, or don't save it.
