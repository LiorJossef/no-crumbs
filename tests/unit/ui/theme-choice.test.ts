/**
 * **The theme control — owner ruling, 2026-08-31**, recorded in `iteration-2-plan.md` §2.3 as
 * ruling 5 and overriding `facelift-plan.md` §4 decision 3 (*no dark-mode toggle: a signed pass, or
 * none*).
 *
 * The ruling came with one constraint that is not a matter of taste, and it is the thing this file
 * exists to hold: **the control is three-state — light, dark, system — and never a two-way switch.**
 * `'system'` is not a third appearance, it is the absence of a choice, so a binary toggle has
 * nowhere to put it and its first press converts "follow my device" into a stored `'dark'`. That
 * loss is silent, permanent, and reaches only the people who touched the setting once: nothing ever
 * reads `prefers-color-scheme` for them again. It is exactly the class of defect that ships green.
 *
 * Behaviour is not asserted here and could not be — this repository's unit tier is
 * `environment: 'node'` with no jsdom and no testing-library, and adding either is a dependency.
 * It was driven in a real browser instead, at 390×844 and 1440×900 in both device schemes: 46
 * checks including the explicit-choice-beats-device precedence, the return to `system`, the live
 * `matchMedia` subscription with no reload, cross-tab propagation, `ArrowRight` moving the choice,
 * a 44px target, and `.dark` present on the root at `DOMContentLoaded`. What a *source* test can
 * hold is the **shape** of the control, which is the half that would decay under a later edit.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCE,
  THEME_PREFERENCES,
  isThemePreference,
  type ThemePreference,
} from '@/lib/theme';

const CONTROL = readFileSync('src/app/profile/theme-choice.tsx', 'utf8');
const PROFILE = readFileSync('src/app/profile/page.tsx', 'utf8');

/** Comments stripped, for every *negative* assertion — this file argues in prose about the switch
 *  it must not be, so a guard that cannot tell a comment from a call site fails on being explained.
 *  The same reason `shell-wordmark.test.ts` gives, and the same three replacements. */
const CODE = CONTROL.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

describe('the three preferences', () => {
  /**
   * The order is a decision, not an accident: the two appearances first, and the absence of a
   * choice at the end rather than between the two things it is not.
   */
  it('is light, dark, system, in that order', () => {
    expect([...THEME_PREFERENCES]).toEqual(['light', 'dark', 'system']);
  });

  /**
   * **Exhaustive over the union, checked at compile time as well as at runtime.** The runtime
   * assertion above would still pass if a fourth preference were added to `ThemePreference` and not
   * to this list — the type would widen, the control would silently stop offering one of its own
   * values, and nothing would fail. The `Record` below cannot be constructed without every member
   * of the union as a key, so a fourth value breaks the build here rather than going missing on a
   * screen.
   */
  it('covers the union with nothing left over', () => {
    const seen: Record<ThemePreference, boolean> = { light: false, dark: false, system: false };
    for (const preference of THEME_PREFERENCES) {
      expect(isThemePreference(preference)).toBe(true);
      seen[preference] = true;
    }
    expect(Object.values(seen).every(Boolean)).toBe(true);
    expect(THEME_PREFERENCES).toContain(DEFAULT_PREFERENCE);
  });
});

describe('the control the owner ruled for', () => {
  /**
   * **Three targets, never a switch.** The assertion is on the primitive rather than on a count of
   * labels, because the failure mode is somebody replacing the group with a `Switch` and keeping
   * all three words in a menu — or, more likely, deciding two states is tidier. `nextPreference` is
   * named explicitly: it is the two-state flip, it is correct, and calling it *here* is the bug.
   */
  it('is a radio group over the three, not a two-way switch', () => {
    expect(CODE).toContain('RadioGroup');
    expect(CODE).toContain('THEME_PREFERENCES.map');
    expect(CODE).not.toContain('nextPreference');
    expect(CODE).not.toMatch(/\bSwitch\b/);
    // The three come from the constant. Literals here would be a second list to keep in step.
    expect(CODE).not.toMatch(/value="(?:light|dark|system)"/);
  });

  /**
   * **`'system'` reaches storage unresolved.** `setPreference` is handed to `onValueChange`
   * directly; the moment anything sits between them — a `resolveTheme`, a ternary, a "normalise" —
   * the stored value becomes an appearance and the device is never consulted again. This is the
   * mechanism of the silent loss the whole ruling constraint is about.
   */
  it('stores the choice, never the appearance', () => {
    expect(CODE).toContain('onValueChange={setPreference}');
    expect(CODE).not.toContain('resolveTheme');
  });

  /**
   * **No highlight in the server render**, which is the second thing a later edit would quietly
   * undo. The preference lives in `localStorage`, so the server does not know it; painting the
   * default would put the highlight on **System** for a user whose choice is **Dark** and then move
   * it after hydration. `shown` is `null` until hydrated and the selected styling reads from it, not
   * from `data-checked` — asserted here because the browser check that proves it (0 highlighted
   * segments in the delivered HTML) cannot run in this tier.
   */
  it('shows no selection until it knows the real one', () => {
    expect(CODE).toContain('const shown = hydrated ? preference : null;');
    expect(CODE).toContain('shown === value');
    expect(CODE).not.toContain('data-checked:');
  });

  /**
   * The one thing that happens when JavaScript is off. The control cannot work — the preference is
   * `localStorage` and the class is written by a script — so it is hidden rather than left offering
   * a choice it cannot make. The selector and the attribute have to agree, and they are written in
   * two files, so this is the pair that holds them together.
   */
  it('hides itself where it cannot work', () => {
    expect(CODE).toContain('<style>[data-theme-choice]{display:none}</style>');
    expect(PROFILE).toContain('data-theme-choice');
  });

  /**
   * It is on the page, labelled by the page's own heading rather than by a second copy of that
   * type — the `<section>` and the `<h2>` are server-rendered, so the heading ships in the HTML
   * even though the control does not.
   */
  it('is mounted in profile settings, under the page heading', () => {
    expect(PROFILE).toContain('<ThemeChoice labelledBy="appearance" />');
    expect(PROFILE).toContain('<SectionHeading id="appearance">Appearance</SectionHeading>');
    expect(CODE).toContain('aria-labelledby={labelledBy}');
  });
});

describe('its strings', () => {
  /**
   * `voice-and-vocabulary.md` §4, the ratified list plus the 2026-08-30 additions, applied to the
   * five user-facing strings this control adds. A settings screen is where machinery vocabulary
   * arrives first — *system preference*, *toggle*, *mode* — and the list is checked rather than
   * remembered.
   *
   * `system` itself is deliberately **not** on that list and is deliberately kept: it is the word
   * every operating system uses for this exact control, and §4 rule 2 asks for *concrete over
   * technical*, which is a different test from *avoid the conventional word*. `Follows your
   * device.` is what does the explaining, and it is asserted below rather than left to a reviewer.
   */
  const BANNED = [
    'metadata', 'LLM', 'geocode', 'extraction', 'pipeline', 'parse', 'API', 'endpoint',
    'payload', 'confidence score', 'retry queue', 'worker', 'oops', 'something went wrong',
    'breadcrumb', 'crumby', 'crummy', 'hidden gem',
  ];

  const strings = [...CONTROL.matchAll(/(?:label|caption): '([^']+)'/g)].map((m) => m[1] ?? '');

  it('adds five strings and no more', () => {
    expect(strings).toEqual([
      'Light',
      'Always light.',
      'Dark',
      'Always dark.',
      'System',
      'Follows your device.',
    ]);
  });

  it('uses none of the banned vocabulary', () => {
    for (const value of strings) {
      for (const word of BANNED) {
        expect(value.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });

  /**
   * **The caption is the whole justification for keeping the word `System`**, so it is pinned. It
   * is second person and it states what happens, which is the answer a user needs to know that
   * `Light` and `Dark` override their phone rather than agreeing with it.
   */
  it('says what System does, in the second person', () => {
    expect(strings).toContain('Follows your device.');
  });
});
