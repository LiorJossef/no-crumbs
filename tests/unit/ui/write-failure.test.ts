/**
 * **The rule `docs/archive/product-review-2026-09-01-r5.md` §2 finding 1 asked to have put in the code: a
 * `Result` covers what the server can say, not the server not answering.**
 *
 * `attemptWrite` is the whole of that rule, so this file pins the three things a caller depends on
 * and cannot see: that an offline press issues nothing at all, that a rejected transport becomes a
 * value rather than a throw, and that *refused* and *unreachable* stay distinguishable — the note
 * editor keeps a user's paragraph on the strength of that distinction.
 *
 * `vitest.config.ts` sets `environment: 'node'`, so there is no `navigator` here and no DOM. That
 * is why `attemptWrite` takes `online` as an injected option rather than reading the global
 * directly: the branch that matters most is the one a node test could otherwise never enter.
 * `isOnline` is tested against fakes for the same reason, including the `undefined` case a server
 * render actually hits.
 *
 * The copy assertions are here rather than in a review checklist because these four strings ship on
 * the surface a person reaches when something has already gone wrong, and `voice-and-vocabulary.md`
 * §7 is binding on all four. The last block pins them to `add-by-name.tsx`'s own offline string,
 * which is where this posture already existed — §6's ruling is that one event gets one wording, and
 * a second wording is how a third gets written.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WRITE_FAILURE_COPY,
  attemptWrite,
  isOnline,
  type ServerAnswer,
} from '@/ui/place/write-failure';

/** The transport failure a Server Action produces when the request never arrives. */
const TRANSPORT_FAILURE = new TypeError('Failed to fetch');

beforeEach(() => {
  // The catch logs one line on purpose. Silenced so a passing run is quiet, and spied so the
  // "never throws" assertions cannot pass by the call not happening at all.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attemptWrite — offline is read before the request', () => {
  it('issues nothing when the browser is offline', async () => {
    const write = vi.fn<() => Promise<ServerAnswer>>();

    const outcome = await attemptWrite(write, { online: false });

    // The half that makes this better than a `catch` alone: no round trip is started, so the
    // answer is immediate and truthful rather than arriving after a timeout.
    expect(write).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'unreachable', message: WRITE_FAILURE_COPY.offline });
  });

  it('says the draft is safe when the control holds one', async () => {
    const outcome = await attemptWrite(async () => ({ ok: true }), {
      online: false,
      keepsDraft: true,
    });

    expect(outcome).toEqual({
      kind: 'unreachable',
      message: WRITE_FAILURE_COPY.offlineKeepsDraft,
    });
  });
});

describe('attemptWrite — what the server said', () => {
  it('reports success', async () => {
    expect(await attemptWrite(async () => ({ ok: true }), { online: true })).toEqual({ kind: 'ok' });
  });

  it('passes a refusal through in the server’s own words', async () => {
    const outcome = await attemptWrite(
      async () => ({ ok: false, message: 'That place is no longer in your list.' }),
      { online: true },
    );

    // `refused`, not `unreachable`: the server answered, the answer is specific, and the delete
    // control collapses its confirmation on exactly this arm and no other.
    expect(outcome).toEqual({
      kind: 'refused',
      message: 'That place is no longer in your list.',
    });
  });
});

describe('attemptWrite — the server never answered', () => {
  it('turns a rejected transport into a value instead of a throw', async () => {
    // The defect itself: this rejection is what React escalated to `app/error.tsx`, taking the map
    // and every pin with it. `resolves` is the assertion — if the promise rejected, the whole
    // screen would go, and so would this test.
    await expect(
      attemptWrite(() => Promise.reject(TRANSPORT_FAILURE), { online: true }),
    ).resolves.toEqual({ kind: 'unreachable', message: WRITE_FAILURE_COPY.unreachable });

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft promise on a control that holds text', async () => {
    await expect(
      attemptWrite(() => Promise.reject(TRANSPORT_FAILURE), { online: true, keepsDraft: true }),
    ).resolves.toEqual({
      kind: 'unreachable',
      message: WRITE_FAILURE_COPY.unreachableKeepsDraft,
    });
  });

  it('survives a synchronous throw and a non-Error rejection', async () => {
    // Not hypothetical robustness: a Server Action can fail before its promise exists (a bad
    // module boundary throws synchronously), and Next serialises server failures into values that
    // are not `Error` instances. Either one reaching the boundary costs the same screen.
    await expect(
      attemptWrite(() => {
        throw TRANSPORT_FAILURE;
      }),
    ).resolves.toEqual({ kind: 'unreachable', message: WRITE_FAILURE_COPY.unreachable });

    await expect(attemptWrite(() => Promise.reject('digest:1a2b3c'))).resolves.toEqual({
      kind: 'unreachable',
      message: WRITE_FAILURE_COPY.unreachable,
    });
  });
});

describe('isOnline', () => {
  it('acts only on an explicit false', () => {
    expect(isOnline({ onLine: false })).toBe(false);
    expect(isOnline({ onLine: true })).toBe(true);
    // No `navigator` at all — a server render, or this test runner. Refusing to write because a
    // global is missing would be a worse failure than the one being prevented.
    expect(isOnline(undefined)).toBe(true);
    // A `navigator` without the property: same reasoning, and it is what older embedded webviews
    // present.
    expect(isOnline({})).toBe(true);
  });
});

describe('the four strings', () => {
  const strings = Object.values(WRITE_FAILURE_COPY);

  it('states a fact and stops', () => {
    for (const line of strings) {
      // §5: no exclamation marks, ever — not even in a failure, where the temptation is loudest.
      expect(line).not.toContain('!');
      // §7 rule 1 and §4's banned list. `sorry` and `apologies` are not on that list by name
      // because the rule above it — blameless, no apology — makes them unwritable.
      for (const banned of [
        'oops',
        'something went wrong',
        'sorry',
        'apolog',
        'error',
        'failed',
        'crumb',
        'retry',
        'request',
        'server',
        'network',
      ]) {
        expect(line.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it('never blames the user and never names our machinery', () => {
    for (const line of strings) {
      // The two shapes this copy could have taken and did not: an accusation, and a leak. `you`
      // appears in `You’re offline` and `What you typed`, both of which are about the person's
      // situation rather than their conduct — `your fault`, `you must`, `invalid` are the tells.
      expect(line.toLowerCase()).not.toMatch(/your fault|you must|you should|invalid/);
    }
  });

  it('offers the next move, in one of the two shapes', () => {
    // §7 rule 4: a failure offers the next move. Two shapes are legitimate here and no third is —
    // `Try again` where there is nothing to lose, and *what you typed is still here* where the
    // control already holds the action and what the user needs is the reassurance instead.
    expect(WRITE_FAILURE_COPY.offline).toContain('try again');
    expect(WRITE_FAILURE_COPY.unreachable).toContain('Try again');
    expect(WRITE_FAILURE_COPY.offlineKeepsDraft).toContain('still here');
    expect(WRITE_FAILURE_COPY.unreachableKeepsDraft).toContain('still here');
  });

  it('uses the typographic apostrophe the rest of the product uses', () => {
    for (const line of strings) expect(line).not.toContain("'");
  });
});

describe('one event, one wording', () => {
  it('matches the offline string add-by-name already shipped', () => {
    // `src/app/import/screens/add-by-name.tsx` had this posture before any of the saved-place
    // controls did, and its `OFFLINE` const is the wording that shipped. Read from source rather
    // than imported: that module is a client component full of JSX and the runner has no DOM, and
    // an import would also make an out-of-scope file a dependency of this guard rather than its
    // subject. If someone reworks either string, this fails and the two get reconciled
    // deliberately instead of drifting.
    const addByName = readFileSync(
      fileURLToPath(new URL('../../../src/app/import/screens/add-by-name.tsx', import.meta.url)),
      'utf8',
    );

    expect(addByName).toContain(`const OFFLINE = '${WRITE_FAILURE_COPY.offline}'`);
  });
});
