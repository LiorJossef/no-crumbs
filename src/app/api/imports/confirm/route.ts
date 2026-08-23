/**
 * `POST /api/imports/confirm` — the real save path (L0-F4-T3, `docs/execution-plan.md`'s entry for
 * this task, 2026-08-23). Turns one or more already-resolved candidates from the review screen
 * into `places` + `saved_places` rows through `PlaceStore.confirmPlace` (`domain/ports.ts`),
 * `supabasePlaceStore`'s `resolve_place` + `save_place` composition
 * (`integrations/supabase/place-store.ts`) — this route never writes either table directly.
 *
 * Unlike `/api/imports/probe` (throwaway, read-only, `route.ts`'s own header), this is the real
 * route: real writes, under the caller's own session for `save_place`'s RLS-scoped insert. It is
 * not `POST /api/imports` (L0-F6-T1, the real streamed import) — it has no idea how the candidates
 * it is given were produced, and it does not run `SourceAdapter`/`ContentExtractor`/`PlaceExtractor`
 * itself. It is the confirm/save seam only.
 *
 * Auth: same belt-and-suspenders `getUser()` check as every other route here — required because
 * this route also holds a service-role client for `resolve_place`.
 *
 * Partial success (D3, `docs/02-risks-and-unknowns.md`): the body is a batch (the review screen may
 * confirm several candidates from one import at once), and each item succeeds or fails
 * independently — one candidate's bad geometry or a transient DB error never blocks the rest. The
 * response is one outcome per item, in request order. No raw provider/Postgres error ever reaches
 * the body: a per-item failure is `internal().toView()`, same taxonomy as every other seam.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { supabasePlaceStore } from '@/integrations/supabase/place-store';
import { ConfirmImportRequestSchema, type ConfirmItem } from '@/domain/import/confirm';
import { DomainError, internal, notAuthenticated, type DomainErrorView } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';

function noopCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: () => {} },
  };
}

type ItemResult =
  | { readonly status: 'saved'; readonly placeId: string; readonly savedPlaceId: string }
  | { readonly status: 'failed'; readonly error: DomainErrorView };

async function confirmOne(
  store: ReturnType<typeof supabasePlaceStore>,
  item: ConfirmItem,
  sourceId: string | null,
  ctx: OpCtx,
): Promise<ItemResult> {
  try {
    const { placeId, savedPlaceId } = await store.confirmPlace(
      {
        place: {
          provider: item.provider,
          providerPlaceId: item.providerPlaceId,
          sourceDataset: item.sourceDataset,
          regionId: null,
          name: item.name,
          altNames: [],
          providerCategory: item.providerCategory,
          addressLine: item.addressLine,
          locality: item.locality,
          lat: item.lat,
          lng: item.lng,
          datasetConfidence: item.resolutionScore ?? 0.5,
        },
        category: item.category,
        countryCode: item.countryCode,
        resolutionScore: item.resolutionScore,
      },
      { sourceId, note: item.note },
      ctx,
    );
    return { status: 'saved', placeId, savedPlaceId };
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return { status: 'failed', error: domainError.toView() };
  }
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

  const parsed = ConfirmImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: internal('Invalid request body', parsed.error).toView() },
      { status: 400 },
    );
  }

  const ctx = noopCtx(req.signal);
  const store = supabasePlaceStore(serviceRoleClient(), supabase);
  const { sourceId, items } = parsed.data;

  // Sequential, not `Promise.all`: `resolve_place`'s advisory-lock guard (`0014`'s header)
  // serialises same-name-key candidates anyway, and a batch here is at most 20 items from one
  // review screen — there is no throughput reason to pay for the concurrency.
  const results: ItemResult[] = [];
  for (const item of items) {
    results.push(await confirmOne(store, item, sourceId, ctx));
  }

  return NextResponse.json({ results });
}
