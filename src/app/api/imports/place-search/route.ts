/**
 * `POST /api/imports/place-search` — the add-by-name recovery on the no-places screen.
 *
 * ~73% of imports end with no places. `spec-no-places-found.md` §5.2 is that screen's answer: the
 * user watched the video, they know the place, and they type its name. Two operations, because it
 * is two decisions — *which* place, and *save it* — and Charter §3 invariant 2 says the save is
 * always its own explicit press.
 *
 * ## Why this route exists rather than `addPlaceManually`
 *
 * `app/actions/manual-add.ts` already searches and saves in one call, and it is deliberately
 * one-shot: it picks a place for the user and reports the name back. That is right for the `＋`
 * sheet, where the user has no context to choose with. Here they do — they just read a caption —
 * and the spec requires a **list** they choose from, never an auto-select even at N = 1. It also
 * saves with `sourceId: null`, and a place added from this screen must be linked to the TikTok it
 * came from (§6.8, acceptance 14).
 *
 * ## Two ops, one route
 *
 * `search` and `add` are one resource and one trust boundary, so they are one file rather than two
 * endpoints that would have to keep the same rules in step.
 *
 * ## The authority boundary, which is the same one the import path draws
 *
 * **The browser sends a string it typed and a position. It never sends a place fact.**
 * `domain/import/candidate-place.ts`'s header carries the confirmed exploit that rule closes:
 * `resolve_place` refreshes provider-owned columns on a matched row, `places` rows are shared
 * between users, so a client-supplied name or coordinate lets one person rename and relocate a
 * place other people have saved.
 *
 * `add` therefore re-runs the same resolve and indexes into its own shortlist by position. The
 * `expectedName` the client echoes back is a **check**, not an input: if the row at that position
 * is not the one the user saw, nothing is saved and the fresh list is returned for them to choose
 * again. It never becomes any part of what is written.
 *
 * ## One lookup per submit, and `add` is free
 *
 * Google Places is 100 lookups/day on this project. A search runs only on an explicit submit —
 * typing sends nothing — and `add` re-resolving the identical string is served from `place_lookups`
 * (`integrations/places/lookup-cache.ts`) rather than from quota, which is the same property
 * `manual-add.ts`'s header records for its own repeat calls.
 *
 * ## What a save from here writes, and what it does not
 *
 * No `extracted_reason`, no `tags`, no `why_go`, no `dishes` (`enrichment: null`, which is what
 * stops `apply_saved_place_extraction` being called at all). There is a caption, but it did not
 * name this place — the user did — so attributing any of it to the place would be exactly the
 * uncertainty-into-certainty failure the working agreement forbids. `sourceId` **is** written,
 * because the TikTok is genuinely where this place came from.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { createPlaceResolver, placeResolverEnv } from '@/integrations/places/place-resolver-factory';
import { supabasePlaceStore } from '@/integrations/supabase/place-store';
import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { ResolveQuery, ResolveResult } from '@/domain/types';
import { optionDetail } from '@/ui/import/candidate-resolution-view';
import { validateManualName } from '@/app/actions/manual-add-choice';

/** `spec-no-places-found.md` §5.2, verbatim. Nothing here is composed at the call site. */
const NOT_SIGNED_IN = 'You’re signed out. Sign in and try again.';
const SEARCH_UNAVAILABLE = 'Search isn’t working right now. Try again in a moment.';
const ADD_FAILED = 'Couldn’t add that one. Try again.';
/** The list moved under the user while they were choosing. Not a failure of theirs, and not a
 *  message either — the fresh list is the answer, and the screen re-renders it. */
const STALE_CHOICE = 'stale';

/** At most five, per §4's layout. A sixth would push the confirm step below the fold on a 375px
 *  screen, and a list nobody scrolls to the end of is a list that made the choice for them. */
const MAX_RESULTS = 5;

const LOOKUP_BUDGET_MS = 12_000;
const SAVE_BUDGET_MS = 10_000;

/** Codes and scalars only, never a query, a name or a coordinate (`ports.ts`'s `Logger`). */
function routeCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: {
      event: (name, fields) => {
        console.info(JSON.stringify({ event: name, ...fields }));
      },
    },
  };
}

/** One row of the list, and the whole of what the browser is told about a place it has not saved. */
export interface PlaceSearchResult {
  /** Position in **this** shortlist, and the only thing an `add` may name. */
  readonly index: number;
  readonly name: string;
  /**
   * Address and locality. Not decoration: a chain returns five rows called "Cafe Cafe" and the
   * address is the entire difference between them, which is why it is also half of each row's
   * accessible name.
   */
  readonly address: string;
}

/**
 * What we ask the provider.
 *
 * `cityHint` is the extraction's own, and it is passed **only** when the screen is showing case C's
 * scope chip — a city the caption actually named, that the user can see and remove. It is never the
 * map's viewport: "where you happen to be looking" is not something the user said, and a Lisbon
 * restaurant typed while looking at Tel Aviv would be silently narrowed away.
 */
function searchQuery(text: string, cityHint: string | null): ResolveQuery {
  return {
    text,
    cityHint,
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: MAX_RESULTS,
  };
}

function toResults(result: ResolveResult): readonly PlaceSearchResult[] {
  return result.shortlist.slice(0, MAX_RESULTS).map((ranked, index) => ({
    index,
    name: ranked.place.name,
    address: optionDetail(ranked.place),
  }));
}

interface SearchBody {
  readonly op?: unknown;
  readonly query?: unknown;
  readonly cityHint?: unknown;
  readonly optionIndex?: unknown;
  readonly expectedName?: unknown;
  readonly sourceId?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: NOT_SIGNED_IN }, { status: 401 });

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ ok: false, message: SEARCH_UNAVAILABLE }, { status: 400 });
  }

  const name = validateManualName(typeof body.query === 'string' ? body.query : '');
  if (!name.ok) return NextResponse.json({ ok: false, message: name.message }, { status: 400 });
  const cityHint = typeof body.cityHint === 'string' && body.cityHint !== '' ? body.cityHint : null;

  const service = serviceRoleClient();
  const ctx = routeCtx(AbortSignal.any([req.signal, AbortSignal.timeout(LOOKUP_BUDGET_MS)]));

  // The one provider call on this path, and it happens because the user pressed a button.
  let resolved: ResolveResult;
  try {
    resolved = await createPlaceResolver(placeResolverEnv(), service).resolve(
      searchQuery(name.value, cityHint),
      ctx,
    );
  } catch (e) {
    // `PlaceResolver` throws only `DomainError`, and its adapter has already logged the
    // classification. Nothing about it reaches the browser but the sentence above.
    console.error(
      JSON.stringify({
        event: 'import.place_search',
        outcome: 'lookup_failed',
        domain: e instanceof DomainError ? e.code : 'unknown',
      }),
    );
    return NextResponse.json({ ok: false, message: SEARCH_UNAVAILABLE }, { status: 502 });
  }

  const results = toResults(resolved);
  if (body.op !== 'add') {
    // An empty list is a designed state, not an error (§6.6): 200, `ok: true`, zero rows. The
    // screen says `No places match "…"` and keeps the query in the field.
    return NextResponse.json({ ok: true, results });
  }

  const optionIndex = typeof body.optionIndex === 'number' ? body.optionIndex : -1;
  const chosen = resolved.shortlist[optionIndex];
  const shown = results[optionIndex];
  // The staleness check. The provider is not contractually stable between two calls, so a position
  // alone is not enough to be sure the user gets the row they read. `expectedName` is compared and
  // then discarded; it is never written, never sent to `resolve_place`, and never part of the save.
  if (chosen === undefined || shown === undefined || shown.name !== body.expectedName) {
    return NextResponse.json({ ok: false, reason: STALE_CHOICE, results }, { status: 409 });
  }

  try {
    const saved = await supabasePlaceStore(service, supabase).confirmPlace(
      {
        place: chosen.place,
        // No extraction of ours to file it under. The read path derives the displayed category
        // from `places.provider_category`, so the provider's own type for the venue is what the
        // pin and the row use — the same choice `manual-add.ts` makes and for the same reason.
        category: null,
        countryCode: null,
        resolutionScore: chosen.score,
      },
      {
        /**
         * The TikTok this came from. Not `null`, unlike a `＋`-sheet manual add: the user found
         * this place *because of* that post, and `saved_place_sources` is where that is recorded.
         *
         * It passes `sps_insert_own` (0006) because the probe route already called `start_import`
         * for this source before it ever reached the no-places screen, so the user genuinely has
         * the matching `imports` row the policy requires. There is no borrowed provenance here.
         */
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : null,
        note: null,
        // There *is* a caption, and it still did not name this place — the user did. Attributing
        // any of it to this row would be inventing a provenance.
        extractedReason: null,
        userId: user.id,
        enrichment: null,
      },
      routeCtx(AbortSignal.timeout(SAVE_BUDGET_MS)),
    );

    return NextResponse.json({
      ok: true,
      savedPlaceId: saved.savedPlaceId,
      placeId: saved.placeId,
      /** The **provider's** name for the row that was written, not the string that was typed. */
      name: chosen.place.name,
      alreadySaved: saved.alreadySaved,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'import.place_search',
        outcome: 'save_failed',
        domain: e instanceof DomainError ? e.code : 'unknown',
      }),
    );
    return NextResponse.json({ ok: false, message: ADD_FAILED }, { status: 502 });
  }
}
