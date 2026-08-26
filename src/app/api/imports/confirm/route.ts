/**
 * `POST /api/imports/confirm` — turns reviewed extraction candidates into saved places.
 *
 * ## The trust boundary this route is built around
 *
 * This route holds a **service-role** client, because `resolve_place` is the trusted-server dedup
 * entry point. It used to take `provider`, `providerPlaceId`, `name`, `lat` and `lng` out of the
 * request body and pass them straight to it. `resolve_place` refreshes provider-owned columns on a
 * matched row whose `provider_fetched_at` is over 30 days old, and `places` rows are shared across
 * users, so that combination let one authenticated request rename and relocate a place other
 * people had saved. It was confirmed against the local database, not merely reasoned about.
 *
 * The contract is now a reference the caller must prove it owns, plus the caller's own note
 * (`domain/import/confirm.ts`), and every fact that reaches `places` is derived server-side by
 * `derivePlaceSave` from the extraction row the probe route wrote (`domain/import/candidate-place.ts`).
 *
 * Authorisation is two checks, in this order:
 *
 *  1. **Ownership**, and it is enforced by Postgres rather than by this file. The `imports` lookup
 *     goes through the *user's* client, so `imports_select_own` decides whether a row is visible.
 *     An extraction belonging to someone else's import produces zero rows here whatever the
 *     request claims, because the policy — not application code — is doing the filtering.
 *  2. **Range**, per item. An index that does not address a stored candidate fails that item
 *     instead of the request, so one bad index in a batch cannot discard the user's other saves.
 *
 * Candidates are re-parsed out of `jsonb` with the same Zod schema the adapter validated the model
 * against (`07` §"Validation", boundary 3: never trusted twice, parsed twice). A row written by an
 * older prompt version is data like any other and gets no special standing.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { supabasePlaceStore } from '@/integrations/supabase/place-store';
import { ConfirmImportRequestSchema, type ConfirmItem } from '@/domain/import/confirm';
import { derivePlaceSave } from '@/domain/import/candidate-place';
import { RawPlaceCandidateSchema } from '@/domain/extraction/schema';
import { toPlaceCandidate } from '@/domain/extraction/schema';
import { DomainError, internal, notAuthenticated, type DomainErrorView } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { PlaceCandidate } from '@/domain/types';
import { z } from 'zod';

function noopCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: () => {} },
  };
}

/**
 * `extractions.candidates` holds `PlaceCandidate[]`, which is field-for-field
 * `RawPlaceCandidateSchema` now that the category is no longer narrowed on the way in
 * (`domain/extraction/schema.ts`). Reusing that schema is deliberate: a second, parallel schema
 * for "the same shape, read back" is the thing that drifts.
 */
const StoredCandidatesSchema = z.array(RawPlaceCandidateSchema);

/**
 * One item's result. `already_saved` is reported separately from `saved` because the two are
 * different news for the user: before this, re-importing a place you already had came back as a
 * plain "saved" and the review screen claimed a fresh save every time.
 */
type ItemResult =
  | {
      readonly status: 'saved' | 'already_saved';
      readonly candidateIndex: number;
      readonly placeId: string;
      readonly savedPlaceId: string;
      readonly name: string;
    }
  | { readonly status: 'skipped'; readonly candidateIndex: number; readonly reason: 'no_coordinates' }
  | { readonly status: 'failed'; readonly candidateIndex: number; readonly error: DomainErrorView };

async function confirmOne(
  store: ReturnType<typeof supabasePlaceStore>,
  item: ConfirmItem,
  candidates: readonly PlaceCandidate[],
  sourceId: string,
  ctx: OpCtx,
): Promise<ItemResult> {
  const candidate = candidates[item.candidateIndex];
  if (candidate === undefined) {
    return {
      status: 'failed',
      candidateIndex: item.candidateIndex,
      error: internal('candidateIndex out of range').toView(),
    };
  }

  const derived = derivePlaceSave(candidate);
  if (derived.kind === 'skipped') {
    // The model could not place this venue. Saying so is the whole point — a city-centre or
    // country-centroid fallback would look identical to a real coordinate on the map.
    return { status: 'skipped', candidateIndex: item.candidateIndex, reason: derived.reason };
  }

  const { place } = derived;

  try {
    const { placeId, savedPlaceId, alreadySaved } = await store.confirmPlace(
      {
        place: {
          provider: place.provider,
          providerPlaceId: place.providerPlaceId,
          sourceDataset: place.sourceDataset,
          regionId: null,
          name: place.name,
          altNames: [],
          providerCategory: place.providerCategory,
          addressLine: place.addressLine,
          locality: place.locality,
          lat: place.lat,
          lng: place.lng,
          // `ResolvedPlace` requires this field, and `place-store.ts` does not forward it to
          // `resolve_place` (which has no such parameter). It is 0 rather than the `?? 0.5` this
          // line used to carry: 0.5 was an invented number sitting on a field the scorer weights,
          // one wiring change away from silently crediting every model guess.
          datasetConfidence: 0,
        },
        category: place.category,
        countryCode: place.countryCode,
        resolutionScore: place.resolutionScore,
      },
      { sourceId, note: item.note, extractedReason: place.extractedReason },
      ctx,
    );

    return {
      status: alreadySaved ? 'already_saved' : 'saved',
      candidateIndex: item.candidateIndex,
      placeId,
      savedPlaceId,
      name: place.name,
    };
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return { status: 'failed', candidateIndex: item.candidateIndex, error: domainError.toView() };
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

  const { extractionId, items } = parsed.data;
  const ctx = noopCtx(req.signal);
  const service = serviceRoleClient();

  // Read the extraction with the service-role client (RLS on `extractions` grants `authenticated`
  // SELECT only via import/save membership, and the ownership check below is the authority here
  // anyway — doing it in one place, explicitly, beats relying on two policies agreeing).
  const { data: extraction, error: extractionError } = await service
    .from('extractions')
    .select('id, source_id, candidates, status')
    .eq('id', extractionId)
    .maybeSingle();

  if (extractionError !== null) {
    return NextResponse.json(
      { error: internal('extraction lookup failed', extractionError).toView() },
      { status: 500 },
    );
  }

  // Unknown id and not-yours are answered identically and with the same status code, so this
  // endpoint cannot be used to probe which extraction ids exist.
  const forbidden = NextResponse.json(
    { error: internal('extraction not found for this user').toView() },
    { status: 403 },
  );

  if (extraction === null) return forbidden;

  // The ownership check. `imports_select_own` (RLS) is what actually filters this — the query runs
  // on the user's client, so another user's import is invisible regardless of what was requested.
  const { data: ownImport, error: importError } = await supabase
    .from('imports')
    .select('id')
    .eq('source_id', extraction.source_id)
    .limit(1)
    .maybeSingle();

  if (importError !== null) {
    return NextResponse.json(
      { error: internal('import ownership check failed', importError).toView() },
      { status: 500 },
    );
  }
  if (ownImport === null) return forbidden;

  const candidatesParsed = StoredCandidatesSchema.safeParse(extraction.candidates ?? []);
  if (!candidatesParsed.success) {
    return NextResponse.json(
      { error: internal('stored extraction candidates failed validation', candidatesParsed.error).toView() },
      { status: 500 },
    );
  }
  const candidates = candidatesParsed.data.map(toPlaceCandidate);

  const store = supabasePlaceStore(service, supabase);

  const results: ItemResult[] = [];
  for (const item of items) {
    results.push(await confirmOne(store, item, candidates, extraction.source_id as string, ctx));
  }

  // Close the import out. Only once nothing is left pending review: a partial confirmation (some
  // items failed) leaves the row on `review` so the user can come back to it, which is the whole
  // reason `review` exists as a status.
  const anyFailed = results.some((r) => r.status === 'failed');
  if (!anyFailed) {
    await service
      .from('imports')
      .update({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
      .eq('source_id', extraction.source_id)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ results });
}
