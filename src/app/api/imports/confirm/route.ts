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
 * older prompt version is data like any other and gets no special standing — see
 * `domain/import/stored-candidates.ts`, which reads both schema versions and reports which it
 * found rather than flattening them.
 *
 * ## Where the coordinate comes from (TLV-RESOLVE-T3)
 *
 * `/api/imports/probe` now runs the real `PlaceResolver` and stores the shortlist **on the server**,
 * inside `extractions.candidates` (`domain/import/resolution-record.ts`). This route reads it back
 * from the same row it already reads the candidates from, so the resolved place reaches a save
 * without ever passing through the browser — `authenticated` holds no `INSERT`/`UPDATE` grant on
 * that column at all. The request may carry an `optionIndex`, which is a position in that stored
 * shortlist and still not a fact.
 *
 * A `preselect`-band candidate is saved with Overture provenance and a real `resolution_score`.
 * Everything else — `confirm` band with no explicit pick, `no_match`, a failed lookup, a
 * pre-resolver extraction row — keeps the existing `llm_guess` path unchanged. Both are correct
 * outcomes; only the provenance columns differ, and they are what make the difference legible.
 *
 * ## The three columns migration `0019` added
 *
 * `saved_places.tags`, `.why_go` and `.dishes` are written here too, and they are **place facts by
 * the same definition as `lat`**: they come out of the stored extraction, derived by
 * `domain/import/saved-place-enrichment.ts`, and there is no field of the request through which a
 * client could reach them. That invariant is not merely observed — it is enforced one layer down,
 * because those columns carry no `INSERT` or `UPDATE` grant for `authenticated` and their sole
 * writer runs as `service_role`.
 *
 * That writer takes the row's owner as an *argument* (it has no `auth.uid()` to read), so this
 * route is where its security property actually lives. See `confirmOne`'s `userId` parameter.
 *
 * The enrichment write happens **after** the save and can never fail it (`place-store.ts`), and
 * each item reports what became of it — `applied`, `empty`, `unavailable_v1` or `failed` — rather
 * than letting "no tags" mean four different things.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { supabasePlaceStore } from '@/integrations/supabase/place-store';
import { ConfirmImportRequestSchema, type ConfirmItem } from '@/domain/import/confirm';
import { derivePlaceSave } from '@/domain/import/candidate-place';
import { chooseResolvedPlace } from '@/domain/import/resolution-record';
import { deriveSavedPlaceEnrichment } from '@/domain/import/saved-place-enrichment';
import { parseStoredCandidates, type StoredCandidate } from '@/domain/import/stored-candidates';
import { DomainError, internal, notAuthenticated, type DomainErrorView } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';

/**
 * A real logger, not the no-op this route used to build.
 *
 * The enrichment write is the first thing on this path that can fail **without failing the
 * request** (`integrations/supabase/place-store.ts`), and a non-fatal failure nobody can see is
 * just a bug with better manners. One structured line, `07` §7.1's shape, on stderr — codes and
 * ids only, never a tag, a caption or a coordinate.
 */
function routeCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: {
      event: (name, fields) => {
        console.warn(JSON.stringify({ event: name, ...fields }));
      },
    },
  };
}

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
      /**
       * Which provenance this save actually got — additive on the wire, and the one field that
       * tells a resolved place from a model guess without a database read. `'overture'` means the
       * coordinate is a gazetteer row's; `'llm_guess'` means it is the model's own point.
       */
      readonly provider: 'overture' | 'llm_guess';
      /** The scorer's real 0..1 score for an Overture save, `null` for a model guess. */
      readonly resolutionScore: number | null;
      readonly enrichment: EnrichmentOutcome;
    }
  | { readonly status: 'skipped'; readonly candidateIndex: number; readonly reason: 'no_coordinates' }
  | { readonly status: 'failed'; readonly candidateIndex: number; readonly error: DomainErrorView };

/**
 * What became of `saved_places.tags` / `why_go` / `dishes` for one save. Four states, and the
 * reason there are four rather than a boolean is that three of them are *not* failures and the UI
 * must not be forced to guess which:
 *
 *  - `applied` — the writer ran. (Not "the columns now hold these values": it is first-writer-wins
 *    per column, so on a place already saved with enrichment it changed nothing.)
 *  - `empty` — a schema-v2 extraction whose caption supported no tags, no dishes and no reason.
 *    A real, measured answer. The writer was not called, because a call with three nulls is a
 *    no-op update.
 *  - `unavailable_v1` — the stored extraction predates schema v2, so there is no enrichment to
 *    write and none was ever computed. Distinct from `empty` on purpose: reporting "we looked and
 *    found nothing" for "we could not look" is exactly the uncertainty-into-certainty move the
 *    working agreement forbids, and it would make a stale extraction id indistinguishable from a
 *    bare caption.
 *  - `failed` — the writer errored. **The place is still saved**; this is the only state where
 *    something went wrong, and it went wrong after the save it does not invalidate.
 *
 * Additive on the wire: `import-page-client.tsx` reads `status`/`candidateIndex`/`savedPlaceId`
 * and ignores the rest, so nothing in the UI has to change to keep working.
 */
type EnrichmentOutcome = 'applied' | 'empty' | 'unavailable_v1' | 'failed';

async function confirmOne(
  store: ReturnType<typeof supabasePlaceStore>,
  item: ConfirmItem,
  candidates: readonly StoredCandidate[],
  sourceId: string,
  /**
   * **The authenticated session's user id, and nothing else may ever be passed here.**
   *
   * It reaches `apply_saved_place_extraction(p_user_id)`, which runs as `service_role` and
   * therefore has no `auth.uid()` to read and no RLS policy filtering it — its
   * `where sp.user_id = p_user_id` is the *only* thing standing between this call and writing model
   * output onto a stranger's saved place, and that clause is only as good as this argument.
   *
   * So: this value comes from `supabase.auth.getUser()` in `POST` below — a server-side, verified
   * session lookup — never from the request body, never from the extraction row, never from a
   * `saved_places` read. The same rule binds `savedPlaceId` inside the store adapter: it is
   * `save_place`'s own return value from this same request, never a client-supplied id. Break
   * either and anyone who learns a victim's `saved_place_id` can write to their row.
   */
  userId: string,
  ctx: OpCtx,
): Promise<ItemResult> {
  const stored = candidates[item.candidateIndex];
  if (stored === undefined) {
    return {
      status: 'failed',
      candidateIndex: item.candidateIndex,
      error: internal('candidateIndex out of range').toView(),
    };
  }

  const { candidate, schemaVersion, resolution } = stored;

  // The resolver's answer, read back off the server's own row. Nothing about this decision comes
  // from the request except `optionIndex`, which is a position in a shortlist the server stored.
  const choice = chooseResolvedPlace(resolution, item.optionIndex);
  if (choice.kind === 'out_of_range') {
    return {
      status: 'failed',
      candidateIndex: item.candidateIndex,
      error: internal('optionIndex does not address a stored resolver option').toView(),
    };
  }

  // `'choose'` — a `confirm`-band shortlist the caller did not pick from — falls through with
  // `null`, i.e. to the unchanged `llm_guess` path. That is deliberate: an ambiguous shortlist is
  // real information, but it is not permission to pick for the user.
  const resolved = choice.kind === 'use' ? choice.ranked : null;

  const derived = derivePlaceSave(candidate, resolved);
  if (derived.kind === 'skipped') {
    // Neither the resolver nor the model could place this venue. Saying so is the whole point — a
    // city-centre or country-centroid fallback would look identical to a real coordinate on the map.
    return { status: 'skipped', candidateIndex: item.candidateIndex, reason: derived.reason };
  }

  const { place } = derived;

  // Derived from the server's own copy of the extraction, exactly like every fact in `place` above.
  // There is no field of the request that can reach these columns — the browser sends an index and
  // a note. A v1 extraction has no enrichment to derive and none is invented for it.
  const enrichment = schemaVersion === 1 ? null : deriveSavedPlaceEnrichment(candidate);

  try {
    const { placeId, savedPlaceId, alreadySaved, enrichmentApplied } = await store.confirmPlace(
      {
        place: {
          provider: place.provider,
          providerPlaceId: place.providerPlaceId,
          sourceDataset: place.sourceDataset,
          regionId: place.regionId,
          name: place.name,
          altNames: [],
          providerCategory: place.providerCategory,
          addressLine: place.addressLine,
          locality: place.locality,
          lat: place.lat,
          lng: place.lng,
          // `poi_index.dataset_confidence` on a resolved save, 0 on a model guess — derived, like
          // every other field here. It stays 0 rather than a `?? 0.5` default on the guess path:
          // 0.5 was an invented number sitting on a field the scorer weights, one wiring change
          // away from silently crediting every model guess. `place-store.ts` does not forward this
          // to `resolve_place` (which has no such parameter); it is carried because `ResolvedPlace`
          // requires it.
          datasetConfidence: place.datasetConfidence,
        },
        category: place.category,
        countryCode: place.countryCode,
        resolutionScore: place.resolutionScore,
      },
      { sourceId, note: item.note, extractedReason: place.extractedReason, userId, enrichment },
      ctx,
    );

    return {
      status: alreadySaved ? 'already_saved' : 'saved',
      candidateIndex: item.candidateIndex,
      placeId,
      savedPlaceId,
      name: place.name,
      provider: place.provider,
      resolutionScore: place.resolutionScore,
      enrichment: enrichmentOutcome(schemaVersion, enrichment !== null, enrichmentApplied),
    };
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return { status: 'failed', candidateIndex: item.candidateIndex, error: domainError.toView() };
  }
}

/** The four states, from the three facts that determine them. A separate function so the mapping
 *  is testable without a database and cannot be re-derived slightly differently at a second call
 *  site. */
function enrichmentOutcome(
  schemaVersion: StoredCandidate['schemaVersion'],
  hadEnrichment: boolean,
  applied: boolean,
): EnrichmentOutcome {
  if (schemaVersion === 1) return 'unavailable_v1';
  if (!hadEnrichment) return 'empty';
  return applied ? 'applied' : 'failed';
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
  const ctx = routeCtx(req.signal);
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

  // Version-aware on purpose: `PROMPT_VERSION` moved to `p7-s2` and there are pre-v2 rows in this
  // table, which this route can still be handed by id (see `import/stored-candidates.ts`). A strict
  // v2-only parse would answer 500 for every one of them and lose the user's whole batch.
  const candidatesParsed = parseStoredCandidates(extraction.candidates);
  if (candidatesParsed.kind === 'invalid') {
    return NextResponse.json(
      { error: internal('stored extraction candidates failed validation', candidatesParsed.cause).toView() },
      { status: 500 },
    );
  }
  const candidates = candidatesParsed.candidates;

  const store = supabasePlaceStore(service, supabase);

  const results: ItemResult[] = [];
  for (const item of items) {
    results.push(
      await confirmOne(store, item, candidates, extraction.source_id as string, user.id, ctx),
    );
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
