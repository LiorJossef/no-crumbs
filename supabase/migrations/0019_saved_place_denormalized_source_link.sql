-- 0016_saved_place_denormalized_source_link.sql — surface "which TikTok, with what thumbnail"
-- directly on saved_places, without weakening the one-place/many-sources provenance model.
--
-- PROBLEM. Charter invariant 3 ("the source URL survives forever, `which TikTok made me save
-- this?` is always answerable") is already satisfied structurally: `saved_place_sources` links a
-- saved place to every source that recommended it, and `sources.canonical_url` /
-- `sources.thumbnail_url` are readable by `authenticated` (0003) wherever RLS membership holds.
-- What's missing is a *cheap* read path: today, "TikTok link + thumbnail for this saved place"
-- costs a join through `saved_place_sources` into `sources`, for data that is read on every place
-- card. This migration denormalizes the CURRENT product need (info = name, category, coordinates,
-- source link, note — charter §4 capability 12) without inventing new domain concepts.
--
-- SCOPE. A saved place can have many sources (charter invariant 4: one physical place, many
-- TikToks). Denormalizing "the" link is therefore explicitly the FIRST source that caused this
-- place to enter the user's library, not a rollup of all of them — the same "which TikTok made me
-- save this" question the charter asks, answered for the save event itself. Anyone who later adds
-- a second TikTok for the same place still gets a real `saved_place_sources` row (unchanged); the
-- denormalized columns are a display cache, not the provenance record — `saved_place_sources`
-- remains the source of truth for "all TikToks that ever recommended this place to this user".
--
-- Manual saves (`origin = 'manual'`) have no source at all, so both columns are nullable and stay
-- null for them, same nullability posture as `extracted_reason` (0015).
alter table public.saved_places
  add column source_url           text
    check (source_url is null or source_url ~ '^https://'),
  add column source_thumbnail_url text;

comment on column public.saved_places.source_url is
  'Denormalized copy of sources.canonical_url for the FIRST source attached to this saved place, '
  'applied once by apply_saved_place_source_link() right after save_place() creates the '
  'saved_place_sources row, so the place card never needs that join for the common case. Null for '
  'origin=manual. Never overwritten when a later source is attached to the same saved place (the '
  'join table is the full provenance list); system-derived only — no client INSERT/UPDATE grant on '
  'this column exists, matching extracted_reason (0015).';
comment on column public.saved_places.source_thumbnail_url is
  'Denormalized copy of sources.thumbnail_url, same first-source-only semantics as source_url. '
  'KNOWN LIMITATION, accepted as out of scope here: this is TikTok''s signed CDN URL and expires '
  '(~6 months, per 0003''s comment on sources.thumbnail_url). This column is captured once and does '
  'not refresh; a stale/expired thumbnail on an old save degrades to a broken image, not a data '
  'error. Refreshing it (e.g. re-deriving from sources on read, or a background re-sign job) is '
  'left for a future task — this migration only makes the link/thumbnail persist and read cleanly '
  'at save time, matching "source link" in the fixed L0 info set (charter §4 capability 12).';

-- No INSERT/UPDATE grant is added for these two columns, on either statement, for `authenticated`
-- (0015's closed column list on saved_places is left exactly as it was). If they were client
-- insertable, a user could set an arbitrary "source_url" string on their own row, which is exactly
-- the honesty-of-provenance problem 0015 already ruled on for `extracted_reason`. Instead, a
-- narrow SECURITY DEFINER helper (below) is the only writer, and it derives the value itself from
-- `sources` by an id, never accepting the URL text as an argument.
--
-- apply_saved_place_source_link: sets source_url/source_thumbnail_url from a source that is
-- ALREADY linked to the saved place via saved_place_sources, owned by the calling user. That
-- existence check is what keeps this from being a privilege-escalation shortcut: SECURITY DEFINER
-- bypasses RLS on both tables it touches, so it must enforce ownership itself rather than lean on
-- policies. `coalesce` on both sides of the SET is the first-source-only rule from the migration
-- header: once populated, a later call (a second source added to the same place) is a no-op.
create or replace function public.apply_saved_place_source_link(
  p_saved_place_id uuid,
  p_source_id      uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update saved_places sp
     set source_url           = coalesce(sp.source_url, src.canonical_url),
         source_thumbnail_url = coalesce(sp.source_thumbnail_url, src.thumbnail_url)
    from sources src
   where sp.id = p_saved_place_id
     and sp.user_id = v_uid
     and src.id = p_source_id
     and exists (
       select 1 from saved_place_sources sps
        where sps.saved_place_id = sp.id
          and sps.source_id      = src.id
          and sps.user_id        = v_uid
     );
end;
$fn$;

revoke all on function public.apply_saved_place_source_link(uuid, uuid)
  from public, anon;
grant execute on function public.apply_saved_place_source_link(uuid, uuid) to authenticated;
-- Safe to expose directly, not just via save_place: the WHERE clause above already requires the
-- calling user to own both the saved_place and a saved_place_sources row proving that exact
-- (saved_place, source) pair is theirs, so calling it a second time, out of order, or with someone
-- else's ids either does nothing (no matching row) or repeats a no-op coalesce.

-- save_place: same signature and SECURITY INVOKER posture (comment at its original definition in
-- 0007 still holds — atomicity without elevation) — that posture is exactly why the two new
-- columns are not written inline here: an invoker-mode INSERT is bound by `authenticated`'s own
-- column grants, which deliberately do not cover source_url/source_thumbnail_url. Once the
-- saved_place row and its saved_place_sources link both exist, hand off to the definer helper
-- above to fill them in.
create or replace function public.save_place(
  p_place_id  uuid,
  p_source_id uuid default null,          -- null => manual addition (acceptance A1)
  p_note      text default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into saved_places (user_id, place_id, origin, note)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note)
  -- Only granted columns may appear here: `authenticated` holds UPDATE on the overlay columns
  -- only, and the touch trigger maintains updated_at.
  on conflict (user_id, place_id)
    do update set note = coalesce(excluded.note, saved_places.note)
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;               -- re-importing the same post twice: idempotent

    -- First-source-only cache fill; no-op past the first call for this saved place (see the
    -- function's own coalesce and the migration header).
    perform public.apply_saved_place_source_link(v_id, p_source_id);
  end if;

  return v_id;
end;
$fn$;

grant execute on function public.save_place(uuid, uuid, text) to authenticated;
revoke all on function public.save_place(uuid, uuid, text) from anon;

-- RLS check: no new policy needed. saved_places_select_own / _insert_own / _update_own / _delete_own
-- (0006) key on `user_id = auth.uid()` only and do not enumerate columns, so they already cover
-- source_url/source_thumbnail_url exactly like every other column on the same row for SELECT. The
-- columns are not in any INSERT/UPDATE grant for `authenticated`, so the RLS `WITH CHECK` clauses
-- never even see a client-supplied value for them — the only writer is the SECURITY DEFINER helper
-- above, which enforces its own ownership check in lieu of RLS. Nothing to add here.
