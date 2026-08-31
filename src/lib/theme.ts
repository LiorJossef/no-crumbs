/**
 * **The one answer to "is it night?" — the whole of it, with no React in it.**
 *
 * Before this file, three modules asked that question independently and each answered it in its
 * own words: `components/ui/map.tsx`, `components/map/use-disc-theme.ts` and
 * `components/map/country-flag-image.ts` all read `matchMedia('(prefers-color-scheme: dark)')`
 * themselves. Three readers is not a duplication problem, it is a *correctness* problem the moment
 * a class strategy exists: a user who chooses dark on a device set to light gets a dark interface
 * and three light map surfaces, because `prefers-color-scheme` never changed and nothing told them.
 * `resolveTheme` below is the reconciliation, in one place, in the order that makes an explicit
 * choice win.
 *
 * ## Three values, not two
 *
 * `ThemePreference` is `'light' | 'dark' | 'system'` and `Theme` is `'light' | 'dark'`. Those are
 * genuinely different types and collapsing them is the usual bug: `'system'` is not a third
 * appearance, it is the absence of a choice, and a product that stores a resolved `'dark'` when the
 * user meant "follow my device" stops following the device forever — silently, and only for the
 * people who changed the setting once.
 *
 * ## Why the class and not the media query
 *
 * `globals.css` puts the night palette behind `.dark`, so something has to put that class on the
 * document. A pure `@media (prefers-color-scheme: dark)` block would need no JavaScript at all and
 * would also make the toggle impossible, which `facelift-plan.md` §4 wants. The cost is the flash:
 * the class is applied by JavaScript, so the first paint is light unless something runs before it.
 * `THEME_INIT_SCRIPT` is that something — see its own comment.
 *
 * No React and no DOM in this module: it is the logic, so it can be tested without either.
 */

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

/** Where the choice is kept. `localStorage`, not a cookie: it is a device preference rather than an
 *  account one, it must be readable synchronously before first paint, and it is not the server's
 *  business. Renaming this key silently resets everyone's choice, so it is a constant. */
export const THEME_STORAGE_KEY = 'no-crumbs-theme';

/** The class `globals.css`'s night block hangs off, and the attribute the three map modules already
 *  looked for before this file existed. Both are written, so nothing that reads either goes stale. */
export const DARK_CLASS = 'dark';
export const THEME_ATTRIBUTE = 'data-theme';

/** The default, and it is `'system'` on purpose: a product that has never been told what someone
 *  wants should follow the device rather than assert daylight. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === 'system';
}

/**
 * The reconciliation, and the only place the precedence is written down.
 *
 * An explicit choice wins over the device; `'system'` defers to it; and a device that has expressed
 * no preference at all is light, because the light theme is the signed one and the fallback should
 * be the surface the product was designed on.
 */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * What the next tap on a two-state control should mean.
 *
 * Deliberately resolves `'system'` rather than cycling through it: a three-state toggle is a
 * control whose next state a user cannot predict, and "follow my device" is a thing you choose
 * once from a menu rather than something you land on by pressing a button twice. The *current*
 * appearance is what a person is looking at when they reach for it, so that is what it flips.
 */
export function nextPreference(current: ThemePreference, systemPrefersDark: boolean): Theme {
  return resolveTheme(current, systemPrefersDark) === 'dark' ? 'light' : 'dark';
}

/** The stored value, or the default for anything unrecognised — a corrupted or hand-edited key must
 *  not be able to leave the product in a state its own type system does not have. */
export function preferenceFromStorage(raw: string | null | undefined): ThemePreference {
  return isThemePreference(raw) ? raw : DEFAULT_PREFERENCE;
}

/**
 * Put a resolved theme onto the document.
 *
 * Three things rather than one, and each has a consumer:
 *
 *  - the **class**, which is what `globals.css`'s `.dark` block selects on;
 *  - the **attribute**, which is what `use-disc-theme.ts` and `country-flag-image.ts` already
 *    look for — they checked `data-theme` before this module existed, so writing it keeps them
 *    correct without being edited;
 *  - **`color-scheme`**, which is not decoration: it is what makes the browser's own surfaces —
 *    form controls, scrollbars, the space behind an overscroll — follow the theme. Without it a
 *    dark page keeps white scrollbars and a white rubber-band, which is the single most obvious
 *    tell that a dark mode was painted on rather than declared.
 *
 * Takes the element so it can be tested against a detached node, and so a caller cannot be wrong
 * about which document it means.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.classList.toggle(DARK_CLASS, theme === 'dark');
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;
}

/**
 * **The no-flash script, as a string, to be run before first paint.**
 *
 * The class is applied by JavaScript, so without this the first frame of every page load is the
 * light theme — a white flash before a dark screen, on every navigation, for exactly the people who
 * asked for dark. Rendering this synchronously in `<head>` is the standard fix and there is no
 * cheaper one: it has to run before the browser paints, which means before React hydrates and
 * before any effect.
 *
 * It is deliberately tiny and deliberately total. It cannot import `resolveTheme` — it runs before
 * any bundle — so the precedence is restated here, and that duplication is the one thing about this
 * module that has to be checked by a human rather than by a type: `tests/unit/ui/theme.test.ts`
 * pins the two against each other by evaluating this string.
 *
 * `try/catch` because `localStorage` throws rather than returning `null` in a partitioned iframe or
 * with site data blocked, and a theme preference is not worth a blank page.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(
  DEFAULT_PREFERENCE,
)};var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle(${JSON.stringify(
  DARK_CLASS,
)},d);r.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

/**
 * **What theme the document is actually in, read off the document — the one implementation.**
 *
 * Three modules had their own copy of this precedence before W7-2: `components/ui/map.tsx`,
 * `components/map/use-disc-theme.ts` and `components/map/country-flag-image.ts`. All three were
 * *correct*, and identically so, which is exactly what made the duplication easy to miss and
 * dangerous to keep: the next person to add a rule — an `only-dark` class, a third attribute value,
 * a container-scoped theme — fixes two of three and ships a map whose pills disagree with its
 * basemap. **This is a consolidation, not a repair.** Nothing here behaves differently from what it
 * replaced.
 *
 * `null` when the document expresses nothing, so a caller can tell "no opinion" from "light" and
 * decide whether to fall back to the device. `country-flag-image.ts` needs that distinction: it
 * uses the answer to check that the CSS variables it is about to read belong to the theme it was
 * asked to rasterise, and a document with no opinion is not evidence either way.
 *
 * Takes the element rather than reaching for `document`, so it is testable without a DOM and so a
 * caller cannot be wrong about which document it means.
 */
export function themeFromDocument(root: HTMLElement | null | undefined): Theme | null {
  if (!root) return null;
  if (root.classList.contains(DARK_CLASS)) return 'dark';
  if (root.classList.contains('light')) return 'light';
  const attribute = root.getAttribute(THEME_ATTRIBUTE);
  return isTheme(attribute) ? attribute : null;
}

/** The device's own preference, and `'light'` where there is no device to ask — a server, or a
 *  browser too old for `matchMedia`. The same fallback `resolveTheme` uses, for the same reason. */
export function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The full precedence, for anything that has to paint *now* and is not a React component: the
 * document if it has said anything, the device otherwise.
 *
 * This is what a canvas rasteriser and a map style want. A React component should prefer
 * `useTheme()` from `components/theme/theme-provider`, which subscribes rather than samples — but
 * both answer with this same rule, because `applyTheme` is what writes the document that this
 * reads.
 */
export function currentTheme(): Theme {
  return themeFromDocument(typeof document === 'undefined' ? null : document.documentElement)
    ?? systemTheme();
}
