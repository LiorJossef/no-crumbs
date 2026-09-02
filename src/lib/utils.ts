import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * **The seven type sizes this product added to Tailwind's ramp**, named for `tailwind-merge`.
 *
 * `globals.css` defines these as `--text-*` theme tokens, so `text-micro` and friends are real
 * font-size utilities. `tailwind-merge` cannot know that: it decides what a `text-*` class means by
 * looking at the value, and anything that is not a *known* size (`xs`, `sm`, `base`, a bare number,
 * an arbitrary length) is classified as a **text colour**. So `text-micro` and `text-caption` were
 * being filed in the same conflict group as `text-brand` and `text-muted-foreground` — and since
 * the merge keeps the last class in a group, whichever came second silently deleted the first.
 *
 * Measured before this fix, with the stock `twMerge`:
 *
 *     twMerge('text-micro font-semibold leading-4 text-brand')  →  text-micro DROPPED
 *     twMerge('text-caption text-muted-foreground')             →  text-caption DROPPED
 *     twMerge('text-brand text-micro')                          →  text-brand DROPPED
 *
 * The visible symptom was the `Been` badge on a list row rendering at **16px** — inherited, because
 * it had no font-size at all — against the 11px the component asks for, which made a state marker
 * the loudest object on the row. It reached the owner as "the Been on the list of places looks
 * weird", and the class it complained about was in the source the whole time.
 *
 * Only `cn()` call sites were affected. A plain `className="text-micro …"` string never passes
 * through the merge, which is why 224 elements on `/map` render at 11px correctly and the defect
 * looked local rather than systemic.
 *
 * **Adding a `--text-*` token to `globals.css` means adding its name here.** There is no way to
 * derive this list at runtime, and the failure is silent — the class simply vanishes.
 */
const PRODUCT_TEXT_SIZES = [
  "micro",
  "caption",
  "reading",
  "title",
  "display",
  "display-lg",
  "hero",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...PRODUCT_TEXT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
