# Iteration 2 — the first impression, and the moment after it

> **Written 2026-08-31 after the owner smoke-tested the overnight run.** Three defects below were
> measured in a running browser at 1440×900 in dark, not inferred. The design direction is the
> owner's, given verbatim: *improve the login page dramatically, improve colours, add more
> animations, add more colours, make it look sexy. The first impression is the login page. Then the
> wow effect is the home page, post-login.*
>
> Companion to [`facelift-plan.md`](facelift-plan.md), which this does not replace. Iteration 1's
> record is [`overnight-run-report.md`](overnight-run-report.md).

---

## 1. What iteration 1 missed, stated as one thing

**We tokenised colour and never tokenised composition.**

Every alpha, every tint percentage and every `white`/`black` literal in the codebase was tuned
against a warm near-white ground and carried into dark unchanged. `K12` counted hex literals, so it
was structurally blind to all of it — and the W7-6 contrast sweep marked landing and sign-in
**indeterminate** because their text sits on a gradient, which is exactly where the worst instance
was hiding. The run report records that gap in §3.6. It did not connect it to a defect.

Three consequences, all measured in a running browser:

### 1.1 The sign-in panel is unreadable in dark — **1.18:1**

`src/app/sign-in/page.tsx` paints the form panel `lg:bg-white/55`. Over `#131312` that composites to
`rgb(149,149,148)`, and against it:

| element | measured | AA needs |
|---|---|---|
| `EMAIL` / `PASSWORD` / `Remember me` labels | **1.18:1** | 4.5 |
| body ink | **2.68:1** | 4.5 |
| the mint `Sign in` CTA | **2.25:1** | 3.0 (non-text) |

This is the product's front door, in the **default** theme for any viewer whose OS is dark — not
behind a toggle, because there is no toggle. `src/app/page.tsx` carries the same literal.

### 1.2 The brand appears on no signed-in surface

`PinMark` is imported by `/`, `/sign-in`, `error.tsx`, `not-found.tsx`, `global-error.tsx` and the
collection-join screen — **every surface except the product itself**. Sign in and No Crumbs
disappears.

And this is not a new idea: `voice-and-vocabulary.md` §2 lists six surfaces the name may appear on,
and **surface 1 is "the shell header wordmark."** It was specified before iteration 1 started and
never built.

### 1.3 The row discs are near-black

`color-mix(in oklab, var(--category-*) 12%, transparent)` over `#201f1c` resolves to
`rgb(56,41,36)`. On a white card 12% of a colour is a soft tint; on near-black it is nothing. The
disc reads as a grey circle with a coloured ring rather than as a category.

### 1.4 The seven literals, in full

`bg-white/55` ×2 (`sign-in`, `page`) · `bg-black/40` ×2 (`bottom-nav`, `add-sheet`) · `text-white`
×2 (`candidate-card`, `rail-screen`) · `border-white` (`ui/map.tsx`). None is visible to `K12`.

---

## 2. The design position

The owner's direction and the design system's restraint are not in conflict. **We applied the wrong
rulebook to half the product.**

> **On the map, colour is data and motion misleads.** A café is brown because it is a café; a pin
> that moves is saying something happened. `facelift-plan.md` §3a's closed list of nine and the
> sentence *"everything else stays still"* are correct **for the data surface** and stay.
>
> **Everything else is chrome** — sign-in, landing, the empty state, the shell header, the import
> moment, the edges. There we rationed colour and motion that cost nothing and buy everything.

That is why the login reads flat. Not under-designed — designed by the map's rules.

**Iteration 2 splits the system in two and spends its boldness entirely on the chrome half.**

### 2.1 What this permits, and what it still forbids

| | chrome | data |
|---|---|---|
| Colour beyond mint | **yes** — a second accent, gradients, depth | no; category colour is the encoding |
| Motion beyond the nine | **yes** — an entrance, an ambient field, a signature moment | no |
| Gradients and glow | **yes** | never on a pin or a basemap layer |
| The name | six surfaces per `voice-and-vocabulary.md` §2 | never |

**Still forbidden everywhere, and iteration 2 does not reopen these:** no change may increase what
the product asserts · no invented confidence number · category colour keeps meaning what a place is
· every user-facing string obeys the voice document · `prefers-reduced-motion` degrades everything
to opacity and stays usable.

---

## 2.2 Two owner rulings, 2026-08-31 — both override a written rule, so both are recorded here

**Ruling 1 — a second brand colour enters, on chrome only: electric indigo `#5B6CFF`.**

This overrides `brand-and-product-foundation.md` §3.1 rule 3, which reads *"Mint stays the only brand
colour; gold belongs to the mascot alone; the two never share a surface."* The owner's direction was
*add more colours*, and the alternatives were put to them: mint-only depth, or the mascot's gold split
across surfaces. **Indigo was chosen and the rule is knowingly set aside for chrome.**

The constraint that makes it safe, and it is the reason indigo rather than a warm accent: it collides
with **none of the three category hues** — restaurant coral `#E8735C`, café amber `#C99A55`, bar
lavender `#A288E0`. A warm accent would have sat a few degrees from the café amber, which is the exact
collision §3.1 rule 3 was written to prevent. So the rule's *reasoning* is honoured even though its
letter is not.

**Where indigo may go:** the sign-in and landing grounds, their gradient mesh, the empty states, the
edges. **Where it may never go:** any pin, any category surface, any basemap layer, the filter chips.
The map keeps meaning what it means.

**Ruling 2 — the post-login moment is the full choreography.**

`pins.land` and the reveal-into-flight already exist and fire on import-confirm only, so a fresh
sign-in simply arrives. The owner chose the full sequence over a camera-only version or none:

| | |
|---|---|
| 0 ms | overlay holds, map mounted beneath |
| 200 ms | camera begins its descent from altitude |
| 600 ms | ground settles at the library's own box |
| 700 ms | pins land — eight waves, 60 ms apart |
| 900 ms | sheet rises to its stop |
| 1100 ms | the header wordmark fades in |

Under `prefers-reduced-motion` the whole sequence collapses to a single 140 ms opacity fade and stays
legible — §3a's rule that the nine collapse *to the opacity change, not to nothing*.

**The honesty constraint this does not get to break:** the camera must land where the real framing
puts it and the pins that land must be the real pins. An entrance is chrome, and chrome may be
beautiful — but it may not imply the library is bigger, closer or better resolved than it is, and it
may not delay the map being usable.

**That last clause was enforced against this ruling on 2026-08-31, not merely quoted.** Independent
measurement found the choreography delayed the desktop place list from 19 ms to **2,430–4,526 ms**:
`map-shell.tsx` did not *hide* the sheet and panel until `listArrived`, it did not **mount** them —
and the entrance's clock starts at the camera framing (~1.5 s), a term the table above does not
contain, so the 900 ms beat landed at ~2.4 s. Fixed in `752d61e`; the sequence was not shortened,
because the ruling approves it. **Content that depends on JavaScript to become visible is content
that is conditionally absent** — the same defect was then found in the sign-in screen's server
render, one layer up.

---

## 2.3 Four further owner rulings, 2026-08-31 — each overrides a written rule, so each is recorded here

**Ruling 3 — the mascot's gold is admitted to the chrome grounds.**

This overrides `brand-and-product-foundation.md` §3.1 rule 3 a second time, after indigo. Light mode
had no warm pigment it was permitted to use and read grey; the alternatives put to the owner were
keeping the rule and accepting that, or commissioning a new pigment.

**Where gold may go:** the sign-in and landing grounds, their gradient mesh, the empty states, the
edges. **Where it may never go:** any pin, any category surface, any basemap layer, any filter chip —
the identical fence indigo carries, and it is now a **test** rather than a promise (`fffd985`,
directory-scoped, matching hexes by *value* so a pasted `#f2c46b` in a paint expression is caught
without mentioning the mascot anywhere).

The rule's *reason* is honoured rather than merely set aside, and the measurement is why the ruling
could be granted narrowly: gold is **102°** from mint — it cannot repeat the CTA collision that
`0f23b38` fixed — but only **6°, ΔE 17** from the *night* café, which is closer than the
restaurant/café pair the facelift retuned for being confusable. `/sign-in` and `/` carry **no
category colour at all**, so on the surfaces where gold is admitted the collision is measurably
impossible.

**Rule 3 is re-recorded, and this is the substantive part.** It read as a claim about hue distance.
Once the night café moves to `#FEB843` (ΔE 6.3 from `MASCOT_GOLD`) that distance becomes *intentional*,
so the old wording would preserve a reason that had stopped being true. It now reads:

> **Gold and category colour never share a surface.**

A statement about surfaces, which is what the fence enforces and what stays true whatever the
palettes do.

**Ruling 4 — the mascot appears on the no-places screen.**

This overrides `spec-no-places-found.md` §4.4, which forbade an empty-state mascot **by name**, in the
document that screen's own code calls authoritative — and which a **passing unit test** already
enforced. The status quo was therefore a decision someone had made executable, not an accident of
prose, and the owner was told so before ruling.

The design system contradicts itself here: `#moods` binds `nothingFound` to this screen's headline
word for word, while `#ship` lists the spec as "No change" and `#apps` **declines the identical move**
on the map's empty state. At a ~27% hit rate this screen is the *modal* import outcome rather than an
error path, which is what carried the ruling.

**Landed as three uncommitted-together commits, in this order and deliberately not collapsed:**
`bf85ffb` amends the spec, `2d02ade` moves the guard alone, `853b6a0` builds the face. Amending the
document *first* is the point — fixing the code while the spec still forbade it would have rebuilt the
original defect one level down, which was a spec whose enforcement outlived the agreement behind it.

**The conditions the ruling was granted under, and they bind whoever touches this next:** the face is
inline with the kicker, never a centred illustration, so §4.4's stated reason — *type, one hairline,
one field, one caption panel* — stays a true sentence; `'Illustration'` still asserts, so the ruling
is a narrow exception rather than a hole in §4.4; and **the face must not perform sympathy.** A rueful
expression is the product being charming at the user about its own failure, which is precisely what
§4.4 existed to prevent and was the strongest argument made against this change. The neutral mouth
measures zero curvature and every other stroked mouth is ≥ 3 away — asserted, because four units is
too small to leave to a reviewer's eye across a retune.

**Ruling 5 — the theme is the user's choice, and it is a setting on `/profile`.**

> *"add theme toggle (profile settings)"*

This overrides `facelift-plan.md` §4 decision 3 — **no dark-mode toggle: a signed pass, or none** —
and §4 of this document, which repeated it as *"the signature is still the owner's."* **The owner
asking for the control is that signature**, and it is being read as one rather than as an
instruction that skipped a gate, because the pass the decision was waiting for has since been run:
measured on painted pixels at `0fa25ab` with `contrast-render.mjs` (12/12 known-answer cases),
**both themes score 0 AA failures across 464 scored strings**, and the thinnest margin in the
product moved from 4.57 to 4.78. I2-1 and I2-2 are what bought that. The palette is worth exposing
now; before them it demonstrably was not, which is the whole content of decision 3.

**The one constraint that came with the ruling, and it is not a matter of taste: three states —
light, dark, system — never a two-way switch.** `src/lib/theme.ts` already stores
`'light' | 'dark' | 'system'` and defaults to `'system'`, and the reason the third value exists is
that it is **not a third appearance** — it is the absence of a choice. A binary toggle has nowhere
to put it, so its first press writes a resolved `'dark'` over "follow my device" and nothing reads
`prefers-color-scheme` for that person again. The loss is silent, permanent, and reaches only the
people who touched the setting once. It ships green.

So it is a radio group over `THEME_PREFERENCES`, which is also what the codebase already
recommended: `nextPreference`'s docblock — written for the two-state flip, and still uncalled —
says *"'follow my device' is a thing you choose once from a menu rather than something you land on
by pressing a button twice."* The ruling and the recorded reasoning agree; this is the one place in
this iteration where a document was found to be **ahead** of the change rather than stale behind it.

**What was verified, in a browser, and what could not be.** 46 checks at 390×844 and 1440×900 in
both device schemes: the explicit choice beating the device, the return to `system`, the live
`matchMedia` subscription with no reload, cross-tab propagation, `ArrowRight` moving the choice, a
44px target, `.dark` on the root at `DOMContentLoaded`, and **no highlight at all in the server
render** — because the preference is `localStorage`, the server does not know it, and painting the
default would put the highlight on *System* for a user whose choice is *Dark*. An empty control is
not a lie and a wrong one is.

**The residual, recorded rather than worked around: with JavaScript disabled the product renders
light whatever the device says.** The control hides itself there, because it cannot function — the
preference is `localStorage` and the class is written by a script. Closing that needs either a
`@media (prefers-color-scheme: dark)` block in `globals.css` or a server-read cookie in
`app/layout.tsx`, and both are single-writer files held elsewhere. It is a one-file change whenever
someone owns that file, and it is not a defect in the control.

**Ruling 6 — the mascot is on the main page.**

> *"the branding mascot should be part of the platform, main page"*

This settles a conflict the documents had with each other and could not settle themselves, which
`iteration-2-record.md` §6 lists as **still open, owner's**. `no-crumbs-design-system.html`
§`wordmark` forbids the lockup over the live map in terms — *"the map already carries pins in four
colours and a wordmark on top of it is noise"* — while `voice-and-vocabulary.md` §2 makes the shell
header wordmark **surface 1 of six**, and this product's signed-in shell *is* the map, so there was
never a header to put it in.

**It is closer to `#wordmark`'s own alternative than to an override of it.** The document objects to
a **logo bar** and, in the same sentence, offers the thing that belongs there instead: *"if the map
needs the brand, it gets **the mascot** in the corner of the empty state, not a logo bar."* What
ships is a 44px corner chip, `pointer-events-none`, the mirror of the account chip opposite. The
`empty state` half of that sentence is the part being set aside, and it is set aside for a reason
the sentence could not have known: a user with places would see no brand at all, which is the
complaint the ruling answers.

**Two measurements decide the mark. One of them contradicts a number in a document; the other
contradicts the eye estimate that was in this ruling's first draft.**

**Measurement 1 — `mono` is not an option at any size that fits a 44px chip.** The silhouette is a
filled disc at 20, 22, 24, 26, 28, 32 **and 36 px**, photographed at 1:1 CSS pixels in both themes.
That is the 0.547px finding of 2026-08-31 arriving from the other side. Every value `currentColor`
could take is ink — a grey disc, which is the mark removed that morning rebuilt in a different
shade — or a brand/category hue, and mint is out on its own terms because the uncategorised pin is
mint-family. **"Mascot on the main page, no gold" resolves to "a grey disc."**

**Measurement 2 — the face reads far smaller than anyone estimated, including me.** This ruling's
first draft carried an eyeballed table claiming *"a smudge to 24px, eyes separate at 26–28 with the
mouth still closed up, reads at 32."* Measured, that is wrong: the mouth clears bar from **22px**
and the eyes resolve as two objects from **20px**, the smallest size tested.

The instrument rasterises the **real** `crumbMascotMarkup` output — the modules loaded unmodified,
nothing re-transcribed — against two conditions fixed before anything was rendered: **feature
contrast ≥ 3:1** (WCAG 2.2 SC 1.4.11, the bar for a graphical object that must be perceived to
understand the content, measured locally so shine/blush/crust are handled by geometry) and **the
eyes stay two objects** (ink fraction peaks ≥ 0.5 in each eye and falls < 0.5 between them).

| CSS box, 1× | left eye | right eye | mouth | two eyes? |
|---|---|---|---|---|
| 20 px | 5.75:1 | 5.64:1 | 4.07:1 | yes |
| 22 px | 6.10:1 | 7.14:1 | 3.57:1 | yes |
| **26 px — the size asked about** | 9.68:1 | 8.47:1 | **4.67:1** | **yes** |
| **32 px — shipped** | 9.68:1 | 8.47:1 | **7.26:1** | yes |
| 40 px | 9.68:1 | 8.47:1 | 8.35:1 | yes |

At 2× and 3× every row is at the 8.47:1 ceiling from 20px. **So the argument does not collapse — it
strengthens**, and 32px ships as a judgement inside a passing range rather than as a measured floor:
the mouth is the weakest feature, 26px leaves it at 4.67:1 against a 3:1 bar where 32px has 7.26:1,
and 32 is `CRUMB_FACE_MIN_PX`, so shipping it re-argues no constant the repository already holds.
That constant is now known to be **conservative** for `outlined` on a card ground; it is the
app-icon row's number and a corner mask is the harder case.

`#wordmark`'s *"at the shell header the mark sits at 22px"* is **not** where 32 came from. It is the
same paragraph family as `#mark`'s *"legible blob at 16px"*, which §5 of the record lists as
measurably false; it happens to be survivable for a *faced* mark, which is two questions landing
near each other rather than the document being right. **Re-run the ladder before taking a size from
it.**

**The instrument was wrong first, in the shape §3 already names, and that is worth recording.** Its
first version sampled the gap between the eyes in a **fixed number of device pixels** (±4). At a
26px box the eye centres are five device pixels apart, so the loop iterated **zero times**, left its
`gapMin` at the initialiser, and reported *"eyes merged"* for every size below 40px **without having
read a single pixel between them** — a confident table, six passing known-answer cases beside it,
and an answer produced by an empty loop. It was caught by asking why 26px would fail when the
geometry says the gap is 2.5 device pixels wide. The windows are now derived from artboard units,
and a new known-answer case asserts that a *merged* verdict has sampled at least one pixel: **an
instrument that can only say no is not measuring either.**

**The reason this ruling was granted for was overstated, and the narrowing is recorded here rather
than edited away.** It was granted on: *a faceless gold disc would be ambiguous with a café pin, and
a faced one cannot be.* Photographed against a real café pin in the same frame on the night map,
that claims more than it can carry — and it names the wrong mechanism.

**Measured off the photograph rather than off the tokens** (390×844, dark, `9a95444` + the chip):
the mascot's modal body is `#F2C46B`, the café pin's is `#C99A55`, rendered ΔE00 **11.7** — the
paint matches the token arithmetic exactly. **26** of the mascot's ~1100 body pixels fall within 18
RGB units of the café token, against **1903** of the pin's, and those 26 are crust shading.
Near-neighbours, **not the same colour**; the two objects do not merge. Token distances for the
record: gold is ΔE00 11.5 from the light café, 11.7 from the night café, 29.7–61.0 from every other
category colour, closing to 6.3 if the night café moves to `#FEB843`.

**What separates them is the tail and the card ground, not the face.** A faceless gold disc in this
chip would also not be mistaken for a pin — pins have points, and this one sits in a pill beside a
wordmark. It would simply be **meaningless**, which is measurement 1's argument and **not** a
disambiguation argument. The two must stay apart in the record, or the next reader takes the face
for a safety measure when it is a legibility one.

**The narrow claim the face does earn is about the aperture:**

> The category pin carries a ground-coloured aperture — a single dark mark, sitting almost exactly
> where a face would be — so the pin is itself faintly face-like. *Two warm circles each carrying
> one dark mark* would be the ambiguous pair. A real face, two eyes and a mouth, is what makes the
> mascot unmistakably a **character** rather than a pin drawn differently.

That is a claim about **shape**, which the colour merely sets up, and it is the one the pixels
support. It also survives the night-café proposal closing the gap to ΔE 6.3, because a narrowing
colour distance does not touch it. **The ruling holds; only its stated reason changes.**

**The fence's scope was read before the ruling, and it excludes this file deliberately.**
`chrome-tokens.test.ts:285` and `:339` scope it to `components/map/`, `ui/place/` and anything
containing `basemap` — the pins, the category palette, the tiles. **That is the data layer, which is
what ruling 3 fenced.** `src/app/map/` is route composition and sits outside it by design rather
than by oversight, which is what makes "it touches card, not tile" hold in the guard as well as in
prose. `crumb-mascot.test.ts`'s own rule-5 check names two files and covers neither. Recorded in
terms so the next reader of that directory finds the reasoning instead of inferring a hole — this
project's most-repeated failure, and it costs one sentence. **The permission is the ruling; a
guard's silence is not evidence either way.**

**And the ruling admits the mascot to one chip on one route, which is now asserted.** The argument
above is about a single element and does not generalise: a mascot behind the sheet, beside the
account chip or on the post-import strip would each need this reopened, and none of them would fail
the fence. `shell-wordmark.test.ts` counts `<CrumbMascot` across every `.tsx` under `src/app/map/`
and requires exactly one, in `shell-wordmark.tsx` — verified failing against a second file before
being trusted.

**And the guard that should have caught the mark's return did not.** `shell-wordmark.test.ts`
asserted `not.toContain('PinMark')` and `not.toContain('<svg')` under a docblock reading *"no mark
comes back into this lockup without the ruling being reopened"*; a `<CrumbMascot>` is neither
spelling, and the assertion passed unchanged through the change it existed to stop. It is now
pointed at the decision — the character may be here, the faceless disc may not, in any spelling —
and it was made to fail against `construction="mono"` before being trusted. This is §3's *matching a
spelling while being read as matching a value*, arriving on a guard instead of on an instrument.

---

## 3. The packages

Nine, in dependency order. **P0 is not design work** — it is the foundation, and no palette can be
judged through a 1.18:1 panel.

### P0 — composition tokens · *blocks everything*

| ID | Package | Exit criterion |
|---|---|---|
| **I2-1** | **Retire the seven theme-blind literals.** Introduce `--scrim`, `--panel`, `--panel-blur` and a `--tint-strength` that differs per theme. `bg-white/55` becomes `bg-panel` | `grep -rE '\b(bg\|text\|border\|from\|to\|via\|ring\|fill\|stroke)-(white\|black)(/[0-9]+)?\b' src --include='*.tsx'` returns **0**, and a test asserts it stays 0 |
| **I2-2** | **Make tint strength theme-aware.** The 12% that reads as a wash on white needs ~22–28% on near-black. One token, every category surface reads it | The row disc, the chip dot and the profile swatch are visibly the category's colour in both themes; measured, with the number in the commit |
| **I2-3** | **Extend `K12` into a composition guard.** The KPI that could not see any of this becomes one that can | A test fails on a new `white/N`, `black/N`, or a raw alpha on a colour token |

### P1 — the first impression

| ID | Package | Exit criterion |
|---|---|---|
| **I2-4** | **Redesign `/sign-in`.** The signature surface. **Electric indigo `#5B6CFF`** enters here per ruling 1; the panel becomes a real material rather than white-at-55%; the mark is present and animated on entry | Every element clears AA in **both** themes, measured. The screen reads as designed rather than assembled, judged cold by someone who did not build it |
| **I2-5** | **The landing page's dead space.** Q1 finding S3: 45–60% of the mobile viewport is empty across six screens. The desktop no-places screen — a centred card sized to its content — is the answer already in the codebase | No screen carries a stretched gap above a pinned action; nothing invented to fill space |
| **I2-6** | **A signature entrance.** One orchestrated page-load moment on `/sign-in` and `/`, not scattered effects. Under `prefers-reduced-motion` it collapses to opacity | It plays once, it is under 900ms, and it does not delay the field being focusable |

### P2 — the wow

| ID | Package | Exit criterion |
|---|---|---|
| **I2-7** | **The post-login reveal — the full choreography, per ruling 2.** `pins.land` and the reveal-into-flight already exist and are **wired to import-confirm only**. A fresh sign-in just arrives. Fire the same choreography on first paint of `/map`: the camera arrives, the pins land in waves, the sheet rises | Sign in → map is one continuous gesture. Measured with `measure-motion.mjs` against a before, the way W6-6 was |
| **I2-8** | **The shell header wordmark** — surface 1 of the six, specified and never built | The name is present on the signed-in surfaces, and the six-surface rule still holds exactly |
| **I2-9** | **The night map's temperature.** The owner's read is that the colours do not look good; the measured cause is that everything except the mint CTA is one cold value. Warm the chrome against the cool basemap — *chrome is brand, basemap is geography* already says this and the chrome never got its half | The three darks read as one system. Category separation on the night ground is unchanged from its measured ΔE ≥ 23.2 |

---

## 4. What this deliberately does not do

- **No new colour on the map's data.** Category colour is the encoding and it was retuned on
  measurement in iteration 1 (`ΔE 14.8 → 20.1`). It does not move for taste.
- **No motion on pins beyond the nine.** The list is closed for the data surface.
- ~~**No dark-mode toggle.**~~ **Superseded by ruling 5 (§2.3), 2026-08-31.** This read
  *"`facelift-plan.md` §4 decision 3 is unchanged: a signed pass, or none. I2-1 and I2-2 make the
  palette worth signing off; the signature is still the owner's."* Both halves came true in order:
  I2-1 and I2-2 landed, the pass measured 0 AA failures across 464 strings in both themes, and the
  owner signed by asking for the control. Struck rather than deleted — the condition it named is
  what made the ruling grantable.
- **No new product.** Nothing here adds a feature. It is the same product, dressed correctly.
- **Not the neighbourhood band.** S1 remains the top functional finding and is out of this
  iteration's scope, as it was out of the last one's.

---

## 5. Order, and why

**I2-1 → I2-2 → I2-3** first and serially: they touch `globals.css` and every category surface, and
until they land any palette judgement is being made through a broken panel. This is the same shape
as iteration 1's Wave 0, and for the same reason.

Then **I2-4/5/6** and **I2-7/8/9** are two lanes with disjoint scopes — the chrome lane owns
`sign-in`, `page`, `layout`; the app lane owns `map-page-client`, the shell and the basemap. The one
shared file is `globals.css`, which P0 finishes with.

**The staging rule from iteration 1 carries over and is not optional:** `git add <paths>` names what
enters the index; only `git commit -- <paths>` names what enters the commit.
