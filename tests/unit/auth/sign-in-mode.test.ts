/**
 * **The seam, tested from both ends.**
 *
 * `product-review-2026-08-31-r1.md` finding 5: the invite route knew its visitor was a stranger and
 * dropped that at the handoff, passing *where to go* without *who arrived*. The destination then
 * greeted them with `Your places are waiting.` on the product's only acquisition path.
 *
 * The runner has no DOM (`vitest.config.ts` sets `environment: 'node'`), so what is asserted here is
 * the pair of pure functions the seam is made of, plus the **source of the origin page** — because
 * the half of this bug that a parser cannot see is the link that never carried the hint. A green
 * parser and a link with no `mode=` is exactly the shipped defect, so both ends are read.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_MODE, signInModeFromParam, signInNotice } from '@/app/sign-in/mode';
import { LINK_EXPIRED_NOTICE } from '@/app/auth/_lib/copy';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

describe('the mode hint the invite carries', () => {
  it('opens the create-an-account side when the entry point says a stranger arrived', () => {
    expect(signInModeFromParam('sign-up')).toBe('sign-up');
  });

  it('defaults to sign-in for everything else, silently', () => {
    // Nobody types a mode hint, so a value that makes no sense has nothing to say to a user.
    for (const raw of [undefined, '', 'signup', 'SIGN-UP', 'register', '../sign-up', 'true']) {
      expect(signInModeFromParam(raw)).toBe(DEFAULT_MODE);
    }
    expect(DEFAULT_MODE).toBe('sign-in');
  });

  it('takes the first of a repeated param rather than discarding both', () => {
    expect(signInModeFromParam(['sign-up', 'sign-in'])).toBe('sign-up');
    expect(signInModeFromParam(['sign-in', 'sign-up'])).toBe('sign-in');
    expect(signInModeFromParam([])).toBe(DEFAULT_MODE);
  });
});

describe('the invite screen speaks to a stranger', () => {
  /*
   * **Read as source, not imported, and that is a constraint rather than a preference.**
   *
   * `page.tsx` reaches `@/app/_lib/supabase/server`, which begins with `import 'server-only'` — a
   * module whose entire job is to throw when anything that is not a Server Component pulls it in,
   * and a vitest worker is not one. The layer guard asserts that every `app/_lib` module carries
   * that import, so this is the boundary working, not an obstacle to route around.
   *
   * What is lost by reading text is real and worth naming: this cannot see a string that is
   * assembled at runtime, and it would pass on copy that is defined and never rendered. What it
   * gains is the half a parser test structurally cannot reach — the `href` that failed to carry
   * the hint, which is the entire shipped defect.
   */
  const source = repoFile('src/app/collections/join/[token]/page.tsx');

  /** The value of one key of `JOIN_SIGNED_OUT_COPY`, out of the source. Fails loudly rather than
   *  returning an empty string, so a renamed key is a failure and not a vacuous pass. */
  function copyLine(key: string): string {
    const match = new RegExp(`\\b${key}: (?:'([^']*)'|"([^"]*)")`).exec(source);
    if (match === null) throw new Error(`JOIN_SIGNED_OUT_COPY.${key} is not in the source`);
    return match[1] ?? match[2] ?? '';
  }

  const COPY_KEYS = ['headline', 'whatThisIs', 'create', 'comeBack', 'existing', 'existingAction'];

  it('sends a first-time visitor to the create-an-account side', () => {
    // The shipped defect was this exact href without the hint, so the assertion is on the hint
    // being present in the primary link and not merely on the parser understanding it.
    expect(source).toMatch(/href=\{`\/sign-in\?mode=sign-up&next=\$\{next\}`\}/);
  });

  it('still gives the returning visitor a route, and it is not the same link', () => {
    expect(source).toMatch(/href=\{`\/sign-in\?next=\$\{next\}`\}/);
    expect(copyLine('existingAction')).toBe('Sign in');
  });

  it('says what the product is, without saying its name', () => {
    // `ui-review-2026-08-31.md` finding 8. The sentence has to exist...
    expect(copyLine('whatThisIs').length).toBeGreaterThan(0);
    expect(copyLine('whatThisIs')).toMatch(/places/);
    // ...and `voice-and-vocabulary.md` §2 bans the product's name from invite copy by name.
    for (const line of COPY_KEYS.map(copyLine)) {
      expect(line).not.toMatch(/no crumbs/i);
      expect(line).not.toMatch(/crumb/i);
      expect(line).not.toMatch(/!/);
    }
  });

  it('leads with creating an account, because an invitee is new by construction', () => {
    expect(copyLine('create')).toMatch(/^Create an account/);
  });

  it('names TikTok as an adjective, never as the noun', () => {
    // `voice-and-vocabulary.md` §3.1: `a TikTok link`, never `a TikTok`. A plural settles it.
    expect(copyLine('whatThisIs')).not.toMatch(/TikToks/);
    expect(copyLine('whatThisIs')).toMatch(/TikTok (link|video)/);
  });

  it('sets its headline in the display face, like every other full-screen message', () => {
    // Finding 8's measured half: this surface was Manrope 24/800 while `/`, `/sign-in`,
    // `not-found` and `error` were all Fraunces. Both `h1`s on this route now join that set.
    const headings = [...source.matchAll(/<h1\b[\s\S]*?>/g)].map((m) => m[0]);
    expect(headings.length).toBe(2);
    for (const heading of headings) {
      expect(heading).toContain('font-display');
      expect(heading).toContain('DISPLAY_HEADING_AXES');
      expect(heading).not.toContain('font-heading');
    }
  });
});

describe('the notice a dead link leaves behind', () => {
  it('renders the one state the callback can set', () => {
    expect(signInNotice('expired')).toBe(LINK_EXPIRED_NOTICE);
  });

  it('is nothing for a state nobody set', () => {
    for (const raw of [undefined, '', 'Expired', 'ok', 'error', '<script>']) {
      expect(signInNotice(raw)).toBeNull();
    }
  });

  it('states the fact and promises no resend the product does not have', () => {
    expect(LINK_EXPIRED_NOTICE).toBe('That link has expired.');
    expect(LINK_EXPIRED_NOTICE).not.toMatch(/resend|send another|new email/i);
  });
});
