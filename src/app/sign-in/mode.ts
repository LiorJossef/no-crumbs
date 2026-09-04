/**
 * **Which side of the door a visitor arrives on, and the rule this file exists to hold.**
 *
 * `/sign-in` serves two audiences from one screen and, until this file existed, it assumed one of
 * them: `useState<Mode>('sign-in')`, unconditional. The invite route — the product's *only*
 * acquisition path, since `00-project-charter.md` §1 refuses discovery — sent a first-time visitor
 * here with `?next=`, so the handoff carried **where to go afterwards and not who arrived**. A
 * stranger following a shared collection link read *"Your places are waiting."* under a button that
 * had just told them to *sign in*. Both sentences are false for the one person the product is
 * trying to gain (`product-review-2026-08-31-r1.md` finding 5).
 *
 * **The general shape, which is worth more than this fix:** anywhere one screen routes into a
 * screen that serves two audiences, the router must pass what it already knows. The entry point
 * knew this visitor was a stranger and dropped it at the seam. That is what every seam bug in this
 * product looks like — a destination passed without a state — and the repair is always the same:
 * name the state, carry it, and parse it on arrival rather than assuming a default.
 *
 * ## Why parsing lives here rather than in the component
 *
 * `mode` arrives from a URL, so it is untrusted string-or-array-or-nothing. The component may only
 * ever see one of two values, and a `Mode` that has been through this function is the whole
 * guarantee of that. It is also the reason the sign-in screen could be split into a server page and
 * a client island at all: the parse is pure, so it is testable in a node runner with no DOM, which
 * is the only kind of test this repository's unit suite can run (`vitest.config.ts`).
 */
import { LINK_EXPIRED_NOTICE } from '@/app/auth/_lib/copy';


/** The two sides of the sign-in screen. Nothing else is a mode. */
export type Mode = 'sign-in' | 'sign-up';

/** What a visitor with no hint gets — someone opening the app is far more often returning. */
export const DEFAULT_MODE: Mode = 'sign-in';

/**
 * `?mode=` → a `Mode`. Anything that is not exactly `sign-up` is the default, silently: a mode hint
 * is not something a person typed, so there is nothing to tell them about one that made no sense.
 *
 * Repeated params (`?mode=a&mode=b`) arrive as an array — Next's `searchParams` shape — and the
 * first one wins rather than the whole value being discarded, so a duplicated param degrades to the
 * ordinary case instead of to the default.
 */
export function signInModeFromParam(raw: string | string[] | undefined): Mode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'sign-up' ? 'sign-up' : DEFAULT_MODE;
}

/**
 * The one thing an email link can tell this screen: the link it came from is no longer good.
 *
 * `/auth/callback` sends a failed **confirmation** link here (a failed *recovery* link goes to
 * `/auth/reset`, which can offer a new one on the spot). It is a fact and it stops there: this
 * product has no resend control, and a string promising one would be the first lie on the screen.
 * The sign-in form underneath is the next move, and `email_not_confirmed` already has copy of its
 * own for the case where they try it and are not confirmed yet.
 *
 * Anything other than the one known state is `null`. A `?state=` nobody set is not a message.
 *
 * The sentence itself lives in `auth/_lib/copy.ts` with the rest of the flow's strings: the reset
 * screen renders the identical line for a dead *recovery* link, and one string in two files is how
 * a copy pass fixes half of a surface.
 */
export function signInNotice(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'expired' ? LINK_EXPIRED_NOTICE : null;
}
