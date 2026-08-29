/**
 * The bottom bar's own height, in CSS pixels, excluding the safe-area inset it sits on.
 *
 * **This lives in its own module, without `'use client'`, and that is load-bearing rather than
 * tidiness.** A non-component export of a `'use client'` module is a *client reference* on the
 * server, not a value: importing `BOTTOM_NAV_HEIGHT_PX` from `bottom-nav.tsx` into a Server
 * Component and interpolating it into a template literal produces the string
 * `function() { throw new Error("Attempted to call BOTTOM_NAV_HEIGHT_PX() from the server ...") }`,
 * which makes the surrounding `calc()` invalid and silently resolves the whole declaration to `0`.
 *
 * That is not hypothetical — it shipped for the length of one browser measurement on `/profile`,
 * whose padding is what keeps the sign-out button from resting underneath the bar. Measured: the
 * button sat at y=764 with the bar's top at y=751, visible and untappable, and nothing anywhere
 * threw. Every other importer today is itself a client component, which is why it had not bitten
 * before.
 *
 * It is exported from `bottom-nav.tsx` as well, so those client callers do not have to change and
 * there is still one number. A Server Component must import it from **here**.
 *
 * It is **not** part of the camera budget: the bar sits inside the peek band the camera already
 * yields, so nothing in `query-rect.ts` reads it. What does read it is every surface whose content
 * scrolls under the bar and has to pad itself clear.
 */
export const BOTTOM_NAV_HEIGHT_PX = 68;
