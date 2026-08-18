-- 0006_saved_places.sql — the user's library, its provenance, and the cross-table membership gates.
-- Design: docs/08-place-identity.md §3.6. Unchanged by §14.

-- The user's library entry: user <-> place, plus everything the user may edit.
create table public.saved_places (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  place_id          uuid not null references public.places (id)   on delete restrict,

  -- Per-user overlay. Editing these never touches the shared places row (08 §2.2 rule 3).
  display_name      text check (display_name is null or length(btrim(display_name)) between 1 and 200),
  category_override text,
  note              text check (note is null or length(note) <= 2000),
  visit_state       text not null default 'want_to_go'
                      check (visit_state in ('want_to_go', 'visited')),
  visited_at        timestamptz,

  origin            text not null check (origin in ('import', 'manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- No duplicate save of one place by one user (acceptance I3).
  constraint saved_places_user_place_unique unique (user_id, place_id),
  -- Target for the composite FK below, which makes user_id drift on the join table impossible.
  constraint saved_places_id_user_unique unique (id, user_id),
  constraint saved_places_visited_at_consistent
    check (visit_state = 'visited' or visited_at is null)
);

create trigger saved_places_touch before update on public.saved_places
  for each row execute function public.touch_updated_at();

-- Provenance: which source(s) recommended this saved place. Many sources per saved place
-- (charter §3: one physical place recommended by three TikToks is one place with three sources).
create table public.saved_place_sources (
  saved_place_id uuid not null,
  source_id      uuid not null references public.sources (id) on delete restrict,
  user_id        uuid not null,
  added_at       timestamptz not null default now(),

  primary key (saved_place_id, source_id),
  -- Composite FK: the row's user_id must equal the owning saved place's user_id, enforced by the
  -- database rather than by convention. This is what lets the RLS policy below be a single
  -- column comparison with no subquery.
  constraint sps_owner_fk foreign key (saved_place_id, user_id)
    references public.saved_places (id, user_id) on delete cascade
);
create index sps_source_idx on public.saved_place_sources (source_id, user_id);
create index sps_user_idx   on public.saved_place_sources (user_id);

-- Provenance invariant, deferred to COMMIT because the child row is inserted after the parent:
-- origin='import' implies at least one source, forever.
create or replace function public.assert_saved_place_provenance() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_saved_place_id uuid;
  v_origin text;
begin
  v_saved_place_id := case tg_table_name
    when 'saved_places'        then coalesce(new.id, old.id)
    when 'saved_place_sources' then coalesce(new.saved_place_id, old.saved_place_id)
  end;

  select origin into v_origin from public.saved_places where id = v_saved_place_id;
  if v_origin is null or v_origin = 'manual' then
    return null;                                    -- deleted, or manual: nothing to assert
  end if;

  if not exists (select 1 from public.saved_place_sources
                  where saved_place_id = v_saved_place_id) then
    raise exception 'saved_place % has origin=import but no source; provenance is permanent (charter 3.3)',
      v_saved_place_id using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger saved_places_provenance_required
  after insert or update of origin on public.saved_places
  deferrable initially deferred
  for each row execute function public.assert_saved_place_provenance();

create constraint trigger sps_provenance_preserved
  after delete on public.saved_place_sources
  deferrable initially deferred
  for each row execute function public.assert_saved_place_provenance();
-- Consequence, intended: a user may detach one of three sources, but not the last one. To remove
-- the final source you delete the saved place. "Which TikTok made me save this?" never becomes
-- unanswerable for a place that came from a TikTok.

create index saved_places_user_recent_idx on public.saved_places (user_id, created_at desc);
create index saved_places_place_user_idx  on public.saved_places (place_id, user_id);
--                                          ^ serves the places/ppr RLS membership EXISTS lookups,
--                                            which lead on place_id and are not served by the
--                                            (user_id, place_id) unique index.

alter table public.saved_places        enable row level security;
alter table public.saved_places        force  row level security;
alter table public.saved_place_sources enable row level security;
alter table public.saved_place_sources force  row level security;

revoke all on public.saved_places        from anon;
revoke all on public.saved_place_sources from anon;

grant select, insert, delete on public.saved_places to authenticated;
-- Column-level UPDATE grant: the user may edit their overlay and nothing else. user_id, place_id
-- and origin are not grantable, so "move my save onto someone else's place" or "give my save away"
-- are not expressible, independently of RLS.
grant update (display_name, category_override, note, visit_state, visited_at)
  on public.saved_places to authenticated;

grant select, insert, delete on public.saved_place_sources to authenticated;
-- No UPDATE grant: a provenance link is created or removed, never edited.

create policy saved_places_select_own on public.saved_places
  for select to authenticated using (user_id = (select auth.uid()));
create policy saved_places_insert_own on public.saved_places
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy saved_places_update_own on public.saved_places
  for update to authenticated using (user_id = (select auth.uid()))
                                with check (user_id = (select auth.uid()));
create policy saved_places_delete_own on public.saved_places
  for delete to authenticated using (user_id = (select auth.uid()));

create policy sps_select_own on public.saved_place_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy sps_insert_own on public.saved_place_sources
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- the source must be one this user actually imported: no borrowing provenance
    and exists (select 1 from public.imports i
                 where i.source_id = saved_place_sources.source_id
                   and i.user_id = (select auth.uid()))
  );
create policy sps_delete_own on public.saved_place_sources
  for delete to authenticated using (user_id = (select auth.uid()));

-- Cross-table membership gates, created here because they name `saved_places` and CREATE POLICY
-- resolves table references at creation time. Until this point `places` and `place_provider_refs`
-- were deny-all (0005).
create policy places_select_if_saved on public.places
  for select to authenticated
  using (exists (select 1 from public.saved_places sp
                  where sp.place_id = places.id and sp.user_id = (select auth.uid())));

create policy ppr_select_if_place_saved on public.place_provider_refs
  for select to authenticated
  using (exists (select 1 from public.saved_places sp
                  where sp.place_id = place_provider_refs.place_id
                    and sp.user_id = (select auth.uid())));

-- Extend the sources gate now that saved_place_sources exists (see the 0003 note).
drop policy if exists sources_select_via_membership on public.sources;
create policy sources_select_via_membership on public.sources
  for select to authenticated
  using (
    exists (select 1 from public.imports i
             where i.source_id = sources.id and i.user_id = (select auth.uid()))
    or exists (select 1 from public.saved_place_sources sps
                where sps.source_id = sources.id and sps.user_id = (select auth.uid()))
  );
