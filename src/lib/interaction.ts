/**
 * **Press feedback, as three strings rather than as a property of ninety call sites.**
 *
 * `facelift-plan.md` §3a's state matrix owes every interactive element six columns, and *press* is
 * the one this product was missing entirely: three uses of `active:` in the whole codebase, against
 * ninety-seven of `focus-visible:`. So it acknowledged a keyboard well and a finger almost never —
 * which is backwards for a product designed for a phone first.
 *
 * Kept in one module of its own — not on the button — so that "every pressable thing acknowledges
 * within one frame" is checkable by reading four constants instead of grepping every class string
 * in `src/`, and so that a chip and a list row do not import their press from a component they
 * have nothing else to do with. The three shapes are the matrix's three rows: a button, a list
 * row and a chip.
 *
 * No React and no JSX: these are class strings, which is what lets `src/lib/` hold them beside
 * `cn` rather than the `ui/` layer having to own a component nobody renders.
 *
 * ## Two things about the way this is written
 *
 * **`motion-safe:`, not `motion-reduce:`.** The un-prefixed state *is* the reduced-motion case, so
 * an author cannot forget to write one (§3a rule 4). Under `prefers-reduced-motion` a press is
 * therefore the colour change the element already had, plus — on a `<Button>` — the 1px translate
 * and the shadow drop, both of which land instantly rather than animating. §3a's "all nine collapse
 * to the opacity change alone, not to nothing" is what that serves: the press still registers.
 *
 * **`transition`, not `transition-transform`.** The elements these strings are appended to already
 * carry a colour transition, and `motion-safe:transition-transform` would *replace* it for every
 * pointer user — a hover fade that silently stops fading is a worse regression than the press is a
 * gain. `transition`'s property list carries colour and transform together, so one declaration
 * covers both and there is one duration.
 *
 * **`scale-98`/`scale-99` rather than the matrix's `scale-[.985]`/`scale-[.995]`.** Bare numeric
 * scales compile under the installed Tailwind 4.3.3 (verified against the real `globals.css` with
 * the same `compile()` `tests/unit/ui/design-tokens.test.ts` runs), and run rule 6a makes a bracket
 * a review failure. The half-percent difference is not visible at 90ms; a registered utility is.
 */
/** The shared beat every press rides: one transition, one duration, one easing. Exported because
 *  `button.tsx`'s cva base takes it without a scale — `ghost`, `outline` and `secondary` press with
 *  the base's `translate-y-px` alone, per the matrix. */
export const PRESS_BEAT =
  "motion-safe:transition motion-safe:duration-press motion-safe:ease-standard"

/** A filled button. The matrix's `scale-[.985]`, paired with the shadow dropping a level. Applied
 *  by `buttonVariants` in `components/ui/button.tsx`; exported for a filled control that cannot be
 *  a `<Button>`. */
export const PRESS_BUTTON = `${PRESS_BEAT} motion-safe:active:scale-98`

/** A list row. Shallower than a button — the matrix's `scale-[.995]` — because a full-width row
 *  scaling as hard as an 80px button reads as the whole list moving. */
export const PRESS_ROW = `${PRESS_BEAT} motion-safe:active:scale-99`

/** A chip, and an icon button: small targets, so the same 5% that would be violent on a row is
 *  what makes a 32px pill visibly respond. */
export const PRESS_CHIP = `${PRESS_BEAT} motion-safe:active:scale-95`
