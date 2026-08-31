import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  DOMAIN_ERROR_CONSTRUCTORS,
  type DomainErrorCode,
} from '@/domain/errors';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';

import { functionSource, importClientSource } from './import-client-source';
import {
  IMPORT_ERROR_ACTION_LABEL,
  IMPORT_ERROR_COPY,
  PRE_SUBMIT_ERROR_CODES,
  importErrorActions,
  toDomainErrorCode,
  type ImportErrorAction,
} from '@/ui/import/import-error-copy';

/**
 * The defect this file exists to keep fixed: `/import` rendered one screen — "Couldn't read that
 * TikTok / Something went wrong / Try another link" — for all fourteen `DomainErrorCode`s. The
 * type system now makes the map total, so these tests cover what the type system cannot: that the
 * codes `07` §9 says must read *differently* actually do, that no screen offers a recovery the
 * taxonomy says will not work, and that no screen is a dead end.
 */

const CODES = DOMAIN_ERROR_CODES;

/** The only pairs `07` §9 licenses to read identically, quoted in that table:
 *  `RATE_LIMITED_UPSTREAM` is "same copy as timeout", and the two extractor failures are one piece
 *  of news (`domain/errors.ts` gives both the same message). Anything else sharing a headline is
 *  the generic-screen regression coming back. */
const DELIBERATE_DUPLICATE_GROUPS: readonly (readonly DomainErrorCode[])[] = [
  ['UPSTREAM_TIMEOUT', 'RATE_LIMITED_UPSTREAM'],
  ['EXTRACTOR_UNAVAILABLE', 'EXTRACTOR_INVALID_OUTPUT'],
];

function groupOf(code: DomainErrorCode): string {
  const group = DELIBERATE_DUPLICATE_GROUPS.find((g) => g.includes(code));
  return group ? group.join('+') : code;
}

describe('IMPORT_ERROR_COPY — exhaustiveness', () => {
  it('has an entry for every code in DOMAIN_ERROR_CODES, and no extras', () => {
    expect(Object.keys(IMPORT_ERROR_COPY).sort()).toEqual([...CODES].sort());
  });

  it('covers all 13 codes', () => {
    expect(Object.keys(IMPORT_ERROR_COPY)).toHaveLength(13);
  });

  it('gives every entry a kicker, a headline and one body sentence', () => {
    for (const code of CODES) {
      const copy = IMPORT_ERROR_COPY[code];
      expect(copy.kicker.trim(), code).not.toBe('');
      expect(copy.headline.trim(), code).not.toBe('');
      expect(copy.body.trim(), code).not.toBe('');
    }
  });
});

describe('IMPORT_ERROR_COPY — codes that must read differently do', () => {
  it('gives each code its own headline, except the two pairs 07 §9 says share one', () => {
    const byHeadline = new Map<string, DomainErrorCode[]>();
    for (const code of CODES) {
      const headline = IMPORT_ERROR_COPY[code].headline;
      byHeadline.set(headline, [...(byHeadline.get(headline) ?? []), code]);
    }
    for (const [headline, codes] of byHeadline) {
      const groups = new Set(codes.map(groupOf));
      expect(groups.size, `"${headline}" is shared by unrelated codes: ${codes.join(', ')}`).toBe(1);
    }
  });

  it('does not tell the user we could not read the TikTok when we read it fine', () => {
    // NO_CAPTION is an F10 variant in 07 §9, not F9: the post was opened successfully.
    // EXTRACTOR_* are our own step failing after a clean read. None may borrow F9's headline.
    const f9Headline = IMPORT_ERROR_COPY.POST_UNAVAILABLE.headline;
    for (const code of ['NO_CAPTION', 'EXTRACTOR_UNAVAILABLE', 'EXTRACTOR_INVALID_OUTPUT', 'EXTRACTOR_QUOTA_EXHAUSTED'] as const) {
      expect(IMPORT_ERROR_COPY[code].headline, code).not.toBe(f9Headline);
    }
    // EXTRACTOR_QUOTA_EXHAUSTED goes further than not borrowing F9's headline: it says the read
    // worked, in as many words, because the trained response to every other screen in this family
    // is to go and fetch a different link — which fails identically and wastes the afternoon.
    expect(IMPORT_ERROR_COPY.EXTRACTOR_QUOTA_EXHAUSTED.body).toContain('We read it fine.');
  });

  it('keeps UNSUPPORTED_URL distinct from a read failure', () => {
    // A profile/tag/music/live link can never resolve to a post; F9's "we couldn't read it, it's
    // worth a retry" would send the user round a loop that cannot end.
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_URL.headline).not.toBe(
      IMPORT_ERROR_COPY.POST_UNAVAILABLE.headline,
    );
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_URL.actions).not.toContain('retry');
  });

  it('uses no banned implementation vocabulary (ux-architecture §12)', () => {
    const banned = [
      'metadata', 'llm', ' ai ', 'geocode', 'extraction', 'pipeline', 'parse', 'api',
      'endpoint', 'payload', 'token', 'confidence score', 'retry queue', 'worker',
      'oops', 'something went wrong', '429', 'rate limit', 'http', 'server error',
    ];
    for (const code of CODES) {
      const { kicker, headline, body } = IMPORT_ERROR_COPY[code];
      const text = ` ${kicker} ${headline} ${body} `.toLowerCase();
      for (const word of banned) {
        expect(text.includes(word), `${code} contains banned "${word.trim()}"`).toBe(false);
      }
    }
  });
});

describe('IMPORT_ERROR_COPY — recovery actions', () => {
  it('never leaves a screen without a way out', () => {
    for (const code of CODES) {
      expect(IMPORT_ERROR_COPY[code].actions.length, code).toBeGreaterThan(0);
    }
  });

  it('offers Retry on exactly the codes 07 §9 marks retryable', () => {
    for (const code of CODES) {
      const retryableInTaxonomy = DOMAIN_ERROR_CONSTRUCTORS[code]().retryable;
      const offersRetry = IMPORT_ERROR_COPY[code].actions.includes('retry');
      // There is no exception, and `EXTRACTOR_QUOTA_EXHAUSTED` is the case that could have been
      // one: it is `retryable: false` in the taxonomy precisely so that no screen, and nothing
      // downstream of a server response, can put a retry button on a state a retry cannot fix.
      expect(offersRetry, `${code}: retryable=${retryableInTaxonomy}, offersRetry=${offersRetry}`).toBe(
        retryableInTaxonomy,
      );
    }
  });

  it('gives EXTRACTOR_QUOTA_EXHAUSTED exactly one way out, and it is not a second attempt', () => {
    // `product-ruling-quota-copy-2026-08-31.md` R2. Both re-runs — the same link and a different
    // one — spend the same empty allowance, so either button would be the same lie in a smaller
    // font. Leaving is the recovery, and it is the only screen in this family where that is true.
    expect(IMPORT_ERROR_COPY.EXTRACTOR_QUOTA_EXHAUSTED.actions).toEqual(['back_to_map']);
  });

  it('states the quota screen exactly as the ruling fixes it, apostrophes included', () => {
    // Byte-identical to §3. These three strings are not this file's to improve: each word was
    // ruled against a measured fact (the read *did* succeed; a provider ceiling may be per-minute
    // rather than per-day), and paraphrasing any of them reintroduces a promise we cannot keep.
    const copy = IMPORT_ERROR_COPY.EXTRACTOR_QUOTA_EXHAUSTED;
    expect(copy.kicker).toBe('Not right now');
    expect(copy.headline).toBe('We can\u2019t find places right now.');
    expect(copy.body).toBe('We read it fine. Try it again tomorrow.');
    expect(copy.icon).toBe('waiting');
  });

  it('offers the quota screen no retry, no second link and no trip to TikTok', () => {
    // The last of the three is a repo rule the shipped table already follows, stated by the ruling
    // §4: `open_tiktok` appears on exactly the codes where **the read failed**, and is absent from
    // all three where it succeeded. Here it succeeded — pointing at the video would imply the
    // video is the problem, one line under a sentence saying it is not.
    const { actions } = IMPORT_ERROR_COPY.EXTRACTOR_QUOTA_EXHAUSTED;
    for (const forbidden of ['retry', 'another_tiktok', 'open_tiktok', 'open_link'] as const) {
      expect(actions, forbidden).not.toContain(forbidden);
    }
    // And no label for any of them can reach the screen either way.
    const rendered = actions.map((action) => IMPORT_ERROR_ACTION_LABEL[action]);
    for (const label of ['Retry', 'Try another TikTok link', 'Open on TikTok', 'Open the original link']) {
      expect(rendered, label).not.toContain(label);
    }
  });

  it('keeps the transient extractor failures exactly as they were — only the quota case split off', () => {
    // The point of a new code was that the *other* two keep their retry. If this ever fails, the
    // fix widened past the branch it was for.
    for (const code of ['EXTRACTOR_UNAVAILABLE', 'EXTRACTOR_INVALID_OUTPUT'] as const) {
      const copy = IMPORT_ERROR_COPY[code];
      expect(copy.kicker, code).toBe('On our side');
      expect(copy.headline, code).toBe('We read it, but couldn\u2019t work out the places.');
      expect(copy.body, code).toBe('That one\u2019s on us, not on the video. We\u2019ve already got it, so a retry is quick.');
      expect(copy.icon, code).toBe('our-side');
      expect(copy.actions, code).toEqual(['retry', 'another_tiktok']);
    }
  });

  it('sends NOT_AUTHENTICATED to sign-in rather than to another link', () => {
    expect(IMPORT_ERROR_COPY.NOT_AUTHENTICATED.actions[0]).toBe('sign_in');
    expect(IMPORT_ERROR_COPY.NOT_AUTHENTICATED.actions).not.toContain('retry');
  });

  it('makes the forward move primary on NO_CAPTION (§5.3: no Retry)', () => {
    expect(IMPORT_ERROR_COPY.NO_CAPTION.actions[0]).toBe('another_tiktok');
    expect(IMPORT_ERROR_COPY.NO_CAPTION.actions).not.toContain('retry');
  });

  it('never makes a link out of the product the primary action', () => {
    // `open_tiktok` / `open_link` are third-party navigations, not recoveries — a screen whose
    // headline offer is "leave" has not recovered anything.
    for (const code of CODES) {
      expect(['open_tiktok', 'open_link'], code).not.toContain(IMPORT_ERROR_COPY[code].actions[0]);
    }
  });

  it('calls a non-TikTok link what it is', () => {
    // UNSUPPORTED_HOST is the Instagram/YouTube case. Labelling its escape "Open on TikTok" —
    // which is what a single shared `open_tiktok` action would have done — contradicts the very
    // sentence above the button.
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_HOST.actions).toContain('open_link');
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_HOST.actions).not.toContain('open_tiktok');
    expect(IMPORT_ERROR_ACTION_LABEL.open_link).not.toMatch(/TikTok/);
  });

  it('offers no recovery that has no destination yet', () => {
    // `ux-architecture` §5.1/§5.3 both list `Add a place you know` → S8 manual add. S8 is
    // L1-F7-T1 and does not exist; linking to a 404 is worse than the failure being reported.
    const known: readonly ImportErrorAction[] = [
      'retry', 'open_tiktok', 'open_link', 'another_tiktok', 'sign_in', 'back_to_map',
    ];
    for (const code of CODES) {
      for (const action of IMPORT_ERROR_COPY[code].actions) {
        expect(known, `${code} offers an unroutable action`).toContain(action);
      }
    }
  });

  it('labels every action', () => {
    for (const code of CODES) {
      for (const action of IMPORT_ERROR_COPY[code].actions) {
        expect(IMPORT_ERROR_ACTION_LABEL[action].trim(), `${code}/${action}`).not.toBe('');
      }
    }
  });

  it('never lists the same action twice on one screen', () => {
    for (const code of CODES) {
      const actions = IMPORT_ERROR_COPY[code].actions;
      expect(new Set(actions).size, code).toBe(actions.length);
    }
  });
});

describe('importErrorActions — the server’s retryable wins over the table', () => {
  it('drops Retry when the server says this one is not retryable', () => {
    expect(importErrorActions('POST_UNAVAILABLE', true)).toContain('retry');
    expect(importErrorActions('POST_UNAVAILABLE', false)).not.toContain('retry');
  });

  it('never adds a Retry the table withheld, even when the server says retryable', () => {
    expect(importErrorActions('NO_CAPTION', true)).not.toContain('retry');
    expect(importErrorActions('UNSUPPORTED_URL', true)).not.toContain('retry');
    // The one that matters most here: a server sending `retryable: true` — a stale deploy, a
    // proxy, a future bug — must not be able to restore a button the ruling removed.
    expect(importErrorActions('EXTRACTOR_QUOTA_EXHAUSTED', true)).toEqual(['back_to_map']);
  });

  it('still leaves a way out for every code with retry suppressed', () => {
    for (const code of CODES) {
      expect(importErrorActions(code, false).length, code).toBeGreaterThan(0);
    }
  });

  it('never returns a link out of the product in the primary slot, even after dropping a Retry', () => {
    // POST_UNAVAILABLE is the case that makes this real: its table order is
    // [retry, open_tiktok, another_tiktok], so a naive filter would promote a link out of the
    // product into the one mint button on the screen.
    for (const code of CODES) {
      for (const retryable of [true, false]) {
        expect(['open_tiktok', 'open_link'], `${code}/${retryable}`).not.toContain(
          importErrorActions(code, retryable)[0],
        );
      }
    }
    expect(importErrorActions('POST_UNAVAILABLE', false)[0]).toBe('another_tiktok');
  });

  it('keeps the table order when nothing had to be promoted', () => {
    expect(importErrorActions('POST_UNAVAILABLE', true)).toEqual([
      'retry',
      'open_tiktok',
      'another_tiktok',
    ]);
    expect(importErrorActions('NO_CAPTION', false)).toEqual(['another_tiktok', 'open_tiktok']);
  });

  it('returns each action once, whatever the server says', () => {
    for (const code of CODES) {
      for (const retryable of [true, false]) {
        const list = importErrorActions(code, retryable);
        expect(new Set(list).size, `${code}/${retryable}`).toBe(list.length);
      }
    }
  });
});

describe('toDomainErrorCode — the boundary narrowing', () => {
  it('passes every real code through unchanged', () => {
    for (const code of CODES) {
      expect(toDomainErrorCode(code)).toBe(code);
    }
  });

  it('falls back to INTERNAL only for a string outside the taxonomy', () => {
    expect(toDomainErrorCode('SOMETHING_ELSE')).toBe('INTERNAL');
    expect(toDomainErrorCode('')).toBe('INTERNAL');
    expect(toDomainErrorCode('post_unavailable')).toBe('INTERNAL'); // case-sensitive on purpose
  });

  it('is not how the 14 real codes get rendered', () => {
    // The fallback must never be reachable by a code the taxonomy defines — that is what made the
    // old screen generic. Proven by the round trip above plus this count.
    const fellBack = CODES.filter((code) => code !== 'INTERNAL' && toDomainErrorCode(code) === 'INTERNAL');
    expect(fellBack).toEqual([]);
  });
});

/**
 * The single-source pin. `/import` runs `canonicaliseTikTokUrl` on the client and renders three of
 * these codes without ever calling the route, so for a while there were two copy maps: this one,
 * and a hard-coded ternary inside `import-page-client.tsx` that had already drifted from it. These
 * tests are what stop that happening again — the first pins the *list* against the canonicaliser's
 * real behaviour, the last pins that no copy string is duplicated back into the component.
 */
describe('the pre-submit codes are the same map, not a second one', () => {
  /**
   * The component with its comments stripped. Comments are where this change *documents* the copy
   * it replaced ("the primary used to read …"), and a string quoted in a comment is by definition
   * not rendered — matching on it would make the guard fire on its own explanation.
   *
   * "The component" is every file under `src/app/import/`, not one path. This is the guard that
   * stops an error string being re-hardcoded into the screen, and W6-1 moves the failure screen
   * out of `import-page-client.tsx` — after which a path-pinned scan would report a clean result
   * about a file that no longer renders a single error code. See `import-client-source.ts`.
   */
  const CLIENT_SOURCE = importClientSource({ stripComments: true });

  it('is exactly the set canonicaliseTikTokUrl can reject with, minus the inline one', () => {
    const inputs = [
      'https://www.instagram.com/p/abc/',
      'https://youtu.be/abc',
      'https://www.tiktok.com/@someone',
      'https://www.tiktok.com/tag/food',
      'https://www.tiktok.com/music/song-123',
      'https://www.tiktok.com/@someone/live',
      'https://www.tiktok.com/@someone/photo/7300000000000000000',
      'not a link at all',
      '',
      'javascript:alert(1)',
      'https://tiktok.com.evil.io/@someone/video/7300000000000000000',
    ];
    const produced = new Set<string>();
    for (const input of inputs) {
      const result = canonicaliseTikTokUrl(input);
      if (!result.ok) produced.add(result.error.code);
    }
    // MALFORMED_URL is C06 inline field copy (`07` §9), not a screen — the one deliberate omission.
    produced.delete('MALFORMED_URL');
    expect([...produced].sort()).toEqual([...PRE_SUBMIT_ERROR_CODES].sort());
  });

  it('has copy for every pre-submit code', () => {
    for (const code of PRE_SUBMIT_ERROR_CODES) {
      expect(CODES, code).toContain(code);
      expect(IMPORT_ERROR_COPY[code].headline.trim(), code).not.toBe('');
    }
  });

  it('keeps an Instagram link and a TikTok profile link two different pieces of news', () => {
    // The screen this replaced gave both the one sentence. A profile link is not an Instagram
    // link, and the advice that helps is different in each case.
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_HOST.headline).not.toBe(
      IMPORT_ERROR_COPY.UNSUPPORTED_URL.headline,
    );
    expect(IMPORT_ERROR_COPY.UNSUPPORTED_HOST.body).not.toBe(IMPORT_ERROR_COPY.UNSUPPORTED_URL.body);
  });

  it('says nothing about an attempt on a code that can arrive before one is made', () => {
    // This is why one component can serve both moments. If a pre-submit code's copy ever starts
    // claiming we tried and failed, the two screens genuinely diverge and this test says so.
    const claimsAnAttempt = [
      'we couldn', 'we read', 'we opened', 'took too long', 'on our side', 'worth a retry',
      'give it a few minutes', 'signed out',
    ];
    for (const code of PRE_SUBMIT_ERROR_CODES) {
      const { headline, body } = IMPORT_ERROR_COPY[code];
      const text = `${headline} ${body}`.toLowerCase();
      for (const phrase of claimsAnAttempt) {
        expect(text.includes(phrase), `${code} claims an attempt: "${phrase}"`).toBe(false);
      }
    }
  });

  /**
   * Is this string *rendered* by the component — as a quoted literal or a JSX text node — rather
   * than merely appearing somewhere inside it? A plain `includes` is too blunt: `NO_CAPTION`'s
   * kicker is "No caption", and `CaptionPreviewScreen` used to carry an unrelated heading "No
   * caption to search" that contains it — a false positive on a screen that was not rendering the
   * copy map at all. That particular heading was deleted on 2026-08-31 with the dead `n === 0`
   * branches (W1-6), so the collision is currently hypothetical; the substring hazard is not, and
   * a two-word kicker will keep colliding with ordinary prose. This asks the question the guard
   * actually means.
   */
  function rendersLiterally(source: string, text: string): boolean {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      new RegExp(`'${escaped}'`).test(source) ||
      new RegExp(`"${escaped}"`).test(source) ||
      new RegExp(`>\\s*${escaped}\\s*<`).test(source)
    );
  }

  /**
   * The one file exempt from the *kicker* half of the guard below, and only from that half.
   *
   * `spec-no-places-found.md` §5.1 gives the no-places screen's case-A kicker as `No caption`,
   * which is `NO_CAPTION`'s kicker word for word — a collision between two ordinary words, on two
   * screens governed by two different documents. It is the exact false positive `rendersLiterally`
   * above was written to reduce and cannot catch: a two-word kicker will keep colliding with
   * ordinary prose, and the alternative — reading a *success* screen's copy out of the failure map
   * — would couple it to an entry `spec-no-places-found.md` §10.7 records as very likely dead.
   *
   * The exemption is narrow on purpose and it is paid for: the file is still checked against every
   * headline, every body and every action label (the long, distinctive strings that the guard
   * actually exists for), and a test below asserts that `failure-screen.tsx` — the file the guard
   * is really about — is still covered by all four.
   */
  const KICKER_EXEMPT = ['src/app/import/screens/no-places-screen.tsx'];
  const CLIENT_SOURCE_MINUS_EXEMPT = importClientSource({
    stripComments: true,
    exclude: KICKER_EXEMPT,
  });

  it('does not hard-code any of the map’s strings back into the component', () => {
    // The actual regression guard. `RedirectScreen` used to own its own words; anything typed
    // into the component again — a headline, a body, a kicker, an action label — fails here.
    for (const code of CODES) {
      const { kicker, headline, body } = IMPORT_ERROR_COPY[code];
      for (const [what, string] of [['headline', headline], ['body', body]] as const) {
        expect(
          rendersLiterally(CLIENT_SOURCE, string),
          `the import client hard-codes ${code}'s ${what}: "${string}"`,
        ).toBe(false);
      }
      expect(
        rendersLiterally(CLIENT_SOURCE_MINUS_EXEMPT, kicker),
        `the import client hard-codes ${code}'s kicker: "${kicker}"`,
      ).toBe(false);
    }
    for (const label of Object.values(IMPORT_ERROR_ACTION_LABEL)) {
      expect(
        rendersLiterally(CLIENT_SOURCE, label),
        `the import client hard-codes the action label "${label}"`,
      ).toBe(false);
    }
  });

  it('still covers the failure screen itself, which is what the guard is about', () => {
    // The kicker exemption must not quietly become an exemption for the file that renders the copy
    // map. `functionSource` throws unless exactly one file defines `ImportFailureScreen`, so this
    // also fails if the decomposition ever duplicates it.
    const failureScreen = functionSource('ImportFailureScreen');
    expect(KICKER_EXEMPT).toEqual(['src/app/import/screens/no-places-screen.tsx']);
    for (const code of CODES) {
      const { kicker, headline, body } = IMPORT_ERROR_COPY[code];
      for (const string of [kicker, headline, body]) {
        expect(rendersLiterally(failureScreen, string), `${code}: "${string}"`).toBe(false);
      }
    }
  });

  it('the guard above actually catches a re-hardcoded string', () => {
    // A guard that cannot fail is decoration. Three shapes, because that is what the component
    // could plausibly regress to.
    const { headline } = IMPORT_ERROR_COPY.UNSUPPORTED_HOST;
    expect(rendersLiterally(`const copy = '${headline}';`, headline)).toBe(true);
    expect(rendersLiterally(`<h1>${headline}</h1>`, headline)).toBe(true);
    expect(rendersLiterally(`<h1>\n  ${headline}\n</h1>`, headline)).toBe(true);
    expect(rendersLiterally('nothing like it here', headline)).toBe(false);
  });

  it('leaves no reference to the removed second screen', () => {
    expect(CLIENT_SOURCE).not.toContain('function RedirectScreen');
    // Its headline and its primary, both of which named S8 manual add (`L1-F7-T1`) — a
    // destination that does not exist. The button called `reset()`.
    expect(CLIENT_SOURCE).not.toContain('Add it by hand instead');
    expect(CLIENT_SOURCE).not.toContain('Add it by hand');
    // `NoPlacesScreen` carried the identical defect — an `Add manually →` primary wired to
    // `reset()` — and has now lost it too. §5.3 does want a manual-add action on that screen, but
    // only once S8 (`L1-F7-T1`) exists to receive it; until then no screen in this flow may name
    // it. This is the whole-file version of that rule.
    expect(CLIENT_SOURCE).not.toContain('Add manually');
    expect(CLIENT_SOURCE).not.toContain('add it yourself');
  });
});
