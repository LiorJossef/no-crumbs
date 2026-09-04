/**
 * **The two props that buy the account menu's focus trap.**
 *
 * Base UI owns the behaviour — `modal="trap-focus"` on `Popover.Root` contains focus and closes on
 * Escape with focus restored to the trigger — and it was measured in a real browser at both
 * breakpoints. What is pinned here is that the props survive: they are one word each, they look
 * like decoration, and deleting either is a silent regression no other suite in this repo can see.
 *
 * Source assertions rather than a render because `vitest.config.ts` sets `environment: 'node'` —
 * there is no DOM in this tier, so a focus trap cannot be unit-tested here by any means.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MENU = readFileSync("src/components/nav/profile-menu.tsx", "utf8");

describe("the account menu keeps focus inside itself", () => {
  it("opens the popover in Base UI’s focus-trapping mode", () => {
    // `product-review-2026-09-01-r5.md` G1, measured at 1440×900: the popup announced
    // `role="dialog"` and the fifth Tab landed on the map's own controls underneath it. Not `true`
    // — that would lock document scroll and kill outside pointer interaction, which on a phone is
    // most of the screen and on desktop is a live map. `'trap-focus'` contains focus and gives up
    // neither.
    expect(MENU).toContain('modal="trap-focus"');
  });

  it("leaves a way out for a screen reader that has no Escape key", () => {
    // A trap with no `Close` inside it seals in anyone who cannot press Escape or press "outside".
    // Visually hidden, and last, so it ends the tab cycle rather than sitting in the middle of it.
    expect(MENU).toContain(
      '<Popover.Close className="sr-only">{COPY.close}</Popover.Close>',
    );
    expect(MENU).toContain("close: 'Close this menu'");
  });
});
