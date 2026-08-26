/**
 * Unit coverage for the two Server Actions behind `L1-F7-T2`.
 *
 * The Supabase client is mocked, so this proves the *shape* of what reaches the database — which
 * table, which filter, which values, and whether `revalidatePath` runs — not that RLS scopes the
 * write to the caller. It deliberately cannot prove that: RLS is a property of the database, and
 * asserting it against a mock would be asserting it against this file's own beliefs. `L1-F7-T3`
 * proves the ownership half against a real Postgres, in `supabase/tests/0008_policy_tests.sql`.
 *
 * The one thing worth naming here: several of these tests exist to pin *absences*. That the delete
 * never names the `places` table, that no Postgres error text reaches the returned message, and
 * that a no-op revalidation does not happen — none of those would fail loudly if they regressed,
 * so they are asserted explicitly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTE_MAX_LENGTH } from '@/domain/places/note';

/** Every table/filter/value the actions send, in order, so absences can be asserted too. */
interface RecordedCall {
  readonly table: string;
  readonly op: 'delete' | 'update';
  readonly values?: Record<string, unknown>;
  readonly count?: string;
  readonly filter?: { readonly column: string; readonly value: unknown };
}

const calls: RecordedCall[] = [];
const revalidated: string[] = [];

/** What the mocked database answers with. Reset per test. */
let currentUser: { id: string } | null = { id: 'user-1' };
let result: { error: { code: string; message: string } | null; count: number | null } = {
  error: null,
  count: 1,
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
          const call: RecordedCall = { table, op: 'delete', ...(options?.count ? { count: options.count } : {}) };
          return {
            eq(column: string, value: unknown) {
              calls.push({ ...call, filter: { column, value } });
              return Promise.resolve(result);
            },
          };
        },
        update(values: Record<string, unknown>, options?: { count?: string }) {
          const call: RecordedCall = {
            table,
            op: 'update',
            values,
            ...(options?.count ? { count: options.count } : {}),
          };
          return {
            eq(column: string, value: unknown) {
              calls.push({ ...call, filter: { column, value } });
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  }),
}));

const { deleteSavedPlace, updateSavedPlaceNote } = await import('@/app/actions/saved-places');

beforeEach(() => {
  calls.length = 0;
  revalidated.length = 0;
  currentUser = { id: 'user-1' };
  result = { error: null, count: 1 };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('deleteSavedPlace', () => {
  it('deletes the addressed saved place and refreshes the map', async () => {
    await expect(deleteSavedPlace('sp-1')).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      { table: 'saved_places', op: 'delete', count: 'exact', filter: { column: 'id', value: 'sp-1' } },
    ]);
    expect(revalidated).toEqual(['/map']);
  });

  it('never touches the shared `places` table', async () => {
    // `places` rows are shared across users (charter invariant 4). A user removing their own save
    // must not delete a row someone else has saved.
    await deleteSavedPlace('sp-1');
    expect(calls.map((call) => call.table)).not.toContain('places');
  });

  it('filters on the row id alone and adds no user_id filter of its own', async () => {
    // Deliberate: `saved_places_delete_own` is the control. A redundant filter here would make
    // this file look like the safety net, and the policy could then be removed with nothing going
    // red. See the action's header.
    await deleteSavedPlace('sp-1');
    expect(calls[0]?.filter).toEqual({ column: 'id', value: 'sp-1' });
  });

  it('asks for an exact count, because RLS turns "not yours" into zero rows rather than an error', async () => {
    await deleteSavedPlace('sp-1');
    expect(calls[0]?.count).toBe('exact');
  });

  it('reports a row that matched nothing as gone, and does not revalidate', async () => {
    result = { error: null, count: 0 };

    const outcome = await deleteSavedPlace('someone-elses-row');

    expect(outcome).toEqual({ ok: false, message: 'That place is no longer in your list.' });
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;

    await expect(deleteSavedPlace('sp-1')).resolves.toEqual({
      ok: false,
      message: 'You are signed out. Sign in and try again.',
    });
    expect(calls).toEqual([]);
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    result = { error: { code: '42501', message: 'permission denied for table saved_places' }, count: null };

    const outcome = await deleteSavedPlace('sp-1');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't remove that place. Try again.");
    expect(outcome.message).not.toContain('permission denied');
    expect(outcome.message).not.toContain('42501');
    expect(revalidated).toEqual([]);
  });
});

describe('updateSavedPlaceNote', () => {
  it('writes the trimmed note and refreshes the map', async () => {
    await expect(updateSavedPlaceNote('sp-1', '  going for my birthday  ')).resolves.toEqual({
      ok: true,
    });

    expect(calls).toEqual([
      {
        table: 'saved_places',
        op: 'update',
        values: { note: 'going for my birthday' },
        count: 'exact',
        filter: { column: 'id', value: 'sp-1' },
      },
    ]);
    expect(revalidated).toEqual(['/map']);
  });

  it('writes SQL NULL when the note is cleared, not an empty string', async () => {
    await updateSavedPlaceNote('sp-1', '   ');
    expect(calls[0]?.values).toEqual({ note: null });
  });

  it('writes the note and nothing else', async () => {
    // The UPDATE column grant covers note/display_name/category_override/visit_state/visited_at.
    // Widening this action would be a schema conversation, not a code change.
    await updateSavedPlaceNote('sp-1', 'a note');
    expect(Object.keys(calls[0]?.values ?? {})).toEqual(['note']);
  });

  it('rejects an over-long note before touching the database', async () => {
    const outcome = await updateSavedPlaceNote('sp-1', 'a'.repeat(NOTE_MAX_LENGTH + 1));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('too long');
    expect(calls).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('reports a row that matched nothing as gone', async () => {
    result = { error: null, count: 0 };

    await expect(updateSavedPlaceNote('someone-elses-row', 'mine now')).resolves.toEqual({
      ok: false,
      message: 'That place is no longer in your list.',
    });
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;

    await expect(updateSavedPlaceNote('sp-1', 'a note')).resolves.toEqual({
      ok: false,
      message: 'You are signed out. Sign in and try again.',
    });
    expect(calls).toEqual([]);
  });

  it('validates the note before checking the session, so the cheap failure comes first', async () => {
    currentUser = null;

    const outcome = await updateSavedPlaceNote('sp-1', 'a'.repeat(NOTE_MAX_LENGTH + 1));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('too long');
  });

  it('does not leak the Postgres error into the message shown to the user', async () => {
    result = { error: { code: '23514', message: 'saved_places_note_check violated' }, count: null };

    const outcome = await updateSavedPlaceNote('sp-1', 'a note');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't save your note. Try again.");
    expect(outcome.message).not.toContain('saved_places_note_check');
  });
});
