/**
 * The mascot, drawn once, as a string of SVG.
 *
 * ## Why a string and not a component
 *
 * Three renderers draw this character and only one of them is React:
 *
 *  - the **DOM** — the header mark, sign-in, the empty state;
 *  - **satori**, in `app/apple-icon.tsx` and `app/opengraph-image.tsx`, which lays out a subset of
 *    CSS, has no cascade, no custom properties, and rasterises an `<img>` of an SVG data URI;
 *  - and, at 16px with no document at all, the static `app/icon.svg`.
 *
 * Iteration 1 drew the mark three times, once per renderer, and the three drifted immediately: the
 * app icon shipped a smile the component did not have. `crumb-path.ts` already fixed that for the
 * *outline*, which is the part `brand-and-product-foundation.md` §3.1 rule 1 makes unchangeable.
 * This fixes it for everything rule 1 lets vary — face, shading, palette — which is the part that
 * actually differed.
 *
 * So the markup is built here from `crumb-path.ts`'s geometry and `mascot-colors.ts`'s palette, and
 * the React component renders the result rather than restating it. **One drawing, three surfaces.**
 * `tests/unit/brand/crumb-mascot.test.ts` is what keeps it that way.
 *
 * ## What this file may never import
 *
 * React, and anything that reaches the map. It is a pure function of constants, which is also what
 * lets `app/global-error.tsx` keep its rule about leaf modules that cannot throw.
 */

import {
  CRUMB_ARTBOARD,
  CRUMB_CHEEKS,
  CRUMB_EYE_SETS,
  CRUMB_HALO,
  CRUMB_MOODS,
  CRUMB_MOUTHS,
  CRUMB_PATH,
  CRUMB_SHADE_PATH,
  CRUMB_SHINE,
  CRUMB_SPARKS,
  CRUMB_VIEWBOX,
  type CrumbFeature,
  type CrumbMood,
} from './crumb-path';
import { CRUMB_CONSTRUCTIONS, type CrumbConstruction } from './mascot-colors';

export interface CrumbMascotOptions {
  /** Which of the eight states the face is showing. Omit for the silhouette — see `mood`'s note. */
  readonly mood?: CrumbMood;
  readonly construction?: CrumbConstruction;
  /**
   * The `clipPath` id the crust is drawn against.
   *
   * Ids are document-global, so two mascots inline in one page with the same id is invalid markup.
   * `#rules` rule 2 — **one mascot per screen, never two** — makes that a rule violation before it
   * is a rendering one, so the default is fixed and a caller that genuinely needs a second instance
   * passes its own. Inside a data-URI image the id is scoped to that image and cannot collide.
   */
  readonly clipId?: string;
  /** Body fill override. Only for Mono, whose body is `currentColor` and whose colour is therefore
   *  the caller's — the pin passes a category colour here. */
  readonly color?: string;
  /**
   * Keyline override, and **the DOM passes a token here while the image routes do not.**
   *
   * The keyline is the one part of the character that follows the theme: it carries the shape's
   * edge on paper, where gold is 1.63:1 against the card, and needs to be warmer on a dark ground
   * to stay an edge at all. `MASCOT_KEYLINE_VAR` is what the DOM hands in. satori has no cascade
   * and a `<canvas>` has no stylesheet, so `apple-icon`, `opengraph-image` and the map's marker
   * routine take the construction's literal — the same split `ui/place/palette.ts` documents for
   * the category colours.
   */
  readonly keyline?: string;
}

/**
 * The artboard, as a `viewBox` string — **and it depends on whether the construction has a
 * keyline.**
 *
 * A stroke straddles its path, so a 4.5-unit keyline on an outline that reaches `x = 2` puts ink at
 * `x = -0.25`, and a 7-unit one (Chunky) at `x = -1.5`. Drawn in the authoring square both are
 * clipped on all four sides; the design system's rig pads to `-8 -8 116 116` for exactly that, and
 * so does this.
 *
 * **Mono and Flat keep the square**, because they have no keyline and padding them would shrink the
 * mark ~14% inside the same CSS box for nothing. That matters concretely: Mono is the favicon and
 * the pin, and both are already sized against the full square.
 */
export function crumbMascotViewBox(construction: CrumbConstruction = 'outlined'): string {
  if (CRUMB_CONSTRUCTIONS[construction].keylineWidth === 0) {
    return `0 0 ${CRUMB_VIEWBOX} ${CRUMB_VIEWBOX}`;
  }
  return `${CRUMB_ARTBOARD.minX} ${CRUMB_ARTBOARD.minY} ${CRUMB_ARTBOARD.size} ${CRUMB_ARTBOARD.size}`;
}

/** Rounds to 2dp and drops a trailing `.0`, so the markup is stable enough to assert on. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function feature(item: CrumbFeature, ink: string, width: number): string {
  switch (item.kind) {
    case 'ellipse':
      return `<ellipse cx="${n(item.cx)}" cy="${n(item.cy)}" rx="${n(item.rx)}" ry="${n(item.ry)}" fill="${ink}"/>`;
    case 'glint':
      // The catchlight is white on every construction that has one — it is a highlight, not ink,
      // so it does not follow the keyline colour into Flat's warmer brown.
      return `<circle cx="${n(item.cx)}" cy="${n(item.cy)}" r="${n(item.r)}" fill="#FFFFFF"/>`;
    case 'stroke':
      return `<path d="${item.d}" fill="none" stroke="${ink}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'fill':
      return `<path d="${item.d}" fill="${ink}"/>`;
  }
}

/**
 * The character's inner markup — everything inside the `<svg>`, in drawing order.
 *
 * The order is the rig's and it is not arbitrary: halo behind the body, crust and catchlight
 * *clipped to the outline* so the shading edge never lands on a coordinate the outline also uses,
 * then the keyline over both, then the blush, then the face, then the spark. Drawing the keyline
 * after the crust is what stops the crust's straight top edge from showing through it.
 */
export function crumbMascotMarkup(options: CrumbMascotOptions = {}): string {
  const palette = CRUMB_CONSTRUCTIONS[options.construction ?? 'outlined'];
  const clipId = options.clipId ?? 'crumbClip';
  const body = options.color ?? palette.body;
  const mood = options.mood === undefined ? undefined : CRUMB_MOODS[options.mood];
  // Mono has no ink at all, so it has no face even when a mood is named. That is the construction's
  // definition rather than a special case: the silhouette *is* Mono.
  const showFace = mood !== undefined && palette.ink !== null;

  let out = '';

  if (showFace && 'halo' in mood && mood.halo === true) {
    out += `<circle class="crumb-halo" cx="${n(CRUMB_HALO.cx)}" cy="${n(CRUMB_HALO.cy)}" r="${n(CRUMB_HALO.r)}" fill="${body}" opacity="${CRUMB_HALO.opacity}"/>`;
  }

  out += `<path d="${CRUMB_PATH}" fill="${body}"/>`;

  if (palette.crust !== null || palette.shine !== null) {
    out += `<clipPath id="${clipId}"><path d="${CRUMB_PATH}"/></clipPath><g clip-path="url(#${clipId})">`;
    if (palette.crust !== null) out += `<path d="${CRUMB_SHADE_PATH}" fill="${palette.crust}"/>`;
    if (palette.shine !== null) {
      out += `<ellipse cx="${n(CRUMB_SHINE.cx)}" cy="${n(CRUMB_SHINE.cy)}" rx="${n(CRUMB_SHINE.rx)}" ry="${n(CRUMB_SHINE.ry)}" transform="rotate(${CRUMB_SHINE.rotate} ${n(CRUMB_SHINE.cx)} ${n(CRUMB_SHINE.cy)})" fill="${palette.shine}" opacity="${palette.shineOpacity}"/>`;
    }
    out += '</g>';
  }

  if (palette.keyline !== null) {
    const keyline = options.keyline ?? palette.keyline;
    out += `<path d="${CRUMB_PATH}" fill="none" stroke="${keyline}" stroke-width="${n(palette.keylineWidth)}" stroke-linejoin="round"/>`;
  }

  if (showFace) {
    const ink = palette.ink as string;
    if (palette.blush !== null) {
      for (const cheek of CRUMB_CHEEKS) {
        out += `<ellipse cx="${n(cheek.cx)}" cy="${n(cheek.cy)}" rx="${n(cheek.rx)}" ry="${n(cheek.ry)}" fill="${palette.blush}" opacity="${palette.blushOpacity}"/>`;
      }
    }
    out += '<g class="crumb-eyes">';
    for (const eye of CRUMB_EYE_SETS[mood.eyes]) out += feature(eye, ink, palette.featureWidth);
    out += '</g>';
    out += `<g class="crumb-mouth">${feature(CRUMB_MOUTHS[mood.mouth], ink, palette.featureWidth)}</g>`;
    if ('spark' in mood && mood.spark === true) {
      CRUMB_SPARKS.forEach((spark, index) => {
        out += `<path class="crumb-spark crumb-spark-${index + 1}" d="${spark.d}" fill="${ink}"/>`;
      });
    }
  }

  /*
   * **`crumb-all` exists so a whole-body animation has something to transform**, and it wraps the
   * drawing rather than the `<svg>` for a reason worth stating: `transform-origin` on an SVG group
   * resolves in the element's own user space, so `50px 94px` means the bottom of the crumb no
   * matter what CSS box the caller gave the `<svg>`. Animating the `<svg>` instead would put the
   * origin in CSS pixels and a 40px mark and a 168px one would squash about different points.
   *
   * The group is always emitted, including for Mono and for the faceless mark: an unused wrapper
   * costs one element, and a conditional one means the animation classes silently do nothing on
   * exactly the constructions somebody will try them on first.
   */
  return `<g class="crumb-all">${out}</g>`;
}

/** A standalone `<svg>` document — what a data URI, a static file or an `<img>` needs. */
export function crumbMascotSvg(options: CrumbMascotOptions = {}): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crumbMascotViewBox(options.construction)}">` +
    crumbMascotMarkup(options) +
    '</svg>'
  );
}

/** The same document as a `data:` URI, which is the only form satori can put in an `<img>`. */
export function crumbMascotDataUri(options: CrumbMascotOptions = {}): string {
  return `data:image/svg+xml;base64,${Buffer.from(crumbMascotSvg(options)).toString('base64')}`;
}
