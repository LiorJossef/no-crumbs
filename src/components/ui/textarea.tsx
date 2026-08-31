import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Multi-line text, for the one thing in this product that is prose rather than a label.
 *
 * Vendored from shadcn's registry (`new-york-v4`, `registry:ui`), which the repo's ratified rule
 * asks for — *no UI primitive is hand-rolled while a shadcn equivalent exists*. The CLI was not run
 * for it for the same reason as `skeleton.tsx`: this registry item writes one file and touches
 * nothing else, and running a generator against `globals.css` while other agents hold the tree is
 * the worse trade.
 *
 * **Four departures, all of them making it the sibling of `./input.tsx` rather than a second
 * opinion about what a field looks like:**
 *
 *  - `rounded-lg`, not `rounded-md`, and `border-input` on both — the field beside this one is an
 *    `Input`, and two fields in one form must not have two radii.
 *  - `hover:border-ring/60`, which `Input` carries and explains: a field is a target you aim at
 *    before you commit to it, and on a pointer device the border is the only thing that can say so.
 *  - `motion-safe:transition-colors` rather than a bare `transition-[color,box-shadow]`, which is
 *    both the repo's reduced-motion rule and one fewer arbitrary value.
 *  - No `shadow-xs`. Elevation in this system is three named steps and none of them is a field.
 *
 * `field-sizing-content` is kept, and it is the reason this is worth vendoring rather than styling a
 * bare `<textarea>`: the box grows with what is typed, so a 500-character description does not end
 * up in a three-line window with its own scrollbar inside a sheet that already scrolls.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none motion-safe:transition-colors hover:border-ring/60 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
