import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

/**
 * `cn()` silently deleted this product's custom type sizes for as long as they have existed.
 *
 * `tailwind-merge` classifies a `text-*` utility by its value: anything that is not a known size is
 * a text *colour*. So `text-micro` shared a conflict group with `text-brand`, the merge kept the
 * last one, and the size vanished — leaving the element at its inherited 16px. The `Been` badge on
 * a list row was the visible case; the owner reported it as looking weird, and the class was
 * present in the source the whole time.
 *
 * These tests are the guard. The first three would all have failed before `extendTailwindMerge`.
 */
describe('cn keeps custom font sizes apart from text colours', () => {
  it('keeps the size when a colour follows it — the Been badge case', () => {
    expect(cn('text-micro font-semibold leading-4 text-brand')).toContain('text-micro');
  });

  it('keeps the colour when the size follows it', () => {
    const out = cn('text-brand text-micro');
    expect(out).toContain('text-brand');
    expect(out).toContain('text-micro');
  });

  it('keeps every custom size beside a colour, not only the ones we happened to check', () => {
    for (const size of ['micro', 'caption', 'reading', 'title', 'display', 'display-lg', 'hero']) {
      expect(cn(`text-${size} text-muted-foreground`), size).toContain(`text-${size}`);
    }
  });

  it('still resolves a real conflict between two sizes', () => {
    expect(cn('text-micro text-caption')).toBe('text-caption');
  });

  it('still resolves a real conflict between two colours', () => {
    expect(cn('text-brand text-muted-foreground')).toBe('text-muted-foreground');
  });

  it('still resolves Tailwind’s own sizes against ours', () => {
    expect(cn('text-sm text-micro')).toBe('text-micro');
    expect(cn('text-micro text-sm')).toBe('text-sm');
  });

  /**
   * The list in `utils.ts` cannot be derived at runtime, and forgetting to extend it fails
   * silently — the class simply disappears. So the tokens in `globals.css` are the source of truth
   * and this asserts the two agree.
   */
  it('names every --text-* token that globals.css defines', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const declared = new Set(
      [...css.matchAll(/--text-([a-z][a-z0-9-]*)\s*:/g)]
        .map((m) => m[1] ?? '')
        .filter((name) => name !== '' && !name.endsWith('--line-height')),
    );
    expect(declared.size).toBeGreaterThan(0);
    for (const token of declared) {
      expect(cn(`text-${token} text-brand`), `--text-${token} is not named in utils.ts`).toContain(
        `text-${token}`,
      );
    }
  });
});
