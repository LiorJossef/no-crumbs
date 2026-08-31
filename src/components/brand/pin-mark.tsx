import {
  CRUMB_EYES,
  CRUMB_PATH,
  CRUMB_SMILE_PATH,
  CRUMB_SMILE_WIDTH,
  CRUMB_VIEWBOX,
} from './crumb-path';

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
 *  - **The face is opt-in, and where it goes is §3.1 rule 2 rather than a preference.** *Face on
 *    chrome, silhouette on data*, and the surfaces rule 2 names are the app icon, the splash,
 *    **sign-in** and the link preview. `voice-and-vocabulary.md` §2 treats *the landing and sign-in
 *    mark* as one surface, so the landing page inherits it. Those two pass `face`; `error.tsx` and
 *    `not-found.tsx` are on neither list and do not — a mascot grinning at somebody whose screen
 *    just failed is its own defect, and the default here is faceless so that stays the thing you
 *    have to ask for.
 *
 *    **This reverses what this file said until W7-4.** It argued the face out on the grounds that
 *    the design system drops it below 32px and this renders at 30. That threshold is about the
 *    *favicon*, which is 16px, and the argument does not survive the measurement below: at 30px the
 *    outline carries 0.61px of irregularity and two eyes and a mouth carry a face. Rendered at 24,
 *    30, 36, 44 and 64px on the brand wash, at device pixel ratio 3, and looked at — legible at
 *    every one of them, including 24. `--accent` for the features rather than `--brand-tint`:
 *    measured side by side, the near-white is crisper at 24 and 30px.
 *
 *    The map keeps no face and rule 2's second half is absolute about it — thirty-one smiling faces
 *    over a city is a toy, and a pin with eyes cannot carry a category colour. `marker-images.ts`
 *    does not import these constants and a unit test holds it to that.
 *  - **No gold.** §3.1 rule 3 refuses toast-gold as a brand colour: it sits a few degrees from the
 *    café category amber, and on this map colour means *what a place is*. Mint is the only brand
 *    colour, gold belongs to the mascot alone, and the two never share a surface — which is why the
 *    mascot appears here in the brand palette rather than in its own. Palette is one of the four
 *    things §3.1 rule 1 lets vary; the outline is not.
 *  - **Two roles, and no third.** `--brand` is the body and `--accent` is the face. The teardrop's
 *    circular *aperture* is still gone and is not coming back: a teardrop needs one to read as a
 *    marker, a crumb does not, and a hole in this outline reads as a doughnut. What `--accent`
 *    draws now is a face, which is a different thing in the same colour.
 *
 * ## Measured: at the sizes this renders, the silhouette is a circle
 *
 * An earlier version of this comment said the shape "reads as a soft-cornered crumb at 30px and
 * above". **That was wrong**, and it was wrong because it was eyeballed. Rendered at 1000px and
 * measured — the ink centroid, then the radius at each of 720 angles — the outline deviates from a
 * true circle by **4.6% of its radius peak-to-peak**, standard deviation **1.14%**. In the sizes
 * this component is actually used at, that whole irregularity is:
 *
 * | rendered at | peak-to-peak | s.d. |
 * |---|---|---|
 * | 16px | 0.33px | 0.08px |
 * | 30px | 0.61px | 0.15px |
 * | 36px | 0.73px | 0.18px |
 * | 44px | 0.90px | 0.22px |
 * | 168px | 3.43px | 0.85px |
 *
 * **Under one pixel everywhere below about 50px.** So this mark is not a crumb that is hard to
 * make out; it is a disc, and no rendering can make it otherwise. Side by side with a true circle
 * of the same mean radius it is distinguishable at 200px and indistinguishable at 44.
 *
 * This is a property of the outline `brand-and-product-foundation.md` §3.1 ratified, and §3.1
 * rule 1 forbids changing it — *"if they change the outline, the pin is lost"*. It is recorded
 * here rather than worked around because it is the owner's to decide, and because the next person
 * to look at this file will otherwise re-derive it. Rule 1 does allow **face, shading, feet and
 * palette** to vary, and any of those would carry the mark at this size where the outline cannot.
 *
 * The **map pin** is not in the same position: its tail is 30 of its 126 units and is what
 * separates it from a circle and from the teardrop it replaced. The claim §3.1 makes for the pin
 * survives; the claim it makes for the bare silhouette, at chrome sizes, does not.
 *
 * The colour is `--brand`, a semantic role rather than a ramp step or a literal, so a token repass
 * — including the dark-mode pass that is still owed — moves the mark with everything else.
 */
export function PinMark({ className, face = false }: { className?: string; face?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${CRUMB_VIEWBOX} ${CRUMB_VIEWBOX}`}
      className={className}
      aria-hidden="true"
    >
      <path d={CRUMB_PATH} fill="var(--brand)" />
      {face ? (
        <>
          {CRUMB_EYES.map((eye) => (
            <ellipse
              key={eye.cx}
              cx={eye.cx}
              cy={eye.cy}
              rx={eye.rx}
              ry={eye.ry}
              fill="var(--accent)"
            />
          ))}
          {/* A stroke, not a closed shape: a filled mouth reads as a shout. */}
          <path
            d={CRUMB_SMILE_PATH}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={CRUMB_SMILE_WIDTH}
            strokeLinecap="round"
          />
        </>
      ) : null}
    </svg>
  );
}
