-- 0026_collection_membership_is_not_undone_by_a_link.sql — removal becomes durable.
--
-- WHY. `docs/evidence/security/collections-rls-review-2026-08-29.md` (security-privacy,
-- independent of 0024's author) found two authorisation failures with one root cause. Both were
-- reproduced on the local container before this file was written, with the assertions that land in
-- supabase/tests/0024_collections_policy_tests.sql §C10 translated to 0024's vocabulary:
--
--   FAIL C10a: a DEMOTED collaborator left and re-clicked the editor link and is an editor again
--              (role=editor)
--   FAIL C10b: a REMOVED member re-clicked the same invite link and is back in (role=viewer), with
--              1 of 1 shared places row readable again
--
-- F1 is "removing a member does not remove them": the owner deletes the membership row, the person
-- clicks the same link, and they are back in with the `places` read restored. F2 is the same hole
-- used for escalation: an editor demoted to viewer leaves (0024 permits that), re-clicks the
-- editor link they were originally sent, and is an editor again.
--
-- The single cause is that 0024 records membership as the PRESENCE OF A ROW and ends it by DELETING
-- that row. `on conflict (collection_id, user_id) do nothing` is only a protection while a row
-- exists to conflict with, so ending a membership deletes exactly the evidence that would have
-- refused the rejoin. "I removed them" then silently does not hold, over data that says where a
-- person goes.
--
-- THE MODEL. Membership ENDS, it is not deleted. `collection_members` grows `removed_at` and
-- `removed_by`; every membership predicate gains `removed_at is null`; and `removed_by` is what
-- distinguishes *I left* from *the owner removed me*, because the two must behave differently when
-- an old link is clicked again:
--
--   1. already an active member          -> no-op, return the collection id  (0024's behaviour)
--   2. left voluntarily (removed_by = self) -> rejoin AT THE ROLE HELD WHEN THEY LEFT, ignoring the
--                                           invite's role entirely. This is what closes F2, and it
--                                           is the honest reading of our own copy: "you can rejoin
--                                           with the link" means get your access back, not get
--                                           whatever the oldest link in your chat history says.
--   3. removed by someone else           -> REFUSE. A link never undoes a removal.
--   4. never a member                    -> join at the invite's role            (0024's behaviour)
--
-- Rule 3 raises a DISTINGUISHABLE error where 0024's three token failures are deliberately
-- identical, and that is not a regression of the uniform-failure rule. The uniform message exists
-- so that a stranger holding a guessed token learns nothing; this message can only ever be seen by
-- someone who holds a VALID, live token AND has a membership row in that exact collection, i.e. by
-- a person who was demonstrably a member. It tells them something they already know. It is a
-- distinct SQLSTATE rather than distinct prose so the application can map it to its own copy
-- without parsing a message: `PT403`, which PostgREST also renders as HTTP 403.
--
-- WHY MEMBERSHIP CAN NO LONGER BE ENDED FROM THE CLIENT. The DELETE grant on `collection_members`
-- is revoked and `collection_members_delete_self_or_by_owner` is dropped; ending a membership is
-- now `end_collection_membership`, SECURITY DEFINER, the same posture that already makes membership
-- *creation* definer-only in 0024, for the same reason. Two things would otherwise resurrect a
-- removed person from the browser:
--   * a column-level UPDATE grant on `removed_at` would let them write `null` back into it — so
--     neither new column is grantable, to anyone, for any command; and
--   * with the DELETE grant kept, a removed member could delete their own tombstone (0024's DELETE
--     qual admits `user_id = auth.uid()`) and then rejoin as rule 4, "never a member".
-- The second is the sharper one: it means the tombstone and the revoked DELETE are one control, not
-- two, and keeping the DELETE grant would have made this entire migration decorative.
--
-- RE-ADDING SOMEONE YOU REMOVED. Rule 3 is absolute, so without an owner-side path a removal would
-- be a state the owner cannot get out of. Two owner-only definer functions provide it:
-- `collection_removed_members` lists the ended memberships of a collection you own (the tombstones
-- are invisible through the table — see the SELECT policy below), and
-- `restore_collection_membership` reactivates one at a role the owner chooses. Reactivation is an
-- owner's act in the member list, which is where role changes already live; it is never a
-- consequence of clicking a link.
--
-- WHAT IS DELIBERATELY NOT DONE HERE. The tombstones are hidden from EVERY table read, including
-- the owner's, so no query in `src/` needs a `removed_at is null` filter added to keep behaving
-- correctly: member lists and member counts shed a removed person the moment the row is ended. The
-- alternative — exposing tombstones to the owner through the SELECT policy — would have made the
-- member list show removed people as members until the application was changed to filter them,
-- which is F1's exact symptom re-created by the fix for F1.
--
-- ── F3, a correction to 0024's header, forward-only ────────────────────────────────────────────
-- 0024 justifies the third conjunct of `collection_items_insert_editor` (the `saved_places`
-- EXISTS) as the thing that stops `collection_items` becoming "a read primitive over every place
-- row in the database". That claim is WRONG and is corrected here rather than by editing 0024
-- (`08` §9, forward-only). The conjunct is satisfiable at will: `save_place` is SECURITY INVOKER
-- and `saved_places_insert_own` checks only `user_id = auth.uid()`, so any authenticated user can
-- self-save an arbitrary `place_id` — no readability check anywhere — and then read that row
-- through `places_select_if_saved` (0006). The primitive predates 0024, needs no collection, and is
-- reachable from the browser today via `saveCollectionPlace(placeId)`.
--
-- What the conjunct actually buys is PROVENANCE, and it is still right: you can only put into a
-- shared list something you really saved, so "added by <name>" describes a real act rather than an
-- arbitrary pointer into the global table. The real bound on the `places` read is
-- `places_select_if_saved` plus the unguessability of a uuid, and `places` holds global POI
-- identity — no user's data — which is why the impact is low. Recorded because a comment naming a
-- control that is not the control trains the next reviewer to skip the check.
--
-- Forward-only. Nothing above 0025 is edited.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE TOMBSTONE COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- No grant is issued on either column, for any command, to any role. That is the control that
-- makes a removal durable: `update collection_members set removed_at = null` is refused at the
-- privilege level (42501 permission denied for table), before RLS is consulted and independently of
-- whether any policy here is right.
alter table public.collection_members
  add column removed_at timestamptz,
  -- ON DELETE SET NULL, like `invited_by`: the remover erasing their account must not erase the
  -- removal. A null `removed_by` on an ended row is therefore treated as "removed by someone else"
  -- in join_collection_via_token — the conservative reading, since the one thing a null must never
  -- mean is "you left voluntarily, come back in".
  add column removed_by uuid references public.profiles (id) on delete set null,

  -- The two columns move together or the row is meaningless: `removed_by` set with `removed_at`
  -- null would be a live membership carrying a remover.
  add constraint collection_members_removal_is_whole
    check (removed_by is null or removed_at is not null);

comment on column public.collection_members.removed_at is
  'When this membership ended. NULL = active. A membership is ended, never deleted, so that an '
  'invite link cannot undo a removal by re-inserting the row it deleted.';
comment on column public.collection_members.removed_by is
  'Who ended it: equal to user_id means the member left voluntarily (and may rejoin with a link, at '
  'the role they held); anyone else means they were removed (and a link must refuse them). NULL on '
  'an ended row means the remover erased their account, and is read as "removed by someone else".';

-- Both indexes become partial. The unique one is the important one — "exactly one owner per
-- collection" must count only LIVE owners, or a future ownership transfer that ends the old
-- owner's row would be refused by a tombstone. The other simply stops "collections shared with me"
-- scanning rows that are no longer memberships.
drop index public.collection_members_one_owner_idx;
create unique index collection_members_one_owner_idx
  on public.collection_members (collection_id) where role = 'owner' and removed_at is null;

drop index public.collection_members_user_idx;
create index collection_members_user_idx
  on public.collection_members (user_id, joined_at desc) where removed_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. EVERY MEMBERSHIP PREDICATE GAINS `removed_at is null`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- These four are the whole membership vocabulary of the schema: `collection_role` answers the
-- collections / collection_members / collection_items / collection_invites policies (directly or
-- through can_edit_collection), `place_is_in_my_collection` is the `places` read path and
-- `shares_a_collection_with` is the `profiles` peer read. Miss one and an ended member keeps
-- exactly the access it gates. Bodies are otherwise 0024's, unchanged.

create or replace function public.collection_role(p_collection uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select cm.role
    from public.collection_members cm
   where cm.collection_id = p_collection
     and cm.user_id = (select auth.uid())
     and cm.removed_at is null
$fn$;

-- can_edit_collection is unchanged: it delegates to collection_role and inherits the filter.

create or replace function public.place_is_in_my_collection(p_place uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.collection_items ci
      join public.collection_members cm on cm.collection_id = ci.collection_id
     where ci.place_id = p_place
       and cm.user_id = (select auth.uid())
       and cm.removed_at is null
  )
$fn$;

-- BOTH sides filtered. `mine.removed_at is null` is what takes the peer read away from a removed
-- person; `theirs.removed_at is null` is what stops a live member reading the profile of someone
-- who has left or been removed.
create or replace function public.shares_a_collection_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.collection_members mine
      join public.collection_members theirs on theirs.collection_id = mine.collection_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user
       and mine.removed_at is null
       and theirs.removed_at is null
  )
$fn$;

-- CREATE OR REPLACE preserves privileges, so no grant changes hands here. Re-issued anyway, for the
-- reason 0024 gives at the foot of save_place: the pair must travel with the definition, because
-- the day one of these needs a signature change it will be DROP + CREATE and will silently inherit
-- PUBLIC EXECUTE again (0009's bug, twice).
revoke all on function public.collection_role(uuid)           from public, anon, authenticated;
revoke all on function public.place_is_in_my_collection(uuid) from public, anon, authenticated;
revoke all on function public.shares_a_collection_with(uuid)  from public, anon, authenticated;
grant execute on function public.collection_role(uuid)           to authenticated;
grant execute on function public.place_is_in_my_collection(uuid) to authenticated;
grant execute on function public.shares_a_collection_with(uuid)  to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE MEMBERSHIP TABLE'S GRANTS AND POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- DELETE goes away entirely. It was the client's only way to end a membership and it is now also a
-- resurrection path (see the header), so the policy AND the grant both go: a policy left behind
-- with no grant advertises a capability the schema does not have.
drop policy collection_members_delete_self_or_by_owner on public.collection_members;
revoke delete on public.collection_members from anon, authenticated, service_role;

-- Tombstones are invisible through the table, to everyone including the owner. A member list and a
-- member count therefore shed a removed person immediately, with no filter added anywhere in the
-- application. The owner reaches ended memberships through collection_removed_members below.
drop policy collection_members_select_member on public.collection_members;
create policy collection_members_select_member on public.collection_members
  for select to authenticated
  using (removed_at is null and public.collection_role(collection_id) is not null);

-- The owner may still move a live collaborator between editor and viewer. `removed_at is null` in
-- the qual keeps that motion off ended rows: changing the role recorded on a tombstone would
-- silently choose the role a voluntary leaver comes back at, which is a rule-2 side effect nobody
-- asked for. Reactivating and choosing a role is restore_collection_membership's job, and it is
-- explicit.
drop policy collection_members_update_by_owner on public.collection_members;
create policy collection_members_update_by_owner on public.collection_members
  for update to authenticated
  using      (public.collection_role(collection_id) = 'owner'
              and role <> 'owner' and removed_at is null)
  with check (public.collection_role(collection_id) = 'owner'
              and role in ('editor', 'viewer'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. ENDING A MEMBERSHIP
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One function for both motions, exactly as 0024's dropped DELETE policy was one policy for both:
-- `p_user = auth.uid()` is leaving, anything else is a removal and requires ownership. The owner's
-- own row can never be ended by either motion — that is what keeps the collection from being
-- orphaned and the one-owner index from pointing at nothing. An owner's exit is still deleting the
-- collection; ownership transfer remains unbuilt (see §3 of the security review).
--
-- EVERY refusal is the same SQLSTATE and the same message, deliberately. "You are not the owner",
-- "there is no such member", "that collection does not exist" and "that is the owner's row" are
-- four different facts about a collection the caller may have no access to at all, and a caller who
-- can tell them apart can probe membership of arbitrary collections. 42501 because the honest
-- answer to all four is "not permitted", and because PostgREST already maps it to HTTP 403.
create or replace function public.end_collection_membership(p_collection uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid         uuid := (select auth.uid());
  v_caller_role text;
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The caller must be an ACTIVE member. A removed person cannot end anyone's membership,
  -- including their own tombstone.
  select cm.role into v_caller_role
    from public.collection_members cm
   where cm.collection_id = p_collection and cm.user_id = v_uid and cm.removed_at is null;

  select cm.role into v_target_role
    from public.collection_members cm
   where cm.collection_id = p_collection and cm.user_id = p_user and cm.removed_at is null;

  if v_caller_role is null                                        -- not a member here
     or v_target_role is null                                     -- no such active member
     or v_target_role = 'owner'                                   -- the owner's row is immovable
     or (p_user is distinct from v_uid and v_caller_role <> 'owner')  -- only the owner removes others
  then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.collection_members
     set removed_at = now(),
         removed_by = v_uid
   where collection_id = p_collection and user_id = p_user and removed_at is null;
end;
$fn$;

revoke all on function public.end_collection_membership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.end_collection_membership(uuid, uuid) to authenticated;

comment on function public.end_collection_membership(uuid, uuid) is
  'Ends a membership: leaving (p_user = auth.uid(), any non-owner role) or removal (owner only). '
  'Sets removed_at/removed_by rather than deleting the row, so an old invite link cannot undo it. '
  'Raises 42501 "not permitted", uniformly, for every refusal. Replaces the DELETE grant 0024 had '
  'on collection_members, which is revoked.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE OWNER'S WAY BACK
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Rule 3 is absolute, so the owner needs a way to bring back someone they removed, and a way to
-- find them: the tombstone is invisible through the table. Both are owner-only.
--
-- Zero rows for a non-owner and zero rows for a collection that does not exist — indistinguishable,
-- so this is not an existence oracle. Everything it returns is a fact about a collection the caller
-- owns, and `display_name` is a peer profile the owner could read while the person was a member.
create or replace function public.collection_removed_members(p_collection uuid)
returns table (
  user_id          uuid,
  display_name     text,
  role             text,
  removed_at       timestamptz,
  left_voluntarily boolean
)
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select cm.user_id,
         pr.display_name,
         cm.role,
         cm.removed_at,
         cm.removed_by is not distinct from cm.user_id
    from public.collection_members cm
    left join public.profiles pr on pr.id = cm.user_id
   where cm.collection_id = p_collection
     and cm.removed_at is not null
     and public.collection_role(p_collection) = 'owner'
   order by cm.removed_at desc
$fn$;

revoke all on function public.collection_removed_members(uuid) from public, anon, authenticated;
grant execute on function public.collection_removed_members(uuid) to authenticated;

comment on function public.collection_removed_members(uuid) is
  'Ended memberships of a collection the caller owns, newest first; zero rows for anyone else. The '
  'tombstones are hidden from the table itself, so this is the only way to see who was removed — '
  'and the input to restore_collection_membership.';

-- Reactivation, at a role the OWNER chooses. Not a link, not the leaver, not the invite: putting
-- someone back is the same kind of act as changing their role, and it lives in the same place.
-- `joined_at` is moved to now() because the row is a membership that starts today; "shared with me,
-- newest first" would otherwise sort a rejoin by a date the person was not a member on.
create or replace function public.restore_collection_membership(
  p_collection uuid,
  p_user       uuid,
  p_role       text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Same uniform refusal as end_collection_membership, and the same reason. `p_role = 'owner'` is
  -- refused here too: a second owner is not a thing this function may create, independently of the
  -- unique index that would refuse the row.
  if public.collection_role(p_collection) is distinct from 'owner'
     or p_role not in ('editor', 'viewer')
     or not exists (select 1 from public.collection_members cm
                     where cm.collection_id = p_collection
                       and cm.user_id = p_user
                       and cm.removed_at is not null)
  then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.collection_members
     set role       = p_role,
         removed_at = null,
         removed_by = null,
         joined_at  = now()
   where collection_id = p_collection and user_id = p_user and removed_at is not null;
end;
$fn$;

revoke all on function public.restore_collection_membership(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.restore_collection_membership(uuid, uuid, text) to authenticated;

comment on function public.restore_collection_membership(uuid, uuid, text) is
  'Owner-only: reactivates an ended membership at ''editor'' or ''viewer''. The only way back in for '
  'someone who was removed — an invite link never is. Raises 42501 "not permitted" uniformly.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. REDEEMING AN INVITE — the four rules
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.join_collection_via_token(p_token uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid       uuid := (select auth.uid());
  v_invite    public.collection_invites;
  v_member    public.collection_members;
  v_was_a_row boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ci.* into v_invite
    from public.collection_invites ci
   where ci.token = p_token
     and ci.revoked_at is null
     and (ci.expires_at is null or ci.expires_at > now());

  -- 0024's rule, unchanged: ONE message for no-such-token, revoked and expired. A caller who can
  -- tell them apart can enumerate which tokens ever existed.
  if not found then
    raise exception 'this invite link is not usable' using errcode = '22023';
  end if;

  select cm.* into v_member
    from public.collection_members cm
   where cm.collection_id = v_invite.collection_id and cm.user_id = v_uid;
  v_was_a_row := found;

  -- RULE 1 — already in. Idempotent, and non-destructive on purpose: redeeming a viewer link while
  -- an editor must not demote, and the owner clicking their own link must not lock themselves out.
  if v_was_a_row and v_member.removed_at is null then
    return v_invite.collection_id;
  end if;

  if v_was_a_row then
    -- RULE 3 — removed by someone else. A link never undoes a removal, and a null removed_by (the
    -- remover erased their account) is read as removal, not as leaving.
    if v_member.removed_by is distinct from v_uid then
      raise exception 'you are no longer a member of this collection'
        using errcode = 'PT403';
    end if;

    -- RULE 2 — left voluntarily. Back in AT THE ROLE HELD WHEN THEY LEFT: `role` is deliberately
    -- not assigned below. This is what closes F2 — an editor demoted to viewer who leaves and
    -- re-clicks the original editor link comes back a viewer, because the invite's role is not
    -- consulted at all on this path.
    update public.collection_members
       set removed_at = null,
           removed_by = null,
           joined_at  = now()
     where collection_id = v_invite.collection_id and user_id = v_uid;
    return v_invite.collection_id;
  end if;

  -- RULE 4 — never a member. Join at the invite's role. ON CONFLICT is kept as the concurrency
  -- guard it always was (two tabs, one link): the row can only appear between the select above and
  -- this insert, and if it does, the redemption is a no-op rather than an error.
  insert into public.collection_members (collection_id, user_id, role, invited_by)
  values (v_invite.collection_id, v_uid, v_invite.role, v_invite.created_by)
  on conflict (collection_id, user_id) do nothing;

  return v_invite.collection_id;
end;
$fn$;

revoke all on function public.join_collection_via_token(uuid) from public, anon, authenticated;
grant execute on function public.join_collection_via_token(uuid) to authenticated;

-- `already_member` must mean "has a live membership", or the join screen skips itself for someone
-- who was removed and shows them a collection they cannot read. Body is otherwise 0024's.
create or replace function public.preview_collection_invite(p_token uuid)
returns table (
  collection_id   uuid,
  collection_name text,
  inviter_name    text,
  role            text,
  already_member  boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select c.id,
           c.name,
           pr.display_name,
           ci.role,
           exists (select 1 from public.collection_members cm
                    where cm.collection_id = c.id
                      and cm.user_id = v_uid
                      and cm.removed_at is null)
      from public.collection_invites ci
      join public.collections c on c.id = ci.collection_id
      left join public.profiles pr on pr.id = ci.created_by
     where ci.token = p_token
       and ci.revoked_at is null
       and (ci.expires_at is null or ci.expires_at > now());
end;
$fn$;

revoke all on function public.preview_collection_invite(uuid) from public, anon, authenticated;
grant execute on function public.preview_collection_invite(uuid) to authenticated;

commit;
