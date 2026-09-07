-- 0032_repoint_saved_place.sql — let a user move their own save onto the right venue.
--
-- Task `r1-pin`. Round 1 finding 2 of `docs/archive/product-review-2026-08-31-r1.md`, which is a product
-- finding with a database cause. The ruling that governs this file is
-- `docs/archive/db-ruling-repoint-place-2026-08-31.md`; where the two differ, the ruling wins.
--
-- ═══ THE PROBLEM, STATED AS A GRANT ═══════════════════════════════════════════════════════════
--
-- `src/ui/place/location-certainty.ts:8-11` ships the sentence "Measured drift on those is
-- 65–470 m, median 327 m — a street or two, sometimes the wrong building", and the product prints
-- "Approximate location" on those rows. That is the honest thing to do and it is the reason the
-- problem is visible at all. What the product does not have is the repair, and the reason is
-- exactly one line — `0006:117`:
--
--     grant update (display_name, category_override, note, visit_state, visited_at)
--       on public.saved_places to authenticated;
--
-- `place_id` is not on that list, so no role reachable from a browser can move a save onto a
-- different `places` row. The user's only recourse is delete-and-re-add, which destroys the note,
-- the tags, the been-mark and the link back to the TikTok — four of the five things the MVP
-- boundary says this product stores. Getting the place right is the deliverable, not polish.
--
-- ═══ WHY THIS IS A FUNCTION AND NOT A COLUMN GRANT ════════════════════════════════════════════
--
-- The obvious fix is `grant update (place_id) on public.saved_places to authenticated`. It is
-- rejected here, and the reason is NOT the one that first suggests itself, so both halves are
-- written down.
--
-- The reason that does NOT hold, and it is worth recording because it looks decisive:
-- "a raw `place_id` grant would create an id-probing oracle over the shared `places` table." That
-- oracle already exists and this migration neither opens nor closes it. MEASURED on the local
-- container at base commit `2cf6b83`:
--
--     authenticated | INSERT | category_override, display_name, extracted_reason, note, origin,
--                              place_id, user_id, visit_state, visited_at
--
-- `place_id` IS insert-grantable (`0006:113`, narrowed to a column list that still names it by `0015:57`), and `places_select_if_saved`
-- (`0006:150`) opens a `places` row to anyone holding a save that names it. So a browser can
-- already insert a save naming an arbitrary `places` uuid and then read that row. What makes that
-- survivable is not a grant: it is that `places.id` is a random v4 uuid, so there is nothing to
-- enumerate, and a uuid you were told is a uuid somebody chose to tell you. An UPDATE grant would
-- be the same primitive by a second route, not a new one.
--
-- The reason that DOES hold, and it is a product reason with a security consequence:
-- **a re-point must land on a row the SERVER resolved, never on an id the CLIENT names.** Every
-- other write of `places` in this schema goes through `resolve_place` — `security definer`,
-- `service_role` only, the single creator of a `places` row — precisely so that a name, a category
-- and a coordinate that many users share can only come from a provider (`0012` part 2,
-- `manual-add.ts`'s "what never reaches the client"). A column grant would put the client back in
-- the position of choosing which shared row its save denotes, with the server unable to say where
-- that id came from. The function keeps the seam where the rest of the schema keeps it: the browser
-- sends a STRING, the server resolves it through the same `PlaceResolver` → `resolve_place` path
-- the add-by-name recovery and `addPlaceManually` already use, and only then names an id.
--
-- Second reason, smaller but real: a column grant cannot carry the four refusals below. A raw
-- UPDATE hitting `saved_places_user_place_unique` returns 23505 from a constraint, and a raw UPDATE
-- naming a tombstone succeeds and silently points the save at a merged-away row.
--
-- ═══ SHAPE, AND WHERE IT IS COPIED FROM ═══════════════════════════════════════════════════════
--
-- `apply_saved_place_extraction` (`0019:376`) is the precedent, not `0031`. It is the other writer
-- of `saved_places` columns that carry no browser grant, and it is **SECURITY INVOKER, granted to
-- `service_role` alone, with the ownership predicate in its own WHERE clause**. This file is that
-- function's direct analogue and copies all three properties.
--
-- INVOKER RATHER THAN DEFINER, and this is a deliberate departure from `0031`'s two writers.
-- `0031` had no choice: it revoked `service_role` from `place_mentions`, so an invoker function
-- would have been refused. `saved_places` is different, MEASURED at `2cf6b83`: `service_role` holds
-- table-level UPDATE (every column, `place_id` included) and carries `rolbypassrls`, so an invoker
-- function called by `service_role` can do this work with no elevation at all. That matters,
-- because it makes the failure mode of a mistake LOUD rather than SILENT:
--
--   * as INVOKER, if a future migration ever granted EXECUTE on this function to `authenticated`,
--     the call would fail with 42501 at the inner UPDATE — `authenticated` holds no UPDATE grant on
--     `place_id`. The mistake is refused by the database. (Proven by execution: test R9c.)
--   * as DEFINER it would instead succeed, and `agent-guardrails.md` §5 rule 18 would be tripped on
--     two of its three counts at once — it writes a column the caller holds no grant on, and it
--     derives the row it acts on from a caller-supplied id.
--
-- The price of INVOKER is a dependency on a privilege this repo never granted explicitly:
-- `service_role`'s UPDATE on `saved_places` arrives from a `postgres`-owned ALTER DEFAULT
-- PRIVILEGES entry (`0024`'s header, `Dxtm`), and a future migration that revokes it — as `0031`
-- did for its own table — breaks this function. That is why the dependency is asserted by name in
-- `supabase/tests/0032_repoint_saved_place_policy_tests.sql` (R0c) rather than left to be
-- rediscovered. A revoke that lands without also converting this function to DEFINER will fail that
-- assertion, in CI, before it reaches a hosted project.
--
-- ═══ WHAT A RE-POINT CARRIES, AND WHAT IT DOES NOT ════════════════════════════════════════════
--
-- CARRIED, all of it structurally rather than by copying anything:
--   * `saved_place_sources` is keyed on `saved_place_id`, never on `place_id`, so every TikTok that
--     recommended this save stays attached to it. **The creator credit is a terms obligation and it
--     survives by construction** — there is no statement in this file that could detach one.
--   * `source_url` / `source_thumbnail_url` (`0016`) live on the save and are facts about the
--     SOURCE, not about the venue. Untouched.
--   * `note`, `display_name`, `category_override`, `tags`, `dishes`, `why_go`, `visit_state`,
--     `visited_at` — the user's overlay, which is the entire point of the exercise. Untouched.
--   * `extracted_reason` (`0015`/`0017`) is the verbatim caption fragment that names the venue. A
--     re-point corrects which `places` row that NAME resolved to; it does not make the caption say
--     something else. Untouched, and `0017`'s "insert-only" posture is why it could not be rewritten
--     here even if that were wanted.
--   * `origin` is unchanged, so `saved_places_provenance_required` (`0006`, `after insert or update
--     OF origin`) does not fire. An `origin='import'` save keeps its at-least-one-source invariant
--     and is never re-classified as manual. (Proven by execution: test R4.)
--   * `place_provider_refs` belongs to the `places` rows on both sides and is not addressed by a
--     save at all.
--
-- NOT CARRIED, and this is the honest gap in this migration:
--   * **`collection_items.place_id`.** A collection item is keyed on `place_id` (`0024:147`), so a
--     re-point leaves any collection the user put this place into still pointing at the old row —
--     and, because the overlay is joined through `saved_places`, that item loses the user's note and
--     name as well. It is NOT fixed here, on purpose: `collection_items` is a SHARED row that other
--     members read, `service_role` was deliberately revoked from it (`0024:177`) so touching it
--     would force this function to DEFINER, and the collision case (the collection already contains
--     the target place) has no non-destructive answer that one user's private correction should be
--     allowed to choose. The detection query and the recommendation are in the ruling, §5. This is a
--     known consequence with a named owner, not an oversight.
--   * The same gap already exists, un-noticed, in `merge_places` (`0011`), which moves
--     `saved_places`, `saved_place_sources`, `place_provider_refs` and tombstones but predates
--     `collection_items` entirely and does not move it. Reported in the ruling, §5.1.
--   * The vacated `places` row is left alone. It is a shared row, other users may hold saves on it,
--     and deleting rows nobody asked to delete is not a repair.
--
-- ═══ SCOPE ════════════════════════════════════════════════════════════════════════════════════
--
-- One function. No table, no view, no column, no policy, no trigger, and no grant to `anon` or
-- `authenticated` on anything — so `scripts/check-migration-grants.sh` has no new relation to
-- assert, `inventory.sql` check 5's column-grant list is unchanged, and check 6's browser-reachable
-- function set stays exactly what it is (this function is revoked from PUBLIC and granted to
-- `service_role` alone, which is what keeps it off check 6's exhaustive list rather than breaking
-- it). Forward-only: nothing at or below `0031` is edited.

begin;

create or replace function public.repoint_saved_place(
  p_user_id        uuid,
  p_saved_place_id uuid,
  -- A `places` id the CALLER resolved. The contract of this function is that its caller obtained
  -- this id from `resolve_place` (i.e. from a provider lookup it performed itself) and never from
  -- the browser. That contract cannot be checked from inside the database — there is no column
  -- recording who asked for a row — which is exactly why EXECUTE is `service_role` only and why the
  -- server action is the trust boundary. See the header.
  p_place_id       uuid
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_old    uuid;
  v_target uuid;
begin
  if p_user_id is null or p_saved_place_id is null or p_place_id is null then
    raise exception 'repoint_saved_place requires a user id, a saved place id and a place id'
      using errcode = '22004';
  end if;

  -- Follow any merge chain to the row that is still alive, exactly as `resolve_place` does at both
  -- of its return points (`0014`, `0011` defect 1). A caller working from a stale picture can name
  -- a tombstone; a save pointing at a tombstone is the failure `place_survivor_id` exists to
  -- prevent, and it is silent — the row reads fine and shows the wrong venue forever.
  v_target := public.place_survivor_id(p_place_id);
  if v_target is null then
    raise exception 'repoint_saved_place: place % does not exist', p_place_id using errcode = '23503';
  end if;

  -- Ownership in the WHERE clause, not in a policy. `service_role` carries BYPASSRLS, so FORCE ROW
  -- LEVEL SECURITY does not protect this row from this function and no policy is consulted; the
  -- function must refuse another user's save itself. Same discipline as `start_import` (`0007`),
  -- `apply_saved_place_source_link` (`0016`) and `apply_saved_place_extraction` (`0019`).
  --
  -- "Not found" and "not yours" are one message on purpose: distinguishing them would answer
  -- "does this saved-place id exist?" for any id, which is a membership oracle over other people's
  -- libraries. Same resolution `close_place_mention` (`0031`) makes.
  select sp.place_id into v_old
    from public.saved_places sp
   where sp.id = p_saved_place_id and sp.user_id = p_user_id;
  if not found then
    raise exception 'repoint_saved_place: saved place % does not belong to user %',
      p_saved_place_id, p_user_id using errcode = '42501';
  end if;

  -- Already there. Idempotent rather than an error: the "confirm this is the right venue" tap must
  -- be safe to double-fire, and re-pointing a save at the row it already names is not a mistake the
  -- user needs told about. Same resolution `save_place`'s ON CONFLICT makes for a repeated save.
  -- Note this also returns without touching `updated_at`, so a no-op re-point does not move a row
  -- the user did not change.
  if v_old = v_target then
    return v_old;
  end if;

  -- The user already holds a save on the target. `saved_places_user_place_unique` would raise 23505
  -- from the constraint two statements later; this is the readable refusal in front of it, so the
  -- caller gets a sentence it can put on screen rather than a constraint name.
  --
  -- MERGING THE TWO SAVES IS DELIBERATELY NOT DONE. `merge_places` (`0011`) does merge in this
  -- situation — it moves the loser's provenance links and then deletes the loser save — and that is
  -- right for an operator repairing a duplicate `places` row, where the two saves are known to be
  -- one physical place. It is wrong here: this is one user pressing a button, the two saves carry
  -- two different notes, two different been-marks and two different sets of tags, and silently
  -- destroying one of them is precisely the "delete-and-re-add loses the note" failure this
  -- migration exists to end. The user is told, and chooses.
  if exists (select 1 from public.saved_places sp
              where sp.user_id = p_user_id
                and sp.place_id = v_target
                and sp.id <> p_saved_place_id) then
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end if;

  begin
    update public.saved_places sp
       set place_id = v_target
     where sp.id = p_saved_place_id
       and sp.user_id = p_user_id;
  exception when unique_violation then
    -- A concurrent save of the target place won the race between the check above and this UPDATE.
    -- Re-raised with the same readable message rather than the constraint's, so the caller has one
    -- error to handle and not two.
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end;

  -- The place the save pointed at BEFORE the call. Returned rather than a boolean because it is the
  -- only record anywhere that the move happened: there is no audit table in this schema, and the
  -- caller is the last thing that can log which row was vacated.
  return v_old;
end;
$fn$;

comment on function public.repoint_saved_place(uuid, uuid, uuid) is
  'The ONLY writer of saved_places.place_id on the user-facing path. service_role only: place_id '
  'carries no UPDATE grant for anon or authenticated, so "move my save onto another place" is not '
  'expressible from a browser at all — the browser sends a name, the server resolves it through '
  'resolve_place, and only then names an id. SECURITY INVOKER, so it creates no elevation; it '
  'enforces ownership in its own WHERE clause because service_role bypasses RLS. Follows merge '
  'chains to the survivor, refuses a duplicate rather than merging two saves, and is idempotent on '
  'a re-point to the row the save already names. Returns the place_id the save pointed at before '
  'the call. Does NOT move collection_items — see 0032''s header and the ruling §5.';

-- EXECUTE defaults to PUBLIC on every newly created function, and a privilege held through PUBLIC
-- survives `revoke ... from anon`. That is `0009`'s bug and then `0018`'s — it has regressed twice —
-- so the revoke names PUBLIC first and the browser roles explicitly.
-- `inventory.sql` check 6 is exhaustive about which functions anon and authenticated may execute;
-- without this line it fails, correctly.
revoke all on function public.repoint_saved_place(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.repoint_saved_place(uuid, uuid, uuid) to service_role;

commit;
