# Zoom bands on the map — mechanics verified against MapLibre GL 6.4.1

> Task **LIBRARY-IA-2-MAP-MECHANICS**, 2026-08-29. Owner: `maps-geospatial`.
> **Investigation only.** No source file was touched, no branch created, no commit made.
> Source of truth for the surface is `docs/ux-library-at-scale.md` §2.1–§2.4 and §7.
>
> Installed version confirmed: `node -e "require('maplibre-gl/package.json').version"` → **6.4.1**
> (`package.json` declares `^6.4.1`). Everything below was checked against
> `node_modules/maplibre-gl/src`, not against the v5 API surface the repo's docs described until
> 2026-08-28.

---

## 0. Method, and what "verified" means in this document

Two kinds of check, kept apart on purpose.

**Executed.** Two throwaway vitest files were run against the installed MapLibre *source*
(`node_modules/maplibre-gl/src/**`, imported by absolute path — the package's `exports` map blocks
the `maplibre-gl/src/...` subpath), under a scratchpad config with `root` pointed at the repo so
module resolution works. Ten assertions, all passing. The files live in the session scratchpad and
are **not** in the repo; their assertions are reproduced inline below so the checks can be
re-created.

**Read.** Where a claim needs a browser (a real tile, a real collision index, a real WebGL canvas)
I read the installed source and say so. A claim that could not be settled either way is listed in
§10 and is not used to justify a design decision.

Nothing here spent provider quota. No network call was made.

---

## 1. Answers in one table

| # | Question | Answer | Grade |
|---|---|---|---|
| 1 | `minzoom`/`maxzoom` semantics | **`minzoom` inclusive, `maxzoom` exclusive.** Bands: country `maxzoom: 4.5`; area `minzoom: 4.5, maxzoom: 8.5`; pins `minzoom: 8.5` | VERIFIED (executed) |
| 2 | Can the pin layer just gain a `minzoom`? | **Yes.** It is a symbol layer, so `queryRenderedFeatures` and the click delegate go through the collision index, which is only populated inside the band | VERIFIED (executed + read) |
| 3 | `addImage` for flags | Add on **data change**, in the same effect as `setData`, images first; never remove; guard with `hasImage`; re-add on every `styleReady` transition | VERIFIED (read) |
| 4 | Count as a separate layer? | **One symbol layer**, `icon-image` + `text-field`, not two | VERIFIED (read) |
| 5 | Area circle + label, RTL, font | RTL is global and covers new layers; extract `styleTextFont` into a shared module | VERIFIED (read) |
| 6 | Country tap camera | `cameraForBounds` → clamp zoom → `easeTo`. `fitBounds` **cannot** express the floor | VERIFIED (executed) |
| 7 | Failure modes | Zero-extent bounds is safe and lands on `maxZoom`; antimeridian is **not** safe; reduced motion is free | VERIFIED (executed + read) |

---

## 2. Q1 — `minzoom` / `maxzoom`, exactly

### The rule in the installed code

`node_modules/maplibre-gl/src/style/style_layer.ts:323`:

```ts
isHidden(zoom: number = this.minzoom, roundMinZoom: boolean = false): boolean {
    if (this.minzoom && zoom < (roundMinZoom ? Math.floor(this.minzoom) : this.minzoom)) return true;
    if (this.maxzoom && zoom >= this.maxzoom) return true;
    return this._evaluatedVisibility === 'none';
}
```

So at the painter's fractional zoom: **`zoom === minzoom` renders, `zoom === maxzoom` does not.**
Half-open, `[minzoom, maxzoom)`.

The same rule is written a second time, independently, for symbol *placement* —
`src/style/pauseable_placement.ts:105-107`:

```ts
(!layer.minzoom || layer.minzoom <= placementZoom) &&
(!layer.maxzoom || layer.maxzoom > placementZoom)
```

Two implementations, one convention. That matters for Q2: it is why a symbol layer outside its band
is not merely unpainted but genuinely absent from the collision index.

### The exact values for the three bands

`ux-library-at-scale.md` §2.1 wants `z < 4.5` country, `4.5 ≤ z < 8.5` area, `z ≥ 8.5` pins. With a
half-open interval that is a direct transcription — no ±epsilon, no shared boundary value trickery:

| Layer group | `minzoom` | `maxzoom` |
|---|---|---|
| Country disc (+ its count, same layer) | *omitted* | `4.5` |
| Area circle, area count, area label (all three) | `4.5` | `8.5` |
| `places-pins-*` (existing) | `8.5` | *omitted* |

Omit `minzoom` on the country layer rather than writing `0`: `if (this.minzoom && ...)` treats `0`
as falsy, so `minzoom: 0` is already a no-op — but writing it invites the next reader to assume a
`maxzoom: 0` would work too, and it would not.

### How it was verified

Executed against the installed source. `createStyleLayer` from
`node_modules/maplibre-gl/src/style/create_style_layer.ts`, three symbol layers built with exactly
the values above, then `isHidden(z)` sampled at
`[0, 4.4, 4.49999, 4.5, 4.500001, 6, 8.4999, 8.5, 8.500001, 14, 22]`:

- **exactly one** of the three layers is visible at every one of those zooms — no gap, no overlap;
- `area.isHidden(4.5) === false`, `area.isHidden(4.499999) === true`;
- `area.isHidden(8.5) === true`, `area.isHidden(8.499999) === false`;
- `country.isHidden(4.5) === true`, `pins.isHidden(8.5) === false`.

Two further results from the same run that are easy to get wrong:

- **The tile bucket is built one integer zoom *below* a fractional `minzoom`.**
  `src/source/worker_tile.ts:109` calls `layer.isHidden(this.zoom, true)` — tile zoom, with
  `roundMinZoom`. So `area.isHidden(4, true) === false` (the bucket for tile z4 *is* built, because
  tile z4 serves map zooms 4.0–4.999 and the band opens at 4.5) while `area.isHidden(4, false)
  === true` (the painter still hides it at map zoom 4.2). This is a feature, and it is also the
  source of the only real hazard in this design — see §3.2.
  `maxzoom` is **not** rounded: `area.isHidden(9, true) === true`.
- **A layer whose `minzoom` equals its `maxzoom` is deleted from the layer index entirely.**
  `src/style/style_layer_index.ts:56` calls `isHidden()` with no argument, which defaults `zoom` to
  `this.minzoom`; `minzoom >= maxzoom` then trips the second clause. `symbolLayer('x', 8.5,
  8.5).isHidden() === true`. Never write a band as `[8.5, 8.5]`, and never let a constants file
  compute one.

---

## 3. Q2 — giving the existing pin layer a `minzoom`

### 3.1 It is safe, and the reason is that it is a symbol layer

Three consumers could have broken. None does.

**`queryRenderedFeatures`.** `src/style/style.ts:1574` runs two paths and merges them: a per-tile
grid query (`FeatureIndex.query`) and a collision-index query
(`query_features.ts:queryRenderedSymbols`). **Symbol buckets never insert into the tile grid** —
`grep featureIndex src/data/bucket/symbol_bucket.ts` finds only `collisionArrays.*FeatureIndex` and
`featureSortOrder`, no `options.featureIndex.insert(...)` (compare `circle_bucket.ts:140`, which
does insert). So a symbol layer is reachable *only* through the collision index, and the collision
index is only populated for layers whose band contains the placement zoom
(`pauseable_placement.ts:105-107`, quoted above). Outside the band: no placed symbols, no query
results.

**`map.on('click', layerId, …)`.** It is `queryRenderedFeatures` with extra steps —
`src/ui/map.ts:2119-2129`:

```ts
const delegate = (e) => {
    const existingLayers = layerIds.filter((layerId) => this.getLayer(layerId));
    const features = existingLayers.length !== 0 ? this.queryRenderedFeatures(e.point, {layers: existingLayers}) : [];
    if (features.length) { e.features = features; listener.call(this, e); delete e.features; }
};
```

No features → the listener is never called. So the click handler inherits the band for free, and
`place-marker-layer.tsx`'s handler needs no zoom guard. (Note the `getLayer` filter: a layer id
that does not exist yet is silently skipped rather than throwing, which makes the array form of
`map.on` race-safe.)

**The selection effect.** `map.setLayoutProperty(pinLayerId, 'icon-image' | 'symbol-sort-key', …)`
on a layer that is currently out of band is a no-op with no error: the layer is still in
`style._layers` and still in the layer index (`isHidden()` with `minzoom: 8.5` and no `maxzoom`
returns `false`), it simply has no bucket at the current tile zoom. Selecting a place from the list
at world zoom therefore still works — camera mover 3 flies to it and lands at `maxZoom: 15`, well
inside the pin band, and the layer is repainted with the selected image.

**One `allow-overlap` detail that could have bitten and does not.** The pin layer sets
`icon-ignore-placement: true` / `text-allow-overlap: true`. Symbols with overlap allowed go into
the collision index's `ignoredGrid` rather than its `grid` — and
`src/symbol/collision_index.ts:queryRenderedSymbols` queries **both**:
`this.grid.query(...).concat(this.ignoredGrid.query(...))`. That is why pins are clickable today,
and it is why the country and area markers will be clickable with overlap on.

### 3.2 The one real hazard: a **circle** layer is clickable outside its band

`FeatureIndex.query` (`src/data/feature_index.ts:130-200`) and `Style.queryRenderedFeatures`
contain **no zoom-range check at all**. For a non-symbol layer the only thing gating a query result
is whether the tile's bucket exists — and `worker_tile.ts` builds that bucket with `roundMinZoom`.

Combine the two and the hazard window is precise and narrow: a circle layer with
`minzoom: 4.5, maxzoom: 8.5` has its bucket built for tile z4 and tile z8, so it is **invisible but
still hit-testable** at map zoom `[4.0, 4.5)` and `[8.5, 9.0)`. At map zoom 8.7 the user sees pins,
taps one, and can hit a ghost area disc that is not on screen.

This does not affect the pin layer (symbol). It **does** affect §2.3's area disc if that disc is a
`circle` layer, which is what the spec asks for and what `country-flag-image.ts`'s new `DiscTokens`
comment now assumes.

**Mitigation, and it is three lines rather than a redesign:** guard the area click handler on the
band.

```ts
map.on('click', [areaCircleLayerId, areaCountLayerId], (event) => {
  if (!inBand(map.getZoom(), AREA_BAND)) return;   // ghost-tap guard, see docs/evidence/map-zoom-bands
  ...
});
```

Reading `map.getZoom()` inside a click handler is **not** the zoom listener §2.1 forbids: nothing
re-renders, nothing subscribes, MapLibre still owns the band swap.

Grade: the two halves are separately VERIFIED (the bucket half executed —
`area.isHidden(4, true) === false`; the query half by reading the absence of any zoom check on the
grid path). The **composite** — an actually-observed ghost tap in a browser at zoom 8.7 — is
ASSUMED. It should be checked once on device; it is cheap to check and cheap to guard against
either way, so I recommend shipping the guard regardless of the outcome.

---

## 4. Q3 — `map.addImage` for the flag discs

### 4.1 What a missing image actually does — the `place-features.ts` claim is half right

`place-features.ts`'s header says "MapLibre drops the whole symbol rather than falling back". In
6.4.1 that is **true only when the symbol has no text**. `src/symbol/symbol_layout.ts:229-256`:

```ts
let shapedIcon;
if (feature.icon?.name) {
    const image = args.imageMap[feature.icon.name];
    if (image) { shapedIcon = shapeIcon(...); }        // missing id -> shapedIcon stays undefined
}
const shapedText = getDefaultHorizontalShaping(...) || shapedTextOrientations.vertical;
if (shapedText || shapedIcon) { addFeature(...); }     // <- either one is enough
```

So:

- For the **pin layer below `LABEL_MIN_ZOOM = 14`** the `text-field` `step` yields `''`, there is no
  shaped text, and a missing image really does delete the pin. The header's claim holds where it was
  written.
- For the **country layer**, which carries the count as text in the same symbol (§5), a missing disc
  image degrades to *a bare count with no disc* — ugly, but nothing disappears. That is the better
  failure and it is worth having on purpose.

`place-features.ts`'s header should be narrowed to say "when the symbol has no text" when someone
next edits that file. Not my file to change in this task; flagging it.

### 4.2 Adding images when the data changes

`Style.addImage` (`src/style/style.ts:949`) fires an `ErrorEvent` if the id already exists, so the
existing `if (!map.hasImage(image.id))` guard in `place-marker-layer.tsx` is mandatory, not
defensive.

`_afterImageUpdated` → `_markImagesChanged` → `_updateTilesForChangedImages` →
`tileManager.reloadTilesForDependencies(['icons','patterns'], changedImages)`. A tile records the
icon ids it *asked for* — including ones that came back missing (`style.ts:1903`
`tileManager.setDependencies(params.tileID.key, params.type, params.icons)`, fed from
`worker_tile.ts:144` `Object.keys(options.iconDependencies)`). So **adding an image after the
symbols were laid out does repair them**, at the cost of one worker round trip and a frame or two of
countless discs.

That gives the ordering rule:

> **Build and add the images first, then `setData`, in the same effect body.** Not two effects, and
> not images-after-data.

Data-first is *correct* but visibly worse: the tile lays out with no icons, then reloads. Since the
set of countries is data-dependent, both steps belong to the same data-change effect.

### 4.3 The concrete recipe

```
effect deps: [map, styleReady, data, theme, activeCountryCode]

1. if (!map || !styleReady) return
2. specs   = features.map(f => ({ countryCode: f.countryCode, active: f.countryCode === activeCountryCode }))
3. images  = buildCountryDiscImages(specs, { pixelRatio: window.devicePixelRatio || 1, theme })
4. for (const image of images)
       if (!map.hasImage(image.id)) map.addImage(image.id, image.data, { pixelRatio: image.pixelRatio })
5. (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data)
```

**Id scheme:** already decided by `countryDiscImageId` and it is the right one —
`country-disc:{theme}:{CODE|none}{:active}`. Two properties make it safe: it is pure and SSR-safe,
and it encodes every input that changes the bitmap (theme and the mint ring), so an id collision
cannot render a stale disc.

**Do not compute the id in a MapLibre expression.** Put the finished id on the feature and use
`'icon-image': ['get', 'icon']`. `marker-style.ts` already documents the trap this avoids —
`['==', ['get', 'x'], null]` does not evaluate to false, it fails, and an `icon-image` that fails to
evaluate produces *no icon at all* (measured on this repo: every pin vanished while the source held
all ten features). The active-country arm of a `concat`/`case` expression is exactly that shape.
The cost is that the feature collection is rebuilt when the active country changes; at ≤ ~25
country features that is free, and it is a different trade from the pin layer's, where the selected
id changes on every tap over hundreds of features.

**Never remove an image.** `removeImage` fires an `ErrorEvent` when the id is absent, and its
`_markImagesChanged` reloads every tile that ever depended on it — so removing a country's disc
because the last place in it was deleted costs a full tile reload to reclaim ~55 KB
(`COUNTRY_DISC_SIZE` 59 × 59 px × 4 channels × dpr² ≈ 55 KB at dpr 2). At 25 countries the whole
set is ~1.4 MB of GPU-bound atlas at dpr 2, and `country-flag-image.ts`'s own module-level cache
means re-adding is free anyway. Leaking a handful of discs is strictly cheaper than churning tiles.

**Style reload.** `Style`'s constructor does `this.imageManager = new ImageManager()`
(`src/style/style.ts:254`), so **every added image is destroyed by `setStyle`**. The mapcn wrapper
calls `mapInstance.setStyle(pendingStyle, { diff: false })` on a theme change
(`src/components/ui/map.tsx:396`) but guards on the URL: `if (currentStyleRef.current === newStyle)
return`. `/map` passes the same CARTO Positron URL for `light` and `dark`, so today no theme change
swaps the style — but that is a property of one call site, not of the mechanism. Because the recipe
above lists `styleReady` in its deps and `useStyleReady` flips false→true across a swap, the images
are re-added automatically. **This is the reason the image add belongs in the data effect and not in
the one-shot setup effect**: it has to re-run on *both* triggers.

One non-issue worth recording so nobody chases it: `_afterImageUpdated` fires a `styledata` event,
which `useStyleReady` subscribes to — but its snapshot (`layers.length > 0`) is unchanged, so
`useSyncExternalStore` does not re-render. Adding an image cannot loop the effect.

---

## 5. Q4 — the count: **one symbol layer, not two**

Recommendation: **one** symbol layer carrying both `icon-image` (the disc) and `text-field` (the
count). Four reasons, all specific to what 6.4.1 does:

1. **Icon and text of one symbol are placed atomically.** `src/symbol/placement.ts:752-762`: with
   `text-optional` and `icon-optional` both at their spec defaults (`false`, confirmed from
   `@maplibre/maplibre-gl-style-spec` v8), the code runs `placeIcon = placeText = placeIcon &&
   placeText`. A count can never appear without its disc, or a disc without its count. Two layers
   would make that an invariant somebody has to maintain instead of one the renderer enforces.
2. **With `icon-allow-overlap` and `text-allow-overlap` both `true`, both are unconditionally
   drawn.** `placement.ts:451-452` computes `alwaysShowText = textAlwaysOverlap && (iconAlwaysOverlap
   || …)` and the mirror for the icon; line 817-818 then makes visibility unconditional. §2.3 wants
   overlap allowed, so this is the configuration anyway — and it is only deterministic when both
   flags are on the *same* layer.
3. **`icon-text-fit` is not a threat and must stay `none`.** Its spec default is `'none'` and
   `symbol_layout.ts:326-333` only calls `fitIconToText` when it is not `none`. Left alone, the
   59 px disc bitmap is never stretched to the count's box. This is the property that made a
   one-layer design plausible; it is worth stating explicitly, because turning `icon-text-fit` on
   would silently rescale the flag.
4. **Half the buckets.** One symbol bucket per tile instead of two, one placement pass instead of
   two, one `symbol-sort-key`.

The counter-argument for two layers is independent paint control (a halo on the count that the disc
does not get). That is available on one layer too — `text-halo-*` are text-only paint properties.
There is no case where two layers buy something one cannot do.

### Layout, concretely

```ts
{
  'icon-image': ['get', 'icon'],          // pre-built id, see §4.3
  'icon-anchor': 'center',                // spec default; the disc bitmap is centred on the centroid
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'text-field': ['to-string', ['get', 'count']],
  'text-font': styleTextFont(map),        // shared helper, see §6.3
  'text-size': COUNTRY_DISC.codeFontPx,   // 14 — the constant the fallback code is drawn at
  'text-anchor': 'top',
  'text-offset': [0, COUNT_OFFSET_EM],
  'text-allow-overlap': true,
  'text-ignore-placement': true,
}
```

`text-offset` is **in ems of `text-size`** (spec: `units: "ems"`) and is measured from the symbol's
anchor point — the feature's coordinate — not from the icon's edge. The disc's outer ring radius is
`diameter/2 + ringGap + ringWidth = 18 + 2 + 2.5 = 22.5` CSS px, so a count sitting 3 px under the
ring is `(22.5 + 3) / 14 = 1.82` em:

```ts
export const COUNT_OFFSET_EM = 1.82;   // (22.5 px ring radius + 3 px gap) / 14 px text
```

**Caveat this is where I stop and design-system starts.** §2.2 writes the marker as `🇯🇵 24`, and
`country-flag-image.ts` fills the 36 px disc with a 27 × 20 flag box — there is no room *inside* the
disc for digits. Below-the-disc is the placement that follows from the geometry already committed
and it matches the area marker's label-beneath rule, but *where the count sits* is
`design-system-frontend`'s call, not mine. The mechanism — one layer, `text-offset` in ems, offset
constant across the ring/no-ring states because `country-flag-image.ts` reserves ring space in every
bitmap — holds wherever they put it.

---

## 6. Q5 — the area band

### 6.1 Three layers, in this order

| Layer | Type | Why |
|---|---|---|
| `area-disc` | `circle` | The disc. §2.3, and `resolveDiscTokens` now exists to keep it materially identical to the country disc |
| `area-count` | `symbol` | The count, centred on the disc |
| `area-label` | `symbol` | The area name beneath, with a halo |

All three carry `minzoom: 4.5, maxzoom: 8.5`. All three read one source.

Why the count is not baked into the circle: a `circle` layer has no text. Why the count and the
label are two symbol layers rather than one: a symbol has exactly one `text-field`, and these two
differ in anchor, size, colour and halo. `format` expressions cannot give two sections different
offsets.

Paint/layout, using the tokens the flag module now exports:

```ts
const tokens = resolveDiscTokens(theme);   // src/components/map/country-flag-image.ts

// area-disc (circle)
paint: {
  'circle-radius': 22,                      // 44 px target; see below
  'circle-color': tokens.surface,
  'circle-stroke-width': COUNTRY_DISC.borderWidth,   // 1
  'circle-stroke-color': tokens.border,
}

// area-count (symbol)
layout: { 'text-field': ['to-string', ['get','count']], 'text-font': styleTextFont(map),
          'text-size': COUNTRY_DISC.codeFontPx, 'text-anchor': 'center',
          'text-allow-overlap': true, 'text-ignore-placement': true }
paint:  { 'text-color': tokens.ink }

// area-label (symbol)
layout: { 'text-field': ['get','label'], 'text-font': styleTextFont(map), 'text-size': 12,
          'text-anchor': 'top', 'text-offset': [0, (22 + 4) / 12],   // 2.17 em
          'text-max-width': LABEL_MAX_WIDTH_EM, 'text-allow-overlap': true,
          'text-ignore-placement': true }
paint:  { 'text-color': '#1B1B1A', 'text-halo-color': '#FAF9F6', 'text-halo-width': 1.6 }
```

`circle-radius: 22` rather than the country disc's 18, and that is deliberate: a circle layer's hit
test is `circle-radius + circle-stroke-width` in viewport pixels
(`src/style/style_layer/circle_style_layer.ts:queryRadius` / `queryIntersectsFeature`), so 22 + 1 is
a 46 px target and clears §6's 44 px floor. The country disc needs no such bump — its tap box is the
icon's collision box, which is the 59 px bitmap plus `icon-padding` (default 2), ~63 px.

### 6.2 RTL — `ensureRtlTextPlugin()` does cover a new layer

VERIFIED by reading. The plugin is not per-layer and not per-source: `src/symbol/shaping.ts:134`
pulls `processBidirectionalText` / `processStyledBidirectionalText` off the module-level
`rtlWorkerPlugin` (`src/source/rtl_text_plugin_worker.ts`) inside `shapeText`, which **every**
symbol layer's text goes through in the worker. `setRTLTextPlugin` is a global registration, and
`map-surface.mapcn.tsx` calls `ensureRtlTextPlugin()` at module scope with `lazy: false`, so it is
registered before any tile is laid out. `תל אביב-יפו` will shape correctly in a layer added later,
with no additional wiring.

The one thing to not do: nothing in the new layers may call `setRTLTextPlugin` again — it throws on
a second call, which is why `rtl-text.ts` guards on `getRTLTextPluginStatus() !== 'unavailable'`.

### 6.3 The font stack — yes, extract `styleTextFont`

`styleTextFont(map)` is currently private to `place-marker-layer.tsx`. Three layers in this feature
need it, so it must be shared, and copying it would be actively dangerous: the function encodes a
measured fact about CARTO Positron (its first symbol layer is a *water label in Montserrat Italic*,
so "first stack found" put every place name in italics) and a second copy is a second chance to lose
that fix.

**Recommendation:** move it verbatim to `src/components/map/style-text-font.ts`, export
`styleTextFont(map: MapLibreMap): string[]`, and have `place-marker-layer.tsx` import it. Pure move,
no behaviour change, its own commit. It cannot live in `marker-style.ts` — that file is deliberately
free of the MapLibre runtime so its expressions are node-testable, and this function takes a `Map`.

---

## 7. Q6 — the country tap camera

### 7.1 `fitBounds` cannot express this. `cameraForBounds` + clamp + `easeTo` can.

`FitBoundsOptions` is `FlyToOptions & { linear, offset, maxZoom }` (`src/ui/camera.ts:183-202`).
It *does* have a `minZoom` — inherited from `FlyToOptions` — and it is **not** a floor on the
destination. Its documented meaning is "the minimum zoom level that the flight arc may reach", i.e.
a ceiling on how far the van-Wijk arc dips out mid-flight; it is read only inside `flyTo`
(`camera.ts:1067`), and with `linear: true` (which routes to `easeTo`) it is ignored entirely. It
cannot raise a destination zoom.

The ceiling *is* expressible: `cameraForBoxAndBearing` computes
`zoom = Math.min(scaleZoom(tr.scale * Math.min(scaleX, scaleY)), options.maxZoom)`
(`src/geo/projection/camera_helper.ts:206`). One-sided by construction.

So the concrete call is:

```ts
const camera = map.cameraForBounds(
  [[bounds.west, bounds.south], [bounds.east, bounds.north]],
  { padding, maxZoom: AREA_BAND_MAX_SAFE }        // 8.4 — see §7.3
);
if (!camera) return;                              // it warns and returns undefined; never assume
map.easeTo({
  center: camera.center,
  zoom: Math.max(camera.zoom, AREA_BAND_MIN_SAFE), // 4.6 — the floor fitBounds cannot give you
  duration: COUNTRY_TAP_MS,                        // 600, per §2.4
});
```

Not `fitBounds`. `_fitInternal` does `options = extend(calculatedOptions, options)` — the caller's
options win, so `fitBounds(b, { …, zoom: clamped })` *would* work by overriding the computed zoom —
but that is a trick that depends on argument order inside a private method, and the explicit
two-step says what it means.

**Padding comes from the existing helpers, unchanged.** `map-surface.mapcn.tsx`'s
`fitBoundsPadding(viewportWidth, container.clientWidth, container.clientHeight,
restingSheetFraction, floatingTopChromePx)` already composes `mapOcclusionInsets` +
`FIT_BOUNDS_PADDING` + floating chrome and runs the result through `clampFitPadding`. The country
tap must call that same function. No new pixel constants.

### 7.2 Why a floor is genuinely needed — measured

Executed against the installed `cameraForBoxAndBearing` with a real `MercatorTransform` sized
390 × 844 and padding `{top: 148, bottom: 176, left: 48, right: 48}` (which is exactly what
`fitBoundsPadding` produces on `/map` at 390 px wide: 48 cosmetic + 100 mobile top chrome; 48 +
128 peek; 48 either side, safe-area 0):

| Bounds | `maxZoom` | Result |
|---|---|---|
| `[-3.5,51.4] … [0.2,55.9]` (a UK-sized country) | 8.4 | `zoom 5.588`, centre `(-1.650, 53.589)` — comfortably inside the band |
| `[34.78,32.07] … [34.78,32.07]` (zero extent) | 8.4 | `zoom 8.4` exactly, centre `(34.780, 32.045)`, both finite |
| `[34.78,32.07] … [34.79,32.08]` (~1 km) | 22 | `zoom 14.335` — **above** the band; the ceiling is what stops this |
| `[-120,-40] … [140,60]` (a globe-spanning box) | 8.4 | **`zoom −0.331`** — far below the band |

The last row is the whole argument. A country whose areas span a very wide box — or, more likely, a
`unionBounds` that has been broken by the antimeridian (§8.2) — fits at a zoom where the **country**
band is showing. The user taps a country marker, the camera eases, and it lands back on country
markers: the tap appears to do nothing. §2.4's promise ("you always land on labelled area markers,
never on emptiness or pins") is only kept by the floor.

### 7.3 The two constants, and why they are not 4.5 and 8.5

```ts
export const COUNTRY_BAND_MAX = 4.5;   // country layer maxzoom
export const AREA_BAND_MIN    = 4.5;   // area layers minzoom
export const AREA_BAND_MAX    = 8.5;   // area layers maxzoom
export const PIN_BAND_MIN     = 8.5;   // pin layer minzoom

// Camera targets, deliberately inside the open band rather than on its edges.
export const AREA_BAND_MIN_SAFE = 4.6;
export const AREA_BAND_MAX_SAFE = 8.4;
```

`maxzoom` is exclusive, so landing the camera on exactly `8.5` puts you in the *pin* band —
`area.isHidden(8.5) === true`, verified. `4.5` is inclusive and would technically be fine, but a
symmetric pair of safe values is one fewer thing to reason about, and 0.1 of zoom is invisible.
Both belong in the same constants file as the band edges, and the file should assert
`AREA_BAND_MIN < AREA_BAND_MIN_SAFE < AREA_BAND_MAX_SAFE < AREA_BAND_MAX` in a unit test.

### 7.4 Reduced motion is free — do not hand-roll it

`easeTo` (`camera.ts:762`): `if (options.animate === false || (!options.essential &&
browser.prefersReducedMotion)) options.duration = 0;` and `flyTo` (`camera.ts:1017-1021`) falls
straight through to `jumpTo`. `browser.prefersReducedMotion` reads a live
`matchMedia('(prefers-reduced-motion: reduce)')`.

So §7's "`prefers-reduced-motion` → `jumpTo`" is satisfied by writing an ordinary `easeTo` and **not**
passing `essential: true`. Adding a `matchMedia` branch in our code would be a second, divergent
implementation of a rule MapLibre already applies — and would be wrong the moment the user changes
the setting mid-session.

### 7.5 It is camera mover 5, and the plan says four

`map-page-client.tsx:173` enumerates exactly four authorised movers and the country tap is a fifth.
It is *not* the same writer as an `Elsewhere` row tap: §2.4 is explicit that tapping a country
**does not change the active area**, whereas mover 4 (`selectArea`) is the one gesture that sets it
by hand. Nor can it reuse `focusPlaceIds`, which frames a *set of places* with `FIT_BOUNDS_MAX_ZOOM`
and no floor.

That means a new prop on `MapSurfaceProps` — something like
`focusCountryBounds?: LatLngBoundsHint | null`, keyed on identity the way `focusPlaceIds` is, so a
re-render cannot re-fly. Writing the mover list in `map-page-client.tsx` from four to five is part
of the work, not an afterthought; `current-state.md` §7's "six camera movers exist and `06` §9.2
lists four" is separately stale — that reconciliation was already done in
`map-page-client.tsx:173-186` and cut the list back to four. Worth correcting in the same pass.

---

## 8. Q7 — failure modes to design against

### 8.1 A country whose areas are a single point — safe, and it lands on the ceiling

Executed: a zero-extent box returns `zoom === maxZoom` exactly, with a finite centre. The mechanism
is that `size.x === 0` makes `scaleX = availableWidth / 0 = Infinity`, `scaleZoom(Infinity)` is
`Infinity`, and `Math.min(Infinity, maxZoom)` is `maxZoom`. So one saved place in Japan → tap the
flag → land at 8.4, on that area's marker. Correct behaviour, no special case needed.

The **one** precondition is that `availableWidth` and `availableHeight` are strictly positive.
`0 / 0` is `NaN`, `NaN < 0` is `false`, so the `if (scaleY < 0 || scaleX < 0)` guard at
`camera_helper.ts:200` does *not* catch it and a `NaN` zoom escapes. `clampFitPadding`'s
`MIN_FIT_BAND_PX = 48` floor is what guarantees a positive band on both axes, which is another
reason the country tap must reuse `fitBoundsPadding` rather than compose its own padding.

Also executed: padding wider than the canvas (`{300,300,200,200}` in a 300 × 400 transform) returns
`undefined` with a console warning. Hence the `if (!camera) return;` in §7.1 — do not pass an
undefined camera into `easeTo`.

### 8.2 The antimeridian — **broken, and it must be declared rather than papered over**

`unionBounds` in `country-bucket.ts` takes a plain min/max of `west`/`east`, so it always produces
`west <= east` and can never encode a wrap. `Map.cameraForBounds` does call
`LngLatBounds.convert(bounds).adjustAntiMeridian()` — but that helper only acts when
`sw.lng > ne.lng` (`src/geo/lng_lat_bounds.ts`), which `unionBounds` guarantees never happens. The
camera's own fix is therefore unreachable from our data.

Consequence, with the number from §7.2: a country straddling ±180° (Fiji, Kiribati, the Chukotka
end of Russia, or New Zealand's Chathams) produces a near-global box that fits at roughly zoom −0.3,
which the floor then raises to 4.6 — so the camera lands at area-band zoom over the *wrong* meridian,
showing an empty ocean. `meanCentroid` is already correct here (it averages 3-D unit vectors, so the
marker itself sits in the right place); the *bounds* are the broken half, exactly as
`clusters.ts`'s header and `unionBounds`'s own comment say.

**Recommendation: do not fix it in this feature.** A correct fix changes the meaning of `GeoBounds`
(an `east < west` convention every consumer — `queryRectFrom`, `withinBounds`,
`areaAfterCameraSettled`, `pickAnchorCluster` — would have to honour), and a half-fixed wrap is
worse than a documented absence. What this feature *should* add is a cheap, honest degradation:
when `bounds.east - bounds.west > 180`, skip `cameraForBounds` entirely and
`easeTo({ center: bucket.centroid, zoom: AREA_BAND_MIN_SAFE })`. The centroid is correct, so the
user lands somewhere true rather than somewhere confidently wrong. Two lines, no new type.

### 8.3 `prefers-reduced-motion`

Covered in §7.4 — free, provided nothing passes `essential: true`. The band swap itself has no
animation to suppress (§7's first row): `minzoom`/`maxzoom` is a hard cut with no fade, and
MapLibre's symbol fade (`fadeDuration`) applies to collision-driven appearance, not to a layer
leaving its zoom range.

### 8.4 Three more that are not in the question but are on the path

- **The pin layer's `minzoom` must land in the same commit as the two summary layers.** On its own it
  makes the map *empty* below zoom 8.5, which is strictly worse than today's mat of teardrops.
- **`buildCountryDiscImages` returns `[]` when there is no canvas** (documented in that file). One
  layer carrying icon *and* text degrades to bare counts rather than to nothing (§4.1), which is the
  right failure — but it is only true because of the one-layer choice in §5.
- **`GeoJSONSource.setData` on a source that does not exist yet.** `place-marker-layer.tsx` already
  solves this by creating the source empty in the setup effect and letting the data effect fill it
  in the same commit. Copy that shape exactly; do not seed the source from a ref written during
  render (the header says why).

---

## 9. Proposed file layout

Consistent with `src/components/map/`'s existing split: pure expression/geometry modules that a node
test can import, and thin `'use client'` components that own a source and its layers.

| File | New? | Contents |
|---|---|---|
| `src/components/map/zoom-bands.ts` | **exists already** | `COUNTRY_BAND_MAX`, `AREA_BAND_MIN/MAX`, `PIN_BAND_MIN`, `COUNTRY_LANDING_ZOOM`. §2.1's "one constants file". Pure. |
| `src/components/map/style-text-font.ts` | new (move) | `styleTextFont(map)`, moved verbatim out of `place-marker-layer.tsx`. §6.3. |
| `src/components/map/summary-style.ts` | **exists already** | `countryLayerLayout/Paint`, `areaDiscLayerPaint`, `areaCountLayerLayout/Paint`, `areaLabelLayerLayout/Paint`, the layer ids, `COUNTRY_BAND_ZOOM` / `AREA_BAND_ZOOM`. No React, no MapLibre runtime, no canvas — the sibling of `marker-style.ts`. |
| `src/components/map/summary-features.ts` | **exists already** | `toCountryFeatures` and `toAreaFeatures` in one file rather than two. Sibling of `place-features.ts`. Pure. |
| `src/components/map/country-marker-layer.tsx` | new | One source, one symbol layer. Follows `place-marker-layer.tsx` exactly: `useMap()`, `useStyleReady()`, teardown-before-setup, source created empty, separate data effect that adds images then `setData`. |
| `src/components/map/area-marker-layer.tsx` | new | One source, three layers (circle, count, label), one click handler registered on `[disc, count]` with the §3.2 band guard. |
| `src/components/map/place-marker-layer.tsx` | edit | `minzoom: PIN_BAND_MIN` on the layer; import `styleTextFont` instead of defining it. |
| `src/components/map/types.ts` | edit | `focusCountryBounds?: LatLngBoundsHint \| null` on `MapSurfaceProps` (§7.5). |
| `src/components/map/map-surface.mapcn.tsx` | edit | Mount the two new layers; the country-tap camera (`cameraForBounds` → clamp → `easeTo`) reusing `fitBoundsPadding`. |
| `src/app/map/map-page-client.tsx` | edit | Camera mover 5, and the mover comment updated from four to five. |

`map-surface.live.tsx` and `map-surface.mock.tsx` are the other two of the three parallel variants.
Neither should grow zoom bands: `.mapcn` is the one `map-surface.tsx` re-exports. Adding the bands
to only one of three is a *third* reason to consolidate them, and consolidation is not this task.

**Serialisation note.** Every file above lives in `src/components/map/**`, which overlaps
`design-system-frontend`'s surface. I own the mechanics listed here (band constants, layer specs,
camera, hit-testing); tokens, typography, the count's position on the marker and the disc's visual
weight are theirs. The two must not run concurrently in this directory.

---

## 10. What I did NOT verify — read this before treating anything above as settled

Design may only depend on VERIFIED claims (house rule), so these are called out rather than smoothed
over.

1. **Nothing was run in a browser.** No map was opened, no camera moved, no breakpoint checked. Every
   claim about *rendering* is derived from the installed source, not observed. The band swap looking
   right at 4.5 and 8.5 on a device is unverified.
2. **The ghost-tap window (§3.2) is a composite of two verified halves, not an observed bug.** The
   bucket half was executed (`area.isHidden(4, true) === false`); the query half is the *absence* of
   a zoom check in `FeatureIndex.query`. I did not construct a real tile and query it. Someone should
   tap at zoom 8.7 with the area layers mounted and see whether a ghost fires. The guard is cheap
   enough to ship either way.
3. **No claim here about CARTO Positron's actual glyph stacks.** `styleTextFont` discovers them at
   runtime and I did not fetch `style.json`. If Positron's non-italic stack has no Hebrew coverage,
   `תל אביב-יפו` renders as boxes regardless of the RTL plugin — that is a *glyph* question, separate
   from the *shaping* question §6.2 answers, and it is unverified. Check it on the running app before
   trusting the area label.
4. **The 4.5 and 8.5 thresholds themselves are not evaluated.** §2.1 calls them starting numbers to
   tune on a device, and nothing in this document tests whether z8.5 really is "one metro area" on a
   390 px viewport. I verified that the *mechanism* delivers exactly the bands asked for.
5. **`COUNT_OFFSET_EM = 1.82` is arithmetic from `COUNTRY_DISC`, not a measurement.** It has never
   been rendered. Expect design-system to move it.
6. **The ~55 KB/disc and ~1.4 MB/25-countries figures in §4.3 are computed from `COUNTRY_DISC_SIZE`,
   not measured** against actual GPU atlas usage. They are the right order of magnitude for the
   "never remove an image" argument and should not be quoted as measurements.
7. **`_zoomSnap` is `0` by default in 6.4.1** (`src/ui/map.ts:496`), so `evaluateZoomSnap` is a no-op
   on `cameraForBounds`, `easeTo` and `jumpTo` — verified by reading the default, **not** by checking
   what the mapcn wrapper passes to the `Map` constructor. If anything ever sets `zoomSnap`, the
   4.6/8.4 safe zooms would be rounded and the clamp would silently stop working. Cheap to assert in
   a test.

---

## 11. Findings against the implementation that landed while this was being written

`zoom-bands.ts`, `summary-style.ts` and `summary-features.ts` appeared in the working tree during
this investigation. Read against them, five things are worth acting on. I changed none of them —
this is investigation-only work and they are the orchestrator's uncommitted files.

### 11.1 The band values are right, and the landing clamp is right

`COUNTRY_BAND_MAX = 4.5`, `AREA_BAND_MIN = COUNTRY_BAND_MAX`, `AREA_BAND_MAX = 8.5`,
`PIN_BAND_MIN = AREA_BAND_MAX` match §2 exactly, and sharing one constant between a ceiling and the
next floor is exactly what the half-open interval makes correct. `COUNTRY_LANDING_ZOOM = { min:
4.65, max: 8.0 }` sits strictly inside the area band, which is the §7.3 requirement — 8.0 is more
conservative than the 8.4 I proposed and is fine; nothing lands on 8.5 and draws pins.

`summary-style.ts` also reached the same one-layer conclusion for the country band, for the same
reason (§5). Its `COUNTRY_COUNT_LAYER_ID = 'country-counts'` constant appears to be a leftover from
a two-layer draft — nothing in `countryLayerLayout` needs it. Delete it or use it; an exported id
for a layer that is never added will read as a missing layer to the next person.

### 11.2 `AREA_DISC_RADIUS_PX = 15` gives a **32 px** tap target, under the 44 px floor

A circle layer's hit test is `circle-radius + circle-stroke-width` in pixels
(`circle_style_layer.ts:queryIntersectsFeature`). 15 + 1 = 16 px radius = a **32 px** target.
`ux-library-at-scale.md` §6 requires ≥44 px for every summary target, and an area marker is the
primary navigation control of the whole zoomed-out view.

Two ways out, and the second is better because it does not touch the visual:

- raise `AREA_DISC_RADIUS_PX` to 22 — but 15 was chosen deliberately ("smaller than the country's,
  because you are one level closer"), and that is a design decision, not mine to overturn;
- **query with a box instead of a point.** Do not use the delegated `map.on('click', layerId, fn)`
  form for this layer: it is hard-coded to `queryRenderedFeatures(e.point, …)`
  (`src/ui/map.ts:2120`), a zero-size query. Register a plain `map.on('click', fn)` and query a
  padded box:

  ```ts
  const PAD = 14;   // 2*(15 + 1 + 14) = 60 px effective target around a 32 px disc
  const hits = map.queryRenderedFeatures(
    [[event.point.x - PAD, event.point.y - PAD], [event.point.x + PAD, event.point.y + PAD]],
    { layers: [AREA_DISC_LAYER_ID] }
  );
  ```

  This is the standard way to give a small marker a thumb-sized target and it keeps the visual at 15.

### 11.3 `symbol-sort-key: ['-', 0, ['get','count']]` draws the **biggest** country underneath

`symbol_bucket.ts:552-555` sorts features ascending by sort key
(`(a.sortKey) - (b.sortKey)`) and pushes them into the vertex buffers in that order, so a **lower**
sort key is drawn **first**, i.e. underneath. `-count` gives the largest country the most negative
key, so `🇬🇧 14` ends up beneath `🇮🇹 5` wherever two discs overlap. If the intent is "the country you
have most in wins the overlap", the expression wants to be `['get', 'count']`, not its negation.

The same reading raises a question about the **existing** pin layer:
`pinSortKeyExpression` returns `0` for the selected pin against `1` for the rest, under the comment
"Draw the selected pin last, so its larger body is never covered by a neighbour." By the sort
direction above, `0` sorts first and is drawn first — underneath. Either the comment or the
expression is wrong. This is outside `LIBRARY-IA-2`'s scope and I have not touched it; it is a
one-line check for whoever next opens `marker-style.ts`.

Grade: the sort *direction* is VERIFIED by reading `symbol_bucket.ts` and matches the style spec's
own wording ("features with lower sort keys are drawn and placed first"). Which pin ends up on top
in a rendered frame is ASSUMED and should be confirmed by overlapping two pins on device.

### 11.4 `'circle-pitch-alignment': 'map'` is unnecessary and changes the hit-test branch

The spec default is `'viewport'`. At this app's permanent pitch 0 and bearing 0 the two are visually
identical, so `'map'` buys nothing — but it does route hit-testing down the other branch of
`queryIntersectsFeature` (`transformedSize = size * pixelsToTileUnits`, no
`projectQueryGeometry`). Equivalent at pitch 0, divergent the day anything pitches the camera. A
marker that summarises the library should be viewport-aligned for the same reason the pins are:
its size is a UI affordance, not a geographic extent. Recommend dropping the line and taking the
default.

### 11.5 The ghost-tap guard from §3.2 is still owed

`AREA_BAND_ZOOM` gives the area layers `{ minzoom: 4.5, maxzoom: 8.5 }`, and `area-discs` is a
`circle` layer. That is exactly the configuration §3.2 describes: invisible but hit-testable at map
zoom `[4.0, 4.5)` and `[8.5, 9.0)`. Whichever click path 11.2 settles on, it needs the band guard:

```ts
if (zoom < AREA_BAND_MIN || zoom >= AREA_BAND_MAX) return;
```

`zoom-bands.ts` should export a small `inBand(zoom, band)` helper so that test is written once and
unit-tested against the boundary values, rather than re-derived at each call site with a `<` that
could easily be written `<=`.
