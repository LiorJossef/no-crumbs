'use client';

/**
 * **The one reader of the theme, and the only thing that writes it to the document.**
 *
 * `src/lib/theme.ts` holds the logic and says why the reconciliation lives in one place; this is
 * the React seam over it. Three modules used to ask `matchMedia('(prefers-color-scheme: dark)')`
 * for themselves (`components/ui/map.tsx`, `components/map/use-disc-theme.ts`,
 * `components/map/country-flag-image.ts`) and would each have disagreed with an explicit choice the
 * moment one existed — a user on a light device who picks dark would have got a dark interface and
 * three light map surfaces, with nothing to tell them apart from "the map looks wrong".
 *
 * ## Two external stores, not React state — and that is not a style preference
 *
 * The device's colour scheme and the saved choice are both **things that exist outside React and
 * change without asking it**. Written as `useState` + a mount effect, the first version of this
 * file tripped `react-hooks/set-state-in-effect`, and the rule was right: that shape renders once
 * with a value it knows is wrong, then corrects itself, which is a tear on every mount and a real
 * hydration hazard. `useSyncExternalStore` is the primitive for exactly this and it buys three
 * things at once — no setState in an effect, a server snapshot that is honest about the server not
 * having a device, and **cross-tab sync for free**, because the `storage` event is just another
 * source the same subscription already listens to.
 *
 * It also means `useTheme()` works **with or without** `ThemeProvider` mounted. The provider's only
 * remaining job is to own the single write to the document; nothing needs to be wrapped to *read*
 * the theme, which is what keeps this from becoming a second thing every consumer must remember.
 *
 * ## The order on first paint
 *
 * `THEME_INIT_SCRIPT` runs in `<head>` and puts the class on the document **before** the browser
 * paints, so there is no flash and the provider is never the thing that applies the theme first —
 * it re-applies the same answer after hydration. That is why the store reads `localStorage`
 * directly rather than being handed an initial value from the server: the server does not know, and
 * pretending it does is how the flash comes back.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import {
  DEFAULT_PREFERENCE,
  THEME_STORAGE_KEY,
  applyTheme,
  preferenceFromStorage,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from '@/lib/theme';

export interface ThemeState {
  /** What the user asked for, including `'system'`. This is what a settings control binds to. */
  readonly preference: ThemePreference;
  /** What is actually on screen. This is what a renderer asks for — a map style, a canvas bitmap,
   *  an image variant — and it is never `'system'`, because nothing can paint that. */
  readonly theme: Theme;
  readonly setPreference: (preference: ThemePreference) => void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/* -------------------------------------------------------------------------- */
/* The device                                                                  */
/* -------------------------------------------------------------------------- */

function subscribeToDevice(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function deviceSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The server has no device. `false` rather than a guess: the light theme is the signed one, and
 *  the head script has already corrected the document by the time anybody sees a pixel. */
function deviceServerSnapshot(): boolean {
  return false;
}

/* -------------------------------------------------------------------------- */
/* The saved choice                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A cached snapshot, because `useSyncExternalStore` requires `getSnapshot` to be referentially
 * stable between changes — reading `localStorage` on every call returns an equal string but forces
 * React to re-render on every check, and returning a fresh object would loop forever.
 */
let cachedPreference: ThemePreference | null = null;
const preferenceListeners = new Set<() => void>();

function readStoredPreference(): ThemePreference {
  try {
    return preferenceFromStorage(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Site data blocked, or a partitioned iframe: `localStorage` throws rather than returning null.
    // A theme preference is not worth an error boundary.
    return DEFAULT_PREFERENCE;
  }
}

function subscribeToPreference(onChange: () => void): () => void {
  preferenceListeners.add(onChange);
  // `storage` fires in the *other* tabs, which is exactly the case a single-tab implementation
  // gets wrong: change the theme in one tab and the others keep painting the old one until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    cachedPreference = readStoredPreference();
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function preferenceSnapshot(): ThemePreference {
  cachedPreference ??= readStoredPreference();
  return cachedPreference;
}

function preferenceServerSnapshot(): ThemePreference {
  return DEFAULT_PREFERENCE;
}

function writePreference(next: ThemePreference): void {
  cachedPreference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // As above. The choice still applies for this session; it just will not survive a reload.
  }
  for (const listener of preferenceListeners) listener();
}

/* -------------------------------------------------------------------------- */
/* The hooks                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The theme, for anything that paints — and it needs no provider above it.
 *
 * Deliberately not a context read that throws when unwrapped: the consumers are leaf renderers (a
 * map style, a flag bitmap, a category disc), and there is no state here that a provider could
 * usefully scope. Both stores are global because the thing they describe is global: there is one
 * document and one device.
 */
export function useTheme(): ThemeState {
  const systemPrefersDark = useSyncExternalStore(
    subscribeToDevice,
    deviceSnapshot,
    deviceServerSnapshot,
  );
  const preference = useSyncExternalStore(
    subscribeToPreference,
    preferenceSnapshot,
    preferenceServerSnapshot,
  );
  const setPreference = useCallback((next: ThemePreference) => writePreference(next), []);

  return useMemo<ThemeState>(
    () => ({ preference, theme: resolveTheme(preference, systemPrefersDark), setPreference }),
    [preference, systemPrefersDark, setPreference],
  );
}

/** Just the resolved appearance, for the many callers that do not care how it was chosen. */
export function useResolvedTheme(): Theme {
  return useTheme().theme;
}

/**
 * Owns the single write to the document, and nothing else.
 *
 * It renders its children untouched — there is no context and no wrapper element — so mounting it
 * once at the root is the whole integration. Mounting it twice would be harmless but pointless:
 * both copies would compute the same answer and write the same three properties.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  // A DOM write rather than derived state, so it belongs in an effect. Everything that can change
  // the answer — the stored choice, the device under `'system'`, another tab — arrives through the
  // stores above and lands here, in exactly one place.
  //
  // It re-applies what `THEME_INIT_SCRIPT` already wrote before first paint. That is not wasted:
  // the script runs once, and this is what keeps the document correct for the rest of the session.
  useEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  // No wrapper element and no context — mounting it once at the root is the whole integration.
  return <>{children}</>;
}
