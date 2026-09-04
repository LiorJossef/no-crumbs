/**
 * **The player URL and the iframe's attributes**, which between them are five of the ten acceptance
 * lines in `docs/security-ruling-embed-playback-2026-08-31.md` §6.
 *
 * The ones this file carries: item 5 (the Embed Player, not the oEmbed blockquote), item 6
 * (`referrerpolicy`, asserted at the call site in `panel-source.test.ts` and as a value here), item
 * 7 (the sandbox, and the four tokens that must stay absent) and item 8 (the `frame-src` host).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  EMBED_PLAYER_FRAME_SRC,
  EMBED_PLAYER_ORIGIN,
  FORBIDDEN_SANDBOX_TOKENS,
  PLAYER_IFRAME_ALLOW,
  PLAYER_IFRAME_SANDBOX,
  embedPlayerUrl,
  tiktokPostId,
} from '@/components/embed/embed-player-url';

const REAL_ID = '7259010845558983978';
const REAL_URL = `https://www.tiktok.com/@joelleuzyel/video/${REAL_ID}`;

describe('reading the post id out of a URL', () => {
  it('reads the canonical form the product stores', () => {
    expect(tiktokPostId(REAL_URL)).toBe(REAL_ID);
  });

  it('reads a photo post, which is a valid Embed Player post type', () => {
    expect(tiktokPostId(`https://www.tiktok.com/@a/photo/${REAL_ID}`)).toBe(REAL_ID);
  });

  it('tolerates a query string and a trailing slash, which shared links carry', () => {
    expect(tiktokPostId(`${REAL_URL}?is_from_webapp=1&sender_device=pc`)).toBe(REAL_ID);
    expect(tiktokPostId(`${REAL_URL}/`)).toBe(REAL_ID);
  });

  /**
   * **`null` is a complete answer, not a failure**, and every one of these is a case the panel
   * answers by offering the link it already had. A short link in particular: resolving it is a
   * server round trip, and a privacy surface that makes a network call to decide whether to offer a
   * privacy choice would be its own bug.
   */
  it.each([
    ['a short link', 'https://vm.tiktok.com/ZMabcdef/'],
    ['a profile', 'https://www.tiktok.com/@someone'],
    ['an id that is too short', 'https://www.tiktok.com/@a/video/12345'],
    ['an id with letters in it', 'https://www.tiktok.com/@a/video/72590108455589839x8'],
    ['not a URL at all', 'nonsense'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s', (_label, input) => {
    expect(tiktokPostId(input)).toBeNull();
  });

  /**
   * The narrowest form of "this is still the same id shape the server resolver produces".
   * `integrations/tiktok/resolve-short-link.ts` cannot be imported here — it is server code, and
   * importing it to reach a regular expression would pull a fetch path into a unit test — so the
   * agreement is asserted as source text. A drift fails here rather than producing a player URL
   * that 404s in a browser nobody is watching.
   */
  it('agrees with the server resolver on the id width', () => {
    const resolver = readFileSync('src/integrations/tiktok/resolve-short-link.ts', 'utf8');
    expect(resolver).toContain('\\d{17,20}');
    const client = readFileSync('src/components/embed/embed-player-url.ts', 'utf8');
    expect(client).toContain('\\d{17,20}');
  });
});

describe('the player URL', () => {
  /** §6 item 5. The blockquote path is the one with `min-width:325px` in all 16 real captures and a
   *  server-baked `<video preload="auto">`; this is the other one. */
  it('is the Embed Player and not the oEmbed blockquote', () => {
    const url = new URL(embedPlayerUrl(REAL_ID));
    expect(url.origin).toBe(EMBED_PLAYER_ORIGIN);
    expect(url.pathname).toBe(`/player/v1/${REAL_ID}`);
  });

  it('never produces a URL from an id it did not read', () => {
    expect(() => embedPlayerUrl('12345')).toThrow();
    expect(() => embedPlayerUrl('../../evil')).toThrow();
    expect(() => embedPlayerUrl(`${REAL_ID}?x=1`)).toThrow();
  });

  /**
   * `muted=0` is the parameter with a real trade in it and it is asserted rather than left to a
   * default, because TikTok's own wording for `muted=1` is *"prevent the user from changing the
   * volume"* — silent for good, on videos whose creator is usually talking. The cost of `0` is that
   * the browser sometimes refuses to autoplay, which is TikTok error 3002 and is handled.
   */
  it('carries the six parameters that are decisions rather than defaults', () => {
    const params = new URL(embedPlayerUrl(REAL_ID)).searchParams;
    expect(params.get('autoplay')).toBe('1');
    expect(params.get('muted')).toBe('0');
    expect(params.get('controls')).toBe('1');
    expect(params.get('rel')).toBe('0');
    // `III.3(n)` names creator, description and background sound. We render the first two from our
    // own row; the sound is the one we hold no data for.
    expect(params.get('music_info')).toBe('1');
    expect(params.get('description')).toBe('0');
  });
});

describe('the iframe attributes', () => {
  /** §6 item 7. The two present tokens are what the player needs to run; the four absent ones are
   *  the hardening, and they are absent by name so that a future "the player wants a popup" is a
   *  deliberate edit. */
  it('grants exactly the two tokens the player needs', () => {
    expect(PLAYER_IFRAME_SANDBOX.split(' ').sort()).toEqual([
      'allow-same-origin',
      'allow-scripts',
    ]);
  });

  it('omits every token that would let the frame act on our page', () => {
    for (const token of FORBIDDEN_SANDBOX_TOKENS) {
      expect(PLAYER_IFRAME_SANDBOX).not.toContain(token);
    }
    expect(FORBIDDEN_SANDBOX_TOKENS).toEqual([
      'allow-popups',
      'allow-top-navigation',
      'allow-forms',
      'allow-modals',
    ]);
  });

  /**
   * **`credentialless` is deliberately absent and this test says so out loud.** §3 of the ruling:
   * it is Chromium-only and not Baseline, it would close the storage half rather than the
   * SDK-execution half, and its functional impact on this specific player is untested. Adding it
   * would put a line in the record that reads as containment on two of three engines where it does
   * nothing. If someone adds it, this test is where they have to argue for it.
   */
  it('does not claim containment it does not have', () => {
    const source = readFileSync('src/components/embed/tiktok-playback-panel.tsx', 'utf8');
    expect(source).not.toContain('credentialless');
  });

  it('grants only autoplay and fullscreen', () => {
    expect(PLAYER_IFRAME_ALLOW).toBe('autoplay; fullscreen');
  });

  /**
   * **§6 item 8, asserted as three things that cannot drift apart:** the constant, the header
   * `next.config.ts` actually ships, and the origin the iframe actually loads.
   *
   * The header is a string literal in `next.config.ts` because that file is loaded outside the
   * `@/` alias and cannot import the constant. That is exactly the situation in which a guard
   * quietly stops guarding — someone changes the embed host, the CSP keeps naming the old one, and
   * a directive that matches nothing never fails. So the config is read as text here.
   *
   * Note what this is **not**. `frame-src` decides which host may be framed; it says nothing about
   * what that host does once framed, and the cookie and the fingerprint SDK are what TikTok's
   * player does once framed. The residual is `docs/security.md` R-18, not this line.
   */
  it('names the same host the shipped CSP names, and the same one the iframe loads', () => {
    expect(EMBED_PLAYER_FRAME_SRC).toBe(EMBED_PLAYER_ORIGIN);
    expect(new URL(embedPlayerUrl(REAL_ID)).origin).toBe(EMBED_PLAYER_FRAME_SRC);

    const config = readFileSync('next.config.ts', 'utf8');
    const csp = /'Content-Security-Policy',\s*value:\s*"([^"]+)"/.exec(config)?.[1];
    expect(csp, 'no Content-Security-Policy header found in next.config.ts').toBeTruthy();

    const frameSrc = /(?:^|;)\s*frame-src\s+([^;]+)/.exec(csp ?? '')?.[1]?.trim();
    expect(frameSrc, 'next.config.ts ships no frame-src directive').toBeTruthy();
    expect(frameSrc!.split(/\s+/)).toEqual([EMBED_PLAYER_FRAME_SRC]);

    // The pre-existing directive is untouched: this was an addition, not a rewrite.
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
