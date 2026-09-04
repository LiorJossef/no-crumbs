import { describe, expect, it } from 'vitest';
import { noteExtractor } from '@/integrations/llm/note-extractor';

const signal = () => new AbortController().signal;
const reply = (places: unknown) => {
  const body = { candidates: [{ content: { parts: [{ text: JSON.stringify({ places }) }] } }] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

describe('noteExtractor', () => {
  it('returns nothing for an empty note without calling the model', async () => {
    let called = false;
    const ex = noteExtractor({ apiKey: 'k', fetchImpl: (async () => { called = true; return reply([]); }) as typeof fetch });
    expect(await ex.extract('   ', signal())).toEqual([]);
    expect(called, 'an empty note must not cost a model call').toBe(false);
  });

  it('keeps a name whose evidence really is in the note', async () => {
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => reply([{ rawName: 'Pita Lila', evidence: 'called Pita Lila' }])) as typeof fetch,
    });
    expect(await ex.extract('the bakery is called Pita Lila', signal())).toEqual([
      { rawName: 'Pita Lila', evidence: 'called Pita Lila' },
    ]);
  });

  it('drops a name whose evidence is NOT in the note, however plausible', async () => {
    // The model is *told* to quote the note. This is the check that makes it a property rather
    // than a request — it is the only thing standing between a note and an invented citation.
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => reply([{ rawName: 'Somewhere Else', evidence: 'a phrase never typed' }])) as typeof fetch,
    });
    expect(await ex.extract('the bakery is called Pita Lila', signal())).toEqual([]);
  });

  it('drops a nameless or over-long entry', async () => {
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => reply([{ rawName: '', evidence: 'x' }, { rawName: 'y'.repeat(201), evidence: 'x' }])) as typeof fetch,
    });
    expect(await ex.extract('x', signal())).toEqual([]);
  });

  it('degrades to nothing on a malformed reply rather than failing the import', async () => {
    const bad = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 });
    const ex = noteExtractor({ apiKey: 'k', fetchImpl: (async () => bad) as typeof fetch });
    expect(await ex.extract('a note', signal())).toEqual([]);
  });

  it('reports a 429 as the day’s budget, not as a retryable failure', async () => {
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => new Response('{}', { status: 429 })) as typeof fetch,
    });
    await expect(ex.extract('a note', signal())).rejects.toMatchObject({ code: 'EXTRACTOR_QUOTA_EXHAUSTED' });
  });

  it('reports any other non-OK status as unavailable', async () => {
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch,
    });
    await expect(ex.extract('a note', signal())).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });
});

describe('noteExtractor — the reply shape', () => {
  const bare = (places: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(places) }] } }] }), { status: 200 });

  it('accepts a BARE ARRAY, which is what the model actually returns', async () => {
    // Measured 2026-09-01. The prompt asks for `{"places":[...]}` and this model returns a bare
    // array anyway. The first version of this module read `.places` off it, got `undefined`, and
    // returned nothing — silently, while the identical prompt worked by hand. Asking for a shape
    // is not the same as getting it.
    const ex = noteExtractor({
      apiKey: 'k',
      fetchImpl: (async () => bare([{ rawName: 'Pita Lila', evidence: 'called Pita Lila' }])) as typeof fetch,
    });
    expect(await ex.extract('the bakery is called Pita Lila', signal())).toEqual([
      { rawName: 'Pita Lila', evidence: 'called Pita Lila' },
    ]);
  });
});
