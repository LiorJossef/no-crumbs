import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Manrope } from 'next/font/google';
import { cn } from '@/lib/utils';

// Self-hosted via next/font — no runtime request to Google Fonts. The neutral variable sans from
// brand-and-product-foundation.md §5 ("Component stack" row); the two display-face placements are
// a later, separate decision (L1-F1-T2) and are not wired here.
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'P-002',
  description: 'A personal map of the places your feed recommended.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#fafafa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', manrope.variable)}>
      <body>{children}</body>
    </html>
  );
}
