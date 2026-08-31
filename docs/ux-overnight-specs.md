# Overnight run — the three UX specifications

> **Written 2026-08-31 by `ux-interaction` for the overnight run.** Measured against the working tree
> at commit **`1b79e9c`** on `no-crumbs-implementation`. Everything with a file path and a line number
> in it was read, not remembered; re-measure before trusting a line number, because several of the
> files named here are being edited by other agents in the same tree tonight.
>
> **This document specifies three surfaces. It contains no production code and I ran nothing** — I
> have no shell, so nothing below is *verified*, and no sentence here may be quoted as evidence that
> anything works.
>
> | # | Package | Surface |
> |---|---|---|
> | **Spec 1** | **W2-1** (+ **W2-1b**, **W2-5**) | What the overview *is*, as a decision procedure |
> | **Spec 2** | **W3-1 – W3-4** | The state matrix, made checkable by inspection |
> | **Spec 3** | **W1-1** | The zero-state screen |
> | **Spec 4** | **W3-4**, struck | The live regions — a ruling, added 2026-08-31 |
>
> Binding inputs, read in full: [`overnight-run-plan.md`](overnight-run-plan.md),
> [`facelift-plan.md`](facelift-plan.md) §3a, [`voice-and-vocabulary.md`](voice-and-vocabulary.md),
> [`ux-map-is-the-query.md`](ux-map-is-the-query.md) §5, [`growth-plan.md`](growth-plan.md),
> [`current-state.md`](current-state.md) items 0a / 4 / 5 / 8,
> [`spec-no-places-found.md`](spec-no-places-found.md) §5.
>
> **Ten owner questions are collected under *Owner questions* near the end.** Each is marked `OQ-n`
> where it arises. None of them blocks building the rest.

---

## Spec 1 — What the overview is (W2-1, W2-5)

### 1.1 The defect, stated exactly

| Fact | Where |
|---|---|
| The pin layer draws only at `z ≥ PIN_BAND_MIN` | `src/components/map/place-marker-layer.tsx:199` via `pinLayerZoomRange` |
| `PIN_BAND_MIN === AREA_BAND_MAX === 8.5` | `src/components/map/zoom-bands.ts:27,29` |
| Home rests at or below `HOME_LANDING_ZOOM.max = COUNTRY_LANDING_ZOOM.max = AREA_BAND_MAX − 0.5 = 8.0` | `zoom-bands.ts:44-47,77-80` |
| The home mover applies that range | `src/components/map/map-surface.mapcn.tsx:617-640` (`fitToBounds`) |

So the home screen of a map product draws **zero of the user's places**, for every library, at every
size. It is not a tuning error: 8.0 is *deliberately* half a band clear of the pin floor, and the
docblock says why — *"a landing exactly on `AREA_BAND_MAX` is one rounding away from drawing pins"*.

**The 2026-08-30 reversal conflated two decisions and only one of them was right.** The owner's
complaint was *"I added this Jerusalem Hotel, and after that, when I signed in again, it opened on
the Jerusalem Hotel, but I'm not interested in that"* — a complaint about **which places the camera
chose**, answered correctly by widening the box from the anchor cluster to the whole library. The
ceiling was a second, separate change, and it is the one that produced defect 0a. Widening the box
already fixes the reported symptom on its own: a union is order-independent, which is exactly what
`tests/unit/map/camera-library-shapes.test.ts:192` now asserts.

#### The distinction the whole ruling turns on: a **floor** is not a **ceiling**

This has to be read slowly, because the obvious reading of "let home rest above `PIN_BAND_MIN`" is
the one thing that genuinely does re-break the owner's complaint — and it is not what this spec
says. `map-surface.mapcn.tsx:601-604` already states the trap in one sentence:

> *"Either alone fails — a wide box with the old floor is zoomed straight back in on its own centre,
> and a ceiling over the anchor box still opens on the city you saved in last."*

| Shape | Israel-wide library (the owner's) | Israel + Tokyo |
|---|---|---|
| **Old: anchor box + floor 8.65** | opens on Tel Aviv. **The reported defect** | opens on Tel Aviv, Tokyo off screen |
| **Today: whole box + ceiling 8.0** | rests at 8.0 → **four grey pills, no pins.** Defect 0a | rests at ~2 → flag discs. Correct |
| **Restoring a floor over the whole box** | rests at 8.65 | box fits at ~2, `Math.max(2, 8.65)` → **8.65 over the centroid of Israel-plus-Tokyo, i.e. open sea.** This is what the docblock warns about, and it is worse than either |
| **This spec: whole box, no clamp** | rests at **~9.7 — all 20 pins, four cities, one screen** | rests at ~2 → flag discs. Unchanged and correct |

**Removing the ceiling is not restoring the floor.** A floor forces a minimum zoom and therefore
throws away the box; removing the ceiling lets the box decide and clamps nothing. Run the owner's own
library through it: four areas spanning ~47 km × 43 km, fitted into the phone's ~294 × 474 px visible
band, comes to rest at **z ≈ 9.7** — every one of their places on screen, four cities legible as four
cities, and nothing about *what you saved last* anywhere in the computation. That is
*"open the map when you see the countries, not last added place"* satisfied for a library that has
one country, which is the case the ruling's own docblock concedes it cannot serve: *"a one-country
library cannot show 'countries' at all, so it lands on its area pills, which is as close as its own
data gets."* Today, for the owner's library, that sentence cashes out as **four grey pills**.

**The ruling this spec makes: keep the box, delete the ceiling** — and, separately and additionally,
fix the band (§1.4a). See **OQ-1**: the reversal is dated **2026-08-30, i.e. yesterday**, which makes
it the most recent camera decision in the repository and means this must be surfaced rather than
taken quietly. (It is one day old, not nine — which argues for flagging it harder, not less.)

### 1.2 The principle

> **The overview is the whole library, framed as tightly as the library allows, and the zoom is a
> consequence rather than an input.**

A one-city library fits inside the pin band, so it opens on pins. A three-continent library fits in
the country band, so it opens on flag discs. Both are "the whole library seen from far enough out to
read as geography" — the phrase in the 2026-08-30 ruling — because *far enough out* is a property of
the library, not a constant. The only thing a constant is needed for is the boundary between the
bands, and that is §1.4.

### 1.3 The decision procedure

Add to `src/components/map/zoom-bands.ts`:

```ts
/** How far a resting camera must stay clear of a band edge. See `settleZoom`. */
export const BAND_EDGE_GUARD = 0.15;

/** The zero-places camera: a real neighbourhood, in the pin band, with no pins to draw.
 *  A fixed zoom rather than a range — there is no library to fit, so nothing to fit it to. */
export const ZERO_STATE_ZOOM = 11;

/**
 * Where the home framing is allowed to come to rest. `min: 0` because an overview must be allowed
 * to be a world view; `max` is `FIT_BOUNDS_MAX_ZOOM`'s ceiling rather than a band edge, because the
 * band a library lands in is a fact about the library.
 */
export const HOME_LANDING_ZOOM = { min: 0, max: 15 } as const;

/**
 * The one rule for where a home fit is allowed to settle: anywhere except inside the guard window
 * around the pin/area boundary, where MapLibre's own rounding decides which of two layers draws.
 * Resolves **outward**, into the area band — see §1.4 for why that direction and not the other.
 */
export function settleZoom(fitZoom: number): number {
  const clamped = Math.min(Math.max(fitZoom, HOME_LANDING_ZOOM.min), HOME_LANDING_ZOOM.max);
  if (clamped >= PIN_BAND_MIN + BAND_EDGE_GUARD) return clamped;   // pins, unambiguously
  if (clamped > PIN_BAND_MIN - BAND_EDGE_GUARD) return PIN_BAND_MIN - BAND_EDGE_GUARD; // 8.35
  return clamped;                                                   // area or country, unambiguously
}
```

`settleZoom` is pure, has no MapLibre dependency, and is the only place the band boundary is
consulted by a camera. **No caller may re-derive it** — that is the same rule `bandForZoom`'s
docblock already states for the bands themselves.

**How the home mover uses it** (`map-surface.mapcn.tsx`, `fitToBounds`, currently :617-640). The
existing code passes `minZoom`/`maxZoom` straight into `frameBounds`. It becomes: ask
`cameraForBounds` for the honest fit first, settle it, then request that exact zoom as a degenerate
range.

```ts
const fitted = map.cameraForBounds(box, { padding, maxZoom: HOME_LANDING_ZOOM.max });
const zoom = places.length === 0 ? ZERO_STATE_ZOOM : settleZoom(fitted?.zoom ?? HOME_LANDING_ZOOM.min);
frameBounds(map, { bounds, minZoom: zoom, maxZoom: zoom, markerAllowancePx: latestAllowance.current }, false);
```

Three things this shape buys, all of them free:

1. `frameBounds` already supports `minZoom === maxZoom` — near-me (mover 8) uses exactly that request
   shape, so no type changes and no new code path.
2. The `padding` is the same `paddingFor(map, latestAllowance.current)` the fit itself uses, so the
   settled zoom is measured against the band the chrome actually leaves visible.
3. `cameraForBounds` returning `undefined` (the impossible-fit case `fitTo:533` already guards)
   degrades to the world view rather than to a silent no-op.

**Record the framing as its own kind.** `Framing` in `map-surface.mapcn.tsx` gains
`{ kind: 'home' }`, and `refitFramed` (:653-668) dispatches it back through `fitToBounds` instead of
replaying a stored `FocusBoundsRequest`. A rotation or a URL-bar collapse then **re-derives** the
settle zoom against the new container, which is the correct behaviour and which also removes one of
the two replay paths W2-2 is about. `map-surface.mapcn.tsx` is held by both packages — **serialise
W2-1 and W2-2, W2-1 first.**

### 1.4 The band boundary, and the rounding hazard the original comment guarded

The guard window is `[8.35, 8.65)`. A fit landing inside it is resolved **outward, to 8.35**. Three
reasons, in order of weight:

1. **Zooming out never crops.** `camera-library-shapes.test.ts:173` asserts that every saved place is
   on the visible map at rest, and it is the strongest property the home view has. Resolving *inward*
   (to 8.65) zooms in ~23% linearly from a fit that has already spent its 48 px cosmetic margin, and
   on a 390×844 phone the vertical band after occlusion is ~570 px against a ~474 px fitted box — so
   inward resolution can push the outermost place a few pixels past the edge. Trading "every place on
   screen" for 0.15 of zoom is a bad trade.
2. **It degrades in the direction the original comment cared about.** The hazard named in
   `COUNTRY_LANDING_ZOOM`'s docblock is a camera that lands *accidentally* in the pin band. 8.35 is a
   0.15 float cushion below 8.5 and `easeTo` sets zoom exactly, so the ambiguity is gone in the
   direction that was always the dangerous one.
3. **A library that fits at exactly 8.5 is genuinely better summarised.** `zoom-bands.ts:19` defines
   8.5 as *"the point a 50 km cluster stops being a useful summary of itself"*. A library whose box
   needs 8.4 spans more than that; capsules are the honest answer for it.

The residual cost, stated rather than hidden: a library whose natural fit is in a 0.3-wide window
still opens without pins. That is a narrow window instead of the whole band, and it is bounded and
nameable, which the current defect is not.

### 1.4a The other half: the pin band is wrong too, and it is a separate fix

**The hypothesis put to me: the camera is not the broken half — `PIN_BAND_MIN = AREA_BAND_MAX = 8.5`
makes pins and area capsules mutually exclusive, and letting pins draw *underneath* the capsules
gives the user their places at rest without moving the camera at all.**

I evaluated it as an alternative to §1.3 and it is not one. I am ruling it in as an **addition**, and
the distinction matters more than it sounds.

**Where it does not carry the weight.** Run the owner's library through it with the ceiling left in
place. Home rests at z8.0; at latitude 32 that is ~518 m/px, so Tel Aviv's nine places inside ~10 km
occupy **19 px** — one pin-width. All four cities together span 320 px. What the user sees is four
smudges, each under the grey pill that already tells them the count, and the only fact added is
spatial distribution *within* an area, which at 19 px is nil. Every place name is unreadable, no
individual place can be pointed at, and 3 places look the same as 30.

That would satisfy K14's literal words — pins are drawn — while shipping a screen nobody designed.
It is precisely the failure mode §8a's Q1 exists to catch, and I will not specify something whose
main property is passing a grep. **The camera fix is the fix**; at z9.7 the same library resolves
into four legible clusters of individual pins, which is the thing the defect says is missing.

**Where it genuinely earns its place, and why I want it anyway.** Once the ceiling is gone, home
rests in the area band only when the library's box *honestly* needs 4.5 ≤ z < 8.35 — a library
spread over roughly 60–500 km. Two-to-four cities a few hundred km apart: London and Paris, three
Italian cities, the US north-east. **For those libraries no camera can help** — that is what "the box
does not fit above the pin band" means — and today they are the case that gets flag discs or grey
pills and nothing else. The two fixes cover disjoint sets of libraries, which is exactly why they are
both worth having:

| Library's honest fit | Fixed by |
|---|---|
| `z ≥ 8.65` — one city, one metro, one small country | **§1.3, the camera.** Real pins, named |
| `4.5 ≤ z < 8.35` — a few cities, a few hundred km | **§1.4a, the band.** Position, as texture, under the pill that names it |
| `z < 4.5` — continental | Neither, and correctly: flag discs are the answer at world zoom |

**And it is what makes `band.cross` coherent.** §3a asks for pins that *cross-fade into their area
pill instead of hard-swapping*. Without a dust layer there is nothing to cross-fade — pins simply do
not exist below 8.5, so the "fade" is a fade from nothing. With it, zooming in through the boundary
is one continuous idea: dots become pins, the pill fades out, and the user sees that **these are the
same objects**. The lead is right about that, and it is the strongest argument for the change.

#### The specification — `W2-1b`, its own package

**It is a `circle` layer, in its own file, and both of those are forced.**

`tests/unit/map/no-density-clustering.test.ts:62-66` reads `place-marker-layer.tsx` **as text** and
asserts it contains exactly one `map.addLayer(` and the string `type: 'circle'` nowhere. That guard
is correct and must not be weakened. So the dust goes in **`src/components/map/pin-dust-layer.tsx`**,
a new file following `summary-marker-layer.tsx`'s shape (`useMap`, `useStyleReady`,
teardown-before-setup, one effect owning the data). It may share the pin layer's GeoJSON source
only if that source is lifted; simplest and cheapest is its own source over the same
`toPlaceFeatures` output.

```ts
// zoom-bands.ts — derived from two band edges, never written as numbers.
/** Where the saved places are drawn as position-only dust, beneath the area pills that name them.
 *  Not a fourth band: `bandForZoom` still owns which *summary* is drawn, and this range is stated
 *  as two of its edges so tuning the bands moves it. */
export const PIN_DUST_ZOOM = { min: AREA_BAND_MIN, max: PIN_BAND_MIN } as const;
```

| Property | Value | Why |
|---|---|---|
| layer type | `circle` | 2,000 instanced quads with no glyph shaping, no image atlas and no collision. The cheapest primitive that can carry position |
| `minzoom` / `maxzoom` | `PIN_DUST_ZOOM.min` / `.max` | Exactly the area band. Not the country band: at z2 a dot sits behind the flag disc drawn at the same centroid |
| `circle-radius` | `['interpolate', ['linear'], ['zoom'], 4.5, 2.5, 8.35, 4.5]` | Grows into the pin it is about to become |
| `circle-color` | **one colour** — `UNCATEGORISED_COLOR` from `@/ui/place/palette` (W0-2 has landed; the module exists) | See below |
| `circle-stroke-width` / `-color` | `1` / the background token | Answers `summary-marker-layer.tsx`'s "invisible against our own basemap" objection, and makes two overlapping dots read as two |
| `circle-opacity` | `pinOpacityExpression()` | A place you have been to is quieter here too, by the same rule and the same expression |
| labels | **none. No `text-field` at all** — not a gated one | See the budget note |
| click handler | **none.** No `map.on('click', …)`, no `mouseenter` cursor | See the interaction note |

**One colour, not four, and this is a real ruling against the grain.** Facelift decision #2 says the
pin may change colour because colour is the map's only encoded fact. Finding 4 says two of the four
category colours *already* fail to separate at full pin size. At a 3 px disc none of them separate,
so four colours here would be a four-value encoding the eye cannot resolve — decoration wearing
data's clothes, which is the one thing run rule 3 forbids. At this zoom the encoded fact is
**position**, and nothing else. If the owner wants category colour down here, it needs the ~1.5 km
neighbourhood band first, where a dot is big enough to mean something.

**No click handler, and it is load-bearing.** `place-marker-layer.tsx`'s header notes that a symbol
layer cannot answer a tap outside its band because placement only fills the collision index inside
it — *"a **circle** layer would; see `inBand` and the area disc's own guard."* That sentence is about
this exact hazard. Today a tap in the area band hits the area pill and flies to the area, which is
correct; if the dust answered taps it would open an arbitrary one of nine overlapping places. **The
dust is not a target.** No handler, no cursor change, nothing in the accessibility tree — the list
remains the accessible representation of the map, unchanged.

**The frame budget.** §2's measurement is 2,000 symbols with labels **gated** at 19.0 ms median /
60.5 ms p95, and 34.0 ms / ~29 fps with labels forced on. Two things follow, and the first is the
answer to the label question: **labels stay off entirely below `PIN_BAND_MIN`** — not gated by a
`step` expression, but absent from the layer, because a `circle` layer has no text field to gate. So
the 34 ms case is unreachable here by construction. My expectation is that 2,000 circles cost
materially less than the 19.0 ms symbol case, because circles skip glyph shaping, the image atlas
and symbol placement entirely — but that is **ASSUMED, not measured, and I cannot measure it.**
W2-1b does not close until the harness that produced §2's numbers has been run against the area band
at 2,000 places, on the same machine, and the number is in the ledger. If it regresses, the dust is
the thing that goes, not the camera fix.

**`bandForZoom` stays the one definition, and here is precisely how.** The invariant in
`zoom-bands.ts` is that the three *summary* layers are exhaustive and mutually exclusive — there is
no zoom at which two of them draw and none at which none does. The dust does not touch that: it is
not a summary and not a band, it is a second rendering of the pins whose range is *derived from two
band edges*. Three rules keep it from becoming a second definition:

1. `PIN_DUST_ZOOM` is written as `{ min: AREA_BAND_MIN, max: PIN_BAND_MIN }` — **no numeral appears**,
   so tuning a band edge moves the dust with it, in the same commit, automatically.
2. `pin-dust-layer.tsx` imports `PIN_DUST_ZOOM` and nothing else from `zoom-bands.ts`. It never calls
   `bandForZoom` and never compares a zoom itself.
3. A test asserts the seam: `PIN_DUST_ZOOM.max === PIN_BAND_MIN` and
   `PIN_DUST_ZOOM.min === AREA_BAND_MIN`, so "the dust ends exactly where the pins begin" is pinned
   rather than remembered. Add a sentence to `bandForZoom`'s docblock saying the dust exists and why
   it is not a fourth band — run rule 7 cuts both ways, and a reader who finds a fourth zoom range in
   another file deserves to be told in this one.

**Exit criterion.** With a library of 8 places across three cities ~200 km apart, the home map at
rest shows three area pills **and** eight dots positioned under them, no labels, and tapping a dot
does nothing while tapping a pill still flies to the area. Frame budget measured and recorded.

### 1.5 The six cases

`n` = saved places · `B` = union of the **areas'** boxes (`map-page-client.tsx:367-370`, unchanged) ·
`z` = `settleZoom(fit(B))`.

| Case | Camera | What draws | The sheet |
|---|---|---|---|
| **0 places** | `ZERO_STATE_ZOOM` (11) over the timezone region (§1.7). Not a fit — a fixed zoom at a centre | Basemap only. Real streets, no pins, no capsules, **no dust** | `Your map starts here.` + the line + `Add a TikTok`, resting at **`half`**. See Spec 3 |
| **3 places, one city** | `z ≈ 11–13` → pin band | **3 pins**, named (W2-3 tiers the labels) | Global scope → `3 places in {City}` |
| **3 places, three countries** | `B` spans continents → `z ≈ 1–3` → country band | **3 flag discs**, each reading `1`. No dust — a dot behind a flag disc is nothing | `3 places in 3 countries` (`list-scope.ts` §365 already emits this) |
| **3 places, three cities ~200 km apart** | `z ≈ 6–8` → area band | **3 area pills + 3 dots** beneath them (§1.4a). The case only the band fix reaches | `3 places in {Country}` |
| **30 places, one city** | `z ≈ 10–12` → pin band | **30 pins**; labels tiered so the nearest are named | `30 places in {City}` |
| **30 places, several countries** | `z` in the country or low area band | Flag discs; area pills **with dust** for a one-country spread | `30 places in 4 countries` / `30 places in {Country}` |
| **300 places, one city** | `z ≈ 10–12` → pin band | **300 pins.** This is where the product dies and the answer is not the camera | `300 places in {City}` |

**The 300-place case is not solved by this package and must not be pretended away.** At one city and
one ~50 km area, 300 pins at z11 is the overlapping mat `place-marker-layer.tsx`'s header already
describes as the accepted cost of removing clustering. The named repair is
[`growth-plan.md`](growth-plan.md) §5 item 7 — **a ~1.5 km neighbourhood band** — and it is out of
scope tonight. What this spec owes it is that nothing here blocks it: a third band drops in as two
more constants and one more `settleZoom` guard window, because every band edge is consulted in one
function. **Q1's 300-place walkthrough will find a mat of pins. That is a known, recorded outcome,
not a W2-1 regression.**

The one-place library is worth naming because it is the second screen every new user sees: `B` is a
zero-extent box, `cameraForBounds` answers a degenerate box with its `maxZoom`, so `z = 15` and the
user lands on their one pin at street level. Correct, and it is the same behaviour as the post-import
flight, which is what makes the two feel like one product.

### 1.6 `band.cross` — the pins/pill cross-fade

`facelift-plan.md` §3a lists `band.cross` at 200 ms: *"pins cross-fade into their area pill instead
of hard-swapping"*. With §1.4 in place, **home never rests inside the transition**, so this animation
is only ever seen during a user's own pinch — which is exactly where it communicates something ("that
pill is these pins").

**With §1.4a it becomes a real cross-fade rather than a fade from nothing**, and this is the argument
for building the two together: the dust *is* the outgoing state. Zooming in through the boundary, the
dots grow into pins, the pill fades out, and the three ramps say one thing — **these are the same
objects at three fidelities**.

Mechanism, and it must be this one: **overlap the ranges by the guard and drive opacity with a zoom
`interpolate`.** No zoom listener, no React state, no re-render — the same property that makes the
bands cost nothing today.

- Pin layer: `minzoom = PIN_BAND_MIN - BAND_EDGE_GUARD` (8.35), and `icon-opacity` /`text-opacity`
  multiplied by `['interpolate', ['linear'], ['zoom'], 8.35, 0, 8.65, 1]`.
- Dust layer: `maxzoom` stays `PIN_BAND_MIN`, and `circle-opacity` multiplied by the inverse ramp
  over the same two stops, so the dots are gone by the time the pins are solid.
- Area layer: `maxzoom = PIN_BAND_MIN + BAND_EDGE_GUARD` (8.65), and its `icon-opacity` multiplied by
  the inverse ramp.
- Both are **paint** properties, so neither re-lays-out nor re-collides anything.
- Reduced motion: **none needed, and none may be added.** The ramp is a function of zoom, not of
  time — under `prefers-reduced-motion` the user is still pinching, and a zoom-driven opacity ramp is
  the reduced-motion form of a cross-fade already.
- The composition with `pinOpacityExpression` matters: the band ramp multiplies the existing
  visited/dim expression, it does not replace it. `['*', <band ramp>, <existing case>]`.

Owner of this: **W2-1** if it lands with the band change (they are the same two constants), otherwise
W6-6. Do not split it across both — two agents writing `marker-style.ts` is data loss.

### 1.7 The zero-places region — ruling on `EMPTY_LIBRARY_BOUNDS` (W2-5)

Both ends re-read before ruling: the constant at `src/ui/place/viewport.ts:55` and its only consumer,
the `initialBounds` memo at `map-page-client.tsx:367-370`. The consumer is the load-bearing half —
**the zero-place region is delivered through the identical prop path as a real library's box**
(`areas.length > 0 ? unionBounds(…) : EMPTY_LIBRARY_BOUNDS`), so the surface cannot tell the two
apart by looking at the box. That is exactly why §1.3 selects the zero-state zoom on
`places.length === 0` inside the surface rather than on the shape of what it was handed.

The docblock is wrong in two ways and the constant is a guess:

- it cites `HOME_LANDING_MIN_ZOOM`, which no longer exists;
- it claims *"an honest fit of it already rests inside the pin band"*, which cannot happen — the box
  is 0.4° × 0.5°, which fits a phone at ~z10.6, and the ceiling then clamps it to 8.0. Today's
  zero-place first screen is a **region drawn as two grey capsules with nothing in them**.

**The ruling.** `ux-map-is-the-query.md` §5 already decided the mechanism and it stands: a regional
map framed **from the browser timezone**, no permission prompt, no IP lookup, no
`navigator.geolocation` call. What is added here is the table, the zoom and the honesty rule.

```ts
/** IANA zone → the centre of a metro area, for the zero-places camera only.
 *  It is a display default, never a claim about where the user is: nothing in the product ever
 *  names this city, and one saved place retires it forever. */
const ZERO_STATE_REGIONS = {
  'Asia/Jerusalem':      { lat: 32.0853, lng: 34.7818 },  // Tel Aviv — see OQ-2
  'Asia/Tel_Aviv':       { lat: 32.0853, lng: 34.7818 },  // legacy alias some browsers still report
  'Europe/London':       { lat: 51.5074, lng: -0.1278 },
  'Europe/Paris':        { lat: 48.8566, lng:   2.3522 },
  'Europe/Berlin':       { lat: 52.5200, lng:  13.4050 },
  'Europe/Madrid':       { lat: 40.4168, lng:  -3.7038 },
  'Europe/Rome':         { lat: 41.9028, lng:  12.4964 },
  'Europe/Lisbon':       { lat: 38.7223, lng:  -9.1393 },
  'America/New_York':    { lat: 40.7128, lng: -74.0060 },
  'America/Los_Angeles': { lat: 34.0522, lng:-118.2437 },
  'Asia/Tokyo':          { lat: 35.6762, lng: 139.6503 },
  'Asia/Bangkok':        { lat: 13.7563, lng: 100.5018 },
  'Australia/Sydney':    { lat: -33.8688, lng: 151.2093 },
} as const;
```

- `EMPTY_LIBRARY_BOUNDS` **keeps its name and becomes the London fallback** — it is referenced by
  `tests/unit/ui/viewport.test.ts:55-69` and `camera-library-shapes.test.ts:131`, and those
  assertions (a real box, under 1° per side, its centre inside it) stay meaningful and stay true.
- New export `zeroStateBounds(timeZone: string | null): ViewportBounds` — the region for the zone,
  else `EMPTY_LIBRARY_BOUNDS`. Box = centre ± 0.02° lat, ± 0.024° lng. **Non-degenerate on purpose**,
  so those existing assertions hold; the extent is irrelevant to the camera because the zoom is
  pinned at 11.
- The zone is read **client-side only**: `typeof window === 'undefined' ? null :
  Intl.DateTimeFormat().resolvedOptions().timeZone`. On the server that yields the London fallback,
  which is fine because the value never reaches the DOM as text — it is a prop to a canvas. **If any
  future change renders the region name, this becomes a hydration bug and a privacy question at
  once.** Do not render it.
- Delete the sentence *"Sized so an honest fit of it already rests inside the pin band"* and replace
  it with the truth: the zero-state does not fit anything, it rests at `ZERO_STATE_ZOOM`.

`W2-5` therefore reduces to: the table, the helper, the corrected docblock, and its unit test. The
camera half of it is W1-1 (Spec 3) and W2-1. **All three touch `src/ui/place/viewport.ts` — one
agent, or three commits in wave order, never two at once.**

### 1.8 What changes, what must not, and what has to be re-pinned

**Files (W2-1).** `src/components/map/zoom-bands.ts` · `src/components/map/map-surface.mapcn.tsx` ·
`src/components/map/marker-style.ts` and `summary-style.ts` (only for `band.cross`) ·
`src/ui/place/viewport.ts`.

**Files (W2-1b, §1.4a).** New `src/components/map/pin-dust-layer.tsx` · `zoom-bands.ts`
(`PIN_DUST_ZOOM` and one docblock sentence) · `map-surface.mapcn.tsx` (mounting it, guarded by the
same `hasSummaryBands` expression that decides `replacedBelowZoom` — a surface with no bands has no
pill for the dust to sit under, so `/collections/[id]` gets neither). **`place-marker-layer.tsx` is
not opened by this package**, and the guard at `no-density-clustering.test.ts:62-66` is why.

**Must not change:** the home *box* (the union of area boxes — that is the fix that stays); the
`fitTo` path used by movers 2, 3, 7 and 8, which already frame into the pin band with their own
ranges; `COUNTRY_LANDING_ZOOM` and its clamp; `pinLayerZoomRange`'s conditional floor and the
`replacedBelowZoom === null` contract — a collection map still has no bands and still keeps its pins
at every zoom.

**Three tests encode the defect and must be updated in the same commit, with the reason in the test's
own docblock** (run rule 7: never delete a comment explaining *why* — update it):

| Test | What it asserts today | What it should assert |
|---|---|---|
| `tests/unit/map/zoom-bands.test.ts:91-94` | `bandForZoom(HOME_LANDING_ZOOM.max) === 'area'` | `settleZoom` never returns a value inside the guard window, at any input |
| `tests/unit/map/zoom-bands.test.ts:105-107` | home rests no further in than a country tap | delete — the two landings are no longer one band apart, and a country tap zooming *in* from a pin-band home is correct |
| `tests/unit/map/camera-library-shapes.test.ts:159-166` | every populated shape settles **out of** the pin band | a one-city shape settles **in** the pin band; a multi-country shape settles out of it; **no shape settles inside the guard window** |

`camera-library-shapes.test.ts:173-180` (every place on the visible map) and `:192` (order
independence) **stay exactly as they are** and are the regression guard for this package.

**New tests owed:** `settleZoom` across the six cases as a table; the guard window as a property
(`for z in 8.0..9.0 step 0.01, bandForZoom(settleZoom(z))` is never ambiguous); the zero-places arm
returning 11; `zeroStateBounds` for a known zone, an unknown zone and `null`.

**Exit criterion, restated so it is checkable:** with three saved places in one city, the home map at
rest at 390×844 draws three pins. With three saved places in three countries it draws three flag
discs and **that is a pass, not a fail** — see **OQ-5** on K14's wording.

---

## Spec 2 — The state matrix, made checkable (W3-1 – W3-4)

### 2.0 Tokens this spec assumes W0 registered

I am specifying against names, not values. **Every one of these must exist after W0-1 or the row that
uses it cannot be built as written** — if a name is missing, report it rather than reaching for a
bracket, because rule 6a counts a bracket as a review failure.

| Token | Utility | Value I am designing to | Source |
|---|---|---|---|
| `--duration-press` | `duration-press` | 90 ms | §3a `press` |
| `--duration-enter` | `duration-enter` | 140 ms | §3a `enter` |
| `--duration-link` | `duration-link` | 160 ms | §3a `row ↔ pin` |
| `--duration-settle` | `duration-settle` | 180 ms | §3a `filter.settle` |
| `--duration-band` | `duration-band` | 200 ms | §3a `band.cross` |
| `--duration-base` | `duration-base` | 220 ms | §3a `pin.select`, and the default |
| `--duration-count` | `duration-count` | 400 ms | §3a `count.tick` |
| `--ease-standard` | `ease-standard` | the workhorse | §3a |
| `--ease-emphasised` | `ease-emphasised` | arrivals and selections | §3a, run rule 6a |
| `--shadow-sheet` | `shadow-sheet` | replaces `shadow-[var(--shadow-elevated)]` at 4+ sites | run rule 6a |
| `--shadow-raised` | `shadow-raised` | the button's resting elevation, so press can drop a level | matrix, primary button |
| `--radius-md` | `rounded-md` | **referenced 4× and never defined** — facelift finding 5 | `button.tsx:25,26,30,32` |

**Two flags for W0.**

1. ~~`button.tsx` writes `rounded-[min(var(--radius-md),10px)]` three times; once `--radius-md`
   exists the `min()` is dead weight and the whole expression should become `rounded-md`.~~
   **Corrected 2026-08-31, and the original was a trap.** That was written while `--radius-md` was
   *undefined*, which made the `min()` collapse and those four sizes render square. W0-1 has since
   defined `--radius-md` at **0.875rem (14px)**, so `rounded-md` would now render them at 14 px
   instead of the 10 px and 12 px the `min()` was written to produce — **a restyle of four button
   sizes disguised as a bracket cleanup, on the four sizes that had just been repaired.** The
   registered escapes are `--radius-xs` (10 px) and `--radius-sm` (12 px, already present), so:
   `size: xs` and `icon-xs` → `rounded-xs`; `size: sm` and `icon-sm` → `rounded-sm`. K5 is satisfied
   either way; only one of them keeps the geometry. Check it in a browser regardless — these sizes
   have never rendered correctly, so "correct" will look like a change.
2. `place-sheet.tsx:396` and `place-desktop-panel.tsx:115` already use `duration-140`, a bare numeric
   duration. That compiles and is not a bracket, but it is a second way of saying `duration-enter`.
   Fold it in.

**One shared module, so K7 is checkable by reading three constants rather than grepping ninety class
strings.** New file `src/lib/interaction.ts` (beside `cn` in `@/lib/utils`, imports nothing):

```ts
/** Press feedback. One utility per pressable shape, so "every pressable thing acknowledges within
 *  one frame" is three strings a reviewer can read, not a property of ninety call sites. */
export const PRESS_BUTTON = 'motion-safe:transition-transform motion-safe:duration-press motion-safe:ease-standard active:scale-98';
export const PRESS_ROW    = 'motion-safe:transition-transform motion-safe:duration-press motion-safe:ease-standard active:scale-99';
export const PRESS_CHIP   = 'motion-safe:transition-transform motion-safe:duration-press motion-safe:ease-standard active:scale-95';
```

`active:scale-98` is the bare-value form of the matrix's `scale-[.985]`. **Verify it compiles against
the installed Tailwind 4.3.3.** If bare `scale-98` is rejected, the escape hatch is a `@utility` in
`globals.css` (`@utility press-scale { scale: 0.985 }`) — *not* a bracket.

### 2.1 The ten elements

For each: where it lives, where its state comes from **today**, and the variant expression that
replaces it. "Ternary" in the *Today* column is a rule-6a violation to be removed, not a style note.

---

**1 · Primary button** — `src/components/ui/button.tsx:6-7` (cva base) and `:11` (`default`).

*Today:* variants already, correctly. Base has `active:not-aria-[haspopup]:translate-y-px` — one of
the three existing `active:` uses. Missing: the scale, and the shadow drop.

```
base   + PRESS_BUTTON
default: bg-primary text-primary-foreground shadow-raised
         hover:bg-primary/80
         active:shadow-none
         disabled:opacity-45          ← matrix says 45%, cva base says 50%; take 45% and delete the base's
```
The existing `translate-y-px` and the new `scale-98` are **the same beat, not two** — keep the
translate for the `aria-haspopup` exclusion it already carries, and let scale ride the same
transition. Do not add a second duration.

**2 · Ghost / secondary / outline** — same file, `:12-17`.

*Today:* variants. Missing press and the border→mint hover the matrix asks for.
```
outline/secondary/ghost + PRESS_BUTTON
outline: hover:border-primary hover:bg-primary/5
ghost:   hover:bg-muted hover:text-foreground     ← unchanged, already correct
press:   active:translate-y-px (inherited from base) — no scale, per the matrix
```

**3 · Icon button** — `button.tsx:28-33` (`size: icon*`), plus four hand-rolled instances:
`src/components/ui/map.tsx:630,872` · `src/components/map/near-me-control.tsx:69,89` ·
`src/components/sheet/saved-place-edits.tsx:363` · `src/components/sheet/place-sheet.tsx:1103,732`.

*Today:* the four hand-rolled ones each restate hover and focus in their own words.
```
+ PRESS_BUTTON with active:scale-95 (the matrix's icon value)
hover:bg-muted hover:text-foreground
disabled:opacity-30
```
**W3-4 action:** the four hand-rolled ones become `<Button variant="ghost" size="icon">` with a
`className` for position only. That is four fewer chrome vocabularies and it is the cheapest row in
this table.

**4 · List row** — `src/components/sheet/place-sheet.tsx:641-665` (the `<button>`), `:640` (`<li>`).
Siblings that must move with it: `collection-content.tsx:745` · `add-to-collection.tsx:92,229,248` ·
`collections-index-client.tsx:326` · `place-sheet.tsx:1290` (the Nearby row).

*Today:* `hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors`. No
press, no selected state, and **no coupling to its pin** — that is W3-2, §2.2.
```
group/row + PRESS_ROW
hover:bg-muted/60
focus-visible:ring-3 focus-visible:ring-ring/50    ← keep, it is already right
aria-current=true → data/aria variant for the selected row:
  aria-[current=true]:bg-primary/8
  aria-[current=true]:before:absolute … a 2px mint rule on the inline-start edge
```
The selected row is **new** and it is what makes the map and the list one object: when
`selectedId === place.id` the row carries `aria-current="true"`. The mint rule is the matrix's "left
mint rule" written for RTL — `start-0`, never `left-0`; this list renders Hebrew names and
`place-sheet.tsx:613` already makes that point about `ms-auto`.

**5 · Tag chip** — `src/components/sheet/place-enrichment.tsx:96-101,141-146`.

*Today:* **a ternary.** `cn(CHIP_PRESSABLE, isTagActive(...) ? CHIP_PRESSABLE_ACTIVE :
CHIP_PRESSABLE_REST)`. The DOM already carries `aria-pressed` (`:139`), so the state is available to
CSS and is being computed in JavaScript anyway.
```ts
export const CHIP_PRESSABLE =
  'inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-full border px-3 text-xs font-bold outline-none ' +
  'motion-safe:transition-colors motion-safe:duration-press focus-visible:ring-3 focus-visible:ring-ring/50 ' +
  'border-[var(--tag-foreground)]/15 bg-[var(--tag)] text-[var(--tag-foreground)] hover:border-[var(--tag-foreground)]/45 ' +
  'aria-pressed:border-transparent aria-pressed:bg-[var(--tag-selected)] aria-pressed:text-[var(--tag-selected-foreground)] ' +
  PRESS_CHIP;
```
`CHIP_PRESSABLE_ACTIVE` and `CHIP_PRESSABLE_REST` are **deleted**, and with them both call sites'
ternaries. Note the three `var(--tag*)` reaches are semantic tokens already, not raw mint — W0-3
should register them as colour keys so they become `bg-tag` / `bg-tag-on`, but they are not part of
the 75 raw `--mint-N` sites.

**6 · Category chip** — `src/components/sheet/category-filter-bar.tsx:162-166` (visit chip),
`:208-212` (category chip), `:218-222` (the dot).

*Today:* the same ternary twice, plus a second one on the dot (`active && 'bg-current'`) and an
inline `style={{ backgroundColor: display.color }}`.
```
className={cn(CHIP_PRESSABLE, BAR_CHIP)}        ← the ternary disappears with #5
dot: 'size-2 shrink-0 rounded-full bg-(--chip-dot) group-aria-pressed:bg-current'
```
**W2-4's half of this row** — the pressed chip filling with the *category's own* colour rather than
house mint — is a CSS variable set once on the button:
`style={{ '--chip-dot': display.color, '--tag-selected': display.color } as CSSProperties}`. The
variant expression is then unchanged and the colour is data. That is the only honest way to do it:
there are four category colours and they come from data, so they cannot be four variants.
**Counts already render** (`:224`) — W2-4's exit criterion is only half open.

**7 · Nav tab** — `src/components/nav/bottom-nav.tsx:276-286`.

*Today:* **a ternary** on `active`, and the DOM already carries `aria-current` (`:278`).
```
'flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 font-medium'
'motion-safe:transition-colors motion-safe:duration-press'
'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
'aria-[current]:bg-muted aria-[current]:text-foreground'
+ PRESS_CHIP  (active:scale-95, per the matrix)
```
`aria-[current]` (attribute-presence) rather than `aria-[current=page]`, because this component
passes `'page'` *or* `'true'` (`:191`) and both mean on.

**8 · Map pin** — `src/components/map/marker-style.ts` + `place-marker-layer.tsx`. **No Tailwind
reaches this row and none may be introduced** (rule 6: MapLibre expressions take named exports).

| Column | Where it lives |
|---|---|
| Hover | §2.2's hover layer — 1.1×, name shown, neighbours to 45% |
| Focus-visible | the **canvas focus proxy**: MapLibre gives the canvas `tabindex`, so the ring goes on the map container in `src/components/ui/map.tsx` — `focus-within:ring-3 focus-within:ring-ring/50 focus-within:ring-inset`. Today there is none, and a keyboard user panning the map gets no focus indication at all |
| Press | none. A canvas has no press state; the matrix says so |
| Selected | `pinIconImageExpression` (`marker-style.ts:180`) + `pinSortKeyExpression` — **already correct**, 1.28× with its own bitmap and drawn last |
| Disabled / filtered out | `pinOpacityExpression` — already correct for `visited`; filter-out at 35% + shrink is `filter.settle` and belongs to W2-4/W5-3, not here |

**9 · Input** — `src/components/ui/input.tsx:12`. Hand-rolled duplicates that should consume it:
`saved-place-edits.tsx:438,570` · `collection-place-detail.tsx:448` · `import-page-client.tsx:1100`.

*Today:* focus and disabled are right; **hover is missing entirely** (the matrix's "border warms").
```
+ 'hover:border-ring/60'
disabled: unchanged — bg-input/50 + opacity-50 is the matrix's "muted ground"
```
No press row: an input has none.

**10 · Sheet handle** — `src/components/shell/map-shell.tsx:242`.

*Today:* `mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border`. Inert. 36 px wide against the
matrix's 34→44.
```
'mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border'
'motion-safe:transition-[width,background-color] motion-safe:duration-press motion-safe:ease-standard'
'hover:w-11 hover:bg-muted-foreground/40 active:w-11 active:bg-muted-foreground/60'
'focus-visible:ring-3 focus-visible:ring-ring/50'
```
"Tracks the drag" needs a state vaul owns. **`active:` on the handle is what ships**; if vaul 1.1.2
sets a dragging attribute on `Drawer.Content`, couple with `group-data-[…]:w-11` and say which
attribute in the commit message. **Do not assert that it does without checking** — I could not.

### 2.2 W3-2 — the `group` coupling, across the DOM/canvas boundary

This is the row that makes the library and the map read as one surface, and it is the only one in the
matrix that crosses a rendering boundary. Pins are painted into a WebGL canvas and have no nodes, so
`group-hover:` cannot reach them: the DOM half and the canvas half are two mechanisms carrying one
idea.

**a. The DOM half (this is what makes K8's `group-hover:` count non-zero).**

`PlaceRow`'s `<button>` (`place-sheet.tsx:641`) carries `group/row`. Inside it:

| Child | Line | Variant |
|---|---|---|
| the category disc | `:565-579` | `motion-safe:transition-transform motion-safe:duration-link group-hover/row:scale-110` |
| the name | `:585` | `group-hover/row:text-foreground` (it is already `text-foreground`; the *muted* second line at `:599` is the one that lifts: `group-hover/row:text-foreground/80`) |
| the distance | `:618-626` | `group-hover/row:text-foreground` |

Named group (`group/row`), not bare `group`, because rows nest inside other grouped containers on
`/collections` and an unnamed group would leak.

**b. Carrying the hover across.**

- `PlaceRow` gains `onHover?: (id: string | null) => void`, called from
  `onPointerEnter`, `onPointerLeave`, `onFocus`, `onBlur`.
- **`onPointerEnter` must check `event.pointerType === 'mouse'`.** A touch tap emits
  `pointerenter`, and without the guard every tap on a phone dims the whole map for the frame before
  the camera flies. This is the single most likely defect in this package.
- `PlaceSheet` and `PlaceDesktopPanel` pass it through; `map-page-client.tsx` holds
  `const [hoveredId, setHoveredId] = useState<string | null>(null)` and hands it to `MapShell` →
  `MapSurface` → `PlaceMarkerLayer` as `hoveredPlaceId`.
- No throttle. Hover changes at human rate and `setState` with an identical value bails.
- `hoveredId` is **not** a camera mover, must never become one, and must not be added to the eight in
  `map-page-client.tsx:229`'s docblock.

**c. The canvas half — two effects, both paint-only.**

*Neighbours dim.* Extend the existing expression (`marker-style.ts:229`) rather than adding a second
one:

```ts
export const LINKED_DIM_OPACITY = VISITED_PIN_OPACITY; // 0.45 — one number, two meanings on purpose
export function pinOpacityExpression(
  visitedOpacity = VISITED_PIN_OPACITY,
  hoveredId: string | null = null,
): unknown[] {
  const own = ['case', ['to-boolean', ['get', 'visited']], visitedOpacity, 1];
  if (hoveredId === null) return own;
  // 0 for the hovered pin: the highlight layer draws it instead, and drawing both would double the
  // ring and the shadow. Everything else drops to the level a visited pin already sits at, so a
  // visited neighbour does not move at all.
  return ['case', ['==', ['get', 'id'], hoveredId], 0, LINKED_DIM_OPACITY];
}
```
Applied in a new effect in `place-marker-layer.tsx`, mirroring the selection effect at `:237-241`:
`setPaintProperty(pinLayerId, 'icon-opacity' | 'text-opacity', …)`. Set
`icon-opacity-transition: { duration: 160, delay: 0 }` once at layer creation — that is
`--duration-link`, expressed in the only place MapLibre can read it.

*The hovered pin lifts.* A **second, one-feature symbol layer** added immediately above the pin
layer, source = a GeoJSON collection holding zero or one features:

- `icon-image`: the same unselected image (`pinImageId(category, false)`), `icon-size: 1.1`
- `icon-translate: [0, -3]` — a paint property, and **not data-driven in MapLibre**, which is exactly
  why this must be its own single-feature layer rather than an expression on the pin layer
- `icon-translate-transition: { duration: 160 }`, or `{ duration: 0 }` under reduced motion
- `text-field: ['get', 'name']` with **no zoom gate** — the hovered pin is named at any zoom, which is
  the whole point of the coupling
- no `minzoom` beyond the pin layer's own

**Rejected alternative, and why:** swapping the hovered pin's `icon-image` on the main layer (the
mechanism selection uses) is a *layout* property change, which re-lays-out and re-collides every
symbol in the layer. Selection pays that once per tap; hover would pay it per pointer move across a
list. At the 2,000-pin ceiling that is the frame budget gone. A one-feature layer costs one symbol.

**Reduced-motion arm.** The dim **is** the reduced arm and stays in both cases — §3a: "all nine
collapse to the opacity change alone, not to nothing, because the pin just selected still has to be
findable". What `prefers-reduced-motion` removes is only the 160 ms translate: the highlight appears
at its final position instantly. Read it with `window.matchMedia('(prefers-reduced-motion: reduce)')`
inside the effect; if W3-3 lands a shared hook, consume that instead.

**Out of scope, deliberately:** the reverse coupling (hovering a pin highlights its row). K8 asks for
row→pin. The reverse needs a `mousemove` handler over the canvas and a scroll-into-view, and it is a
different package. Do not add it tonight.

**If 1.1× resampling reads soft on a retina display**, the repair is a dedicated hover bitmap in
`marker-images.ts` — **but that file is W4-3's** (the crumb silhouette). Report it; do not open the
file.

### 2.3 W3-3 — the `motion-safe:` inversion, per animation

The rule, and it is one sentence a reviewer can apply to any diff:

> **Opacity is unconditional. Transform, translate, scale and stagger are `motion-safe:` only.**

That is the inversion working as intended: the un-prefixed state *is* the reduced case, and the
reduced case is never "nothing" — it is the opacity change, which is what keeps the thing that just
changed findable.

| Animation | Un-prefixed (the reduced case) | `motion-safe:` adds |
|---|---|---|
| `press` | nothing — the colour change already landed | `transition-transform duration-press ease-standard` + `active:scale-*` |
| `row ↔ pin` | the dim, and the pin's own highlight at its final position | the 160 ms `icon-translate` |
| `pin.select` | the 1.28× bitmap swap, instantly | the expanding ring, 220 ms `ease-emphasised` |
| `filter.settle` | rows and pins appear/disappear; opacity only | the 40 ms stagger and the shrink |
| `band.cross` | the zoom ramp — **already reduced-motion-safe**, it is a function of zoom, not time | nothing |
| `pins.land` | pins present at the end of the flight | the staggered drop |
| `sheet.stop` | vaul's own reduced handling — **do not touch it** | — |
| `count.tick` | the final number, rendered | the 0→N count |
| `enter` | `animate-in fade-in-0 duration-enter` — **opacity, so it stays for everyone** | `motion-safe:slide-in-from-bottom-1` (the 4 px rise) |

**Concrete edits (8 `motion-reduce:` sites today, 0 `motion-safe:`):**

- `place-sheet.tsx:396`, `place-desktop-panel.tsx:115` — drop `motion-reduce:animate-none`, keep the
  fade, change `duration-140` → `duration-enter`. Reduced-motion users gain a 140 ms opacity fade,
  which is the design system's stated reduced form, not a regression.
- `import-page-client.tsx:1145,1774,2237` — `transition-colors motion-reduce:transition-none` →
  `motion-safe:transition-colors`. A colour transition is not motion, but the inversion is what makes
  the rule mechanical; keeping one hand-audited exception is how the rule dies.
- The five `animate-spin` sites (`bottom-nav.tsx:396,417`, `import-page-client.tsx:1217,1284,1913`)
  → `motion-safe:animate-spin`. Each already sits beside live text (`Working on it`, `Adding…`), so
  the still glyph is not the only signal. Verify that in the browser pass — a lone frozen spinner
  would be a worse state than none.
- `map-surface.mock.tsx:175` has `hover:scale-110` with no reduced arm. It is the mock surface, not
  production; leave it unless something else opens the file.

**Checkable by grep:** after W3-3, `grep -rn 'transition-transform\|animate-\|translate-y-\|scale-1' src --include='*.tsx'` should show no unprefixed transform-bearing utility outside `PRESS_*` and the
`enter` rule.

### 2.4 The inspection checklist

One row per matrix element, answerable **by reading, with no browser**, which is what makes an
independent verifier possible.

| # | Element | Pass when |
|---|---|---|
| 1 | Primary button | `button.tsx` base contains `PRESS_BUTTON`; `default` has `shadow-raised`, `active:shadow-none`, `disabled:opacity-45` |
| 2 | Ghost/secondary | `outline` has `hover:border-primary`; all three inherit `PRESS_BUTTON` |
| 3 | Icon button | `size: icon*` reaches `active:scale-95`; the four hand-rolled instances are `<Button variant="ghost" size="icon">` |
| 4 | List row | `group/row` present; three `group-hover/row:` children; `aria-[current=true]:` selected state; `PRESS_ROW` |
| 5 | Tag chip | `CHIP_PRESSABLE_ACTIVE` / `_REST` no longer exist anywhere in `src/` |
| 6 | Category chip | no ternary in `category-filter-bar.tsx`; the pressed fill comes from `--tag-selected` set as data |
| 7 | Nav tab | no ternary in `bottom-nav.tsx:279`; `aria-[current]:` carries both states |
| 8 | Map pin | `pinOpacityExpression` takes `hoveredId`; a single-feature hover layer exists; the map container has `focus-within:ring-3` |
| 9 | Input | `input.tsx` has `hover:border-ring/60`; the four hand-rolled inputs consume `<Input>` |
| 10 | Sheet handle | `hover:w-11 active:w-11` on `Drawer.Handle`, with `motion-safe:transition-[width,…]` |
| — | Rule 6a | `grep -c 'active:'` ≥ 3 shared strings · `group-hover` > 0 · `motion-safe` > 0 · no new bracket |

---

## Spec 3 — The zero-state screen (W1-1)

### 3.1 What is already built — do not rebuild any of it

`ux-map-is-the-query.md` §5 is the spec and most of it **shipped**. Read this before writing a line:

| §5 requirement | Status |
|---|---|
| `Your map starts here.` heading | **Built** — `place-sheet.tsx:813` (`EMPTY_LIBRARY_HEADING`), used at `:301` and `place-desktop-panel.tsx:117` |
| The one line beneath it | **Built** — `EmptyLibraryLine`, `place-sheet.tsx:820-826` |
| `Add a TikTok`, full width, thumb zone | **Built** — `NoPlacesYet`, `place-sheet.tsx:836-850` |
| Desktop: heading, line, button, **search field hidden**, filter bar hidden | **Built and correct** — `place-desktop-panel.tsx:117-145` |
| At `peek` the header line reads the heading | **Built** — `place-sheet.tsx:301` |
| The import overlay opens automatically | **Not built** — `showImport` is `useState(false)`, `map-page-client.tsx:182` |
| A regional map from the browser timezone | **Not built** — `EMPTY_LIBRARY_BOUNDS` is one guessed metro (§1.7) |
| The sheet rests at `half` | **Not built** — `useMapShell({ restingStop: 'peek' })`, `map-page-client.tsx:180` |

**So W1-1 is four wiring changes and one composition correction.** It is not a screen build, and any
new component in this package is out of scope by the spec's own words.

### 3.2 The correction — §5's central premise is false against the shipped component

§5 says the overlay opens *"over that map"*, and point 1 requires the map to be *"real, styled and
regional"*. **On mobile it will not be visible.** `ImportPageClient`'s root is
`absolute inset-0 z-50` with a full-bleed `--brand-wash` backdrop
(`import-page-client.tsx:835,849-856`); the `lg:` arm hides that wash and substitutes a dim scrim, so
**the map shows through on desktop and is completely covered on mobile.** Auto-opening the overlay as
it stands therefore ships a first screen that is a paste field on a gradient — which fails K13 ("the
paste field **and** a framed map") while appearing to satisfy §5.

That premise was mine, in an earlier document, and it is wrong. The delta:

> **Add one optional prop, `presentation?: 'takeover' | 'over-map'` (default `'takeover'`,
> i.e. today's behaviour byte-for-byte). `/map` passes `'over-map'` only when it auto-opened the
> overlay for an empty library.**

Under `'over-map'` at `< lg`:

- the `--brand-wash` div is not rendered (it already knows how to not render — `:851`);
- `<main>` becomes a scrim: `bg-foreground/20`. **No `backdrop-blur`** — six blurred surfaces already
  sit over the live canvas (facelift finding 12) and W7-6 owns that risk;
- the inner card (`:871-892`) anchors to the bottom instead of filling:
  `inset-x-0 bottom-0 top-auto max-h-[68dvh] rounded-t-2xl border-t border-border/70 bg-card shadow-sheet`,
  keeping its existing `px-5` and `pb-[calc(env(safe-area-inset-bottom)+1.5rem)]`;
- the top ~32% of the viewport is live map. That is the *framed regional map*, and it is above the
  card rather than behind it, which is the only arrangement at 390 px that shows a map and a form at
  once without veiling either.

**On submit the card takes the full height** (`presentation` reverts to `'takeover'` behaviour the
moment `screen.kind !== 'paste'`). That transition is a real beat, not a glitch — it is the product
saying *now I am working* — and it is specified: `motion-safe:transition-[max-height] duration-base
ease-emphasised`; reduced arm, instant. If it proves janky on a device, the fallback is to open in
`'takeover'` from the first submit with no transition. Both are acceptable; the transition is the
preference. **OQ-3.**

`'over-map'` is used by exactly one call site. Every other entry into the import flow —
`＋` → Add sheet, the nav bar's shared-link handoff (`bottom-nav.tsx:198`), the standalone `/import`
route — is unchanged and stays a takeover. Guard that with a test.

### 3.3 Top to bottom at 390×844, first load, brand-new account

**Layer 1, the map (always present, never covered).**
Camera at `ZERO_STATE_ZOOM` (11) over `zeroStateBounds(browserTimeZone)`, CARTO Voyager, real streets
and parks at neighbourhood scale. No pins. No capsules. No attribution problem — the tiles carry it.

**Layer 2, the card, anchored bottom, ~68% of the viewport:**

| # | Element | Exact string | Source |
|---|---|---|---|
| 1 | close button, 36 px, inline-start | `aria-label`: `Close and return to map` | `import-page-client.tsx:898` |
| 2 | kicker, 11 px tracked uppercase | `Add a place` | `:1063` |
| 3 | `h1`, `font-heading text-3xl` | `Add a TikTok` | `:1065` |
| 4 | body, `text-sm text-muted-foreground` | `Copy the link in TikTok — Share → Copy link.` | `COPY_LINK_INSTRUCTION` |
| 5 | the field, `h-12`, autofocus, `inputMode="url"`, `enterKeyHint="go"` | placeholder `Paste a TikTok link` | `:1073-1104` |
| 6 | kicker | `Or try one of these` | `:1137` |
| 7 | three 44 px chips | `Coffee in Tel Aviv` · `Brunch in Tel Aviv` · `Restaurants in Tel Aviv` | `seed-links.ts:46-55` |
| 8 | primary, `h-12` full width, disabled until the field parses | `Add →` | `:1163` |

**Every string above already ships and passes `voice-and-vocabulary.md`.** Sentence case; no
exclamation mark; digits not words (there are none); no banned vocabulary; the product name appears
nowhere, and this screen is not one of the six surfaces that may carry it. **No new string is
introduced by this package.** If a builder finds themselves writing one, that is the signal to stop.

**The keyboard.** `autoFocus` fires on mount, so iOS raises the keyboard immediately and the card's
`68dvh` becomes ~40% of a shrunken visual viewport. Two rules: the card must scroll internally
(`overflow-y-auto`, already present on the desktop arm) rather than pushing the `Add →` button off
screen, and `100dvh`/`dvh` units only — never `vh`. Verify at 390×844 **with the keyboard up**; that
is the state the screenshot never shows.

**Layer 3, once the card is dismissed** (the close button, or a successful import):
the sheet, resting at **`half`**, showing `Your map starts here.` as its `<h2>`, `EmptyLibraryLine`
beneath it, and `Add a TikTok` full width in the thumb zone. All three already exist; the only change
is `restingStop`.

### 3.4 The auto-open rule

```ts
// Module scope — deliberately not state, and deliberately not sessionStorage.
let zeroStateOverlaySpent = false;
```
```ts
const [showImport, setShowImport] = useState(() => {
  if (places.length > 0 || zeroStateOverlaySpent) return false;
  zeroStateOverlaySpent = true;
  return true;
});
```

- **Once per page load, not once per mount.** Navigating `/map` → `/collections` → `/map` remounts
  this client component; re-opening the overlay each time is a nag, and it would re-open on top of a
  user who closed it thirty seconds ago to look at the map.
- **Hydration-safe**, which `sessionStorage` would not be: on the server the flag is false and
  `places.length === 0` is the same fact, so both renders agree. A client-side route change is not
  hydrated at all, so the flag reading `true` there is invisible to React.
- `restingStop: places.length === 0 ? 'half' : 'peek'` on the same line of reasoning
  (`map-page-client.tsx:180`).
- **OQ-4** if the owner would rather it opened on every visit while the library is empty.

### 3.5 Desktop, 1440×900

Unchanged from what ships, plus the auto-open. The overlay's existing `lg:` arm already dims the map
and floats a centred card, and the left panel behind it already renders the heading, the line, the
button, no search field and no filter bar. **Nothing in `place-desktop-panel.tsx` is opened by this
package.**

### 3.6 The honest part — not setting up an expectation the next screen breaks

At a ~27% hit rate the modal outcome of this screen's one action is
[`spec-no-places-found.md`](spec-no-places-found.md)'s `No places in this one.` The zero state is
where the product's credibility is either spent or kept, and the rule is:

> **The first screen makes no claim about yield.**

Four things enforce it, and they are checkable:

1. **The shipped line already complies and must not be "improved".** *"Paste a TikTok link and the
   places it talks about land on your map."* describes what happens to the places a post names. It
   does not promise that a post names any. `voice-and-vocabulary.md` §6 already ruled this string
   beats the deck's version — **do not regress it**, and do not add a second sentence to it.
2. **Banned on this screen:** *in seconds*, *automatically*, *we'll find them*, *instantly*, *just
   paste*, any number, any counter, any progress meter, and anything with an exclamation mark. Also
   banned by §5 and still banned: a carousel, a tour, a spotlight, a checklist, `0 places`, an
   empty-box illustration, and **any permission prompt of any kind.**
3. **The recovery is the same offer, not a new one.** The no-places screen's primary on `/map` is
   `Add manually →` (`import-page-client.tsx:1382-1392`, live because `/map` passes `onAddManually`).
   The zero state must therefore not present the paste field as the *only* way in — and it does not:
   the `＋` create menu and manual add are one tap away behind the dismissed card. Nothing here may
   close that off.
4. **Continuity of composition is what makes failure read as a destination.** The no-places screen
   (W6-5) must be the *same* composition as this one — same card, same kicker slot, same heading
   scale, same primary in the thumb zone, the map still behind it. A user who lands there sees the
   screen they started on with different words in it, not a broken branch. That is a constraint this
   spec places on W6-5, and it is the cheapest way to make ~73% of imports feel designed.

**The seed chips are the strongest honesty lever on the screen and they already ship.** §5's list of
what must not appear includes *"a `Try an example` link (not built, not in scope)"* — the stated
reason has since evaporated: `IMPORT_SEED_LINKS` is built, the chips run the real pipeline against
three real, known-good TikToks, and one tap still stops at review-and-confirm. **Ruling: they stay.**
They are the one control that makes a new user's first paste not a 27% lottery, and a user who has
seen the flow succeed once reads their first `No places in this one.` as a property of that post
rather than of the product. Recorded as a deliberate deviation from §5 — **OQ-6**.

### 3.7 Accessibility

- The overlay is `<main>` with `autoFocus` on the field: focus lands on the first control, which is
  correct for a screen whose whole content is one input.
- The close button keeps `aria-label="Close and return to map"`. Under `'over-map'` the map is
  visible above the card, so the label is now literally true.
- The live region at `import-page-client.tsx:866` stays one region and stays silent on this screen —
  nothing has happened yet.
- The map container's `accessibleName` (`MapSurfaceProps`) for an empty library must not claim
  places. `Map of your saved places` over zero places is a small lie in an accessible name.
  Specify: **`A map. Nothing saved yet.`** — and this is the one new string in Spec 3, offered
  because the alternative is a false one. It is sr-only, sentence case, one clause, states a fact.
- Reduced motion: the only motion on this screen is the card's height change (§3.2), and its reduced
  arm is instant. The camera does not fly — it is framed once, at load, with `duration: 0`.

### 3.8 Exit criteria and tests

**Browser, 390×844, brand-new account:** live regional streets in the top third, the paste field
below, no permission prompt, no world map, nothing over-claimed. **1440×900:** the dimmed map, the
centred card, `Your map starts here.` legible in the panel behind it.

**Unit tests owed by this package:**

1. `showImport` initialises `true` at zero places and `false` at ≥ 1 — including the second mount,
   which must be `false`.
2. `restingStop` is `half` at zero places, `peek` otherwise.
3. `zeroStateBounds` for a known zone, an unknown zone and `null` (§1.7 owns the helper's own test;
   this one covers the wiring).
4. `presentation='over-map'` reaches `ImportPageClient` **only** from the zero-state auto-open — the
   `＋` path, the shared-link path and `/import` all still get `'takeover'`.
5. The strings on this screen are the shipped constants, not literals — assert against
   `EMPTY_LIBRARY_HEADING`, `COPY_LINK_INSTRUCTION` and `IMPORT_SEED_LINKS` rather than re-typing
   them, so the deck and the code cannot drift (`voice-and-vocabulary.md` §6).

---

## Spec 4 — The live regions (ruling, and it is mostly "do not")

> **Added 2026-08-31**, after a build agent refused to consolidate the live regions under W3-4 and
> the refusal was escalated. **The agent was right.** All four regions and all twenty-nine role
> attributes below were read; nothing here was run.

### 4.1 The audit's sentence is wrong, and it is wrong by counting

`facelift-plan.md`'s audit says **"four separate `aria-live` regions doing the job of one toast"**.
That counted DOM attributes. Read, they are four different mechanisms doing four different jobs, and
**not one of them should move into a toast**:

| # | Where | What it actually is |
|---|---|---|
| 1 | `src/components/shell/map-shell.tsx:201` | `/map`'s **one** sr-only channel, with a ticketed ordering discipline in `src/ui/place/announce.ts` and two writers (the search count, a been/not-been mark) |
| 2 | `src/app/import/screens/import-shell.tsx:94` | The import takeover's sr-only channel. Always mounted, carries the failure *body* while the focus move reads the headline — deliberately, so nothing is said twice |
| 3 | `src/components/collections/share-panel.tsx:214` | A **component-owned** sr-only channel, with a written reason. See §4.3 |
| 4 | `src/app/import/screens/rail-screen.tsx:89` | **Not a region at all.** It is the *visible* wait line, `railWaitLine(elapsedMs)`, marked `aria-live` on the element that already shows the text |

Number 4 is the one that settles the argument. It is on-screen copy, in the flow of the layout, that
a sighted user is reading while they wait. "Consolidating" it into a toast would **delete visible text
from the screen** during the flagship flow's slowest moment. Any rule that recommends that is the
wrong rule.

### 4.2 The principle — three questions, in order

The proposed principle — *a message about what the page just became belongs to the page's one region;
a message about the control you are touching belongs beside that control* — is close, and it fails on
two of the four: it cannot classify #4 at all (visible text is neither), and applied to #3 it says
"use the page's region" on two surfaces where no such region exists. This is the refinement, and it
is stated so a reviewer can apply it to a region that does not exist yet.

**Q1 — Is the text visible on screen?**
**Yes → it is not an announcement.** Put the live attribute on the element that already shows the
text — `aria-live="polite"`, or `role="alert"` if it is an error — and stop. **Never mirror visible
text into a separate sr-only region**: that is how a screen reader reads the same sentence twice.
This alone covers #4, all seventeen inline field errors, `add-sheet.tsx:658,666`,
`near-me-control.tsx:61`, `sign-in/page.tsx:219`, `bottom-nav.tsx:393,420` and
`import-confirmation.tsx:72`. **Twenty-six of the twenty-nine role attributes are already correct by
this test and must not be touched.**

**Q2 — Would someone who cannot see the screen otherwise never learn it happened?**
No → no region; the visible change is the feedback. Yes → it needs a channel. The bar is *perceivable
without sight*, not *invisible*: marking a place been changes a badge and a pin's opacity, both real
and both unreachable from where the user is, which is why `visit-state.ts` announces.

**Q3 — Whose channel? One live region per interaction context that can be on screen alone.** Three
tests, all of which must pass before a message may join an existing region:

1. **Ownership** — is there exactly one place that always renders that region, on *every* surface
   where these messages can originate? A component rendered on three surfaces where only one has a
   provider fails this, and a channel that silently drops two thirds of its messages is worse than a
   second region.
2. **Concurrency** — can the two regions be mounted *and both change* in the same window? If yes they
   must be one region. Mutually exclusive in time is not a conflict.
3. **Ordering** — do two writers of one region need an order between them? Then they need a ticketed
   channel (`announce.ts`), not a second region.

Applied: **#1 keeps its two writers and its ticket** (ordering). **#2 stays separate from #1** —
`/import` standalone has no map shell to borrow a region from, and while the overlay is open the
map's writers are unreachable, so they are mutually exclusive in time. **#3 stays where it is**
(§4.3). **#4 is not a region.** The correct count is *two page-level channels, one component-owned
channel, and one live-marked visible line* — and the right number of merges is **zero**.

**One watch item, and I could not check it.** `map-shell.tsx:201` renders its region *above* the
`{overlay ? null : …}` ternary at `:207`, so it stays mounted underneath the import overlay. That is
harmless today only because both of its writers — the search field and place detail — are unmounted
while the overlay is open. It is one new writer away from two polite regions changing at once, and a
finished import is the obvious candidate. **Someone with a browser and a screen reader should confirm
the map's region stays silent for a whole import.** If it does not, the fix is to move the region
inside the ternary, not to merge the two.

### 4.3 `share-panel.tsx:208` — the comment stands, and it should be rewritten to say so

The written reason is: *the panel is also rendered on surfaces that have no announcer provider — the
join flow and the collections index — and a copy that silently announces nothing on two of three
surfaces is worse than a second region that is only ever mounted while this panel is open.*

**Honoured, not overturned.** It is exactly the ownership test in Q3, argued correctly before the
test was written, and `§8.3`'s "use the shared one" was written for a component that lived on one
surface. Two supporting facts: the region is mounted only while the panel is open, so it can never
interleave with `/map`'s; and its messages are about a change *inside* the panel the user is looking
at, not about what the page became.

**One edit is owed, and it is a comment, not code.** The last line reads *"Flagged to the
orchestrator."* — a flag that is now resolved. Replace that sentence with the ruling and its date;
keep every other sentence. Run rule 7 forbids deleting a comment that explains *why*, and this one is
right. Do it only in a package that already has the file open; it is not worth a commit of its own.

### 4.4 What a toast is for, and what it must never swallow

A toast, in this product, is **a visible transient message that is not attached to a control**. By
that definition the product already has exactly one — `import-confirmation.tsx`, the auto-dismissing
"places added" strip over the map, which already carries its own `role="status"` and its own written
rationale for auto-dismissing.

If a toast is ever vendored per §7c, these are its terms:

- **It maps to `enter`** on the closed list of nine — opacity plus a 4 px rise, 140 ms, with
  `motion-safe:` on the rise and the opacity unconditional (§2.3). It gets no bespoke motion, no
  slide-in from the side, no stacking animation, no swipe-to-dismiss spring.
- **It is its own live region**, mounted only while it is showing, and it does not read from or write
  to `announce.ts`.
- **It may never carry:** an inline field error (WCAG 3.3.1 wants the error identified in text
  associated with the field; a message that disappears on a timer does not), a message about the
  control the user is touching, the rail's wait line, or anything a sighted user needs to still be on
  screen a moment later.
- **Its only legitimate first job is to be the shared implementation of the confirmation strip that
  already exists** — and that strip works, so this is a refactor with no user-visible outcome.

**Replacing a working component that carries a written design rationale, in order to use a component
because it is available, is what §7c calls a failed package.** That is the whole of the case against
doing it.

### 4.5 Scope — specify it, build nothing tonight

**Ruling: out of scope for this run.** W3-4's "replace four `aria-live` regions with one toast" is
**struck**, and the reason is not cost — it is that the change is wrong. What is owed instead:

| Owed | Size | When |
|---|---|---|
| Correct `facelift-plan.md`'s audit line — "four regions doing the job of one toast" is inaccurate and would send the next reader to do the same wrong thing | one sentence | W8-7, with the other document corrections |
| Rewrite `share-panel.tsx:212`'s stale flag as the ruling | one comment | opportunistically, or owed |
| Confirm the map's region stays silent through an import, with a screen reader | one pass | W7-6 or W8-6, where the a11y sweep already lives |
| A toast component, only if a second transient message ever needs one | — | not funded |

Four correct regions beat one wrong one, and **nothing in `src/` should change tonight on account of
this section.** If the run needs a `role`-attribute number for a KPI, the honest one is: 29
attributes, 26 correct by inspection under §4.2, 3 examined individually and all 3 correct.

---

## Owner questions

Each carries my recommendation. None blocks the rest of the work; build on the recommendation and
record the answer when it comes.

| # | Question | Recommendation |
|---|---|---|
| **OQ-1** | **Spec 1 removes the home zoom ceiling set by owner ruling on 2026-08-30 — yesterday, and the most recent camera decision in the repo.** A one-city library then opens **in the pin band** (z10–13, pins and names) rather than on area capsules. The part of the ruling that fixed the reported complaint — framing the *whole library* rather than the last save — is kept exactly, and **no floor is restored**: §1.1's table shows a floor is the one change that would re-break it | **Remove the ceiling, and additionally fix the band (§1.4a).** Three options were weighed: *(a)* ceiling only, which leaves defect 0a; *(b)* **band only** — pins drawn under the capsules with the camera untouched, which honours the ruling literally but resolves the owner's own library into four 19 px smudges under the pills that already count them: it passes K14's words and fails Q1; *(c)* **both**, which is what is specified. They fix disjoint sets of libraries — the camera serves anything that fits above z8.65, the band serves the few-hundred-km spread that no camera can serve — and the ruling's own docblock concedes that a one-country library "cannot show countries at all". For the owner's library the ceiling currently costs them every pin they own |
| **OQ-2** | `Asia/Jerusalem` → **Tel Aviv** or **Jerusalem**? The zone is named for one city; the product has been used in the other | **Tel Aviv.** It is where today's `EMPTY_LIBRARY_BOUNDS` already points and it is the metro the corpus is in. Nothing on screen ever names it |
| **OQ-3** | The zero-state card growing from `68dvh` to full height on submit — a beat, or a jump? | **Ship the transition** (220 ms, `ease-emphasised`, instant under reduced motion). Fall back to opening as a takeover from the first submit if it stutters on a device |
| **OQ-4** | Auto-open the import overlay **once per page load** (my spec) or on **every** visit to `/map` while the library is empty? | **Once per load.** Re-opening over a user who just closed it is a nag, and the `Add a TikTok` button is right there |
| **OQ-5** | **K14 as written is unachievable.** *"Home shows the user's own pins at rest, with ≥3 places"* cannot hold for 3 places in 3 countries — no camera shows three continents and three pins | Restate as: **"home rests in the pin band whenever the library's bounding box allows it, and never rests inside the band-edge guard window"** |
| **OQ-6** | The three seed chips (`Or try one of these`) on the first screen. §5 banned an example link when none existed; three now do | **Keep them.** They are the only control that stops a new user's first impression from being the 27% lottery |
| **OQ-7** | The **300-place case** is not fixed by W2-1 and cannot be — 300 pins in one city at z11 is an overlapping mat. The named repair is a ~1.5 km neighbourhood band (`growth-plan.md` §5.7), out of scope tonight | **Accept it as a recorded Q1 finding**, not a W2-1 failure. Nothing in this spec blocks the third band: it is two constants and one more guard window |
| **OQ-8** | The pressed category chip filling with **the category's own colour** (W2-4) means the pressed state is data, not a variant. That is a deliberate exception to rule 6a's "state comes from variants" | **Take the exception.** Four category colours come from data; four variants would be a hard-coded palette by another name, and W0-2 exists to stop exactly that |
| **OQ-9** | The `enter` fade (140 ms opacity) now plays for `prefers-reduced-motion` users, where today it is suppressed | **Correct as specified.** §3a's own rule is that the nine collapse *to the opacity change*, not to nothing |
| **OQ-10** | **A run-plan item is struck.** W3-4's "replace four `aria-live` regions with one vendored toast" is specified out in Spec 4 — the four are four different mechanisms, one of them is visible on-screen copy, and seventeen of the nineteen `role="alert"` uses are inline field errors that WCAG 3.3.1 wants kept beside their field. `facelift-plan.md`'s audit line is inaccurate and is corrected in W8-7 | **Strike it and record it as owed.** Four correct regions beat one wrong one; no `src/` change tonight |

---

## Notes for the orchestrator

**Path collisions I found while writing this.** Each is a serialise-or-lose:

| File | Wanted by | Order |
|---|---|---|
| `src/ui/place/viewport.ts` | **W1-1**, **W2-1**, **W2-5** | W1-1 (wave 1) → W2-1 → W2-5, or fold W2-5 into W2-1 |
| `src/components/map/map-surface.mapcn.tsx` | **W2-1**, **W2-1b**, **W2-2**, W6-6, W6-7 | W2-1 first — its `{ kind: 'home' }` framing removes one of W2-2's two replay paths |
| `src/components/map/zoom-bands.ts` | **W2-1**, **W2-1b** | same agent, or W2-1 then W2-1b. Both add exported constants to one 100-line file |
| `src/components/map/marker-style.ts` | **W2-1** (`band.cross`), **W3-2** (`pinOpacityExpression`), W2-3 (labels) | one agent per wave; do not let W2-3 and W3-2 overlap |
| `src/components/map/pin-dust-layer.tsx` (new) | **W2-1b** only | uncontended — and `place-marker-layer.tsx` must stay closed to this package |
| `src/components/map/marker-images.ts` | **W4-3** (crumb silhouette), and W3-2 *only if* 1.1× resampling reads soft | W3-2 must report, not open it |
| `src/components/sheet/place-sheet.tsx` | **W3-1, W3-2, W5-1, W5-2, W5-5** | five packages, one file — this is the run's hottest file and the throughput risk |
| `src/app/import/import-page-client.tsx` | **W1-1** (the `presentation` prop), W1-4, W1-6, **W6-1** | W1-1's change is ~15 lines in the root element's `cn(...)`; land it before W6-1 decomposes the file, or rebase the prop onto the split |

**What is independently buildable, for concurrent dispatch.** Spec 2 decomposes into four pieces
whose files are disjoint and which need no ordering between them:

- **A** — `button.tsx` + `input.tsx` + `src/lib/interaction.ts` (elements 1, 2, 3, 9)
- **B** — `place-enrichment.tsx` + `category-filter-bar.tsx` (elements 5, 6, and W2-4's colour)
- **C** — `bottom-nav.tsx` + `map-shell.tsx` (elements 7, 10)
- **D** — `place-sheet.tsx` + `place-marker-layer.tsx` + `marker-style.ts` + `map-page-client.tsx`
  (element 4 and the whole of §2.2)

**A must land first** — B, C and D all import `PRESS_*` from it. After that, B and C are genuinely
parallel with each other. **D is the long pole** and is the one that needs a browser at 1440×900.
