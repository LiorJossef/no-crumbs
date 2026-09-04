import type { MetadataRoute } from 'next';

import { BRAND_SURFACE } from '@/components/brand/brand-colors';

/**
 * The web app manifest — what the product is called when someone adds it to a home screen.
 *
 * The product had none, so an installed shortcut took its name from the `<title>` and its icon from
 * a screenshot of the page. `voice-and-vocabulary.md` §2 surface 5 permits the name here; both
 * strings below are the copy deck's, verbatim, and neither is written for this file: `No Crumbs` is
 * C103 and the description is C102, the same sentence the meta description and the landing subhead
 * carry.
 *
 * **`short_name` is the same two words, not an abbreviation.** It is what a home screen prints
 * under the icon and it truncates at roughly twelve characters; `No Crumbs` is nine. A shortened
 * form would be a tenth name for the product invented in a file nobody reads.
 *
 * `display: 'standalone'` rather than `fullscreen`: the product is a map with a sheet over it and
 * it needs the status bar, both for the time and because a full-screen web app on iOS has no
 * reliable way back.
 *
 * `background_color` is the splash colour the platform paints *before* the first frame, so it is
 * `--background` and not the mint tile — the first thing a visitor sees should be the surface the
 * app actually opens onto, not a flash of colour that then disappears. It matches the `themeColor`
 * in `app/layout.tsx`'s `viewport` export for the same reason. The literal comes from
 * `components/brand/brand-colors.ts`, which is what keeps the two in step.
 *
 * The icons are the two files next to this one. `icon.svg` is a static asset and is served at its
 * own name; `apple-icon.tsx` is a generated image route, so its URL is **`/apple-icon`, with no
 * extension** — checked against the running server rather than assumed, because the two conventions
 * do not produce the same shape of URL and the wrong one is a manifest that silently references
 * nothing. `purpose: 'maskable'` on the PNG is what stops Android drawing a white plate behind it
 * and then cropping our tile inside it.
 *
 * ## `share_target`, and exactly how little it does
 *
 * **Web Share Target is Chromium-on-Android and Chrome OS only. Safari implements it on no
 * platform, so on iOS and macOS this key does nothing at all** — not once the app is installed to
 * the home screen, not ever. Nobody should read this file and believe an iPhone can share into No
 * Crumbs. An iOS user reaches the same place through a one-time Shortcut that opens
 * `/import?url=<the link>`, which is a thing they have to build for themselves.
 *
 * It also only exists once the PWA is **installed**, and nothing in the product invites that
 * install yet. So this key helps a minority of a minority, and it is here because it is a few
 * lines on top of the seam that does the actual work: `/import?url=…`, which any share mechanism —
 * a Shortcut, a bookmarklet, another app, a link in a message — can hit on any platform.
 *
 * Both fields are aimed at the **same** query parameter, `import/page.tsx`'s `SHARED_URL_PARAM`.
 * Android's share intents put the link in `text` far more often than in `url` — TikTok's own share
 * hands over caption, link and hashtags as one blob of text — and `sharedImportUrl` picks the link
 * out of whichever arrives, then hands it to the ordinary paste path and its host allow-list.
 * `title` is not requested: there is nothing this product would do with it.
 *
 * `method: 'GET'`, which is what makes the target and the seam the same code path. A `POST` target
 * would need a route handler of its own that then redirected here — a second entry point to the
 * import, which is the thing this change exists to stop there being.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'No Crumbs',
    short_name: 'No Crumbs',
    description:
      'Paste a TikTok link and the place lands on your map. Organised by where, not by when.',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_SURFACE,
    theme_color: BRAND_SURFACE,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
    // Chromium-on-Android/ChromeOS only, and only when installed — see the header. The literal
    // `'url'` on both sides is `import/page.tsx`'s `SHARED_URL_PARAM`; it is spelled out rather
    // than imported because importing it would drag that page's Supabase and client-component
    // graph into this metadata route, and `tests/unit/import/shared-url-param.test.ts` is what
    // keeps the two strings equal instead.
    share_target: {
      action: '/import',
      method: 'GET',
      params: { url: 'url', text: 'url' },
    },
  };
}
