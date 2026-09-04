import { CrumbAware } from './crumb-aware';
import { PinMark } from './pin-mark';

/**
 * **The mark on `/` and `/sign-in` — the character, and the one surface where it reacts to you.**
 *
 * ## What this file used to say, and why the correction is recorded rather than swept
 *
 * Until 2026-08-31 this docblock read *"the mascot is a dedicated lane and is not built here"* and
 * *"what renders through here today is `PinMark face`"* — written as a seam waiting for a character
 * that had not arrived. **That character arrived and this file never noticed.** `PinMark face`
 * calls `crumbMascotMarkup({ mood: 'idle', construction: 'outlined' })`; the gold crumb has been on
 * the product's front door for some time.
 *
 * It cost something concrete: the sentence was read as evidence that the two largest brand surfaces
 * in the product were not carrying the mascot, and that was nearly filed as a finding. A comment
 * describing a lane that has since landed does not read as stale — it reads as current, because it
 * is specific, and specificity is what a reader trusts.
 *
 * The same paragraph also said **`--chrome-mark-glow` is mint on paper and indigo at night**. It is
 * neither, in either theme: both are `rgba(224, 168, 69, …)`, the mascot's crust, and
 * `chrome-tokens.test.ts` has been asserting exactly that. Two stale claims in one docblock, one of
 * which contradicted a passing test.
 *
 * ## The contract, which is otherwise unchanged
 *
 *  - **It is a square.** The caller sizes it with `className` and passes nothing else.
 *  - **It carries the face.** Rule 2 is *face on chrome, silhouette on data*, and this is chrome.
 *    `error.tsx` and `not-found.tsx` are on neither list and call `PinMark` directly.
 *  - **The outline is not this lane's to change** (§3.1 rule 1).
 *  - **The halo may grow and brighten; it may not change hue.** Owner ruling, 2026-08-31: alpha and
 *    radius are dominance, hue is identity. `chrome-tokens.test.ts` already implements exactly that
 *    split — it matches the `rgba()` stops' colour triple and its own comment says *"only the alpha
 *    moves, and the alpha is not asserted"*. No guard had to be narrowed for this.
 *
 * ## And it now reacts, which supersedes "it may not animate itself"
 *
 * That clause was about **autonomous** motion — a mascot with its own loop would sit outside the
 * entrance's `MARK_VARIANTS` and outside every closed motion list in the project. It still may not
 * do that. What `CrumbAware` adds is a **response to the user's pointer**, which is not a second
 * animation competing with the entrance: it writes two custom properties and the transform lands on
 * `.crumb-eyes`, a group the entrance never touches. The two cannot fight because they move
 * different elements.
 *
 * `CrumbAware` is the only place on this surface with pointer events, and it is deliberately absent
 * from `/map`, where the equivalent chip must stay `pointer-events-none` for the map to be
 * draggable through it. See its own header.
 */
export function ChromeMark({ className }: { className?: string }) {
  return (
    <CrumbAware>
      {/*
       * `crumb-aware` is what `globals.css` hangs the eye transform off, and `className ?? ''`
       * rather than passing it through: `exactOptionalPropertyTypes` is on and `PinMark`'s prop is
       * `className?: string`, which under that flag does not accept `undefined`.
       */}
      <PinMark face className={`crumb-aware ${className ?? ''}`} />
    </CrumbAware>
  );
}
