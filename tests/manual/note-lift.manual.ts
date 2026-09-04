/**
 * E2-T2-EVAL — what the person who watched the video is worth.
 *
 *   set -a && . ./.env.local && set +a
 *   npx vitest run --config tests/manual/vitest.manual.config.ts tests/manual/note-lift.manual.ts --reporter=verbose
 */
import { describe, it } from 'vitest';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { noteExtractor } from '@/integrations/llm/note-extractor';
import type { OpCtx } from '@/domain/ports';

const ctx: OpCtx = { signal: new AbortController().signal, importId: null, log: { event: () => {} } };

/** Real corpus captions that yield nothing, with the note a person who watched would type. */
const CASES: readonly (readonly [string, string, string])[] = [
  ['@yallabikestlv', 'The best coffee in Tel Aviv is only 9 shekels?! They also have some of the best pizza… #yallabikes #telaviv', 'the bakery is called Pita Lila'],
  ['@emshelx', 'my Italian friend told me not to make a tiktok about this london restaurant because he knows its the best Italian in London', 'he never says it but the sign said Bocca di Lupo'],
  ['@sivanskitchen', 'The best place in all of Tel Aviv 🇮🇱 Come hungry with money to spend #shukhacarmel #telaviv', 'the donut stall in the shuk, Roladin'],
  ['@control-no-name', 'coffee in tlv >', 'it was really nice, we sat outside'],
  ['@control-city', 'Tel Aviv🇮🇱 >', 'somewhere in tel aviv'],
];

describe('E2-T2-EVAL — the note the importer types', () => {
  it('reads the note with a call of its own, and never invents one', async () => {
    const caption = createPlaceExtractor(process.env as never);
    const note = noteExtractor({ apiKey: process.env.GEMINI_API_KEY ?? '' });
    console.log(`caption ${caption.promptVersion} · note ${note.promptVersion}\n`);

    let capTotal = 0, noteTotal = 0, postsBefore = 0, postsAfter = 0;
    for (const [handle, text, userNote] of CASES) {
      const fromCaption = await caption.extract(
        [{ kind: 'caption', text, origin: 'tiktok-oembed-title' }], ctx,
      );
      await new Promise((r) => setTimeout(r, 900));
      const fromNote = await note.extract(userNote, ctx.signal);
      await new Promise((r) => setTimeout(r, 900));

      capTotal += fromCaption.candidates.length;
      noteTotal += fromNote.length;
      if (fromCaption.candidates.length > 0) postsBefore += 1;
      if (fromCaption.candidates.length + fromNote.length > 0) postsAfter += 1;

      console.log(`${handle}`);
      console.log(`   caption  ${fromCaption.candidates.length}  [${fromCaption.candidates.map((c) => c.rawName).join(', ')}]`);
      console.log(`   note     ${fromNote.length}  [${fromNote.map((c) => c.rawName).join(', ')}]   "${userNote}"`);
    }
    console.log(`\nposts yielding a candidate: ${postsBefore}/${CASES.length} -> ${postsAfter}/${CASES.length}`);
    console.log(`candidates: caption ${capTotal}, note added ${noteTotal}`);
  }, 600_000);
});
