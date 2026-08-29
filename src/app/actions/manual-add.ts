'use server';

/**
 * Manual add — a place the user names themselves, with no TikTok behind it. `L1-F7-T1`, promoted
 * out of the backlog by the owner's 2026-08-29 ruling.
 *
 * ## It needs no migration, and that was proved rather than reasoned
 *
 * The blocker everyone assumed for weeks does not exist. `sps_insert_own` (`0006:135`) is a policy
 * on **`saved_place_sources`**, and `save_place` only reaches that table inside
 * `if p_source_id is not null` (`0017:75`) — so a save with no source never touches it and needs no
 * `imports` row. Verified against the local container as a user with zero `imports` rows, with
 * `SET CONSTRAINTS ALL IMMEDIATE` to force the deferred provenance trigger: the row landed
 * `origin='manual'`, null source, nothing orphaned.
 *
 * ## The call sequence, and why it is composed rather than re-implemented
 *
 * `resolve_place` (service-role only, the only way a `places` row is created) → an RLS-scoped
 * duplicate check on the *user's* client → `save_place` on the user's session. That is exactly
 * `supabasePlaceStore.confirmPlace`, which already sits across that privilege line and already
 * carries the reasoning for it, so this file composes it instead of opening a second pair of
 * clients that could drift.
 *
 * **`apply_saved_place_extraction` is not called**, and `enrichment: null` is what stops it
 * (`place-store.ts` returns before the RPC). There is no caption here, so there are no tags, no
 * dishes and no `why_go` — and inventing them for a place someone typed is the
 * uncertainty-into-certainty failure the working agreement forbids. Same reason `extractedReason`
 * is null: `saved_places.extracted_reason` holds a verbatim caption quote, and there is no caption.
 *
 * ## One provider lookup, on an explicit submit
 *
 * Google Places is 100 lookups/day on this project. **This action is the only thing on the manual
 * path that talks to a provider, and it runs only when the user presses the manual-add row** —
 * never while they type, because typing searches the library in the browser
 * (`components/add/library-results.ts`, `domain/places/search.ts`, no request at all). One call to
 * this action is at most one Text Search, and repeats of the same string are served from
 * `place_lookups` (`integrations/places/lookup-cache.ts`) rather than from quota.
 *
 * ## What never reaches the client
 *
 * No provider fact crosses the browser in either direction. The request is the string the user
 * typed; the response is the ids and the name of the row that was written. That is the same trust
 * boundary `/api/imports/confirm`'s header describes and for the same reason: `resolve_place`
 * refreshes provider-owned columns on a matched row, and `places` rows are shared between users, so
 * a client-supplied name or coordinate would let one person rename and relocate a place other
 * people have saved.
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/app/_lib/supabase/server';
import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import { createPlaceResolver, placeResolverEnv } from '@/integrations/places/place-resolver-factory';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { supabasePlaceStore } from '@/integrations/supabase/place-store';
import {
  chooseManualPlace,
  manualAddQuery,
  validateManualName,
  type ManualPlaceChoice,
} from './manual-add-choice';

export type ManualAddResult =
  | {
      readonly ok: true;
      readonly placeId: string;
      readonly savedPlaceId: string;
      /** The **provider's** name for the row that was written, not the string that was typed. The
       *  caller shows it back, because "we saved this one" is the only check the user gets on a
       *  match they did not pick from a list. */
      readonly name: string;
      /** They already had it. Reported rather than dressed up as a fresh save — `save_place` is
       *  idempotent, so the alternative is claiming to have added something twice. */
      readonly alreadySaved: boolean;
    }
  | { readonly ok: false; readonly message: string };

const NOT_SIGNED_IN = 'You are signed out. Sign in and try again.';
/** The honest empty state. It names no fallback because there is none — see `chooseManualPlace`. */
const NOT_FOUND = 'We couldn’t find that place. Try its full name, and the city.';
const LOOKUP_FAILED = 'Couldn’t search for places just now. Try again.';
const SAVE_FAILED = 'Couldn’t save that place. Try again.';

/** How long each half gets. A server action has no request signal to inherit and `OpCtx` requires
 *  one, so the budgets are stated here rather than left unbounded — and they are **two** budgets
 *  rather than one shared deadline, so a slow lookup cannot leave the save with no time to run and
 *  strand a `places` row with nobody's save attached to it. */
const LOOKUP_BUDGET_MS = 12_000;
const SAVE_BUDGET_MS = 10_000;

/** The same shape `app/api/imports/confirm/route.ts` builds: codes and scalars on stderr, never a
 *  name, a query or a coordinate (`ports.ts`'s `Logger`). `importId` is null because there is no
 *  import — which is precisely why that field is nullable (`ports.ts`, `OpCtx`). */
function actionCtx(signal: AbortSignal): OpCtx {
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

export async function addPlaceManually(rawName: string): Promise<ManualAddResult> {
  const name = validateManualName(rawName);
  if (!name.ok) return { ok: false, message: name.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const service = serviceRoleClient();

  // The one provider call on this path, and it happens here because the user pressed a button.
  let choice: ManualPlaceChoice;
  try {
    const result = await createPlaceResolver(placeResolverEnv(), service).resolve(
      manualAddQuery(name.value),
      actionCtx(AbortSignal.timeout(LOOKUP_BUDGET_MS)),
    );
    choice = chooseManualPlace(result);
  } catch (e) {
    // `PlaceResolver` throws only `DomainError`, and its own adapter has already logged the
    // classification. Anything else is a bug in composition (a missing key, a bad `PLACE_RESOLVER`)
    // and is worth its own line — neither reaches the browser as anything but the sentence above.
    console.error('addPlaceManually lookup failed', {
      domain: e instanceof DomainError ? e.code : 'unknown',
    });
    return { ok: false, message: LOOKUP_FAILED };
  }

  if (choice.kind === 'not_found') return { ok: false, message: NOT_FOUND };

  try {
    const saved = await supabasePlaceStore(service, supabase).confirmPlace(
      {
        place: choice.ranked.place,
        // No extraction, so no category of our own to write. Not a gap on screen: the read path
        // derives the displayed category from `places.provider_category` through
        // `productCategoryFor` (`map/_lib/get-spots.ts`), so Google's own type for the venue is
        // what the pin and the row use. Deriving `places.category` from it here would file a
        // provider string under the column that holds the model's vocabulary.
        category: null,
        // `ResolvedPlace` carries no country and there is no caption to have named one. The import
        // path has the same hole for the same reason (`candidate-place.ts`), and guessing it from
        // the locality string is the fabrication both files refuse.
        countryCode: null,
        resolutionScore: choice.ranked.score,
      },
      {
        // A manual save. `save_place`'s own `origin` rule reads this null as `origin='manual'`;
        // there is no second flag for it.
        sourceId: null,
        note: null,
        extractedReason: null,
        userId: user.id,
        enrichment: null,
      },
      actionCtx(AbortSignal.timeout(SAVE_BUDGET_MS)),
    );

    revalidatePath('/map');
    return {
      ok: true,
      placeId: saved.placeId,
      savedPlaceId: saved.savedPlaceId,
      name: choice.ranked.place.name,
      alreadySaved: saved.alreadySaved,
    };
  } catch (e) {
    console.error('addPlaceManually save failed', {
      domain: e instanceof DomainError ? e.code : 'unknown',
    });
    return { ok: false, message: SAVE_FAILED };
  }
}
