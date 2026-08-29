# The summary marker becomes a pill — `LIBRARY-IA-1-FIX-1`

> Task **LIBRARY-IA-1-FIX-1**, 2026-08-29. Owner: `maps-geospatial`.
> Branch `feat/country-band-map-layer`. **Working tree only** — nothing committed, pushed, merged
> or deployed. Files touched are listed in §1 and are inside the task's path scope.
>
> Installed MapLibre confirmed **6.4.1** (`node_modules/maplibre-gl/package.json`). Every line
> reference below is into `node_modules/maplibre-gl/src`, not into the v5 API surface.
>
> **I have no browser. Nothing in this document is a claim about what appears on screen.** §6 lists
> what is unverified, explicitly.

---

## 0. The defect, and the shape of the fix

The owner, looking at the running app: *"this looks so off, why is the text floating on the map"*.

At world zoom the country marker was a bitmap disc plus a haloed `text-field` sitting on the
basemap — no surface, so it collided with CARTO's own labels (`United Kingdom 18` against `ASIA`),
its first letter met the disc's ring, and it read as map furniture rather than a control. The area
band had the same defect in a second form: a disc with the count in it and the area's name as bare
text *below* it, repeating the basemap's own city label directly under a disc sitting on that city.

The fix is one **pill** per marker: the card surface (`--card`), the hairline border (`--border`),
the shadow the disc already baked, fully rounded, with a flag cap on the country pill. Drawn once as
a **stretchable image** (`stretchX` + `content`) and fitted to the label with `icon-text-fit:
'width'`, so the label and the count stay **live text in a symbol layer** — §2.2's rule — and
`תל אביב-יפו` still shapes through the RTL plugin.

I did not reject the stretchable-image approach. It is the only mechanism in MapLibre that puts a
surface behind a live `text-field` without a second layer that can drift from the first.

---

## 1. What changed

| File | Change |
|---|---|
| `src/components/map/country-flag-image.ts` | Rewrote the image builder: disc → pill. New `SUMMARY_PILL` geometry, `SUMMARY_PILL_HEIGHT`, `summaryPillWidth(capped)`. `CountryDiscImage` now also carries `stretchX` and `content`. Image ids are now `summary-pill:{theme}:{CODE\|none}[:active]`. |
| `src/components/map/summary-style.ts` | Both bands share one `pillLayout()`. `icon-text-fit: 'width'`; no `icon-anchor`; no `text-offset`; no halo. Removed `areaLabelLayerLayout` / `areaLabelLayerPaint` / `AREA_LABEL_LAYER_ID`; `areaDiscLayerLayout` → `areaLayerLayout`; the two paints collapse into `summaryLayerPaint`. |
| `src/components/map/summary-marker-layer.tsx` | Three layers → two. `addImage` now passes `stretchX` and `content`. |
| `tests/unit/map/country-flag-image.test.ts` | Rewritten for the pill; new `describe('the stretchable-image geometry')` block. |
| `tests/unit/map/summary-style.test.ts` | **New.** Guards the layer spec and the non-regressions in §5. |

`src/components/map/summary-features.ts` was **not** edited — it resolves ids through
`countryDiscImageId`, so the id rename reached it without a change. Nothing outside
`src/components/map/**` was touched.

**Public surface deliberately preserved**, because `map-surface.mapcn.tsx`, `summary-features.ts`,
`use-disc-theme.ts` and `components/sheet/elsewhere-section.tsx` import from these modules and are
outside my scope: `AREA_DISC_SPEC`, `countryDiscImageId`, `buildCountryDiscImages`,
`clearCountryDiscImageCache`, `whenDiscFontReady`, `resolveDiscTokens`, `DiscTheme`, `DiscTokens`,
`flagEmoji`, `normaliseCountryCode`, `CountryDiscSpec`, `CountryDiscImage`. The names now describe a
pill rather than a disc, which is a wart I left rather than editing four files I do not own.

---

## 2. The six API assertions, re-checked against the installed source

Five of the six hold. **One is inverted**, and it matters.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `addImage(id, ImageData, {pixelRatio, stretchX, stretchY, content, textFitWidth, textFitHeight})` is supported | **Holds** | `ui/map.ts:3152` (signature), `:3189-3216` (`_createStyleImage` destructures all seven). Types: `style/style_image.ts:59` (`StyleImageMetadata`), `stretchX` `:71`, `stretchY` `:75`, `content` `:79`, `textFitWidth` `:83`, `textFitHeight` `:87`. Cited as `map.ts:3193-3218` / `style_image.ts:58-86`; the real spans are a few lines earlier. |
| 2 | `stretchX` / `content` are in raw bitmap pixels | **Holds** | `symbol/quads.ts:65-66` (`imageWidth = image.paddedRect.w - 2 * border`), `:134` (`pixelOffsetTL = new Point(leftPx / pixelRatio, …)`). Line numbers as cited. |
| 3 | With `icon-text-fit` set, `icon-anchor` is ignored; `icon-offset` still applies; `text-offset` moves text and pill together | **Holds** | `symbol/shaping.ts:635-637` (the comment), `:645-646` and `:657-658` (`iconOffset` added to every branch). `text-offset` reaches shaping as `translate` and seeds the box at `shaping.ts:180-182`; `symbol_layout.ts:153` converts it by `ONE_EM`, `:215` passes it. Also **executed** — §3, test 6. |
| 4 | With `icon-text-fit: 'width'` the icon takes the natural image height, centred on the text | **Holds** | `shaping.ts:659-663` (the else-branch: `top = iconOffset[1] + (textTop + textBottom - image.displaySize[1]) / 2`). Also **executed** — §3, tests 3 and 4. |
| 5 | `content` maps onto the fitted box; the regions outside it stay fixed pixels either side; `stretchX` must start at or after `content[0]` | **Holds** | `quads.ts:93-108` (the `content` block), `:113-146` (`makeBox`), `:193` (`sumWithinRange`). Also **executed** — §3, tests 1 and 2. |
| 6 | `content` **shrinks** the icon's collision box via `collisionPadding` | **INVERTED** | It *expands* it. With `icon-text-fit`, the fitted box is the **content** rectangle, so the caps are outside it; `collisionPadding` is exactly the cap widths and `collision_feature.ts:78-81` **subtracts it from `x1`/`y1` and adds it to `x2`/`y2`**, putting the caps back. Executed: `collisionPadding` came back `[45, 0, 25, 0]` — the two cap widths in CSS px, and zero vertically because `content` spans the full height. |

Claim 6's inversion is good news rather than bad: the tap target is the **whole pill**, not the
label box. That is what §5's 44 px check rests on.

### A seventh finding the brief did not raise: `format` is an RTL hazard

`shaping.ts:135` takes the bidi path *only* when `logicalInput.sections.length === 1`; `:146` falls
back to `processStyledBidirectionalText`, and if the loaded plugin does not export it, `:173` shapes
the line with **no bidi at all**. The old country layer used `['format', label, {}, '  ', {}, count,
{'font-scale': 1.05}]` — three sections. It never bit because country names are English; folding the
Hebrew area label into the same field would have walked straight into it.

Both bands now use `['concat', label, '  ', ['to-string', ['get', 'count']]]` — **one section**.
`concat` accepts `value` and stringifies (`@maplibre/maplibre-gl-style-spec/dist/index.cjs:7526`:
`concat: [StringType, varargs(ValueType), …]`), so `['get', 'label']` needs no coercion. The
`font-scale: 1.05` on the count is gone with it; it also switched `align()` to its
`maxLineHeight !== lineHeight` branch (`shaping.ts:524-528`), which is a second vertical-centring
path I would rather not have under a background I cannot see.

An area with no agreed name carries `''`, so the field is `'  6'`; `tagged_string.ts:226-234`
(`trim()`) strips the leading spaces before shaping, which is §2.3's *"the marker shows the count
alone"* with no branch to get wrong.

`text-max-width` is 24 ems (336 CSS px at 14 px) rather than 0: `tagged_string.ts:405` computes
`Math.ceil(totalWidth / maxWidth)`, so `0` gives `Infinity` lines and breaks after every glyph.

---

## 3. Executed against the installed MapLibre source

Seven assertions, run under vitest against `node_modules/maplibre-gl/src/**` imported by absolute
path (the package `exports` map blocks the `maplibre-gl/src/...` subpath). The file lived in the
session scratchpad and was run from inside the repo so module resolution worked; it is **not** in the
repo, for the reason `map-zoom-bands-2026-08-29.md` gives — it reaches into another package's
internals and would break on an upgrade. Reproduced here so it can be re-created.

Inputs are the **real** metadata our builder emits for a flagged country at `devicePixelRatio` 2:
bitmap `188×100`, `content = [90, 0, 138, 100]`, `stretchX = [[90, 138]]`.

```ts
import { ImagePosition, IMAGE_PADDING } from '<repo>/node_modules/maplibre-gl/src/render/image_atlas.ts';
import { shapeIcon, fitIconToText } from '<repo>/node_modules/maplibre-gl/src/symbol/shaping.ts';
import { getIconQuads } from '<repo>/node_modules/maplibre-gl/src/symbol/quads.ts';

const PR = 2, BITMAP_W = 188, BITMAP_H = 100;
const CONTENT: [number, number, number, number] = [90, 0, 138, 100];
const STRETCH_X: [number, number][] = [[90, 138]];

function pillImagePosition() {
  const paddedRect = { x: 0, y: 0, w: BITMAP_W + 2 * IMAGE_PADDING, h: BITMAP_H + 2 * IMAGE_PADDING };
  return new ImagePosition(paddedRect, {
    pixelRatio: PR, version: 0, stretchX: STRETCH_X, stretchY: undefined,
    content: CONTENT, textFitWidth: undefined, textFitHeight: undefined,
  } as never);
}

/** A one-line shaping `width` px wide and `1.2em` tall, centred on the anchor, in glyph units. */
function shapedText(widthPx: number, textSizePx: number) {
  const fontScale = textSizePx / 24;
  const halfW = widthPx / 2 / fontScale;
  const halfH = (textSizePx * 1.2) / 2 / fontScale;
  return { left: -halfW, right: halfW, top: -halfH, bottom: halfH } as never;
}

const fitted = (labelWidthPx: number, textSizePx = 14) =>
  fitIconToText(shapeIcon(pillImagePosition(), [0, 0], 'center'),
    shapedText(labelWidthPx, textSizePx), 'width', [0, 0, 0, 0], [0, 0], textSizePx / 24);

/** Quad extents in CSS px relative to the anchor: em offsets plus the fixed pixel offsets. */
function extents(labelWidthPx: number) {
  const quads = getIconQuads(fitted(labelWidthPx), 0, false, true);
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const q of quads) {
    x1 = Math.min(x1, q.tl.x + q.pixelOffsetTL.x);
    x2 = Math.max(x2, q.br.x + q.pixelOffsetBR.x);
    y1 = Math.min(y1, q.tl.y + q.pixelOffsetTL.y);
    y2 = Math.max(y2, q.br.y + q.pixelOffsetBR.y);
  }
  return { x1, x2, y1, y2, width: x2 - x1, height: y2 - y1 };
}
```

| # | Assertion | Result |
|---|---|---|
| 1 | `extents(60)` → `x1 ≈ -75.5`, `x2 ≈ 55.5`, `width ≈ 131` — 45 px of cap before the label, 25 px after it, plus `IMAGE_PADDING` (1 raw px → 0.5 CSS px) each side | pass |
| 2 | `extents(140).width - extents(20).width === 120` — the pill grows by the label width and by nothing else; the caps never stretch | pass |
| 3 | `extents(w).height ≈ 51` for `w ∈ {20, 60, 140}` — 100 raw px / 2 + padding. The vertical axis is 1:1 because `content` spans the full bitmap height | pass |
| 4 | `y1 + y2 ≈ 0` for the same three widths — the pill is centred on the label's line box | pass |
| 5 | `extents(8).width ≈ 79` and `x1 < x2` — a one-digit count (the narrowest label the area band can produce) does not invert the geometry | pass |
| 6 | `fitIconToText(…, 'bottom-right', …)` equals `fitIconToText(…, 'center', …)`; `iconOffset [7, -3]` shifts `left` by `+7` and `top` by `-3` | pass |
| 7 | `fitted(60).collisionPadding` is `[45, 0, 25, 0]` | pass |

`Test Files 1 passed (1) · Tests 7 passed (7)`.

---

## 4. The geometry I chose, and why

All CSS pixels, before `devicePixelRatio` (`SUMMARY_PILL` in `country-flag-image.ts`).

```
                 ← 8 →                                             ← 8 →
   ┌───────────────────────────────────────────────────────────────────┐  ─┬─ 8
   │      ╭─────────────────────────────────────────────────────╮      │   │
   │      │   ⬤ flag 24        United Kingdom  18               │      │  34
   │      ╰─────────────────────────────────────────────────────╯      │   │
   └───────────────────────────────────────────────────────────────────┘  ─┴─ 8
          ↑     ↑              ↑                                ↑
     pill edge  cap centre     content[0] = 45         content[2] = W − 25
                (= 8 + 17)
```

| Choice | Value | Why |
|---|---|---|
| Pill height | 34 | 14 px label with 10 px above and below. |
| Corner radius | 17 | Fully rounded — `height / 2`. |
| Shadow margin | 8 all round | `shadowBlur 5 + shadowOffsetY 1.5 = 6.5 ≤ 8`, so the shadow never clips **and** the bitmap stays vertically symmetric about the pill's centre. That symmetry is what makes the pill sit centred on its label (§3, test 4). |
| Bitmap height | **50** | `34 + 2×8`. This is the tap target — see §5. |
| Capless side padding | **17, i.e. `= radius`** | Load-bearing, not taste. The stretched span is `content`, and every column in it is repeated across the label's width; a content edge inside a rounded end would smear that curve the whole length of the pill. `padX === radius` puts both edges exactly on the flat middle. Asserted in `country-flag-image.test.ts`. |
| Flag cap | 24 diameter, centred at `x = 8 + 17` | **Concentric with the pill's leading arc**, so it is inset 5 px from the border at every angle and cannot touch it. |
| Flag cap → label gap | 8 | This is the owner's *"first letter overlaps the ring"* defect, removed by construction. |
| Flag inked box | 20 × 15 | Down from 27 × 20 in the disc. The flag no longer carries recognition on its own — the country's **name** is in the pill beside it. |
| `content` vertical | `[0, bitmapHeight]`, always | With `icon-text-fit: 'width'` the vertical axis is not fitted, but `quads.ts` still maps `content`'s vertical band onto the icon's natural height. A shorter band scales the whole pill up vertically. Asserted, and executed (§3, test 3). |
| `stretchX` | exactly `[[content[0], content[2]]]` | `fixedContentWidth` is then 0, so the rendered middle is exactly the label's width and the pill can be as narrow as a one-digit count. A narrower stretch zone imposes a minimum width. Executed (§3, test 5). |
| Rounding | `Math.round(cssPx × pixelRatio)`, once | A fractional `content` edge is a fractional texture cut, which shows as a seam in the stretched middle. |

Computed values, dumped from the module at three pixel ratios:

```
dpr=1 capped=true  bitmap=94x50   content=[45,0,69,50]    flat=[25,69]
dpr=1 capped=false bitmap=74x50   content=[25,0,49,50]    flat=[25,49]
dpr=2 capped=true  bitmap=188x100 content=[90,0,138,100]  flat=[50,138]
dpr=2 capped=false bitmap=148x100 content=[50,0,98,100]   flat=[50,98]
dpr=3 capped=true  bitmap=282x150 content=[135,0,207,150] flat=[75,207]
dpr=3 capped=false bitmap=222x150 content=[75,0,147,150]  flat=[75,147]
```

`flat` is the pill's flat middle in the same raw pixels. Both `content` edges are inside it at every
ratio — that is the invariant the table above is about, and it is asserted in the unit tests rather
than only here.

### The mint ring

The active country's pill takes the mint token (`--pin`) **as its border, at 2 px**, replacing the
1 px `--border` hairline. Not an outer ring with a gap, as the disc had: an outer ring changes the
bitmap's outer geometry, `content` is measured from that edge, and the pill would then shift under
its own label the moment a country became active. Both states are byte-identical in size — asserted
(`keeps the two states the same size…`).

### One pill serves both bands

`countryCode: null` builds the **capless** pill, and that single image is both the area band's marker
and §2.5's countryless country marker. `AREA_DISC_SPEC` still resolves to it, so
`map-surface.mapcn.tsx` needed no change. The two bands' layer objects now differ in exactly one
key — where the image id comes from (`['get','icon']` vs a constant) — and there is a test that
destructures both and asserts the remainder is equal.

### The two-letter-code fallback survives, with a caveat for the owner

On a platform with no flag glyph (Windows' Segoe UI Emoji), the cap draws the two-letter code, as
before — same cap, same geometry, so nothing about the pill changes. It does now read
`GB  United Kingdom  18`, which is mildly redundant. The alternative is to drop the cap entirely on
those platforms and let the name do the work, but that *removes* the fallback the brief protects, so
I kept it and am flagging it rather than deciding it.

---

## 5. The non-regressions, and how each is held

| Must not regress | How it is held now |
|---|---|
| Bands stay `maxzoom 4.5` / `4.5–8.5` / `minzoom 8.5`, declarative | `zoom-bands.ts` untouched. `summary-style.test.ts` asserts `COUNTRY_BAND_ZOOM.maxzoom === AREA_BAND_ZOOM.minzoom` **and** that neither `summary-style.ts` nor `summary-marker-layer.tsx` contains the literals `4.5` or `8.5`. |
| No zoom listener, no React state on zoom | Source-text assertion against `summary-marker-layer.tsx` for `'zoom'`, `'zoomend'`, `getZoom(`, `useState`. |
| Every summary layer stays a **symbol** layer | Source-text assertion: exactly two `type: 'symbol'`, no `type: 'circle'`, no `circle-radius`. The three measured reasons are carried over verbatim into `areaLayerLayout`'s doc comment. |
| The mint ring survives as a state on the pill | `rings the active country in the mint token and nothing else` — inactive strokes are `[border@1, border@1]`, active is `[ring@2, border@1]`. |
| The two-letter-code fallback survives | `draws the two-letter code in the same cap when it does not`. |
| Tap targets ≥ 44 px | Bitmap is **50 px** tall and at least `50 + label` wide. `collision_feature.ts:78-81` expands the fitted box by `collisionPadding` back out to the whole image (§2 finding 6, executed as §3 test 7), so the hit box *is* the pill. Asserted twice: `SUMMARY_PILL_HEIGHT >= 44` and `SUMMARY_TAP_TARGET_PX >= 44`. |
| Legible on both themes, no new colour values | Only `--card`, `--border`, `--foreground`, `--pin` — the four `resolveDiscTokens` already resolved. `TOKEN_FALLBACK` is unchanged from the disc version. Dark-theme test unchanged in intent. |
| `no-density-clustering.test.ts` keeps asserting against `place-marker-layer.tsx` | No summary code moved into that file; that test is untouched and still passes. |

---

## 6. What I did **not** verify

**Everything visual.** I have no browser, ran no dev server, took no screenshot, and never saw a
pill. Specifically unverified:

1. **That it looks right.** Pill height, radius, padding, the flag's size inside the cap, and the
   weight of the shadow are all judgement calls made in numbers, not on screen.
2. **Vertical centring of the glyphs inside the pill.** §3 test 4 proves the pill is centred on the
   text's **line box**. Whether the glyphs are optically centred within that line box is MapLibre's
   ordinary text rendering, and a 1–2 px offset that was invisible on the basemap becomes visible
   on a surface. If it sits high or low, the fix is `icon-offset: [0, n]` on both layers — verified
   as still applied under `icon-text-fit` (§3 test 6).
3. **The stretched middle is seam-free.** The maths says the stretched columns are flat pill body;
   I have not looked at a rendered pixel.
4. **Hebrew.** `['concat', …]` is one section and therefore takes the bidi path — that is a source
   reading, not a render. `תל אביב-יפו  6` has not been drawn.
5. **The flag cap on a real font.** The painted-box scan is driven by a fake canvas in the tests;
   no Apple / Noto / Segoe flag has actually been rasterised at 24 px.
6. **The code fallback**, for the same reason, and the `GB  United Kingdom` redundancy in §4 is a
   design opinion I have not seen either.
7. **Both breakpoints.** Not checked. A long name (`Bosnia and Herzegovina  3`) makes a wide pill and
   I do not know how wide it is against a 390 px viewport.
8. **Performance.** The pill bitmaps are larger than the discs (94×50 vs 59×59 at 1x) and there is
   one per country per state per theme. Not measured; the count is unchanged, so this should be
   noise, but it is an assumption.
9. **`queryRenderedFeatures` on the new hit box.** The collision-box maths is executed; the click
   handlers are not exercised against a live map.
10. **Style reload.** The `addImage` call now carries `stretchX`/`content`; I have not watched a
    `setStyle` destroy and rebuild the image manager with the new metadata.

---

## 7. Commands run, and their output

```
npx tsc --noEmit                    → clean, no output
npx vitest run tests/unit/map       → Test Files 8 passed (8) · Tests 166 passed (166)
npx vitest run                      → Test Files 85 passed (85) · Tests 1557 passed (1557)
npx eslint <the five files>         → clean, no output
npm run lint                        → 0 errors, 2 warnings, both pre-existing
                                      (`no-img-element` in import-page-client.tsx and place-sheet.tsx,
                                       neither touched here)
npm run check:layers                → all OK
```

The scratchpad MapLibre-source test (§3) reported `Test Files 1 passed (1) · Tests 7 passed (7)` and
was deleted from the repo after running.

**No browser run, no dev server, no deployment, no database access, no network calls.**
