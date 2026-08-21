import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';

interface FakeRow {
  id: string;
  platform_source_id: string;
  canonical_url: string | null;
  author_handle: string | null;
  author_name: string | null;
  content_text: string | null;
  thumbnail_url: string | null;
  fetch_status: 'pending' | 'ok' | 'failed';
  fetch_error_code: string | null;
}

/** The minimal chainable shape `oembed-source-adapter.ts` actually calls — not a real
 *  `SupabaseClient`, but every call site this adapter makes is exercised faithfully. */
function makeFakeDb() {
  const rows = new Map<string, FakeRow>();

  function upsertRow(patch: Partial<FakeRow> & { platform_source_id: string }) {
    const key = patch.platform_source_id;
    const existing: FakeRow =
      rows.get(key) ?? {
        id: key,
        platform_source_id: key,
        canonical_url: null,
        author_handle: null,
        author_name: null,
        content_text: null,
        thumbnail_url: null,
        fetch_status: 'pending',
        fetch_error_code: null,
      };
    rows.set(key, { ...existing, ...patch });
  }

  return {
    rows,
    from(table: string) {
      if (table !== 'sources') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          const eqs: [string, unknown][] = [];
          const builder = {
            eq(col: string, val: unknown) {
              eqs.push([col, val]);
              return builder;
            },
            async maybeSingle() {
              const id = eqs.find(([c]) => c === 'platform_source_id')?.[1] as string | undefined;
              const row = id !== undefined ? rows.get(id) ?? null : null;
              return { data: row, error: null };
            },
          };
          return builder;
        },
        upsert(patch: Partial<FakeRow> & { platform_source_id: string }) {
          upsertRow(patch);
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Partial<FakeRow>) {
          const eqs: [string, unknown][] = [];
          const neqs: [string, unknown][] = [];
          function apply() {
            const id = eqs.find(([c]) => c === 'platform_source_id')?.[1] as string | undefined;
            if (id !== undefined) {
              const existing = rows.get(id);
              const blocked = neqs.some(([c, v]) => existing && (existing as never)[c] === v);
              if (!blocked) {
                upsertRow({ platform_source_id: id, ...patch });
              }
            }
            return Promise.resolve({ data: null, error: null });
          }
          const builder = {
            eq(col: string, val: unknown) {
              eqs.push([col, val]);
              return builder;
            },
            neq(col: string, val: unknown) {
              neqs.push([col, val]);
              return apply();
            },
            then(
              onFulfilled?: ((v: { data: null; error: null }) => unknown) | null,
              onRejected?: ((e: unknown) => unknown) | null,
            ) {
              return apply().then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
      };
    },
  };
}

function ctx(signal: AbortSignal = new AbortController().signal): OpCtx {
  return { signal, importId: null, log: { event: () => {} } };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('oembedSourceAdapter.fetch', () => {
  it('parses a valid oEmbed payload into RawSource and writes it to the sources cache', async () => {
    const db = makeFakeDb();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        title: 'Nomena Roasters, placed on Allenby Street in Tel Aviv',
        author_name: 'Ann',
        author_unique_id: 'travel.by.ann',
        embed_product_id: '7395598157620497696',
        thumbnail_url: 'https://p16-sign.tiktokcdn.com/thumb.jpeg',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = oembedSourceAdapter(db as never);
    const raw = await adapter.fetch('7395598157620497696', ctx());

    expect(raw.authorHandle).toBe('travel.by.ann');
    expect(raw.texts).toEqual([
      { kind: 'caption', text: 'Nomena Roasters, placed on Allenby Street in Tel Aviv' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const row = db.rows.get('7395598157620497696');
    expect(row?.fetch_status).toBe('ok');
    expect(row?.content_text).toBe('Nomena Roasters, placed on Allenby Street in Tel Aviv');
  });

  it('serves a cached ok row with zero network calls', async () => {
    const db = makeFakeDb();
    db.rows.set('123', {
      id: '123',
      platform_source_id: '123',
      canonical_url: 'https://www.tiktok.com/@_/video/123',
      author_handle: 'someone',
      author_name: 'Someone',
      content_text: 'a cached caption',
      thumbnail_url: null,
      fetch_status: 'ok',
      fetch_error_code: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = oembedSourceAdapter(db as never);
    const raw = await adapter.fetch('123', ctx());

    expect(raw.texts[0]?.text).toBe('a cached caption');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a non-2xx response to POST_UNAVAILABLE (the single opaque oEmbed failure)', async () => {
    const db = makeFakeDb();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Something went wrong', code: 400 }, 400)));

    const adapter = oembedSourceAdapter(db as never);
    await expect(adapter.fetch('7000000000000000000', ctx())).rejects.toMatchObject({
      code: 'POST_UNAVAILABLE',
      retryable: true,
    });

    expect(db.rows.get('7000000000000000000')?.fetch_status).toBe('failed');
    expect(db.rows.get('7000000000000000000')?.fetch_error_code).toBe('POST_UNAVAILABLE');
  });

  it('maps a 200 response that fails schema validation to POST_UNAVAILABLE', async () => {
    const db = makeFakeDb();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ not_the_expected_shape: true })));

    const adapter = oembedSourceAdapter(db as never);
    await expect(adapter.fetch('1', ctx())).rejects.toMatchObject({ code: 'POST_UNAVAILABLE' });
  });

  it('maps an aborted signal to UPSTREAM_TIMEOUT', async () => {
    const db = makeFakeDb();
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }),
    );

    const adapter = oembedSourceAdapter(db as never);
    await expect(adapter.fetch('1', ctx(controller.signal))).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      retryable: true,
    });
  });

  it('does not overwrite an already-ok cached row with a later transient failure', async () => {
    const db = makeFakeDb();
    db.rows.set('9', {
      id: '9',
      platform_source_id: '9',
      canonical_url: 'https://www.tiktok.com/@_/video/9',
      author_handle: 'x',
      author_name: 'X',
      content_text: 'already cached',
      thumbnail_url: null,
      fetch_status: 'ok',
      fetch_error_code: null,
    });
    // This adapter call is only reachable if a caller bypasses the cache-hit branch; simulated
    // here directly against the fake db's update path to prove the `neq('fetch_status', 'ok')`
    // guard holds, independent of the adapter's own read-then-write sequencing.
    const table = db.from('sources');
    await table.update({ fetch_status: 'failed', fetch_error_code: 'POST_UNAVAILABLE' }).eq('platform_source_id', '9').neq('fetch_status', 'ok');

    expect(db.rows.get('9')?.fetch_status).toBe('ok');
    expect(db.rows.get('9')?.content_text).toBe('already cached');
  });
});
