import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseStoredCandidates } from '@/domain/import/stored-candidates';
import {
  EXTRACTION_SCHEMA_VERSION,
  ExtractionResultSchema,
  POST_INTENTS,
  coercePostIntent,
  parseExtractionResultPartial,
  type PostIntent,
} from '@/domain/extraction/schema';

/**
 * `postIntent` (schema v5, prompt `p15`, E2-T3) — what kind of post this was.
 *
 * Two things are under test here, and neither of them is whether the model classifies correctly.
 *
 *  1. **It cannot fail a parse.** Absent, `null`, an unrecognised string, a number, an object: all
 *     of them read as `null` and leave every candidate exactly where it was. `extractions` is
 *     cached on `(source_id, model, prompt_version)`, and while the `p14-s4` -> `p15-s5` bump means
 *     no pre-v5 row can be served under the current key, that is a property of the cache key rather
 *     than of this schema — the same schema parses the model's live reply, and a model that omits
 *     the key must not cost a caption its places.
 *  2. **It cannot change the candidates.** The constraint on `PostIntentSchema` is that this field
 *     may only ever ADD an explanation, never suppress, drop, filter, gate or reorder a candidate.
 *     The tests at the bottom hold the whole parsed candidate list identical across all five
 *     possible values of the field, including the adversarial pairing — `not_a_place` alongside two
 *     perfectly good venues.
 *
 * **The model's accuracy at this classification is unmeasured.** No live call was made for this
 * change; measuring it needs a hand-labelled set and a live run, which is a separate task.
 */

/** A minimal well-formed candidate. Fields are all present because `RawPlaceCandidateSchema` has
 *  no optional properties. */
function candidate(rawName: string) {
  return {
    rawName,
    cityHint: 'Tel Aviv',
    countryHint: null,
    areaHint: null,
    categoryHint: 'cafe',
    addressHint: null,
    evidence: rawName,
    modelConfidence: 0.9,
    identifiedName: null,
    nameVariants: [],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
  };
}

/** A full v5 response. */
function response(candidates: unknown[], postIntent: unknown) {
  return { candidates, cityHint: 'Tel Aviv', postIntent };
}

/** The same response with **no `postIntent` key at all** — a separate function rather than an
 *  optional parameter, so "absent" can never be confused with "present and `undefined`". This is
 *  the `p14-s4` wire shape, and the shape of every `extractions` row written before 2026-08-31. */
function responseWithoutIntent(candidates: unknown[]) {
  return { candidates, cityHint: 'Tel Aviv' };
}

describe('postIntent — the three values', () => {
  it.each([...POST_INTENTS])('carries %s through ExtractionResultSchema', (intent) => {
    const parsed = ExtractionResultSchema.safeParse(response([candidate('Cafe Fiori')], intent));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.postIntent).toBe(intent);
  });

  it.each([...POST_INTENTS])('carries %s through parseExtractionResultPartial', (intent) => {
    const parsed = parseExtractionResultPartial(response([candidate('Cafe Fiori')], intent));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.postIntent).toBe(intent);
  });

  it('carries place_recommendation on a ZERO-candidate response, which is the point of the field', () => {
    // A caption naming nothing under a video that recommends six venues out loud. This pairing is
    // the whole reason the field exists — every other rule in the prompt trains the model towards
    // an empty list, and an empty list must not drag the intent to `not_a_place`.
    const parsed = parseExtractionResultPartial(response([], 'place_recommendation'));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.candidates).toEqual([]);
    expect(parsed.ok && parsed.value.postIntent).toBe('place_recommendation');
  });

  it('separates the two zero-candidate cases a single screen used to conflate', () => {
    // "Drop cafe recs below pls #telaviv" vs "6 Must Try Spots in Tokyo": identical extraction
    // output (nothing), different things to say to a person. Before this field the engine had no
    // way to tell them apart except "zero candidates", measured at 0.33-0.57 precision.
    const question = parseExtractionResultPartial(response([], 'place_question'));
    const recommendation = parseExtractionResultPartial(response([], 'place_recommendation'));
    expect(question.ok && question.value.candidates).toEqual([]);
    expect(recommendation.ok && recommendation.value.candidates).toEqual([]);
    expect(question.ok && question.value.postIntent).not.toBe(
      recommendation.ok && recommendation.value.postIntent,
    );
  });
});

describe('postIntent — absence and junk never fail a parse', () => {
  it('reads an ABSENT key as null and keeps every candidate', () => {
    // The `p14-s4` response shape, byte for byte: no `postIntent` key at all. This is also the
    // shape of every `extractions` row written before 2026-08-31.
    const cached = responseWithoutIntent([candidate('Cafe Fiori'), candidate('Kohi')]);
    expect('postIntent' in cached).toBe(false);

    const parsed = parseExtractionResultPartial(cached);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.postIntent).toBeNull();
    expect(parsed.ok && parsed.value.candidates.map((c) => c.rawName)).toEqual(['Cafe Fiori', 'Kohi']);
  });

  it('reads an absent key as null under ExtractionResultSchema too', () => {
    // The reference shape is deliberately looser here than the JSON Schema the model is handed:
    // the model is told `postIntent` is required, and a reply that omits it anyway is still a
    // reply we can read.
    const parsed = ExtractionResultSchema.safeParse(responseWithoutIntent([candidate('Cafe Fiori')]));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.postIntent).toBeNull();
  });

  it('reads an explicit null as null', () => {
    const parsed = parseExtractionResultPartial(response([candidate('Cafe Fiori')], null));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.postIntent).toBeNull();
    expect(parsed.ok && parsed.value.candidates).toHaveLength(1);
  });

  it('reads an UNRECOGNISED string as null and keeps every candidate', () => {
    // A fourth value the model invented. The failure this test forbids is the whole response
    // becoming EXTRACTOR_INVALID_OUTPUT over a word in a field that only ever adds a sentence.
    const parsed = parseExtractionResultPartial(
      response([candidate('Cafe Fiori'), candidate('Kohi')], 'restaurant_review'),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.postIntent).toBeNull();
    expect(parsed.ok && parsed.value.candidates.map((c) => c.rawName)).toEqual(['Cafe Fiori', 'Kohi']);
  });

  it.each([
    ['a number', 7],
    ['an object', { intent: 'place_question' }],
    ['an array', ['place_question']],
    ['a boolean', true],
    ['an empty string', ''],
    ['a near miss in casing', 'Place_Recommendation'],
    ['a near miss in spacing', 'place recommendation'],
  ])('reads %s as null rather than failing', (_label, value) => {
    const parsed = parseExtractionResultPartial(response([candidate('Cafe Fiori')], value));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.postIntent).toBeNull();
    expect(parsed.ok && parsed.value.candidates).toHaveLength(1);
  });

  it('coercePostIntent is the single decision, and it accepts exactly the three values', () => {
    for (const intent of POST_INTENTS) expect(coercePostIntent(intent)).toBe(intent);
    for (const junk of [undefined, null, '', 'other', 0, {}, [], NaN]) {
      expect(coercePostIntent(junk)).toBeNull();
    }
  });
});

/**
 * Constraint 1, in code. `postIntent` may only ever ADD an explanation — it must never suppress,
 * drop, filter, gate or reorder a candidate. These tests are what makes a future code path that
 * branches on it a red suite rather than a review comment.
 */
describe('postIntent never changes the candidate list', () => {
  const values: readonly (PostIntent | null | string)[] = [...POST_INTENTS, null, 'nonsense'];

  it('yields byte-identical candidates across every possible value', () => {
    const shape = [candidate('Cafe Fiori'), candidate('Kohi'), candidate('Rustico')];
    const results = values.map((value) => {
      const parsed = parseExtractionResultPartial(response(shape, value));
      expect(parsed.ok).toBe(true);
      return parsed.ok ? parsed.value.candidates : null;
    });
    const absent = parseExtractionResultPartial(responseWithoutIntent(shape));
    expect(absent.ok).toBe(true);

    for (const candidates of results) {
      expect(candidates).toEqual(absent.ok ? absent.value.candidates : null);
    }
  });

  it('keeps three real venues on a post the model called not_a_place', () => {
    // The adversarial pairing, and the one that would hurt if anything downstream ever gated on
    // this value: the model misreads the post AND the caption named three places. Order and count
    // both survive.
    const parsed = parseExtractionResultPartial(
      response([candidate('Cafe Fiori'), candidate('Kohi'), candidate('Rustico')], 'not_a_place'),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.candidates.map((c) => c.rawName)).toEqual([
      'Cafe Fiori',
      'Kohi',
      'Rustico',
    ]);
    expect(parsed.ok && parsed.value.postIntent).toBe('not_a_place');
  });

  it('leaves the dropped/truncated/total accounting untouched', () => {
    // One malformed element among three, under every intent value: the salvage counts must be the
    // same numbers they would be with no `postIntent` at all.
    const withBadElement = [candidate('Cafe Fiori'), { rawName: 'x' }, candidate('Kohi')];
    for (const value of [...values, undefined]) {
      const parsed =
        value === undefined
          ? parseExtractionResultPartial(responseWithoutIntent(withBadElement))
          : parseExtractionResultPartial(response(withBadElement, value));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.candidates).toHaveLength(2);
      expect(parsed.value.dropped).toBe(1);
      expect(parsed.value.truncated).toBe(0);
      expect(parsed.value.total).toBe(3);
    }
  });

  it('does not rescue a response that was already unreadable', () => {
    // The other direction of the same rule: a valid `postIntent` is not evidence about anything
    // else in the reply. An envelope we cannot read is still a hard failure.
    const parsed = parseExtractionResultPartial({
      candidates: 'not an array',
      cityHint: null,
      postIntent: 'place_recommendation',
    });
    expect(parsed.ok).toBe(false);
  });

  it('does not rescue an all-invalid candidate list', () => {
    // `[]` is a meaningful answer in this product — "this caption names no place" is the modal
    // outcome and has its own screen — so a broken reply must never impersonate it, whatever the
    // model said about the post.
    const parsed = parseExtractionResultPartial(
      response([{ rawName: 'x' }, { rawName: 'y' }], 'place_recommendation'),
    );
    expect(parsed.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Constraint 2, on the path where breaking it costs money
 * ------------------------------------------------------------------------------------------- */

/**
 * The tests above cover the *response* parse. This one covers the **cached row** parse, which is
 * the one a future reader is most likely to undo and the only one with a bill attached.
 *
 * `extractions.candidates` holds candidate objects and nothing else — `postIntent` is
 * response-level, so it was never stored and a `p14-s4` row is byte-identical to a `p15-s5` one.
 * The failure mode is therefore not a parse error, it is silence: if the v5 bump made a stored row
 * stop reading back, `probe/route.ts` would answer every repeat import with a cache miss and buy a
 * fresh paid model call for a caption we have already read. Nothing would look broken.
 */
const P14_STORED_ROW = {
  rawName: 'Cafe Fiori',
  cityHint: 'Tel Aviv',
  countryHint: 'Israel',
  areaHint: 'Florentin',
  categoryHint: 'cafe',
  addressHint: 'Yom Tov St 20',
  evidence: 'Cafe Fiori 📍 Yom Tov St 20, Tel Aviv-Yafo',
  modelConfidence: 0.95,
  identifiedName: 'Cafe Fiori',
  nameVariants: ['קפה פיורי'],
  tags: ['Specialty Coffee'],
  dishes: ['cortado'],
  whyGo: { text: 'Small specialty coffee bar on Yom Tov Street.', groundedIn: 'Yom Tov St 20' },
  coordinates: { lat: 32.0596, lng: 34.7654 },
};

describe('a cached extraction row written before postIntent existed', () => {
  it('reads back with every candidate intact after the v4 -> v5 bump', () => {
    // Three candidates, none of which carries a `postIntent` key, because no stored candidate ever
    // did or ever will. All three must survive.
    const stored = [
      P14_STORED_ROW,
      { ...P14_STORED_ROW, rawName: 'Kohi', identifiedName: 'Kohi Coffee Shop' },
      { ...P14_STORED_ROW, rawName: 'Rustico', identifiedName: 'Rustico' },
    ];
    for (const row of stored) expect('postIntent' in row).toBe(false);

    const result = parseStoredCandidates(stored);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates.map((c) => c.candidate.rawName)).toEqual(['Cafe Fiori', 'Kohi', 'Rustico']);
    // Not merely present — unchanged. The enrichment a user paid for is still on the row.
    expect(result.candidates[0]?.candidate.nameVariants).toEqual(['קפה פיורי']);
    expect(result.candidates[0]?.candidate.whyGo?.text).toBe('Small specialty coffee bar on Yom Tov Street.');
  });

  it('is reported at the current schema version, so the cache gate does not turn every hit into a miss', () => {
    // `probe/route.ts` compares this against `EXTRACTION_SCHEMA_VERSION`. A ladder that still said
    // 4 after the bump would fail that comparison on a perfectly good row — a paid re-call per
    // repeat import, silently. This assertion is derived from the constant on purpose: it must
    // keep holding at v6 without anyone remembering to edit it.
    const result = parseStoredCandidates([P14_STORED_ROW]);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(EXTRACTION_SCHEMA_VERSION);
  });

  it('does not fail a stored row that somehow carries a postIntent key', () => {
    // Nothing writes one, but `z.object` strips unknown keys and a hand-edited or future row must
    // not be a 500 on the confirm path.
    const result = parseStoredCandidates([{ ...P14_STORED_ROW, postIntent: 'not_a_place' }]);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.candidate.rawName).toBe('Cafe Fiori');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Constraint 1, structurally
 * ------------------------------------------------------------------------------------------- */

/**
 * The behavioural tests above show that `postIntent` does not change the candidate list *today*,
 * for the inputs they try. This one shows something stronger and cheaper to trust: **nothing that
 * returns candidates reads the field at all.**
 *
 * It is the same shape of guard as `tests/unit/shell/one-shell.test.ts`, and it strips comments
 * first for the same reason that file does — every site involved here explains itself in prose,
 * and a whole-file grep would match the explanation rather than the code, firing on the
 * documentation of its own success.
 */
const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

/** The six places `postIntent` may appear in **code**. Each is a declaration, a request, a type or
 *  a pass-through; not one of them is a decision. */
const ALLOWED = [
  // Declares the field, the three values and the lenient reader.
  'domain/extraction/schema.ts',
  // The port's return type.
  'domain/ports.ts',
  // Asks the model for it: the prompt text, and the JSON Schema the reply is shaped by.
  'integrations/llm/prompt.ts',
  'integrations/llm/json-schema.ts',
  // Hand it back, unread, beside the candidates.
  'integrations/llm/anthropic.place-extractor.ts',
  'integrations/llm/gemini.place-extractor.ts',
];

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (name) => name.endsWith('.ts') || name.endsWith('.tsx'),
  );
}

function code(relative: string): string {
  return readFileSync(SRC + relative, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no code path can withhold a place because of postIntent', () => {
  it('is read in exactly six files, none of which decides anything', () => {
    const readers = sourceFiles().filter((name) => code(name).includes('postIntent'));
    expect(readers.sort()).toEqual([...ALLOWED].sort());
  });

  it('is absent from every file that filters, resolves, stores or renders a candidate', () => {
    // The import pipeline, the confirm/probe routes, the review screen. If `postIntent` ever
    // appears in one of these, someone is branching on an unmeasured model classification on the
    // path that decides which places a user gets to keep — the one thing this field may not do.
    const decidingLayers = ['domain/import/', 'domain/places/', 'app/', 'components/'];
    for (const name of sourceFiles()) {
      if (!decidingLayers.some((layer) => name.startsWith(layer))) continue;
      expect(code(name), name).not.toContain('postIntent');
    }
  });
});
