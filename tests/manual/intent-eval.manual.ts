/**
 * E2-T3-EVAL — does the model actually classify post intent correctly?
 * Runs the REAL shipped extractor over the 16 committed oEmbed captions.
 * No TikTok calls: captions are already saved in the evidence file.
 */
import { readFileSync } from 'node:fs';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
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

const ctx: OpCtx = {
  signal: new AbortController().signal,
  importId: null,
  log: { event: () => {} },
};

async function main() {
  const raw = JSON.parse(readFileSync('docs/evidence/tiktok/oembed-set1-raw.json', 'utf8')) as any[];
  const extractor = createPlaceExtractor(process.env as never);
  console.log(`extractor ${extractor.version} · prompt ${extractor.promptVersion}\n`);

  let correct = 0, n = 0, nulls = 0;
  const confusion: Record<string, Record<string, number>> = {};
  const rows: string[] = [];

  for (const entry of raw) {
    const caption: string | undefined = entry.json?.title;
    const handle: string | undefined = entry.json?.author_unique_id;
    if (caption === undefined || handle === undefined) continue;
    const expected = EXPECTED[handle];
    if (expected === undefined) { console.log(`  ?? no label for @${handle}`); continue; }

    let got: string | null = null, cands = -1, err = '';
    try {
      const r = await extractor.extract([{ kind: 'caption', text: caption, origin: 'tiktok-oembed-title' }], ctx);
      got = (r as any).postIntent ?? null;
      cands = r.candidates.length;
    } catch (e) { err = e instanceof Error ? e.message : String(e); }

    n += 1;
    if (got === null) nulls += 1;
    const ok = got === expected;
    if (ok) correct += 1;
    (confusion[expected] ??= {})[String(got)] = ((confusion[expected] ??= {})[String(got)] ?? 0) + 1;
    rows.push(`${ok ? '✓' : '✗'} @${handle.padEnd(24)} expected ${expected.padEnd(20)} got ${String(got).padEnd(20)} candidates=${cands}${err ? '  ERR ' + err.slice(0, 60) : ''}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  rows.forEach((r) => console.log(r));
  console.log(`\naccuracy ${correct}/${n} = ${((correct / n) * 100).toFixed(0)}%   nulls ${nulls}`);
  console.log('\nconfusion (expected → got):');
  for (const [exp, got] of Object.entries(confusion)) {
    console.log(`  ${exp.padEnd(20)} ${JSON.stringify(got)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
