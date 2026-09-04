import { ImageResponse } from 'next/og';

import {
  BRAND_INK,
  BRAND_INK_MUTED,
  BRAND_MINT,
  BRAND_SURFACE,
} from '@/components/brand/brand-colors';
import {
  CRUMB_HEAD_CENTRE,
  CRUMB_PATH,
  CRUMB_PIN_APERTURE,
  CRUMB_PIN_TAIL_PATH,
  CRUMB_PIN_VIEWBOX_HEIGHT,
  CRUMB_VIEWBOX,
} from '@/components/brand/crumb-path';
import { crumbMascotDataUri } from '@/components/brand/crumb-mascot-markup';
import { CATEGORY_COLOR } from '@/ui/place/palette';

/**
 * The link preview.
 *
 * **The asset with the highest ratio of effort to credibility, and the product had none.** Every
 * shared collection invite previewed as a bare URL with the platform's generic globe — which is
 * what a link to a product nobody has heard of looks like when it is also a link to nothing.
 *
 * `voice-and-vocabulary.md` §2 surface 5 (the app icon, which `overnight-copy-deck.md` §1.2 reads
 * as covering this file too), so the name may appear here. Both strings are the deck's, verbatim:
 * `No Crumbs` is C103 and the sentence under it is C102, the same one the meta description and the
 * landing subhead carry. Nothing on this image is written for it.
 *
 * ## Why the drawing is data URIs and not JSX
 *
 * This renders through satori, which lays out a subset of CSS against a subset of SVG. It has no
 * cascade and no custom properties, so every colour here is a literal from
 * `components/brand/brand-colors.ts` — the same arrangement, and the same reason, as
 * `global-error.tsx`. Handing it a finished `<img>` rather than an element tree is the part of
 * satori that is least likely to surprise us.
 *
 * ## The face is allowed here, and required
 *
 * `brand-and-product-foundation.md` §3.1 rule 2: face on chrome, silhouette on data. The link
 * preview is named in that list, and at 132px there is room for it — this is the one surface in the
 * product where the mascot is a mascot rather than a shape.
 *
 * **And it is the gold character, not the mint one, which reverses what shipped here.** This file
 * drew the mark in `BRAND_INK_ON_MINT` with mint features on §3.1 rule 3's grounds — mint is the
 * only brand colour, gold belongs to the mascot alone, the two never share a surface. That reading
 * came from the markdown companions. `docs/no-crumbs-design-system.html` §`apps` **draws** the link
 * preview with the gold character on it, exactly as it draws the app icon, and the team lead's
 * ruling against gold-on-mint was withdrawn on 2026-08-31. Rule 3's real force is rule 5 — gold
 * stays off the map — and this is not the map. The drawing is `crumb-mascot-markup.ts`'s, so the
 * preview, the home-screen icon and the in-app mark are one drawing rather than three.
 *
 * ## The three pins are the product, in one line
 *
 * They are the actual category colours from `ui/place/palette.ts`, in the actual pin shape. A
 * preview that shows *what a place looks like on this map* says more about the product than another
 * sentence would, and it costs nothing: the shapes and the colours already exist.
 */

export const alt = 'No Crumbs — your saved places, on one map';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * A map pin, faceless, in a category colour — exactly what the map draws.
 *
 * The aperture is the design system's own: `r = 17` at 95%, in the head's centre. It is drawn in
 * the page's warm near-white rather than pure white, because that is what sits under it here; on
 * the map the same hole takes `palette.labelHalo`, which is the ground in both themes.
 */
function crumbPinImage(fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CRUMB_VIEWBOX} ${CRUMB_PIN_VIEWBOX_HEIGHT}">` +
    `<path d="${CRUMB_PIN_TAIL_PATH}" fill="${fill}"/><path d="${CRUMB_PATH}" fill="${fill}"/>` +
    `<circle cx="${CRUMB_HEAD_CENTRE.x}" cy="${CRUMB_HEAD_CENTRE.y}" r="${CRUMB_PIN_APERTURE.r}" ` +
    `fill="${BRAND_SURFACE}" opacity="${CRUMB_PIN_APERTURE.opacity}"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * One weight of one face, fetched from the same host `next/font` already builds against.
 *
 * **This runs at build time and never at request time, and reading it as per-request is the
 * mistake to avoid.** The route takes no request-time input — no `params`, no `searchParams`, no
 * cookies, no `headers()` — so Next renders it once during `next build` and serves a static PNG
 * from then on. A visitor's browser never talks to Google, and no visitor ever waits on these two
 * requests. That is why it is not worth "optimising" into a committed binary on latency grounds,
 * and why it is not something to panic about on privacy grounds: it is the same trade
 * `app/layout.tsx` already makes for Manrope and Fraunces. It adds a fetch, not a new kind of
 * dependency. **If a request-time API is ever added to this file that stops being true**, and the
 * fetch becomes per-request — that is the thing to check before adding one.
 *
 * **It returns `null` rather than throwing.** With no network at build time the preview renders in
 * satori's bundled Geist instead of Fraunces — visibly not our wordmark, but a preview that
 * exists — and the build stays green. A brand asset is not worth failing a deploy over.
 *
 * **The degraded path announces itself**, which is the difference between a fallback and a silent
 * one. It writes a line to the build log naming the face that did not arrive, and
 * `opengraph-image.alt.txt` is not the place a human would look, so the log is. A link preview in
 * the wrong typeface is the kind of defect nobody reports and everybody sees.
 *
 * The axis instance is requested by name: `SOFT` 60 and `WONK` 1 are the wordmark's setting
 * (`components/brand/display-type.ts`), and satori takes a static file, so the variable axes have
 * to be resolved on Google's side rather than ours.
 */
async function fetchFont(family: string): Promise<ArrayBuffer | null> {
  const name = family.split(':')[0] ?? family;
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, {
      // Without a browser UA the API answers in `woff2`, which satori cannot parse.
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((response) => response.text());
    const url = /src:\s*url\((https:[^)]+\.(?:ttf|otf))\)/.exec(css)?.[1];
    if (url === undefined) {
      console.warn(`[opengraph-image] no ttf/otf for ${name}; the link preview falls back to Geist`);
      return null;
    }
    return await fetch(url).then((response) => response.arrayBuffer());
  } catch (thrown) {
    console.warn(
      `[opengraph-image] could not fetch ${name}; the link preview falls back to Geist`,
      thrown instanceof Error ? thrown.message : thrown,
    );
    return null;
  }
}

export default async function OpengraphImage() {
  const [display, body] = await Promise.all([
    fetchFont('Fraunces:SOFT,WONK,opsz,wght@60,1,144,700'),
    fetchFont('Manrope:wght@500'),
  ]);

  const fonts = [
    display && { name: 'Fraunces', data: display, style: 'normal' as const, weight: 700 as const },
    body && { name: 'Manrope', data: body, style: 'normal' as const, weight: 500 as const },
  ].filter((font) => font !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '84px',
          // `--brand-wash` is three stacked radials over `--background`; satori takes one. This is
          // the one that carries it — the mint bloom off the top-right corner.
          backgroundColor: BRAND_SURFACE,
          backgroundImage: `radial-gradient(circle at 105% -10%, ${BRAND_MINT} 0%, ${BRAND_SURFACE} 62%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* An `<img>` on purpose: satori renders one, there is no DOM here, and `next/image` is
              a component this renderer cannot run. */}
          <img
            src={crumbMascotDataUri({ mood: 'idle', construction: 'outlined' })}
            // 172, not 132. The outlined artboard is 116 units and the crumb's ink is 89 of them,
            // so the box has to be ~30% larger than the mark it is meant to draw — see
            // `apple-icon.tsx`, which had the same error. 172 puts 132px of crumb beside the
            // 86px wordmark, which is the proportion this layout was set to.
            width={172}
            height={172}
            alt=""
          />
          <span
            style={{
              fontFamily: 'Fraunces',
              fontSize: '86px',
              fontWeight: 700,
              letterSpacing: '-0.022em',
              color: BRAND_INK,
            }}
          >
            No Crumbs
          </span>
        </div>

        <p
          style={{
            fontFamily: 'Manrope',
            fontSize: '38px',
            lineHeight: 1.35,
            fontWeight: 500,
            color: BRAND_INK_MUTED,
            margin: '44px 0 0',
            maxWidth: '900px',
          }}
        >
          Paste a TikTok link and the place lands on your map. Organised by where, not by when.
        </p>

        <div style={{ display: 'flex', gap: '18px', marginTop: '56px' }}>
          {[CATEGORY_COLOR.restaurant, CATEGORY_COLOR.cafe, CATEGORY_COLOR.bar].map((color) => (
            <img key={color} src={crumbPinImage(color)} width={44} height={56} alt="" />
          ))}
        </div>
      </div>
    ),
    // `exactOptionalPropertyTypes` is on, so the key is omitted rather than set to `undefined`
    // when no font was fetched — which is also what makes satori fall back to its bundled face.
    fonts.length > 0 ? { ...size, fonts } : { ...size },
  );
}
