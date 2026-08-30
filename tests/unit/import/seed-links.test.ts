import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { IMPORT_SEED_LINKS } from '@/ui/import/seed-links';

import { importClientSource } from './import-client-source';

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
    const client = importClientSource();
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
 *
 * "The component source" is every file under `src/app/import/` (`import-client-source.ts`). The
 * counts below — one probe fetch, one submitting effect — are counts over *the whole screen*, and
 * W6-1 splits it into eleven files. A scan of one of them would report "exactly one" while eleven
 * twelfths of the screen went unread, and the thing being guarded is a hard 500/day model budget.
 */
describe('a seed takes the same path as a paste', () => {
  const CLIENT = importClientSource();

  it('routes the seed through submit(), with no fetch of its own', () => {
    expect(CLIENT).toContain('void submit(seedUrl)');
    /*
     * One request site per import route in the whole screen. A second call to either would be a
     * seed-only path, which is exactly what this affordance must not have, and the probe route
     * spends a Gemini call against a hard 500/day budget.
     *
     * This used to count `fetch('/api/imports/probe'` literals and expect one. W6-2 made the
     * import two round trips — `/api/imports/source-preview` then `/api/imports/probe` — issued
     * through one small `post(route)` helper that carries the shared `AbortController`, so the
     * literal it counted no longer exists and the assertion would have counted **zero** and
     * passed. Restated against what is now true, and deliberately stricter: it pins both routes,
     * *and* pins that there is exactly one `fetch(` in the whole screen, which is the property the
     * old count was standing in for.
     */
    expect(CLIENT.match(/post\('\/api\/imports\/probe'\)/g) ?? []).toHaveLength(1);
    expect(CLIENT.match(/post\('\/api\/imports\/source-preview'\)/g) ?? []).toHaveLength(1);
    // The confirm/save route lives in `_lib/save-extracted-candidates.ts` and has its own `fetch`;
    // this counts the run module's, which is the one the cost rule is about.
    expect(CLIENT.match(/\bfetch\(route,/g) ?? []).toHaveLength(1);
  });

  /**
   * The cost rule: one uncached import is one Gemini call against a hard 500/day budget, so no
   * prefetch, no warm-up, nothing that fires without a user having pressed something.
   *
   * This used to be "no effect may call `submit`", which was the right rule expressed as the
   * shape it happened to take. On 2026-08-30 the `＋` sheet's `Add this TikTok` stopped needing a
   * second `Add` in the overlay, and the only way to run a link the user submitted in another
   * component is a mount effect. **The rule did not change; the shape did.** So the assertion is
   * restated to pin what actually matters, and it is deliberately stricter than the one it
   * replaces — it now also pins the caller, which the old one never looked at.
   */
  it('fires an import from exactly one effect, and only the already-submitted seed', () => {
    const effects = CLIENT.match(/useEffect\([\s\S]*?\n\s*\}, \[[^\]]*\]\);/g) ?? [];
    // Every `useEffect(` in the file, or this assertion is looking at nothing.
    expect(effects).toHaveLength((CLIENT.match(/useEffect\(/g) ?? []).length);

    const submitting = effects.filter((e) => e.includes('submit('));
    expect(submitting).toHaveLength(1);
    // And it is the seed one, guarded so it can never spend a second call on a re-mount.
    expect(submitting[0]).toContain('seedSubmitted.current');
    expect(CLIENT).toContain('const seedSubmitted = useRef(false)');
    // No effect may reach the *paste screen's* seed chips, which are still gesture-only.
    for (const effect of effects) expect(effect).not.toContain('submitSeed');
  });

  it('is handed an already-submitted link by exactly one caller, and that caller is a submit handler', () => {
    // The prop spends a model call on mount, so "who may pass it" is now part of the cost rule.
    // A second caller — or one that prefills rather than submits — is the regression to catch.
    const callers = execSync(
      "grep -rn 'initialUrl' src --include='*.tsx' | grep -v 'src/app/import/'",
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((line) => /initialUrl:/.test(line));
    expect(callers).toHaveLength(1);
    expect(callers[0]).toContain('src/app/map/map-page-client.tsx');

    const mapClient = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
    expect(mapClient).toContain('onSubmitTikTok={(url) => openImport(url)}');
  });
});
