/**
 * The four paths the email round trip is made of, named once.
 *
 * Two of them are written into a URL that leaves the product — an absolute link inside an email —
 * and come back hours later, possibly on a different day. A literal that appears in three files and
 * in a stranger's inbox is the kind that gets renamed in two of them.
 *
 * `typedRoutes` is on (`next.config.ts`), so a `Route`-typed prop rejects a path that is not a real
 * route at build time. These constants are plain strings on purpose: they are also used to build an
 * absolute `URL` and to compare against `NextRequest` paths, where a route type means nothing. Where
 * one is handed to `<Link>` the cast is at the call site, which is where the compiler can see it.
 */

/** Where every email link lands. One route for both flows — see its own header for why that is not
 *  a coincidence but the reason the two halves of finding 3 were one change. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Ask for a recovery link. Also where a recovery link that has expired sends you, because this is
 *  the one screen that can hand out a new one. */
export const RESET_REQUEST_PATH = '/auth/reset';

/** Set the new password. Reachable only with a session, which the callback is what creates. */
export const NEW_PASSWORD_PATH = '/auth/new-password';

/** The door. A confirmation link that no longer works ends here with `?state=expired`. */
export const SIGN_IN_PATH = '/sign-in';
