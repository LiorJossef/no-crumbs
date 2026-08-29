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

import { PROMPT_VERSION, SYSTEM_PROMPT } from '@/integrations/llm/prompt';

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

describe('PROMPT_VERSION', () => {
  it('moved off p13, because the prompt text changed and the cache is keyed on it', () => {
    // `extractions (source_id, model, prompt_version)`: reusing the key serves an answer produced
    // under the old rule to a question asked under the new one.
    expect(PROMPT_VERSION.startsWith('p13-')).toBe(false);
    expect(PROMPT_VERSION).toBe('p14-s4');
  });
});
