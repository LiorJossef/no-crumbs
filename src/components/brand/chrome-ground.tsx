'use client';

import { MotionConfig, motion } from 'motion/react';

import { BLOOM_DRIFT } from './chrome-motion';

/**
 * **The atmosphere the two chrome surfaces stand on** — `/sign-in` and `/`, which are one step
 * apart in the demo path and have to read as one product.
 *
 * It replaces `--brand-wash`'s three mint radials on those two screens with the indigo-biased mesh
 * ruled in `iteration-2-plan.md` §2.2. `--brand-wash` itself is untouched and still paints
 * `error.tsx`, `not-found.tsx` and the collection-join screen: those are not surfaces anybody is
 * asked to admire, and giving a failure screen a gradient mesh and a drifting light field would be
 * the mascot-grinning-at-a-crash defect in a different medium.
 *
 * ## Three layers, and each of them is a token
 *
 * 1. **The mesh** — four corner radials over `--background`, themed. Static: it is the room, and a
 *    room does not move.
 * 2. **Two blooms** — the same pigments as free-floating discs, drifting on a 24 s mirror. This is
 *    the only thing on either screen that is still moving after the entrance ends, and it is
 *    `transform` on two elements whose paint is one radial gradient each, so a frame costs a
 *    composite and no repaint. Off entirely under `prefers-reduced-motion`.
 * 3. **Grain** — one 160×160 `feTurbulence` tile at `mix-blend-mode: overlay`. It is what stops a
 *    four-radial gradient reading as a banded backdrop on an 8-bit panel, and it is 1.2 kB in a
 *    custom property rather than an image request.
 *
 * `aria-hidden` and `pointer-events-none` throughout: none of it is content and none of it may
 * ever intercept a tap meant for the form behind it.
 *
 * `reducedMotion="user"` rather than a `useReducedMotion()` branch — the drift is `x`/`y`/`scale`,
 * so the preference stops it outright and leaves the fade in place. See `chrome-motion.ts` for the
 * two ways the branch was wrong, one of which only appeared in a reduced-motion console.
 *
 * **Geometry is inline `style` rather than `w-[70vmax]`.** These four numbers are viewport-relative
 * sizes on a decorative element, not design tokens, and writing them as arbitrary Tailwind values
 * would put four brackets on the ledger `token-call-sites.test.ts` keeps for the opposite kind of
 * bracket — the ones that bypass the token layer to say a *colour*. Every colour here is a `var()`.
 */
export function ChromeGround() {
  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ background: 'var(--chrome-mesh)' }}
      >
        <motion.div
          data-entrance
          className="absolute rounded-full"
          style={{
            background: 'var(--chrome-bloom-a)',
            width: '78vmax',
            height: '78vmax',
            left: '-26vmax',
            top: '-30vmax',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{
            opacity: 1,
            scale: [0.94, 1.06],
            x: ['-2vmax', '4vmax'],
            y: ['0vmax', '5vmax'],
          }}
          transition={{
            opacity: { duration: 0.6 },
            scale: BLOOM_DRIFT,
            x: BLOOM_DRIFT,
            y: BLOOM_DRIFT,
          }}
        />
        <motion.div
          data-entrance
          className="absolute rounded-full"
          style={{
            background: 'var(--chrome-bloom-b)',
            width: '68vmax',
            height: '68vmax',
            right: '-22vmax',
            bottom: '-26vmax',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{
            opacity: 1,
            scale: [1.05, 0.95],
            x: ['2vmax', '-4vmax'],
            y: ['1vmax', '-4vmax'],
          }}
          transition={{
            opacity: { duration: 0.6, delay: 0.08 },
            scale: BLOOM_DRIFT,
            x: BLOOM_DRIFT,
            y: BLOOM_DRIFT,
          }}
        />
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{
            backgroundImage: 'var(--chrome-grain)',
            opacity: 'var(--chrome-grain-strength)',
          }}
        />
      </div>
    </MotionConfig>
  );
}
