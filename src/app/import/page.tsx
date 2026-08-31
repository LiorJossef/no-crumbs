import { redirect } from 'next/navigation';
import { createClient } from '@/app/_lib/supabase/server';
import { extractPastedUrl } from '@/domain/source/extract-pasted-url';
import { ImportPageClient } from './import-page-client';

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
    // **A share arriving signed-out loses its link.** `?next=` would carry it, but
    // `domain/auth/return-path.ts`'s `safeReturnPath` allow-lists exactly one destination shape
    // today — a collection invite — so anything else is silently dropped to `/map` and passing it
    // would be a promise this codebase does not keep. Widening that allow-list is a domain change
    // and is not this task's to make.
    redirect('/sign-in');
  }

  // Awaited after the auth check, not before it: nothing about the query string should be read on
  // behalf of a visitor who is about to be redirected.
  const shared = sharedImportUrl((await searchParams)[SHARED_URL_PARAM]);

  // Conditional spread rather than `initialUrl={shared ?? undefined}`: `exactOptionalPropertyTypes`
  // is on, so an explicit `undefined` is not the same as an absent optional prop. Same pattern as
  // `map-page-client.tsx`'s import overlay.
  return <ImportPageClient {...(shared === null ? {} : { initialUrl: shared })} />;
}
