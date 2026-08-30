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
