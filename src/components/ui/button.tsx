import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { PRESS_BEAT, PRESS_BUTTON, PRESS_CHIP } from "@/lib/interaction"

/**
 * The icon button's two matrix columns that differ from every other button: the chip's press depth
 * (see the `size` block below) and a **30%** disabled step rather than the base's 45%.
 *
 * 30 rather than 45 because a disabled icon button is a glyph and nothing else — no label to carry
 * the meaning, no fill to sit in — so at 45% it still reads as a live control and gets tapped. The
 * matrix sets the two steps apart for exactly that reason, and it lands after `variant` in cva's
 * order, so it wins over the base for any icon-sized button.
 */
const ICON_BUTTON = `disabled:opacity-30 ${PRESS_CHIP}`

const buttonVariants = cva(
  // `disabled:opacity-45`, not 50: the matrix fixes the disabled step at 45% and there is no
  // reason for the button to hold a second number for it.
  //
  // **No un-prefixed `transition-all`.** It used to be here and it was doing exactly one thing:
  // running the hover fade and the press translate for users who had asked for reduced motion,
  // because `PRESS_BEAT`'s `motion-safe:transition` supersedes it for everybody else. Deleting it
  // is W3-3's inversion applied to the button — the un-prefixed state is the reduced case, and the
  // reduced case for a press is the colour arriving at once.
  `group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${PRESS_BEAT}`,
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
        // The matrix's hover for an outline button is "border → mint, tint wash", and it was the
        // one hover in the table that this file answered with a grey. An outlined control's border
        // *is* its affordance, so warming that border is the cheapest true signal it has; the 5%
        // fill is the wash, deliberately far below `default`'s solid mint so the two never read as
        // the same button. `hover:text-foreground` stays — the label darkens with it.
        outline:
          "border-border bg-background hover:border-primary hover:bg-primary/5 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // **The four radius clamps are gone and the sizes are unchanged.** They read
      // `min(var(--radius-md), 10px)` and `min(var(--radius-md), 12px)`, which W0-1 found were
      // rendering *square* because `--radius-md` did not exist; it now does, at `0.875rem`, so the
      // clamps were resolving to exactly 10px and 12px. `--radius-xs` is 10px and `--radius-sm` is
      // 12px, so `rounded-xs`/`rounded-sm` are the same pixels as named steps rather than as
      // arithmetic over a step one size up.
      //
      // Not `rounded-md`, which `ux-overnight-specs.md` §2.0 suggests: that is `--radius-md` in
      // full, 14px, and would restyle these four sizes on the way past — on the very sizes W0-1
      // just repaired. The orchestrator has recorded the spec correction.
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-xs px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-sm px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // `ICON_BUTTON` is the chip's 5% press rather than the filled button's 1.5% — at 24–36px a
        // 1.5% squeeze is under half a pixel and invisible — plus the matrix's 30% disabled step.
        // Both land after `variant` in cva's own order, so an icon-sized `default` button resolves
        // to these rather than to the base's numbers.
        icon: `size-8 ${ICON_BUTTON}`,
        "icon-xs": `size-6 rounded-xs in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3 ${ICON_BUTTON}`,
        "icon-sm": `size-7 rounded-sm in-data-[slot=button-group]:rounded-lg ${ICON_BUTTON}`,
        "icon-lg": `size-9 ${ICON_BUTTON}`,
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
