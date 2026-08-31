# Iteration 2 — what was built, and what the instruments did

> **Written 2026-08-31**, closing the iteration opened by [`iteration-2-plan.md`](iteration-2-plan.md)
> after the owner smoke-tested the overnight run. Companion to
> [`overnight-run-report.md`](overnight-run-report.md), which records iteration 1.
>
> The owner's direction was: *improve the login page dramatically, improve colours, add more
> animations, add more colours, make it look sexy. The first impression is the login page. Then the
> wow effect is the home page, post-login.* Their second was: *i see a lot of gaps. look at the
> mascot look at everything.*

---

## 1. The finding that answered the complaint

**`src/components/brand/crumb-mascot.tsx` had zero call sites.** `globals.css` had zero
`@keyframes`. The animation hooks the markup builder emits — `crumb-eyes`, `crumb-mouth`,
`crumb-halo`, `crumb-spark-1/2` — were targeted by no stylesheet anywhere.

A complete, character-accurate rig existed: eight moods, six eye sets, seven mouths, five
constructions, seven specified animations. **One mood rendered** — `idle`, faceless, on three
surfaces. The import wait, the 7–34 second screen the design system reserves for Wobble, drew a
Lucide spinner.

That is the whole of *"the brand is totally missing"*, and it was found by a conformance audit
against `no-crumbs-design-system.html` — the 3,839-line document `overnight-run-plan.md` §2 item 10
instructed be **opened in a browser**, and which never was.

**The sequencing matters and the fault is the lead's.** The rig was not unfinished. It was
disconnected because the write scopes granted to the lane that built it contained the brand
directory and **none of the screens the moods were bound to**. The audit found something real; what
it found was the shape of the concurrency, not the shape of the work.

The generalisation, from the lane that held it: **"the rig has zero call sites" and "the rig is
unfinished" are indistinguishable from outside the lane that holds it.** An audit reading the tree
cannot tell a component never wired from one wired to nothing on purpose, and neither can a report
listing only what exists. *When a scope grant leaves something deliberately disconnected, say so in
the report that hands it back, with the surfaces it is waiting on named.*

---

## 2. What shipped

| | before | after |
|---|---|---|
| sign-in panel labels, dark | **1.18:1** | 0 AA failures, 120 strings, both themes |
| `/map` text | **14 AA failures**, never measured at all | **0**, 376 strings scored |
| mobile dead space | 27% / 36% pooled | 9% / 13–18% distributed |
| post-login list arrives | **2,430–4,526 ms** | ~19 ms restored |
| front door with hydration killed | **blank** — 0 of 7 controls visible | 7 of 7, identical to hydrated |
| reduced-motion entrance | ~700 ms | **145 ms** |
| night restaurant/café, deuteranopia | ΔE **3.1** | 17.6 (proposal A) |
| light restaurant/café, deuteranopia | ΔE **3.4** as specified | 21.2 as shipped |
| the import wait | a Lucide spinner | the character, with its trail |
| the no-places screen | no face | the neutral face, curvature-guarded |
| hex-literal budget | 25/26, and non-deterministic | re-tensioned, comments stripped |
| composition guard | matched the **word** `white` | matches the **pigment**, 6 notations |

**Two owner rulings**, both overriding a written rule, both recorded in `iteration-2-plan.md` §2.3:
gold admitted to the chrome grounds under indigo's fence, and the mascot admitted to the no-places
screen. Both landed fence-first or spec-first, deliberately.

---

## 3. Seventeen instruments lied, and they fall into four shapes

Iteration 1 recorded eleven. This iteration found seventeen more. **They are not eleven mistakes and
sixteen mistakes — they are one mistake with four shapes**, and naming the shapes is worth more
than the count.

### 3.1 A right answer to a neighbouring question

The largest family, and the most dangerous, because nothing looks broken. The sharpest statement of
it came from the lane that hit it three times inside one commit, twice in its own drafts:

> `pigmentOf` answered *"is this literal a colour"* when the caller asked *"is this utility named
> white"*. The string check answered *"is this value a colour"* when the caller asked *"does this
> value contain one"*. `cssBlock` answered *"the first block with this header"* when the caller asked
> *"the entrance's"*. **None was a wrong answer. Each was a right answer to a neighbouring question —
> which is why reading the regex could not find any of them, and running it found all three.**

That is why this family survives review. A wrong answer is visible in the code; a right answer to the
wrong question is only visible when you run it against a case whose answer you already know.

- **`drawImage` at `imageSmoothingQuality: 'high'` is not a box filter.** It reproduced a box
  average exactly on a 2:1 case and diverged by 19 in green on a 4:1 one — centre-weighted, which
  over-weights a pin's aperture against its ring, biasing the exact number being measured.
- **A curvature parser returned `0` for any path it could not read** — reporting *flat* for every
  shape it could not parse, on a test whose entire subject was flatness.
- **An unparseable background fell through an ancestor walk and returned white** — not "no answer",
  a confident wrong one, on a surface where white is the flattering assumption.
- **`vitest run | tail -3` cut off the summary line**, so the absence of a failure read as a pass.
  A truncated pipe is an instrument that cannot fail.
- **`addInitScript` serialises the function and runs it in the page — it does not capture Node
  scope.** A closed-over constant threw a `ReferenceError` on frame 1, the sampler stopped, and
  **every mark after the throw reported `never`.** The smoke run said the desktop panel never painted
  on a commit where it paints at 137 ms. An instrument that says *never* when it means *I stopped
  looking* is the truncated-pipe failure pointed at a measurement instead of a test result — and this
  one would have reported a **product defect that does not exist**, which is the direction that gets
  acted on.
- **`globals.css` has two `@media (prefers-reduced-motion)` blocks.** Taking the first match
  asserted the entrance's collapse against the mascot's rules — *"it failed loudly this time only
  because the selector happened to be absent; on a block carrying a similar declaration it would
  have passed silently."* A passing drift guard guarding the wrong block is worse than none.

### 3.2 A correct number answering a narrower question than its reader assumes

- **ΔE00 is blind to colour-vision deficiency.** The specified restaurant/café pair measured 21.1,
  above every floor in the repo, and **3.4 under deuteranopia** — the same colour for roughly one
  man in twelve.
- **`K12` counted "hex literals in eight prefixes" and was read as "untokenised colour."** It could
  not see `tracking-[`, which alone is larger than everything it counted — 110 arbitrary values in
  `.tsx`, 13 counted.
- **The composition guard matched the word `white`.** `bg-[rgba(255,255,255,0.55)]` passed while
  `bg-white/55` failed — identical composite, six characters of syntax apart. **The guard built in
  this iteration's P0 specifically to fix `K12`'s blindness had `K12`'s blindness.**
- **A hue-distance probe admitted unpigmented cream**, because the CTA is itself a pale mint, so it
  reported 12.3% of the ground "near the button" after every trace of mint had been removed.
- **A contrast probe sampled the card's own divider** and reported it as the card.
- **An edge metric said dark's card boundary was weaker** while dark plainly read better — true, and
  about the wrong thing: dark separates by shadow, glow and ground range, not by a step at the edge.
  *"A useful floor, not a verdict."*

### 3.3 Measuring something adjacent to the thing

- **A signature joined across `[data-entrance]` can never settle**, because one bloom is
  `repeat: Infinity`. First reading: 4,951 ms. Actual: 699–755 ms.
- **A line box overlapping a 1px rule no glyph touches.** `in Israel` reported 4.06:1; the offending
  pixels sat **four scanlines below the lowest pixel of any letter**. Real value 4.85. One bug
  produced three of seventeen reported failures.
- **44 of 84 text elements on desktop `/map` sit over the canvas and were never scored.** Not a
  wrong number — a hole where a measurement was assumed to be.
- **A mask of "where the render differs from a blank plate" erases itself** exactly where contrast is
  worst, because white text on a white ground differs nowhere.
- **`document.getAnimations().pause()` does not reach MapLibre's render loop.** Behind a translucent
  blurred panel sits a *moving map*; a mask read moving pixels as letters and reported 48 failures.
- **A spread in CSS pixels divided by a mean in supersampled pixels** — exactly 16× out. Without a
  square as a known-answer case, it would have reported that a square is round.

### 3.4 And the reason all of this is hard to catch

The instrument built to close §3.1's blind spot **needed three wrong rules before it was right, and
all three looked obviously correct**:

1. *Any non-`visible` overflow clips.* The nearest such ancestor on `/map` is the scrolling desktop
   panel, so every row below the fold read as clipped by up to 1,004 px — **30 elements, up to 2,603
   device pixels, not one of them a defect.** Caught by the asymmetry heuristic: numbers in the
   thousands where the defect is a descender.
2. *Exclude anything where `scrollWidth > clientWidth`.* That is the definition of `truncate`. It
   excluded the entire population the tool exists to examine and reported a confident **0**.
3. *Exclude anything where `scrollHeight > clientHeight`.* The subtle one: **an element whose ink is
   shaved has `scrollHeight > clientHeight` precisely because it is being shaved.** The test cannot
   tell a scroll container from its own quarry, and it excluded the bottom nav — the defect that
   prompted the tool.

The rule that survives is the computed value itself: `hidden` and `clip` shave, `auto` and `scroll`
hand the reader a way to see the rest. Nothing else in the DOM separates them.

**Rules 2 and 3 were caught only because a known answer already existed** — a defect another lane had
already found. Rule 1 was caught by the asymmetry heuristic. **Neither a self-test nor the product
would have found either**: the tool would have reported *0 clipped elements* and that would have read
as good news.

> **An instrument is most dangerous on the first run where nobody knows the answer — which is every
> run that matters.**

That is the fourth shape, and it is the one that makes the other three survivable only by accident:
a self-test covers the cases you thought of, a diagnostic tells you where it looked, and a known
answer catches the rest — but the run you actually need the instrument for is the one with no known
answer in it.

### 3.5 The one that is not an instrument

**A perceptual bias, and it will recur regardless of tooling.** Twice, a warm element on a dark
ground was called near-invisible from an impression, and twice the measurement contradicted it. Both
times the error was the same, and the correct statement of it is narrow:

> The failure was not *using the neighbour* as a reference. It was **reaching for a comparison
> reference to answer a legibility question.** *Can this be seen* is answered against what is
> immediately behind the thing. *Can these two be told apart* is answered against the neighbour —
> and a rule saying "never use the neighbour" would break the pin and colour-vision measurements,
> which are the two that went right.

---

## 4. Four rules worth keeping

**When a number moves, check whether it moved everywhere or in one place.** A product change moves
numbers on the surfaces it touched. An instrument change moves them on surfaces with a particular
*physical* property — a canvas, a blur, a gradient, an animation — and those cut across features.
48 failures was suspicious not because it was large but because four surfaces were bit-identical
while one went 4 → 30.

**And the corollary nobody applies: an instrument change that improves things everywhere at once
deserves the same suspicion, because a number falling looks like progress.** Iteration 1's
"11 → 0" was exactly that shape and it survived a full report cycle for exactly that reason.

**Put the number in the sentence that names the defect, or say the sentence is unmeasured.** Not
*"the keyline is near-invisible"* but *"the keyline reads faint to me on the dark card; unmeasured."*
Both are true; only the second lets a lead route it as a question rather than as a fix. **A value
labelled as an accessibility fix gets defended differently from one labelled as a drawing
correction.**

**A guard-verification method is only worth having if it can catch bugs in the guard being
verified.** The appended-line method caught two bugs in the composition guard in its own author's
hands, and a third in the drift guard. Neither was visible by reading the regex.

**Never buy a new floor by quietly regressing an old one.** An optimiser handed a budget spends it:
released to find colour-vision separation, one sweep returned all six basemap inks as the same teal,
and the best figure it offered existed only by dropping a normal-vision floor that already shipped.
The number that survived constraint was 8.8, not the 10.3 first reported. **An instrument that
improves a number by relaxing an unnamed constraint is the flattering-direction case again** — and it
is hardest to see inside your own optimisation.

**A predicted number and a measured number look identical once they are written down.** Four
percentages in a commit body were arithmetic done *before* the after-frame was rendered, sitting
among figures that were all measurements — nothing distinguished them, and they were wrong. They were
caught by recomputing from the JSON rather than by re-reading the prose. The fix is not more care at
writing time; it is recomputing from data at reading time.

**A thin margin reported on one element is a *biased* sample, not a small one.** A row clearing AA
by 0.07 turned out to be eight strings tied at that value — the whole secondary layer of the place
panel — and the token's actual worst case was a **failure** at 4.30 on a ground no visited screen
showed. The eight tied strings were findable from the report; the failing ground was only findable by
enumerating what the token actually lands on. A margin is biased toward the surfaces the harness
happens to walk.

**Repeated local workarounds are evidence of an unmoved root cause — and the workarounds may still be
right.** One token was compensated for twice without being moved: a panel opacity went 0.86 → 0.92 →
0.95, each step correct and documented. But 0.95 remains correct *after* the root cause moved,
because the second raise had an independent second reason. **The pattern says go look for a root
cause. It does not say the compensations were wrong**, and using it that way would delete good work.
The notes were annotated rather than reverted for exactly this reason.

**A clean number with its limits stated beside it is worth more than a clean number.** *0 failures
at `214bb0f`* is a statement about 376 scored strings — not about the 78 rows below the fold, the 12
occluded, or the six that were **not measured rather than passed**.

---

## 5. Recorded reasoning went stale five times

Four in documents and **one in code**, which is what makes it a general finding rather than a
documentation problem. Every one was correct about the case it was written against and wrong about
the case that now exists — the same shape as §3.2, arriving on a specification instead of an
instrument.

1. **The café colour argument** describes `#8A5A3B`, a value iteration 1 had already retuned away.
   Worse: the value the document *draws* fails the repo's existing colour-vision guard.
2. **The map pin's "white aperture"** is a light-theme assumption; the shipped ground-coloured
   aperture is right.
3. **`#styles`' Night construction** — *"deeper keyline so the edge does not glow"* — protects
   against a keyline too light on the night **map**. On a dark **card** there is no glow to prevent
   and going deeper removes the edge. Wiring it as instructed would have made the reported defect
   **worse by ΔE 9**.
4. **`#mark`'s "legible blob at 16px"** is measurably false for the faceless silhouette. At 24px the
   entire crumb-ness of the crumb is **0.547 of a pixel**; it is indistinguishable from a true circle
   up to 64px.

5. **The default list scope was a flat constant**, and its recorded rationale — *the camera opens on
   the whole library, and naming one city over a view of countries is the broken control the owner
   rejected* — is **still true**. Its *premise* went stale: the opening view is not a view of
   countries for the normal library, because the camera fits the library's own box and one city fits
   deep in the pin band. The header said `3 places in Israel` over a street-level view of Tel Aviv,
   and the map's accessible name said it too. **Nothing in the chain was broken; the composition was
   wrong**, which is why it was findable only by driving the product and not by reading it.

**The prospective form of this is cheap and was used once.** `docs/evidence/map/`'s coastline
specification states that its own frontier table is measured against a bound with 0.005 of headroom
that has already moved once mid-task, and instructs whoever builds it to **re-run the sweep rather
than trust the table**. A document that names the conditions under which it decays is the only kind
that does not quietly become one of the five above.

**Two rules were re-recorded rather than merely overridden**, because a rule stated as a measurement
decays when the measurement moves. §3.1 rule 3 became *"gold and category colour never share a
surface"* — a statement about surfaces, which is what the fence enforces, and which stays true once
the night café moves to within ΔE 6.3 of the gold *by design*.

---

## 6. Still open

- **The wordmark over the live map** — `#wordmark` forbids it in terms and names an alternative;
  `voice-and-vocabulary.md` §2 makes it surface 1 of six, and this product's signed-in shell *is* the
  map. No measurement settles it. **Owner's.** The lockup on `/collections`, `/collections/<id>` and
  `/profile` is deliberately unbuilt behind it.
- **The night category pair**, proposal A applying.
- **Visited pins at `icon-opacity: 0.45`** collapse to deuteranopic ΔE 3.6 — a property of the fade,
  not the palette, so the light-side repair does not reach it.
- **Colour-vision separation on the basemap labels tops out at ΔE 12.0** even with the lightness
  ceiling released — a **mitigation, not a fix**. Getting past it needs the *pins* to move.
- **`Saved N ago` clears AA by 0.07**, inside the measuring instrument's own error bar. *Not fixed so
  much as no longer failing.*
- **Two tag chips report no glyph inside their padding box** in either theme — a layout defect that
  scored as a pass under the old instrument.
- **`#moods`' `beenThere` contradicts `#rules` rule 4.** Data-only and asserted so, pending a ruling.
- **The entrance does not run to the owner's table, and the gap is larger than the defect just
  repaired.** Ruling 2 puts the wordmark at **1100 ms**. Measured, it lands at **2907–4934 ms**, with
  the 4 s `ENTRANCE_CLOCK_FLOOR_MS` firing on some runs. The cause is that **the entrance's zero is
  1.5–3 s away**: under `prefers-reduced-motion` the clock starts at framing with no lift and the
  wordmark lands at **224–311 ms**; under no-preference the camera `jumpTo`s 2.6 zoom levels out and
  waits for the first `idle` — a fresh tile set over roughly 6× the ground area.

  That the lift costs a tile round trip is a **hypothesis nobody isolated**; the 224 ms against
  2907 ms gap is measured. The product is *usable* throughout — the list now paints at 124 ms — so
  this is fidelity rather than a defect, but it means the choreography the owner approved is not the
  one that plays. It lives in `map-surface.mapcn.tsx:beginEntranceDescent`, and it is the next lever
  on this surface.
- **The harness can only measure a commit, and that is a tooling gap that manufactures bad history.**
  `verify-i2.mjs` exports a commit rather than a tree — correctly, since measuring a shared working
  tree is what this run proved worthless. But it makes a throwaway commit the cheapest path to a
  measurement, and it produced one (`0fa25ab`, subject `wip: token probe`, unamendable within the
  minute because two lanes landed on top). Two lanes hit this friction; the other worked around it by
  building and serving two commits simultaneously.

  **The fix is harder than "copy-out instead of `git stash`"** — `stash` is deny-listed, so copy-out
  is the mechanism, but a copy-out reproduces the tree *including* what is uncommitted, which under
  concurrency means every other lane's half-finished work. Measuring that is precisely the thing the
  commit requirement exists to prevent. So it needs copy-out **plus a way to declare which paths are
  yours**, or the tool trades an honest history for a dishonest measurement. That is a design
  decision, not a mechanism, and it is cheap at the start and expensive to retrofit.

---

## 7. Coordination failures, all the lead's

Six, and they are recorded because the concurrency rule is what made the rest of this work.

1. `globals.css` granted exclusively to one lane, then a second sent into it. Resolved by timing,
   not by design.
2. `src/components/brand/**` granted to two lanes at once — twelve TS errors.
3. A small request bundled under a large ruling and lost, blocking a lane on a five-minute token.
4. **A wrong file path in a scope grant, given to two lanes.**
5. A test file reassigned without reconciling an earlier standing instruction to write into it.
6. **Write scopes that left the mascot rig connected to nothing** — the most consequential, because
   the other five cost minutes and this one had the owner believing the brand was missing from a
   product that already contained every piece of it.

A seventh — misattributing an untracked harness file to the wrong lane — is **deliberately not
counted with the others**, at that lane's own insistence, and the distinction is the useful part. The
wrong path was a claim about the tree that a read would have settled. Authorship is not in the tree:
**`git status` carries no author for an untracked file**, so the inference was the only signal
available, and it was reasonable and wrong. What settled it was the file's header saying *"I"* and
meaning someone else — a convention, not a mechanism. The cheap fix is a convention rather than a
caution: **an untracked file in a shared directory should name its lane in its header**, so the next
dispatcher reads instead of infers and the read returns an answer. **With a limit, or it decays into
ceremony**: the line earns its keep only while the file is untracked. Once it lands, `git log`
answers authorship better than a header can, and a header claiming an owner will be wrong the first
time somebody else edits it — which is §5's failure exactly, recorded reasoning going stale because
the world moved and the prose did not. Name the lane while untracked; let the line go when it lands.

Two lanes lost scratchpad tools to filename collisions before a naming convention was set. Three
times a lane reported a red working tree caused by another lane's in-flight work; each report was
worth having, because *a red tree for a non-defect reason is how someone reaches the wrong
conclusion ten minutes later*.

**What worked**: every lane staged explicit pathspecs, so no lane's work ever entered another's
commit. That single discipline is why six scope errors cost minutes rather than a day.
