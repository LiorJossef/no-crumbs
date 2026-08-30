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
 * The icons are the two files next to this one. Next serves `icon.svg` and `apple-icon.png` from
 * the `app/` metadata conventions; `purpose: 'maskable'` on the PNG is what stops Android drawing
 * a white plate behind it and then cropping our tile inside it.
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
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
