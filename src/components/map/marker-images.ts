/**
 * Draws the pin bitmaps MapLibre renders as `icon-image`.
 *
 * MapLibre's glyph fonts carry no colour emoji and its `symbol` layer takes a raster image, not an
 * SVG, so every marker on this map is drawn here once at mount and registered with
 * `map.addImage`. Eight categories × two states = sixteen small bitmaps.
 *
 * Browser-only: it needs a real `<canvas>`. The palette and geometry it draws from are in
 * `./marker-style.ts`, which is where the unit tests live.
 */

import type { ProductCategory } from '@/domain/places/product-category';
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

  croissant: (ctx) => {
    // A crescent: one arc out, a tighter one back, tips pulled up into horns.
    ctx.beginPath();
    ctx.moveTo(3, 16.5);
    ctx.quadraticCurveTo(3.5, 5, 12, 5);
    ctx.quadraticCurveTo(20.5, 5, 21, 16.5);
    ctx.quadraticCurveTo(19.5, 13.5, 17.5, 14.6);
    ctx.quadraticCurveTo(15.5, 9.8, 12, 9.8);
    ctx.quadraticCurveTo(8.5, 9.8, 6.5, 14.6);
    ctx.quadraticCurveTo(4.5, 13.5, 3, 16.5);
    ctx.closePath();
    ctx.fill();
    // The rolled centre, so it does not read as a plain arch.
    ctx.beginPath();
    ctx.ellipse(12, 15.5, 3.4, 2.6, 0, 0, Math.PI * 2);
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

  star: (ctx) => {
    const cx = 12;
    const cy = 12.4;
    const outer = 9.6;
    const inner = 4.2;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  },

  bag: (ctx) => {
    // Handle first, so the body's fill covers where it meets the rim.
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(12, 8.6, 4, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(4, 8.6, 16, 12.6, 2.2);
    ctx.fill();
  },

  cone: (ctx) => {
    // Two scoops and a wafer. Drawn as one filled path per part rather than an outline, because at
    // 24px in a pin the stroke weight that reads as "cone" at icon size closes up into a blob.
    ctx.beginPath();
    ctx.arc(9.6, 8.4, 3.9, 0, Math.PI * 2);
    ctx.arc(14.4, 8.4, 3.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6.2, 11.4);
    ctx.lineTo(17.8, 11.4);
    ctx.lineTo(12, 21.4);
    ctx.closePath();
    ctx.fill();
  },

  dot: (ctx) => {
    ctx.beginPath();
    ctx.arc(12, 12, 5.6, 0, Math.PI * 2);
    ctx.fill();
  },
};

function drawPin(
  ctx: CanvasRenderingContext2D,
  category: ProductCategory,
  geometry: PinGeometry
): void {
  const { color, glyph } = CATEGORY_STYLES[category];
  const { centreX, centreY, tipY, headRadius, ringWidth, glyphBox } = geometry;

  // The teardrop: the head's arc, closed by the two tangent lines that meet at the tip. `acos`
  // rather than `asin` — the angle wanted is the one at the centre of the head, between "straight
  // down to the tip" and "out to where the tangent touches".
  const tangent = Math.acos(headRadius / (tipY - centreY));
  const body = new Path2D();
  body.moveTo(centreX, tipY);
  body.arc(centreX, centreY, headRadius, Math.PI / 2 - tangent, Math.PI / 2 + tangent, true);
  body.closePath();

  // The white ring is a stroke laid down *before* the fill: a stroke straddles its path, so
  // filling over it leaves exactly half the width standing proud of the body.
  ctx.save();
  ctx.shadowColor = 'rgba(15, 30, 28, 0.34)';
  ctx.shadowBlur = PIN.shadowBlur;
  ctx.shadowOffsetY = PIN.shadowOffsetY;
  ctx.lineWidth = ringWidth * 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke(body);
  ctx.restore();

  ctx.fillStyle = color;
  ctx.fill(body);

  ctx.save();
  ctx.translate(centreX - glyphBox / 2, centreY - glyphBox / 2);
  ctx.scale(glyphBox / GLYPH_VIEWBOX, glyphBox / GLYPH_VIEWBOX);
  ctx.fillStyle = '#FFFFFF';
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
 */
export function buildPinImages(pixelRatio: number): PinImage[] {
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
      drawPin(ctx, category, geometry);
      images.push({
        id: pinImageId(category, selected),
        data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        pixelRatio,
      });
    }
  }

  return images;
}
