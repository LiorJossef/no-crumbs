-- supabase/seed.sql — local-dev-only mock data, loaded automatically after every migration on
-- `supabase db reset` (config.toml's `[db.seed]`). Everything below is fabricated: no real TikTok
-- import pipeline exists yet (L0-F4 is paused, `docs/execution-plan.md`), so these are placeholder
-- posts/places, not real data (see memory `p002-mobile-first-map-switch-pending`). This file only
-- ever runs against the local stack — nothing here touches staging or production.
--
-- Creates one demo user (demo@example.com / local-dev-preview-1234, matching the app's local-dev
-- sign-in convention) and gives it a handful of saved places, each wired through the *real*
-- provenance chain the schema requires: a `sources` row (one fake TikTok "video", with the same
-- kind of metadata a real fetch would populate — caption, author, thumbnail) -> an `imports` row
-- -> a `places` row (+ its required `place_provider_refs` alias) -> a `saved_places` row ->
-- a `saved_place_sources` link. This is the only way to get a row into `saved_places` at all:
-- 0006's deferred trigger rejects an origin='import' save with no linked source.
--
-- Each save also carries the `0019` enrichment — `tags`, `why_go`, `dishes` — because the tag
-- chips filter both the list and the pins, and without seeded tags a freshly reset database has
-- literally nothing for a tag-filtering test (or a human clicking around) to discover. The values
-- are written in the SAME canonical form the application writes: `normalize_tag_list()` is a no-op
-- on them, so what is seeded is what a real extraction would have stored, not a shape only the
-- database would accept. See `src/domain/extraction/tags.ts` — lowercase, no punctuation, no
-- accents, 2..28 characters, at most five per save.
--
-- Hebrew tags are seeded deliberately, not decoratively: he<->en is the language scope this
-- product promises (`docs/current-state.md` §4), and a Hebrew tag is the one that exercises the
-- bidi isolate on the chip, the RTL label inside an LTR accessible name on the dismiss pill, and
-- `tagKey` equality across a click handler. A fixture with only ASCII tags cannot check any of it.

-- ---------------------------------------------------------------------------------------------
-- The demo user. Inserted directly into auth.users (local-dev only — the hosted projects have no
-- equivalent seed) rather than via the admin API, so this file alone is enough to reproduce it.
-- `handle_new_user` (0002) fires on this insert and creates the matching `public.profiles` row.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'demo@example.com',
  crypt('local-dev-preview-1234', gen_salt('bf')),
  now(), '', '',
  -- Unlike confirmation_token/recovery_token, these two have no column default (NULL), and
  -- GoTrue's Go driver fails password sign-in with "converting NULL to string is unsupported"
  -- when scanning a NULL here — must be set explicitly to '' rather than left to insert defaults.
  '', '',
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}',
  now(), now()
)
-- `on conflict (email)` alone can't infer `users_email_partial_key` (auth.users' actual email
-- uniqueness, a partial index `WHERE is_sso_user = false` — not a plain unique constraint on the
-- column) — the inference target's predicate has to match exactly, or Postgres raises 42P10.
on conflict (email) where is_sso_user = false do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email = 'demo@example.com'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- ---------------------------------------------------------------------------------------------
-- Mock saved places. Each entry is one fake TikTok post ("video") plus the place it recommends.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  v_source_id uuid;
  v_import_id uuid;
  v_place_id uuid;
  v_saved_id uuid;
  v_canonical_url text;

  -- `platform_source_id` must be 17-20 digits (0003's CHECK) and globally unique per post.
  -- `caption` stands in for `content_text` — the real column a fetch would populate from the
  -- post's own text, server-side only (0003 R8: never granted to `authenticated`).
  v_spots jsonb := '[
    {
      "pid": "70000000000000001", "ppid": "demo-1",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "grab the sourdough at anat bakery, worth the queue",
      "thumb": null,
      "name": "Anat Bakery", "category": "bakery", "addr": "3 Shabazi St",
      "lat": 32.0596, "lng": 34.7654,
      "tags": ["bakery", "מאפייה", "morning"],
      "dishes": ["sourdough loaf"],
      "whyGo": "The sourdough is worth the queue."
    },
    {
      "pid": "70000000000000002", "ppid": "demo-2a",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "ended the night at container, rooftop view of the port",
      "thumb": null,
      "name": "Container", "category": "bar", "addr": "43 Retzif Ha''Aliya Hashniya St",
      "lat": 32.0524, "lng": 34.7498,
      "tags": ["rooftop", "late night", "port view"],
      "dishes": [],
      "whyGo": "A rooftop bar looking out over the old port."
    },
    {
      "pid": "70000000000000003", "ppid": "demo-3",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "flat white and a window seat on rothschild, come early",
      "thumb": "https://commons.wikimedia.org/wiki/Special:FilePath/Interior%20Johnie%27s%20Coffee%20Shop%202021.jpg",
      "name": "Nordoy Café", "category": "cafe", "addr": "27 Rothschild Blvd",
      "lat": 32.0668, "lng": 34.7749,
      "tags": ["coffee", "בית קפה", "brunch"],
      "dishes": ["flat white"],
      "whyGo": "Come early if you want the window seat on Rothschild."
    },
    {
      "pid": "70000000000000004", "ppid": "demo-4",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "florentin''s best cortado, tiny place easy to miss",
      "thumb": "https://commons.wikimedia.org/wiki/Special:FilePath/420%20Cafe%20Coffeeshop%2C%20Amsterdam.jpg",
      "name": "Café Florentin", "category": "cafe", "addr": "12 Vital St",
      "lat": 32.0554, "lng": 34.7686,
      "tags": ["coffee", "hidden gem"],
      "dishes": ["cortado"],
      "whyGo": "A tiny place, easy to walk straight past."
    },
    {
      "pid": "70000000000000005", "ppid": "demo-5",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "neve tzedek coffee break between the boutiques",
      "thumb": "https://commons.wikimedia.org/wiki/Special:FilePath/Van%20Houtte%20Coffee%20Shop.jpg",
      "name": "Neve Tzedek Coffee House", "category": "cafe", "addr": "8 Shabazi St",
      "lat": 32.0587, "lng": 34.7625,
      "tags": ["coffee", "בית קפה", "quiet"],
      "dishes": [],
      "whyGo": "A coffee break between the Neve Tzedek boutiques."
    },
    {
      "pid": "70000000000000006", "ppid": "demo-6",
      "handle": "tlv.eats", "author": "TLV Eats",
      "caption": "old north espresso bar, best oat milk in the area",
      "thumb": "https://commons.wikimedia.org/wiki/Special:FilePath/777%20Coffee%20Shop.jpg",
      "name": "Old North Espresso Bar", "category": "cafe", "addr": "55 Ben Gurion Blvd",
      "lat": 32.0870, "lng": 34.7749,
      "tags": ["coffee", "oat milk", "espresso bar"],
      "dishes": ["oat flat white"],
      "whyGo": "The best oat milk in the old north."
    }
  ]'::jsonb;
  v_spot jsonb;
begin
  select id into v_user_id from auth.users where email = 'demo@example.com';

  -- Idempotency guard: this block has no per-statement conflict handling (the `pid` literals
  -- above are fixed, so a bare re-run would hit `sources_platform_identity`'s unique constraint
  -- and abort with a half-seeded DB). Running `psql -f seed.sql` twice against the same database
  -- — not just `supabase db reset`, which starts from empty — must be a true no-op once the demo
  -- user already has its saved places, so skip the whole loop in that case.
  if exists (select 1 from public.saved_places where user_id = v_user_id) then
    return;
  end if;

  for v_spot in select * from jsonb_array_elements(v_spots)
  loop
    v_canonical_url := 'https://www.tiktok.com/@' || (v_spot->>'handle') || '/video/' || (v_spot->>'pid');

    insert into public.sources (platform, platform_source_id, canonical_url, author_handle,
                                 author_name, content_text, thumbnail_url, fetch_status, fetched_at)
    values ('tiktok', v_spot->>'pid', v_canonical_url,
            v_spot->>'handle', v_spot->>'author', v_spot->>'caption', v_spot->>'thumb',
            'ok', now())
    returning id into v_source_id;

    insert into public.imports (user_id, source_id, status, stage, completed_at)
    values (v_user_id, v_source_id, 'completed', 'done', now())
    returning id into v_import_id;

    insert into public.places (name, category, provider_category, address_line, locality,
                                country_code, lat, lng, provider_fetched_at)
    values (v_spot->>'name', v_spot->>'category', v_spot->>'category', v_spot->>'addr',
            'Tel Aviv-Yafo', 'IL',
            (v_spot->>'lat')::double precision, (v_spot->>'lng')::double precision, now())
    returning id into v_place_id;

    insert into public.place_provider_refs (place_id, provider, provider_place_id, is_primary)
    values (v_place_id, 'overture', v_spot->>'ppid', true);

    -- source_url/source_thumbnail_url set directly here rather than via
    -- apply_saved_place_source_link() (0016): that helper is SECURITY DEFINER but still requires
    -- auth.uid() = saved_places.user_id, and this script runs as postgres with no auth session —
    -- so it would raise 'not authenticated'. Seed.sql already writes directly to every other
    -- privileged table in this chain, so setting the two denormalized columns to exactly what the
    -- helper would derive (this loop's single source is each place's first and only one) keeps the
    -- same first-source-only semantics without needing an auth context.
    -- `tags` / `dishes` are written directly rather than through apply_saved_place_extraction()
    -- (0019) for the same reason the two source_* columns above are: that helper is service_role
    -- only AND coalesce-only ("first writer wins"), and this script has no auth session. The
    -- values are already canonical, so 0019's normalising trigger is a no-op on them and the two
    -- CHECKs pass unchanged — if either ever stops being true, this insert fails loudly on the
    -- next `db reset` rather than seeding a shape the app could not have produced.
    -- `nullif(..., '{}')` matters: NULL is the ONLY empty state for these columns (0019's header),
    -- and an empty array is not storable.
    insert into public.saved_places (user_id, place_id, origin, visit_state,
                                      source_url, source_thumbnail_url,
                                      tags, why_go, dishes)
    values (v_user_id, v_place_id, 'import', 'want_to_go',
            v_canonical_url, v_spot->>'thumb',
            nullif(array(select jsonb_array_elements_text(v_spot->'tags')), '{}'::text[]),
            v_spot->>'whyGo',
            nullif(array(select jsonb_array_elements_text(v_spot->'dishes')), '{}'::text[]))
    returning id into v_saved_id;

    insert into public.saved_place_sources (saved_place_id, source_id, user_id)
    values (v_saved_id, v_source_id, v_user_id);
  end loop;
end $$;
