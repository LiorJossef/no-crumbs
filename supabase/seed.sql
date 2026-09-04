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

-- ---------------------------------------------------------------------------------------------
-- A collection, with places in it. Added 2026-09-04 for the CI e2e run, which is the only
-- consumer that has ever needed it: `tests/e2e/collections-index-is-the-sheet.spec.ts` waits for
-- the `Yours` section heading and `tests/e2e/collection-one-back-control.spec.ts` opens "the first
-- collection", and until now `db reset` produced a database with zero `collections` rows — so both
-- specs measured an empty index rather than the screen they are about. They passed locally only
-- because the developer's own database happened to hold collections a human had made.
--
-- It has places in it, and that is a requirement rather than decoration: the index row's
-- accessible name is built by `placeCountLabel()` (`src/app/map/collections-index-list.tsx`),
-- which reads `No places yet` at zero — and the back-control spec finds the row it opens with
-- `/\d+ places?/`, which that string does not match. An empty collection is a different screen.
-- Two rather than one so the row also exercises the plural, and so the collection has a second
-- place to open after the first.
--
-- `collection_members` is NOT inserted here. `collections_owner_membership` (0024) is an AFTER
-- INSERT trigger that seats the owner, and it runs for this insert like any other — writing the
-- membership row by hand would either duplicate it or, worse, hide the day that trigger stops
-- firing. Same reasoning as the `handle_new_user` note above.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  -- Fixed, so the fixture is the same row on every reset and a failure screenshot can be looked up.
  v_collection_id constant uuid := '5eed0000-0000-4000-8000-00000000c011';
begin
  select id into v_user_id from auth.users where email = 'demo@example.com';
  if v_user_id is null then return; end if;

  insert into public.collections (id, owner_id, name, description)
  values (v_collection_id, v_user_id, 'Tel Aviv weekend', 'The two we always end up going back to.')
  on conflict (id) do nothing;

  -- `insert ... select` rather than a lookup into a variable: if the places block above was
  -- skipped (a re-run against a database that already has them) the select still finds them, and
  -- if a place is genuinely absent the row is simply not added instead of failing on a null FK.
  insert into public.collection_items (collection_id, place_id, added_by, note, position)
  select v_collection_id, p.id, v_user_id, n.note, n.position
  from (values ('Anat Bakery', 'Queue is shortest before nine.', 0),
               ('Nordoy Cafe',  null,                             1)) as n(name, note, position)
  join lateral (
    -- Matched on a prefix, not on equality: the place above is `Nordoy Café`, and pinning the
    -- accented literal in a second place is one copy-paste away from silently selecting no row
    -- and seeding a collection with one item in it.
    select id from public.places
    where name like left(n.name, 6) || '%'
    order by created_at
    limit 1
  ) p on true
  on conflict (collection_id, place_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The cached import. `tests/e2e/import-happy-path.spec.ts` pastes exactly this TikTok and its
-- docstring states the precondition: the extraction is already in `extractions`, so the run
-- "must not cost a model call". Nothing in this file created that row, so the precondition held
-- only on a developer's own database. With no API key configured, CI's `/api/imports/probe`
-- reached the model instead and answered INTERNAL — a fixture gap reported as a defect.
--
-- Two rows are needed, and both are cache keys rather than data:
--
--  * The `sources` row. `oembedSourceAdapter.fetch` is cache-through on `platform_source_id` and
--    returns a `fetch_status = 'ok'` row with ZERO network calls, so seeding it also removes
--    TikTok's oEmbed endpoint from the CI critical path. `canonical_url` is exactly what
--    `canonicalUrlFor()` builds (`@_`, not the handle) because `start_import` is called with that
--    value and `sources_platform_identity` would otherwise be hit with a second spelling.
--
--  * The `extractions` rows, keyed `(source_id, model, prompt_version)` — `08` §3.4. `input_hash`
--    is computed here from `content_text` rather than pasted, because `readCachedExtraction`
--    refuses a row whose hash does not match `sha256(caption)` and a stale literal would turn a
--    cache hit into a silent miss and a paid call. The candidates array is the one this exact
--    caption produced, copied verbatim off the local database, including its `resolution` sibling:
--    a COMPLETE set of resolutions is what makes the probe skip stage C, so this fixture costs no
--    Google Places call either.
--
-- One row per extractor version, because the cache key names the model and CI does not pin one:
-- `createPlaceExtractor` defaults to Anthropic and the local `.env` selects Gemini, so a
-- single-row fixture would hit on exactly one of the two. `prompt_version` is `PROMPT_VERSION` from
-- `src/integrations/llm/prompt.ts` and the model strings are `ANTHROPIC_EXTRACTOR_VERSION` and
-- `geminiExtractorVersion('gemini-3.5-flash-lite')`. All three are literals here and none of them
-- can be read from SQL: when the prompt version moves, this fixture stops hitting and the import
-- spec starts paying for a model call — a thing to re-check whenever `PROMPT_VERSION` moves.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  -- Fixed on a fresh reset, looked up rather than assumed otherwise: a developer's own database
  -- may already hold this source under the id a real import gave it, in which case the insert
  -- below is a no-op and the extraction has to hang off the row that is actually there. Writing
  -- the literal into the FK instead is what the first draft did, and it failed exactly there.
  v_source_id uuid := '5eed0000-0000-4000-8000-00000000e0e0';
  v_caption   constant text := 'Resturants in Tel Aviv 📍Ha Kosem #foodie #restaurant #telaviv #israel';
  v_prompt_version constant text := 'p17-s5';
  v_candidates constant jsonb := '
  [
      {
          "tags": [
              "middle eastern"
          ],
          "whyGo": null,
          "dishes": [
          ],
          "rawName": "Ha Kosem",
          "areaHint": null,
          "cityHint": "Tel Aviv",
          "evidence": "📍Ha Kosem",
          "resolution": {
              "kind": "answered",
              "result": {
                  "shortlist": [
                      {
                          "place": {
                              "lat": 32.0763896,
                              "lng": 34.7766843,
                              "name": "HaKosem",
                              "altNames": [
                              ],
                              "locality": "Tel Aviv-Yafo",
                              "provider": "google",
                              "regionId": null,
                              "addressLine": "Shlomo HaMelekh Street 1",
                              "countryCode": "IL",
                              "sourceDataset": "google-places",
                              "providerPlaceId": "ChIJi1CK34BLHRURVsjf6-OGlo4",
                              "providerCategory": "falafel_restaurant",
                              "datasetConfidence": 0.5
                          },
                          "score": 1,
                          "nameScore": 1,
                          "matchedText": "HaKosem",
                          "addressScore": null,
                          "categoryScore": 1,
                          "tokenCoverage": 1
                      }
                  ],
                  "confidence": {
                      "band": "preselect",
                      "score": 1,
                      "margin": null
                  },
                  "regionsSearched": [
                      "global"
                  ],
                  "candidatesPrefiltered": 1
              }
          },
          "addressHint": null,
          "coordinates": {
              "lat": 32.0722,
              "lng": 34.7731
          },
          "countryHint": "Israel",
          "categoryHint": "restaurant",
          "nameVariants": [
              "הקוסם"
          ],
          "identifiedName": "HaKosem",
          "modelConfidence": 0.95
      }
  ]
'::jsonb;
begin
  insert into public.sources (id, platform, platform_source_id, canonical_url, author_handle,
                              author_name, content_text, thumbnail_url, fetch_status, fetched_at)
  values (v_source_id, 'tiktok', '7259010845558983978',
          'https://www.tiktok.com/@_/video/7259010845558983978',
          'joelleuzyel', 'JOELLE', v_caption,
          -- Null on purpose. The real value is a signed tiktokcdn URL that expires, and a fixture
          -- that makes CI fetch an expired image is a fixture with an outage in it.
          null,
          'ok', now())
  on conflict on constraint sources_platform_identity do nothing;

  select id into v_source_id from public.sources
  where platform = 'tiktok' and platform_source_id = '7259010845558983978';

  insert into public.extractions (source_id, model, prompt_version, status, candidates,
                                  candidate_count, input_hash)
  select v_source_id, m.model, v_prompt_version, 'ok', v_candidates, 1,
         encode(extensions.digest(v_caption, 'sha256'), 'hex')
  from (values ('2026-08-anthropic-haiku-4-5'),
               ('2026-08-gemini-gemini-3.5-flash-lite')) as m(model)
  on conflict on constraint extractions_version_unique do nothing;
end $$;
