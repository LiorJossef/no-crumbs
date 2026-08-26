'use server';

/**
 * The two writes a user may make to a place they already saved — `L1-F7-T2`, the U and the D of
 * the CRUD the course grades. Until this file existed, `src/app/actions/` held only `sign-out.ts`:
 * the product could create and read, and a place you saved was a place you were stuck with.
 *
 * ## Why Server Actions rather than route handlers
 *
 * `app/_lib/supabase/server.ts`'s own header states the rule these follow: `ui/**` may not import
 * the Supabase client directly, only reach it through a Server Action in `app/actions/*`. The
 * import pipeline is a route handler because it streams and holds a **service-role** client; these
 * two do neither. They use the *caller's* client, which is the whole point — see below.
 *
 * ## Authorisation is Postgres's job here, not this file's
 *
 * Neither function filters on `user_id`, and that is deliberate rather than an omission. Both go
 * through the user's own client, so `saved_places_delete_own` and `saved_places_update_own`
 * (`using (user_id = (select auth.uid()))`, migration `0006`) decide which row is addressable. A
 * request naming someone else's `savedPlaceId` matches **zero rows** at the database, whatever this
 * file believes — the same posture `get-spots.ts` already takes for reads, and the same one the
 * confirm route's ownership check relies on. `L1-F7-T3` asserts exactly this against the database
 * rather than against the UI.
 *
 * A second reason not to add a redundant `user_id` filter: it would make the code *look* like the
 * safety net, and the next person to touch it could then remove the policy without any test going
 * red. The policy is the control; this file must not appear to duplicate it.
 *
 * ## What delete does and does not remove
 *
 * It removes one `saved_places` row. `saved_place_sources` follows through `sps_owner_fk`
 * (`on delete cascade`), so no provenance row is orphaned. **`places` is never touched** — it is
 * shared across users (charter invariant 4: one physical place, many people, many TikToks), so a
 * user removing their own save must not delete a row someone else has saved. There is no
 * `places` delete grant for `authenticated` at all, so this is enforced rather than merely
 * intended.
 *
 * ## Why these return a result instead of throwing
 *
 * Both are called from a client component that has to put something on screen. `current-state.md`
 * §3.5 records the cost of the opposite choice on the import path — every failure masked as
 * `INTERNAL, retryable: true`, including a 400 for a malformed body, which cost real diagnosis time
 * during the 2026-08-26 staging verification. So the three outcomes a user can actually be in are
 * distinguished: not signed in, the row is not there (deleted in another tab, or never theirs), and
 * everything else. What is *not* returned is the Postgres error text — that would leak schema
 * detail to the browser for no user benefit; it is thrown into the server log instead.
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/app/_lib/supabase/server';
import { validateNote } from '@/domain/places/note';

export type SavedPlaceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const NOT_SIGNED_IN = 'You are signed out. Sign in and try again.';
const GONE = 'That place is no longer in your list.';
const FAILED_DELETE = "Couldn't remove that place. Try again.";
const FAILED_UPDATE = "Couldn't save your note. Try again.";

/**
 * Deletes one of the caller's saved places.
 *
 * `count: 'exact'` is load-bearing: without it a delete that matched nothing is indistinguishable
 * from one that worked, because RLS turns "not yours" into "no rows" rather than into an error.
 * Zero rows is reported as `GONE` — true both when the row never belonged to the caller and when
 * they deleted it a moment ago in another tab, and there is no reason to tell those apart on
 * screen.
 */
export async function deleteSavedPlace(savedPlaceId: string): Promise<SavedPlaceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('saved_places')
    .delete({ count: 'exact' })
    .eq('id', savedPlaceId);

  if (error) {
    console.error('deleteSavedPlace failed', { savedPlaceId, code: error.code });
    return { ok: false, message: FAILED_DELETE };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/map');
  return { ok: true };
}

/**
 * Sets (or clears) the caller's own note on a saved place.
 *
 * The note is the *only* user-writable text here. `0015` deliberately keeps `extracted_reason`
 * system-derived and the UPDATE column grant covers just
 * `note, display_name, category_override, visit_state, visited_at` — so widening this function to
 * take a second field would be a schema conversation, not a code change.
 */
export async function updateSavedPlaceNote(
  savedPlaceId: string,
  rawNote: string,
): Promise<SavedPlaceResult> {
  const validated = validateNote(rawNote);
  if (!validated.ok) return { ok: false, message: validated.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('saved_places')
    .update({ note: validated.value }, { count: 'exact' })
    .eq('id', savedPlaceId);

  if (error) {
    console.error('updateSavedPlaceNote failed', { savedPlaceId, code: error.code });
    return { ok: false, message: FAILED_UPDATE };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/map');
  return { ok: true };
}
