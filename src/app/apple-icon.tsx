import { ImageResponse } from 'next/og';

import { BRAND_MINT } from '@/components/brand/brand-colors';
import { CRUMB_ARTBOARD, CRUMB_BOUNDS } from '@/components/brand/crumb-path';
import { crumbMascotDataUri } from '@/components/brand/crumb-mascot-markup';

/**
 * The home-screen icon: **the gold mascot, with a face, on a mint tile.**
 *
 * **Generated rather than committed as a PNG, and the reason is `brand-and-product-foundation.md`
 * §3.1 rule 1.** The same closed path is the mascot, the pin and the favicon, and *"if the outline
 * changes, the pin is lost"*. A rasterised copy of that outline is a copy no test can read: the
 * shared path could change and 180 × 180 pixels of the old one would keep shipping, silently, on
 * the surface where the product is most recognisable. This route draws from
 * `crumb-mascot-markup.ts` at build time — the same builder the DOM mark and the link preview use
 * — so the copy cannot exist. It shipped as a checked-in PNG for exactly one commit (W4-4) before
 * that was fixed.
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
 *    180px there is room. `icon.svg` goes without it, and that is the same document's instruction:
 *    below 32px the face is dropped and the silhouette carries the tile, because *"two dot eyes at
 *    16px turn to mud"*.
 *  - **Gold on mint, which reverses what this file said.** It read: *"§3.1 rule 3: mint is the only
 *    brand colour, gold belongs to the mascot alone, and the two never share a surface. The design
 *    system draws this tile as the gold mascot on mint, which contradicts its own rule; rule 1
 *    resolves it — palette may vary, the outline may not."* That was a reasonable reading of a
 *    contradiction, and it was resolved the wrong way round. `docs/no-crumbs-design-system.html`
 *    §`apps` **draws** this tile, at 180/64/32/16px, as the gold character on mint; rule 3's real
 *    force is rule 5, *gold stays off the map*, and an app icon is not the map. The team lead's
 *    ruling against gold-on-mint was withdrawn on 2026-08-31 once the drawing was opened. Built as
 *    drawn.
 *
 * The construction is **Outlined**, which is what §`apps` draws, not Flat — even though §`styles`
 * notes Flat *"sits better inside an app-icon mask"*. That note is about small sizes; this is 180px
 * and the keyline is what separates a gold body from a mint tile at any size. If a smaller
 * rasterised icon is ever added, Flat is the one to reach for there.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * **70% of the tile, measured as ink rather than as box** — which is what survives the iOS corner
 * mask, and what the previous version got wrong by about a sixth.
 *
 * Two boxes are not the same box and the difference is 17% of the mark. The outlined construction
 * is drawn into a 116-unit artboard so its keyline has room, and the crumb's ink is 89 of those
 * units — so an `<img>` sized to 70% of the tile puts only **54%** of ink on it. The design
 * system's own icon row draws 74px of `viewBox="0 0 100 100"` on a 104px tile, which is 63% of ink
 * on tile; asking for 70 and getting 54 is a smaller mark than either number describes.
 *
 * So the fraction is stated as the thing a person looking at the icon actually sees, and the
 * `<img>` is scaled up from it. It is nudged for nothing: the ink centre sits 0.3 units left of the
 * artboard centre, which is 0.4px here.
 */
const INK_FRACTION = 0.7;

export default function AppleIcon() {
  const inkWidth = CRUMB_BOUNDS.maxX - CRUMB_BOUNDS.minX;
  const markPx = size.width * INK_FRACTION * (CRUMB_ARTBOARD.size / inkWidth);

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
          src={crumbMascotDataUri({ mood: 'idle', construction: 'outlined' })}
          width={markPx}
          height={markPx}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
