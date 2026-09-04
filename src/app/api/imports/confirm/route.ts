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
 *
 * The paragraph above calls those three columns "place facts", which migration `0036` and
 * `docs/db-ruling-tag-ownership-2026-09-01.md` §2 overturn for one of them: `tags` is a **user
 * annotation**, and it always was — it is a column on `saved_places`, the per-user row, not on
 * `places`, the shared POI. The rest of the paragraph survives intact. Nothing about how the value
 * is *derived* changes: it still comes from the server's own extraction row and the request still
 * has no field that could reach it. What changes is who the words belong to afterwards.
 *
 * ## The confirmation stamp (`0036`, task `r3-tags-ui`)
 *
 * `saved_places.tags_confirmed_at` is `NULL` for as long as the array beside it is an unconfirmed
 * model proposal. Before this route wrote it, it was `NULL` on every row in every database, and it
 * had no caller anywhere — a live, reviewed, security-signed-off migration that the product never
 * used, which `product-review-2026-08-31-r3.md` rightly calls a worse state than an unapplied one.
 *
 * **This route is that caller, and the review screen is what earns it the right to be.** The card
 * now renders the proposed tags (`review/candidate-card.tsx`), in the same pill the library uses,
 * derived by the same `deriveSavedPlaceEnrichment` call that produces the value written below. So
 * the user saw these exact words and pressed Save — which is precisely the consent standard the
 * rest of that screen already runs on, the category and the address and the resolved name all
 * being stated rather than separately ratified.
 *
 * **It is written through `set_saved_place_tags`, not by an UPDATE, and that is a decision.** This
 * route holds a service-role client and could set both columns directly in one statement. `0036`'s
 * ruling 4 exists because two independently writable columns are two statements a caller can issue
 * apart — the words without the record of who chose them, or the record of a choice nobody made —
 * and it made that inexpressible for `authenticated` by granting no column privilege and exposing
 * one `SECURITY DEFINER` function that always stamps. A server that reaches around the function
 * re-creates the separability it removed, one privilege level up, for the convenience of not making
 * an RPC call. So the call goes through the **user's own client**: `auth.uid()` is then the session
 * this request already authenticated, the function's `where sp.user_id = (select auth.uid())`
 * becomes a second and independent check on ownership where
 * `apply_saved_place_extraction(p_user_id)` has only the argument this file passes it, and the
 * product has exactly one write path to `tags` rather than one for browsers and a shortcut for us.
 *
 * **Three conditions, and each one is a way the stamp could otherwise become a lie:**
 *
 *  1. **The save is new** (`alreadySaved === false`). On a fresh row `tags` is `NULL` before the
 *     enrichment write — `save_place` does not mention the column — so first-writer-wins stores
 *     exactly what the card rendered. On a re-import of a place the user already holds, the row
 *     keeps *its* tags and the card showed *this* post's, so the two can differ and stamping would
 *     record a confirmation of words that are not in the column. It would also overwrite an
 *     existing vocabulary with model output, which is the one thing `0036` §5 forbids the extractor
 *     from doing; doing it here through the user's client would launder it, not avoid it.
 *  2. **The enrichment write succeeded** (`enrichment === 'applied'`). If it failed the row has no
 *     tags at all, and a stamp on an empty array is a confirmation of a deletion nobody made — and
 *     `0036` §3(b) then bars every later import from ever tagging that place.
 *  3. **There was at least one tag.** A candidate the caption supported no tags for must stay
 *     `NULL`, not "confirmed empty": the user declined nothing, there was simply nothing to show
 *     them, and a later post about the same venue must still be allowed to tag it. Confirming an
 *     absence is an assertion, and it is one only a deliberate deletion may make.
 *
 * A failure here never fails the item. The place is saved and its tags are stored; only the record
 * that the user asserted them is missing, and the safe direction for that record to be wrong in is
 * absent. It is logged and reported as `tagsConfirmed: false`.
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
import type { PlaceProvider } from '@/domain/types';

/**
 * A real logger, not the no-op this route used to build.
 *
 * The enrichment write is the first thing on this path that can fail **without failing the
 * request** (`integrations/supabase/place-store.ts`), and a non-fatal failure nobody can see is
 * just a bug with better manners. One structured line, `07` §7.1's shape, on stderr — codes and
 * ids only, never a tag, a caption or a coordinate.
 */
/**
 * The caller's Supabase client, named once so `confirmOne` can take it without restating
 * `Awaited<ReturnType<typeof createClient>>` twice. Structural, not nominal: it is exactly what
 * `createClient()` returns, so a test double satisfies it by having the same shape and nothing has
 * to be exported from `_lib/supabase/server.ts` to make that work.
 */
type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>;

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
      readonly provider: PlaceProvider;
      /** The scorer's real 0..1 score for an Overture save, `null` for a model guess. */
      readonly resolutionScore: number | null;
      readonly enrichment: EnrichmentOutcome;
      /**
       * Whether `tags_confirmed_at` was stamped for this save — additive on the wire, and the one
       * field that says the user's assertion was recorded rather than merely intended. `false` is a
       * normal, frequent answer: no tags to confirm, a place already in the library, or a stamp
       * that failed after a save that did not. See this file's header for all three.
       */
      readonly tagsConfirmed: boolean;
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
  /**
   * The **caller's** Supabase client, not the service-role one, and the distinction is the whole
   * security argument for how the confirmation stamp is written. `set_saved_place_tags` is
   * `SECURITY DEFINER` and bounded by `auth.uid()`; called on this client that is the session
   * `POST` authenticated, so the function refuses a save that is not the caller's on its own
   * authority. Called on a service-role client `auth.uid()` is `NULL` and it would raise `28000`,
   * which is the guard working. See the header.
   */
  user: SupabaseUserClient,
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

    const outcome = enrichmentOutcome(schemaVersion, enrichment !== null, enrichmentApplied);

    return {
      status: alreadySaved ? 'already_saved' : 'saved',
      candidateIndex: item.candidateIndex,
      placeId,
      savedPlaceId,
      name: place.name,
      provider: place.provider,
      resolutionScore: place.resolutionScore,
      enrichment: outcome,
      tagsConfirmed: await confirmTags(
        user,
        savedPlaceId,
        // The same array the card rendered, from the same call — not `candidate.tags`, which would
        // be a second reading free to drift from the one the user actually saw.
        enrichment?.tags ?? null,
        { alreadySaved, enrichmentApplied: outcome === 'applied' },
        ctx,
      ),
    };
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return { status: 'failed', candidateIndex: item.candidateIndex, error: domainError.toView() };
  }
}

/**
 * Records that the user asserted this vocabulary — `saved_places.tags_confirmed_at` — or declines
 * to, and returns which.
 *
 * The three refusals are the header's, restated here as one predicate so there is a single place to
 * read what makes the stamp honest. They are checked *before* the call rather than left to the
 * function, because none of them is something the database can see: `set_saved_place_tags` cannot
 * know whether this save is new, whether the enrichment write landed, or whether a screen rendered
 * anything. That knowledge is this route's, which is why the route is the caller.
 *
 * The value passed is the array the review card rendered. It is deliberately re-asserted rather
 * than "just stamped": there is no way to write the stamp on its own (`0036` ruling 4), and there
 * should not be — the words and the record of who chose them are one statement or the property is
 * gone. On a new save the array is already in the column, so the UPDATE is a no-op in value and
 * carries only the timestamp, which is exactly the shape wanted.
 *
 * Never throws. A place that saved and then failed to record its confirmation is a place that
 * saved; `NULL` is the safe direction for this column to be wrong in, because it means "nobody has
 * asserted these words", which is a true statement about a row whose write failed.
 */
async function confirmTags(
  user: SupabaseUserClient,
  savedPlaceId: string,
  tags: readonly string[] | null,
  gate: { readonly alreadySaved: boolean; readonly enrichmentApplied: boolean },
  ctx: OpCtx,
): Promise<boolean> {
  if (tags === null || tags.length === 0) return false;
  if (gate.alreadySaved || !gate.enrichmentApplied) return false;

  try {
    const { error } = await user.rpc('set_saved_place_tags', {
      p_saved_place_id: savedPlaceId,
      p_tags: tags,
    });
    if (error === null) return true;
    // Codes and ids only — a tag is caption-derived text about a real place and does not belong in
    // a log line (`07` §7.1, and the same rule `routeCtx` above is written to).
    ctx.log.event('tag_confirmation_failed', { savedPlaceId, code: error.code });
  } catch (e) {
    // A thrown transport failure, not a SQL one. Caught **here** rather than left to `confirmOne`'s
    // own `try`, which is the difference between an unrecorded confirmation and a save the user is
    // told did not happen: that handler turns anything thrown into `status: 'failed'`, and the
    // place is by this point already in the library. This is the same reason `applyEnrichment`
    // swallows its own failures in `place-store.ts` — the last step of a successful save may not be
    // allowed to retract it.
    ctx.log.event('tag_confirmation_failed', { savedPlaceId, code: String(e).slice(0, 80) });
  }
  return false;
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
      await confirmOne(
        store,
        supabase,
        item,
        candidates,
        extraction.source_id as string,
        user.id,
        ctx,
      ),
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
