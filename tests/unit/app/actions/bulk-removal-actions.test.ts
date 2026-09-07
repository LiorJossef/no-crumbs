/**
 * The two bulk removals (round 3 §8.2), and the reason they are two.
 *
 * `deleteSavedPlaces` removes `saved_places` rows — irreversible, and it takes the note, the tags
 * and the Been mark with it. `removeCollectionItems` removes `collection_items` rows — reversible,
 * and it touches nothing the viewer owns. `docs/archive/ux-two-removals-one-screen.md` requires them to
 * stay distinct all the way down, so the load-bearing assertions here are about **which table each
 * one names** and, just as much, which table neither of them names.
 *
 * The Supabase client is mocked, so this proves the shape of the statement — table, filters,
 * `count: 'exact'` — and not that RLS scopes it. It cannot prove that, and asserting it against a
 * mock would be asserting it against this file's own beliefs: partial success is a property of
 * `saved_places_delete_own` and `collection_items_delete`, which live in Postgres. What the mock
 * *can* prove is that neither action tries to compute authorisation for itself — no `user_id`
 * filter appears in any recorded call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordedCall {
  readonly table: string;
  readonly count?: string;
  readonly filters: readonly { readonly kind: 'eq' | 'in'; readonly column: string; readonly value: unknown }[];
}

const calls: RecordedCall[] = [];
const revalidated: string[] = [];

let currentUser: { id: string } | null = { id: 'user-1' };
let result: { error: { code: string; message: string } | null; count: number | null } = {
  error: null,
  count: 3,
};

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from(table: string) {
      return {
        delete(options?: { count?: string }) {
          const filters: { kind: 'eq' | 'in'; column: string; value: unknown }[] = [];
          const call: RecordedCall = {
            table,
            ...(options?.count ? { count: options.count } : {}),
            filters,
          };
          const builder = {
            eq(column: string, value: unknown) {
              filters.push({ kind: 'eq', column, value });
              return builder;
            },
            in(column: string, value: unknown) {
              filters.push({ kind: 'in', column, value });
              calls.push(call);
              return Promise.resolve(result);
            },
          };
          return builder;
        },
      };
    },
  }),
}));

const { deleteSavedPlaces } = await import('@/app/actions/saved-places');
const { removeCollectionItems } = await import('@/app/actions/collections');

beforeEach(() => {
  calls.length = 0;
  revalidated.length = 0;
  currentUser = { id: 'user-1' };
  result = { error: null, count: 3 };
});

describe('deleteSavedPlaces — the irreversible one', () => {
  it('sends one .in over saved_places and never names places', async () => {
    const answer = await deleteSavedPlaces(['a', 'b', 'c']);

    expect(answer).toEqual({ ok: true, deleted: 3, requested: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe('saved_places');
    expect(calls[0]?.count).toBe('exact');
    expect(calls[0]?.filters).toEqual([{ kind: 'in', column: 'id', value: ['a', 'b', 'c'] }]);
    // `places` is shared across users and there is no delete grant for `authenticated` on it at
    // all. This assertion is here because its regression would be silent.
    expect(calls.some((call) => call.table === 'places')).toBe(false);
    expect(calls.some((call) => call.table === 'collection_items')).toBe(false);
    expect(revalidated).toEqual(['/map']);
  });

  it('does not compute authorisation for itself — no user_id filter', async () => {
    await deleteSavedPlaces(['a']);
    expect(calls[0]?.filters.some((filter) => filter.column === 'user_id')).toBe(false);
  });

  it('reports a partial run as the number, not as success or failure', async () => {
    // Seven ids, four of them the caller's: RLS matches zero rows for the rest and raises nothing.
    result = { error: null, count: 4 };
    expect(await deleteSavedPlaces(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({
      ok: true,
      deleted: 4,
      requested: 7,
    });
  });

  it('collapses duplicate ids before counting, so requested is a count of rows', async () => {
    await deleteSavedPlaces(['a', 'a', 'b']);
    expect(calls[0]?.filters[0]?.value).toEqual(['a', 'b']);
  });

  it('never reaches the database with an empty selection', async () => {
    // `.in('id', [])` is cheap to get wrong and expensive to get wrong.
    expect(await deleteSavedPlaces([])).toEqual({ ok: true, deleted: 0, requested: 0 });
    expect(calls).toHaveLength(0);
    expect(revalidated).toHaveLength(0);
  });

  it('says the caller is signed out rather than attempting the write', async () => {
    currentUser = null;
    const answer = await deleteSavedPlaces(['a']);
    expect(answer.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('keeps the Postgres error text out of the browser', async () => {
    result = { error: { code: '42501', message: 'permission denied for table saved_places' }, count: null };
    const answer = await deleteSavedPlaces(['a']);
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.message).not.toContain('permission denied');
    expect(revalidated).toHaveLength(0);
  });
});

describe('removeCollectionItems — the reversible one', () => {
  it('sends one .in over collection_items, scoped to the collection on screen', async () => {
    const answer = await removeCollectionItems('c1', ['i1', 'i2', 'i3']);

    expect(answer).toEqual({ ok: true, removed: 3, requested: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe('collection_items');
    expect(calls[0]?.count).toBe('exact');
    expect(calls[0]?.filters).toEqual([
      { kind: 'eq', column: 'collection_id', value: 'c1' },
      { kind: 'in', column: 'id', value: ['i1', 'i2', 'i3'] },
    ]);
  });

  it('never touches saved_places or places — this removal costs the viewer nothing', async () => {
    await removeCollectionItems('c1', ['i1']);
    expect(calls.map((call) => call.table)).toEqual(['collection_items']);
  });

  it('reports a partial run', async () => {
    result = { error: null, count: 1 };
    expect(await removeCollectionItems('c1', ['i1', 'i2'])).toEqual({
      ok: true,
      removed: 1,
      requested: 2,
    });
  });

  it('never reaches the database with an empty selection', async () => {
    expect(await removeCollectionItems('c1', [])).toEqual({ ok: true, removed: 0, requested: 0 });
    expect(calls).toHaveLength(0);
  });

  it('keeps the Postgres error text out of the browser', async () => {
    result = { error: { code: '42501', message: 'permission denied for table collection_items' }, count: null };
    const answer = await removeCollectionItems('c1', ['i1']);
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.message).not.toContain('permission denied');
  });
});
