import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { TINT_BEAT } from "@/lib/interaction"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // `TINT_BEAT` carries the timing: this was a bare `motion-safe:transition-colors`, which
        // named the preference and not the duration, so the border warmed over Tailwind's unnamed
        // 150ms default. `Textarea` reads the same constant.
        //
        // `hover:border-ring/60` is the matrix's "border warms", and it was the one blank cell in
        // row 9: focus and disabled were already right, hover did not exist. An input is a target
        // you aim at before you commit to it, and on a pointer device the border was the only
        // thing that could say so — it said nothing until the caret was already in.
        TINT_BEAT,
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none hover:border-ring/60 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
