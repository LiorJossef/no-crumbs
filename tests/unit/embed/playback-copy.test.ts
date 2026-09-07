/**
 * **The disclosure copy, checked against the rules that bind it.**
 *
 * Two documents rule on these strings and they pull in different directions, which is why this file
 * exists rather than a review comment:
 *
 *  - `docs/voice-and-vocabulary.md` wants every string to state a fact and stop — sentence case, no
 *    exclamation marks, no implementation vocabulary, TikTok as an adjective (§3.1), and the brand
 *    name on six surfaces of which this is none.
 *  - `docs/archive/security-ruling-embed-playback-2026-08-31.md` §2 wants the copy to be *accurate about
 *    what is being granted rather than soft-pedalled as "just this once"* — which is a demand for
 *    one more clause on a surface whose house style is fewer.
 *
 * Both are satisfiable and the tests below are where that is kept true.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PLAYBACK_COPY, playerFrameTitle } from '@/components/embed/playback-copy';

const STRINGS = Object.entries(PLAYBACK_COPY);

describe('the standing-grant sentence', () => {
  /**
   * **The clause the ruling made a condition of shipping.** §2, verbatim: *"if a user says 'Play
   * here' once, that is not a one-time cost that resets — it is a standing grant good for up to a
   * year, which is exactly why the first-press disclosure has to be accurate about what is being
   * granted rather than soft-pedalled as 'just this once.'"*
   *
   * The negative half — `not just for this video` — is the half doing the work. Without it,
   * `Play here` reads as a decision about one video, which is the reading a reasonable person takes
   * from a button next to one video, and it is wrong by about a year.
   */
  it('says the choice persists, and says it is not per-video', () => {
    expect(PLAYBACK_COPY.standing).toBe(
      'This choice lasts until you change it, not just for this video.',
    );
  });

  it('never suggests the cost is one-off', () => {
    const all = STRINGS.map(([, v]) => v).join(' ').toLowerCase();
    for (const phrase of ['just this once', 'this time only', 'one time', 'for this video only']) {
      expect(all, `copy suggests a one-off cost: "${phrase}"`).not.toContain(phrase);
    }
  });

  /** The two measured facts, in the words a person uses. A cookie's name and a byte count are true
   *  and belong in `docs/security.md`; on this surface they would be our machinery in the user's
   *  sentence. */
  it('states the cookie and the device signal without naming our machinery', () => {
    expect(PLAYBACK_COPY.cookie).toContain('cookie');
    expect(PLAYBACK_COPY.cookie).toContain('a year');
    expect(PLAYBACK_COPY.device).toContain('recognise this device');
    const both = `${PLAYBACK_COPY.cookie} ${PLAYBACK_COPY.device}`;
    for (const leak of ['ttwid', 'chain', 'sdk', 'fingerprint', 'samesite', 'iframe', 'kb']) {
      expect(both.toLowerCase()).not.toContain(leak);
    }
  });

  /** The claim a network trace has to back up, and the reason the refusal is a real option rather
   *  than a courtesy. */
  it('promises the refusal loads nothing here', () => {
    expect(PLAYBACK_COPY.refusal).toBe('Opening on TikTok instead loads nothing here.');
  });

  /**
   * Clearing the stored answer stops future loads. It does not delete a cookie on `tiktok.com` and
   * does not unsend a device signal already sent. A label promising to undo the grant would be the
   * one false sentence on a screen built to tell the truth.
   */
  it('offers to stop rather than to undo', () => {
    expect(PLAYBACK_COPY.stopPlayingHere).toBe('Stop playing videos here');
    for (const word of ['undo', 'revoke', 'delete', 'remove', 'forget']) {
      expect(PLAYBACK_COPY.stopPlayingHere.toLowerCase()).not.toContain(word);
    }
  });
});

describe('voice-and-vocabulary.md', () => {
  /** §4, the ratified list plus the 2026-08-30 additions. Matched as substrings the way
   *  `import-error-copy.test.ts` matches them. */
  it('uses no banned vocabulary', () => {
    const banned = [
      'metadata', 'llm', ' ai ', 'geocode', 'extraction', 'pipeline', 'parse', 'api',
      'endpoint', 'payload', 'token', 'confidence score', 'retry queue', 'worker',
      'oops', 'something went wrong', 'breadcrumb', 'crumb', 'hidden gem', 'bussin',
      'slaps', 'http', 'fetch', 'ingest', 'scrape',
    ];
    for (const [key, value] of STRINGS) {
      const text = ` ${value.toLowerCase()} `;
      for (const word of banned) {
        expect(text.includes(word), `${key} contains banned "${word.trim()}"`).toBe(false);
      }
    }
  });

  /** §5. "Confidence reads as brevity", and a consent surface is the last place to sound excited. */
  it('has no exclamation marks', () => {
    for (const [key, value] of STRINGS) {
      expect(value.includes('!'), `${key} has an exclamation mark`).toBe(false);
    }
  });

  /** §2. Six surfaces may carry the name and this is none of them. */
  it('never says the product’s name', () => {
    for (const [key, value] of STRINGS) {
      expect(value.toLowerCase().includes('no crumbs'), `${key} names the product`).toBe(false);
    }
  });

  /**
   * §3.1, amended 2026-08-31: *"does the word point at the platform, or has it become the name of
   * the thing?"* Pointing is fine — `Open on TikTok`, `TikTok’s player`. Becoming the thing is not
   * — `a TikTok`, `TikToks`, `this TikTok`.
   */
  it('uses TikTok as an adjective or a subject, never as a count noun', () => {
    const asNoun = /\b(a|an|the|this|that|your|my)\s+TikTok\b(?![’']s)/;
    for (const [key, value] of STRINGS) {
      expect(asNoun.test(value), `${key} uses TikTok as a noun`).toBe(false);
      expect(value.includes('TikToks'), `${key} pluralises TikTok`).toBe(false);
    }
    expect(asNoun.test(playerFrameTitle('@someone'))).toBe(false);
  });

  /** §5. Sentence case everywhere: the only capital after the first letter is a proper noun. */
  it('is sentence case', () => {
    const properNouns = new Set(['TikTok', 'TikTok’s']);
    for (const [key, value] of STRINGS) {
      expect(/^[A-Z]/.test(value), `${key} does not start with a capital`).toBe(true);
      const words = value.split(/\s+/);
      words.forEach((word, index) => {
        if (index === 0) return;
        const bare = word.replace(/[.,—]$/u, '');
        if (properNouns.has(bare)) return;
        // A capital is allowed immediately after a full stop.
        if (/[.]$/.test(words[index - 1] ?? '')) return;
        expect(/^[A-Z]/.test(bare), `${key}: "${bare}" is capitalised mid-sentence`).toBe(false);
      });
    }
  });
});

describe('the strings the rest of the product already ships', () => {
  /**
   * `Open on TikTok` appears on the place detail, the review screen, the failure screen and the
   * no-places screen. A second wording for the same destination would be a second thing to learn,
   * so this asserts against the shipped source rather than restating the literal.
   */
  it('reuses the shipped Open on TikTok label verbatim', () => {
    const shipped = readFileSync('src/ui/import/import-error-copy.ts', 'utf8');
    expect(shipped).toContain(`'${PLAYBACK_COPY.openOnTikTok}'`);
  });

  /** The `@handle`'s form `platform-mark.tsx` names as the permitted, attributed one. An iframe
   *  with no title is an unlabelled frame in every screen reader's frame list. */
  it('names the frame after the creator when we hold a handle', () => {
    expect(playerFrameTitle('@joelleuzyel')).toBe('@joelleuzyel’s TikTok video');
    expect(playerFrameTitle(null)).toBe('TikTok video');
    expect(playerFrameTitle('   ')).toBe('TikTok video');
    expect(playerFrameTitle(undefined)).toBe('TikTok video');
  });
});

describe('no state is a dead end', () => {
  /** `import-error-copy.ts`'s rule, applied here: every failure state leaves at least one thing to
   *  do. On this surface `Open on TikTok` renders in all three branches, so the copy's job is only
   *  to be blameless and to say what happened. */
  it('blames nobody and apologises to nobody', () => {
    for (const key of ['blocked', 'unavailable', 'failed'] as const) {
      const text = PLAYBACK_COPY[key].toLowerCase();
      for (const word of ['sorry', 'error', 'failed to', 'invalid', 'unable']) {
        expect(text.includes(word), `${key} contains "${word}"`).toBe(false);
      }
    }
  });

  /** 3002 is not a failure — the video is fine and the next move is a control already on screen —
   *  so the sentence leads with the move and explains second. */
  it('leads the blocked-autoplay line with the next move', () => {
    expect(PLAYBACK_COPY.blocked.startsWith('Press play')).toBe(true);
  });

  /** §5. In-progress takes a real ellipsis, and only while something is genuinely running. */
  it('uses a real ellipsis on the one in-progress string, and nowhere else', () => {
    expect(PLAYBACK_COPY.loading.endsWith('…')).toBe(true);
    for (const [key, value] of STRINGS) {
      if (key === 'loading') continue;
      expect(value.includes('…'), `${key} is not in progress`).toBe(false);
      expect(value.includes('...'), `${key} uses three dots`).toBe(false);
    }
  });
});
