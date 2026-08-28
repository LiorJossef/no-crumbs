/**
 * Unit coverage for the Server Actions on a saved place — the two behind `L1-F7-T2`, the category
 * override added on 2026-08-28, and the been / not-been mark (`L1-F12-T1`).
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

const {
  deleteSavedPlace,
  setSavedPlaceVisited,
  updateSavedPlaceCategory,
  updateSavedPlaceNote,
} = await import('@/app/actions/saved-places');

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

describe('updateSavedPlaceCategory', () => {
  it('writes the category the user chose, and nothing else', () => {
    return updateSavedPlaceCategory('sp-1', 'dessert').then((outcome) => {
      expect(outcome).toEqual({ ok: true });
      expect(calls).toEqual([
        {
          table: 'saved_places',
          op: 'update',
          values: { category_override: 'dessert' },
          count: 'exact',
          filter: { column: 'id', value: 'sp-1' },
        },
      ]);
      expect(revalidated).toEqual(['/map']);
    });
  });

  it('clears with SQL NULL, never with a frozen derivation', async () => {
    // The distinction the control depends on: `null` means "use whatever you work out", so a
    // better provider category tomorrow still reaches this place. Writing `'other'` — or today's
    // derived value — would opt it out of every future improvement, silently.
    await updateSavedPlaceCategory('sp-1', null);
    expect(calls[0]?.values).toEqual({ category_override: null });
  });

  it('refuses a value the renderer could not draw, without touching the database', async () => {
    // `category_override` is plain `text` with no CHECK, and `productCategoryFor` renders an
    // unparseable override as `Place` on purpose — right for reading old rows, wrong for accepting
    // new ones. A user who sent `Kaffee` would see `Place` with no way to tell why.
    const outcome = await updateSavedPlaceCategory('sp-1', 'Kaffee' as never);
    expect(outcome).toEqual({ ok: false, message: 'That is not a category we know.' });
    expect(calls).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('reports a row that is not the callers as gone, exactly as the other two do', async () => {
    result = { error: null, count: 0 };
    const outcome = await updateSavedPlaceCategory('someone-elses-row', 'bar');
    expect(outcome).toEqual({ ok: false, message: 'That place is no longer in your list.' });
    expect(revalidated).toEqual([]);
  });

  it('never leaks Postgres error text to the browser', async () => {
    result = { error: { code: '42501', message: 'permission denied for column category_override' }, count: null };
    const outcome = await updateSavedPlaceCategory('sp-1', 'bar');
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't change the category. Try again.");
    expect(outcome.message).not.toContain('permission denied');
  });

  it('does not write when signed out', async () => {
    currentUser = null;
    const outcome = await updateSavedPlaceCategory('sp-1', 'bar');
    expect(outcome.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('setSavedPlaceVisited', () => {
  /**
   * The trap this whole feature turns on. `saved_places_visited_at_consistent` (`0006`) is
   * `check (visit_state = 'visited' or visited_at is null)`, so the two columns are one value in
   * two slots: an update that clears the state and leaves the timestamp is rejected with `23514`,
   * and an update that sets the timestamp without the state is rejected from the other side.
   *
   * These tests pin the payload rather than the outcome, because the payload is the only thing
   * this side of the wire controls — and the failing shape is asserted *by name* below rather than
   * routed around, so a future edit that writes one column at a time goes red here instead of in
   * production. The constraint itself is Postgres's and was exercised directly against the local
   * database (`23514` on the split write, accepted on the paired one); a mock cannot prove that and
   * this file does not pretend to.
   */
  it('marks a place as been by writing both columns in one update', async () => {
    const before = Date.now();
    await expect(setSavedPlaceVisited('sp-1', true)).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.table).toBe('saved_places');
    expect(call?.op).toBe('update');
    expect(call?.count).toBe('exact');
    expect(call?.filter).toEqual({ column: 'id', value: 'sp-1' });
    expect(Object.keys(call?.values ?? {}).sort()).toEqual(['visit_state', 'visited_at']);
    expect(call?.values?.visit_state).toBe('visited');
    const stamped = Date.parse(String(call?.values?.visited_at));
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(revalidated).toEqual(['/map']);
  });

  it('unmarks by clearing the timestamp in the same statement, never leaving it behind', async () => {
    // The 23514 shape, asserted directly: `visit_state: 'want_to_go'` with a non-null `visited_at`
    // is exactly what the CHECK rejects, so it must never be constructed.
    await expect(setSavedPlaceVisited('sp-1', false)).resolves.toEqual({ ok: true });

    expect(calls[0]?.values).toEqual({ visit_state: 'want_to_go', visited_at: null });
    expect(calls[0]?.values?.visited_at).toBeNull();
  });

  it('survives the round trip mark -> unmark -> mark with a legal payload every time', async () => {
    await setSavedPlaceVisited('sp-1', true);
    await setSavedPlaceVisited('sp-1', false);
    await setSavedPlaceVisited('sp-1', true);

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const values = call.values ?? {};
      // The constraint, restated as a predicate over the payload: either the state is `visited`,
      // or the timestamp is null. Any third shape is a `23514` waiting to happen.
      expect(values.visit_state === 'visited' || values.visited_at === null).toBe(true);
      expect(Object.keys(values).sort()).toEqual(['visit_state', 'visited_at']);
    }
    expect(calls.map((call) => call.values?.visit_state)).toEqual([
      'visited',
      'want_to_go',
      'visited',
    ]);
  });

  it('writes the two visit columns and nothing else', async () => {
    // `0006`'s UPDATE column grant covers display_name/category_override/note/visit_state/
    // visited_at. Widening this action would be a schema conversation, not a code change.
    await setSavedPlaceVisited('sp-1', true);
    expect(Object.keys(calls[0]?.values ?? {}).sort()).toEqual(['visit_state', 'visited_at']);
  });

  it('filters on the row id alone and adds no user_id filter of its own', async () => {
    // `saved_places_update_own` is the control. See the action file's header.
    await setSavedPlaceVisited('sp-1', true);
    expect(calls[0]?.filter).toEqual({ column: 'id', value: 'sp-1' });
  });

  it("reports another user's row as gone, and does not revalidate", async () => {
    result = { error: null, count: 0 };

    await expect(setSavedPlaceVisited('someone-elses-row', true)).resolves.toEqual({
      ok: false,
      message: 'That place is no longer in your list.',
    });
    expect(revalidated).toEqual([]);
  });

  it('refuses without a session and never reaches the database', async () => {
    currentUser = null;

    await expect(setSavedPlaceVisited('sp-1', true)).resolves.toEqual({
      ok: false,
      message: 'You are signed out. Sign in and try again.',
    });
    expect(calls).toEqual([]);
  });

  it('does not leak the CHECK violation into the message shown to the user', async () => {
    result = {
      error: { code: '23514', message: 'saved_places_visited_at_consistent violated' },
      count: null,
    };

    const outcome = await setSavedPlaceVisited('sp-1', false);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't update that place. Try again.");
    expect(outcome.message).not.toContain('saved_places_visited_at_consistent');
    expect(outcome.message).not.toContain('23514');
    expect(revalidated).toEqual([]);
  });

  it('never puts a schema word in anything the user can read', async () => {
    result = { error: null, count: 0 };
    const gone = await setSavedPlaceVisited('sp-1', true);
    result = { error: { code: '23514', message: 'x' }, count: null };
    const failed = await setSavedPlaceVisited('sp-1', true);
    currentUser = null;
    const signedOut = await setSavedPlaceVisited('sp-1', true);

    for (const outcome of [gone, failed, signedOut]) {
      if (outcome.ok) throw new Error('unreachable');
      for (const word of ['visit_state', 'want_to_go', 'visited']) {
        expect(outcome.message).not.toContain(word);
      }
    }
  });
});
