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

  it('is text, not a fourth kind, for hosts the owner ruled out', () => {
    // 2026-08-29 ruling: no Instagram, no YouTube. A link we do not read is not a recognised
    // failure case, it is just text — so the offer against it is manual add, and this assertion is
    // what fails if somebody quietly reintroduces an `unsupported-host` arm.
    const insta = 'https://www.instagram.com/reel/Cabc123/';
    expect(universalInput(insta)).toEqual({ kind: 'text', text: insta });

    const youtube = 'https://youtube.com/shorts/abc123';
    expect(universalInput(youtube)).toEqual({ kind: 'text', text: youtube });
  });

  it('is text for a TikTok URL that is not a post', () => {
    // `kind: 'tiktok'` promises the import pipeline will accept it, not that the string says
    // "tiktok". A profile and a hashtag feed are neither of them a post.
    expect(universalInput('https://www.tiktok.com/@user')).toEqual({
      kind: 'text',
      text: 'https://www.tiktok.com/@user',
    });
    expect(universalInput('https://www.tiktok.com/tag/falafel')).toEqual({
      kind: 'text',
      text: 'https://www.tiktok.com/tag/falafel',
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
