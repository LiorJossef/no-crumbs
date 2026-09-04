/**
 * Draws the pin bitmaps MapLibre renders as `icon-image`.
 *
 * MapLibre's glyph fonts carry no colour emoji and its `symbol` layer takes a raster image, not an
 * SVG, so every marker on this map is drawn here once at mount and registered with
 * `map.addImage`. Four pin keys × two states = eight small bitmaps.
 *
 * Browser-only: it needs a real `<canvas>`. The palette and geometry it draws from are in
 * `./marker-style.ts`, which is where the unit tests live.
 *
 * ## The body is the crumb, and it is not drawn here
 *
 * Until W4-3 this file computed a teardrop — a circle's arc closed by its two lower tangents —
 * which is the Google Maps marker every one of the thirty-four products in this category draws.
 * The outline now comes from `@/components/brand/crumb-path`, the same closed path the mark, the
 * favicon and the link preview use, because `brand-and-product-foundation.md` §3.1 rule 1 makes
 * that sharing the whole point: *"if the outline changes, the pin is lost"*.
 *
 * **No face, ever, on this surface.** §3.1 rule 2 splits face onto chrome and silhouette onto data:
 * thirty-one smiling faces over a city is a toy, and a pin with eyes cannot carry a category
 * colour. What sits in the head is an **aperture** — see `drawPin` for what replaced the category
 * glyph and what was measured before it did.
 *
 * **Nothing about the bitmap's size or anchor changed**, and that is deliberate rather than
 * incidental. `pinGeometry` still owns width, height, `tipToBottom` and the anchor, all of them in
 * `./marker-style.ts` and all of them read by the camera's padding. A pin that got taller for
 * visual reasons is a camera-affecting change; this one draws a different shape inside the same
 * box.
 */

import {
  CRUMB_BOUNDS,
  CRUMB_HEAD_CENTRE,
  CRUMB_PATH,
  CRUMB_PIN_APERTURE,
  CRUMB_PIN_BOUNDS,
  CRUMB_PIN_TAIL_PATH,
} from '@/components/brand/crumb-path';

import { currentTheme, type Theme } from '@/lib/theme';
import { placePalette, type PlacePalette } from '@/ui/place/palette';
import { UNCATEGORISED_PIN, type PinKey } from './marker-style';
import {
  CATEGORY_ORDER,
  PIN,
  pinGeometry,
  pinImageId,
  type PinGeometry,
} from './marker-style';

export interface PinImage {
  readonly id: string;
  readonly data: ImageData;
  readonly pixelRatio: number;
}

/**
 * How the crumb is placed inside the bitmap `pinGeometry` describes.
 *
 * Two anchors, and they are chosen rather than obvious:
 *
 *  - **Width, not height, sets the scale.** The bitmap is exactly `2 * centreX` wide, which is the
 *    head's width plus the ring plus the shadow pad, so the drawn shape has exactly `2 *
 *    headRadius` of horizontal room and no more. Scaling to fill the *height* instead would push
 *    the crumb's shoulders under the ring and clip them.
 *  - **The tip lands on `tipY`.** The layer anchors at `bottom` and offsets by `tipToBottom`, so
 *    the point of the pin — not the bottom edge of the image — sits on the coordinate. That
 *    contract is `pinGeometry`'s and this drawing has to satisfy it exactly.
 *
 * The consequence, stated because it is visible: the crumb pin is a little shorter than the
 * teardrop was. The teardrop filled the full 40 units from the top of the head to the tip; the
 * crumb is stubbier — 89 wide by 120 tall in its own space against the teardrop's 26 by 40 — so at
 * the same head width it stands about 6px lower and leaves transparent space at the top of the
 * bitmap. **The bitmap, the anchor and the offset are unchanged**, so nothing the camera reads has
 * moved.
 */
function crumbTransform(geometry: PinGeometry) {
  const { centreX, tipY, headRadius } = geometry;
  const scale = (headRadius * 2) / (CRUMB_BOUNDS.maxX - CRUMB_BOUNDS.minX);
  return {
    scale,
    // The crumb's own ink centre, not the middle of its authoring square — they differ by 0.3
    // units, which is a visible half-pixel of asymmetry once the shape has a white ring on it.
    offsetX: centreX - CRUMB_HEAD_CENTRE.x * scale,
    offsetY: tipY - CRUMB_PIN_BOUNDS.maxY * scale,
  };
}

/**
 * The two colours a pin is made of, resolved for one theme.
 *
 * Both come from `placePalette`, which is the module the DOM and the GL side both read (W7-3).
 * Resolving them together is the point: a pin whose body followed the theme while its ring did not
 * would be worse than one that ignored the theme entirely.
 *
 * **It was three until the aperture replaced the glyph.** The third was `palette.onCategory`, the
 * ink a glyph sat in — white on the light bodies, the ground on the night ones, because at night
 * the bodies invert to light colours and a white glyph measured 2.1–3.0:1 against them. There is no
 * ink on a pin any more; the hole in the head is the ring colour, so the pin is two colours and a
 * shape.
 */
function pinColors(category: PinKey, palette: PlacePalette): { body: string; ring: string } {
  return {
    body: category === UNCATEGORISED_PIN ? palette.uncategorised : palette.category[category],
    // The ring separates the pin from whatever is under it, and the aperture is the same colour for
    // the same reason: it is the ground rather than a fixed white. On paper white is the ground; at
    // night `#131312` is, and a white ring on a night basemap is a bright outline around every pin
    // — the loudest thing on the map, drawn around the one object that was already legible.
    ring: palette.labelHalo,
  };
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  category: PinKey,
  geometry: PinGeometry,
  palette: PlacePalette
): void {
  const { body: color, ring } = pinColors(category, palette);
  const { ringWidth } = geometry;
  const { scale, offsetX, offsetY } = crumbTransform(geometry);

  // One `Path2D` holding two subpaths — the crumb and the point under it — rather than a merged
  // outline. The crumb has to stay byte-identical to the shape the mark and the favicon draw, and
  // merging would produce a fourth "same" path that is not the same path. Both subpaths wind the
  // same way, so `nonzero` fills their union; the tail's shoulders sit at y=90, inside the crumb,
  // so there is no seam to see.
  const body = new Path2D();
  body.addPath(new Path2D(CRUMB_PIN_TAIL_PATH));
  body.addPath(new Path2D(CRUMB_PATH));

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // The ring is a stroke laid down *before* the fill: a stroke straddles its path, so
  // filling over it leaves exactly half the width standing proud of the body. It is also what
  // covers the internal seam where the two subpaths cross.
  //
  // `lineWidth` is divided by the scale because a stroke *is* transformed by the CTM, unlike the
  // shadow — `shadowBlur` and `shadowOffsetY` are in output space by specification, so they stay
  // as written and keep the same drop shadow the teardrop had.
  ctx.save();
  ctx.shadowColor = 'rgba(15, 30, 28, 0.34)';
  ctx.shadowBlur = PIN.shadowBlur;
  ctx.shadowOffsetY = PIN.shadowOffsetY;
  ctx.lineWidth = (ringWidth * 2) / scale;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ring;
  ctx.stroke(body);
  ctx.restore();

  ctx.fillStyle = color;
  ctx.fill(body);
  ctx.restore();

  /*
   * **The aperture**, and it replaces the category glyph — `#apps`: *"the silhouette on a point, in
   * the category's own colour, with a white aperture. Same geometry as the mascot, face removed."*
   *
   * It sits in the crumb's head, which is *not* the middle of the bitmap: the tail is shorter than
   * the teardrop's, so the head rides lower than `geometry.centreY`.
   *
   * ## The comment this replaces argued the other way, and the measurement went against it
   *
   * It read: *"the category glyph is kept instead, because dropping it would leave colour as the
   * sole carrier of what a place is, on the one surface where that is the pin's whole job."* That
   * was the right worry at the time — two of the four category colours then sat CIEDE2000 14.8
   * apart. It is not the right answer now, and the reasons are numbers rather than a preference:
   *
   *  - **The palette moved underneath it.** The worst pair is 26.7 after the ramps landed, and
   *    every pair clears 26 under simulated deuteranopia and protanopia. See `CATEGORY_COLOR` in
   *    `ui/place/palette.ts` for the table and for the one value that is not the design system's.
   *  - **The aperture gives the colour more room, not less.** `r = 17` against an 89-wide head is a
   *    10px hole in a 26px head, where `glyphBox` was 14px. The head goes from **71% colour** to
   *    **86% colour** — 21% more coloured area on the object whose colour is the encoding. A glyph
   *    that is meant to disambiguate a colour is competing with it for the same 26 pixels.
   *  - **The glyphs were not carrying what they looked like they carried.** Four categories, and
   *    the uncategorised one drew a plain dot — so at 15px the set was fork / cup / coupe / dot,
   *    two of which are a small pale blob with a handle.
   *
   * ## And the question that was actually asked: does it hold at 15px?
   *
   * **Yes, and the glyph would not have.** Measured off production pixels — the real map at
   * 1440×900, each category's pin located by its exact body colour, its own footprint cropped and
   * integrated. Two readings, because a 15px pin is not one thing:
   *
   *  - **Resolved** — the body colour, which is what the coloured ring shows at 15px, where the
   *    head is still ~10px across. Worst pair **ΔE00 26.7**, deuteranopia **21.2**, protanopia 11.3.
   *  - **Integrated** — the whole footprint averaged to a single blob, which is the worst case and
   *    what peripheral vision gets. Body is 40.9% of the footprint, so this desaturates hard: worst
   *    pair **ΔE00 17.8** light and 17.2 night, deuteranopia 5.0 and 2.8.
   *
   * The truth is nearer the first: 15px is well above the resolution limit and the ring reads as
   * colour. Looked at, not only computed — the three categories rendered at 39 (as painted), 26, 20
   * and 15px are unmistakably red, brown and violet at every step. The aperture stays visible to
   * about 20px and closes into a solid blob at 15.
   *
   * **The decisive number is the one about the glyph, and it is arithmetic from `pinGeometry`.**
   * `glyphBox` is 14 units of a 52.5-unit bitmap, so at a 15px pin the glyph is **4.0px**. A 4px
   * fork is mud. The glyph only helps at the sizes where colour already works, and it is gone at
   * the size where colour gets hard — so it was never the fallback it looked like. That is why the
   * argument for keeping it does not survive its own test rather than merely losing to the palette.
   *
   * The product does not paint a 15px pin, incidentally: `pinGeometry` is 37 × 52.5 CSS px and the
   * ink measures 31 × 39. 15px is the design system's own phrase for what the silhouette must
   * survive, so it is what was measured.
   *
   * The dashed ring for a guessed coordinate is untouched: that is a *different* signal, it is a
   * ring rather than a fill, and it stays the thing that says the model guessed this one.
   *
   * **This is not a camera-affecting change.** `pinGeometry` still owns the width, the height, the
   * anchor and `tipToBottom`, and none of them moved — the hole is inside the head.
   */
  const headX = offsetX + CRUMB_HEAD_CENTRE.x * scale;
  const headY = offsetY + CRUMB_HEAD_CENTRE.y * scale;

  ctx.save();
  ctx.globalAlpha = CRUMB_PIN_APERTURE.opacity;
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(headX, headY, CRUMB_PIN_APERTURE.r * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Every pin bitmap, ready for `map.addImage`.
 *
 * `pixelRatio` is handed to MapLibre rather than baked into the layout: the bitmap is drawn at
 * device resolution and MapLibre lays it out at `width / pixelRatio` CSS pixels, so the same call
 * produces a crisp pin on a retina screen and a correctly sized one everywhere.
 *
 * Returns `[]` when the canvas cannot be obtained (jsdom, a headless context with no 2D backend)
 * so a caller can degrade to no icons instead of throwing during render.
 *
 * **`theme` defaults to the document's own theme**, so the existing caller —
 * `place-marker-layer.tsx`, which passes one argument — gets night pins on a night map without
 * being edited. It was `'light'` for one commit, while `marker-style.ts` was still held: a pin is
 * three colours and they have to move together, and flipping the ring alone would have drawn a
 * dark ring around a light-theme body on a dark map, which is worse than the white ring it
 * replaced. Now that all three come from `placePalette`, the default can tell the truth.
 *
 * **The limit, stated: this resolves once, when the images are built.** These are rasterised
 * bitmaps, so unlike a CSS-token'd node they cannot follow a theme after they are drawn — the same
 * property `use-disc-theme.ts` exists for. The head script fixes the theme before first paint and
 * no toggle ships (`facelift-plan.md` §4 decision 3), so within a session this is always right. The
 * day a toggle exists, `place-marker-layer.tsx` has to rebuild its images on a theme change, and
 * that is a one-line dependency rather than a redesign.
 */
export function buildPinImages(pixelRatio: number, theme: Theme = currentTheme()): PinImage[] {
  const palette = placePalette(theme);
  const images: PinImage[] = [];

  for (const category of CATEGORY_ORDER) {
    for (const selected of [false, true]) {
      const geometry = pinGeometry(selected);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(geometry.width * pixelRatio);
      canvas.height = Math.ceil(geometry.height * pixelRatio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      ctx.scale(pixelRatio, pixelRatio);
      drawPin(ctx, category, geometry, palette);
      images.push({
        id: pinImageId(category, selected),
        data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        pixelRatio,
      });
    }
  }

  return images;
}
