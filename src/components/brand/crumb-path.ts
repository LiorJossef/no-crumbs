/**
 * The crumb outline — one closed path, and every surface that draws the mark reads it from here.
 *
 * `brand-and-product-foundation.md` §3.1 rule 1: **the silhouette is the system.** The same closed
 * path is the mascot at 168px, the map pin at 30px and the favicon at 16px. An illustrator may
 * change the face, the shading, the feet and the palette; **if the outline changes, the pin is
 * lost** and the product is back to the teardrop all thirty-four competitors draw. A shared
 * constant is the only version of that rule a build can enforce — two files each holding "the same"
 * path is how a brand drifts, which is exactly why `PinMark` was extracted out of `/sign-in` in the
 * first place.
 *
 * Authored in `docs/no-crumbs-design-system.html` (chapter 03, `#crumbFace` / `#crumbPin`) and
 * copied here byte-for-byte. The design document remains the drawing; this is the build's copy of
 * it.
 *
 * **Not a React component and not a `.tsx`**, deliberately: `src/components/map/marker-images.ts`
 * feeds these strings to `Path2D` on a `<canvas>` and never touches the DOM, and
 * `src/app/opengraph-image.tsx` feeds them to satori in an image route. Both are consumers of the
 * geometry, not of a component.
 */

/** The authoring square. Everything below is in this coordinate space. */
export const CRUMB_VIEWBOX = 100;

/**
 * The crumb. One closed path, no holes, no self-intersections — so it fills identically under
 * `nonzero` and `evenodd`, and a canvas, an SVG and satori all agree on it.
 */
export const CRUMB_PATH =
  'M34 9C50 3 70 7 82 20 93 32 97 50 92 66 86 84 68 95 50 94 30 93 12 82 7 64 2 46 8 26 20 16 24 12 29 11 34 9Z';

/**
 * The crust: the darker underside, drawn *clipped to the outline* rather than sized to it. It runs
 * well outside the square on purpose (`-6` to `104`), which is what lets one path serve every size
 * without the shading edge ever landing on a coordinate the outline also uses.
 *
 * Shading is one of the four things §3.1 rule 1 explicitly lets vary, so this is optional at every
 * call site. Nothing that has to survive 16px uses it.
 */
export const CRUMB_SHADE_PATH = 'M-6 70C18 60 44 62 66 72 84 80 96 92 104 106L-8 108Z';

/**
 * The measured ink extent of `CRUMB_PATH`, which is **not** `0 0 100 100`: the path's control
 * points reach the square but its curves do not. Rendered at 10× and read back off the alpha
 * channel, so it is a measurement rather than an eyeballed guess.
 *
 * A drawing routine that assumes the full square centres the crumb about 0.3 units left and
 * 0.15 units high of where it actually sits, and — more visibly — sizes it about 11% smaller than
 * the box it was given. Both matter at 15px.
 */
export const CRUMB_BOUNDS = { minX: 5.2, minY: 6.2, maxX: 94.2, maxY: 94.1 } as const;

/**
 * The map pin: the same crumb, with a point under it.
 *
 * Two paths rather than one merged outline, because the crumb must stay byte-identical to the
 * shape every other surface draws — merging them would produce a fourth "same" path that is not
 * the same path. The tail's shoulders sit at `y = 90`, inside the crumb, so the union reads as one
 * silhouette with no seam.
 *
 * The tail extends the coordinate space to 128 tall; `CRUMB_PIN_BOUNDS` is the union's measured
 * extent, and it is what a renderer must fit rather than `0 0 100 128`.
 */
export const CRUMB_PIN_TAIL_PATH = 'M50 126 C 44 106 34 98 26 90 L74 90 C66 98 56 106 50 126Z';
export const CRUMB_PIN_VIEWBOX_HEIGHT = 128;
export const CRUMB_PIN_BOUNDS = { minX: 5.2, minY: 6.2, maxX: 94.2, maxY: 126.0 } as const;

/**
 * Where the aperture goes on a pin — the centre of the crumb's head, not the centre of the square.
 * Derived from `CRUMB_BOUNDS` so it cannot drift from the shape it sits in.
 */
export const CRUMB_HEAD_CENTRE = {
  x: (CRUMB_BOUNDS.minX + CRUMB_BOUNDS.maxX) / 2,
  y: (CRUMB_BOUNDS.minY + CRUMB_BOUNDS.maxY) / 2,
} as const;

/**
 * **The aperture** — the light hole in the pin's head, and the thing that makes a crumb read as a
 * marker rather than as a blob of colour.
 *
 * `#crumbPin` in `docs/no-crumbs-design-system.html` draws it as `r = 17` at 95% opacity in the
 * head's centre: *"the silhouette on a point, in the category's own colour, with a white aperture.
 * Same geometry as the mascot, face removed."*
 *
 * `r = 17` against a head that is 89 units wide is **38% of the head's width**, so at the map's
 * 26px head it is a 10px hole — smaller than the 14px `glyphBox` the category glyph used, and the
 * ring of colour around it correspondingly thicker. That ratio is the reason the aperture can carry
 * a category colour where a glyph cannot: what the eye reads at 15px is the *area* of colour, and
 * an aperture takes 14% of the head where a glyph took 29%.
 */
export const CRUMB_PIN_APERTURE = { r: 17, opacity: 0.95 } as const;

/* -------------------------------------------------------------------------- */
/* The face                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The face — and where it may appear is a rule, not a preference.
 *
 * `brand-and-product-foundation.md` §3.1 rule 2: **face on chrome, silhouette on data.** It goes on
 * the app icon, the splash, sign-in and the link preview. It never goes on the map — *"thirty-one
 * smiling faces over a city is a toy, and a pin with eyes cannot carry a category colour"* — and
 * the design system drops it below 32px, where two dot eyes turn to mud.
 *
 * **What is here is the whole rig, not one smile, and that is the correction W-I2 made.** Iteration
 * 1 read the markdown companions rather than `docs/no-crumbs-design-system.html`, and shipped two
 * dot eyes and one smile as *the* face. The rendered system draws **eight moods**, each bound to a
 * product state, out of **six eye sets and seven mouths** — chapter 03, `#moods`, and the `CRUMB`
 * rig at the foot of that file. Every path below is copied from it character for character.
 *
 * The eyes are ellipses rather than circles: taller than they are wide is what keeps the character
 * from reading as startled.
 */

/**
 * One drawn feature of the face, in the same 100-square as `CRUMB_PATH`.
 *
 * A discriminated union rather than raw SVG strings because three renderers consume this and only
 * one of them is an SVG: `<canvas>` in the map's marker routine, satori in the two image routes,
 * and the DOM. `stroke` and `fill` carry a path; `ellipse` and `glint` carry numbers, so a canvas
 * can draw them without parsing anything.
 *
 * `glint` is separated from `ellipse` because it is the one feature that is **not** ink — it is the
 * white catchlight, and the Mono construction drops it while keeping the shape.
 */
export type CrumbFeature =
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly kind: 'glint'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: 'stroke'; readonly d: string }
  | { readonly kind: 'fill'; readonly d: string };

/** The catchlight on the body — a rotated ellipse, drawn clipped to the outline like the crust. */
export const CRUMB_SHINE = { cx: 26, cy: 26, rx: 15, ry: 10, rotate: -24 } as const;

/** The blush. Two ellipses at 50%, and the Flat construction lifts them to 60% because it has no
 *  keyline to carry the edge. */
export const CRUMB_CHEEKS = [
  { cx: 26.5, cy: 54, rx: 11, ry: 7.5 },
  { cx: 63.5, cy: 52, rx: 12, ry: 8 },
] as const;

/** The six eye sets. `#moods` uses each of them at least once; none is a spare. */
export const CRUMB_EYE_SETS = {
  dot: [
    { kind: 'ellipse', cx: 36, cy: 42, rx: 5.4, ry: 6.6 },
    { kind: 'ellipse', cx: 58, cy: 41, rx: 5.4, ry: 6.6 },
    { kind: 'glint', cx: 38, cy: 39.4, r: 1.9 },
    { kind: 'glint', cx: 60, cy: 38.4, r: 1.9 },
  ],
  wide: [
    { kind: 'ellipse', cx: 36, cy: 42, rx: 7, ry: 8.4 },
    { kind: 'ellipse', cx: 58, cy: 41, rx: 7, ry: 8.4 },
    { kind: 'glint', cx: 38.6, cy: 38.8, r: 2.5 },
    { kind: 'glint', cx: 60.6, cy: 37.8, r: 2.5 },
  ],
  happy: [
    { kind: 'stroke', d: 'M30.5 45Q36 37.6 41.5 45' },
    { kind: 'stroke', d: 'M52.5 44Q58 36.6 63.5 44' },
  ],
  closed: [
    { kind: 'stroke', d: 'M30.5 41Q36 46.4 41.5 41' },
    { kind: 'stroke', d: 'M52.5 40Q58 45.4 63.5 40' },
  ],
  flat: [
    { kind: 'stroke', d: 'M31 42.5H41' },
    { kind: 'stroke', d: 'M53 41.5H63' },
  ],
  wink: [
    { kind: 'stroke', d: 'M30.5 45Q36 37.6 41.5 45' },
    { kind: 'ellipse', cx: 58, cy: 41, rx: 5.4, ry: 6.6 },
    { kind: 'glint', cx: 60, cy: 38.4, r: 1.9 },
  ],
} as const satisfies Record<string, readonly CrumbFeature[]>;

export type CrumbEyes = keyof typeof CRUMB_EYE_SETS;

/**
 * The seven mouths.
 *
 * `grin` is the only filled one, and it is filled because it is the *open* mouth — every other
 * mouth is a stroke, because a filled line reads as a shout.
 */
export const CRUMB_MOUTHS = {
  smile: { kind: 'stroke', d: 'M40 59.5q7 6 14-.4' },
  content: { kind: 'stroke', d: 'M42 60.5q5 3.6 10 0' },
  grin: { kind: 'fill', d: 'M36 57.5Q47 71 58 57.5Z' },
  flat: { kind: 'stroke', d: 'M42 62h11' },
  o: { kind: 'ellipse', cx: 47, cy: 62, rx: 3.4, ry: 4.2 },
  wiggle: { kind: 'stroke', d: 'M40 62q3.2-3.6 6.4 0t6.4 0' },
  small: { kind: 'stroke', d: 'M44 61.5q3 2.4 6 0' },
} as const satisfies Record<string, CrumbFeature>;

export type CrumbMouth = keyof typeof CRUMB_MOUTHS;

/** The one celebration the system has, and there is no second one. Two four-pointed sparks. */
export const CRUMB_SPARKS = [
  { d: 'M16 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', originX: 16, originY: 20 },
  { d: 'M86 22l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z', originX: 86, originY: 28 },
] as const;

/** The locating pulse. Behind the body, in the body's own colour at 20%: a signal, not progress. */
export const CRUMB_HALO = { cx: 50, cy: 50, r: 46, opacity: 0.2 } as const;

/**
 * **Eight moods, eight product states, and the binding is the rule.** `#moods`: *"a face may only
 * exist if there is a screen that needs it."* Adding a mood means naming the state it serves; if
 * there is no state, there is no face. Deliberately absent: angry, crying, confused, and any
 * celebration beyond the single spark pair.
 *
 * **`nothingFound` is the load-bearing one.** Flat eyes, flat mouth — not a frown, not a droop.
 * This is the outcome of roughly three imports in four at LEVEL B's hit rate, and *"a sad mascot
 * turns the product's most common outcome into a small failure eight times a week."* Neutral says
 * *that happens*, and moves on. `voice-and-vocabulary.md`'s never-apologetic rule, drawn.
 *
 * `state` is not documentation. It is the screen the mood is allowed on, and a mood with no screen
 * behind it is the defect `#rules` rule 6 names.
 */
export const CRUMB_MOODS = {
  idle: { eyes: 'dot', mouth: 'smile', state: 'Header, app icon, resting' },
  reading: { eyes: 'dot', mouth: 'small', state: 'Import running — “Reading the TikTok”' },
  found: { eyes: 'happy', mouth: 'grin', spark: true, state: 'Places added to your map' },
  nothingFound: { eyes: 'flat', mouth: 'flat', state: 'No places in this one' },
  beenThere: { eyes: 'closed', mouth: 'content', state: 'A place marked as Been' },
  nearMe: { eyes: 'wide', mouth: 'o', halo: true, state: 'Locating, near-me on' },
  offline: { eyes: 'flat', mouth: 'wiggle', state: 'Connection lost, retryable error' },
  saved: { eyes: 'wink', mouth: 'smile', state: 'A place added to a collection' },
} as const satisfies Record<
  string,
  { eyes: CrumbEyes; mouth: CrumbMouth; spark?: boolean; halo?: boolean; state: string }
>;

export type CrumbMood = keyof typeof CRUMB_MOODS;

/**
 * The artboard the mascot is drawn into, and it is **not** `0 0 100 100`.
 *
 * The keyline is a 4.5-unit stroke (7 on Chunky) and a stroke straddles its path, so an outline
 * that reaches `x = 2` puts ink at `x = -1.5`. Drawn in the authoring square it is clipped on all
 * four sides; the rig in the design system uses `-8 -8 116 116` for exactly this reason and so does
 * this. The consequence is real and worth stating: at a fixed CSS box the faced mark is ~14%
 * smaller than the faceless silhouette, because it is reserving room for its own edge.
 */
export const CRUMB_ARTBOARD = { minX: -8, minY: -8, size: 116 } as const;

/* -------------------------------------------------------------------------- */
/* The trail                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **The trail — three crumbs rising into the character**, and `#mark` gives it equal billing with
 * the mascot, the silhouette and the pin: *"Trail · loading, routes, empty states."* One silhouette,
 * four jobs, and until now three of the four were built.
 *
 * `#apps` makes it the product's **one** loading animation: *"Three crumbs fading in left to right,
 * then the mascot lands — used for the import wait and nothing else. It is on-concept (the trail is
 * the product), it takes about 700ms, and it replaces a generic spinner on the one screen where the
 * user waits seven to thirty-four seconds. **One animation, one place.**"*
 *
 * ## The one place this deviates from the drawing, and why
 *
 * `#crumbTrail` in the design system draws its fourth element as **its own closed path** — a
 * 47-unit blob that is *not* `CRUMB_PATH`. Reproducing it would put a second outline in the system
 * and §3.1 rule 1 is unambiguous that there is one: *"if they change the outline, you lose the pin
 * and you are back to a teardrop like everyone else."* So the character at the end of the trail is
 * `CRUMB_PATH`, placed and scaled to the box the drawn blob occupies. The silhouette is identical
 * to the mascot's, the pin's and the favicon's, which is the property the whole system rests on,
 * and `tests/unit/brand/crumb-path.test.ts` can keep asserting it.
 *
 * The dots are the drawing's own, exactly: rising left to right on a diagonal, growing, and gaining
 * opacity as they approach the character. That diagonal is the reason this reads as *a trail being
 * followed* rather than as three dots of a loading indicator — which is precisely the generic thing
 * it replaces.
 */
export const CRUMB_TRAIL_VIEWBOX = { width: 120, height: 60 } as const;

/** The three crumbs, from `#crumbTrail`. Radius and opacity both climb toward the character. */
export const CRUMB_TRAIL_DOTS = [
  { cx: 8, cy: 50, r: 3.4, opacity: 0.38 },
  { cx: 28, cy: 43, r: 4.6, opacity: 0.55 },
  { cx: 51, cy: 33, r: 6, opacity: 0.75 },
] as const;

/**
 * The box the character occupies at the end of the trail, measured off `#crumbTrail`'s own fourth
 * path: x 70…117, y 0…52. `CRUMB_PATH` is scaled to that width and centred in that height, so the
 * placement is the drawing's and the outline is the system's.
 */
export const CRUMB_TRAIL_HEAD = { x: 70, y: 0, width: 47, height: 52 } as const;

/** The smallest size the face survives at, per the design system's own icon row. */
export const CRUMB_FACE_MIN_PX = 32;
