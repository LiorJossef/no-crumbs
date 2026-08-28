import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Manrope } from 'next/font/google';
import { cn } from '@/lib/utils';

// Self-hosted via next/font — no runtime request to Google Fonts. Manrope only, no second
// family: it carries both headings (--font-heading) and body text (--font-sans) at different
// weights, per the finalized L1-F1-T2 tokens.
const manropeHeading = Manrope({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const manropeSans = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  // PROVISIONAL, and a one-line change when the name lands. `P-002` is the repo codename and was
  // shipping here as the product's user-facing name — in the browser tab, in a bookmark, and in
  // every link preview. The name is an open owner decision (`mvp-plan.md`, owed at L1-F1-T1), so
  // this is the landing page's own headline instead: descriptive, true, and invents nothing. The
  // other place the name goes is the label beside the mark in `app/page.tsx`.
  title: 'Your saved places, on one map',
  description: 'A personal map of the places your feed recommended.',
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
    <html lang="en" className={cn('font-sans', manropeHeading.variable, manropeSans.variable)}>
      <body>{children}</body>
    </html>
  );
}
