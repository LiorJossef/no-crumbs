import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **There is no `loading.tsx` in this app, and that is a rule rather than an omission.**
 *
 * This file used to assert the opposite. `08a8b0b` added loading states to the three routes that
 * had none — a real gap, honestly identified — and they were deleted on 2026-08-31 because of what
 * they do to a visitor with JavaScript disabled.
 *
 * ## The measurement, at `022a18c`, 1440×900, `javaScriptEnabled: false`
 *
 * | route | has `loading.tsx` | painted text |
 * |---|---|---|
 * | `/map` | no | **3,416 characters** — the wordmark, the view switch, all 30 places |
 * | `/collections` | yes | **0** |
 * | `/profile` | yes | **7** — the `h1`, over 13 skeleton placeholders and nothing else |
 *
 * Same shell, same components, same data. `loading.tsx` creates a Suspense boundary; Next streams
 * the fallback first and swaps in the real content with an **inline script**; with JavaScript off
 * that swap never runs. The page's real markup is in the document the whole time, inside
 * `<div hidden>` — **where `querySelector` finds it and a human never does.** That is the part that
 * makes this worse than an ordinary gap: it is a defect shaped to pass an automated check, and
 * this project has now shipped that shape three times (a blank sign-in screen, a map unusable for
 * 2.4 s, and this).
 *
 * ## The trade, stated so it does not have to be re-derived
 *
 * Without the boundary the server holds the response until the query resolves. **A `<Link>`
 * navigation then keeps the current screen on screen** until the new one is ready, which is better
 * than a skeleton and is what the owner asked for on 2026-08-31 (*"dont make the page flicker"*).
 * The cost falls on a hard navigation — typing the URL, or a cold open — where the browser waits on
 * TTFB instead of painting a skeleton.
 *
 * **Skeleton-for-JS-users against nothing-for-no-JS-users is not a close trade.** If a future
 * change makes it one — a route whose data genuinely cannot be awaited, say — the answer is a
 * boundary *plus* a no-JS path, not a boundary alone, and this test is where to say so.
 *
 * Source text rather than rendering: `vitest.config.ts` runs in node with no DOM, and every claim
 * below is about the file tree or about class strings.
 */

const APP = fileURLToPath(new URL('../../../src/app/', import.meta.url));

/**
 * The file with its comments removed.
 *
 * The assertion below is about *class strings*, and the docblock in `skeleton.tsx` quotes the very
 * thing it forbids. Matching over the comments would make the explanation of a rule fail the rule.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('no route withholds itself behind a streamed boundary', () => {
  it('has no loading.tsx anywhere under src/app', () => {
    const found = readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter((entry) =>
      /(^|\/)loading\.tsx$/.test(entry),
    );
    expect(
      found,
      'a loading.tsx makes its route a frozen skeleton with JavaScript disabled — see this file',
    ).toEqual([]);
  });

  it('still has the two routes those files belonged to', () => {
    // Deleting a loading state must never be the same commit as deleting a route. If this fails,
    // the assertion above is passing for the wrong reason.
    expect(existsSync(`${APP}collections/page.tsx`)).toBe(true);
    expect(existsSync(`${APP}profile/page.tsx`)).toBe(true);
  });
});

describe('the placeholder primitives that survive', () => {
  /**
   * `Skeleton` still ships: `import/screens/review/candidate-card.tsx` draws one *inside* a screen
   * that is already on the page, which is a different thing from withholding the page. So its two
   * rules still bind.
   */
  const SKELETON = fileURLToPath(new URL('../../../src/components/ui/skeleton.tsx', import.meta.url));

  it('animates only under motion-safe', () => {
    // The design system carries a closed list of nine micro-animations and a reduced-motion answer
    // for each; a placeholder that pulses for two seconds regardless is the one kind of motion
    // nobody chose.
    for (const match of code(SKELETON).match(/[\w:-]*animate-pulse/g) ?? []) {
      expect(match, 'the skeleton animates outside motion-safe').toBe('motion-safe:animate-pulse');
    }
  });

  it('draws in a token, never a literal', () => {
    expect(code(SKELETON).match(/#[0-9A-Fa-f]{6}/g), 'the skeleton hard-codes a colour').toBeNull();
  });

  it('is hidden from the accessibility tree', () => {
    // Grey rectangles are worth nothing to a screen-reader user, and Next's own route announcer
    // already says the new page's title when the real content arrives.
    expect(readFileSync(SKELETON, 'utf8')).toMatch(/aria-hidden/);
  });
});
