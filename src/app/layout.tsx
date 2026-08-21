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
  title: 'P-002',
  description: 'A personal map of the places your feed recommended.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FAF9F6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', manropeHeading.variable, manropeSans.variable)}>
      <body>{children}</body>
    </html>
  );
}
