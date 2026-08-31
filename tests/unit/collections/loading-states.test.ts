import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The app directory had **no `loading.tsx` and no `<Suspense>` anywhere** before W5-4, so every tab
 * change waited on the server with the previous screen frozen under it. These assertions are the
 * cheap half of that package: the files exist, and the one animation they introduce respects
 * `prefers-reduced-motion`.
 *
 * Source text rather than rendering. `vitest.config.ts` runs in node with no DOM, and what is being
 * asserted is a property of the class strings — which is also where this regresses: `animate-pulse`
 * is one word shorter than `motion-safe:animate-pulse` and the shorter one is what a person types.
 */

/**
 * **Two, not three, since 2026-08-31.**
 *
 * `src/app/collections/[id]/loading.tsx` is gone because the route it belonged to is gone: the
 * index and a collection are one segment with a search param between them
 * (`app/collections/_lib/drawer-view.ts`), and `[id]` is now a `redirect()` that renders no UI and
 * therefore has nothing to show while it does it. `src/app/collections/loading.tsx` covers both
 * views.
 */
const LOADING_FILES = ['src/app/profile/loading.tsx', 'src/app/collections/loading.tsx'];

/**
 * The file with its comments removed.
 *
 * Both assertions below are about *class strings*, and both docblocks quote the very things they
 * forbid — `animate-pulse` and the two hex values the palette choice is argued from. Matching over
 * the comments would make the explanation of a rule fail the rule.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SKELETON_SOURCES = [
  'src/components/ui/skeleton.tsx',
  'src/components/collections/collections-skeleton.tsx',
  ...LOADING_FILES,
];

describe('the loading states', () => {
  it.each(LOADING_FILES)('%s exists and default-exports a component', (file) => {
    expect(existsSync(file), `${file} is missing`).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/export default function \w+Loading\(/);
  });

  it('animates only under `motion-safe`', () => {
    for (const file of SKELETON_SOURCES) {
      // Every `animate-pulse` must be preceded by the variant. The design system carries a closed
      // list of nine micro-animations and a reduced-motion answer for each; a placeholder that
      // pulses for two seconds regardless is the one kind of motion nobody chose.
      for (const match of code(file).match(/[\w:-]*animate-pulse/g) ?? []) {
        expect(match, `${file} animates outside motion-safe`).toBe('motion-safe:animate-pulse');
      }
    }
  });

  it('draws placeholders in a token, never a literal', () => {
    for (const file of SKELETON_SOURCES) {
      expect(code(file).match(/#[0-9A-Fa-f]{6}/g), `${file} hard-codes a colour`).toBeNull();
    }
  });

  /**
   * The skeleton has to come to rest where the sheet will, and both numbers that decides moved on
   * 2026-08-31: the collections drawer now rests at `half` rather than `full`, and it draws a
   * 56 px Places / Collections switch above its list. Neither is visible to
   * `CollectionsShellSkeleton`, which reproduces the sheet's chrome by hand — so the loading file
   * is where the two are held together, and this is what stops them drifting back apart.
   */
  it('rests where the collections drawer rests, with the switch band reserved', () => {
    const loading = code('src/app/collections/loading.tsx');
    expect(loading).toContain('restingStop="half"');
    expect(loading).not.toContain('restingStop="full"');
    expect(loading).toContain('VIEW_SWITCH_HEIGHT_PX');
    expect(code('src/app/collections/collections-drawer-client.tsx')).toContain(
      "useMapShell({ restingStop: 'half' })",
    );
  });

  it('hides every placeholder from the accessibility tree', () => {
    // Six grey rectangles are worth nothing to a screen-reader user, and Next's own route announcer
    // already says the new page's title when the real content arrives.
    const skeleton = readFileSync('src/components/ui/skeleton.tsx', 'utf8');
    expect(skeleton).toMatch(/aria-hidden/);
  });
});
