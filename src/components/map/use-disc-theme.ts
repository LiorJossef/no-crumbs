'use client';

/**
 * Which theme the summary markers are drawn for.
 *
 * The flag discs are **rasterised bitmaps**, so unlike a CSS-token'd DOM node they cannot follow the
 * theme after they are drawn — the theme has to be an input, and a change in it has to rebuild
 * them. This hook is that input, in one place, so the disc images and the circle/label paint that
 * sits beside them can never be resolved against two different answers.
 *
 * It reads the same signal `country-flag-image.ts`'s own `documentTheme` does, and for now that is
 * a constant for the life of a session: `map-surface.mapcn.tsx` requests CARTO's light style
 * unconditionally, because `brand-and-product-foundation.md` §5 fixes the product as "light only…
 * no dark map". The subscription is here rather than a bare read because the *product* has a dark
 * ramp (an unsigned first pass, `docs/ux-library-at-scale.md` §10), and when it is signed off the
 * markers must follow it without anyone remembering that a bitmap does not.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { DiscTheme } from './country-flag-image';

function read(): DiscTheme {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  const attr = root.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function useDiscTheme(): DiscTheme {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof document === 'undefined') return () => {};
    // Both doors into a theme change: the app writing a class or `data-theme` on `<html>`, and the
    // OS preference moving under a page that has expressed no preference of its own.
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', onChange);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', onChange);
    };
  }, []);

  // The server snapshot is `light` rather than a read: there is no document, and the markers are
  // drawn on the client in an effect either way.
  return useSyncExternalStore(subscribe, read, () => 'light');
}
