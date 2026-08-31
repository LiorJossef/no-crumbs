/**
 * **The recovery flow's strings, and the handling of the one credential it carries.**
 *
 * Two kinds of assertion, and they are separated on purpose.
 *
 * The copy assertions are ordinary: `voice-and-vocabulary.md` binds every string, the runner has no
 * DOM, and `agent-guardrails.md` §7 rule 26 records what happens when a copy change is graded by a
 * suite that does not read strings — nine unit assertions moved with the strings and three e2e
 * selectors broke.
 *
 * The **source** assertions are the sharper half. A recovery code is one exchange away from a live
 * session on somebody's account, and the ways it leaks are all invisible to a unit test that only
 * calls functions: a `console.log` while debugging, a code carried into a redirect, a provider
 * message rendered verbatim. Those are properties of what is *written*, so they are read from the
 * text — the same instrument `tests/unit/app/shell.test.ts` uses on the layout for the same reason.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LINK_EXPIRED_NOTICE,
  NEW_PASSWORD_COPY,
  NEW_PASSWORD_ERROR_COPY,
  NEW_PASSWORD_EXPIRED_COPY,
  RESET_REQUEST_COPY,
  RESET_SENT_COPY,
} from '@/app/auth/_lib/copy';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

/**
 * Comments blanked, line count preserved.
 *
 * Not optional here. Four guards in this repository have been fooled by prose and every one is the
 * same shape: a regex over raw source cannot tell a call site from a sentence about a call site
 * (`token-call-sites.test.ts` records the catalogue). Three of the assertions below are *absence*
 * claims, and the clearest thing a comment can say about a thing that must not be written is its
 * name — every file in this flow explains why it does not log the code and why it uses `getUser`
 * rather than `getSession`. Without this, the fix and the defect are indistinguishable, and the
 * lesson authors take away is to stop writing the explanation.
 */
const withoutComments = (source: string): string => {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
};

/** Source with the prose removed — what the file actually does. */
const repoCode = (relative: string) => withoutComments(repoFile(relative));

/** Every user-facing string in the flow, flattened. `LINK_EXPIRED_NOTICE` is a bare string; the
 *  rest are objects whose values are strings or the two-line headline arrays. */
const EVERY_STRING: string[] = [
  LINK_EXPIRED_NOTICE,
  ...[
    RESET_REQUEST_COPY,
    RESET_SENT_COPY,
    NEW_PASSWORD_COPY,
    NEW_PASSWORD_EXPIRED_COPY,
    NEW_PASSWORD_ERROR_COPY,
  ].flatMap((block) => Object.values(block).flat() as string[]),
];

describe('the recovery flow says what it is allowed to say', () => {
  it('has strings at all — the flattener is the thing that would silently return nothing', () => {
    // Every assertion below iterates this list, so an empty one would pass all of them.
    expect(EVERY_STRING.length).toBeGreaterThan(20);
    for (const line of EVERY_STRING) expect(typeof line).toBe('string');
  });

  it('never carries the product name — §2 lists six surfaces and none of these is one', () => {
    for (const line of EVERY_STRING) {
      expect(line).not.toMatch(/crumb/i);
      expect(line).not.toMatch(/no crumbs/i);
    }
  });

  it('has no exclamation mark anywhere — §5, and it is absolute', () => {
    for (const line of EVERY_STRING) expect(line).not.toContain('!');
  });

  it("names none of our machinery — §4's banned list", () => {
    const banned =
      /\b(metadata|LLM|model|geocode|extraction|pipeline|parse|API|endpoint|payload|token|retry queue|worker|oops)\b/i;
    for (const line of EVERY_STRING) expect(line).not.toMatch(banned);
  });

  it('never says something went wrong', () => {
    for (const line of EVERY_STRING) {
      expect(line).not.toMatch(/something went wrong/i);
      expect(line).not.toMatch(/\boops\b/i);
      // Blameless: a reset is our failure to build one, not the user's failure to remember.
      expect(line).not.toMatch(/\byou (?:failed|forgot to)\b/i);
    }
  });

  it('offers the next move on every failure — §7 rule 4', () => {
    for (const line of Object.values(NEW_PASSWORD_ERROR_COPY)) {
      expect(line).toMatch(/choose|ask for a new|give it a few minutes/i);
    }
  });
});

describe('the settled state does not say whether an account exists', () => {
  it('hedges, because `resetPasswordForEmail` succeeds either way', () => {
    // A screen more informative than the API is an oracle for whether a given person uses this
    // product. The hedge lives in the copy because there is nothing in the code to branch on.
    expect(RESET_SENT_COPY.subhead).toMatch(/if that address has an account/i);
    expect(RESET_SENT_COPY.subhead).not.toMatch(/we (?:sent|have sent|emailed)/i);
  });

  it('warns that the link is bound to this browser before the visitor leaves the screen', () => {
    // PKCE writes the code verifier into this browser's cookie jar. Saying so up front costs one
    // line; discovering it costs a dead link and a second request.
    expect(RESET_SENT_COPY.browser).toMatch(/this browser/i);
  });

  it('does not branch on the address in the source either', () => {
    const source = repoCode('src/app/auth/reset/reset-client.tsx');
    // The one error that is surfaced is being asked to wait. Everything else resolves to the same
    // settled state — including a provider outage, deliberately.
    expect(source).not.toMatch(/user_not_found/);
    expect(source).not.toMatch(/error\.message/);
    expect(source).toMatch(/setSent\(true\)/);
  });
});

describe('the callback treats the code as a credential', () => {
  const source = repoCode('src/app/auth/callback/route.ts');

  it('never logs it, in any form', () => {
    // Every logging call in the file, with its argument list, so a `console.log(code)` added later
    // fails here rather than in an incident.
    const logs = [...source.matchAll(/console\.\w+\(([^;]*)\)/g)].map((m) => m[1] ?? '');
    expect(logs.length).toBeGreaterThan(0);
    for (const call of logs) {
      // The exchange code, and only it: `error.code` is a short enumerated provider string and is
      // exactly what makes a real failure distinguishable from an expired link in our own logs.
      expect(call).not.toMatch(/(?<![.\w])code(?![:\w])/);
      expect(call).not.toMatch(/error\.message/);
      expect(call).not.toMatch(/\burl\b|request\.url|searchParams/);
    }
  });

  it('redirects to a path it chose, never to one it was handed', () => {
    // The only `NextResponse.redirect` in the file resolves `callbackDestination`'s return value
    // against this request's own origin. A second one taking anything else is the regression.
    const redirects = [...source.matchAll(/NextResponse\.redirect\(([^;]*)\)/g)].map((m) => m[1] ?? '');
    expect(redirects.length).toBe(1);
    expect(redirects[0]).toContain('callbackDestination(params, outcome)');
    expect(redirects[0]).toContain('url.origin');
  });

  it('exchanges the code on the server, so it is never a prop', () => {
    expect(source).toContain('exchangeCodeForSession');
    expect(source).not.toContain("'use client'");
  });

  it('passes the flow id, because a server cannot read one off an address bar', () => {
    /*
     * auth-js keeps one verifier slot per in-flight PKCE flow plus a single fixed key that every
     * flow overwrites, and it recovers the flow id from `window.location` — in a browser. On the
     * server that lookup falls back to the fixed key, so the exchange is right by luck while one
     * link is outstanding and wrong the moment two are: a reset asked for while a sign-up
     * confirmation is still unclicked makes the older link exchange against the newer link's
     * verifier. `sb_flow_id` is `PKCE_FLOW_ID_PARAM`, and the library's own docblock for
     * `exchangeCodeForSession` shows this call shape for exactly this case.
     */
    expect(source).toContain("params.get('sb_flow_id')");
    expect(source).toMatch(/exchangeCodeForSession\([\s\S]*?flowId[\s\S]*?\)/);
  });
});

describe('the new-password screen', () => {
  const client = repoCode('src/app/auth/new-password/new-password-client.tsx');
  const page = repoCode('src/app/auth/new-password/page.tsx');

  it('is gated on a validated user, not on a cookie payload', () => {
    // `getUser()` validates the token against the auth server; `getSession()` trusts the cookie.
    // On a screen whose purpose is to change a credential that distinction is the whole gate.
    expect(page).toContain('supabase.auth.getUser()');
    expect(page).not.toContain('getSession(');
  });

  it('ends the other sessions after a reset', () => {
    // A reset is very often a reset *because* somebody else holds the old password.
    expect(client).toMatch(/signOut\(\{ scope: 'others' \}\)/);
  });

  it('renders no provider string', () => {
    expect(client).not.toMatch(/\{\s*error\.message\s*\}/);
    expect(client).toContain('NEW_PASSWORD_ERROR_COPY.unknown');
  });
});
