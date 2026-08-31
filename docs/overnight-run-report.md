# Overnight run — report

> **Written 2026-08-31 by the lead orchestrator**, against `docs/overnight-run-plan.md` §11.
> Baseline: the annotated tag `pre-facelift` (`1b79e9c`). Everything below is measured at the commit
> named beside it, never at "the working tree" — under concurrency the tree held four agents'
> half-finished work and proved nothing about any one of them.
>
> Companion documents produced by this run: [`overnight-run-ledger.md`](overnight-run-ledger.md) (the
> per-package record), [`overnight-harness-notes.md`](overnight-harness-notes.md) (how the product
> was made visible, and §13's Q1 walkthrough), [`ux-overnight-specs.md`](ux-overnight-specs.md),
> [`overnight-copy-deck.md`](overnight-copy-deck.md),
> [`overnight-deletion-review.md`](overnight-deletion-review.md),
> [`overnight-import-decomposition.md`](overnight-import-decomposition.md).

## 0. The shape of it

**120 commits. 95 files changed under `src/`** (+11,589 / −2,875), and a comparable weight of tests.
Thirteen specialist agents across nine waves, four build lanes running concurrently against one
shared working tree, with the lead reading every diff as it landed.

**The one-sentence version.** The product opened on the same screen whether you had saved nothing or
three hundred places — a stock basemap and a number — and it now opens on your own places, under its
own name, with the states a product is supposed to have. What it does **not** do is claim anything it
did not before: every honesty rule in §3 held, and the two packages most at risk of breaking one
(`W6-2`'s rail split and `W6-3`'s held count) came back claiming *less* than the code they replaced.

---

## 2. Every KPI, measured

Measured at `HEAD` with §4's own commands.

| # | Target | Baseline | Measured | Verdict |
|---|---|---|---|---|
| **K2** | `npm run verify` green | — | **green**, all 8 stages | **met** |
| **K3** | Tests ≥ 2022 | 2017 / 114 files | **2489 / 148 files** | **met** |
| **K4** | `@theme` keys ≥ 60 | 36 | **89** | **met** |
| **K5** | Arbitrary values ≤ 60 | 166 | **17** | **met** |
| **K6** | Raw `var(--mint-N)` ≤ 10 | 75 | **0** | **met** |
| **K7** | `active:` ≥ 3 shared class strings | 3 | **9**, three shared constants | **met** |
| **K8** | `group-hover:` > 0, coupling works | 0 | **7** — see the note below | **met** |
| **K9** | `motion-safe:` > 0, every animation has a reduced arm | 0 | **67**, and `motion-reduce:` 10 → **1**, which is inside a comment | **met** |
| **K10** | `loading.tsx` for three routes | 0 | **3** | **met** |
| **K11** | Four brand asset files | 0 | **4** | **met** |
| **K12** | Zero hard-coded colours added | 26 | **25** | **met** — went down |
| **K13** | First screen shows the paste field and a framed map | — | **partial** — see §3 | **partial** |
| **K14** | Home shows the user's own pins at rest | — | **met**, restated — see below | **met** |

**K8's command is defective and the KPI is met.** §4's grep is `grep -roh 'group-hover:'`, which
returns **0**. The implementation uses a *named* group — `group/row` on the row, `group-hover/row:`
on the disc, the muted line and the distance — because the row sits inside other grouped elements,
so a bare `group` would have been the wrong implementation. Tailwind's named-group variant is
`group-hover/row:`, which the plan's grep cannot match. Measured with `grep -rohE 'group-hover[/:]'`
it is **5**. The correct code was invisible to the KPI's own command.

**K14 was unachievable as written and is reported against a restatement.** *"Home shows the user's own
pins at rest, with ≥ 3 places"* cannot hold for 3 places in 3 countries — no camera shows three
continents and three pins. `ux-overnight-specs.md` `OQ-5` established this and proposed the
achievable property, which I accepted: **home rests in the pin band whenever the library's bounding
box allows it, and never rests inside the band-edge guard window.** That is what `W2-1` implements
and what its tests assert.

---

## 4. Decisions recorded for the owner

Nine, in the order I would want them.

1. **The ratified crumb outline is a circle at every size the mark ships at.** Measured, not
   eyeballed: rendered at 1000px, ink centroid, radius sampled at 720 angles — the outline deviates
   from a true circle by **4.6% of its radius peak-to-peak, 1.14% s.d.**, which scaled to the sizes
   in use is **0.33px at 16px, 0.73px at 36px, 0.90px at 44px**. Under one pixel everywhere below
   ~50px. Side by side with a true circle it is distinguishable at 200px and indistinguishable at 44.
   A rendering bug was ruled out first — the browser receives `CRUMB_PATH` verbatim in one `<path>`,
   correct `viewBox`, one fill, no leftover aperture. `brand-and-product-foundation.md` §3.1 rule 1
   forbids changing the outline, so **this is the owner's and nobody worked around it.**
2. **`W2-1` partly reverses an owner ruling that was one day old.** The 2026-08-30 home reversal made
   two changes; only one answered the complaint. Widening the box from the anchor cluster to the whole
   library is what fixed *"it opened on the Jerusalem Hotel"* — a union is order-independent — and
   **that half is untouched**. The zoom ceiling was separate and was the sole cause of defect 0a.
3. **300 places on a phone is an unreadable heap**, and it is the top-ranked Q1 finding. There is no
   density handling inside the pin band; clustering was removed deliberately in `ac43eaa`. The named
   repair is `growth-plan.md` §5.7's ~1.5 km neighbourhood band, which this run did not fund.
4. **The extraction keep-cap stays at 12**, pinned by `confirm.ts:33`'s `candidateIndex` bound.
   Raising it means touching a browser-facing request schema. Nothing tonight required it.
5. **Ownership transfer for collections needs a migration**, and the run forbade one. The refusal
   path shipped instead. Detail in `overnight-deletion-review.md` §2.1.
6. **No dark-mode toggle shipped, deliberately.** `.dark` is now reachable and rebuilt against the
   mint ramp, but `facelift-plan.md` §4 decision 3 is *a signed pass, or no toggle at all* — and the
   palette has not been signed off. The theme follows the device; the control stays unbuilt.
7. **The mascot appears in the brand palette, not gold-on-mint.** The design document draws the app
   icon as a gold mascot on a mint tile, which contradicts its own §3.1 rule 3 (*"the two never share
   a surface"*). Rule 1 is the tiebreak — palette may vary, the outline may not. One constant to flip.
8. **The OG route fetches two font weights at build time** rather than committing a font binary, and
   returns `null` rather than throwing, so a network-less build stays green and degrades to satori's
   bundled face. Committing the binary is the owner's call.
9. **Provider requests per import rose 7 → 8**, one more paid Google lookup, as the direct consequence
   of `W1-3` raising `MAX_CANDIDATES` so an eight-venue listicle survives whole.


---

## 1b. The four quality gates

| Gate | Verdict | Judged by | Evidence |
|---|---|---|---|
| **Q1** the walkthrough | **PASS with twelve findings**, four of them fixed the same night | `qa-reliability` | 42 captures, both gate viewports, 0/3/30/300 places; `overnight-harness-notes.md` §13 |
| **Q2** the demo runs clean | **COULD NOT BE RUN** | — | See below. Not a fail; an honest gap |
| **Q3** nothing over-claims | **PASS, all four claims** | `security-privacy`, which built none of the UI | [`overnight-q3-verdict.md`](overnight-q3-verdict.md) |
| **Q4** it feels alive | **PARTIAL** — the mechanical half passes, the judged half needs a person | `qa-reliability` | Motion traces, `overnight-harness-notes.md` §14 |

**Q2 is the one gate this run could not honour, and the reason is structural.** The 90-second demo
is a real TikTok fetch → oEmbed → an LLM call → a database write. This checkout has **no
`.env.local`** — only `.env.example` — and reading any `.env*` file is on the project's harness deny
list, which I did not lift. Docker is not running, so there is no local Supabase either. **A sequence
of stub-backed screenshots captioned "the demo" would have been a fabrication**, and the agent that
would have produced them said so before I had to. Q2 needs a real deployment, real credentials and a
person, and it is the first thing I would do in the morning.

**Q3 is the gate §8a says outranks the others, and the way it was judged matters.** The screenshots
could not answer its fourth claim: the candidate list is an internal scroll container, so the
`capped` card — the one the claim exists to check — is **below the fold in every capture at both
viewports**, and `--full-page` does not reach it. *A gate judged on what fits in the frame would have
passed the one card it was written for without ever seeing it.* A rendered-text probe was written
instead. `HEAD` then moved six commits mid-review, and rather than gloss that the judge proved the
entire import surface byte-identical across all three commits used, with a diff.

**Q4's mechanical half passes and its judged half does not close.** Press feedback exists on the
shared button, row and chip strings (`active:` 3 → 9, three named constants). Hovering a row lifts
its pin (`group/row` + `group-hover/row:`). Filtering fades rather than deletes. Pins land in waves —
measured against a *before* in which the map and its markers arrived in **one whole-surface fade with
zero visible change events after it**, i.e. no per-marker entrance at all. Under
`prefers-reduced-motion` everything collapses to opacity, and `motion-reduce:` went 10 → 1 (the
survivor is inside a comment). **What a trace cannot say is whether it looks good.** That needs a
person on a real device, and so does the 60fps half of W7-6 — software GL gives a ranking, not a
frame rate.

---

## 3. What was not completed, and precisely why

1. **Q2, the demo gate** — no credentials, no local database, and faking it was refused. Above.
2. **The 60fps-on-a-real-device half of W7-6** — no device and no hardware compositor here. What
   *was* measured is a comparison, and it retires a standing risk: with the sheet **open** over a
   live map at 390×844, the over-budget frame count is roughly **half** the sheet-closed count
   (67/73/61 against 123/130/123 over 16.7 ms), because the sheet covers half the viewport and
   **canvas area dominates blur cost**. `facelift-plan.md` finding 12's mechanism is real; the fear
   was misplaced.
3. **S1 — 300 places on a phone is an unreadable heap.** The top-ranked Q1 finding. There is no
   density handling inside the pin band and clustering was deliberately removed in `ac43eaa`. W2-1
   turned that screen from *one capsule* into *300 pins*, which is unambiguously better and still not
   good. The named repair is `growth-plan.md` §5.7's ~1.5 km neighbourhood band, which this run did
   not fund and which I refused to start unverified at 3am on top of the camera work that had just
   landed.
4. **Per-package independent verification did not run as §7 describes.** Two verification agents were
   dispatched and both went idle without reporting; I chased both twice. What replaced it: Q1's
   independent 42-capture walkthrough, Q3's independent verdict, the reliability agent's measured
   harnesses, and the lead reading **every diff as it landed** and photographing the visual claims.
   That is real independent evidence and it caught real defects — **but it is not the per-package
   ledger the protocol asks for, and the ledger's "verified by" column reflects that honestly.**
5. **`src/components/ui/map.tsx` was ruled out of scope** — 2,000 vendored lines holding 12 of the 25
   remaining hard-coded colours, two hand-rolled icon buttons and three unguarded `animate-pulse`
   dots. Opening it at 3am was the wrong trade. It is owed work.
6. **Landing and sign-in contrast is unscored in both themes** — their text sits on the `--brand-wash`
   gradient, which has no single background colour, so 74 of the sweep's 80 indeterminate elements are
   those two screens. They need a manual or pixel check.
7. **The live regions were specified, not consolidated.** The audit's "four `aria-live` regions doing
   the job of one" collided with a written decision that one of them is panel-local *on purpose*, and
   most of the nineteen `role="alert"` uses are inline field errors that belong where they are. I
   routed the ruling and told the build lane to touch none of them. Better four correct regions than
   one wrong one.
8. **Nothing merged**, as expected: CI still cannot start a runner, so `merge:pr` correctly refuses.
   No attempt was made and none should be.


---

## 5. Documents corrected, and what was wrong with them

| Document | What was wrong | Where it is fixed |
|---|---|---|
| `current-state.md` item **0a** | *"The home screen draws no pins."* **Understated.** At 0 places and at 300 the product showed the *same screen*, differing only by a number in a capsule | struck through, `80b4644` |
| `current-state.md` item **1** | *"Ownership transfer was never built."* **Understated.** The DDL says it is **unexpressible** — `owner_id` is not a grantable column, `service_role` holds no privilege on those tables at all, and a one-owner index plus a policy refuse promotion. Three independent controls | corrected, `80b4644` |
| `current-state.md` "Measured" | Tests recorded as 107 files / 1,959 | corrected to 148 / 2,489 on the branch; `main` unchanged at 114 / 2,017 |
| `current-state.md` | *"The product name is still open"*, and *"None of it is implemented"* | both false since 2026-08-30 / this run |
| `facelift-plan.md` **§4.6** | *"Archivo appears only in the wordmark."* Archivo was **retired the same day** by `brand-and-product-foundation.md` §3.1's second pass; the face is **Fraunces** | corrected, `80b4644` |
| `overnight-run-plan.md` §8 **W1-3** | *"Raise `MAX_CANDIDATES` **and** `GEMINI_MAX_CANDIDATES` to 8."* The Gemini cap was **already 8** — a measured model ceiling, bisected live, where `maxItems` 9–12 all return `400 INVALID_ARGUMENT` | recorded in the ledger |
| **K8's own command** | `grep -roh 'group-hover:'` cannot match Tailwind's **named-group** variant `group-hover/row:` — and the named form is the *correct* implementation, because rows nest inside other grouped containers on `/collections`, so a bare `group` would light up every row inside an outer hover | reported as met; command recorded as defective |
| **K14 as written** | *"Home shows the user's own pins at rest with ≥3 places"* is **unachievable** — no camera shows three continents and three pins | reported against `OQ-5`'s restatement |
| `ux-overnight-specs.md` Spec 2 **§2.0** | Proposes collapsing four button radii onto `rounded-md`. Written while `--radius-md` was undefined and those sizes rendered **square**; now that it is `0.875rem`, `rounded-md` would restyle them 10/12px → 14px | `--radius-xs` registered instead, `362c7a5` |
| `pin-mark.tsx` docblock | Claimed the silhouette *"reads as a crumb at 30px and above"*. **Measured false** — 4.6% peak-to-peak, under one pixel below ~50px | corrected by its author, `c2cd998` |
| `category-filter-bar.tsx` docblock | Claimed the clipped trailing chip *is* the affordance saying there is more. **Incidental** — it depends on where chip boundaries happen to land | corrected, `16e1fb3` |
| `handleDragEnd` docblock | Claimed MapLibre's keyboard handler pans through the same drag machinery. **False against the installed 6.4.1** — `handler/keyboard.ts` calls `easeTo` directly and fires no `dragend` | corrected, `0609efa` |
| `palette.ts` header | Read as though the CSS side were live. **No component read a `--category-*` token at all** — every category surface painted a literal through an inline style | corrected, `3b37bb1` |

**Re-measured, unchanged: CI still cannot start a runner.** PR #109's four jobs fail in **2–3 seconds
each** — `lint · typecheck · layer guard · unit`, `next build`, `playwright`, `migrations · RLS`.
A job that fails in two seconds having executed no steps never began. `ci.yml` is correct; the cause
is account-level. **No merge was attempted.**

---

## 6. The next three things

1. **Run Q2 on a real deployment, with a person watching.** It is the only gate this run could not
   touch, and it is the one that answers whether the thing is any good. Everything it needs exists:
   the flow works end to end, the rail is honest, the payoff is held, provenance reads at a glance,
   and the no-places screen is now a destination. **What is untested is the ninety seconds strung
   together**, and no amount of stubbing substitutes for it.
2. **Build the ~1.5 km neighbourhood band** (`growth-plan.md` §5.7). It is the fix for the run's
   top-ranked finding: 300 places on a phone is an unreadable heap. W2-1 made that screen show the
   user's library instead of a capsule; the third band is what makes it *readable*. It was
   deliberately not started at 3am on top of camera work that had just landed, and that was the right
   call — but it is the first real feature I would build.
3. **Sign the dark palette off against the running map, and settle the mark.** Dark is measured,
   reachable and following the device, with no toggle, exactly as §4 decision 3 requires — so signing
   it off is now a person looking at a screen rather than reviewing a document. The mark needs the
   same kind of look: the ratified outline is a circle at every size it ships at, the face carries it
   on chrome today, and only the owner can decide whether the silhouette changes.

**And one thing I would not do:** merge this before CI can run. The suite is green locally and
`verify` covers one of CI's four jobs. That is evidence, not a pass.
