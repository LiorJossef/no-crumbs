/**
 * E2-T0 — the seeding step. Turns a list of pasted links into a **draft corpus the owner
 * corrects** rather than a blank form the owner fills in.
 *
 *   set -a && . ./.env.local && set +a
 *   OWNER_CORPUS_MAX_MODEL_CALLS=60 npx vitest run \
 *     tests/manual/owner-corpus-seed.manual.ts --config tests/manual/vitest.manual.config.ts
 *
 * Input:  `tests/manual/owner-corpus-links.txt` — one TikTok URL per line, `#` for comments.
 * Output: `tests/manual/owner-corpus.json`, plus caption and extraction fixtures on disk.
 *
 * ## Why a seeder exists at all
 *
 * Correcting 50 rows is a different task from writing 50 rows, and that difference is what decides
 * whether this measurement ever gets made. So this fetches every caption, runs the **real shipped
 * extractor** over it, and writes the model's own guess into every row — pre-filled, and marked
 * `classSource: "draft"` so nobody can mistake the model's opinion of itself for evidence.
 *
 * ## What it will never do
 *
 * Overwrite a label. A case whose `classSource` is `"owner"` keeps its `class`, its
 * `expectedIntent` and its `notes` untouched no matter how many times this is re-run; the same
 * holds for `places` under `placesSource: "owner"`. Re-seeding is safe by construction, which is
 * what lets the owner label in several sittings and add links as they go.
 *
 * ## Spend
 *
 * One model call per **new** caption; zero for anything already fixtured, so a re-run after adding
 * five links costs five calls. `OWNER_CORPUS_MAX_MODEL_CALLS` caps it and **defaults to 0** —
 * the Gemini allowance is 500/day shared across every agent and the owner, and a harness that
 * quietly spent 50 of them on first run would be exactly the wrong default.
 *
 * oEmbed fetches are free and unmetered and are on by default; `OWNER_CORPUS_NO_NETWORK=1` turns
 * them off, in which case only the committed E7 probe and existing fixtures are available.
 */

import { describe, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));

import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { filterPlausible } from '@/domain/extraction/plausibility';
import type { PlaceExtractor } from '@/domain/ports';

import {
  CORPUS_PATH,
  LINKS_PATH,
  OwnerCorpusSchema,
  extractionFile,
  getCaption,
  getExtraction,
  rawSourceOf,
  readCorpus,
  readLinks,
  type OwnerCase,
  type OwnerClass,
} from './owner-corpus-lib';

const MAX_MODEL_CALLS = Number.parseInt(process.env.OWNER_CORPUS_MAX_MODEL_CALLS ?? '0', 10);
const ALLOW_OEMBED = process.env.OWNER_CORPUS_NO_NETWORK !== '1';

function buildExtractor(): { extractor: PlaceExtractor | null; error: string | null } {
  try {
    return {
      extractor: createPlaceExtractor({
        ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
        ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
        ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
        ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
        ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
      }),
      error: null,
    };
  } catch (e) {
    return { extractor: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The model's own guess at the class, and the honest limits of it.
 *
 * `sufficient` is the only one of the four the caption alone can evidence: the extractor produced
 * a plausible candidate from the caption text, so the caption named something. The other three are
 * read straight off `postIntent`, which means **the guess between `recoverable` and `futile` is
 * the model's, and it is exactly the distinction that needs a human who watched the video.** That
 * sentence is written into every draft row rather than left in this comment.
 */
function draftClass(candidateCount: number, postIntent: string | null): OwnerClass | null {
  if (candidateCount > 0) return 'sufficient';
  if (postIntent === 'not_a_place') return 'not-a-place';
  if (postIntent === 'place_question') return 'futile';
  if (postIntent === 'place_recommendation') return 'recoverable';
  return null;
}

function draftNoteFor(cls: OwnerClass | null, candidateCount: number, postIntent: string | null): string {
  const basis =
    cls === 'sufficient'
      ? `the extractor produced ${candidateCount} plausible candidate(s) from the caption alone`
      : `the caption produced no candidate; postIntent=${postIntent ?? 'null'}`;
  return (
    `DRAFT (${basis}). ` +
    'A caption cannot tell `recoverable` from `futile` — that needs someone who watched the video. ' +
    'Correct `class` if wrong, then set `classSource` to "owner". Until you do, this row is ' +
    'reported as unadjudicated and counts toward nothing.'
  );
}

describe('E2-T0 — seed a draft owner corpus from pasted links', () => {
  it('fetches every caption, runs the real extractor, and writes a corpus to correct', async () => {
    const links = readLinks();
    const existing = readCorpus();

    console.log(`\nlinks file:  ${LINKS_PATH}  (${links.length} link(s))`);
    console.log(`corpus file: ${CORPUS_PATH}  (${existing.cases.length} existing case(s))`);
    console.log(`model call cap: ${MAX_MODEL_CALLS}   live oEmbed: ${ALLOW_OEMBED ? 'on' : 'off'}\n`);

    if (links.length === 0 && existing.cases.length === 0) {
      console.warn(
        `[owner-corpus] NOTHING TO SEED. Paste one TikTok URL per line into ${LINKS_PATH} and re-run.`,
      );
      return;
    }

    const { extractor, error: extractorError } = buildExtractor();
    if (extractor === null) {
      console.warn(
        `[owner-corpus] no LLM extractor configured (${extractorError ?? 'unknown'}). ` +
          'Captions will still be fetched; no draft class can be produced without one.',
      );
    }

    // Existing cases first, so a label can never be lost by editing the links file.
    const byUrl = new Map<string, OwnerCase>(existing.cases.map((c) => [c.url, c]));
    const order = [...links.filter((u) => !byUrl.has(u)), ...existing.cases.map((c) => c.url)];
    const seen = new Set<string>();
    const ordered = order.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
    // The links file is the running order; anything only in the corpus keeps its place after.
    const finalOrder = [...links.filter((u) => seen.has(u)), ...ordered.filter((u) => !links.includes(u))];

    let modelCalls = 0;
    let oembedCalls = 0;
    const out: OwnerCase[] = [];
    const problems: string[] = [];

    for (const url of finalOrder) {
      const prior = byUrl.get(url);
      const base: OwnerCase = prior ?? { url, classSource: 'draft', placesSource: 'draft' };

      const cap = await getCaption(url, ALLOW_OEMBED);
      if (!cap.ok) {
        problems.push(`${url} — ${cap.reason}`);
        console.log(`  ✗ ${url}\n      ${cap.reason}`);
        out.push({ ...base, ...(cap.externalId !== null ? { externalId: cap.externalId } : {}) });
        continue;
      }
      if (cap.from === 'live') oembedCalls += 1;

      const caption = cap.fixture.caption;
      const raw = rawSourceOf(cap.fixture);
      const allowModel = extractor !== null && modelCalls < MAX_MODEL_CALLS;
      const ext = await getExtraction(extractor, caption, raw, allowModel, base.extractionFixture ?? null);
      if (!ext.ok) {
        problems.push(`${url} — ${ext.reason}`);
        console.log(
          `  ~ ${url}  [${cap.from}]\n      caption: ${caption.replace(/\n/gu, ' ⏎ ').slice(0, 110)}\n      ${ext.reason}`,
        );
        out.push({ ...base, externalId: cap.fixture.externalId, caption });
        continue;
      }
      if (ext.from === 'live') modelCalls += 1;

      const kept = filterPlausible(ext.fixture.candidates, caption).kept;
      const guess = draftClass(kept.length, ext.fixture.postIntent);

      const next: OwnerCase = {
        ...base,
        url,
        externalId: cap.fixture.externalId,
        caption,
        ...(extractor === null ? {} : { extractionFixture: extractionFile(extractor, caption) }),
        // Owner labels are immovable. Everything below only ever fills a draft.
        ...(base.classSource !== 'draft'
          ? {}
          : { class: guess, draftNote: draftNoteFor(guess, kept.length, ext.fixture.postIntent) }),
        ...(base.placesSource !== 'draft'
          ? {}
          : { places: kept.map((k) => ({ name: k.rawName, note: 'DRAFT — the model\'s own guess' })) }),
      };
      out.push(next);

      console.log(
        `  ${base.classSource !== 'draft' ? '•' : '→'} ${url}  [caption:${cap.from} extraction:${ext.from}]`,
      );
      console.log(`      caption: ${caption.replace(/\n/gu, ' ⏎ ').slice(0, 110)}`);
      console.log(
        `      postIntent=${ext.fixture.postIntent ?? 'null'}  kept=[${kept.map((k) => k.rawName).join(' | ')}]  ` +
          `→ draft class ${guess ?? 'null'}${base.classSource !== 'draft' ? `  (KEPT existing label: ${base.class ?? 'null'})` : ''}`,
      );
    }

    const corpus = OwnerCorpusSchema.parse({ _readme: existing._readme, cases: out });
    writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');

    const drafts = out.filter((c) => c.classSource === 'draft').length;
    console.log(`\nwrote ${CORPUS_PATH}`);
    console.log(`  ${out.length} case(s); ${drafts} awaiting adjudication, ${out.length - drafts} adjudicated (classSource owner or e7)`);
    console.log(`  spend this run: ${modelCalls} model call(s) (cap ${MAX_MODEL_CALLS}), ${oembedCalls} live oEmbed fetch(es)`);
    if (extractor !== null) console.log(`  extractor ${extractor.version} · prompt ${extractor.promptVersion}`);
    if (modelCalls >= MAX_MODEL_CALLS && drafts > 0) {
      console.warn(
        `  !! the model-call cap was reached. Rows with no extraction were left unseeded — raise ` +
          `OWNER_CORPUS_MAX_MODEL_CALLS and re-run; already-fixtured rows cost nothing the second time.`,
      );
    }
    if (problems.length > 0) {
      console.warn(`\n  ${problems.length} case(s) could not be seeded:`);
      for (const p of problems) console.warn(`    - ${p}`);
    }
    console.log(
      '\nNEXT: open the corpus, read each `caption` next to its draft `class`, fix the class if it\n' +
        'is wrong, and change `"classSource": "draft"` to `"owner"`. Nothing else is required.\n',
    );
  }, 1_200_000);
});
