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

## 2.3 Two further owner rulings, 2026-08-31 — both override a written rule, so both are recorded here

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
- **No dark-mode toggle.** `facelift-plan.md` §4 decision 3 is unchanged: a signed pass, or none.
  I2-1 and I2-2 make the palette *worth* signing off; the signature is still the owner's.
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
