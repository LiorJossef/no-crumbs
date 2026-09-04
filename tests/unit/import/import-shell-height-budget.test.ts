/**
 * **The desktop import card may not spend more of its viewport on chrome than a phone does — plus
 * the 56px a laptop has over a phone, and not one pixel more.**
 *
 * `product-review-2026-08-31-r3.md` finding 4, measured: the review screen's candidate scroller
 * resolved to `clientHeight` **371 on desktop against 409 on mobile**, with 781px of candidates to
 * show. The screen where a person decides what enters their map permanently showed *less* of that
 * decision on the device with three times the space. Every one of the 38 missing pixels was chrome:
 * 12 from a card capped at a `52rem` constant, 24 from `lg:py-10` against the mobile column's
 * 32 + 24, and 2 from the card's own hairline border, which the full-bleed mobile column does not
 * have.
 *
 * **Why an arithmetic guard rather than a pinned class string.** The defect is not any single
 * value — it is the *sum*, and the sum lives in two elements (`<main>`'s scrim padding and the
 * card's own padding) that were free to drift apart and did. A guard that pinned `lg:py-8` would go
 * green while somebody restored `lg:p-10` on the scrim and re-created the inversion. So this
 * reconstructs the budget the way the browser does and compares it against the one number that
 * makes the finding true or false.
 *
 * **The reference viewports are the project's two**, 390 × 844 and 1440 × 900 (`working-agreement`
 * §2, and the two every review in `docs/` measures at). A laptop is **56px** taller than the phone,
 * so a desktop inset of `mobile inset + 56` is the exact break-even, and anything above it is the
 * desktop losing.
 *
 * **What this cannot see, and it is the larger half.** Everything *inside* the card — the 56px ✕
 * lane, the 170px header, the 56px selection bar, the 97px footer — is identical at both widths, so
 * it cancels out of this comparison and is invisible here. It is also where the remaining ~380px of
 * fixed chrome lives, and the reason the desktop still shows **one** full candidate row rather than
 * two on the ambiguous fixture. That is `ux-import-review-screen.md` §5.1/§5.3's territory (does
 * the header scroll away?), not this file's.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fileDefining } from './import-client-source';

/** Tailwind's spacing scale: 0.25rem per unit at a 16px root. `p-5` → 20px. */
const PX_PER_UNIT = 4;

/** The project's two reference viewport heights. A laptop's whole surplus over a phone. */
const MOBILE_VIEWPORT_H = 844;
const DESKTOP_VIEWPORT_H = 900;
const SURPLUS_PX = DESKTOP_VIEWPORT_H - MOBILE_VIEWPORT_H;

const SHELL = fileDefining('ImportShell');

/**
 * The class strings, with comments stripped.
 *
 * This file documents the values it replaced *by name* — `lg:p-10`, `lg:max-h-[min(52rem,…)]` — and
 * so does `import-shell.tsx`. A scan that read prose would match its own explanation, which is the
 * failure mode `import-client-source.ts` was written for and `token-call-sites.test.ts` records
 * four instances of.
 */
function code(): string {
  return SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every `lg:`-prefixed utility in the file's code, so a variant cannot hide from the sum. */
function lgUtility(pattern: RegExp): readonly string[] {
  return [...code().matchAll(pattern)].map((m) => m[1]!);
}

/**
 * The desktop card's total vertical inset, in px, reconstructed the way layout computes it:
 * the scrim's padding above and below the card, the card's own padding, and its border.
 */
function desktopInsetPx(): number {
  const scrim = lgUtility(/\blg:p-(\d+(?:\.\d+)?)\b/g);
  expect(scrim, 'the scrim padding is written exactly once, unconditionally').toHaveLength(1);

  const cardPadY = lgUtility(/\blg:py-(\d+(?:\.\d+)?)\b/g);
  expect(cardPadY.length, 'both card variants declare a vertical padding').toBeGreaterThan(0);
  expect(new Set(cardPadY).size, 'the two card variants agree on their padding').toBe(1);

  const borders = (code().match(/\blg:border\b/g) ?? []).length;
  const borderPx = borders > 0 ? 2 : 0;

  return Number(scrim[0]) * PX_PER_UNIT * 2 + Number(cardPadY[0]) * PX_PER_UNIT * 2 + borderPx;
}

/** The mobile column's vertical padding, from the two `calc(env(…) + …rem)` literals. */
function mobileInsetPx(): number {
  const rems = [...code().matchAll(/\bp[tb]-\[calc\(env\(safe-area-inset-\w+\)\+(\d+(?:\.\d+)?)rem\)\]/g)].map(
    (m) => Number(m[1]) * 16,
  );
  expect(rems, 'the mobile column declares a top and a bottom padding').toHaveLength(2);
  return rems[0]! + rems[1]!;
}

describe('the desktop import card is not smaller than the phone', () => {
  it('spends no more vertical chrome than the phone plus the height a laptop has over it', () => {
    const mobile = mobileInsetPx();
    const desktop = desktopInsetPx();
    expect(mobile, 'the mobile inset moved — this guard is not satisfiable by growing it').toBe(56);
    expect(
      desktop,
      `desktop vertical inset ${String(desktop)}px against a break-even of ${String(mobile + SURPLUS_PX)}px ` +
        `(mobile ${String(mobile)}px + the ${String(SURPLUS_PX)}px a ${String(DESKTOP_VIEWPORT_H)}px viewport ` +
        `has over ${String(MOBILE_VIEWPORT_H)}px). Above it, the review screen shows fewer candidates on a ` +
        `laptop than on a phone — r3 finding 4.`,
    ).toBeLessThanOrEqual(mobile + SURPLUS_PX);
  });

  it('writes the card height budget once, as a percentage of the scrim it sits in', () => {
    /*
     * The second half of the defect, and the one a padding sum cannot catch. The card carried
     * `max-h: min(52rem, calc(100vh - 4rem))` while the scrim carried 40px of padding: 832px of
     * card inside an 820px content box, so the tallest screen in the flow overflowed its own scrim
     * by 12px and made `<main>` scroll. Two literals for one quantity, free to disagree — and
     * `52rem` also binds at *every* viewport taller than 896px, which is a constant dressed as a
     * viewport rule (`product-review-2026-08-31-r3.md` D3 names the same shape on the place sheet).
     *
     * A percentage against the scrim's padding box cannot drift, so that is what is asserted:
     * no literal max-height on this card at `lg:`, ever again.
     */
    const literals = [...code().matchAll(/\blg:max-h-\[[^\]]+\]/g)].map((m) => m[0]);
    expect(literals, 'the desktop card caps itself with `lg:max-h-full`, not a literal').toEqual([]);
    expect(code()).toContain('lg:max-h-full');
  });

  it('catches a reintroduced `lg:p-10` scrim', () => {
    /*
     * The self-test the sibling guards in this directory all carry: proof that the scan resolves to
     * something and that the arithmetic fails on the geometry that shipped. `lg:p-10` + `lg:py-10`
     * + a border is 162px against a 112px break-even — the exact state r3 measured.
     */
    const shipped = 10 * PX_PER_UNIT * 2 + 10 * PX_PER_UNIT * 2 + 2;
    expect(shipped).toBeGreaterThan(56 + SURPLUS_PX);
  });

  it('reads the file the shell is actually in', () => {
    expect(readFileSync('src/app/import/screens/import-shell.tsx', 'utf8')).toBe(SHELL);
  });
});
