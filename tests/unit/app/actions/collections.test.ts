/**
 * Unit coverage for the five collection writes — `createCollection`, `updateCollection`,
 * `deleteCollection`, `addPlacesToCollection` and `removePlaceFromCollection`.
 *
 * Same posture and the same limits as `saved-places.test.ts`: the Supabase client is mocked, so
 * this proves the *shape* of what reaches the database — which table, which columns, which filters,
 * whether `count: 'exact'` was asked for, whether `revalidatePath` ran — and not that RLS scopes
 * the write. It deliberately cannot: authorisation is a property of migration `0024`'s policies and
 * is asserted against a real Postgres in `supabase/tests/0024_collections_policy_tests.sql`.
 *
 * What the mock *can* prove, and what most of these tests are for, are absences: that no action
 * computes authorisation for itself with a `user_id` filter, that the item actions never name
 * `saved_places` or `places`, and that no Postgres error text survives into a message a person
 * reads. None of those would fail loudly if they regressed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
} from '@/domain/collections/collection';

type Op = 'insert' | 'update' | 'delete' | 'select';

/** Every statement the actions send, in order, so absences can be asserted too. */
interface RecordedCall {
  readonly table: string;
  readonly op: Op;
  readonly values?: Record<string, unknown>;
  readonly count?: string;
  readonly columns?: string;
  readonly single?: boolean;
  readonly filters: { readonly kind: 'eq' | 'in' | 'is'; readonly column: string; readonly value: unknown }[];
}

interface Answer {
  readonly error?: { code: string; message: string } | null;
  readonly count?: number | null;
  readonly data?: unknown;
}

const calls: RecordedCall[] = [];
const revalidated: string[] = [];

let currentUser: { id: string } | null = { id: 'user-1' };

/** What the mocked database answers with, per statement. Reset per test. */
let respond: (call: RecordedCall) => Answer = () => ({ error: null, count: 1 });

const defaultAnswer = (call: RecordedCall): Answer =>
  call.single
    ? { error: null, data: { id: 'collection-1' } }
    : call.op === 'select'
      ? { error: null, data: [] }
      : { error: null, count: 1 };

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from(table: string) {
      const start = (op: Op, values?: Record<string, unknown>, options?: { count?: string }) => {
        const call: RecordedCall = {
          table,
          op,
          ...(values ? { values } : {}),
          ...(options?.count ? { count: options.count } : {}),
          filters: [],
        };
        // A thenable rather than a terminal method, because these actions end their chains in four
        // different places (`.limit`, `.single`, the last `.eq`, the bare `.insert`). Recording on
        // await is the only point every one of them passes through.
        const builder = {
          eq(column: string, value: unknown) {
            call.filters.push({ kind: 'eq', column, value });
            return builder;
          },
          in(column: string, value: unknown) {
            call.filters.push({ kind: 'in', column, value });
            return builder;
          },
          is(column: string, value: unknown) {
            call.filters.push({ kind: 'is', column, value });
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          select(columns: string) {
            Object.assign(call, { columns });
            return builder;
          },
          single() {
            Object.assign(call, { single: true });
            return builder;
          },
          then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
            calls.push(call);
            const answer = { ...defaultAnswer(call), ...respond(call) };
            return Promise.resolve(answer).then(resolve, reject);
          },
        };
        return builder;
      };

      return {
        insert: (values: Record<string, unknown>) => start('insert', values),
        update: (values: Record<string, unknown>, options?: { count?: string }) =>
          start('update', values, options),
        delete: (options?: { count?: string }) => start('delete', undefined, options),
        select: (columns: string) => {
          const builder = start('select');
          return builder.select(columns);
        },
      };
    },
  }),
}));

const {
  addPlacesToCollection,
  createCollection,
  deleteCollection,
  removePlaceFromCollection,
  updateCollection,
} = await import('@/app/actions/collections');

const SIGNED_OUT = 'You are signed out. Sign in and try again.';
const NO_ACCESS = "You can't change this collection.";

beforeEach(() => {
  calls.length = 0;
  revalidated.length = 0;
  currentUser = { id: 'user-1' };
  respond = () => ({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** The tables these actions must never name, whatever else they do. */
const forbidden = (names = calls.map((call) => call.table)) =>
  names.filter((table) => table === 'saved_places' || table === 'places');

describe('createCollection', () => {
  it('inserts owner, name and description, and returns the new id', async () => {
    respond = () => ({ data: { id: 'c-new' } });

    await expect(createCollection('  Tel  Aviv eats ', ' best of ')).resolves.toEqual({
      ok: true,
      id: 'c-new',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe('collections');
    expect(calls[0]?.op).toBe('insert');
    // Whitespace-collapsed name, trimmed description — the validators' contract, pinned at the wire.
    expect(calls[0]?.values).toEqual({
      owner_id: 'user-1',
      name: 'Tel Aviv eats',
      description: 'best of',
    });
    expect(calls[0]?.columns).toBe('id');
    expect(calls[0]?.single).toBe(true);
    expect(revalidated).toEqual(['/map']);
  });

  it('writes those three columns and nothing else', async () => {
    await createCollection('Eats', '');
    expect(Object.keys(calls[0]?.values ?? {}).sort()).toEqual(['description', 'name', 'owner_id']);
  });

  it('stamps the owner from the session, never from an argument', async () => {
    currentUser = { id: 'user-42' };
    await createCollection('Eats', '');
    expect(calls[0]?.values?.owner_id).toBe('user-42');
  });

  it('writes SQL NULL for an empty description, not an empty string', async () => {
    await createCollection('Eats', '   ');
    expect(calls[0]?.values?.description).toBeNull();
  });

  it('does not insert the owner membership row — that is 0024’s trigger', async () => {
    await createCollection('Eats', '');
    expect(calls.map((call) => call.table)).toEqual(['collections']);
  });

  it('rejects an empty name before touching the database', async () => {
    await expect(createCollection('   ', 'desc')).resolves.toEqual({
      ok: false,
      message: 'Give the collection a name.',
    });
    expect(calls).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('rejects an over-long name before touching the database', async () => {
    const outcome = await createCollection('a'.repeat(COLLECTION_NAME_MAX_LENGTH + 1), '');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('too long');
    expect(calls).toEqual([]);
  });

  it('rejects an over-long description before touching the database', async () => {
    const outcome = await createCollection(
      'Eats',
      'a'.repeat(COLLECTION_DESCRIPTION_MAX_LENGTH + 1),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('too long');
    expect(calls).toEqual([]);
  });

  it('validates before checking the session, so the cheap failure comes first', async () => {
    currentUser = null;
    const outcome = await createCollection('', '');
    expect(outcome).toEqual({ ok: false, message: 'Give the collection a name.' });
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;
    await expect(createCollection('Eats', '')).resolves.toEqual({ ok: false, message: SIGNED_OUT });
    expect(calls).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    respond = () => ({
      error: { code: '42501', message: 'new row violates row-level security policy for table "collections"' },
      data: null,
    });

    const outcome = await createCollection('Eats', '');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't create that collection. Try again.");
    expect(outcome.message).not.toContain('row-level security');
    expect(outcome.message).not.toContain('42501');
    expect(revalidated).toEqual([]);
  });

  it('treats a missing row as a failure even when Postgres raised nothing', async () => {
    respond = () => ({ error: null, data: null });
    const outcome = await createCollection('Eats', '');
    expect(outcome).toEqual({ ok: false, message: "Couldn't create that collection. Try again." });
    expect(revalidated).toEqual([]);
  });
});

describe('updateCollection', () => {
  it('updates name and description on the addressed collection', async () => {
    await expect(updateCollection('c-1', ' Tel  Aviv ', ' notes ')).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe('collections');
    expect(calls[0]?.op).toBe('update');
    expect(calls[0]?.values).toEqual({ name: 'Tel Aviv', description: 'notes' });
    expect(calls[0]?.count).toBe('exact');
    expect(calls[0]?.filters).toEqual([{ kind: 'eq', column: 'id', value: 'c-1' }]);
    expect(revalidated).toEqual(['/map']);
  });

  it('writes the two columns and nothing else', async () => {
    await updateCollection('c-1', 'Eats', '');
    expect(Object.keys(calls[0]?.values ?? {}).sort()).toEqual(['description', 'name']);
  });

  it('clears the description with SQL NULL', async () => {
    await updateCollection('c-1', 'Eats', '  ');
    expect(calls[0]?.values?.description).toBeNull();
  });

  it('does not compute authorisation for itself — no owner_id or user_id filter', async () => {
    // `collections_update_owner` is the control. A redundant filter here would make this file look
    // like the safety net and let the policy be removed with nothing going red.
    await updateCollection('c-1', 'Eats', '');
    expect(calls[0]?.filters.map((filter) => filter.column)).toEqual(['id']);
  });

  it('asks for an exact count, because a non-owner matches zero rows rather than erroring', async () => {
    await updateCollection('c-1', 'Eats', '');
    expect(calls[0]?.count).toBe('exact');
  });

  it("reports a collection that is not the caller's as no-access, and does not revalidate", async () => {
    respond = () => ({ error: null, count: 0 });

    await expect(updateCollection('someone-elses', 'Mine now', '')).resolves.toEqual({
      ok: false,
      message: NO_ACCESS,
    });
    expect(revalidated).toEqual([]);
  });

  it('rejects an invalid name before touching the database', async () => {
    await expect(updateCollection('c-1', '', '')).resolves.toEqual({
      ok: false,
      message: 'Give the collection a name.',
    });
    expect(calls).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;
    await expect(updateCollection('c-1', 'Eats', '')).resolves.toEqual({
      ok: false,
      message: SIGNED_OUT,
    });
    expect(calls).toEqual([]);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    respond = () => ({
      error: { code: '23514', message: 'collections_name_check violated' },
      count: null,
    });

    const outcome = await updateCollection('c-1', 'Eats', '');

    expect(outcome).toEqual({ ok: false, message: "Couldn't save those changes. Try again." });
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).not.toContain('collections_name_check');
    expect(revalidated).toEqual([]);
  });
});

describe('deleteCollection', () => {
  it('deletes the addressed collection and refreshes the map', async () => {
    await expect(deleteCollection('c-1')).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      {
        table: 'collections',
        op: 'delete',
        count: 'exact',
        filters: [{ kind: 'eq', column: 'id', value: 'c-1' }],
      },
    ]);
    expect(revalidated).toEqual(['/map']);
  });

  it('never names saved_places or places — deleting a collection costs nobody their library', async () => {
    await deleteCollection('c-1');
    expect(forbidden()).toEqual([]);
  });

  it('does not delete collection_items or collection_members itself', async () => {
    // Both are `on delete cascade` in `0024`. Doing it here as well would be a second, unpoliced
    // path to the same rows.
    await deleteCollection('c-1');
    expect(calls.map((call) => call.table)).toEqual(['collections']);
  });

  it('does not compute authorisation for itself — no owner_id filter', async () => {
    await deleteCollection('c-1');
    expect(calls[0]?.filters.map((filter) => filter.column)).toEqual(['id']);
  });

  it('reports a collection it could not touch as no-access, and does not revalidate', async () => {
    respond = () => ({ error: null, count: 0 });

    await expect(deleteCollection('someone-elses')).resolves.toEqual({
      ok: false,
      message: NO_ACCESS,
    });
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;
    await expect(deleteCollection('c-1')).resolves.toEqual({ ok: false, message: SIGNED_OUT });
    expect(calls).toEqual([]);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    respond = () => ({
      error: { code: '42501', message: 'permission denied for table collections' },
      count: null,
    });

    const outcome = await deleteCollection('c-1');

    expect(outcome).toEqual({ ok: false, message: "Couldn't delete that collection. Try again." });
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).not.toContain('permission denied');
    expect(revalidated).toEqual([]);
  });
});

describe('addPlacesToCollection', () => {
  /** The position probe answers with `rows`; every insert answers with `onInsert`. */
  const withPositions = (
    rows: unknown[],
    onInsert: (call: RecordedCall) => Answer = () => ({ error: null }),
  ) => {
    respond = (call) => (call.op === 'select' ? { error: null, data: rows } : onInsert(call));
  };

  it('appends after the last position, one insert per place', async () => {
    withPositions([{ position: 4 }]);

    await expect(addPlacesToCollection('c-1', ['p-1', 'p-2'])).resolves.toEqual({
      ok: true,
      added: 2,
      alreadyThere: 0,
    });

    expect(calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'collection_items:select',
      'collection_items:insert',
      'collection_items:insert',
    ]);
    expect(calls[0]?.columns).toBe('position');
    expect(calls[0]?.filters).toEqual([{ kind: 'eq', column: 'collection_id', value: 'c-1' }]);
    expect(calls[1]?.values).toEqual({
      collection_id: 'c-1',
      place_id: 'p-1',
      added_by: 'user-1',
      position: 5,
    });
    expect(calls[2]?.values).toEqual({
      collection_id: 'c-1',
      place_id: 'p-2',
      added_by: 'user-1',
      position: 6,
    });
    expect(revalidated).toEqual(['/map']);
  });

  it('starts an empty collection at position 0', async () => {
    withPositions([]);
    await addPlacesToCollection('c-1', ['p-1']);
    expect(calls[1]?.values?.position).toBe(0);
  });

  it('writes those four columns and nothing else', async () => {
    withPositions([]);
    await addPlacesToCollection('c-1', ['p-1']);
    expect(Object.keys(calls[1]?.values ?? {}).sort()).toEqual([
      'added_by',
      'collection_id',
      'place_id',
      'position',
    ]);
  });

  it('attributes the item to the session user, never to an argument', async () => {
    currentUser = { id: 'user-9' };
    withPositions([]);
    await addPlacesToCollection('c-1', ['p-1']);
    expect(calls[1]?.values?.added_by).toBe('user-9');
  });

  it('never touches saved_places or places — a collection points at shared identity rows', async () => {
    withPositions([{ position: 0 }]);
    await addPlacesToCollection('c-1', ['p-1', 'p-2']);
    expect(forbidden()).toEqual([]);
    expect(new Set(calls.map((call) => call.table))).toEqual(new Set(['collection_items']));
  });

  it('counts a duplicate as already there rather than failing the batch', async () => {
    withPositions([{ position: 0 }], (call) =>
      call.values?.place_id === 'p-2'
        ? { error: { code: '23505', message: 'duplicate key value violates collection_items_unique' } }
        : { error: null },
    );

    await expect(addPlacesToCollection('c-1', ['p-1', 'p-2', 'p-3'])).resolves.toEqual({
      ok: true,
      added: 2,
      alreadyThere: 1,
    });
    expect(revalidated).toEqual(['/map']);
  });

  it('does not consume a position for a duplicate, so the order stays dense', async () => {
    withPositions([{ position: 0 }], (call) =>
      call.values?.place_id === 'p-1'
        ? { error: { code: '23505', message: 'duplicate key' } }
        : { error: null },
    );

    await addPlacesToCollection('c-1', ['p-1', 'p-2']);

    const inserts = calls.filter((call) => call.op === 'insert');
    expect(inserts.map((call) => call.values?.position)).toEqual([1, 1]);
  });

  it('stops at a policy refusal when nothing has been added yet', async () => {
    withPositions([], () => ({ error: { code: '42501', message: 'permission denied for table collection_items' } }));

    const outcome = await addPlacesToCollection('c-1', ['p-1', 'p-2']);

    expect(outcome).toEqual({ ok: false, message: NO_ACCESS });
    // The second place is never attempted: one refusal answers for the whole batch.
    expect(calls.filter((call) => call.op === 'insert')).toHaveLength(1);
    expect(revalidated).toEqual([]);
  });

  it('keeps what it managed to add when a later insert is refused', async () => {
    withPositions([], (call) =>
      call.values?.place_id === 'p-2'
        ? { error: { code: '42501', message: 'permission denied for table collection_items' } }
        : { error: null },
    );

    await expect(addPlacesToCollection('c-1', ['p-1', 'p-2', 'p-3'])).resolves.toEqual({
      ok: true,
      added: 1,
      alreadyThere: 0,
    });
    expect(calls.filter((call) => call.op === 'insert')).toHaveLength(2);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    withPositions([], () => ({
      error: { code: '42501', message: 'permission denied for table collection_items' },
    }));

    const outcome = await addPlacesToCollection('c-1', ['p-1']);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe(NO_ACCESS);
    expect(outcome.message).not.toContain('permission denied');
    expect(outcome.message).not.toContain('42501');
  });

  it('never reaches the database with an empty selection', async () => {
    await expect(addPlacesToCollection('c-1', [])).resolves.toEqual({
      ok: true,
      added: 0,
      alreadyThere: 0,
    });
    expect(calls).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;
    await expect(addPlacesToCollection('c-1', ['p-1'])).resolves.toEqual({
      ok: false,
      message: SIGNED_OUT,
    });
    expect(calls).toEqual([]);
  });

  it('checks the session before short-circuiting on an empty selection', async () => {
    // A signed-out no-op is still a signed-out call; the empty case must not look like success.
    currentUser = null;
    await expect(addPlacesToCollection('c-1', [])).resolves.toEqual({
      ok: false,
      message: SIGNED_OUT,
    });
  });
});

describe('removePlaceFromCollection', () => {
  it('deletes the one item matching the collection and place pair', async () => {
    await expect(removePlaceFromCollection('c-1', 'p-1')).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      {
        table: 'collection_items',
        op: 'delete',
        count: 'exact',
        filters: [
          { kind: 'eq', column: 'collection_id', value: 'c-1' },
          { kind: 'eq', column: 'place_id', value: 'p-1' },
        ],
      },
    ]);
    expect(revalidated).toEqual(['/map']);
  });

  it('never touches saved_places or places — this removal costs the viewer nothing', async () => {
    await removePlaceFromCollection('c-1', 'p-1');
    expect(forbidden()).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(['collection_items']);
  });

  it('scopes the delete to the collection on screen, not to the place alone', async () => {
    // Without `collection_id` a stale place id would be removed from every collection the caller
    // can edit — silently, and correctly, which is the wrong kind of correct.
    await removePlaceFromCollection('c-1', 'p-1');
    expect(calls[0]?.filters.map((filter) => filter.column)).toEqual(['collection_id', 'place_id']);
  });

  it('does not compute authorisation for itself — no user_id or added_by filter', async () => {
    await removePlaceFromCollection('c-1', 'p-1');
    expect(
      calls[0]?.filters.some((filter) => filter.column === 'user_id' || filter.column === 'added_by'),
    ).toBe(false);
  });

  it('asks for an exact count, because a viewer matches zero rows rather than erroring', async () => {
    await removePlaceFromCollection('c-1', 'p-1');
    expect(calls[0]?.count).toBe('exact');
  });

  it('reports a row it could not touch as no-access, and does not revalidate', async () => {
    respond = () => ({ error: null, count: 0 });

    await expect(removePlaceFromCollection('c-1', 'not-in-there')).resolves.toEqual({
      ok: false,
      message: NO_ACCESS,
    });
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;
    await expect(removePlaceFromCollection('c-1', 'p-1')).resolves.toEqual({
      ok: false,
      message: SIGNED_OUT,
    });
    expect(calls).toEqual([]);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    respond = () => ({
      error: { code: '42501', message: 'permission denied for table collection_items' },
      count: null,
    });

    const outcome = await removePlaceFromCollection('c-1', 'p-1');

    expect(outcome).toEqual({ ok: false, message: "Couldn't remove that place. Try again." });
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).not.toContain('permission denied');
    expect(revalidated).toEqual([]);
  });
});

describe('no schema or Postgres word reaches a user-facing message', () => {
  it('holds across every refusal shape of all five actions', async () => {
    const leaky = ['permission denied', '42501', '23505', '23514', 'row-level security',
      'collection_items', 'collections', 'owner_id', 'added_by'];

    const messages: string[] = [];
    const collect = (outcome: { ok: boolean; message?: string }) => {
      if (!outcome.ok && outcome.message) messages.push(outcome.message);
    };

    for (const shape of [
      () => ({ error: { code: '42501', message: 'permission denied for table collection_items' }, count: null, data: null }),
      () => ({ error: { code: '23505', message: 'duplicate key value violates collection_items_unique' }, count: null, data: null }),
      () => ({ error: null, count: 0, data: null }),
    ]) {
      respond = shape;
      collect(await createCollection('Eats', ''));
      collect(await updateCollection('c-1', 'Eats', ''));
      collect(await deleteCollection('c-1'));
      collect(await removePlaceFromCollection('c-1', 'p-1'));
      collect(await addPlacesToCollection('c-1', ['p-1']));
    }

    currentUser = null;
    collect(await createCollection('Eats', ''));
    collect(await addPlacesToCollection('c-1', ['p-1']));

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      for (const word of leaky) expect(message.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
