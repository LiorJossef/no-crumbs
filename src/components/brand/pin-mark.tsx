import { CRUMB_PATH, CRUMB_VIEWBOX } from './crumb-path';

/**
 * The mint crumb — the product's mark, on the four surfaces that are chrome rather than data:
 * `/`, `/sign-in`, `error.tsx` and `not-found.tsx`.
 *
 * Extracted from `src/app/sign-in/page.tsx`, where it was first drawn, so those surfaces reuse one
 * mark rather than each drawing their own. **Two surfaces copying an SVG is how a brand drifts**,
 * and that reason is why this file exists at all — it is not weakened by the shape changing, it is
 * the thing that made the shape changeable in one place. The path itself has moved one step further
 * out, to `./crumb-path.ts`, because the map's canvas and the link-preview image route now draw the
 * same outline and neither of them can import a React component.
 *
 * **It was a filled Lucide-style teardrop with a circular aperture until W4-2.** The name landed
 * (`brand-and-product-foundation.md` §3, owner, 2026-08-30) and §3.1 rules the identity mascot-led:
 * the same closed path is the mascot at 168px, the pin at 30px and the favicon at 16px. A teardrop
 * with a hole in it is the Google Maps marker, which every one of the thirty-four products in this
 * category draws and which belongs to nobody.
 *
 * Three things about the treatment, each of them a rule rather than a taste:
 *
 *  - **No face.** §3.1 rule 2 puts the face on chrome and the silhouette on data, and the app icon
 *    and link preview are where it goes. This mark renders at 30px on a phone and the design system
 *    drops the face below 32px — two dot eyes at that size turn to mud. So the wordmark beside it
 *    does the naming and the shape does the rest.
 *  - **No gold.** §3.1 rule 3 refuses toast-gold as a brand colour: it sits a few degrees from the
 *    café category amber, and on this map colour means *what a place is*. Mint is the only brand
 *    colour, gold belongs to the mascot alone, and the two never share a surface — which is why the
 *    mascot appears here in the brand palette rather than in its own. Palette is one of the four
 *    things §3.1 rule 1 lets vary; the outline is not.
 *  - **One flat fill.** The old mark's `--accent` aperture is gone with the teardrop it belonged
 *    to. A teardrop needs the aperture to read as a marker; a crumb does not, and a hole in this
 *    outline reads as a doughnut. `--brand` is the whole palette of this component now.
 *
 * **Measured, and worth knowing before anyone reaches for it small:** at 30px and above the
 * silhouette reads as a soft-cornered crumb; at 16px it reads as a disc. The irregularity is real
 * but subtle — the outline is 89×88 units in a 100 square — and it is the outline §3.1 forbids
 * changing. Below about 24px the mark is carrying colour and position, not shape.
 *
 * The colour is `--brand`, a semantic role rather than a ramp step or a literal, so a token repass
 * — including the dark-mode pass that is still owed — moves the mark with everything else.
 */
export function PinMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${CRUMB_VIEWBOX} ${CRUMB_VIEWBOX}`}
      className={className}
      aria-hidden="true"
    >
      <path d={CRUMB_PATH} fill="var(--brand)" />
    </svg>
  );
}
