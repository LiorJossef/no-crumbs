import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * **Press feedback, as three strings rather than as a property of ninety call sites.**
 *
 * `facelift-plan.md` §3a's state matrix owes every interactive element six columns, and *press* is
 * the one this product was missing entirely: three uses of `active:` in the whole codebase, against
 * ninety-seven of `focus-visible:`. So it acknowledged a keyboard well and a finger almost never —
 * which is backwards for a product designed for a phone first.
 *
 * Kept here, beside the button's own variants, so "every pressable thing acknowledges within one
 * frame" is checkable by reading four constants instead of grepping every class string in `src/`.
 * The three shapes are the matrix's three rows: a button, a list row and a chip.
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
const PRESS_BEAT =
  "motion-safe:transition motion-safe:duration-press motion-safe:ease-standard"

/** A filled button. The matrix's `scale-[.985]`, paired with the shadow dropping a level. Applied
 *  by `buttonVariants` below; exported for a filled control that cannot be a `<Button>`. */
export const PRESS_BUTTON = `${PRESS_BEAT} motion-safe:active:scale-98`

/** A list row. Shallower than a button — the matrix's `scale-[.995]` — because a full-width row
 *  scaling as hard as an 80px button reads as the whole list moving. */
export const PRESS_ROW = `${PRESS_BEAT} motion-safe:active:scale-99`

/** A chip, and an icon button: small targets, so the same 5% that would be violent on a row is
 *  what makes a 32px pill visibly respond. */
export const PRESS_CHIP = `${PRESS_BEAT} motion-safe:active:scale-95`

const buttonVariants = cva(
  // `disabled:opacity-45`, not 50: the matrix fixes the disabled step at 45% and there is no
  // reason for the button to hold a second number for it.
  `group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${PRESS_BEAT}`,
  {
    variants: {
      variant: {
        // The only variant that scales, per the matrix: a filled button is the one that reads as a
        // physical thing, so it is the one that can be pushed. `shadow-raised` is its resting
        // elevation and exists so `active:shadow-none` has a level to drop from — a press that
        // only shrinks reads as a rendering glitch; a press that shrinks *and* settles reads as a
        // press. The two are one beat: the base's `translate-y-px` rides the same transition and
        // there is deliberately no second duration.
        default: `bg-primary text-primary-foreground shadow-raised hover:bg-primary/80 active:shadow-none ${PRESS_BUTTON}`,
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // An icon button takes the chip's 5% rather than the filled button's 1.5%: at 24–36px a
        // 1.5% squeeze is under half a pixel and invisible. It lands after `variant` in cva's own
        // order, so an icon-sized `default` button resolves to this one — either is a true press.
        icon: `size-8 ${PRESS_CHIP}`,
        "icon-xs": `size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3 ${PRESS_CHIP}`,
        "icon-sm": `size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg ${PRESS_CHIP}`,
        "icon-lg": `size-9 ${PRESS_CHIP}`,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
