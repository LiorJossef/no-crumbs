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
 * colour. What sits in the head is the category glyph, in white — see `drawPin`.
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
  CRUMB_PIN_BOUNDS,
  CRUMB_PIN_TAIL_PATH,
} from '@/components/brand/crumb-path';

import type { Theme } from '@/lib/theme';
import { placePalette, type PlacePalette } from '@/ui/place/palette';
import { UNCATEGORISED_PIN, type PinKey } from './marker-style';
import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  PIN,
  pinGeometry,
  pinImageId,
  type GlyphName,
  type PinGeometry,
} from './marker-style';

export interface PinImage {
  readonly id: string;
  readonly data: ImageData;
  readonly pixelRatio: number;
}

/**
 * Every glyph is authored in this square and scaled to `PIN.glyphBox`, so the routines below can
 * be read as coordinates on graph paper rather than as fractions of a pin.
 */
const GLYPH_VIEWBOX = 24;

type Draw = (ctx: CanvasRenderingContext2D) => void;

/**
 * Filled shapes, not strokes. A 1.5 px stroke disappears at pin size on a low-DPI screen; a filled
 * silhouette survives it. Each routine draws in white into the 24×24 box, origin top-left.
 */
const GLYPHS: Record<GlyphName, Draw> = {
  fork: (ctx) => {
    // Fork: three tines over a tapered stem.
    for (const x of [4, 7, 10]) {
      ctx.fillRect(x - 0.9, 3, 1.8, 6);
    }
    ctx.beginPath();
    ctx.moveTo(2.6, 8);
    ctx.lineTo(11.4, 8);
    ctx.lineTo(11.4, 10.2);
    ctx.quadraticCurveTo(11.4, 12, 8, 12.4);
    ctx.lineTo(8, 21);
    ctx.lineTo(6, 21);
    ctx.lineTo(6, 12.4);
    ctx.quadraticCurveTo(2.6, 12, 2.6, 10.2);
    ctx.closePath();
    ctx.fill();
    // Knife: a blade that tapers into a handle.
    ctx.beginPath();
    ctx.moveTo(17, 3);
    ctx.quadraticCurveTo(21, 6.5, 20.4, 13);
    ctx.lineTo(18.6, 13);
    ctx.lineTo(18.6, 21);
    ctx.lineTo(16.6, 21);
    ctx.lineTo(16.6, 8);
    ctx.quadraticCurveTo(16, 5, 17, 3);
    ctx.closePath();
    ctx.fill();
  },

  cup: (ctx) => {
    // Body: a cup that narrows towards the base.
    ctx.beginPath();
    ctx.moveTo(3.5, 7);
    ctx.lineTo(16.5, 7);
    ctx.lineTo(15.2, 17.2);
    ctx.quadraticCurveTo(15, 19, 13, 19);
    ctx.lineTo(7, 19);
    ctx.quadraticCurveTo(5, 19, 4.8, 17.2);
    ctx.closePath();
    ctx.fill();
    // Handle.
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(16.8, 11.4, 3.4, -Math.PI / 2.1, Math.PI / 2.1);
    ctx.stroke();
    // Saucer.
    ctx.beginPath();
    ctx.roundRect(2.5, 20.2, 15, 2, 1);
    ctx.fill();
  },


  glass: (ctx) => {
    // Coupe: bowl, stem, foot.
    ctx.beginPath();
    ctx.moveTo(3.5, 5);
    ctx.lineTo(20.5, 5);
    ctx.lineTo(13, 13.5);
    ctx.lineTo(11, 13.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(11, 13, 2, 6.5);
    ctx.beginPath();
    ctx.roundRect(6.5, 19, 11, 2.2, 1.1);
    ctx.fill();
  },




  dot: (ctx) => {
    ctx.beginPath();
    ctx.arc(12, 12, 5.6, 0, Math.PI * 2);
    ctx.fill();
  },
};

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
 * The three colours a pin is made of, resolved for one theme.
 *
 * The glyph shape stays `CATEGORY_STYLES`' — a fork is a fork at night — but every *colour* comes
 * from `placePalette`, which is the module both the DOM and the GL side read (W7-3). Resolving
 * them together is the point: a pin whose body followed the theme while its ring did not would be
 * worse than one that ignored the theme entirely.
 */
function pinColors(category: PinKey, palette: PlacePalette): { body: string; ring: string; ink: string } {
  return {
    body: category === UNCATEGORISED_PIN ? palette.uncategorised : palette.category[category],
    // The ring separates the pin from whatever is under it, so it is the ground rather than a
    // fixed white: on paper white is the ground, at night `#131312` is. A white ring on a night
    // basemap is a bright outline around every pin — the loudest thing on the map, and drawn
    // around the one object that was already legible.
    ring: palette.labelHalo,
    // The glyph sits **on the body**, so it takes the ink chosen with the fill. At night the
    // bodies invert to light colours and a white glyph measures 2.1–3.0:1 against them; the same
    // AA failure `--on-category` fixed for the pressed filter chip, in the place it matters most.
    ink: palette.onCategory,
  };
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  category: PinKey,
  geometry: PinGeometry,
  palette: PlacePalette
): void {
  const { glyph } = CATEGORY_STYLES[category];
  const { body: color, ring, ink } = pinColors(category, palette);
  const { ringWidth, glyphBox } = geometry;
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

  // The glyph sits in the crumb's head, which is *not* the middle of the bitmap: the tail is
  // shorter than the teardrop's, so the head rides lower than `geometry.centreY`.
  //
  // The design system draws a plain white circle here — "the silhouette on a point, in the
  // category's own colour, with a white aperture". The category glyph is kept instead, because
  // dropping it would leave colour as the sole carrier of what a place *is*, on the one surface
  // where that is the pin's whole job. It is an aperture either way, and it is still faceless.
  const headX = offsetX + CRUMB_HEAD_CENTRE.x * scale;
  const headY = offsetY + CRUMB_HEAD_CENTRE.y * scale;

  ctx.save();
  ctx.translate(headX - glyphBox / 2, headY - glyphBox / 2);
  ctx.scale(glyphBox / GLYPH_VIEWBOX, glyphBox / GLYPH_VIEWBOX);
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  GLYPHS[glyph](ctx);
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
 * **`theme` defaults to light, so nothing changes until a caller opts in** —
 * `place-marker-layer.tsx` still calls this with one argument. That is deliberate rather than
 * timid: a pin is three colours and they have to move together. Flipping the ring to the night
 * ground while the body stayed a light-theme literal would draw a dark ring around a dark body on
 * a dark map, which is worse than the white ring it replaced. The day this takes a theme is the
 * day `marker-style.ts` has night bodies to give it.
 */
export function buildPinImages(pixelRatio: number, theme: Theme = 'light'): PinImage[] {
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
