/**
 * The hashtag rule in `SYSTEM_PROMPT`, tested at the only level it can be tested deterministically:
 * the text of the request we send.
 *
 * **These assertions do not show that the model obeys the rule.** They show that the rule is
 * present, that its worked examples say what they are supposed to say, and that a future edit
 * cannot quietly move one of the five known rejects into the positive-example section. Obedience is
 * a measured property and needs a live run against real captions; nothing here substitutes for it.
 */
import { describe, expect, it } from 'vitest';

import { POST_INTENTS } from '@/domain/extraction/schema';
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from '@/integrations/llm/prompt';

/** The five tags the rule must go on rejecting, all from one real caption (`p9`-era note). */
const KNOWN_REJECT_TAGS = [
  '#tokyofood',
  '#ביקריבמרכז',
  '#עגלתקפהבמרכז',
  '#ביקריבשרון',
  '#עגלתקפהבשישי',
] as const;

/** Everything from "A hashtag CAN become a candidate" onwards — the positive-example section. */
const EXCEPTION_SECTION_MARKER = 'A hashtag CAN become a candidate';

function exceptionSection(): string {
  const at = SYSTEM_PROMPT.indexOf(EXCEPTION_SECTION_MARKER);
  expect(at).toBeGreaterThan(-1);
  return SYSTEM_PROMPT.slice(at);
}

describe('SYSTEM_PROMPT hashtag rule', () => {
  it('still lists all five known rejects in the reject rule', () => {
    const rejectRule = SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf(EXCEPTION_SECTION_MARKER));
    for (const tag of KNOWN_REJECT_TAGS) {
      expect(rejectRule).toContain(tag);
    }
  });

  it('never presents one of the five rejects as a positive example', () => {
    // The guard on the LIVE-HASHTAG-1 change: widening the exception must not pull a reject across
    // the line. `#נומיכפרמונש` and `#בראסרי18` are the only tags the exception section endorses.
    const section = exceptionSection();
    for (const tag of KNOWN_REJECT_TAGS) {
      expect(section).not.toContain(tag);
    }
  });

  it('carries the category-plus-number worked example that the production miss needed', () => {
    // `#בראסרי18` ("Brasserie 18") was rejected in production. The rule already covered it by the
    // letter — "18" is not a category, a place or a time — but every illustration paired a category
    // with another *word*, so the pattern had nothing to match against.
    const section = exceptionSection();
    expect(section).toContain('#בראסרי18');
    expect(section).toContain('Bar 51');
  });

  it('tells the model that digits count as part of "EVERY word"', () => {
    expect(SYSTEM_PROMPT).toContain('digits included');
  });

  it('bounds the number exception so a year or a count does not become a venue', () => {
    // Without this, "#tokyo2025" and "#top10restaurants" match "category word + number" exactly as
    // well as "#בראסרי18" does. The exception is for names, not for every tag containing a digit.
    const section = exceptionSection();
    expect(section).toContain('#tokyo2025');
    expect(section).toContain('#top10restaurants');
  });
});

/**
 * The `postIntent` rule (`p15`, E2-T3). These assert what the prompt *asks for*, which is all a
 * unit test can reach — **whether the model obeys it is unmeasured** and needs a live run against
 * a hand-labelled set.
 */
describe('SYSTEM_PROMPT postIntent rule', () => {
  it('offers exactly the three values, and permits null', () => {
    for (const intent of POST_INTENTS) expect(SYSTEM_PROMPT).toContain(intent);
    // The model must be able to decline. The Zod side reads anything it does not recognise as
    // null anyway, so a prompt that forbade null would only produce a confident guess instead.
    expect(SYSTEM_PROMPT).toMatch(/null if you genuinely cannot tell/);
  });

  it('states that place_recommendation with ZERO candidates is correct', () => {
    // The whole point of the field, and the one thing the rest of this prompt argues against:
    // every rule above it trains the model towards an empty candidate list, so without this said
    // out loud an empty list would drag the classification to `not_a_place`.
    expect(SYSTEM_PROMPT).toContain('ZERO candidates');
    expect(SYSTEM_PROMPT).toContain('6 Must try spots in Tokyo Japan!');
    expect(SYSTEM_PROMPT).toContain('Do not talk yourself out of place_recommendation');
  });

  it('carries the corpus examples for the question and not-a-place cases', () => {
    // Copied verbatim from the hand-labelled corpus in
    // `docs/evidence/tiktok/07-caption-content-scoring.md` (rows 1, 2, 3, 6, 8, 10, 13, 14) —
    // real captions rather than invented ones, matching this prompt's house style of measured
    // examples over abstractions. Verbatim matters: a paraphrase drifts from the thing measured.
    expect(SYSTEM_PROMPT).toContain('Drop cafe recs below pls #telaviv #aroma');
    expect(SYSTEM_PROMPT).toContain("What's the best hidden gem restaurant in London?");
    expect(SYSTEM_PROMPT).toContain('POV: You try to order coffee in Tel Aviv');
    expect(SYSTEM_PROMPT).toContain('a cat video');
  });

  it('tells the model the field cannot change the candidate list', () => {
    // Constraint 1 restated where the model can see it: decide the candidates first, then say
    // what kind of post it was. A wrong classification must cost a sentence, never a place.
    expect(SYSTEM_PROMPT).toContain('"postIntent" NEVER changes the candidate list');
  });

  it('asks for postIntent in the per-call user prompt too, empty list included', () => {
    const user = buildUserPrompt('a caption', '<<<X>>>');
    expect(user).toContain('postIntent');
    expect(user).toContain('empty candidates list is');
  });
});

describe('PROMPT_VERSION', () => {
  it('moved off p14, because the prompt text changed and the cache is keyed on it', () => {
    // `extractions (source_id, model, prompt_version)`: reusing the key serves an answer produced
    // under the old rule to a question asked under the new one.
    expect(PROMPT_VERSION.startsWith('p13-')).toBe(false);
    expect(PROMPT_VERSION.startsWith('p14-')).toBe(false);
    // Both halves move for `p15`: a new question *and* a new response field to carry the answer.
    // `p16` (2026-08-31): prompt text only — the schema is unchanged at `s5`, so only the left
    // half moves. The rule added is that a trailing question about *where to go next* does not make
    // a recommendation into a question, measured on a real caption that was misread as one.
    // `p17` (2026-09-02, E-T3): prompt text only again — a tagged business written out with spaces
    // (`@The Miners Coffee`) is a venue, while a bare `@username` is still never one.
    expect(PROMPT_VERSION).toBe('p17-s5');
  });
});
