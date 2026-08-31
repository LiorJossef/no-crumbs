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

97 commits. **88 files changed under `src/`** (+10,167 / −2,782) and **60 under `tests/`**
(+8,087 / −143). Thirteen specialists dispatched across nine waves, four build lanes running
concurrently against one shared working tree.

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
| **K3** | Tests ≥ 2022 | 2017 / 114 files | **2411 / 142 files** | **met** |
| **K4** | `@theme` keys ≥ 60 | 36 | **88** | **met** |
| **K5** | Arbitrary values ≤ 60 | 166 | **17** | **met** |
| **K6** | Raw `var(--mint-N)` ≤ 10 | 75 | **0** | **met** |
| **K7** | `active:` ≥ 3 shared class strings | 3 | **9**, three shared constants | **met** |
| **K8** | `group-hover:` > 0, coupling works | 0 | **5** — see the note below | **met** |
| **K9** | `motion-safe:` > 0, every animation has a reduced arm | 0 | **41** | **met** |
| **K10** | `loading.tsx` for three routes | 0 | **3** | **met** |
| **K11** | Four brand asset files | 0 | **4** | **met** |
| **K12** | Zero hard-coded colours added | 26 | **24** | **met** — went down |
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
