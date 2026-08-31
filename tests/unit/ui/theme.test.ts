/**
 * The theme logic, and the one duplication in it that a type cannot check.
 *
 * `THEME_INIT_SCRIPT` restates `resolveTheme`'s precedence in hand-written JavaScript, because it
 * runs in `<head>` before any bundle exists and therefore cannot import it. That duplication is
 * load-bearing and invisible: if the two drift, the page paints one theme before hydration and a
 * different one after, which reads as a flash rather than as a bug and would be filed as "the dark
 * mode flickers". So this file **evaluates the script string** against a fake document and asserts
 * it agrees with the module for every combination of preference and device.
 *
 * `environment: 'node'`, so there is no DOM — the fakes below are the smallest thing the script
 * actually touches, which is also a precise statement of its dependencies.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  DARK_CLASS,
  DEFAULT_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  isThemePreference,
  nextPreference,
  preferenceFromStorage,
  resolveTheme,
  systemTheme,
  themeFromDocument,
  type ThemePreference,
} from '@/lib/theme';

describe('resolveTheme', () => {
  it('lets an explicit choice beat the device', () => {
    // The whole reason the preference is three-valued: a user on a light phone who picks dark gets
    // dark, and nothing about `prefers-color-scheme` may override that.
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the device when nobody has chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('defaults to following the device rather than asserting daylight', () => {
    expect(DEFAULT_PREFERENCE).toBe('system');
  });
});

describe('preferenceFromStorage', () => {
  it('takes the three real values', () => {
    for (const value of ['light', 'dark', 'system'] as const) {
      expect(preferenceFromStorage(value)).toBe(value);
    }
  });

  it('falls back for anything else, including a hand-edited key', () => {
    // A corrupted value must not be able to leave the product in a state its own types do not
    // have — `applyTheme` would then write a garbage `color-scheme` onto the document.
    for (const value of [null, undefined, '', 'DARK', 'midnight', '{}']) {
      expect(preferenceFromStorage(value)).toBe(DEFAULT_PREFERENCE);
    }
  });
});

describe('nextPreference', () => {
  it('flips what the user is currently looking at', () => {
    expect(nextPreference('light', false)).toBe('dark');
    expect(nextPreference('dark', false)).toBe('light');
  });

  it('resolves `system` rather than cycling through it', () => {
    // A three-state toggle is a control whose next state cannot be predicted. "Follow my device" is
    // chosen once from a menu, not landed on by pressing a button twice.
    expect(nextPreference('system', true)).toBe('light');
    expect(nextPreference('system', false)).toBe('dark');
    expect(nextPreference('system', false)).not.toBe('system');
  });
});

describe('applyTheme writes all three of the things that have to agree', () => {
  function fakeRoot() {
    const classes = new Set<string>();
    const attrs = new Map<string, string>();
    return {
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      style: { colorScheme: '' },
      classes,
      attrs,
    };
  }

  it('sets the class, the attribute and color-scheme together', () => {
    const root = fakeRoot();
    applyTheme(root as unknown as HTMLElement, 'dark');
    expect(root.classes.has(DARK_CLASS)).toBe(true);
    expect(root.attrs.get(THEME_ATTRIBUTE)).toBe('dark');
    // Not decoration: this is what makes the browser's own scrollbars and overscroll follow. A dark
    // page with a white rubber-band is the clearest tell that a theme was painted on.
    expect(root.style.colorScheme).toBe('dark');
  });

  it('removes the class going back to light, rather than leaving it', () => {
    const root = fakeRoot();
    applyTheme(root as unknown as HTMLElement, 'dark');
    applyTheme(root as unknown as HTMLElement, 'light');
    expect(root.classes.has(DARK_CLASS)).toBe(false);
    expect(root.attrs.get(THEME_ATTRIBUTE)).toBe('light');
    expect(root.style.colorScheme).toBe('light');
  });
});

/**
 * The head script, run for real.
 *
 * `new Function` rather than `eval` so the string is evaluated in its own scope with the fakes
 * passed in explicitly — which also documents exactly what the script is allowed to touch:
 * `localStorage`, `window.matchMedia` and `document.documentElement`.
 */
function runInitScript(stored: string | null, deviceDark: boolean) {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const root = {
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    style: { colorScheme: '' },
  };
  const localStorage = { getItem: vi.fn(() => stored) };
  const window = { matchMedia: (q: string) => ({ matches: q.includes('dark') && deviceDark }) };
  const document = { documentElement: root };
  new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(
    localStorage,
    window,
    document,
  );
  return { dark: classes.has(DARK_CLASS), attr: attrs.get(THEME_ATTRIBUTE), scheme: root.style.colorScheme, localStorage };
}

describe('THEME_INIT_SCRIPT agrees with the module it cannot import', () => {
  const cases: ReadonlyArray<readonly [ThemePreference | string | null, boolean]> = [
    ['dark', false], ['dark', true], ['light', false], ['light', true],
    ['system', false], ['system', true], [null, false], [null, true],
    ['garbage', true], ['', false],
  ];

  it.each(cases)('stored=%s deviceDark=%s resolves the same way both times', (stored, deviceDark) => {
    const fromScript = runInitScript(stored as string | null, deviceDark);
    const expected = resolveTheme(preferenceFromStorage(stored as string | null), deviceDark);
    expect(fromScript.dark).toBe(expected === 'dark');
    expect(fromScript.attr).toBe(expected);
    expect(fromScript.scheme).toBe(expected);
  });

  it('reads the same storage key the module writes', () => {
    const run = runInitScript('dark', false);
    expect(run.localStorage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  it('survives storage throwing, because a preference is not worth a blank page', () => {
    // `localStorage` throws rather than returning null with site data blocked or in a partitioned
    // iframe. The script must still paint something.
    const localStorage = { getItem: () => { throw new Error('blocked'); } };
    const root = { classList: { toggle: () => {} }, setAttribute: () => {}, style: { colorScheme: '' } };
    expect(() =>
      new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(
        localStorage,
        { matchMedia: () => ({ matches: false }) },
        { documentElement: root },
      ),
    ).not.toThrow();
  });
});

describe('the type guards', () => {
  it('separate an appearance from a preference', () => {
    // `'system'` is a preference and not an appearance: nothing can paint it. Collapsing the two is
    // how a product stores a resolved `dark` and stops following the device forever.
    expect(isTheme('system')).toBe(false);
    expect(isThemePreference('system')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
  });
});

describe('themeFromDocument — the one implementation of the precedence (W7-2)', () => {
  function root(options: { classes?: readonly string[]; attribute?: string } = {}) {
    const classes = new Set(options.classes ?? []);
    return {
      classList: { contains: (c: string) => classes.has(c) },
      getAttribute: (name: string) =>
        name === THEME_ATTRIBUTE ? (options.attribute ?? null) : null,
    } as unknown as HTMLElement;
  }

  it('prefers the class over the attribute', () => {
    // Both are written by `applyTheme`, so they agree in this product — but a third party that
    // sets only one must still get a definite answer, and the order has to be somewhere.
    expect(themeFromDocument(root({ classes: [DARK_CLASS], attribute: 'light' }))).toBe('dark');
    expect(themeFromDocument(root({ classes: ['light'], attribute: 'dark' }))).toBe('light');
  });

  it('falls back to the attribute when there is no class', () => {
    expect(themeFromDocument(root({ attribute: 'dark' }))).toBe('dark');
    expect(themeFromDocument(root({ attribute: 'light' }))).toBe('light');
  });

  it('says null when the document has expressed nothing', () => {
    // Not `'light'`. `country-flag-image.ts` uses the difference: it checks that the CSS variables
    // it is about to read belong to the theme it was asked to rasterise, and "no opinion" is not
    // evidence either way — it has to fall through to the fallback tokens instead.
    expect(themeFromDocument(root())).toBeNull();
    expect(themeFromDocument(root({ attribute: 'midnight' }))).toBeNull();
    expect(themeFromDocument(null)).toBeNull();
    expect(themeFromDocument(undefined)).toBeNull();
  });

  it('agrees with applyTheme, which is what writes the thing it reads', () => {
    // The round trip is the property that matters: whatever `applyTheme` puts on the document,
    // `themeFromDocument` reads back. These two are the write and the read of one contract.
    for (const theme of ['light', 'dark'] as const) {
      const classes = new Set<string>();
      const attrs = new Map<string, string>();
      const node = {
        classList: {
          toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
          contains: (c: string) => classes.has(c),
        },
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
        style: { colorScheme: '' },
      } as unknown as HTMLElement;
      applyTheme(node, theme);
      expect(themeFromDocument(node)).toBe(theme);
    }
  });
});

describe('systemTheme', () => {
  it('is light where there is no device to ask', () => {
    // A server, or a browser without `matchMedia`. The same fallback `resolveTheme` uses: light is
    // the signed theme, so it is what the product falls back to rather than a guess.
    const saved = globalThis.window;
    // @ts-expect-error -- deleting the global is the only way to model "no window" in node.
    delete globalThis.window;
    expect(systemTheme()).toBe('light');
    if (saved !== undefined) globalThis.window = saved;
  });
});

/**
 * The consolidation itself, asserted structurally — because the thing W7-2 fixes is not a behaviour
 * anyone can observe today. All three copies were *correct*; the risk was the next person adding a
 * rule to two of them. A grep is the only test that can catch that, so it is the test.
 */
describe('nobody re-implements the precedence', () => {
  const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

  it('reads the theme class in exactly one module', () => {
    const hits = execSync(
      `grep -rln "classList.contains" ${JSON.stringify(SRC)} --include=*.ts --include=*.tsx || true`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .map((file) => file.replace(`${SRC}/`, ''));
    // `lib/theme.ts` and nothing else. The three map modules subscribe to changes themselves —
    // that is legitimately per-consumer — but none of them decides what the answer is any more.
    expect(hits).toEqual(['lib/theme.ts']);
  });
});
