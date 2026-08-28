'use server';

/**
 * The writes a user may make to a place they already saved — `L1-F7-T2`, the U and the D of the
 * CRUD the course grades, plus the category override and the been/not-been mark added since.
 * Until this file existed, `src/app/actions/` held only `sign-out.ts`:
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
 * No function here filters on `user_id`, and that is deliberate rather than an omission. All go
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
import { validateDisplayName } from '@/domain/places/display-name';
import { validateNote } from '@/domain/places/note';
import { isProductCategory, type ProductCategory } from '@/domain/places/product-category';

export type SavedPlaceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const NOT_SIGNED_IN = 'You are signed out. Sign in and try again.';
const GONE = 'That place is no longer in your list.';
const FAILED_DELETE = "Couldn't remove that place. Try again.";
const FAILED_UPDATE = "Couldn't save your note. Try again.";
const FAILED_CATEGORY = "Couldn't change the category. Try again.";
const FAILED_NAME = "Couldn't save that name. Try again.";
const FAILED_VISIT = "Couldn't update that place. Try again.";
const BAD_CATEGORY = 'That is not a category we know.';

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

/**
 * Renames a saved place, or clears the rename.
 *
 * `display_name` has been selected, rendered and inside `0006`'s UPDATE column grant since the day
 * it shipped, and nothing has ever written it — so this adds no schema surface and no new
 * authority, it fills in the half that was missing. Same shape as the category override, and for
 * the same reason: clearing writes SQL NULL rather than freezing today's `places.name` into the
 * column, so a place whose canonical name later improves is not silently opted out of that.
 *
 * The `places` row is never touched. It is shared across users (charter invariant 4), so one
 * person's private label for a venue must not become everyone's — which is exactly what the
 * per-user overlay exists for, and why `place_id` is not in the grant at all.
 */
export async function updateSavedPlaceName(
  savedPlaceId: string,
  rawName: string,
): Promise<SavedPlaceResult> {
  const validated = validateDisplayName(rawName);
  if (!validated.ok) return { ok: false, message: validated.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('saved_places')
    .update({ display_name: validated.value }, { count: 'exact' })
    .eq('id', savedPlaceId);

  if (error) {
    console.error('updateSavedPlaceName failed', { savedPlaceId, code: error.code });
    return { ok: false, message: FAILED_NAME };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/map');
  revalidatePath('/collections');
  return { ok: true };
}

/**
 * Sets (or clears) the caller's own category for a saved place.
 *
 * ## Why this is a *third* write and not a widening of the note
 *
 * `0019`'s UPDATE column grant already covers `category_override`, and `productCategoryFor` already
 * ranks it above both the provider's registration and the model's guess — the reconciliation has
 * been reading a column nothing ever wrote since the day it shipped. So this adds no schema surface
 * and no new authority: it fills in the half that was missing.
 *
 * ## `null` restores the derivation, and that is the point of the control
 *
 * Clearing writes SQL `NULL`, not `'other'` and not the derived value frozen into the column. The
 * user is saying *"stop, use whatever you work out"*, which is a different statement from *"this is
 * an Other"* — and it has to stay different, because a better provider category tomorrow should
 * reach a place whose owner never overrode it. Freezing the current derivation would silently opt
 * that place out of every future improvement.
 *
 * ## Why the value is validated here rather than only at the column
 *
 * `category_override` is plain `text` with no CHECK, and `productCategoryFor` tolerates a string it
 * cannot parse by rendering `other` — deliberately, because an unparseable override is still the
 * user's word. That tolerance is right for reading old rows and wrong for accepting new ones: a
 * client that posts `'Kaffee'` would write a value the product can never render, and the user would
 * see `Place` with no way to tell why. `isProductCategory` is the same predicate the renderer uses,
 * so what this accepts and what the screen can draw cannot drift.
 *
 * Authorisation is `saved_places_update_own` (`0006`), exactly as for the other two — see the
 * header for why no `user_id` filter appears here.
 */
export async function updateSavedPlaceCategory(
  savedPlaceId: string,
  category: ProductCategory | null,
): Promise<SavedPlaceResult> {
  if (category !== null && !isProductCategory(category)) {
    return { ok: false, message: BAD_CATEGORY };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('saved_places')
    .update({ category_override: category }, { count: 'exact' })
    .eq('id', savedPlaceId);

  if (error) {
    console.error('updateSavedPlaceCategory failed', { savedPlaceId, code: error.code });
    return { ok: false, message: FAILED_CATEGORY };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/map');
  return { ok: true };
}

/**
 * Marks a saved place as somewhere the user has been, or moves it back to still-to-go.
 *
 * ## Why both columns move in one statement, always
 *
 * `0006` carries `saved_places_visited_at_consistent`:
 * `check (visit_state = 'visited' or visited_at is null)`. So the two columns are not independent
 * — an update that clears the state and leaves the timestamp behind is rejected with `23514`, and
 * an update that sets the timestamp without the state is rejected the same way from the other
 * side. Writing one column at a time would therefore be a runtime error in one direction and a
 * silent inconsistency in the other; a single `update` with both keys is the only shape the
 * constraint accepts, in both directions. That is not defensive coding, it is the column pair's
 * actual contract, which is why `visitedFields` is the one place either value is produced.
 *
 * ## Why the timestamp is the server's clock and is not user-editable
 *
 * `visited_at` exists to make "been" a fact with a time attached rather than a bare flag, and the
 * time is *when it was recorded here*, never a date the user typed — an editable visit date is
 * explicitly out of scope (`docs/product-ruling-after-the-save.md` §6.5), and taking one from the
 * browser would let a client write any timestamp it liked into a column nothing validates. Nothing
 * renders it today; it is written because the schema asked for it and because a mark with no time
 * is the thing that has to be re-derived later.
 *
 * Authorisation is `saved_places_update_own` (`0006`), and both columns have been inside that
 * migration's UPDATE column grant since the day it shipped — this action adds no schema surface
 * and no new authority. See the header for why no `user_id` filter appears here.
 */
export async function setSavedPlaceVisited(
  savedPlaceId: string,
  visited: boolean,
): Promise<SavedPlaceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('saved_places')
    .update(visitedFields(visited, new Date()), { count: 'exact' })
    .eq('id', savedPlaceId);

  if (error) {
    console.error('setSavedPlaceVisited failed', { savedPlaceId, code: error.code });
    return { ok: false, message: FAILED_VISIT };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/map');
  return { ok: true };
}

/**
 * The one producer of the `visit_state` / `visited_at` pair, so the CHECK above cannot be violated
 * by a caller that remembers one column and forgets the other.
 *
 * Not exported: a `'use server'` module may only export async functions, and Next fails the build
 * rather than warning. The unit test asserts the payload through the recorded `update` call
 * instead, which is the shape that actually reaches Postgres and therefore the thing worth pinning.
 */
function visitedFields(
  visited: boolean,
  now: Date,
): { visit_state: 'visited' | 'want_to_go'; visited_at: string | null } {
  return visited
    ? { visit_state: 'visited', visited_at: now.toISOString() }
    : { visit_state: 'want_to_go', visited_at: null };
}
