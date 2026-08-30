/**
 * W6-2 — the import's two round trips, and the rule that governs them.
 *
 * `/api/imports/source-preview` answers in under a second with the post; `/api/imports/probe` takes
 * the 7-34s a real model call measures and answers with the places. **There is still no stream.**
 * `overnight-run-plan.md` §9 leaves `L0-F6` explicitly unfunded, and `facelift-plan.md` §4 decision
 * 4 is the rule this package is graded against: *the facelift may not ship a more convincing fake.*
 *
 * So what this file pins is not "the split happened" — it is the three ways the split could have
 * been faked, none of which a screenshot would reveal:
 *
 *  1. **A timer advancing a stage.** The old single-request rail flipped `source: 'done'` right
 *     after the fetch was *issued*, and called it an honest approximation, which it was while there
 *     was one round trip. With two there is no excuse left, and the nearest thing to one is a
 *     `setTimeout` in the run module. There is none, and this asserts it.
 *  2. **A third request, or a second call to the model route.** One probe call per import is a hard
 *     cost rule (a Gemini call against a 500/day ceiling), and `seed-links.test.ts` pins the count.
 *  3. **Two shapes drifting.** `ProbeSuccess` extends `SourcePreview`, so the rail cannot be handed
 *     a post the review screen would read differently. Asserted by the compiler *and* by the
 *     route's response literal naming exactly those fields.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES } from '@/domain/errors';
import type { ProbeSuccess, SourcePreview } from '@/app/import/_lib/probe-contract';

const RUN = readFileSync('src/app/import/_lib/use-import-run.ts', 'utf8');
const ROUTE = readFileSync('src/app/api/imports/source-preview/route.ts', 'utf8');
const RAIL = readFileSync('src/app/import/screens/rail-screen.tsx', 'utf8');

/** Comments are where this codebase records what it *used* to do; the assertions below are about
 *  what it does, so they read the code. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The six fields of `SourcePreview`, as values, so the route and the type cannot drift. */
const SOURCE_PREVIEW_FIELDS = [
  'sourceId',
  'authorHandle',
  'authorName',
  'canonicalUrl',
  'thumbnailUrl',
  'caption',
] as const;

describe('the two responses are one shape', () => {
  it('lets a `ProbeSuccess` stand in for a `SourcePreview`', () => {
    // A compile-time assertion with a runtime body, which is the only kind this runner can carry.
    // If `ProbeSuccess` ever stops extending `SourcePreview`, this file stops typechecking — which
    // is the point, because the rail falls back to the probe's own body when the preview failed.
    const probe: ProbeSuccess = {
      sourceId: 's',
      extractionId: null,
      authorHandle: null,
      authorName: null,
      canonicalUrl: 'https://example.test',
      thumbnailUrl: null,
      caption: null,
      candidates: [],
    };
    const preview: SourcePreview = probe;
    expect(Object.keys(preview)).toEqual(expect.arrayContaining([...SOURCE_PREVIEW_FIELDS]));
  });

  it('has the route return exactly those fields and nothing more', () => {
    // The response literal, sliced out of the route. A field added to the response without being
    // added to `SourcePreview` is a shape the client types do not describe.
    // `lastIndexOf`: the failure envelope is also a `NextResponse.json({`, and it comes first.
    const start = ROUTE.lastIndexOf('return NextResponse.json({');
    const body = ROUTE.slice(start, ROUTE.indexOf('});', start));
    const keys = [...body.matchAll(/^\s{6}(\w+)[,:]/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...SOURCE_PREVIEW_FIELDS].sort());
  });
});

describe('the rail claims no stage the server did not send', () => {
  it('advances nothing on a timer', () => {
    // The one mechanical way to fake a streamed stage, and the shape the deleted "honest
    // approximation" would come back as. The rail's own elapsed-time interval lives in
    // `rail-screen.tsx` and drives a wait *sentence*, never a stage — which is why this asserts
    // against the run module rather than the screen.
    expect(code(RUN)).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
  });

  it('sets the source fact only from a response body, never from the pasted URL', () => {
    // `sourceFact` is assigned in exactly two places, and both read a handle off a parsed
    // response. Neither may read `target`, which is the string the user pasted.
    const assignments = [...code(RUN).matchAll(/sourceFact:([\s\S]*?),\n/g)].map((m) => m[1]!);
    expect(assignments).toHaveLength(2);
    for (const assignment of assignments) {
      expect(assignment).not.toContain('target');
      expect(assignment).toMatch(/authorHandle/);
    }
  });

  it('renders the post only when the server has sent one', () => {
    // `post === null` covers both "still in flight" and "the preview failed", and the honest
    // rendering of both is the block not being there. A fallback built from the pasted URL would
    // be the product asserting it had read a post it had not.
    expect(code(RAIL)).toContain('rail.post !== null');
    expect(code(RAIL)).not.toContain('rail.post ??');
  });

  it('drops a preview failure rather than showing it, so one route owns the verdict', () => {
    // Two responses that can each fail is two paths to a failure screen and a way for them to
    // disagree on screen. The preview's failure arms set no error state at all.
    const previewBlock = code(RUN).slice(
      code(RUN).indexOf("post('/api/imports/source-preview')"),
      code(RUN).indexOf("post('/api/imports/probe')"),
    );
    expect(previewBlock).not.toContain('probe_error');
    expect(previewBlock).toContain('stillCurrent()');
  });
});

describe('the new route adds nothing to the taxonomy', () => {
  it('constructs only codes the closed set already has', () => {
    // `07` §9's fourteen codes are the whole vocabulary, and `ui/import/import-error-copy.ts` is
    // total over them. A fifteenth reaching the client would render nothing.
    const quoted = [...ROUTE.matchAll(/'([A-Z][A-Z_]{3,})'/g)].map((m) => m[1]!);
    for (const candidate of quoted) {
      expect(DOMAIN_ERROR_CODES as readonly string[], candidate).toContain(candidate);
    }
  });

  it('re-validates the URL server-side rather than trusting the client', () => {
    // The SSRF-relevant allow-list check only means anything on the server about to make the call.
    expect(code(ROUTE)).toContain('canonicaliseTikTokUrl(url)');
    expect(code(ROUTE)).toContain('supabase.auth.getUser()');
  });

  it('opens no import row and writes no extraction, so the probe stays the single bookkeeper', () => {
    expect(code(ROUTE)).not.toContain('start_import');
    expect(code(ROUTE)).not.toContain('extractions');
    expect(code(ROUTE)).not.toContain('createPlaceExtractor');
    expect(code(ROUTE)).not.toContain('createPlaceResolver');
  });
});
