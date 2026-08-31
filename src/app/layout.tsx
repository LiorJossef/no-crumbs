import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Fraunces, Manrope } from 'next/font/google';
import { cn } from '@/lib/utils';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { MapCanvasHost } from '@/components/shell/persistent-map';

// Self-hosted via next/font — no runtime request to Google Fonts. Manrope carries both headings
// (--font-heading) and body text (--font-sans) at different weights, per the finalized L1-F1-T2
// tokens.
const manropeHeading = Manrope({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const manropeSans = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

/**
 * The display face, and it is confined on purpose.
 *
 * `brand-and-product-foundation.md` §3.1 (second pass, 2026-08-30) retires Archivo — it and Manrope
 * are both grotesques, so the pairing read as a near-miss rather than as a decision — and sets the
 * wordmark and the large editorial headings in **Fraunces**, a variable display serif. `SOFT` 60
 * and `WONK` on are what give it the slight tilt that keeps it from reading as a bank; they are
 * applied per call site as `fontVariationSettings`, because they are a *setting* of this face
 * rather than a second family.
 *
 * **`--font-display` is a third variable rather than a redefinition of `--font-heading`.** Every
 * `font-heading` call site in the product resolves through that token, and §3.1 splits the two
 * roles explicitly: functional labels — `h3`, `h4`, card titles at 15–17px — **stay Manrope**,
 * because a serif at that size turns to mud. Repointing `--font-heading` would have moved all of
 * them at once. So §5's "Manrope only for UI" survives intact and the serif is confined to the
 * editorial voice. `globals.css` registers the variable in `@theme inline`, which is what makes
 * `font-display` a utility; the `SOFT`/`WONK` axes travel separately, in
 * `components/brand/display-type.ts`.
 *
 * No `font-stretch` axis, on any of the three. Archivo was variable-width and an expanded setting
 * visibly distorted the letterforms across every heading in the first design-system document;
 * §3.1 names that as a shipped bug rather than as a preference.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  // `opsz` rides along because Fraunces is optical-size-aware and the wordmark, the 34px headline
  // and the 64px desktop hero are three different optical sizes of the same word.
  axes: ['SOFT', 'WONK', 'opsz'],
});

export const metadata: Metadata = {
  // Absolute URLs for every link preview in the product resolve against this. Production, per
  // `CLAUDE.md`; the domain is still unverified (`brand-and-product-foundation.md` §3), and a
  // `metadataBase` pointing at a host we do not own would make every preview fetch its image from
  // a stranger. One line to change when a domain lands.
  metadataBase: new URL('https://p-002-zeta.vercel.app'),
  // The name is **decided** — No Crumbs, owner, 2026-08-30, `brand-and-product-foundation.md` §3.
  // This replaces a comment that called it an open decision and shipped the repo codename `P-002`
  // as the product's user-facing name in the tab, in bookmarks and in every link preview.
  //
  // The tagline rides along with the name rather than the title being the bare wordmark. A tab
  // truncates at roughly twenty characters and reads `No Crumbs — your s…`, which is the exit
  // criterion; the tagline is there for the two surfaces that show the whole string and are not
  // tabs, a bookmark and a shared link. §3 prices this name's one real cost — a first-time hearer
  // guesses a recipe app before a map — and rules that the subhead stays literal and is never
  // traded for a cleverer line. A bare `No Crumbs` is that cost paid with nothing beside it.
  //
  // `·` in the template, not `|`: the product already separates with `·` in five places
  // (`Added by you · {date}`, `been · not been yet`, `· +20 more`), and a pipe would be a sixth
  // separator style for one job.
  title: {
    default: 'No Crumbs — your saved places, on one map',
    template: '%s · No Crumbs',
  },
  // The name is deliberately absent here, and this is the one string worth arguing about.
  // `voice-and-vocabulary.md` §2 permits the name on the meta description; it does not require it.
  // The title sits directly above the description in every preview a human ever sees, so repeating
  // the name one line under itself is the substitution §1 bans — the brand word taking the slot the
  // news should have. This is the landing subhead verbatim (`app/page.tsx`, `SUBHEAD`), which also
  // means the landing page and the link preview cannot drift apart.
  description:
    'Paste a TikTok link and the place lands on your map. Organised by where, not by when.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No `maximumScale`/`userScalable`. Pinning the scale at 1 blocked pinch-zoom on every screen
  // in the product, which fails WCAG 1.4.4 — and the usual reason for it (stopping iOS from
  // zooming when a small-font input takes focus) does not apply: every field here is >=14px.
  themeColor: '#FAF9F6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        'font-sans',
        manropeHeading.variable,
        manropeSans.variable,
        fraunces.variable,
      )}
    >
      <head>
        {/*
         * The no-flash script, rendered synchronously before anything paints.
         *
         * The theme class is applied by JavaScript, so without this the first frame of every page
         * load is the light theme — a white flash before a dark screen, on every navigation, for
         * exactly the people who asked for dark. It has to run before the browser paints, which
         * means before React hydrates and before any effect, so it cannot be an effect and cannot
         * import `resolveTheme`. `src/lib/theme.ts` restates the precedence in hand-written JS for
         * that reason, and `tests/unit/ui/theme.test.ts` pins the two against each other by
         * evaluating the string — because if they drift, the page paints one theme before
         * hydration and another after, which gets reported as "dark mode is janky" rather than as
         * a logic bug.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* `suppressHydrationWarning` on `<html>` above: the script mutates `class`, `data-theme`
          and `style.colorScheme` on the root element before React sees it, so the server's markup
          and the client's first read differ by design. */}
      <body>
        <ThemeProvider>
          {children}
          {/* **The one MapLibre instance, mounted above every route so a tab change cannot destroy
              it** (`I3-NAV`). It renders `null` until a route's `MapShell` publishes a surface, and
              it portals into a container it owns rather than into this position — so nothing about
              the document's structure, its paint order or its server payload changes here. The
              measurement that forced it, and the four contexts it has to carry across the seam, are
              in `components/shell/persistent-map.tsx`.

              Inside `ThemeProvider` because the surface's basemap tint reads the resolved theme,
              and after `{children}` because a portal's *content* paints in the order its container
              sits in the document, not in the order the portal is declared. */}
          <MapCanvasHost />
        </ThemeProvider>
      </body>
    </html>
  );
}
