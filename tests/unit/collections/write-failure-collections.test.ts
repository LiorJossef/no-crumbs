/**
 * **The nine collection writes that could still take the screen down, and the one helper that had
 * to be different.**
 *
 * `tests/unit/ui/write-failure.test.ts` pins the rule itself: a `Result` covers what the server can
 * say, not the server not answering, so every Server Action call inside a `startTransition` needs a
 * `catch` or React escalates the rejection to `app/error.tsx` and replaces the segment. That pass
 * fixed the five saved-place controls. The same defect was live at nine more sites in the
 * collections flow, and this file is the half of the fix a `node` runner can hold:
 *
 *  1. **`attemptCreateCollection`** — the two sites that could not use `attemptWrite`, because
 *     `createCollection` answers `{ ok: true, id }` and `WriteOutcome` has nowhere to put the id.
 *     It is asserted arm for arm, and then asserted to *agree* with `attemptWrite` on both failure
 *     arms, which is what stops a second wording of one event from appearing (`voice-and-vocabulary`
 *     §6, the same reason `write-failure.test.ts` reads `add-by-name.tsx` from source).
 *  2. **The other seven**, read from source. Nothing here can press a button — `vitest.config.ts`
 *     sets `environment: 'node'` and there is no DOM — but the defect has a shape that source can
 *     see exactly: an `await` on a Server Action rather than on a helper that cannot throw. The
 *     browser measurement is what proves the behaviour; this is what stops the tenth site.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WRITE_FAILURE_COPY, attemptWrite } from '@/ui/place/write-failure';

// `next/navigation` for the hook that shares this module, and the actions module because importing
// it for real pulls in `server-only`. `createCollection` is the one this file drives.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/collections', () => ({ createCollection: vi.fn() }));

const { createCollection } = await import('@/app/actions/collections');
const { attemptCreateCollection } = await import('@/components/collections/use-create-collection');

const create = vi.mocked(createCollection);

/** The transport failure a Server Action produces when the request never arrives. */
const TRANSPORT_FAILURE = new TypeError('Failed to fetch');

beforeEach(() => {
  // The catch logs one line on purpose. Silenced so a passing run is quiet, and spied so the
  // "never throws" assertions cannot pass by the call not happening at all.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  create.mockReset();
});

describe('attemptCreateCollection — the id survives, and so does the name', () => {
  it('issues nothing when the browser is offline, and promises the name is still there', async () => {
    const outcome = await attemptCreateCollection('Tel Aviv food', { online: false });

    expect(create).not.toHaveBeenCalled();
    // `offlineKeepsDraft`, not `offline`: a collection is created from a name somebody typed, and
    // both entry points plus the picker's compose row keep that name in the field. Withholding the
    // reassurance is what makes a failed write read as lost work.
    expect(outcome).toEqual({
      kind: 'unreachable',
      message: WRITE_FAILURE_COPY.offlineKeepsDraft,
    });
  });

  it('carries the new collection’s id out of the success arm', async () => {
    create.mockResolvedValue({ ok: true, id: 'col-1' });

    // The whole reason this is not `attemptWrite`: without the id there is no push into the new
    // collection, and a collection you cannot see is the dead end `use-create-collection.ts` exists
    // to prevent.
    expect(await attemptCreateCollection('Lisbon', { online: true })).toEqual({
      kind: 'ok',
      id: 'col-1',
    });
  });

  it('trims the name and sends an empty description', async () => {
    create.mockResolvedValue({ ok: true, id: 'col-2' });

    await attemptCreateCollection('  Lisbon  ', { online: true });

    // Trimming lives here rather than in each caller, so `'  '` is empty for every entry point at
    // once. The description is the action's own second argument and is not this gesture's business.
    expect(create).toHaveBeenCalledWith('Lisbon', '');
  });

  it('passes a refusal through in the server’s own words', async () => {
    create.mockResolvedValue({ ok: false, message: 'That name is already yours.' });

    expect(await attemptCreateCollection('Lisbon', { online: true })).toEqual({
      kind: 'refused',
      message: 'That name is already yours.',
    });
  });

  it('turns a rejected transport into a value instead of a throw', async () => {
    create.mockRejectedValue(TRANSPORT_FAILURE);

    // `resolves` is the assertion. A rejection here is what React escalated to `app/error.tsx`,
    // and on `/map` that is the map, every pin, the open place and the compose form's contents.
    await expect(attemptCreateCollection('Lisbon', { online: true })).resolves.toEqual({
      kind: 'unreachable',
      message: WRITE_FAILURE_COPY.unreachableKeepsDraft,
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('survives a synchronous throw and a non-Error rejection', async () => {
    // Next serialises a server failure into a value that is not an `Error`, and a bad module
    // boundary throws before the promise exists. Either one costs the same screen.
    create.mockImplementation(() => {
      throw TRANSPORT_FAILURE;
    });
    await expect(attemptCreateCollection('Lisbon', { online: true })).resolves.toMatchObject({
      kind: 'unreachable',
    });

    create.mockReset();
    create.mockRejectedValue('digest:1a2b3c');
    await expect(attemptCreateCollection('Lisbon', { online: true })).resolves.toMatchObject({
      kind: 'unreachable',
    });
  });
});

describe('one event, one wording — the two helpers must not fork', () => {
  it('answers a dropped connection exactly as attemptWrite does', async () => {
    create.mockRejectedValue(TRANSPORT_FAILURE);

    const created = await attemptCreateCollection('Lisbon', { online: true });
    const written = await attemptWrite(() => Promise.reject(TRANSPORT_FAILURE), {
      online: true,
      keepsDraft: true,
    });

    // Two functions, one event. If either grows its own sentence for *the request did not arrive*,
    // this fails and the two get reconciled deliberately rather than drifting — which is the whole
    // of §6's ruling, applied to the one place the shapes legitimately differ.
    expect(created).toEqual(written);
  });

  it('answers an offline press exactly as attemptWrite does', async () => {
    const created = await attemptCreateCollection('Lisbon', { online: false });
    const written = await attemptWrite(async () => ({ ok: true }), {
      online: false,
      keepsDraft: true,
    });

    expect(created).toEqual(written);
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * The other seven sites, and the shape of the defect rather than one instance of it.
 *
 * Read from source for the same reason `write-failure.test.ts` reads `add-by-name.tsx`: these are
 * client components full of JSX, the runner has no DOM to press them with, and what needs holding
 * is a property of the file — that no Server Action is awaited bare inside a transition. Every one
 * of the nine reported sites was literally `await <action>(…)`, so an allow-list of awaited callees
 * catches the tenth before it is measured offline.
 */
describe('no collection write awaits a Server Action directly', () => {
  function source(relative: string): string {
    return readFileSync(fileURLToPath(new URL(`../../../src/${relative}`, import.meta.url)), 'utf8');
  }

  /** Every `await x(` in a file, by callee name. */
  function awaitedCallees(text: string): string[] {
    return [...text.matchAll(/await\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1] ?? '');
  }

  it('the picker awaits only helpers that cannot throw', () => {
    // Four of the nine: the two toggle arms, and the create-and-add pair in the compose row.
    expect(new Set(awaitedCallees(source('components/collections/add-to-collection.tsx')))).toEqual(
      new Set(['attemptWrite', 'attemptCreateCollection']),
    );
  });

  it('the collection’s own menu and picker await only helpers that cannot throw', () => {
    // The other four: edit, delete, leave, and the multi-select add.
    expect(
      new Set(awaitedCallees(source('components/collections/collection-content.tsx'))),
    ).toEqual(new Set(['attemptWrite']));
  });

  it('the one direct action call is the one inside the catch', () => {
    const text = source('components/collections/use-create-collection.ts');

    // `attemptCreateCollection` is allowed to await the action — being the thing that catches for
    // everybody else is its job — and the hook is then allowed to await it. Nothing else.
    expect(new Set(awaitedCallees(text))).toEqual(
      new Set(['createCollection', 'attemptCreateCollection']),
    );
    expect(text).toMatch(/try \{[\s\S]*await createCollection\([\s\S]*\} catch \(/);
  });
});
