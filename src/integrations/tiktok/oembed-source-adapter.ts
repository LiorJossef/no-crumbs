/**
 * The real, network-touching `SourceAdapter` (`07` §10; `domain/ports.ts`). L0-F4-T1.
 *
 * Two responsibilities, deliberately in one file rather than a separate "caching adapter" wrapper:
 * `fetch` is cache-through against `public.sources` (migration `0003_sources.sql`) so a second
 * import of the same post makes zero network calls (`08` §5, this task's exit criterion). The
 * cache is keyed on `platform_source_id`, the video id — never the URL, and never the handle
 * (`0003`'s own comment: "@gadderapp in the pasted URL returned @gadderhq").
 *
 * Evidence base: `docs/evidence/tiktok/01-oembed-field-inventory.md` (fields, no truncation up to
 * 1229 chars, VERIFIED), `04-error-cases.md` (single opaque 400 for every unavailable reason,
 * VERIFIED), `05-rate-limit-and-latency.md` (no 429 ever observed, ~600ms p90, VERIFIED),
 * `06-datacenter-ip.md` (works from a non-residential IP; Vercel itself is the one gap this file's
 * header does not close — see `oembedSourceAdapter`'s own doc comment).
 */
import { DomainError, internal, postUnavailable, upstreamTimeout } from '@/domain/errors';
import type { OpCtx, SourceAdapter } from '@/domain/ports';
import type { RawSource } from '@/domain/types';
import type { ClassifiedShortLink } from '@/domain/source/canonicalise-tiktok-url';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveShortLink } from './resolve-short-link';
import { TikTokOEmbedSchema } from './oembed-schema';

const OEMBED_ENDPOINT = 'https://www.tiktok.com/oembed';

/**
 * The row shape this adapter reads/writes on `public.sources`. Narrower than the full migration
 * (no `created_at`/`updated_at` — R8 does not grant those to `authenticated` either, and this
 * adapter has no reason to read them).
 */
interface SourceRow {
  readonly id: string;
  readonly platform_source_id: string;
  readonly canonical_url: string;
  readonly author_handle: string | null;
  readonly author_name: string | null;
  readonly content_text: string | null;
  readonly thumbnail_url: string | null;
  readonly fetch_status: 'pending' | 'ok' | 'failed';
  readonly fetch_error_code: string | null;
}

export function canonicalUrlFor(externalId: string): string {
  // Rebuilt, never taken from user input (0003's own rule) — a placeholder handle is fine because
  // the real one is filled in from oEmbed's `author_unique_id` once a fetch succeeds, and nothing
  // reads this field's handle segment as identity (04 §6: the video id is identity, not the URL).
  return `https://www.tiktok.com/@_/video/${externalId}`;
}

async function readCachedRow(db: SupabaseClient, externalId: string): Promise<SourceRow | null> {
  const { data, error } = await db
    .from('sources')
    .select(
      'id, platform_source_id, canonical_url, author_handle, author_name, content_text, thumbnail_url, fetch_status, fetch_error_code',
    )
    .eq('platform', 'tiktok')
    .eq('platform_source_id', externalId)
    .maybeSingle();

  if (error) {
    // A cache read failure is not fatal to the import: fall through and fetch live. Surfaced only
    // as a thrown INTERNAL if the live fetch also fails, via the caller's own error handling —
    // this function itself never throws for "cache unavailable".
    return null;
  }
  return (data as SourceRow | null) ?? null;
}

function rowToRawSource(row: SourceRow): RawSource {
  return {
    id: row.id,
    externalId: row.platform_source_id,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    canonicalUrl: row.canonical_url,
    thumbnailUrl: row.thumbnail_url,
    texts: row.content_text === null ? [] : [{ kind: 'caption', text: row.content_text }],
    media: [],
  };
}

async function writeSuccess(
  db: SupabaseClient,
  externalId: string,
  raw: RawSource,
): Promise<void> {
  await db
    .from('sources')
    .update({
      canonical_url: raw.canonicalUrl,
      author_handle: raw.authorHandle,
      author_name: raw.authorName,
      content_text: raw.texts.find((t) => t.kind === 'caption')?.text ?? null,
      thumbnail_url: raw.thumbnailUrl,
      fetch_status: 'ok',
      fetch_error_code: null,
      fetched_at: new Date().toISOString(),
    })
    .eq('platform', 'tiktok')
    .eq('platform_source_id', externalId);

  // `fetch_attempts` is left untouched here: an update payload cannot express `x = x + 1` without
  // either an RPC or a raw SQL expression, and this adapter has neither available. `fetch_status
  // = 'ok'` is the gate the cache actually needs (this task's exit criterion is "no network call
  // on re-import", not "attempts are counted") — a real attempt counter is a follow-up, not scope
  // creep into a column this task does not need to read.
}

async function writeFailure(db: SupabaseClient, externalId: string, code: string): Promise<void> {
  await db
    .from('sources')
    .update({ fetch_status: 'failed', fetch_error_code: code })
    .eq('platform', 'tiktok')
    .eq('platform_source_id', externalId)
    // Never overwrite a source that already succeeded with a later transient failure — the
    // cached caption stays authoritative once fetched (08 §5).
    .neq('fetch_status', 'ok');
}

async function ensurePendingRow(db: SupabaseClient, externalId: string): Promise<string> {
  // `start_import()` (0007) already inserts this row before `runImport` is ever called (R4). This
  // upsert exists only so the adapter is safe to exercise standalone (tests, the probe route,
  // future callers) without depending on that RPC having run first — `on conflict do nothing`
  // means it is a true no-op on the real pipeline's path.
  //
  // `ignoreDuplicates: true` makes this an `ON CONFLICT DO NOTHING`, which never `RETURNING`s an
  // already-existing row — so the id always needs a follow-up read regardless of whether this
  // upsert inserted a fresh row or a real one already existed.
  await db
    .from('sources')
    .upsert(
      { platform: 'tiktok', platform_source_id: externalId, canonical_url: canonicalUrlFor(externalId) },
      { onConflict: 'platform,platform_source_id', ignoreDuplicates: true },
    );

  const { data, error } = await db
    .from('sources')
    .select('id')
    .eq('platform', 'tiktok')
    .eq('platform_source_id', externalId)
    .single();

  if (error || data === null) {
    throw internal(`sources row missing for ${externalId} immediately after upsert`, error);
  }
  return (data as { id: string }).id;
}

async function fetchLive(id: string, externalId: string, ctx: OpCtx): Promise<RawSource> {
  const url = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(canonicalUrlFor(externalId))}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', signal: ctx.signal });
  } catch (e) {
    if (ctx.signal.aborted) {
      throw upstreamTimeout(undefined, e);
    }
    throw postUnavailable(undefined, e);
  }

  // The one honest failure shape (VERIFIED, `04-error-cases.md`): every private / deleted /
  // region-locked / never-existed / malformed-but-well-formed post collapses to one 400. No 429
  // was ever observed, so a non-2xx here is POST_UNAVAILABLE, never RATE_LIMITED_UPSTREAM — that
  // code stays reserved for the day TikTok's behaviour actually changes (`domain/errors.ts`'s own
  // comment on `rateLimitedUpstream`).
  if (!response.ok) {
    throw postUnavailable();
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (e) {
    throw postUnavailable(undefined, e);
  }

  const parsed = TikTokOEmbedSchema.safeParse(json);
  if (!parsed.success) {
    // A 200 that does not match the shape we depend on (TikTok removing `title`, e.g.) is treated
    // the same as an explicit failure — "Zod at every boundary" rule 2 (`07` §10): a parse
    // failure becomes a DomainError, never a thrown ZodError.
    throw postUnavailable(undefined, parsed.error);
  }

  const payload = parsed.data;
  return {
    id,
    externalId: payload.embed_product_id,
    authorHandle: payload.author_unique_id,
    authorName: payload.author_name,
    canonicalUrl: canonicalUrlFor(payload.embed_product_id),
    thumbnailUrl: payload.thumbnail_url,
    texts: [{ kind: 'caption', text: payload.title }],
    media: [],
  };
}

function toStoredCode(e: DomainError): string {
  return e.code;
}

/**
 * `oembedSourceAdapter` — the real `SourceAdapter`. `db` is the service-role Supabase client
 * (`integrations/supabase/service-role-client.ts`); passed in rather than constructed here so a
 * test can supply a fake and the composition root (L0-F6, not yet built) supplies the real one.
 *
 * `fetch` is cache-through: a `fetch_status = 'ok'` row is returned with **zero** network calls.
 * A `'failed'` or `'pending'` row (or no row) always attempts a live fetch — a transient failure
 * is not cached as permanent, matching `postUnavailable`'s `retryable: true`.
 *
 * Not yet verified from Vercel's own egress IPs (`docs/evidence/tiktok/06-datacenter-ip.md`'s
 * "required verification" section) — that is a deploy-environment probe, not something this
 * adapter's code can prove from a local run, and it remains an open item for whoever deploys L0-F6.
 */
export function oembedSourceAdapter(db: SupabaseClient): SourceAdapter {
  return {
    platform: 'tiktok',

    async resolveShortLink(link: ClassifiedShortLink, ctx: OpCtx) {
      return resolveShortLink(link, ctx);
    },

    async fetch(externalId: string, ctx: OpCtx): Promise<RawSource> {
      const cached = await readCachedRow(db, externalId);
      if (cached !== null && cached.fetch_status === 'ok') {
        return rowToRawSource(cached);
      }

      const id = await ensurePendingRow(db, externalId);

      try {
        const raw = await fetchLive(id, externalId, ctx);
        await writeSuccess(db, externalId, raw);
        return raw;
      } catch (e) {
        const domainError = e instanceof DomainError ? e : internal(String(e), e);
        await writeFailure(db, externalId, toStoredCode(domainError));
        throw domainError;
      }
    },
  };
}
