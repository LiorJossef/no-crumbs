import { ImageResponse } from 'next/og';

import { BRAND_INK_ON_MINT, BRAND_MINT } from '@/components/brand/brand-colors';
import {
  CRUMB_EYES,
  CRUMB_HEAD_CENTRE,
  CRUMB_PATH,
  CRUMB_SMILE_PATH,
  CRUMB_SMILE_WIDTH,
  CRUMB_VIEWBOX,
} from '@/components/brand/crumb-path';

/**
 * The home-screen icon.
 *
 * **Generated rather than committed as a PNG, and the reason is `brand-and-product-foundation.md`
 * §3.1 rule 1.** The same closed path is the mascot, the pin and the favicon, and *"if the outline
 * changes, the pin is lost"*. A rasterised copy of that outline is a copy no test can read: the
 * shared path could change and 180 × 180 pixels of the old one would keep shipping, silently, on
 * the surface where the product is most recognisable. This route draws from `crumb-path.ts` at
 * build time, so the copy cannot exist. It shipped as a checked-in PNG for exactly one commit
 * (W4-4) before that was fixed.
 *
 * It has no request-time input, so Next renders it once during `next build` and serves a static
 * PNG. Unlike `opengraph-image.tsx` it needs **no font**: there is no text on it, which is also why
 * this file cannot fail the way that one can.
 *
 * ## The three decisions in the picture
 *
 *  - **Full bleed, no rounding of our own.** iOS applies its own corner mask to an apple-touch-icon
 *    and rounding the source as well leaves a visible pale corner inside the mask.
 *  - **The face is here.** §3.1 rule 2 puts it on chrome — app icon, splash, link preview — and at
 *    180px there is room. `icon.svg` goes without it because a favicon spends its life at 16px,
 *    where two dot eyes turn to mud.
 *  - **Mint and ink, no gold.** §3.1 rule 3: mint is the only brand colour, gold belongs to the
 *    mascot alone, and the two never share a surface. The design system draws this tile as the gold
 *    mascot on mint, which contradicts its own rule; rule 1 resolves it — palette may vary, the
 *    outline may not — so the mascot is here in the brand palette. Flipping it back is two
 *    constants.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The mark at 70% of the tile, which is what survives the iOS corner mask. */
const MARK_FRACTION = 0.7;

export default function AppleIcon() {
  const eyes = CRUMB_EYES.map(
    (eye) =>
      `<ellipse cx="${eye.cx}" cy="${eye.cy}" rx="${eye.rx}" ry="${eye.ry}" fill="${BRAND_MINT}"/>`,
  ).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CRUMB_VIEWBOX} ${CRUMB_VIEWBOX}">` +
    `<path d="${CRUMB_PATH}" fill="${BRAND_INK_ON_MINT}"/>${eyes}` +
    `<path d="${CRUMB_SMILE_PATH}" fill="none" stroke="${BRAND_MINT}" ` +
    `stroke-width="${CRUMB_SMILE_WIDTH}" stroke-linecap="round"/>` +
    `</svg>`;

  // The crumb's ink is not centred in its authoring square, so the mark is nudged by the same
  // offset `marker-images.ts` applies on the map — `CRUMB_HEAD_CENTRE` against 50, scaled.
  const markPx = size.width * MARK_FRACTION;
  const nudge = ((CRUMB_VIEWBOX / 2 - CRUMB_HEAD_CENTRE.x) / CRUMB_VIEWBOX) * markPx;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND_MINT,
        }}
      >
        {/* An `<img>` on purpose: satori renders one, there is no DOM here, and `next/image` is a
            component this renderer cannot run. */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`}
          width={markPx}
          height={markPx}
          style={{ transform: `translateX(${nudge}px)` }}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
