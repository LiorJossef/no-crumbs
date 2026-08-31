import { crumbMascotMarkup, crumbMascotViewBox } from './crumb-mascot-markup';
import { MASCOT_KEYLINE_VAR } from './mascot-colors';

/**
 * The product's mark, on the surfaces that are chrome rather than data: `/`, `/sign-in`,
 * `error.tsx`, `not-found.tsx`, the map shell header and the collection-invite screen.
 *
 * Extracted from `src/app/sign-in/page.tsx`, where it was first drawn, so those surfaces reuse one
 * mark rather than each drawing their own. **Two surfaces copying an SVG is how a brand drifts.**
 * The geometry moved one step further out, to `./crumb-path.ts`, when the map's canvas and the
 * link-preview image route began drawing the same outline and neither could import a React
 * component; the *drawing* moved out to `./crumb-mascot-markup.ts` for the same reason one step
 * later, because the outline was never the part that drifted — the face and the palette were.
 *
 * ## Two treatments, and which is which is `#rules` rule 1
 *
 * **Faceless — the Mono construction, in `var(--brand)`.** The silhouette, one colour, no keyline,
 * no features. This is the default and it is what the map shell header, the error screens and the
 * invite screen get. *Face on chrome, silhouette on data*, and a header sitting on top of a live
 * map is close enough to data that rule 5 — *gold stays off the map* — decides it.
 *
 * **`face` — the character, Outlined, in the Idle mood.** Gold body, crust, dark keyline, blush,
 * two dot eyes and a smile. `#moods` binds Idle to *"header, app icon, resting"*, and the surfaces
 * §3.1 rule 2 names for the face are the app icon, the splash, sign-in and the link preview;
 * `voice-and-vocabulary.md` §2 treats *the landing and sign-in mark* as one surface, so the landing
 * page inherits it. `chrome-mark.tsx` is the seam both pages reach it through.
 *
 * ### This reverses what this file said, and the reversal is the point of iteration 2
 *
 * Until now the faced mark was **the mint silhouette with two mint dot eyes** — a mint disc with a
 * face. The argument written here was §3.1 rule 3: *mint is the only brand colour, gold belongs to
 * the mascot alone, and the two never share a surface*, therefore the mascot appears in the brand
 * palette. **The argument was sound and the premise was wrong.** It was taken from the markdown
 * companions; `docs/no-crumbs-design-system.html`, which is the drawing, specifies a **gold crumb
 * character** — `MASCOT_GOLD` body, `MASCOT_CRUST` underside, `MASCOT_INK` keyline, `MASCOT_BLUSH`
 * at 50%, all four in `./mascot-colors.ts` — and draws it on mint tiles in `#apps` at four sizes.
 * Nobody had opened it. The team lead's ruling against gold-on-mint was withdrawn on 2026-08-31
 * once it was.
 *
 * **Those four are named rather than quoted, and the reason is not only the `K12` hex ceiling.** A
 * value pasted into a doc comment does not move when the palette does, and this file has proved
 * that on itself twice: its own previous docblock asserted the silhouette *"reads as a soft-cornered
 * crumb at 30px and above"*, which measurement showed to be false, and W0-2 retuned a category
 * value the same night a comment quoted it. A constant name stays true across a retune; a hex is a
 * snapshot that looks like a fact. The exception is a **historical** value — `palette.ts` quotes
 * superseded hexes on purpose, because naming what a colour *was* is the one citation that must
 * never move.
 *
 * Rule 3 is kept where it actually bites, which is rule 5: gold is not a UI colour, it never paints
 * a control, and it never goes on the map. `mascot-colors.ts` carries it, `brand-colors.ts` still
 * carries no warm colour at all, and a unit test still asserts that.
 *
 * ## Measured: at the sizes this renders faceless, the silhouette is a circle
 *
 * Rendered at 1000px and measured — the ink centroid, then the radius at each of 720 angles — the
 * outline deviates from a true circle by **4.6% of its radius peak-to-peak**, standard deviation
 * **1.14%**. At 16px that is 0.33px; at 30px, 0.61px; at 44px, 0.90px. **Under one pixel everywhere
 * below about 50px**, so the bare silhouette at chrome size is a disc and no rendering makes it
 * otherwise.
 *
 * That measurement is why the face matters more than it looks like it does, and it is the
 * strongest single argument for having opened the drawing: rule 1 forbids changing the outline and
 * explicitly allows **face, shading, feet and palette** to vary, and at chrome sizes those are the
 * only things carrying the mark. A gold body with a crust and a keyline is distinguishable at 30px
 * where a mint disc is not.
 *
 * The **map pin** is not in the same position: its tail is 30 of its 126 units and is what
 * separates it from a circle and from the teardrop it replaced.
 *
 * **Amended 2026-08-31: `error.tsx` no longer calls this.** The note above said the failure screens
 * *"are on neither list and call `PinMark` directly, which is what keeps them off it"* — correct
 * about §3.1 rule 2's face surfaces, and correct while the only face on offer was `idle`, which
 * would have put a resting mark on a screen that is not resting. `#moods` binds **`offline`** to
 * *"connection lost, retryable error"*, and the error boundary is exactly that, so it now draws
 * `CrumbMascot` in that mood. `global-error.tsx` follows it, inline.
 *
 * **`not-found.tsx` still calls this and still gets the silhouette.** A 404 is not an error the
 * product had, no mood is bound to it, and a face there would assert a failure that did not
 * happen. The two failure screens differing is the point rather than drift: the face marks *the
 * product having a problem*, and a missing URL is not one.
 */
export function PinMark({ className, face = false }: { className?: string; face?: boolean }) {
  const construction = face ? 'outlined' : 'mono';
  return (
    <svg
      viewBox={crumbMascotViewBox(construction)}
      className={className}
      aria-hidden="true"
      data-mark={face ? 'mascot' : 'silhouette'}
      dangerouslySetInnerHTML={{
        __html: face
          ? // The keyline follows the theme on a DOM surface; see `MASCOT_KEYLINE_VAR`.
            crumbMascotMarkup({ mood: 'idle', construction: 'outlined', keyline: MASCOT_KEYLINE_VAR })
          : // Mono takes `currentColor`; the mark's colour is `--brand`, a semantic role rather
            // than a ramp step, so a token repass moves it with everything else.
            crumbMascotMarkup({ construction: 'mono', color: 'var(--brand)' }),
      }}
    />
  );
}
