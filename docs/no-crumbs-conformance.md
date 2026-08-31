# No Crumbs — design-system conformance audit

> **What this is.** A section-by-section audit of what ships in `src/` against
> [`no-crumbs-design-system.html`](no-crumbs-design-system.html), the rendered specification —
> 3,839 lines, six chapters, twenty-seven sections. It was written on 2026-08-30 and its own footer
> says *"Nothing here is implemented."* Two iterations have been built beside it and nobody had read
> it end to end until this pass.
>
> **Base.** `.git/refs/heads/no-crumbs-implementation` = **`29b0284`** at the time of reading. Four
> lanes were editing `src/` concurrently, so any file this document quotes may have moved after
> `29b0284`; every claim below is a claim about that tree.
>
> **Method, and its limit.** Read the specification, then read the shipped modules. **No shell, no
> browser, no running app.** Nothing here is a rendering claim: where the verdict depends on what a
> pixel looks like, it says so and names the measurement already recorded in the code rather than
> inventing one. Contrast ratios, ΔE figures and the circularity measurement are quoted from the
> source files that carry them; none was re-taken here.
>
> **The document is not automatically right.** Two of its most specific claims have already been
> shown to argue about values that no longer exist. §7 records every further claim in it that reads
> as written about a superseded value, and where a deviation turns out to be **the code being right**
> it is recorded as a finding *against the document*.

---

## 1. Verdict

The specification is **more built than the brief assumed in two places and much less built in one**.

| | |
|---|---|
| Tokens, palette, ramps (`#colour`, `#system` colour) | **Built**, including the five-step ramps the document draws |
| Type scale (`#system`) | **Partial** — five of six steps reachable, one specified step absent, one unspecified step invented |
| Elevation (`#system`) | **Built** — four levels, contrary to the brief's expectation that nobody had worked on it |
| Motion vocabulary (`#system`, `#interaction`) | **Built** — the closed list of nine is tokenised and consumed |
| The mark, the pin, the icons (`#mark`, `#apps`) | **Built**, and drawn from one shared geometry module |
| **The mascot as a character** (`#moods`, `#styles`, `#motion`) | **Built as a library, unrendered as a product.** One of eight moods, two of five constructions, **zero of seven animations** |

The single largest gap is not the type scale. It is that **the mascot chapter — three sections, eight
moods, five constructions, seven animations — is a component with no call sites.** `CrumbMascot`,
the React component that draws the character, is imported by **nothing in `src/`**. Everything the
owner would recognise as "the mascot" is reachable only through `PinMark`, which draws exactly two
things: the faceless silhouette, and the `idle` face.

That is the answer to *"i see a lot of gaps. look at the mascot look at everything."*

---

## 2. Findings, ranked by what the owner would notice

The owner's two smoke-test complaints were **first impression** and **the brand being missing**.
Ordered against those, not against the document.

### F1 — Seven of the eight moods are unreachable. `CrumbMascot` has no call sites. — **HIGH**

`src/components/brand/crumb-mascot.tsx` exports the component that renders any of the eight moods.
Grepped across `src/`: it is imported by **no file**. The only consumers of the drawing are
`pin-mark.tsx` (which hard-codes `mood: 'idle'`), `apple-icon.tsx` and `opengraph-image.tsx` (both
`mood: 'idle'`).

So the product ships `idle` on the header mark, the app icon and the link preview, and nothing else.
`reading`, `found`, `nothingFound`, `beenThere`, `nearMe`, `offline` and `saved` exist as data in
`CRUMB_MOODS` and are drawn on no screen.

**Are the states reachable?** Seven of eight are — the screens exist and are shipping:

| Mood | State it is bound to | Screen that exists today | Mascot there? |
|---|---|---|---|
| `idle` | Header, app icon, resting | `shell-wordmark.tsx`, `chrome-mark.tsx`, `apple-icon.tsx` | **Yes** (and faceless on the shell) |
| `reading` | Import running | `import/screens/rail-screen.tsx` | No — Lucide `Loader2` |
| `found` | Places added | `import/screens/count-tick.tsx`, the payoff hold | No |
| `nothingFound` | No places in this one | `import/screens/no-places-screen.tsx` | No |
| `beenThere` | A place marked as Been | `sheet/visit-state.tsx` | No — **and see F5** |
| `nearMe` | Locating, near-me on | `map/near-me-control.tsx` | No |
| `offline` | Connection lost, retryable | `import/screens/failure-screen.tsx` | No |
| `saved` | Added to a collection | `collections/add-to-collection.tsx` | No |

Every one of those has a screen. `#rules` rule 6 — *no new faces without a screen* — is satisfied in
the other direction: the states are real and the faces are missing from them.

**`nothingFound` is the one that costs most.** At LEVEL B's hit rate it is the modal import outcome,
the document calls it *"the most important face"*, and it is the screen the owner sees most often.

### F2 — All seven mascot animations are absent, and the import wait draws a generic spinner — **HIGH**

`#motion` specifies seven: **Bob, Wobble, Scan, Land, Halo, Trail, Nibble.** `crumb-mascot-markup.ts`
emits the exact hooks the rig's stylesheet targets — `class="crumb-eyes"`, `class="crumb-mouth"`,
`class="crumb-halo"`, `class="crumb-spark-1"` / `-2`. **No stylesheet in the repository targets any
of them.** `globals.css` contains no `@keyframes` at all; its only animation source is the
`tw-animate-css` import, which knows nothing about a crumb.

So the markup carries five animation hooks and there is nothing on the other end of them.

The document is specific about where this bites: *"it replaces a generic spinner on the one screen
where the user waits seven to thirty-four seconds"* and *"for the import wait, use Wobble."* What
ships on that screen is Lucide's `Loader2` at three call sites — `rail-screen.tsx:88`,
`rail-screen.tsx:240`, `review-screen.tsx:464` — plus four more in `add-by-name.tsx`.

This and F1 together are the whole of the owner's "the brand is missing". The brand is present as a
static shape and absent as a character.

### F3 — The Trail does not exist — **HIGH**, and it is the cheapest of the three

`#mark` gives the silhouette **four jobs**: mascot, silhouette, map pin, **trail** — *"loading,
routes, empty states"*. Three are built. The fourth has no constant, no module, no component and no
call site; `#crumbTrail` in the design system has no counterpart in `src/`.

`#apps` calls it *"the one animation this brand gets"* — *"three crumbs fading in left to right,
then the mascot lands … about 700 ms … one animation, one place."* It is the single asset that would
put the brand on the screen the user stares at longest, and it is roughly one SVG plus one keyframe
block.

### F4 — `theme_color` is off-white, which `#ship` names as the thing to fix — **MEDIUM**, one line

`#ship`'s file table: `src/app/manifest.ts` — *"Name, icons, and a `theme_color` that is **not**
off-white."*

Shipped, `manifest.ts:44`: `theme_color: BRAND_SURFACE` = `#FAF9F6`. `layout.tsx:86`:
`themeColor: '#FAF9F6'`. Both off-white.

The code's docblock argues the point for `background_color` (the pre-first-frame splash, where
`--background` is right) and then applies the same value to `theme_color`, which is a different
thing: it tints the Android/Chrome UI bar. Off-white there is indistinguishable from no
`theme_color` at all, which is exactly what the document was asking to fix.

**The document is right and the code is wrong here.** `BRAND_MINT` (`#A8ECE2`) is the tile the icon
already sits on and is the obvious value.

### F5 — `beenThere` contradicts `#rules` rule 4. The document disagrees with itself — **MEDIUM**

`#moods` mood 5: **`beenThere` — "A place marked as Been."**
`#rules` rule 4: **"It never reacts to a place** — no approving face beside a restaurant, no rating,
no favourite. The discovery is the user's and we do not editorialise about it."

A contented closed-eyed face that appears when you mark a restaurant *Been* is a mascot reacting to a
place. `crumb-path.ts:223` copies the mood forward without noticing.

This is a **document defect**, and it is worth resolving before F1 is built, because building the
face is the moment the contradiction becomes visible on screen. `saved` ("added to a collection") is
adjacent but survives: it reacts to the user's filing action, not to the place.

**Recommendation:** delete `beenThere`, or rebind it to a state that is about the user rather than
the place. Seven moods with a rule intact beats eight with a rule broken.

### F6 — The **Night** construction is never used, including in dark mode — **MEDIUM**

`#styles`: *"Night — same gold on a dark ground, deeper keyline so the edge does not glow. **For the
night map and dark mode.**"* `mascot-colors.ts` implements it (`MASCOT_INK_NIGHT` `#20170B`).

`chrome-mark.tsx:45` renders `<PinMark face>` unconditionally, and `pin-mark.tsx:60` maps `face` to
`'outlined'` with no theme branch. Dark mode ships (`globals.css`'s `.dark` block is a signed pass),
so on `/` and `/sign-in` at night the mascot renders with the `#3A2A15` daylight keyline — the exact
condition the Night construction exists to avoid.

The blocker is honest and already written down: `chrome-mark.tsx:32` records that `--chrome-mark-glow`
was tuned against a *mint* mark and that *"a gold character on a mint halo is a colour decision that
has not been taken."* That is an **owner decision**, not an engineering one — see §8.

### F7 — The type scale is missing the Title step, and has grown one the document does not specify — **MEDIUM**

`#system` draws **six steps, three weights, two tracking values**. Mapping them against
`globals.css`:

| `#system` step | Specified | Shipped | Verdict |
|---|---|---|---|
| Display / "900" | `clamp(28px, 4vw, 40px)`, `-.035em`, lh 1.05 | `--text-display` 34px + `--text-display-lg` 40px | **DEVIATES, code defensible.** Split into two fixed steps rather than a clamp; the reasoning is in `globals.css:169-193` and is sound (at 390px the clamp's `4vw` resolves to 15.6px and every headline would floor at 28px, six under today's). Both ends sit inside the specified range |
| Title / 800 | 22px, `-.025em` | **nothing** | **ABSENT, and it matters.** Tailwind's `text-xl` is 20px and `text-2xl` is 24px; the 22px step has no name. `globals.css:174-179` records that a `--text-title` was added on 2026-08-31 *and removed* because it took this step's name at 44px. The step itself was never added |
| Row / 700 | 15px, `-.01em` | `--text-reading` **15.5px** | **DEVIATES, minor.** Half a pixel, and the shipped value was derived from measured call sites rather than from the scale |
| Body / 500 | 14px | `text-sm` (default ramp) | **BUILT** |
| Meta / 600 | 12px | `text-xs` (default ramp) | **BUILT** |
| Label / 800 | 11px, `.14em`, uppercase | `--text-micro` 11px | **PARTIAL.** The size is a token; the tracking is not — `chrome-stage.tsx:256` writes `tracking-[0.14em]`, an arbitrary value, which is the exact class of thing `#interaction`'s registration argument exists to kill |
| — | *(not specified)* | `--text-hero` `clamp(2.5rem, 5.5vw, 4rem)` | **DEVIATES.** A seventh step topping out at **64px**, 60% over Display's 40px cap. It is registered but currently unread outside `globals.css`; it is nonetheless a step the scale does not contain |

**Weights and tracking are not tokenised at all**, and the drift is measurable: the document names
three weights; `src/` uses five (`font-medium`, `font-semibold`, `font-bold`, `font-extrabold`,
`font-black`) across **265** call sites. Weight is the axis the scale's *"the product stops looking
assembled"* argument actually rests on, and it is the axis with no guard.

**Size of the gap:** smaller than the brief expected. Five of six steps are reachable; the work is
one missing token, one bracket, and a ruling about weights. This is next-iteration work, not
this-iteration work, **except** the Title step, which is one line.

### F8 — The shell wordmark sits over the live map, which `#wordmark` forbids — **MEDIUM, code probably right**

`#wordmark`, *what it must never do*: *"…and **never over the live map** — the map already carries
pins in four colours and a wordmark on top of it is noise. If the map needs the brand, it gets the
mascot in the corner of the empty state, not a logo bar."*

`src/app/map/shell-wordmark.tsx` is a logo bar over the live map. It was built as `I2-8` against
`voice-and-vocabulary.md` §2, which lists *the shell header wordmark* as **surface 1 of six**.

Two documents, opposite instructions, on the surface the owner opens every session — and the owner's
complaint was that the brand was missing.

**Which is wrong: the document.** Its rule is about a bare wordmark painted on the tiles, competing
with pins. What ships is a floating chrome chip — hairline border, `bg-card/85`, `backdrop-blur-md`,
`pointer-events-none` — in the same material as the account chip opposite it, i.e. the map's own
chrome layer rather than the map. The rule should be narrowed to *"no wordmark on the map canvas; a
chrome chip is not the canvas"* rather than the code reverted.

Worth noting the letter of the rest of the rule *is* kept: no outline, no gradient, no shadow on the
wordmark (`shadow-sheet` is on the chip, not the type), and the pair is 24/16px against the stated
22/15px floor.

### F9 — The link preview is product-level; the per-collection variant does not exist — **LOW/MEDIUM**

`#apps`: *"Per-collection previews render the collection's own name and place count, so a shared
invite arrives looking like an invitation."* `#ship`: *"a per-collection variant follows."*

`src/app/opengraph-image.tsx` exists and is good — gold mascot, wordmark in Fraunces, the C102
sentence, three real category pins. There is **no** `opengraph-image` under
`src/app/collections/**`, so a shared invite previews with the generic product card.

The document's own framing — *"the highest ratio of effort to credibility"* — applies specifically to
the per-collection case, which is the one link that actually gets shared. Absent, and it should be
built; it is not marketing surface.

### F10 — Flat and Chunky are unused. Correctly, for now — **LOW**

`#styles` names five constructions and says to *"pick one as primary and keep the rest as contexts,
not as alternates."* Shipped: `outlined` (chrome, icons) and `mono` (pin, favicon, shell mark). Two
of five.

- **Chunky** — *"strongest at large sizes and on merch"*. **Absent and correctly so.** There is no
  merch and no surface above 180px.
- **Flat** — *"sits better inside an app-icon mask"*. Absent. `apple-icon.tsx:41` argues the case
  explicitly and chooses Outlined at 180px, which is a considered call, not an oversight. If a
  smaller rasterised icon is ever added, Flat is the one to reach for.
- **Night** — absent, and this one is a real gap. See F6.

---

## 3. Section-by-section conformance

### `#mark` — the mark

| Specified | Shipped | Verdict |
|---|---|---|
| One closed path, shared by every surface | `CRUMB_PATH` in `src/components/brand/crumb-path.ts`, read by `pin-mark.tsx`, `crumb-mascot-markup.ts`, `marker-images.ts`, `opengraph-image.tsx`, and copied byte-for-byte into `app/icon.svg` with `crumb-path.test.ts` asserting the copy | **BUILT** |
| Mascot — the character | `CrumbMascot` / `crumbMascotMarkup` | **BUILT, unrendered.** See F1 |
| Silhouette — the shape alone | `mono` construction, `PinMark` default | **BUILT** |
| Map pin — a crumb, not a teardrop | `CRUMB_PIN_TAIL_PATH` + `marker-images.ts:128` | **BUILT.** Two subpaths in one `Path2D`, unioned under `nonzero`, so the crumb stays byte-identical to the mark's |
| Trail — loading, routes, empty states | — | **ABSENT.** See F3 |
| Face on brand surfaces, never on the map | `marker-images.ts:19` states the rule and the layer draws no face; `pin-mark.tsx` defaults faceless | **BUILT** |
| *"A mascot at 168px, a pin at 30px, and a legible blob at 16px"* | — | **DOCUMENT WRONG.** See §7.1 |

### `#wordmark`

| Specified | Shipped | Verdict |
|---|---|---|
| Fraunces 900, `SOFT` 60, `WONK` 1 | `DISPLAY_WORDMARK_AXES` in `display-type.ts`; `font-black` at both call sites | **BUILT** |
| Stacked lockup as primary — `No` over `Crumbs` beside the mark | `chrome-stage.tsx:194-200`, two flex children, `leading-none` | **BUILT.** `/` and `/sign-in` |
| Wordmark alone, one line, inline | `shell-wordmark.tsx:83` | **BUILT** |
| Minimum pair size 22px mark / 15px type | 44/20 phone, 56/24 desktop on chrome; 24/16 on the shell | **BUILT**, clears the floor |
| No outline, gradient, shadow, stretch | none present; `globals.css` carries no `font-stretch` axis and `display-type.ts:36` records why | **BUILT** |
| Never over the live map | `shell-wordmark.tsx` | **DEVIATES — document should change.** See F8 |
| Clear space = the height of the `O` | not expressed anywhere; the two lockups use `gap-3`/`gap-4` and `gap-2` | **ABSENT, low.** A rule with no guard. Worth a comment rather than a token |
| Fraunces carries the editorial voice and nothing else | `font-display` appears at exactly five call sites: four editorial `h1`s (all four pairing `DISPLAY_HEADING_AXES`) and the shell wordmark | **BUILT**, and unusually tightly held |

### `#colour`

Audited **against the owner's override** (`iteration-2-plan.md` §2.2 ruling 1), as instructed.

| Specified | Shipped | Verdict |
|---|---|---|
| Mint is the brand — `#A8ECE2` / `#2E7A70` / `#123B35` / `#FAF9F6` / `#1B1B1A` | `brand-colors.ts`, values identical | **BUILT** |
| Gold belongs to the mascot alone — `#F2C46B` / `#E0A845` / `#3A2A15` / `#F0866A` @50% | `mascot-colors.ts`, values identical, in a separate module from `brand-colors.ts`, and a unit test asserts `brand-colors.ts` holds no warm colour | **BUILT**, and the separation is enforced rather than remembered |
| Gold and mint never on the same surface | The app icon and the link preview are the gold mascot on a mint tile | **DEVIATES — the document contradicts itself and the code follows the drawing.** `#apps` *draws* the tile at 180/64/32/16px as gold-on-mint. `mascot-colors.ts:17-28` and `apple-icon.tsx:31-39` record the reversal. **Code right** |
| Rule 5 — gold stays off the map | Nothing under `components/map/**` imports `mascot-colors.ts`; a unit test holds the line | **BUILT** |
| Category = restaurant `#D9482A`, café `#A66A18`, bar `#6A4BD0`, uncategorised `#2E7A70` | `palette.ts`: restaurant, bar, uncategorised verbatim; **café is `#6C430B`** (`cafe.800`) | **DEVIATES — code right.** See §7.2 |
| Four five-step ramps, `100…900` | `CATEGORY_RAMP` in `palette.ts` and `--cat-*-*` in `globals.css`, every value verbatim from the document's swatch bars | **BUILT** |
| *"Every colour is a token; a hard-coded colour is a review failure"* — broken in 13 files | `--category-*` / `--cat-*` tokens exist and the two literal islands (`palette.ts` for GL, `brand-colors.ts` for satori/static) are deliberate and test-guarded | **BUILT**, with the islands documented as islands |
| **Override:** electric indigo `#5B6CFF`, chrome only | `--indigo-*` and `--chrome-*` in `globals.css`; consumed **only** by `chrome-stage.tsx` and `chrome-ground.tsx`, which render on `/` and `/sign-in` alone | **CONFORMS TO THE OVERRIDE.** No `--indigo-*` or `--chrome-*` reference appears anywhere under `components/map/`, `ui/place/` or `basemap-*`. No pin, no category surface, no basemap layer, no filter chip. **The override is not being applied more widely than the ruling permits** |

### `#apps` — applications

| Specified | Shipped | Verdict |
|---|---|---|
| App icon 180px, mascot with face, ~70% of tile, gold on mint | `app/apple-icon.tsx`, generated through satori from the shared markup; `INK_FRACTION = 0.7` measured as **ink** rather than as box | **BUILT**, and better specified than the document — the document's own icon row is 63% of ink on tile |
| Favicon ≤32px, face dropped, silhouette on mint | `app/icon.svg` — `#123B35` silhouette on an `#A8ECE2` tile, `rx=22`, scaled 0.74 and centred on the measured ink centroid | **BUILT** |
| Map pin — silhouette on a point, category colour, white aperture, `r = 17` @95% | `marker-images.ts` + `CRUMB_PIN_APERTURE`; aperture is `palette.labelHalo`, i.e. the ground, not white | **BUILT with one deliberate deviation — code right.** See §7.3 |
| Dashed ring stays the guessed-coordinate signal | untouched by the pin rewrite; `marker-images.ts:182` says so | **BUILT** |
| Link preview | `app/opengraph-image.tsx` | **BUILT** |
| Per-collection link preview | — | **ABSENT.** See F9 |
| Manifest with a non-off-white `theme_color` | `app/manifest.ts` | **PARTIAL.** See F4 |
| Empty state with the mascot, shipping copy intact | `EMPTY_LIBRARY_HEADING` unchanged; no mascot | **ABSENT, and defensibly so.** The document shipped this as *a proposal* and flagged that it contradicts a deliberate "no empty-box illustration" decision. Nobody has overturned that decision. It is, though, the single cheapest place to put F1's `nothingFound` face if the owner wants one |
| The trail, for the import wait | — | **ABSENT.** See F3 |

### `#moods`

| Specified | Shipped | Verdict |
|---|---|---|
| Six eye sets | `CRUMB_EYE_SETS` — `dot`, `wide`, `happy`, `closed`, `flat`, `wink`, every path copied character-for-character from the rig | **BUILT** |
| Seven mouths | `CRUMB_MOUTHS` — ditto; `grin` is the only `fill` | **BUILT** |
| Eight moods, each bound to a named state | `CRUMB_MOODS`, with `state` as a required field so a mood cannot exist without naming its screen | **BUILT** — and the binding is enforced by the type, which is stronger than the document asked for |
| Spark pair (the one celebration) | `CRUMB_SPARKS`, two paths | **BUILT** (static) |
| Halo (locating) | `CRUMB_HALO`, `r = 46` @20% behind the body | **BUILT** (static) |
| Cheeks / blush @50%, 60% on Flat | `CRUMB_CHEEKS`, `blushOpacity` per construction | **BUILT** |
| Nothing angry, crying, confused | not present | **BUILT** |
| *Eight moods on eight screens* | one mood on three surfaces | **ABSENT.** See F1 |
| `beenThere` | present | **DOCUMENT DEFECT.** See F5 |

### `#styles`

| Construction | Shipped | Used by | Verdict |
|---|---|---|---|
| Outlined — keyline 4.5, ink `#3A2A15` | `CRUMB_CONSTRUCTIONS.outlined` | `PinMark face`, app icon, link preview | **BUILT + used** |
| Flat — no keyline, ink `#6B4A1E`, blush 60% | `.flat` | nothing | **BUILT, unused.** Defensible |
| Chunky — keyline 7, feature 5.6 | `.chunky` | nothing | **BUILT, unused. Correctly so** — merch only |
| **Mono — silhouette, `currentColor`** | `.mono`, `ink: null` so the face is dropped by definition rather than by a flag | **the pin** (`marker-images.ts` draws the raw path), **the favicon** (`icon.svg`), the shell mark and `PinMark`'s default | **BUILT + used where the document requires it.** The two surfaces the document names — *"this is the pin, the favicon"* — both take it |
| Night — ink `#20170B` | `.night` | nothing | **BUILT, unused, and that is a gap.** See F6 |
| One silhouette in all five | `crumbMascotMarkup` reads `CRUMB_PATH` for every construction | | **BUILT** |
| Artboard `-8 -8 116 116` for keylined constructions, `0 0 100 100` for Mono/Flat | `crumbMascotViewBox()`, branching on `keylineWidth === 0` | | **BUILT**, and the reasoning (a stroke straddles its path; Mono is the favicon and would shrink 14% for nothing) is better than the document's, which pads unconditionally |

### `#motion` (mascot)

| Animation | Where it is allowed | Shipped | Verdict |
|---|---|---|---|
| Bob — 1.15s squash/stretch, loading default | anywhere a spinner would go | — | **ABSENT** |
| Wobble — 1.8s, the import wait | the 7–34 s import | — | **ABSENT.** The screen draws `Loader2` |
| Scan — eyes track L→R | "Reading the TikTok" | markup emits `class="crumb-eyes"`; no keyframes | **ABSENT** |
| Land — one-shot, on confirm | places added | — | **ABSENT** |
| Halo — 1.9s pulse | locating / near me | markup emits `class="crumb-halo"`; no keyframes | **ABSENT** |
| Trail — three crumbs rise | loading, on-concept | no geometry at all | **ABSENT.** See F3 |
| Nibble | **marketing only, never the import rail** | — | **ABSENT and correctly so.** There is no marketing site, and the document itself bans it from the rail |
| *"None may imply progress the product cannot measure"* | | the rail claims no stage the server did not send (`W6-2`) | **HONOURED** by the current design, and it is the constraint any Wobble/Trail build must keep |
| *"Everything honours reduced motion"* | | the product's own animations are behind `motion-safe:` (79 uses across 30 files) and `MotionConfig reducedMotion="user"`; **there is no mascot animation to reduce** | **N/A until F2** |

### `#rules` — the six

| Rule | Verdict |
|---|---|
| 1 · Face on chrome, silhouette on data | **BUILT.** `pin-mark.tsx` defaults faceless; `chrome-mark.tsx` is the only seam that asks for a face; the map layer has no face path |
| 2 · One mascot per screen | **BUILT.** Enforced structurally — `crumbMascotMarkup` has a fixed `clipId` default and `crumb-mascot-markup.ts:50-57` records that a second instance is a rule violation before it is a rendering one |
| 3 · It never speaks | **BUILT.** No speech bubble, no first person, no character name anywhere |
| 4 · It never reacts to a place | **AT RISK.** No shipped violation, because no mood renders — but `beenThere` is a violation waiting to be built. See F5 |
| 5 · Gold stays off the map | **BUILT + guarded.** `components/map/**` cannot import `mascot-colors.ts`; a unit test holds it |
| 6 · No new faces without a screen | **BUILT.** `state` is a required field on every mood |

### `#system` — type, elevation, motion

**Colour** — see `#colour` above. **Built**, ramps included.

**Type** — see F7. **Partial**: five of six steps reachable, Title absent, `--text-hero` unspecified,
weights and tracking untokenised.

**Elevation — BUILT, and this contradicts the brief's expectation.**

| `#system` | Rule | Shipped |
|---|---|---|
| E0 Flush | rows, list items | no shadow — the documented "resting cards have no shadow" decision, preserved |
| E1 Raised | chips and controls over the map | `--shadow-raised`, registered as `shadow-raised` |
| E2 Floating | the sheet, the nav bar, the search field | `--shadow-sheet` (`= --shadow-elevated`, kept as an alias so there is one value), registered as `shadow-sheet` |
| E3 Modal | the review sheet, the share panel — one at a time | `--shadow-overlay`, registered as `shadow-overlay` |

All three tokens are consumed: 34 hits across 13 files, in the nav bar, the sheet, the wordmark chip,
the add sheet, the import shell and the chrome card. The `.dark` block re-states all three at a
dark-ground alpha, with the reasoning that 10% black over `#131312` is not a shadow. **The document's
four levels exist, are named, are registered as Tailwind utilities and are in use.** The one thing
not expressed is E3's *"one at a time, never two"*, which is a composition rule with no guard.

**Motion — BUILT.** `#system`'s six moments and `#interaction`'s nine both resolve:

| Moment | Specified | Shipped |
|---|---|---|
| `press` | 90ms | `--duration-press`, and `src/lib/interaction.ts` exports `PRESS_BEAT` / `PRESS_BUTTON` / `PRESS_ROW` / `PRESS_CHIP` |
| `enter` | 140ms, opacity + 4px rise | `--duration-enter`, `animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1`, written identically at three call sites |
| `row ↔ pin` | 160ms | `--duration-couple`; the coupling is **real** — `marker-style.ts:256-278` dims non-hovered pins and `pin-highlight-layer.tsx` draws the lifted one on its own layer |
| `filter.settle` | 180ms + 40ms stagger | `--duration-settle`, `--duration-stagger-row`; `icon-opacity-transition` fades rather than deletes |
| `band.cross` | 200ms | `--duration-cross` |
| `pin.select` | 220ms, scale 1.28 | `--duration-base`; `marker-style.ts:113` `selectedScale: 1.28`, with its own bitmap because resampling softened the ring |
| `count.tick` | 400ms | `--duration-tick`, `import/screens/count-tick.tsx`, asserted equal by a unit test |
| `pins.land` | 900ms + 60ms stagger | `--duration-flight`, `--duration-stagger-pin`, waves in `place-marker-layer.tsx:411` |
| `sheet.stop` | spring | already correct, untouched, as the document instructed |
| `--ease-standard` / `--ease-emphasised` / `--ease-exit` | two easings specified | three shipped; the third (`exit`) is an addition, not a contradiction |
| Namespace | — | `--transition-duration-*`, not `--duration-*`, with `design-tokens.test.ts` compiling the file rather than reading it. This is the silent-failure class the document warns about, caught |

### `#interaction`

| Specified | Then | Now | Verdict |
|---|---|---|---|
| `active:` — press feedback | 4 uses | `motion-safe:active:scale-*` through `interaction.ts`, applied via `buttonVariants` and the row/chip strings | **BUILT** |
| `group-hover:` — the row talks to the pin | **0** uses | present in `place-sheet.tsx` (`group-hover/row:` on the disc, the meta line, the distance) and coupled to the map layer | **BUILT** |
| `motion-safe:`, not a global query | 0 uses | 79 hits across 30 files; `interaction.ts:20` states the inversion as the rule | **BUILT** |
| Register tokens, stop writing brackets | 163 arbitrary-value classes | ~59 by a rough count over `src/**/*.tsx` (my regex, not the document's methodology — treat as an order of magnitude, not a measurement) | **BUILT, substantially** |
| State in variants, not ternaries | 21 `data-[`, 1 `aria-[` | not re-counted | **UNAUDITED** |
| `starting:` variant for entry | *"worth confirming against 4.3.3"* | not used; `animate-in` used instead | **ABSENT, and it does not matter** — the enter rule ships, by a different mechanism |
| The ten-row state matrix | — | not audited row by row; press, hover, focus-visible and the row↔pin column are demonstrably present | **PARTIAL / UNAUDITED.** A per-element sweep is a separate pass and needs a browser |

### `#ship` — the file table

| File | Change | State |
|---|---|---|
| `src/app/layout.tsx` | `title` + `metadataBase` | **DONE** (`metadataBase` at `layout.tsx:51`) |
| `src/app/page.tsx` | replace the `P-002` label | **DONE** — the page now renders `ChromeStage` with the stacked lockup |
| `src/components/brand/pin-mark.tsx` | crumb silhouette instead of Lucide `MapPin` | **DONE** |
| `src/components/map/marker-images.ts` | rasterised pins take the crumb outline | **DONE** |
| `src/app/icon.svg` | favicon | **DONE** |
| `src/app/apple-icon.png` | 180×180 | **DONE, and better** — shipped as `apple-icon.tsx`, generated from the shared geometry, because a committed PNG is a copy of the outline no test can read |
| `src/app/opengraph-image.tsx` | link preview | **DONE** (product-level; per-collection variant **not** built — F9) |
| `src/app/manifest.ts` | name, icons, non-off-white `theme_color` | **PARTIAL** — F4 |
| `docs/spec-no-places-found.md` | no change | **HELD** — `EMPTY_LIBRARY_HEADING` and the no-places copy are intact |
| `docs/brand-and-product-foundation.md` | §3 closes, §3.1 records the mascot ruling | **DONE** |

### `#direction`, `#verdict`, `#mockups`, `#import`, `#surfaces`, `#plan`, `#decisions`, chapters 01 / 04 / 06

**Not audited here.** Chapter 01 (The Name) is a decision record and is closed. Chapter 04 (The
Voice) is `voice-and-vocabulary.md`'s territory and has its own copy deck. Chapter 05's mockups and
Chapter 06's growth diagnosis are plan artefacts rather than specifications of a drawn thing; they
are audited by `execution-plan.md`. Say so rather than pad this table.

---

## 4. Absent and correctly so

Used deliberately, as instructed. These should **not** be built.

| Thing | Why absent is right |
|---|---|
| **Nibble** animation | The document itself confines it to *"marketing only, never the import rail"* and *"it implies a countdown we cannot honour."* There is no marketing site |
| **Chunky** construction | *"Strongest at large sizes and on merch."* No merch, no surface above 180px |
| **The whole of chapter 01** | A closed naming decision. Marketing surface for a product with no marketing site |
| The document's own page chrome — hero canvas, chapter pager, JetBrains Mono eyebrows, `.pill`, `.verdict`, `.finds` | Deck furniture. It is the *document's* design system, not the product's, and the file says so at the top of its token block |
| The mascot in the **library empty state** | Shown in `#apps` as *a proposal* that knowingly contradicts a shipping "no empty-box illustration" decision. Absent is the status quo, and the status quo has not been overturned. (It is, separately, the cheapest home for `nothingFound` if the owner wants the brand there) |
| `starting:` entry variant | The `enter` rule ships through `animate-in`. The mechanism was a suggestion, not a specification |

---

## 5. Where the code is ahead of the document

Worth recording, because these are places a future reader would otherwise "fix" back to the document.

- **The geometry is measured, the document's is eyeballed.** `CRUMB_BOUNDS` (`5.2, 6.2 → 94.2, 94.1`)
  is the path's real ink extent, read off the alpha channel at 10×. The document assumes `0 0 100
  100`, which centres the crumb 0.3 units off and sizes it ~11% small. `apple-icon.tsx` and
  `opengraph-image.tsx` both correct for it explicitly.
- **The artboard branches.** The document pads every rig to `-8 -8 116 116`; the code keeps the
  square for Mono and Flat, which have no keyline, so the favicon and the pin are not 14% smaller
  than they should be inside the same box.
- **One drawing, three renderers.** `crumb-mascot-markup.ts` builds the character once for the DOM,
  satori and the static SVG. Iteration 1 drew it three times and the app icon shipped a smile the
  component did not have.
- **The moods are a type, not a comment.** `state` is required on every entry of `CRUMB_MOODS`, so
  `#rules` rule 6 is compiled rather than remembered.
- **`--on-category`.** A pairing the document never names: the ink that sits on a category fill,
  chosen with the fill in both themes. Without it the dark pressed chip measured 4.13:1.
- **The café measurement.** See §7.2.

---

## 6. Documented but unguarded

Rules that exist in prose on both sides and are held by nobody. Cheap to convert into tests.

1. **Clear space** — the height of the `O` on every side of the lockup. No expression anywhere.
2. **E3 "one at a time, never two"** — nothing stops two overlay-elevation surfaces coexisting.
3. **Weights** — the document names three, `src/` uses five. See F7.
4. **`tracking-[0.14em]`** — the Label step's tracking is an arbitrary value at its only call site.
5. **`CRUMB_FACE_MIN_PX = 32`** — the constant exists (`crumb-path.ts:246`) and **nothing reads it**.
   A caller can render a faced mascot at 16px today and nothing complains.

---

## 7. Findings against the document

The brief asked for these explicitly. Each is a claim in `no-crumbs-design-system.html` that is
stale, self-contradictory or measurably wrong.

### 7.1 — *"A legible blob at 16px"* and *"recognisable at 15px"* are false for the faceless silhouette

`#mark`: *"the same silhouette works at every size: it is a mascot at 168px, a pin at 30px, and a
legible blob at 16px"*, and *"a crumb-shaped pin … recognisable at 15px."*

Measured (`pin-mark.tsx:42-54`): rendered at 1000px, the outline deviates from a true circle by
**4.6% of its radius peak-to-peak**, s.d. **1.14%**. That is 0.33px at 16px, 0.61px at 30px, 0.90px
at 44px. **Below about 50px the bare silhouette is a disc**, and no rendering makes it otherwise.

The conclusion survives only for the *pin*, and for a reason the document does not give: the tail is
30 of its 126 units, and the tail — not the crumb's irregularity — is what separates it from a circle
and from the teardrop it replaced. For the faceless *mark* at chrome size, the sentence is wrong, and
it is why `PinMark face` (gold body, crust, keyline) carries `/` and `/sign-in` instead.

### 7.2 — The café sentence is stale in its premise **and wrong in its conclusion**

`#system`: café amber *"replaces `#8A5A3B` — a genuine brown, which at 15px on a warm map is
indistinguishable from the restaurant red."*

Two corrections, and the second is the one that matters:

1. **The premise is stale.** `#8A5A3B` had already been retuned to `#6F4A2B` by `W0-2` before the
   document's argument was read. Neither value ships.
2. **The conclusion — the specific value the document draws — is measurably wrong.**
   `palette.ts:129-160` carries the table. The specified pair `#D9482A` / `#A66A18` passes ΔE00 at
   21.1 and then collapses under simulated deuteranopia to **3.4**, with an L\* gap of **1.3**. Two
   colours that no longer differ, on the surface where colour is the entire encoding, for roughly one
   man in twelve. `palette-tokens.test.ts` already asserted `|L*(restaurant) − L*(café)| > 8` and the
   specified pair fails it.

   What ships is `#6C430B` (`cafe.800`, Lab-interpolated between the document's own 700 and 900), at
   ΔE00 26.7, L\* gap 19.0, deutan 21.2. **Better than the document's value on every axis, and better
   than the pre-change value on every axis.**

**The code is right and the document's drawn value should be corrected.** The lead's framing —
*"the reason is stale even though the conclusion may survive"* — is half right: the *direction*
(leave brown, go amber) survives; the *step* does not.

Note the loose end this leaves, already recorded in `palette.ts:158`: the **night** pair
`#E8735C` / `#C99A55` is deutan **3.1** and ships today. That is the same defect the light pair was
just repaired for, on the dark theme, unfixed.

### 7.3 — The map-pin rule says *"white aperture"*; white is a light-theme assumption

`#apps`: *"the silhouette on a point, in the category's own colour, with a **white** aperture."*

The shipped aperture is `palette.labelHalo` — `#FAF9F6` on paper, `#131312` at night. The reasoning
is in `marker-images.ts:105-110`: a white aperture and a white ring on a night basemap draw a bright
outline around every pin, *"the loudest thing on the map, drawn around the one object that was
already legible."*

**Code right.** The document was written before the dark theme was a signed pass, so "white" means
"the ground" and it only had one ground in mind.

The lead's second concern — that the aperture's legibility argument was never tested at the size the
pin paints — is **partly answered in code and not by a rendering test**. `crumb-path.ts:77-91` gives
the ratio: `r = 17` against an 89-unit head is 38% of head width, so a 10px hole in a 26px head,
against the 14px `glyphBox` it replaced; the head goes from 71% to 86% colour.
`marker-images.ts:157-186` records the trade against the glyph it removed. Those are geometric
arguments, correctly derived. **Nobody has looked at a 26px pin on a real basemap**, and I cannot —
that remains open and belongs to whoever holds the map with a browser.

### 7.4 — `beenThere` breaks rule 4

See F5. `#moods` mood 5 and `#rules` rule 4 cannot both be right.

### 7.5 — `#wordmark`'s prose and its own captions disagree about what "primary" means

The prose: *"**Stacked is the primary**: it makes a solid rectangle … and it puts `No` and `Crumbs`
on separate lines."*

The three specimens beneath it are captioned:
1. mark + `No` / `Crumbs` on two lines → *"**Primary lockup** · horizontal"*
2. mark above `No Crumbs` on **one** line → *"**Stacked** · splash and icon"*
3. wordmark alone, one line → *"Wordmark alone · inline"*

So the prose's "stacked" (two lines of type) is the caption's "primary/horizontal", and the caption's
"stacked" (mark over type) is a different construction on one line. The shipped code
(`chrome-stage.tsx:58-65`) reasons from the **prose** and builds specimen 1. That is the right
reading — the prose describes the thing, the caption mislabels it — but the labels should be fixed
before someone builds specimen 2 and cites the document for it.

### 7.6 — The document contains two different drawings of the same mascot

`#crumbFace` (the `<symbol>`, line 800) and the `CRUMB` rig (the script, line 3522) are not the same
character:

| | `#crumbFace` symbol | `CRUMB` rig | Code follows |
|---|---|---|---|
| Glint centres | `cy 39.5` / `38.5` | `cy 39.4` / `38.4` | the rig |
| Cheeks | `cx 63 / 27`, `rx 12 / 11` | `cx 26.5 / 63.5`, `rx 11 / 12` | the rig |
| Mouth | `M40 60c3.4 4 10.4 4 14-.4`, width 4 | `M40 59.5q7 6 14-.4`, width 4.2 | the rig |
| Pin aperture centre | `50, 50` (square centre) | — | `CRUMB_HEAD_CENTRE` = `49.7, 50.15` (**ink** centre) |

Sub-pixel at every shipping size, so nothing is broken. It is worth recording only because the
document is the artefact the owner approved, and *"copied byte-for-byte from the design system"*
appears in three code comments — it is copied from **one of the document's two drawings**. The rig is
the right one to have chosen: it is the one that generates the eight moods.

### 7.7 — `#colour`'s gold/mint sentence is narrower than it reads

*"Mint stays the only brand colour, gold belongs to the mascot alone, and the two never appear on the
same surface"* — and then `#apps` draws the app icon and the link preview as the gold mascot on a
mint tile, at four sizes. Already reversed in code on 2026-08-31 with the reasoning that rule 3's
real force is rule 5 (*gold stays off the map*). Recording it here so the sentence is fixed in the
document rather than re-litigated a third time.

### 7.8 — `#apps`' opening claim is now historical

*"The audit found `src/app` and `public/` carry no favicon, no app icon, no manifest and no link
preview."* All four now exist. The section reads as a to-do list and should read as a specification.

---

## 8. For the owner

Three decisions, and only three. Everything else above is engineering work.

1. **Does the mascot animate, and where?** F1–F3 are one decision with three prices. The minimum
   that answers *"the brand is missing"* is **Wobble or Trail on the import wait** plus
   **`nothingFound` on the no-places screen** — the two screens the user actually sits on. The
   maximum is eight moods on eight states, which is a lane. *Recommendation: the minimum, this
   iteration.*
2. **What is the light behind a gold mark?** `--chrome-mark-glow` was tuned against a **mint** mark
   and the mark is now **gold**. The gold-on-mint ruling reopened the character; it did not settle
   the halo. This blocks F6 (the Night construction) as much as F6 blocks itself.
   (`chrome-mark.tsx:32-36` states the same thing from the other side.)
3. **`beenThere`, or rule 4?** F5. Cheapest resolution is to drop the mood.

And one that is not the owner's but is worth surfacing: **the night category pair is deutan 3.1**
(§7.2). It is the defect the light pair was just repaired for, still shipping, on the dark theme.

---

## 9. What this audit did not do

Stated plainly so nobody reads a gap as a pass.

- **Nothing was rendered.** No browser, no dev server, no screenshot. Every "BUILT" above means *the
  code that implements it exists and is wired to a call site I can name* — never *it looks right*.
- **The ten-row state matrix in `#interaction` was not swept element by element.** That needs a
  browser.
- **The arbitrary-value count (~59) is my regex, not the document's.** Treat it as an order of
  magnitude.
- **Chapters 01, 04 and 06, and §`mockups` / §`import` / §`surfaces` / §`plan` / §`decisions`, were
  read but not tabled** — they are decision records and plan artefacts, audited elsewhere.
- **No contrast ratio, ΔE or circularity figure here was re-measured.** All are quoted from the
  module that carries them, with the file named.
