/**
 * E2-T3-EVAL — does the model actually classify post intent correctly?
 * Runs the REAL shipped extractor over the 16 committed oEmbed captions.
 * No TikTok calls: captions are already saved in the evidence file.
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { createPlaceResolver, placeResolverEnv, resolverProviderFor } from '@/integrations/places/place-resolver-factory';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { buildResolveQuery, deriveResolution } from '@/domain/import/pipeline';
import { addressScore } from '@/domain/places/score';
import type { OpCtx } from '@/domain/ports';

const EXPECTED: Record<string, 'place_recommendation' | 'place_question' | 'not_a_place'> = {
  briancantstopeating: 'place_recommendation',   // "6 must try spots in Tokyo" — venues in video
  nom_life: 'place_recommendation',              // list video, recs in video
  petsmeowwoof: 'not_a_place',                   // cats
  panosliceapp: 'not_a_place',                   // app promo
  theyoushouldknowpodcast: 'not_a_place',        // hashtags only
  marielleisrael: 'place_question',              // "Drop cafe recs below pls"
  muchmorethanmatcha: 'place_recommendation',    // Cafe Fiori + street
  yallabikestlv: 'place_recommendation',         // venue spoken/on-screen
  'travel.by.ann': 'place_recommendation',       // Nomena Roasters + street
  zachmargs: 'not_a_place',                      // comedy
  joiceglobal: 'not_a_place',                    // repost of comedy
  alexandramoulavi: 'place_recommendation',      // venue in video
  ysabellahazan: 'place_recommendation',         // "best coffee shops in TLV"
  gadderhq: 'place_question',                    // "What's the best hidden gem restaurant?"
  exploringlondon: 'place_recommendation',       // 8 venues named
  emshelx: 'place_question',                     // name deliberately withheld
};

/** The committed probe rows in `oembed-set1-raw.json`: a request envelope wrapping TikTok's own
 *  oEmbed payload. Only the two fields this harness reads are modelled — the file carries timing
 *  and header diagnostics besides, and typing those would be inventing a contract for data we
 *  only ever read two keys out of. */
interface OEmbedProbeRow {
  readonly json?: {
    readonly title?: string;
    readonly author_unique_id?: string;
  };
}

const ctx: OpCtx = {
  signal: new AbortController().signal,
  importId: null,
  log: { event: () => {} },
};

describe('E2-T3-EVAL — postIntent accuracy and end-to-end yield', () => {
  it('runs the real extractor and resolver over the 16 committed captions', async () => {
  const raw = JSON.parse(
    readFileSync('docs/evidence/tiktok/oembed-set1-raw.json', 'utf8'),
  ) as readonly OEmbedProbeRow[];
  const extractor = createPlaceExtractor(process.env as never);
  const db = serviceRoleClient();
  const resolver = createPlaceResolver(placeResolverEnv(), db);
  const { provider, reason } = resolverProviderFor(placeResolverEnv());
  console.log(`extractor ${extractor.version} · prompt ${extractor.promptVersion}`);
  console.log(`resolver  ${provider} (${reason})\n`);
  let lookups = 0, resolved = 0, ambiguous = 0, unresolved = 0;
  const postsWithAPlace = new Set<string>();

  let correct = 0, n = 0, nulls = 0;
  const confusion: Record<string, Record<string, number>> = {};
  const rows: string[] = [];

  for (const entry of raw) {
    const caption = entry.json?.title;
    const handle = entry.json?.author_unique_id;
    if (caption === undefined || handle === undefined) continue;
    const expected = EXPECTED[handle];
    if (expected === undefined) { console.log(`  ?? no label for @${handle}`); continue; }

    let got: string | null = null, cands = -1, err = '';
    const detail: string[] = [];
    try {
      const r = await extractor.extract([{ kind: 'caption', text: caption, origin: 'tiktok-oembed-title' }], ctx);
      got = r.postIntent;
      cands = r.candidates.length;
      for (const c of r.candidates) {
        lookups += 1;
        const raw = await resolver.resolve(buildResolveQuery(c, r.cityHint), ctx);
        const res = deriveResolution(raw);
        if (res.status === 'resolved') { resolved += 1; postsWithAPlace.add(handle); }
        else if (res.status === 'ambiguous') { ambiguous += 1; postsWithAPlace.add(handle); }
        else unresolved += 1;
        const { band, score, margin } = raw.confidence;
        const top3 = raw.shortlist.slice(0, 3).map((p) => `${p.place.name}[${p.score.toFixed(3)}]`).join('  ');
        detail.push(
          `      ${c.rawName.padEnd(24)} ${band.padEnd(9)} score=${score.toFixed(3)} margin=${margin === null ? ' null' : margin.toFixed(3)}`,
        );
        detail.push(`         top: ${top3}`);
        // Recomputed through the exported function rather than read off the row: `RankedPlace`
        // does not declare an `addressScore` field, and reading one that happens to exist at
        // runtime is how a harness starts lying about a type.
        const t0 = raw.shortlist[0];
        if (c.addressHint !== null && t0 !== undefined) {
          const addr = addressScore(c.addressHint, t0.place.addressLine);
          detail.push(
            `         addr: hint=${JSON.stringify(c.addressHint)} candidate=${JSON.stringify(t0.place.addressLine)} addressScore=${addr === null ? 'null' : addr.toFixed(3)}`,
          );
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) { err = e instanceof Error ? e.message : String(e); }

    n += 1;
    if (got === null) nulls += 1;
    const ok = got === expected;
    if (ok) correct += 1;
    (confusion[expected] ??= {})[String(got)] = ((confusion[expected] ??= {})[String(got)] ?? 0) + 1;
    rows.push(`${ok ? '✓' : '✗'} @${handle.padEnd(24)} expected ${expected.padEnd(20)} got ${String(got).padEnd(20)} candidates=${cands}${err ? '  ERR ' + err.slice(0, 60) : ''}`);
    detail.forEach((d) => rows.push(d));
    await new Promise((r) => setTimeout(r, 400));
  }

  rows.forEach((r) => console.log(r));
  console.log(`\naccuracy ${correct}/${n} = ${((correct / n) * 100).toFixed(0)}%   nulls ${nulls}`);
  console.log(`\nEND TO END — the number the product is judged on`);
  console.log(`  posts yielding at least one matched place: ${postsWithAPlace.size}/${n}`);
  console.log(`  provider lookups spent: ${lookups}  (resolved ${resolved}, shortlist ${ambiguous}, no match ${unresolved})`);
  console.log('\nconfusion (expected → got):');
  for (const [exp, got] of Object.entries(confusion)) {
    console.log(`  ${exp.padEnd(20)} ${JSON.stringify(got)}`);
  }
  }, 600_000);
});
