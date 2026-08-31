/**
 * EXPERIMENT (exp/richer-basemap): what the basemap's own POIs look like.
 *
 * The reference screenshots' "populated and useful" quality is not POI *count* — CARTO's tiles
 * already carry 2 545 POI features in a single Tel Aviv z14 tile, measured 2026-08-30 against
 * `carto.streets/v1`, with ~90 distinct `class` values. It is POI *editing*: a curated set, and
 * colour that says what kind of thing each one is before you read the word.
 *
 * So this file is three decisions and no rendering:
 *
 * 1. **Which classes earn a label.** The tile's top classes by count include `waste_basket` (295),
 *    `bicycle_parking` (469), `gate` (223), `bollard`, `drinking_water` and `toilets`. Drawing
 *    everything with a name is what made the first pass read as clutter rather than detail — street
 *    furniture is data, not orientation. The allow-list below is the things a person navigates by.
 *
 * 2. **At what zoom each one earns it.** See `POI_TIERS`.
 *
 * 3. **What colour it takes.** Grouped, not per-class: six families, each with one colour, so the
 *    map reads as a legend the user never has to be shown.
 *
 * Kept free of React and MapLibre so the grouping can be unit-tested in node, following
 * `marker-style.ts`'s split.
 */

/** The families a basemap POI can belong to. One colour each. */
import type { Theme } from '@/lib/theme';

export type PoiGroup = 'food' | 'shopping' | 'culture' | 'transit' | 'outdoors' | 'civic';

/**
 * `class` values worth a label, by family.
 *
 * Every value here was observed in a real tile — none are guessed from the OpenMapTiles schema.
 * A class that is not listed simply does not draw, which is the safe default: CARTO can add
 * classes at any time and an unrecognised one should be absent rather than uncoloured.
 */
export const POI_GROUPS: Readonly<Record<PoiGroup, readonly string[]>> = {
  food: ['restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'ice_cream', 'beer', 'pub'],
  shopping: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'butcher', 'music', 'bookshop'],
  culture: ['museum', 'art_gallery', 'theatre', 'cinema', 'attraction', 'monument', 'castle',
    'aquarium', 'theme_park', 'artwork'],
  transit: ['railway', 'bus', 'harbor', 'ferry_terminal', 'airport', 'bicycle_rental'],
  outdoors: ['park', 'garden', 'stadium', 'pitch', 'sports_centre', 'playground', 'dog_park',
    'swimming_pool', 'cemetery', 'picnic_site', 'golf'],
  civic: ['hospital', 'pharmacy', 'doctors', 'school', 'college', 'university', 'library',
    'place_of_worship', 'town_hall', 'police', 'fire_station', 'post', 'bank'],
};

/**
 * The label colour per family, read off the reference screenshots.
 *
 * Saturated enough to be legible as a category at 11 px against near-white paper, dark enough to
 * pass as text rather than decoration. These are basemap colours and are deliberately *not* the
 * product's own category palette (`ui/place/palette.ts`) — a saved café and a basemap café must not
 * look like the same kind of thing, or the user's own library stops being the subject.
 *
 * Which is also why they did **not** move into `palette.ts` when the category colours did (W0-2).
 * That module is the product's own place palette and has a `--category-*` token twin in
 * `globals.css` for the DOM to paint from; these six never reach the DOM at all — they exist only
 * inside a MapLibre `match` expression — so they have nothing to be a token of, and filing them
 * beside the product palette would invite exactly the merge this comment exists to prevent.
 */
export const POI_GROUP_COLORS: Readonly<Record<PoiGroup, string>> = {
  food: '#b8632c',
  shopping: '#8c5bb8',
  culture: '#c2417e',
  transit: '#3d6fb5',
  outdoors: '#3f7d44',
  civic: '#5a6b7d',
};

/**
 * The same six, for a night basemap (W7-3).
 *
 * These are ink on the ground, so they invert for the same reason the label role does: measured
 * against the night land (`#202225`), the light six land at **2.91–3.69:1** — every one of them
 * below AA, on small text, which is the worst combination there is. Lifted, they clear it —
 * **4.53–5.30:1** after I2-9 pulled them back down under the pins.
 *
 * **Hue is preserved**, which keeps the one thing these colours are for: `food` is still the warm
 * one, `transit` still the blue one. Someone who has learned the map does not have to learn it
 * again at night. Lightness and chroma both move; the first pass moved only lightness, and that is
 * how two of the six ended up the same colour as a pin (see below).
 *
 * The bar for keeping them apart from each other is deliberately *the light set's own worst pair*
 * rather than a number invented here: the light six have `transit`/`civic` at ΔE 10.7 and ship that
 * way, so a night set is honest if it is no worse.
 *
 * ## What that bar missed, and it is the one this file's own header promises (I2-9)
 *
 * The six were measured against the land and against **each other**. Nobody measured them against
 * the pins — and the header two blocks up commits to exactly that: *"a saved café and a basemap
 * café must not look like the same kind of thing, or the user's own library stops being the
 * subject."* At night that promise was not being kept:
 *
 *   - **every one of the six sat *above* the darkest pin in lightness** (64–69 against L\* 61.8).
 *     The basemap's own labels were the brighter layer.
 *   - `shopping` `#B98EE0` against the `bar` pin `#A288E0`: **ΔE 5.3.** The same colour.
 *   - `food` `#E0925A` against the `cafe` pin `#C99A55`: **ΔE 9.9** — and this one is a night
 *     regression, because the light pair measures 17.9. It is also the worst possible instance:
 *     the densest group, in the colour of the most common saved category.
 *
 * `shopping`/`bar` is **not** a night regression — the light theme ships that pair at ΔE 7.3, so
 * the collision is inherited. The light set is left alone here on purpose; it is a separate ruling
 * and a separate measurement. What the night set is held to is the same honesty rule this comment
 * already used twice: **no worse than the light one.**
 *
 * ## The two floors added, and how these values were picked
 *
 * 1. **Every basemap label sits below the darkest pin in lightness.** The pins are the data; the
 *    basemap is ground. That is an ordering, so it is stated as one rather than as a taste.
 * 2. **No basemap label comes within ΔE 14 of any pin body** — roughly double the light set's own
 *    worst cross-pair, which is what there was room for once floor 1 pinned the lightness band.
 *
 * Inside those, each value is the **nearest colour to the one it replaced** that holds them, at the
 * same Lab hue, and no group was allowed to gain chroma: a quieting pass must not add colour to the
 * ground, and "someone who has learned the map does not have to learn it again" applies to a retune
 * as much as to a theme. So `culture` moves 2.2 and `food`, which was the defect, moves 13.3.
 *
 * Measured after: worst pin cross **5.3 → 14.0**; the six's own worst pair **11.7 → 14.0**, better
 * than before and still above the light set's 10.7; AA on the night land **4.53–5.30**, down from
 * 5.78–6.77 and still clear of 4.5 — which is the price, and it is the right one to pay. These are
 * annotations you read once you are already looking, not the thing the screen is about.
 *
 * ## `food` is `#A2836F` rather than `#A8826A`, and the reason is a pin that has not landed yet
 *
 * A colour-vision proposal against `CATEGORY_COLOR_DARK` moves the restaurant body toward a softer
 * coral. Against that value `#A8826A` measures **ΔE 12.5** — the floor above, breached, by the one
 * group whose whole defect this comment is about. `#A2836F` is 2.3 away from it, holds **14.0**
 * there, and holds **15.2** against the body that ships today (up from 14.2), so it is the better
 * value under *both* palettes and does not wait on anybody.
 *
 * ## What none of these floors can see, and it is a bigger hole than the one they closed
 *
 * **Every number above is normal-vision.** Simulated (Machado et al. 2009, severity 1.0), this
 * layer's separations collapse:
 *
 *   - `transit` against the `bar` pin — **ΔE 1.8** deuteranopic, against 15.5 normal.
 *   - `food` against `outdoors` — **2.2** deuteranopic. A restaurant label and a park label are
 *     one colour for roughly one man in twelve.
 *   - `shopping` against `culture` — **4.4** protanopic.
 *
 * None of it was new and none of it was repairable *at the time*. The two floors boxed this palette
 * into **L\* 56.5–62.0** — AA on the land underneath, below the darkest pin above — and
 * deuteranopia collapses hue onto one axis, so inside a 5.5-point lightness band there was nothing
 * left to separate with. Under those floors the six could not hold ΔE 8 **from each other** under
 * CVD, let alone from the pins: over-determined, not mistuned.
 *
 * ## The ceiling gave, and the values below are what that bought
 *
 * Two candidate reliefs were measured, and only one of them was worth anything.
 *
 * **AA is measured against the land here, and it did not have to be.** These labels carry a 1.25px
 * halo at `#141518` (`basemap-tint-layer.tsx`), so their real background is L\* 6.8 rather than the
 * land's 13.1, and the honest floor is L\* 52.5 rather than 56.5. Releasing it buys **−0.2**. It is
 * therefore *kept* — the conservative measure costs nothing, and trading a low-vision floor to buy
 * a colour-vision one would have been the wrong shape of fix even if it had worked.
 *
 * **The ceiling was the whole cost, and it was this file's own invention.** Released on the ruling
 * of **2026-08-31**, which is recorded here rather than only in a commit message because the thing
 * it guards against is someone reading a relaxed bound in six months and restoring it. Releasing it
 * takes the worst ink-to-pin distance from *infeasible* to **12.0** in an unconstrained search. It is now
 * `label`'s own lightness — **L\* 87.4**, the basemap's near-white place names, the brightest ink
 * CARTO draws. *"A POI label may be as bright as the map's other labels and no brighter"* survives
 * a basemap retune; `62.0` never did, because it was a number rather than a rule.
 *
 * **What the ordering was for is still true and did not need lightness to say it.** "The pins are
 * the data, the basemap is ground" is carried by chroma and area: pins are C\* 33–68 on 26px filled
 * discs with glyphs and shadows, these are C\* 8–28 on 11px text, and a frame census put pin ink at
 * 0.096% of the map against effectively nothing for these. Stating it in *lightness* was what made
 * it cost the one axis CVD separation also needs.
 *
 * Measured across normal, deuteranopic and protanopic vision (Machado 2009, severity 1.0, matrices
 * applied in linear RGB), against **both** the category bodies shipping today and the ones the
 * colour-vision proposal moves them to, since that change has not landed:
 *
 * | | before | after |
 * |---|---|---|
 * | worst ink ↔ pin, every vision | **1.8** | **8.8** |
 * | worst ink ↔ ink, every vision | **3.2** | **8.0** |
 * | worst ink ↔ pin, normal only | 14.0 | 14.2 (floor 14) |
 * | worst ink ↔ ink, normal only | 14.0 | 13.1 (floor 10.7) |
 * | AA on the night land | 4.57 | 4.55 (floor 4.5) |
 * | brightest ink | L\* 61.6 | L\* 87.0 (ceiling 87.4) |
 *
 * **8.8 and not the 12.0 the unconstrained sweep promised, because two of this file's reasons for
 * existing are constraints and not free variables.** Five groups hold C\* ≥ 15 so the map still
 * reads as a legend nobody has to be shown — an optimiser handed the chroma will spend it, and did,
 * returning a grey `culture` and, in one pass, all six as the same teal. `civic` is the fallthrough
 * every unmatched class lands on, so it is the most numerous label here and takes a chroma *ceiling*
 * and an L\* ceiling instead; left free it came back as the brightest ink on the frame.
 *
 * **This is a mitigation and not a fix.** 8.8 is still under the 14 that normal vision holds. The
 * pins and this palette share a small space and CVD compresses it, so getting past this needs
 * `CATEGORY_COLOR_DARK` to move — `ui/place/palette.ts`, not here.
 */
export const POI_GROUP_COLORS_NIGHT: Readonly<Record<PoiGroup, string>> = {
  food: '#FECAA7',
  shopping: '#C4AED4',
  culture: '#FFCCE2',
  transit: '#B7D0FF',
  outdoors: '#8FA78F',
  civic: '#808A96',
};

/** The six for one theme. Light by default so every existing caller is unchanged until it opts in
 *  — `basemap-tint-layer.tsx` belongs to another lane. */
export function poiGroupColors(theme: Theme = 'light'): Readonly<Record<PoiGroup, string>> {
  return theme === 'dark' ? POI_GROUP_COLORS_NIGHT : POI_GROUP_COLORS;
}

/**
 * The zoom at which each class earns its label.
 *
 * The owner's verdict on drawing every curated class from z12: "sometimes you can see a lot of
 * places and it's really confusing." At z14 that put every cafe, bank and clothes shop on the map
 * at once, all at equal weight, and the user's own saved places — the entire subject of this
 * product — were competing with a hundred labels they did not choose.
 *
 * The ordering principle is **"would you use this to say roughly where something is?"** A station
 * or a museum orients you from far out. A bakery only matters once you are on the street it is on.
 * So the map reveals detail as the user leans in, instead of showing everything immediately.
 *
 * **These are `minzoom` on four separate layers, not a filter, and that is the load-bearing part.**
 * It copies `zoom-bands.ts`: MapLibre owns the swap, so there is no zoom listener, no React state
 * that changes on zoom, and no re-render as the user pinches. A filter cannot express this at all —
 * `["zoom"]` is only legal as the input to a top-level `step`/`interpolate` in a *paint or layout*
 * property, never inside `filter`, so "this class from z16" has to be a layer boundary.
 *
 * Every class in `POI_GROUPS` appears in exactly one tier. A test asserts that both ways: a class
 * in no tier would silently stop drawing, and a class in two would draw twice and fight itself in
 * the collision index.
 */
export interface PoiTier {
  /** Appended to `POI_LABEL_LAYER_ID` to form the layer id. */
  readonly id: string;
  /** The zoom at which this tier starts drawing. */
  readonly minzoom: number;
  readonly classes: readonly string[];
}

export const POI_TIERS: readonly PoiTier[] = [
  {
    // Things you navigate a city by. These are the only POIs on screen at the zoom the camera
    // rests at, so the saved pins compete with a handful of names rather than a hundred.
    id: 'landmark',
    minzoom: 13,
    classes: ['museum', 'attraction', 'monument', 'castle', 'aquarium', 'theme_park', 'stadium',
      'university', 'hospital', 'railway', 'ferry_terminal', 'harbor', 'airport'],
  },
  {
    id: 'culture',
    minzoom: 15,
    classes: ['art_gallery', 'theatre', 'cinema', 'library', 'place_of_worship', 'college',
      'town_hall', 'park', 'cemetery', 'artwork', 'police', 'fire_station'],
  },
  {
    // Food arrives only once you are looking at a neighbourhood rather than a city. This is the
    // tier the owner's own saved places mostly live in, so it is deliberately the last thing that
    // could crowd them.
    id: 'food',
    minzoom: 16,
    classes: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'bakery', 'ice_cream', 'beer'],
  },
  {
    // Everyday errands, plus `bus` — 898 features in one Tel Aviv z14 tile, the single noisiest
    // class in the whole allow-list, and useless for orientation until you are on the street.
    id: 'retail',
    minzoom: 17,
    classes: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'butcher', 'music', 'bookshop',
      'pharmacy', 'bank', 'post', 'garden', 'playground', 'pitch', 'sports_centre', 'dog_park',
      'swimming_pool', 'bicycle_rental', 'school', 'doctors', 'golf', 'picnic_site', 'bus'],
  },
];

/** The lowest zoom at which any POI label draws. */
export const POI_TIER_FLOOR = Math.min(...POI_TIERS.map((tier) => tier.minzoom));

/** Every class that draws, in group order. */
export function poiLabelClasses(): string[] {
  return Object.values(POI_GROUPS).flat();
}

/**
 * The `text-color` expression: a `match` on the feature's own `class`, falling through to the
 * neutral. Written here rather than inline in the layer so the grouping and the colour cannot
 * drift apart, and so a test can call it.
 */
export function poiColorExpression(theme: Theme = 'light'): unknown[] {
  const colors = poiGroupColors(theme);
  const cases: unknown[] = [];
  for (const [group, classes] of Object.entries(POI_GROUPS) as [PoiGroup, readonly string[]][]) {
    cases.push([...classes], colors[group]);
  }
  return ['match', ['get', 'class'], ...cases, colors.civic];
}
