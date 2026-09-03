import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MENU_ROW, MENU_ROW_PAINT, PANEL_SURFACE } from '@/ui/menu-material';

/**
 * **The guard on a failure mode that has no error behind it.**
 *
 * A non-component export of a `'use client'` module arrives in a Server Component as a client
 * reference rather than as its value. `cn()` drops it silently — no throw, no warning, no type
 * error — and the element renders with none of those classes. Measured on 2026-09-03: `/profile`'s
 * `Account settings` row put its label and its chevron on two separate lines, and reading the
 * source told you nothing, because the class was right there in the source.
 *
 * So the three menu class strings moved into `src/ui/menu-material.ts`, a plain module, and the
 * only thing that can undo it is somebody adding `'use client'` to that file. Nothing else in the
 * toolchain would notice: the client consumers would keep working, and only the server ones would
 * quietly lose their styling. Hence a test that reads the file for the directive.
 */
const SOURCE = readFileSync('src/ui/menu-material.ts', 'utf8');
const INLINE_MENU = readFileSync('src/components/ui/inline-menu.tsx', 'utf8');
const PROFILE = readFileSync('src/app/profile/page.tsx', 'utf8');

describe('the menu material is a plain module', () => {
  it("carries no 'use client' directive", () => {
    // Anchored to the start of a line: the file's own header *quotes* the directive to explain
    // why it must not be there, and a loose match would fire on the explanation.
    expect(SOURCE).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('imports nothing from React, and nothing from a client module', () => {
    expect(SOURCE).not.toMatch(/^import\b/m);
  });

  it('exports the three class strings as strings a server can read', () => {
    for (const value of [PANEL_SURFACE, MENU_ROW, MENU_ROW_PAINT]) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('is re-exported from `inline-menu.tsx` so no client call site had to change', () => {
    expect(INLINE_MENU).toContain("from '@/ui/menu-material'");
    expect(INLINE_MENU).toContain('export { MENU_ROW, MENU_ROW_PAINT, PANEL_SURFACE };');
  });
});

/**
 * `/profile` is the Server Component the bug was found on, and it is the one call site that must
 * never reach for these through the client module again.
 */
describe('/profile takes the menu material from the plain module', () => {
  it('imports it from `@/ui/menu-material`', () => {
    expect(PROFILE).toContain("import { MENU_ROW, MENU_ROW_PAINT } from '@/ui/menu-material';");
    expect(PROFILE).not.toContain("from '@/components/ui/inline-menu'");
  });

  it('is a real link, so the page still opens `/account` with scripting off', () => {
    expect(PROFILE).toContain('<Link href="/account"');
  });

  it('drew the row on the menu material rather than on a bordered card', () => {
    expect(PROFILE).toContain('cn(MENU_ROW, PRESS_ROW)');
    expect(PROFILE).toContain("cn(MENU_ROW_PAINT, 'text-sm')");
    // The bordered card it replaced. Only the prose above the row still names the class.
    expect(PROFILE).not.toContain("'flex min-h-14 items-center");
  });
});
