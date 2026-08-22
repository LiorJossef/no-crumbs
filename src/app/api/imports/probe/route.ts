/**
 * `POST /api/imports/probe` — a throwaway demo route, **not** the real `POST /api/imports`
 * (L0-F6-T1). It exists only to prove the real oEmbed `SourceAdapter` + caption
 * `ContentExtractor` (L0-F4-T1) reach the `/import` UI: no `runImport`, no `PlaceExtractor`, no
 * `PlaceResolver`, no `ImportStore`, no NDJSON stream, no idempotency, no retries. It is a
 * request/response JSON endpoint, never a stream.
 *
 * Auth: same belt-and-suspenders `getUser()` check as `src/app/import/page.tsx` — required here
 * because this route holds a service-role Supabase client (`serviceRoleClient()`), which bypasses
 * RLS. No session, no service-role client touched, full stop.
 *
 * Input handling: `canonicaliseTikTokUrl` is re-run **server-side** even though the client
 * already validated the pasted string — defence in depth, and the actual SSRF-relevant
 * allow-list re-check (`04` §2/§7) only means anything if it happens on the server that is about
 * to make the network call, not in the browser that could be tampered with.
 *
 * Output: either the caption/author/canonical-url/thumbnail this task needs, or a
 * `DomainErrorView` (`domain/errors.ts`'s `toView()`) — never a raw exception, stack trace or
 * vendor error string. `INTERNAL` is the floor for anything unmapped.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { DomainError, internal, notAuthenticated } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';

function noopCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: () => {} },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: notAuthenticated().toView() }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: internal('Invalid JSON body', e).toView() }, { status: 400 });
  }

  const url =
    typeof body === 'object' && body !== null && 'url' in body && typeof (body as { url: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;

  if (url === null) {
    return NextResponse.json({ error: internal('Missing url').toView() }, { status: 400 });
  }

  // Server-side re-validation — the SSRF-relevant allow-list check (04 §2/§7). Never trust the
  // client's own canonicalisation for the network hop this route is about to make.
  const canonicalised = canonicaliseTikTokUrl(url);
  if (!canonicalised.ok) {
    return NextResponse.json(
      { error: canonicalised.error.toView() },
      { status: 422 },
    );
  }

  const ctx = noopCtx(req.signal);
  const db = serviceRoleClient();
  const source = oembedSourceAdapter(db);

  try {
    const externalId =
      canonicalised.value.kind === 'video'
        ? canonicalised.value.externalId
        : (await source.resolveShortLink(canonicalised.value, ctx)).externalId;

    const raw = await source.fetch(externalId, ctx);
    const parts = await captionContentExtractor.extract(raw, ctx);
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? null;

    return NextResponse.json({
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      canonicalUrl: raw.canonicalUrl,
      thumbnailUrl: raw.thumbnailUrl,
      caption,
    });
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return NextResponse.json({ error: domainError.toView() }, { status: 502 });
  }
}
