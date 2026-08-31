import { PinMark } from './pin-mark';

/**
 * **The seam the mascot arrives through.**
 *
 * What renders through here today is `PinMark face`, and what that draws is not this lane's to
 * decide. `no-crumbs-design-system.html` §The mark and §The mascot specify a gold crumb character
 * in five constructions — its four colours are named in that document and, in code, in the mascot
 * lane's own palette module, **deliberately not restated here**: `token-call-sites.test.ts` counts
 * hex literals with a regex over the source and cannot tell a comment from a call site, so quoting
 * four of them in this paragraph would put four colours on that ledger for nothing. §Applications
 * draws the app icon as that character on a mint tile at four sizes, and §The mark names
 * **sign-in** as one of the five surfaces the face belongs on, so this is a screen it is owed.
 *
 * **The mascot is a dedicated lane and is not built here.** This file exists so that when it lands
 * it lands in *one* place: both chrome surfaces render `ChromeStage`, `ChromeStage` renders this,
 * and neither page nor the stage has to change. `pin-mark.tsx`'s own header gives the reason in a
 * sentence — two surfaces copying an SVG is how a brand drifts — and this is that sentence applied
 * one level up, to the *treatment* rather than to the path.
 *
 * ## The contract, so the mascot lane can be written against it rather than around it
 *
 *  - **It is a square.** The caller sizes it with `className` and passes nothing else; it renders at
 *    44px and 56px today and must stay legible at both. `crumb-path.ts` has the measurement that
 *    matters: below about 50px the silhouette is a circle to within a pixel, so at these sizes the
 *    face is the whole of what distinguishes it.
 *  - **It carries the face.** Rule 2 is *face on chrome, silhouette on data*, and this is chrome.
 *    A faceless variant does not belong behind this export — `error.tsx` and `not-found.tsx` are on
 *    neither list and call `PinMark` directly, which is what keeps them off it.
 *  - **The outline is not the lane's to change.** §3.1 rule 1: face, shading, feet and palette may
 *    vary; the closed path may not, or the map pin stops being the same object as the mark.
 *  - **The halo is a parameter, not a fixture.** `--chrome-mark-glow` is mint on paper and indigo at
 *    night, both chosen against a *mint* mark. A gold character on a mint halo is a colour decision
 *    that has not been taken — the owner's ruling reopened gold-on-mint, it did not settle what the
 *    light behind it should be — so the mascot lane should expect to move that token with the
 *    character and should say so rather than inherit it silently.
 *  - **It may not animate itself.** The entrance owns the mark's arrival (`MARK_VARIANTS`, a spring
 *    on `scale` and `rotate`), and it is a transform on the wrapper so `reducedMotion="user"` can
 *    drop it. A mascot with its own internal animation would sit outside that and outside every
 *    closed motion list in the project.
 */
export function ChromeMark({ className }: { className?: string }) {
  // `className ?? ''` rather than passing it through: `exactOptionalPropertyTypes` is on, and
  // `PinMark`'s prop is `className?: string`, which under that flag does not accept `undefined`.
  return <PinMark face className={className ?? ''} />;
}
