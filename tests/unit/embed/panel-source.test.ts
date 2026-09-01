/**
 * **The properties of the panel that a rendered output cannot show you.**
 *
 * `tiktok-playback-panel.tsx` is a client component and cannot be imported from a unit test at all
 * — the same measured constraint `components/sheet/place-order.ts` was split out for
 * (*"This module cannot be imported from a Client Component module"*). So the rules that live in
 * its JSX are asserted as source text here, and the rules that could be extracted into pure modules
 * were: `playback-consent.ts`, `player-messages.ts` and `embed-player-url.ts` each have their own
 * behavioural tests, and this file covers only what is left.
 *
 * **What is left is the important half.** *No iframe exists before the user agrees* and *nothing
 * mounts on hover* are both statements about code that is **absent**, and a browser trace of a
 * passing case cannot prove an absence — it can only fail to trigger it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PANEL = 'src/components/embed/tiktok-playback-panel.tsx';
const source = readFileSync(PANEL, 'utf8');

/**
 * **The file with its comments removed**, and every assertion below that is about *behaviour* runs
 * against this rather than against `source`.
 *
 * Not a nicety — it is the difference between a working guard and a broken one, in both directions.
 * The panel's own doc comments name `onMouseEnter`, `IntersectionObserver` and `window.open`
 * precisely in order to say they are absent, so a grep over the raw text fails on a correct file;
 * and a guard written to pass that way would be one comment away from passing on a wrong one.
 *
 * The `//` rule skips a `:` immediately before it, so a `https://` inside a string literal survives
 * — there is none today and the assertion below would rather keep one than silently eat half a line.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('acceptance item 1 — a press, and only a press', () => {
  /**
   * Owner ruling (`iteration-6-plan.md` §6.2), restated as a hard acceptance line. A mouse crossing
   * a list row would tell TikTok *this device looked at post X* at exactly the same cost as a
   * deliberate press — mounting is the disclosure, not playing.
   */
  it.each([
    'onMouseEnter',
    'onMouseOver',
    'onPointerEnter',
    'onPointerOver',
    'onFocus',
    'IntersectionObserver',
  ])('never mounts on %s', (trigger) => {
    expect(code.includes(trigger), `${PANEL} reacts to ${trigger}`).toBe(false);
  });

  /** The mount is caused by a state change from a `<Button onClick>`, and by nothing else. */
  it('has exactly one kind of trigger, and it is a click', () => {
    const handlers = code.match(/\bon[A-Z][A-Za-z]+=/g) ?? [];
    expect([...new Set(handlers)]).toEqual(['onClick=']);
  });
});

describe('acceptance items 2 and 3 — the iframe does not exist before the answer', () => {
  /** One iframe in the file. A second one, anywhere, would be a second place this rule has to hold
   *  and a second place to forget it. */
  it('renders exactly one iframe', () => {
    expect(code.match(/<iframe/g)?.length).toBe(1);
  });

  /**
   * **The structural form of the gate.** The `<iframe>` is inside `Player`, `Player` is rendered
   * from exactly one place, and that place is guarded by `mode === 'play-here'`. Not hidden, not
   * `display:none`, not `src=""` — a hidden iframe with a `src` has already made every request a
   * visible one would.
   */
  it('puts the iframe inside Player, and renders Player only under an explicit grant', () => {
    const player = code.slice(code.indexOf('function Player('));
    expect(player).toContain('<iframe');

    const uses = code.match(/<Player\b/g) ?? [];
    expect(uses.length).toBe(1);

    // The one use sits in the `play-here` branch, and the branch opens before it.
    const branch = code.indexOf("mode === 'play-here'");
    const use = code.indexOf('<Player');
    expect(branch).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(branch);
    // ...and it closes after it, so this is the guard rather than an earlier unrelated one.
    expect(code.indexOf("mode === 'link-only'")).toBeGreaterThan(use);
  });

  /** The refusal branch's whole value is that it costs nothing. The only TikTok-facing thing in the
   *  file besides the iframe is the `<a href>` the user asked for. */
  it('reaches TikTok through the iframe and an anchor, and nothing else', () => {
    for (const io of ['fetch(', 'XMLHttpRequest', 'new Image(', '<img', '<script', 'window.open']) {
      expect(code.includes(io), `${PANEL} contains ${io}`).toBe(false);
    }
  });

  /** No literal TikTok URL in the component: every one is built by `embed-player-url.ts` from an id
   *  that module validated, or is the canonical post URL the product already stored. */
  it('hard-codes no TikTok URL of its own', () => {
    expect(code).not.toMatch(/https?:\/\/[^'"\s]*tiktok/i);
  });
});

describe('acceptance item 4 — the answer is this origin’s, and the server does not guess it', () => {
  it('reads the choice through the store rather than touching storage itself', () => {
    expect(code).toContain('useSyncExternalStore');
    expect(code).toContain('getServerChoice');
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('document.cookie');
  });
});

describe('acceptance items 6 and 7 — the hardening, imported rather than retyped', () => {
  it('sets no-referrer on the iframe', () => {
    expect(source).toContain('referrerPolicy="no-referrer"');
  });

  /**
   * The sandbox and the permissions policy come from `embed-player-url.ts`, so the review question
   * *"what is the sandbox?"* has one file to read and one test to fail. An inline literal here
   * would be a second source of truth for a security attribute.
   */
  it('takes the sandbox and the allow list from the one module that owns them', () => {
    expect(code).toContain('sandbox={PLAYER_IFRAME_SANDBOX}');
    expect(code).toContain('allow={PLAYER_IFRAME_ALLOW}');
    expect(code).not.toMatch(/sandbox="/);
  });
});

describe('acceptance item 9 — attribution does not depend on TikTok’s defaults', () => {
  /** §6 item 9 and `09` §5's `III.3(n)` underneath it: creator, description and link back. The
   *  first two render from our own row; the third renders in every branch. */
  it('renders our own creator line, our own caption and the link back', () => {
    expect(code).toContain('function Attribution(');
    expect(code).toContain('Saved from ');
    expect(code).toContain('function OpenOnTikTokLink(');

    // **Every branch reaches TikTok's own page, so no state here is a dead end.** Three of the four
    // render the shared link component — the no-post-id case, `play-here` and `link-only`. The
    // fourth is the first-press disclosure, where the link is one of the two co-equal actions and
    // is therefore a `<Button render={<a …>}>` rather than the plain link, so that it and
    // `Play here` are the same element at the same weight.
    expect((code.match(/<OpenOnTikTokLink\b/g) ?? []).length).toBe(3);
    const disclosure = code.slice(code.indexOf('function Disclosure('), code.indexOf('function Player('));
    expect(disclosure).toContain('href: videoUrl');
    expect(disclosure).toContain('PLAYBACK_COPY.openOnTikTok');
  });

  /** `09` refused TikTok's mark on every surface we draw, and this is one. The mark inside TikTok's
   *  own iframe is licensed precisely because we do not draw it. */
  it('draws no platform mark of its own', () => {
    expect(code).not.toContain('PlatformMark');
    expect(code).not.toContain('<svg');
  });
});

describe('the file’s place in the layering', () => {
  it('is a client component', () => {
    expect(source.startsWith("'use client';")).toBe(true);
  });

  /** A client surface must not pull a server module in to reach a helper. Every import here is a
   *  sibling, a UI primitive or React. */
  it('imports nothing from integrations, app or domain', () => {
    for (const forbidden of ['@/integrations', '@/app/', '@/domain']) {
      expect(code.includes(forbidden), `${PANEL} imports ${forbidden}`).toBe(false);
    }
  });
});
