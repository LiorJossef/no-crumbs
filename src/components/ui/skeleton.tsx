import { cn } from '@/lib/utils';

/**
 * A placeholder block, the shape of the thing that has not arrived yet.
 *
 * Vendored from shadcn's registry (`new-york-v4`, `registry:ui`) rather than hand-rolled — the repo
 * ratified *"no UI primitive is hand-rolled while a shadcn equivalent exists"* and this is that
 * equivalent, character for character apart from the two changes below. It is one element with no
 * behaviour, so the CLI was not run for it: `shadcn add skeleton` would have written this file and
 * touched nothing else, and running a generator against `globals.css` while other agents hold the
 * tree is a worse trade than copying eleven lines.
 *
 * **Two deliberate departures, both required by this design system:**
 *
 *  - `bg-card-2`, not shadcn's `bg-accent`. In this palette `--accent` is `--mint-100` (`#F1FBF9`),
 *    a near-white mint that is invisible on the white `--card` every one of these sits on.
 *    `--card-2` (`#F3F1EB`) is the system's actual second surface and is what a placeholder should
 *    be drawn in.
 *  - `motion-safe:animate-pulse`, not a bare `animate-pulse`. The design system carries a closed
 *    list of nine micro-animations and a reduced-motion answer for each; under
 *    `prefers-reduced-motion` this settles into a static block, which still says "content is
 *    coming" without a two-second loop.
 *
 * **It is decorative and must stay that way.** Every instance is `aria-hidden`: a screen-reader
 * user gets nothing from six grey rectangles, and Next's own route announcer already says the new
 * page's title when the real content arrives. Do not give one an `aria-label`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('rounded-md bg-card-2 motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

export { Skeleton };
