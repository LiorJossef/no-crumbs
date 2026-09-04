/**
 * **How long camera mover 6's corrective nudge should take** — `MAP-03`.
 *
 * The duration used to be a flat 320 ms whatever the distance, so a 10-pixel correction animated
 * for exactly as long as a 200-pixel one. That was always disproportionate — a nudge nobody can see
 * should not occupy a third of a second — and it became visible once the desktop place card started
 * waiting for `moveend` before it opened (`at-rest.ts`): the map looked stationary and the card sat
 * out the animation anyway. The owner's report was precise about it — *"when the movement is really
 * close, it takes too much time"*.
 *
 * So the duration ramps with the distance actually panned. Linear rather than eased, because the
 * numbers are small and a curve here would be untestable taste: a floor so the shortest pans still
 * read as motion rather than a jump, a ceiling at the old constant so **nothing is slower than it
 * was**, and a straight line between them reaching the ceiling at roughly the deepest correction
 * this mover has ever had to make (the measured 225 px case in its docblock).
 *
 * `prefers-reduced-motion` needs no branch, and this is checked rather than assumed: `easeTo`
 * overwrites `options.duration` with 0 when the media query is set and `essential` is not passed
 * (`maplibre-gl-dev.mjs:21445`), and `panBy` delegates to it. Whatever this returns, a reduced-motion
 * user gets the inline, same-frame path.
 */

/** The shortest a visible nudge is allowed to take. Below this it stops reading as the map moving
 *  and starts reading as the map having been somewhere else all along. */
export const REVEAL_PAN_MIN_MS = 120;
/** The old flat constant, now the ceiling. Nothing may get slower than it was. */
export const REVEAL_PAN_MAX_MS = 320;
/** The distance at which the ramp reaches the ceiling — the depth of the worst correction this
 *  mover is on record as making (a pin 225 px under the sheet at 375×812), rounded up. */
export const REVEAL_PAN_FULL_PX = 240;

/**
 * The smallest pan worth performing at all.
 *
 * **This is not a "close enough" tolerance, and it must never become one.** The band the pin is
 * revealed into already carries `REVEAL_MARGIN_PX` (24 px) of air between the pin and the chrome,
 * so declining a pan of a few pixels spends a sixth of that margin and leaves the pin *wholly*
 * clear of the chrome — the defect mover 6 exists to fix is untouched. Four pixels is also beneath
 * noticing: a 4 px slide is not a movement anyone perceives, it is a frame of jitter. What it buys
 * is that the place card opens in the same frame instead of waiting out an animation of nothing.
 */
export const REVEAL_MIN_PAN_PX = 4;

/** Whether an overshoot of `dx`, `dy` is large enough to be worth animating. */
export function isRevealPanWorthMaking(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= REVEAL_MIN_PAN_PX;
}

/**
 * Milliseconds for a nudge that moves the map by `dx`, `dy` pixels. Clamped into
 * `[REVEAL_PAN_MIN_MS, REVEAL_PAN_MAX_MS]`, and monotonic in the distance.
 */
export function revealPanDuration(dx: number, dy: number): number {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance >= REVEAL_PAN_FULL_PX) return REVEAL_PAN_MAX_MS;
  const ramp = (distance / REVEAL_PAN_FULL_PX) * (REVEAL_PAN_MAX_MS - REVEAL_PAN_MIN_MS);
  return Math.round(REVEAL_PAN_MIN_MS + ramp);
}
