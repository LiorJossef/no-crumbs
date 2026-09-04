/**
 * E2-T5-EVAL — what does the spoken transcript add over the caption alone?
 *
 * Runs the REAL shipped extractor twice per post: caption only, then caption + transcript, using
 * the `transcript` member of `ContentPart` that `domain/types.ts` has always declared and nothing
 * has ever produced. Transcripts are fixtures (`fixtures/transcripts/`) — TikTok's own
 * auto-generated caption track, captured once; see the evidence file for how and its limits.
 *
 *   set -a && . ./.env.local && set +a
 *   npx vitest run --config tests/manual/vitest.manual.config.ts tests/manual/transcript-lift.manual.ts --reporter=verbose
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import type { ContentPart } from '@/domain/types';
import type { OpCtx } from '@/domain/ports';
import { createPlaceResolver, placeResolverEnv } from '@/integrations/places/place-resolver-factory';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { buildResolveQuery, deriveResolution } from '@/domain/import/pipeline';

interface Transcript { readonly handle: string | null; readonly words: number; readonly text: string; }
interface OEmbedRow { readonly json?: { readonly title?: string; readonly author_unique_id?: string; readonly embed_product_id?: string } }

const ctx: OpCtx = { signal: new AbortController().signal, importId: null, log: { event: () => {} } };

describe('E2-T5-EVAL — the lift a spoken transcript gives over the caption', () => {
  it('extracts caption-only and caption+transcript for every post we hold a transcript for', async () => {
    const transcripts = JSON.parse(
      readFileSync('tests/manual/fixtures/transcripts/tiktok-auto-captions.json', 'utf8'),
    ) as Record<string, Transcript>;
    const rows = JSON.parse(
      readFileSync('docs/evidence/tiktok/oembed-set1-raw.json', 'utf8'),
    ) as readonly OEmbedRow[];

    const extractor = createPlaceExtractor(process.env as never);
    console.log(`extractor ${extractor.version} · prompt ${extractor.promptVersion}\n`);

    const resolver = createPlaceResolver(placeResolverEnv(), serviceRoleClient());
    let captionTotal = 0, bothTotal = 0, lookups = 0, placed = 0;
    for (const [id, t] of Object.entries(transcripts)) {
      const row = rows.find((r) => r.json?.embed_product_id === id);
      const caption = row?.json?.title;
      if (caption === undefined) { console.log(`  ?? no caption for ${id}`); continue; }

      const captionPart: ContentPart = { kind: 'caption', text: caption, origin: 'tiktok-oembed-title' };
      const transcriptPart: ContentPart = { kind: 'transcript', text: t.text, origin: 'tiktok-auto-captions' };

      const before = await extractor.extract([captionPart], ctx);
      await new Promise((r) => setTimeout(r, 1500));
      const after = await extractor.extract([captionPart, transcriptPart], ctx);
      await new Promise((r) => setTimeout(r, 1500));

      const names = (x: { candidates: readonly { rawName: string }[] }) =>
        x.candidates.map((c) => c.rawName);
      captionTotal += before.candidates.length;
      bothTotal += after.candidates.length;

      console.log(`@${t.handle}  (${t.words} words of speech)`);
      console.log(`   caption only     ${before.candidates.length}  [${names(before).join(', ')}]`);
      console.log(`   + transcript     ${after.candidates.length}  [${names(after).join(', ')}]`);

      // Resolve only what the transcript ADDED, so the lookup budget buys the answer we need.
      const wasThere = new Set(names(before));
      for (const c of after.candidates) {
        if (wasThere.has(c.rawName)) continue;
        lookups += 1;
        const res = deriveResolution(await resolver.resolve(buildResolveQuery(c, after.cityHint), ctx));
        const label = res.status === 'resolved' ? res.place.name
          : res.status === 'ambiguous' ? `${res.options[0]?.name ?? '?'} (shortlist)` : '—';
        if (res.status !== 'unresolved') placed += 1;
        console.log(`        NEW  ${c.rawName.padEnd(22)} -> ${res.status.padEnd(10)} ${label}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    console.log(`\nTOTAL candidates — caption only: ${captionTotal}   with transcript: ${bothTotal}`);
    console.log(`NEW candidates resolved: ${placed}/${lookups} lookups spent`);
  }, 600_000);
});
