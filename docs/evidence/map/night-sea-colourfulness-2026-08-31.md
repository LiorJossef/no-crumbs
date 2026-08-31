# The night sea's colourfulness — the measurement behind `e0c773b`

**Taken 2026-08-31 against `6b87641`, 1440×900 and 390×844, dark.** Reproducible with
`measure-map.mjs` (see *The instrument*, below); the rendered frames are not kept here.

---

## 1. The finding

The owner's read — *"the sea is the most saturated thing on the screen"* — was still true after
`4531ab9`, which was aimed at the same defect. `4531ab9` moved `water 214/0.60/0.18 →
214/0.95/0.10`: it bought its coastline ΔE back by **raising** saturation while it dropped the
lightness, so raw C\* moved only 22.2 → 21.5. The sea got darker. It did not get less colourful in
the way the eye reads as saturation.

Segmented by re-rendering CARTO's style one layer class at a time, at `6b87641`, 1440×900 dark,
over the **visible** map (the canvas minus the 374.4 px desktop panel):

| places | region | share of the visible map | L\* | colourfulness | **share of the frame's total colour** |
|---|---|---|---|---|---|
| 3 | sea | 26.8% | 7.51 | 5.79 | **55.5%** |
| 3 | ground | 68.4% | 18.70 | 1.45 | 35.5% |
| 3 | parks | 4.5% | 16.68 | 4.51 | 7.3% |
| 3 | the pins | 0.33% | 72.52 | 14.70 | **1.7%** |
| 30 | sea | 38.4% | 7.58 | 5.79 | 62.4% |
| 300 | sea | 40.4% | 7.74 | 5.81 | 39.9% |

Per pixel the pins already out-shout the sea by 2.5×. What the sea wins is **mass**: a quarter to
two-fifths of the frame at four times the ground's colourfulness, on the one region with nothing in
it.

*Colourfulness* throughout is `C* × √(L*/100)` — Lab chroma alone overstates a near-black badly, and
this is the definition `4531ab9`'s commit body used, so every number here is comparable to it.

---

## 2. Why it could not be answered at L\* 7.3

The coastline is the sea against the **bare land polygon** (72% of the real shoreline, per
`4531ab9`). The land is pinned:

| land `maxLightness` | land | L\* | worst night POI contrast on it |
|---|---|---|---|
| **0.135 (shipped)** | `#202225` | 13.14 | **4.551** — passes AA by 0.051 |
| 0.140 | `#212327` | 13.66 | 4.492 — **fails** |
| 0.145 | `#222428` | 14.15 | 4.436 — fails |

*(measured at `HEAD` = `cd841ff`, i.e. after that commit moved the `food` POI colour; the margin was
4.61 before it and is 4.551 now. The land cannot rise by 0.005.)*

A ΔE00 of 13 bought from lightness alone needs ≈22 L\* of separation, which does not exist under a
land at 13.1. So every point of ΔE the sea does not take from lightness it must take from chroma,
and **the whole frontier at a held coastline is "the sea gets darker"**.

Swept over hue × saturation × `maxLightness`, holding ΔE00(sea, land) ≥ **13.25** (the shipped
value, so no coastline regression), restricted to a cool hue:

| hue | sat | maxL | colour | L\* | C\* | colourfulness | ΔE00(land) | weakest pin on the sea |
|---|---|---|---|---|---|---|---|---|
| 195–205 | — | — | — | — | — | — | *nothing clears the floor* | — |
| 210 | 0.97 | 0.1225 | `#011f3e` | 11.51 | 23.15 | 7.85 | 13.34 | 5.56:1 |
| **214** | **0.95** | **0.1000** | **`#011632`** | **7.32** | **21.47** | **5.81** | **13.25** | **6.06:1** ← was |
| 215 | 0.98 | 0.0950 | `#001430` | 6.45 | 21.42 | 5.44 | 13.39 | 6.16:1 |
| 220 | 0.98 | 0.0825 | `#000e2a` | 4.35 | 20.40 | 4.25 | 13.54 | 6.42:1 |
| **225** | **0.98** | **0.0725** | **`#000925`** | **2.97** | **18.80** | **3.24** | **13.30** | **6.60:1** ← is |
| 230 | 0.98 | 0.0700 | `#000623` | 2.27 | 18.46 | 2.78 | 13.46 | 6.70:1 |
| 235 | 0.98 | 0.0625 | `#000320` | 1.53 | 17.32 | 2.14 | 13.30 | 6.81:1 |
| 240 | 0.97 | 0.0600 | `#00001e` | 0.85 | 16.96 | 1.56 | 13.53 | 6.91:1 |

Hue 240 is not a better blue than 214 — it is simply the darkest one, which is the whole shape of
the frontier.

**Why 225 and not further down.** It is the first point at which the sea stops being the frame's
largest source of colour, and the sea keeps a readable difference from the chrome it sits in
(`--background`, L\* 5.9). Below it the sea becomes a hole rather than a sea.

---

## 3. Measured after the change

`6b87641` against `6b87641` + the candidate `basemap-tint.ts`
(sha256 `334615cc31e189b960d6b5379957cd69a4d89a97495acc9f254134f9c7e7b263`), so the two runs share a
build lineage and an identical mask, then confirmed independently against the landed commit
`e0c773b`.

| | before | after |
|---|---|---|
| sea colourfulness / L\* @ 3 places | 5.79 / 7.51 | **3.24 / 3.19** |
| **sea's share of the frame's colour** @ 3 / 30 / 300 | 55.5% / 62.4% / 39.9% | **41.1% / 48.2% / 27.6%** |
| **ground's share** @ 3 / 30 / 300 | 35.5% / 22.1% / 12.7% | **47.0% / 30.5% / 15.2%** |
| real shoreline ΔE00 @ 3 / 30 / 300 | 18.28 / 17.15 / 16.20 | **18.22 / 17.25 / 15.81** |
| weakest category body on the sea | 6.06:1 | **6.60:1** |
| the four category bodies from each other | ΔE00 23.18 | **23.18**, untouched |
| every region's share of the frame | — | **unchanged to the pixel** |

At 390×844, `e0c773b`: sea colourfulness 3.22 / 3.24 / 3.32 at 3 / 30 / 300 places, shoreline ΔE00
18.21 / 16.87 / 17.53.

**The criterion is met**: at 3 places the ground (47.0%) now carries more of the frame's colour than
the sea (41.1%). One step lighter on the frontier — hue 220 — would leave the sea at ≈47.8% against
the ground's ≈41.6%, i.e. still the largest.

### A correction to `e0c773b`'s own commit body

That body states the criterion as *"36.9% against the ground's 42.1%; one step lighter and it is
still 44.3% against 38.5%"*. **Those four numbers are wrong** — they were an arithmetic prediction
made before the after-frame was rendered, and I mis-divided the total. The measured values are
**41.1% against 47.0%**, and 220 would be ≈47.8% against ≈41.6%. The conclusion, the choice of 225
and every other number in that commit are unaffected; only those four percentages are. History is
not rewritten, so the correction lives here.

---

## 4. The instrument, and why it can be trusted

`measure-map.mjs` (kept in the session scratchpad, not committed) builds a **named commit** into a
clean `git archive` export, drives it against `tests/harness/stub-supabase.mjs`, and takes **four**
captures per case: the real frame, plus three where CARTO's style JSON is rewritten in flight so
exactly one class of layer draws in white on black — water, parks, and *no basemap at all*, which
leaves only the product's own GL layers. A pixel is classified from the masks, never from its own
colour.

Four known-answer checks, all passed **before** any number above was reported:

1. **Determinism.** Two ordinary loads of the same screen are **pixel-identical** —
   `differingShare 0`, `worstChannelDelta 0`. That is what makes applying one capture's segmentation
   to another valid, and it is measured rather than assumed.
2. **It reproduces a number it did not compute.** `4531ab9` independently recorded the shipped sea
   at colourfulness **5.81**; this instrument measures **5.79**.
3. **Rendered pixels match the tint arithmetic exactly** — sea `rgb(1,22,50)`, land `rgb(32,34,37)`,
   composited park `rgb(24,43,32)`. All three predicted, all three found as their class's modal
   colour.
4. **The new test assertion fails on the value it replaces**, verified through the test's own code
   path.

Two instrument defects were found and fixed by looking at the mask PNGs rather than at the summary
line: `page.evaluate` with a **string** `pageFunction` evaluates it as an expression and silently
drops the argument (everything returned `undefined`); and forcing every layer opacity to 1 in the
mask pass turned the 50%-alpha `landuse_residential` opaque and hid every park.

**Known limits.** The shoreline metric's per-transition *minimum* is unreliable — a 12 px inland
sample can still land in a bay or a marina — so only its mean is load-bearing. Transition counts
differ slightly between separate builds (2232 vs 2295 at 30 places) because MapLibre's label
collision is not stable across builds; the before/after pair above shares a build lineage and an
identical count, and the independent `e0c773b` run agrees to within 0.02 on two of three cases.

---

## 5. The framing finding, which shipped as no code

The same instrument answered a second question: whether the default camera spends too much of the
frame on open sea. It does, and it is not fixable from the camera.

At 3 places, 1440×900, with the camera read off the two café pins' measured screen positions
(**z14.694**, 37 719 px per degree of longitude), the 1065.6 px of visible map decomposes as:

| | px | share |
|---|---|---|
| the library's own bounding box | 430 | 40.4% |
| declared padding (48 cosmetic + 54 label, each side) | 204 | 19.1% |
| **aspect slack** — 215.8 px each side | 431.6 | **40.5%** |

The fit is **height-limited to within 3 px** (680.8 px available against a 678 px box): the box is
portrait, the viewport is landscape. Only **5.6%** of the visible water is inside the library's box;
94.4% is around it. Charging for the panel *reduces* the sea rather than causing it — without that
charge the box shifts 187 px left and 187 px more sea enters the frame.

The one lever that would work — biasing the slack eastward onto land — needs the camera to know
where the water is, at a moment when the tiles for the target view have not loaded. A resting camera
whose position depends on tile load order is a worse defect than the one it fixes. **No change
made.**

The 30- and 300-place figures are contaminated and should not be quoted: `tests/harness/fixtures.mjs`
jitters ±0.02° (±2.2 km) around twelve Tel Aviv seeds, and the minimum jittered longitude is 34.732
— in the Mediterranean. Four pins are visibly in open water at 30 places. The camera is correctly
framing places that are genuinely offshore.

---

## 6. Specification — the coastline as its own layer

**Not built. This is the ruling that has to come first**, written up while the measurement is warm.

### What forces it

§2 proves the bind: with the coastline carried by the *sea fill against the land fill*, and the land
pinned at L\* 13.1 by POI AA, the sea's chroma and its lightness are the only currency, and they
trade one for one. There is no point on that frontier that is both a **readable navy** and **quiet**.
`e0c773b` picked the best available compromise; it did not remove the constraint.

### The change

Draw the coastline as a **line layer on the `water` source-layer**, above the fill. MapLibre renders
a polygon's rings as lines, so this needs no new source, no key and no extra request — the same
shape `basemap-tint-layer.ts`'s `addPoiLabels` already uses to add layers CARTO does not ship.

The coastline then carries the land/sea boundary **in value, at the edge**, at 1–1.5 px. The fill is
freed to be near-achromatic at whatever lightness reads best as sea — e.g. hue 214 at saturation
≈0.35, `maxLightness` 0.10, which is a desaturated dark slate blue at colourfulness ≈2.2 and still
unmistakably water. Roughly a **60% further drop** from what `e0c773b` ships, with the sea *lighter*
and more readable rather than darker.

Scope: a `coastline` entry in `BasemapRole` and both tint tables, one `addLayer` in
`basemap-tint-layer.tsx` inserted above `water_shadow`, and the `water` rows retuned. ~30 lines.

`water_shadow` is **not** the answer and was checked: CARTO offsets the same polygon by `(0, 1–2)`
px, so it produces a band only where the coast runs east–west. Tel Aviv's runs north–south.

### What the assertion becomes, and what it then protects

Today `basemap-night.test.ts` asserts `ΔE00(water, land) > 12` — *"the coastline is visible"*,
expressed as a property of two **fills**. Under this change that sentence stops describing the
mechanism, and leaving it in place would be the exact failure this session kept finding: a guard
whose meaning has quietly moved.

It is **replaced, not relaxed**, by a stronger pair:

1. `ΔE00(coastline, land) ≥ 12` **and** `ΔE00(coastline, water) ≥ 12` — the edge is visible against
   *both* things it separates. Two constraints where there was one, and a coastline that vanished
   into either side would now fail.
2. `L*(coastline) > L*(land) > L*(water)` — the ordering that makes the edge read as a shoreline
   rather than as a seam, and the reason it can be thin.

The property the existing assertion was protecting — *this product's very first screen is a
coastline, and contrast ratio cannot tell a good sea from an invisible one* — is preserved and
tightened. What is **given up** is the guarantee that the sea and the land are distinguishable when
the coastline layer does not draw: a tile without the ring, or a future CARTO reshaping. Assertion 1
does not cover that, so it needs a third, weaker floor on the fills — `ΔE00(water, land) ≥ 6` — kept
explicitly as the degraded-mode bar, with the number and the reason written down.

Before it lands, both the rendered shoreline ΔE00 and the frame's colour split must be re-measured
with §4's instrument at the same three place counts, and the pin-on-sea contrast re-checked: a
lighter sea moves it in the direction that costs, unlike `e0c773b`, which improved it.
