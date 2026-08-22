/**
 * Manual live-verification harness for L0-F4-T1 — NOT part of the CI suite (excluded by
 * `vitest.config.ts`'s `include` glob; run explicitly with
 * `npx vitest run tests/manual/tiktok-oembed-live.manual.ts --config tests/manual/vitest.manual.config.ts`).
 * Hits the real TikTok oEmbed endpoint over the network. Exercises the actual adapter code
 * (`oembedSourceAdapter`) against a minimal in-memory stand-in for the `sources` table, so what
 * runs is the adapter's real fetch/parse/error-mapping logic, not a re-implementation of it.
 */
import { describe, expect, it } from 'vitest';

import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import type { OpCtx } from '@/domain/ports';

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

function makeFakeDb() {
  const rows = new Map<string, FakeRow>();

  function upsertRow(patch: Partial<FakeRow> & { platform_source_id: string }) {
    const key = patch.platform_source_id;
    const existing: FakeRow =
      rows.get(key) ??
      ({
        id: key,
        platform_source_id: key,
        canonical_url: null,
        author_handle: null,
        author_name: null,
        content_text: null,
        thumbnail_url: null,
        fetch_status: 'pending',
        fetch_error_code: null,
      } satisfies FakeRow);
    rows.set(key, { ...existing, ...patch } as FakeRow);
  }

  return {
    rows,
    // Minimal chainable shape matching the calls oembed-source-adapter.ts actually makes.
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
          const builder: PromiseLike<{ data: null; error: null }> & {
            eq: (col: string, val: unknown) => typeof builder;
            neq: (col: string, val: unknown) => Promise<{ data: null; error: null }>;
          } = {
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
          } as never;
          return builder;
        },
      };
    },
  };
}

function ctx(): OpCtx {
  return { signal: new AbortController().signal, importId: null, log: { event: () => {} } };
}

describe('oembedSourceAdapter — live TikTok oEmbed', () => {
  it('retrieves a real caption and caches it (zero network calls on re-fetch)', async () => {
    const db = makeFakeDb();
    const adapter = oembedSourceAdapter(db as never);
    const realVideoId = '7220925199297039662'; // @nom_life — VERIFIED caption present, 04-error-cases evidence

    let fetchCount = 0;
    const realFetch = global.fetch;
    global.fetch = ((...args: Parameters<typeof fetch>) => {
      fetchCount += 1;
      return realFetch(...args);
    }) as typeof fetch;

    try {
      const first = await adapter.fetch(realVideoId, ctx());
      expect(first.texts[0]?.text.length).toBeGreaterThan(0);
      expect(first.authorHandle).toBe('nom_life');
      expect(fetchCount).toBeGreaterThan(0);

      const before = fetchCount;
      const second = await adapter.fetch(realVideoId, ctx());
      expect(second.texts[0]?.text).toBe(first.texts[0]?.text);
      expect(fetchCount).toBe(before); // no new network call
    } finally {
      global.fetch = realFetch;
    }
  }, 20_000);

  it('maps a well-formed but nonexistent video id to POST_UNAVAILABLE', async () => {
    const db = makeFakeDb();
    const adapter = oembedSourceAdapter(db as never);

    await expect(adapter.fetch('7000000000000000000', ctx())).rejects.toMatchObject({
      code: 'POST_UNAVAILABLE',
      retryable: true,
    });
  }, 20_000);
});
