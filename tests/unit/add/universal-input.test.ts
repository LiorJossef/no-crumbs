import { describe, expect, it } from 'vitest';

import {
  addSubmitIntent,
  manualAddLabel,
  manualAddSeed,
  universalInput,
} from '@/components/add/universal-input';

const POST = 'https://www.tiktok.com/@user/video/1234567890123456789';
const SHORT = 'https://vm.tiktok.com/ZS2abc/';

describe('universalInput', () => {
  it('reads whitespace as an empty field, not as text', () => {
    expect(universalInput('')).toEqual({ kind: 'empty' });
    expect(universalInput('   \n\t ')).toEqual({ kind: 'empty' });
  });

  it('classifies a bare TikTok post link', () => {
    expect(universalInput(POST)).toEqual({ kind: 'tiktok', url: POST });
    expect(universalInput(SHORT)).toEqual({ kind: 'tiktok', url: SHORT });
  });

  it('digs the link out of what the share sheet actually copies', () => {
    // The whole reason this delegates to `extractPastedUrl`: the clipboard is caption + link +
    // hashtags, and `url` has to be the link alone because that is what the pipeline receives.
    const pasted = `best falafel in tel aviv 🧆 ${SHORT} #telaviv #foodie`;
    expect(universalInput(pasted)).toEqual({ kind: 'tiktok', url: SHORT });
  });

  it('classifies the share-sheet / data-export link form on both of its hosts', () => {
    // VERIFIED 2026-08-27, `docs/evidence/capture/raw/01-export-link-form.txt`. Both of these used
    // to fall through to `kind: 'text'`, so the Add sheet offered to name a place after a URL
    // instead of importing a real TikTok.
    const share = 'https://www.tiktok.com/share/video/7245648559981350186/';
    expect(universalInput(share)).toEqual({ kind: 'tiktok', url: share });

    const exported = 'https://www.tiktokv.com/share/video/7245648559981350186/';
    expect(universalInput(exported)).toEqual({ kind: 'tiktok', url: exported });

    const withQuery = `${share}?_r=1&_t=ZS-abc123`;
    expect(universalInput(withQuery)).toEqual({ kind: 'tiktok', url: withQuery });
  });

  it('digs a share-sheet link out of the caption blob it arrives wrapped in', () => {
    const exported = 'https://www.tiktokv.com/share/video/7245648559981350186/';
    expect(universalInput(`6 must try spots in Tokyo ${exported} #japantravel`)).toEqual({
      kind: 'tiktok',
      url: exported,
    });
  });

  it('recognises the hosts the 2026-08-29 ruling filed as text', () => {
    /*
     * **This assertion was inverted on 2026-08-31 (W1-5, growth defect G4), and the history is the
     * point.** It used to read "is text, not a fourth kind, for hosts the owner ruled out", and it
     * existed to fail if anyone reintroduced an `unsupported-host` arm. That arm is now the
     * correct answer, so the guard is inverted rather than deleted.
     *
     * What the 2026-08-29 ruling missed: filing a link as text does not merely decline to
     * recognise it, it feeds the URL to `manualAddLabel`, which quoted it back as
     * `Add "https://www.instagram.com/reel/D…" manually` — an offer to name a place after a URL.
     * Meanwhile `/import` handled the identical link correctly, so the two ways into the product
     * disagreed about the same string.
     */
    const insta = 'https://www.instagram.com/reel/Cabc123/';
    expect(universalInput(insta)).toEqual({ kind: 'unsupported-link', url: insta });

    const youtube = 'https://youtube.com/shorts/abc123';
    expect(universalInput(youtube)).toEqual({ kind: 'unsupported-link', url: youtube });
  });

  it('is a recognised link, not a post, for a TikTok URL that is not one', () => {
    // `kind: 'tiktok'` promises the import pipeline will accept it, not that the string says
    // "tiktok". A profile and a hashtag feed are neither of them a post.
    //
    // Also inverted on 2026-08-31 by W1-5. These reach `unsupported-link` through
    // `UNSUPPORTED_URL` rather than `UNSUPPORTED_HOST`, and the two are deliberately one kind
    // here: "we recognised this and cannot read it" is a single piece of news to the person
    // holding the link, whatever our own error taxonomy calls it.
    expect(universalInput('https://www.tiktok.com/@user')).toEqual({
      kind: 'unsupported-link',
      url: 'https://www.tiktok.com/@user',
    });
    expect(universalInput('https://www.tiktok.com/tag/falafel')).toEqual({
      kind: 'unsupported-link',
      url: 'https://www.tiktok.com/tag/falafel',
    });
  });

  it('trims the text it reports, because that text is both the query and a seeded name', () => {
    expect(universalInput('  Miznon  ')).toEqual({ kind: 'text', text: 'Miznon' });
  });

  it('keeps a Hebrew name intact', () => {
    expect(universalInput('  האחים  ')).toEqual({ kind: 'text', text: 'האחים' });
  });
});

describe('addSubmitIntent', () => {
  it('refuses to guess on an empty field', () => {
    // Go on an empty field is an accident. Notably it stays `none` even when a result is somehow
    // on screen — an empty query cannot have meant "open that one".
    expect(addSubmitIntent(universalInput(''), null)).toEqual({ kind: 'none' });
    expect(addSubmitIntent(universalInput(''), 'place-1')).toEqual({ kind: 'none' });
  });

  it('imports a link regardless of what the library search happens to be showing', () => {
    expect(addSubmitIntent(universalInput(POST), 'place-1')).toEqual({ kind: 'tiktok', url: POST });
  });

  it('opens the first match when text found one', () => {
    expect(addSubmitIntent(universalInput('Miznon'), 'place-1')).toEqual({
      kind: 'select',
      id: 'place-1',
    });
  });

  it('offers manual add when text matched nothing', () => {
    expect(addSubmitIntent(universalInput('Miznon'), null)).toEqual({
      kind: 'manual',
      text: 'Miznon',
    });
  });

  it('never returns `none` while there is something in the field', () => {
    // The regression this module exists to prevent: Enter and the phone keyboard's Go doing
    // nothing at all. Every non-empty input has to produce an action.
    //
    // This assertion earned its keep on 2026-08-31: W1-5's first draft returned `none` for the new
    // `unsupported-link` kind, on the reasoning that the screen already says "that link isn't a
    // TikTok" and the manual-add row is visible. This caught it. A new kind must not quietly
    // reopen a regression the module was written to close, so Go opens manual add — blank.
    for (const raw of [POST, SHORT, 'Miznon', 'https://www.instagram.com/reel/Cabc123/', 'x']) {
      for (const first of [null, 'place-1']) {
        expect(addSubmitIntent(universalInput(raw), first).kind).not.toBe('none');
      }
    }
  });
});

describe('manualAddLabel', () => {
  it('invites generically when there is nothing to quote', () => {
    expect(manualAddLabel(universalInput(''))).toBe('Add a place manually');
  });

  it('quotes what was typed', () => {
    expect(manualAddLabel(universalInput('Miznon'))).toBe('Add “Miznon” manually');
  });

  it('stays generic against a link rather than naming a place after a URL', () => {
    expect(manualAddLabel(universalInput(SHORT))).toBe('Add a place manually');
  });

  it('truncates a pasted paragraph instead of growing the row', () => {
    const long = 'a'.repeat(60);
    const label = manualAddLabel(universalInput(long));
    expect(label).toBe(`Add “${'a'.repeat(32)}…” manually`);
  });

  it('does not leave a dangling space before the ellipsis', () => {
    // 32 characters lands mid-gap here, and `Add “… word …” manually` reads as a typo.
    const long = 'Miznon Falafel Tel Aviv Jaffa  Street kitchen';
    expect(manualAddLabel(universalInput(long))).not.toContain(' …');
  });
});

describe('manualAddSeed', () => {
  it('seeds the form from free text', () => {
    expect(manualAddSeed(universalInput('  Miznon '))).toBe('Miznon');
  });

  it('seeds nothing from a link, so the manual form opens blank', () => {
    expect(manualAddSeed(universalInput(SHORT))).toBe('');
    expect(manualAddSeed(universalInput(''))).toBe('');
  });
});

/**
 * W1-5 / growth defect **G4**: an Instagram link became a place name.
 *
 * `universalInput` filed every non-TikTok string as `kind: 'text'`, so `manualAddLabel` quoted the
 * URL back as `Add “https://www.instagram.com/reel/D…” manually` — an offer to name a place after a
 * URL — while `/import` handled the identical link correctly. Two ways into the product, opposite
 * behaviours, and the wrong one was on the surface a new user is most likely to reach first.
 *
 * These pin the boundary from both sides, because both sides are load-bearing: a recognised link
 * must never become a place name, and free text must never be mistaken for a link.
 */
describe('universalInput — a link we cannot read is a link, not a place name (G4)', () => {
  const INSTAGRAM = 'https://www.instagram.com/reel/DAbc123/';
  const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const BARE_DOMAIN = 'https://kolamba.co.uk';
  const TIKTOK_PROFILE = 'https://www.tiktok.com/@someone';

  it.each([
    ['an Instagram reel', INSTAGRAM],
    ['a YouTube watch URL', YOUTUBE],
    ['a bare domain that is not a platform', BARE_DOMAIN],
  ])('files %s as a recognised link rather than as text', (_label, url) => {
    expect(universalInput(url)).toEqual({ kind: 'unsupported-link', url });
  });

  it('files a TikTok profile as a recognised link too — it is a URL, just not a post', () => {
    // `canonicaliseTikTokUrl` answers UNSUPPORTED_URL here rather than UNSUPPORTED_HOST. Both mean
    // "we recognised this and cannot read it", which is one piece of news to the person holding it.
    expect(universalInput(TIKTOK_PROFILE)).toEqual({
      kind: 'unsupported-link',
      url: TIKTOK_PROFILE,
    });
  });

  it.each([
    ['an Instagram reel', INSTAGRAM],
    ['a YouTube watch URL', YOUTUBE],
    ['a bare domain', BARE_DOMAIN],
  ])('never quotes %s back as a place name', (_label, url) => {
    const label = manualAddLabel(universalInput(url));
    expect(label).toBe('Add a place manually');
    // The defect was the URL appearing in the offer at all, so assert its absence directly rather
    // than only the happy string — a future label change must not smuggle it back in.
    expect(label).not.toContain('http');
    expect(label).not.toContain('instagram');
  });

  it('seeds the manual form blank from a link we cannot read', () => {
    expect(manualAddSeed(universalInput(INSTAGRAM))).toBe('');
  });

  it('opens manual add blank on Go — never seeded from the URL', () => {
    /*
     * Two failure modes, and this arm has to miss both.
     *
     * Seeding manual add from the URL is defect G4 wearing a different coat: the user would land in
     * a form pre-filled with `https://www.instagram.com/…` as the place's name.
     *
     * Returning `none` is the *other* failure, and it is the one my first draft shipped: a dead
     * Enter key, which is the regression `addSubmitIntent` was written to close (backlog 2.1). The
     * "never returns `none`" assertion above caught it.
     *
     * Blank manual add is the only answer that misses both — Go does the one thing the screen
     * offers, and the URL is nowhere near the name field.
     */
    expect(addSubmitIntent(universalInput(INSTAGRAM), null)).toEqual({ kind: 'manual', text: '' });
    // Unchanged by a matching library result: a link is not a search term, so there is no first
    // result to select even when the caller has one for other reasons.
    expect(addSubmitIntent(universalInput(INSTAGRAM), 'place-1')).toEqual({
      kind: 'manual',
      text: '',
    });
  });

  it('leaves a schemeless bare domain as text, deliberately', () => {
    // `canonicaliseTikTokUrl('kolamba.co.uk')` returns MALFORMED_URL — byte-identical to what it
    // returns for `Kolamba`, because without a scheme there is nothing to parse. Splitting them
    // would mean guessing that a dot makes a string a URL, and that guess fails in the direction
    // that costs the user something real: a place called `St. John` would stop being addable.
    expect(universalInput('kolamba.co.uk')).toEqual({ kind: 'text', text: 'kolamba.co.uk' });
    expect(manualAddLabel(universalInput('kolamba.co.uk'))).toBe('Add “kolamba.co.uk” manually');
  });

  it('still recognises a real TikTok post, so the fix did not widen over the happy path', () => {
    expect(universalInput(POST)).toEqual({ kind: 'tiktok', url: POST });
    expect(universalInput(SHORT).kind).toBe('tiktok');
  });
});
