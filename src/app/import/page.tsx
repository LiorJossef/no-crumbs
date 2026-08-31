import { redirect } from 'next/navigation';
import { createClient } from '@/app/_lib/supabase/server';
import { SIGN_IN_PATH } from '@/app/auth/_lib/routes';
import { DEFAULT_AFTER_SIGN_IN, safeReturnPath } from '@/domain/auth/return-path';
import { extractPastedUrl } from '@/domain/source/extract-pasted-url';
import { ImportPageClient } from './import-page-client';

/** This route's own path, spelled once — it is both where we are and where we ask to come back to. */
const IMPORT_PATH = '/import';

/**
 * The one parameter this route reads, spelled once.
 *
 * `manifest.ts`'s `share_target` aims **every** field it receives at this name, and
 * `tests/unit/import/shared-url-param.test.ts` asserts the two still agree — a share target whose
 * `action` and `params` drift from the page that serves them fails silently, on a platform nobody
 * developing this runs.
 */
export const SHARED_URL_PARAM = 'url';

/**
 * The link `/import` was opened with, or `null`.
 *
 * ## Why this exists
 *
 * Everything else in this product is addressable — `/map?place=<id>` reveals a place,
 * `/collections/join/<token>` opens an invite — and the one action the product exists for could
 * only be reached by a human typing into a field. That is why the product ships an instruction
 * (`COPY_LINK_INSTRUCTION`, *"Copy the link in TikTok — Share → Copy link."*), which
 * `brand-and-product-foundation.md` §7 calls the only instruction in it. `?url=` is the seam that
 * makes the instruction optional: a Shortcut, a bookmarklet, an Android share target or anything
 * later can hand this route a link and the import runs exactly as if it had been pasted.
 *
 * ## What it is not
 *
 * **It is not a validation path, and it must never become one.** `canonicalise-tiktok-url.ts` is
 * the SSRF boundary — a closed host allow-list by equality — and a link arriving in a query string
 * is exactly as untrusted as one arriving on the clipboard. Whatever comes out of here is handed
 * to `ImportPageClient` as `initialUrl`, and `useImportRun.submit` puts it through
 * `canonicaliseTikTokUrl` before anything is fetched, identically to a paste. This function only
 * chooses **which string** to hand over.
 *
 * So it deliberately hands over strings it can see are not TikTok links:
 *
 *  - an Instagram or YouTube link becomes `UNSUPPORTED_HOST`, which the product treats as a
 *    recognised redirect to manual add rather than a failure;
 *  - `javascript:…`, `tiktok.com.evil.test`, or a sentence with no link in it become
 *    `MALFORMED_URL` / `UNSUPPORTED_HOST` against **the text that actually arrived**.
 *
 * Filtering them out here would land a share on an empty paste screen with no explanation, which
 * is the blank-screen failure this seam is most likely to produce and the one thing it must not.
 *
 * ## The two shapes it has to absorb
 *
 * `extractPastedUrl` runs because a share is not a bare URL: Android hands over the caption, the
 * link and a pile of hashtags in one field, which is the same blob TikTok's *Copy link* puts on
 * the clipboard and which `paste-screen.tsx` already narrows on paste. Same function, same
 * behaviour, so a shared link and a pasted one cannot disagree.
 *
 * The value can be an **array**, because `share_target` maps two different fields (`url` and
 * `text`) onto this one name and Chromium sends both when it has both. The rule is *the first
 * value that actually contains a link*, falling back to the first non-empty one — a choice between
 * values the browser supplied, never a judgement about hosts, which belongs to the allow-list.
 */
export function sharedImportUrl(raw: string | string[] | undefined): string | null {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const candidates = values.map(extractPastedUrl).filter((value) => value.length > 0);
  if (candidates.length === 0) return null;
  return candidates.find((value) => /^https?:\/\//iu.test(value)) ?? (candidates[0] as string);
}

/**
 * Where a signed-out arrival is sent, **carrying whatever it arrived with**.
 *
 * ## What this used to do, and why that was the wrong end of the trade
 *
 * It was `redirect('/sign-in')`, under a comment admitting the link was lost. The reasoning was
 * sound at the time — `safeReturnPath` allow-listed one destination, and passing a `next` it would
 * silently drop is a promise the codebase does not keep — but the cost lands on the seam's most
 * likely first use: a share fires the product from nothing, so it arrives at a cold session far
 * more often than a normal visit does, and the user is handed back the eight-step copy-paste the
 * share target exists to remove, at the moment they are trying the product for the first time.
 *
 * `safeReturnPath` now allow-lists `/import` with `url`, so the `next` is one it will honour.
 *
 * ## The one property that makes it safe to build a URL here
 *
 * **This function decides nothing.** It re-serialises the `url` values it was handed onto
 * `/import` and hands the result to `safeReturnPath`, which is the single decider of what a return
 * path may be; if it refuses — an over-long share blob is the realistic way — we ask for no `next`
 * at all and the visitor lands on the map, which is what happens today. So this route cannot
 * promise a destination sign-in will not honour, and it cannot become a second opinion about what
 * a TikTok link is: the value is opaque here, and `sharedImportUrl` and `canonicaliseTikTokUrl`
 * judge it on the way back exactly as they judge it on the way in.
 *
 * Values are `append`ed rather than `set`, so a Chromium share that sent both `url` and `text`
 * comes back with both and `sharedImportUrl` picks between them on arrival, as it would have.
 *
 * ## Why the return type is a template literal and not `string`
 *
 * `typedRoutes` is on, so `redirect()` takes a route the router can prove exists, and a `string`
 * assembled at runtime is exactly the shape that fails it. The documented escape is `as Route`
 * (`node_modules/next/dist/docs/…/05-config/02-typescript.md`, *"For non-literal strings, you need
 * to manually cast with `as Route`"*) — and it is not needed here, which is better than using it.
 *
 * Next's generated `RouteImpl` (`.next/dev/types/link.d.ts`) is a union that already contains
 * `` `${StaticRoutes}${SearchOrHash}` ``, so **`/sign-in` followed by any query string is a valid
 * route type on its own**. Declaring that shape instead of `string` keeps the check switched on
 * rather than casting it away: if `/sign-in` is ever renamed or deleted it leaves `StaticRoutes`,
 * this type stops being assignable, and the build fails — which is the whole point of the feature
 * and the thing a cast would have silenced. The query string was never something typed routes
 * validated, so nothing is lost.
 *
 * Note for anyone copying this: the repo's older idiom is `as '/map'`
 * (`collections/page.tsx:38`, `bottom-nav.tsx`, `sign-in-client.tsx`). That asserts a specific
 * literal the value is *not* — it always carries a query string — so it is strictly weaker than
 * both this and `as Route`.
 */
export function signedOutDestination(
  raw: string | string[] | undefined,
): typeof SIGN_IN_PATH | `${typeof SIGN_IN_PATH}?${string}` {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const carried = new URLSearchParams();
  for (const value of values) carried.append(SHARED_URL_PARAM, value);

  const query = carried.toString();
  const back = safeReturnPath(query.length === 0 ? IMPORT_PATH : `${IMPORT_PATH}?${query}`);
  if (back === DEFAULT_AFTER_SIGN_IN) return SIGN_IN_PATH;

  return `${SIGN_IN_PATH}?${new URLSearchParams({ next: back }).toString()}`;
}

// S6, `docs/ux-architecture.md` §12.1 / `docs/mvp-plan.md` §5 (L0-F1-T1/T2/T3) /
// `docs/execution-plan.md` L1-F2-T1/T2. Same belt-and-suspenders auth check as `/map`
// (`src/app/map/page.tsx`): the middleware already redirects an unauthenticated visitor, but every
// page that renders user-scoped UI still calls `getUser()` itself.
//
// The client component owns every visual state. There was never a dev-only stepper to walk through
// them, and "UI-only, no real `POST /api/imports` call" stopped being true when the probe route
// shipped: `submit()` runs a real oEmbed fetch, a real caption extraction, a real `PlaceExtractor`
// call and a real `PlaceResolver` pass. What replaced the stepper on 2026-08-31 is a
// **development-only** URL seam — `/import?state=review|no-places|rail|error-<CODE>` — that exists
// so the quality gates can photograph the screens an import otherwise only reaches by spending a
// model call. It is folded out of a production build entirely; `_lib/dev-screen.ts` says how, and
// `tests/unit/import/dev-screen.test.ts` asserts it.
//
// `?url=` is the other seam and it is the opposite kind: production, user-facing, and the whole
// point of the route (see `sharedImportUrl` above).
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // **A share arriving signed-out keeps its link.** `signedOutDestination` puts it in a `?next=`
    // that `safeReturnPath` has already agreed to honour — see its header for why building a URL
    // here is safe, and `domain/auth/return-path.ts` for the allow-list that is the actual gate.
    // No cast: `signedOutDestination` returns a template literal type that `typedRoutes` accepts
    // on its own, so `/sign-in` is still checked against the real route table. See its header.
    redirect(signedOutDestination((await searchParams)[SHARED_URL_PARAM]));
  }

  // Awaited after the auth check, not before it. The query string is read on a signed-out
  // visitor's behalf in exactly one way — to hand it back to them after they sign in — and never
  // to decide anything about a request that is about to be redirected.
  const shared = sharedImportUrl((await searchParams)[SHARED_URL_PARAM]);

  // Conditional spread rather than `initialUrl={shared ?? undefined}`: `exactOptionalPropertyTypes`
  // is on, so an explicit `undefined` is not the same as an absent optional prop. Same pattern as
  // `map-page-client.tsx`'s import overlay.
  return <ImportPageClient {...(shared === null ? {} : { initialUrl: shared })} />;
}
