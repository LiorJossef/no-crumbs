import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { IMPORT_SEED_LINKS } from '@/ui/import/seed-links';

/**
 * The paste screen's cold-start seeds. The list is meant to be edited — the owner swaps URLs as
 * the recognition corpus changes — so the interesting tests are the ones that catch a bad *edit*,
 * not the ones that restate today's contents.
 *
 * What can actually go wrong when someone swaps a link: pasting an Instagram URL, a TikTok profile
 * URL, or a URL with a typo in it. A photo/carousel post is deliberately NOT in that list any
 * more — oEmbed serves it under `/video/<id>`, so it is a supported seed, not a dead end. Every one of those is a chip that dead-ends the
 * very first thing a new user taps — the worst possible place for it — and every one of them is
 * caught below by running the seed through the same canonicaliser the screen runs it through.
 */
describe('IMPORT_SEED_LINKS', () => {
  it('has between one and three entries', () => {
    // Zero would silently remove the affordance (the screen renders nothing rather than an empty
    // heading — that branch exists); four starts competing with the paste field it supports.
    expect(IMPORT_SEED_LINKS.length).toBeGreaterThan(0);
    expect(IMPORT_SEED_LINKS.length).toBeLessThanOrEqual(3);
  });

  it('every seed is a URL the import flow accepts', () => {
    for (const seed of IMPORT_SEED_LINKS) {
      const result = canonicaliseTikTokUrl(seed.url);
      expect(
        result.ok,
        `seed "${seed.label}" (${seed.url}) would be rejected before any request: ` +
          `${result.ok ? '' : result.error.code}`,
      ).toBe(true);
    }
  });

  it('rejects the shapes a bad swap would produce', () => {
    // The guard above is only worth having if it fails on the realistic mistakes.
    for (const bad of [
      'https://www.instagram.com/p/abc/',
      'https://www.tiktok.com/@someone',
      'ttps://www.tiktok.com/@someone/video/7300000000000000000',
    ]) {
      expect(canonicaliseTikTokUrl(bad).ok, bad).toBe(false);
    }
  });

  it('gives every seed a short label, and no two the same', () => {
    for (const seed of IMPORT_SEED_LINKS) {
      expect(seed.label.trim()).not.toBe('');
      // A chip, not a sentence: long labels wrap and the row stops reading as an aside.
      expect(seed.label.length, seed.label).toBeLessThanOrEqual(28);
    }
    expect(new Set(IMPORT_SEED_LINKS.map((s) => s.label)).size).toBe(IMPORT_SEED_LINKS.length);
    expect(new Set(IMPORT_SEED_LINKS.map((s) => s.url)).size).toBe(IMPORT_SEED_LINKS.length);
  });

  it('is the only place the client names a seed URL', () => {
    // A seed pasted into the component as a literal is a seed that stops being one-line editable,
    // and it is how a "temporary" test link ends up shipped.
    const client = readFileSync('src/app/import/import-page-client.tsx', 'utf8');
    expect(client).not.toContain('tiktok.com/@');
    for (const seed of IMPORT_SEED_LINKS) {
      expect(client).not.toContain(seed.url);
    }
  });
});

/**
 * The invariant the whole affordance rests on: a seed tap is a paste. Asserted against the
 * component source because the repo's unit runner has no DOM — the e2e suite drives the real
 * click, this pins the shape that makes the e2e result generalise.
 */
describe('a seed takes the same path as a paste', () => {
  const CLIENT = readFileSync('src/app/import/import-page-client.tsx', 'utf8');

  it('routes the seed through submit(), with no fetch of its own', () => {
    expect(CLIENT).toContain('void submit(seedUrl)');
    // One import request site in the whole component. A second call to the probe route would be
    // a seed-only path — which is exactly what this affordance must not have. (The two other
    // `fetch`es in the file are the confirm/save route, reached only from the review screen.)
    expect(CLIENT.match(/fetch\('\/api\/imports\/probe'/g) ?? []).toHaveLength(1);
  });

  it('never fires an import from an effect', () => {
    // The cost rule, as a test: one uncached tap is one Gemini call against a hard 500/day
    // budget, so no prefetch, no warm-up, nothing on mount. Only event handlers may call submit.
    const effects = CLIENT.match(/useEffect\([\s\S]*?\n\s*\}, \[[^\]]*\]\);/g) ?? [];
    // Every `useEffect(` in the file, or this assertion is looking at nothing.
    expect(effects).toHaveLength((CLIENT.match(/useEffect\(/g) ?? []).length);
    for (const effect of effects) {
      expect(effect).not.toContain('submit(');
      expect(effect).not.toContain('submitSeed');
    }
  });
});
