'use client';

/**
 * **The mascot notices you.** Owner, 2026-08-31: *"hovering it should make him notice, maybe follow
 * with eyes?"*
 *
 * A wrapper that writes two custom properties as the pointer moves. `globals.css` turns them into a
 * transform on `.crumb-eyes` — the group Scan already animates, so this is the rig's existing
 * geometry driven from a new source rather than a second way to move a face.
 *
 * ## What this deliberately is not
 *
 * **It is not a `useState` per pointer event.** A React state update per `pointermove` is sixty
 * renders a second of a subtree containing an inlined SVG; the eyes would lag the cursor by a frame
 * on a good day and visibly on a bad one. The DOM write is two `style.setProperty` calls on a
 * wrapper, from inside a `requestAnimationFrame`, and the compositor does the rest — no React, no
 * layout, no paint.
 *
 * **It is not a document-level listener.** `pointermove` on `window` is the version of this that
 * ships as a performance bug: on `/map` it would fire through every frame of a map drag, competing
 * with MapLibre for the same main thread. The listeners live on this element's own box, which is
 * `SENSE_INSET` larger than the mark so the character notices you *approaching* rather than only on
 * contact.
 *
 * ## Where it is allowed, and why the map is not on the list
 *
 * **Chrome only** — `/` and `/sign-in`. Not the shell chip on `/map`, and that is a hard
 * consequence rather than a preference: the chip is `pointer-events-none` so the map stays
 * draggable through the corner it occupies, which `shell-wordmark.test.ts` asserts. Sensing a hover
 * requires pointer events, and turning them on would punch a 32px hole in the drag surface of the
 * product's main gesture. The map's mascot gets the idle stir and nothing else.
 *
 * ## Touch
 *
 * `pointerType !== 'mouse'` is ignored outright. A tap fires `pointerenter` and then nothing, so a
 * touch user would get one glance that then froze — a character staring fixedly off to one side,
 * which reads as broken rather than as absent. Doing nothing is the honest degradation, and the
 * idle stir still runs, so a phone still gets a mascot that is alive.
 *
 * ## Reduced motion
 *
 * **No tracking at all**, and the listeners are never attached. WCAG 2.2 SC 2.3.3 covers motion
 * triggered by interaction and requires it be disableable unless essential; a mascot's glance is
 * decorative by definition. `globals.css` carries the same rule in CSS, which is deliberate
 * belt-and-braces — the stylesheet holds if this script never runs, and this holds by not doing the
 * work rather than by hiding its result. The preference is subscribed to, not sampled once, so
 * changing it mid-session takes effect without a reload.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/**
 * How far outside the mark the pointer is noticed, in CSS pixels.
 *
 * Large enough that the character reacts as you approach rather than at the instant of contact —
 * a 44px mark that only responds when the cursor is *on* it reads as a button, not as something
 * aware. Small enough that the sensing box stays inside the lockup and captures no pointer events
 * that belonged to anything else: on both chrome surfaces the mark's neighbours are the wordmark
 * and the glow, neither of which is interactive.
 */
export const SENSE_INSET = 28;

/**
 * Maximum eye travel, in the mascot's own user units — a fraction of the body, so the deflection
 * scales with the mark rather than being a CSS-pixel constant that means different things at 44px
 * and 56px.
 *
 * **These were 2.4 and 1.8 and the eyes did not visibly move.** The arithmetic is why, and it is
 * worth writing down because the numbers *looked* reasonable next to Scan's own `-2.6 … 3.2` sweep:
 * the outlined artboard is 116 units wide, so at a 44px mark one unit is **0.379 CSS px**, and 2.4
 * units is **0.91 px** — sub-pixel, at the smaller of the two chrome sizes. Photographed at the two
 * extremes, the frames were indistinguishable.
 *
 * At 5.0 the same deflection is **1.90 CSS px at 44px** and 2.41 at 56px, which crosses a whole
 * pixel on a 1× display and is unambiguous on a 2×. The vertical is deliberately smaller than the
 * horizontal: the eyes have less room above and below than they do side to side, and a face that
 * tracks vertically as far as it tracks horizontally reads as startled rather than attentive.
 *
 * Scan is not a precedent for the size of *this* value even though it looks like one — it sweeps
 * continuously, so motion carries it, and a static offset has to be legible while standing still.
 */
export const TRAVEL_X = 5;
export const TRAVEL_Y = 3.2;

/** The snap on approach and the drift back. Asymmetric on purpose: one symmetric duration reads as
 *  either twitchy or asleep. The return value is the stylesheet's own default. */
const EASE_NOTICE = '90ms';
const EASE_RETURN = '260ms';

const REDUCE = '(prefers-reduced-motion: reduce)';

export function CrumbAware({ children }: { children: ReactNode }) {
  const host = useRef<HTMLSpanElement | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);

  const write = useCallback(() => {
    frame.current = null;
    const node = host.current;
    const next = pending.current;
    if (node === null || next === null) return;
    node.style.setProperty('--crumb-eye-x', `${next.x.toFixed(2)}px`);
    node.style.setProperty('--crumb-eye-y', `${next.y.toFixed(2)}px`);
  }, []);

  const schedule = useCallback(
    (x: number, y: number) => {
      pending.current = { x, y };
      // Coalesced to one write per frame. `pointermove` can fire well above 60Hz on a high-polling
      // mouse, and every one of those would otherwise be a style write the compositor throws away.
      frame.current ??= requestAnimationFrame(write);
    },
    [write],
  );

  useEffect(() => {
    const node = host.current;
    if (node === null) return;

    const media = window.matchMedia(REDUCE);
    let attached = false;

    const centre = () => {
      node.style.setProperty('--crumb-eye-ease', EASE_RETURN);
      schedule(0, 0);
    };

    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      // The "notice" half of the request: the eyes arrive quickly, then track unhurriedly.
      node.style.setProperty('--crumb-eye-ease', EASE_NOTICE);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const box = node.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      // Normalised to the sensing box's own half-extent, so the deflection reaches full travel at
      // the edge of the box rather than at an arbitrary pixel distance that changes with the mark's
      // size. Clamped because a pointer can be captured outside the box mid-drag.
      const nx = Math.max(-1, Math.min(1, (event.clientX - cx) / (box.width / 2)));
      const ny = Math.max(-1, Math.min(1, (event.clientY - cy) / (box.height / 2)));
      schedule(nx * TRAVEL_X, ny * TRAVEL_Y);
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      centre();
    };

    const attach = () => {
      if (attached) return;
      node.addEventListener('pointerenter', onEnter);
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerleave', onLeave);
      attached = true;
    };

    const detach = () => {
      if (!attached) return;
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      attached = false;
      // Whatever deflection was in flight is released, so switching the preference on mid-glance
      // returns the eyes rather than freezing them off-centre.
      centre();
    };

    const sync = () => (media.matches ? detach() : attach());
    sync();
    media.addEventListener('change', sync);

    return () => {
      media.removeEventListener('change', sync);
      detach();
      // **`frame.current` must be nulled, not merely cancelled**, and this was a real bug rather
      // than a tidiness one. `schedule` coalesces with `frame.current ??= requestAnimationFrame(…)`,
      // so a ref left holding a cancelled id means the condition never fires again and the eyes
      // never move for the rest of the session. `detach()` above calls `centre()`, which schedules
      // a frame — so this teardown *always* left a stale id behind, and React's development
      // double-mount made it happen before the first pointer ever arrived. Found in a browser; no
      // unit test in this repository could have seen it.
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [schedule]);

  return (
    // `inline-flex` and not `block`: this sits inside a lockup beside the wordmark, and a block
    // would break the baseline the two share.
    //
    // The negative margin is what makes the sensing box larger than the mark without changing where
    // the mark sits or how big it is — padding would move it, and a wider element would move the
    // wordmark beside it.
    <span
      ref={host}
      className="relative inline-flex"
      style={{ margin: -SENSE_INSET, padding: SENSE_INSET }}
    >
      {children}
    </span>
  );
}
