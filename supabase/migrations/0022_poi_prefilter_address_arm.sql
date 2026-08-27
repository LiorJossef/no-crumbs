-- 0022_poi_prefilter_address_arm.sql — the third arm of the prefilter: the street address the
-- caption already gave us.
--
-- =============================================================================================
-- WHY. THE TRIGRAM ARM (0021) MOVED THE REAL NUMBER BY ZERO, AND HERE IS WHY
-- =============================================================================================
--
-- Measured on the 13 real TikTok captions in `tests/manual/tiktok-recognition-corpus.json`
-- (2026-08-28, `tests/manual/tiktok-recognition.manual.ts`, 0 network calls):
--
--     auto-match rate            4 / 16  (25%)
--     false auto-accepts         0
--     unreachable_in_index       6   <- the right row is IN the index and the prefilter cannot
--                                       return it. No scoring change can reach these.
--
-- 0021 recovers misspellings. **These six are not misspellings.** They are a Hebrew caption naming
-- a Latin-named row, a nickname, an abbreviation — cases where the caption's NAME tokens and the
-- index row's name share no trigrams at all. The canonical one:
--
--     candidate  קוהי                    prefiltered rows: 0
--     the row    Kohi Coffee Shop        address_line: בן יהודה 155
--     the hint   addressHint = 'בן יהודה 155'   <- the extractor already had it
--
-- The address is the signal we were throwing away. `score.ts` learned to score it in TLV-ADDR-1
-- (commit 8cedcde), but a scoring term can only rank rows the prefilter already returned, and for
-- `קוהי` the prefilter returns nothing at all. So: a third arm.
--
-- =============================================================================================
-- 1. AND ACROSS TOKENS, NOT OR. That is the whole reason this is safe
-- =============================================================================================
--
-- `bool_and`/`ILIKE ALL` over the address's tokens, not `ILIKE ANY`. An OR over `יהודה` alone
-- returns a large fraction of Tel Aviv; the AND ties the row to one street AND one number.
-- Measured against the loaded `tlv` index (10 462 rows) for every address in the real corpus:
--
--     לבונטין 19     -> 3 rows   Brasserie 18 | Hiro | Super pizza
--     רוטשילד 15     -> 3 rows   VONG | Sushido | רוטשילד 150      <- '15' ⊂ '150', deliberate
--     בן יהודה 155   -> 2 rows   Kohi Coffee Shop | NIKO by Sharon Cohen
--     אבן גבירול 26  -> 2 rows   Toma | האחים
--     בית אשל 15     -> 1 row    wow london
--     בזל 42         -> 1 row    Rustico
--     איינשטיין 69   -> 0 rows   (the venue is genuinely absent — the honest answer)
--
-- The `רוטשילד 150` false positive is deliberate and is NOT fixed here. This arm needs recall;
-- `score.ts`'s `addressScore` rejects 150 ≠ 15 conclusively (its house-number branch returns 0).
-- Making the SQL precise would mean parsing addresses in two places and getting two answers to one
-- question, which is exactly the drift `10` §4 exists to prevent.
--
-- =============================================================================================
-- 2. TOKENISATION: THREE CORRECTIONS TO THE MEASURED SHAPE, EACH ONE FORCED BY REAL DATA
-- =============================================================================================
--
-- The shape TLV-ADDR-2 handed over was `unnest(string_to_array(<address>, ' '))`. Run against the
-- addresses the extractor ACTUALLY produces — rather than the hand-cleaned ones the arm was
-- prototyped on — it returns **zero rows for two of the eight**, because two real hints carry a
-- city and a comma:
--
--     hint                    split on ' '   split on non-alnum   first comma segment
--     בזל 42, תל אביב              0                0                    1   <- Rustico
--     רוטשילד 15, תל אביב          0                0                    3
--     the other six                = = =            = = =                = = =  (unchanged)
--
--   (a) **Split on `[^[:alnum:]]+`, not on a space.** `'בזל 42, תל אביב'` split on spaces yields
--       the token `'42,'`, which matches no `address_line` on earth. Verified on this container
--       that `[[:alnum:]]` matches Hebrew under its ctype (`'א' ~ '[[:alnum:]]'` is true), so this
--       is not a Latin-only rule.
--
--       It also buys a **security property, and it is stronger than escaping**: a token that
--       survives this split is alphanumeric by construction, so `%`, `_` and `\` — every LIKE
--       metacharacter — cannot appear in one. There is nothing to escape because nothing hostile
--       can get through. Asserted below rather than argued.
--
--   (b) **Only the first comma-separated segment.** The AND is unforgiving, and the city is the
--       one part of a written address that is systematically NOT in `address_line`: the index puts
--       it in `locality`. `'בזל 42, תל אביב'` AND-ed whole requires `address_line` to contain
--       `תל` and `אביב`, which it does not, so the arm silently returns nothing.
--
--       The rejected alternative, measured: match against `address_line || ' ' || locality`. It
--       recovers both cases too — and turns a hint of `'תל אביב'` from 82 rows into **3 829**,
--       past the 500 cap, which is precisely the flood the AND exists to prevent.
--
--       The cost, stated: an address written city-first (`'תל אביב, בזל 42'`) loses its street.
--       Zero of the eight real hints are written that way — Israeli captions put the street first
--       — and the failure mode is a recall miss the scorer scores 0 on, not a wrong answer.
--
--   (c) **At least one non-numeric token is required.** A hint of `'15'` is not an address; it
--       matched 203 rows and `score.ts` would refuse to compare it anyway (`parseAddress` returns
--       null when there are no street words). This is the same structural minimum, not a second
--       copy of that function's noise list.
--
-- Token cap: 8, longest first. Dropping address tokens WIDENS an AND, so this cannot lose the true
-- row; it exists so a pathological hint cannot turn one import into hundreds of ILIKEs per row.
-- Eight AND-ed tokens is already far past the point where the result is a handful of rows.
--
-- =============================================================================================
-- 3. THE INDEX IS WORTH IT — BUT ONLY WITH THE REWRITE, AND BOTH HALVES WERE MEASURED
-- =============================================================================================
--
-- `address_line ILIKE '%x%'` is a leading-wildcard match; no btree can serve it. Measured on a TEMP
-- COPY of the real 10 462 rows (so nothing in the live schema had to be created and then dropped):
--
--     ILIKE ALL(array), no index                      6.5 ms   seq scan
--     ILIKE ALL(array), GIN trgm index on address_line 5.9 ms   seq scan — THE INDEX IS NOT USED
--     probe on the longest token, then ILIKE ALL       0.475 ms Bitmap Index Scan  <- 13x
--
-- The middle row is the finding: adding the index alone changes nothing, because the planner
-- cannot turn `x ILIKE ALL ($1)` into an index condition — the array is not a set of literals. The
-- arm below therefore probes on ONE token with a plain `ILIKE` (which IS index-backed) and lets
-- `ILIKE ALL` filter the survivors. Requiring the longest token is implied by requiring all of
-- them, so the rewrite cannot lose a row; it is the same predicate, ordered so the index can start
-- it. Longest first because a token under three characters has no full trigram and the index
-- cannot help with it.
--
-- Index size: **904 kB** for 10 462 rows. Extrapolated to `10` §9's twelve-city ~660 k rows that is
-- ~57 MB against a 500 MB budget — recorded, because `10` §9's storage arithmetic did not include
-- it. `alt_names` still gets no index (it is empty; `10` §5).
--
-- =============================================================================================
-- 4. THIS IS A RECALL ARM. IT CAN NEVER BE A FILTER
-- =============================================================================================
--
-- Eight of the seventeen real candidates carry NO address at all. If a row had to match the address
-- to be returned, those eight would lose every candidate they have. So arm 3 is a third branch of
-- the UNION, ORed in, and a null / blank / punctuation-only / digits-only hint must leave the
-- function's output **byte-identical** to 0021's.
--
-- That is proven at the bottom of this file, not asserted: the post-condition recomputes 0021's
-- two arms inline and requires exact set equality with this function's output for `null`, `''`,
-- `'   '`, `','` and `'15'`. It runs in CI on every `supabase db reset`.
--
-- =============================================================================================
-- 5. SECURITY: EVERY PROPERTY OF 0021, UNCHANGED
-- =============================================================================================
--
-- `SECURITY INVOKER` (0021 §3 — `service_role` already holds `select` on `poi_index`, so a definer
-- function would elevate nothing and would hide the loss of that grant), `set search_path = ''`
-- with everything schema-qualified, the pinned trigram threshold, `stable`, `parallel safe`, no
-- dynamic SQL of any kind, every argument bound, `revoke ... from public, anon, authenticated`
-- BEFORE `grant execute ... to service_role`, and a post-condition block that asserts all of it.
-- `supabase/tests/0008_policy_tests.sql` P6b/P6c attempt the call as both browser roles and require
-- 42501; they are updated to the new signature in the same change.
--
-- ONE THING THAT IS NOT A `CREATE OR REPLACE`. Adding a parameter makes a SECOND function of the
-- same name, and `inventory.sql` check 6b bans overloading in `public` outright — for a measured
-- reason (0010/0011 shipped two `resolve_place`s and every twelve-argument call started failing
-- 42725 at run time, in the import path, with CI green). So the four-argument signature is DROPPED
-- first. Grants do not survive a drop, which is why the revoke/grant pair below is repeated in
-- full rather than assumed to carry over — and why the post-condition re-checks it.

-- ---------------------------------------------------------------------------------------------
-- PRECONDITION: pg_trgm's library must be loaded before the function-level `SET` is parsed.
-- ---------------------------------------------------------------------------------------------
-- Same as 0021, same reason, and it is not optional: pg_trgm registers its GUCs from its shared
-- library, the library loads lazily, and pinning an unrecognised custom parameter as a function
-- attribute is superuser-only — which the migration role is not (`usesuper = f`, measured locally
-- and true of the hosted projects). Without this line the CREATE below fails with
-- `permission denied to set parameter "pg_trgm.strict_word_similarity_threshold"`.
do $$
begin
  perform extensions.strict_word_similarity('a', 'a');
end
$$;

-- ---------------------------------------------------------------------------------------------
-- THE INDEX (§3)
-- ---------------------------------------------------------------------------------------------
-- `if not exists` so re-applying this file is a no-op. NOT `concurrently`: migrations run inside a
-- transaction and `CREATE INDEX CONCURRENTLY` cannot, and at 10 462 rows the build takes 24 ms.
create index if not exists poi_index_address_trgm_idx
  on public.poi_index using gin (address_line extensions.gin_trgm_ops);

comment on index public.poi_index_address_trgm_idx is
  'Serves the address arm of poi_prefilter (0022): ILIKE ''%token%'' on address_line. 904 kB at '
  '10 462 rows. Measured 13x on the arm (0.475 ms vs 6.5 ms) — but only with the single-token '
  'probe the function uses; ILIKE ALL(array) alone cannot use it.';

-- ---------------------------------------------------------------------------------------------
-- THE OLD SIGNATURE GOES FIRST (see §5)
-- ---------------------------------------------------------------------------------------------
-- `if exists` so this file is re-runnable. The risk that buys — a mistyped signature silently
-- dropping nothing and leaving an overload behind — is closed by the post-condition below, which
-- counts the functions named `poi_prefilter` and asserts the identity argument list, rather than
-- by trusting the DROP to have matched.
drop function if exists public.poi_prefilter(text[], text[], text, integer);

create or replace function public.poi_prefilter(
  p_region_ids    text[],
  p_tokens        text[],
  p_query_norm    text,
  -- The caption's street address, **verbatim** — `ResolveQuery.addressHint` straight through.
  -- Deliberately NOT normalised or pre-parsed by the caller: `score.ts` parses it and compares it
  -- against the `address_line` this function returns unchanged, and a string normalised on the way
  -- in would be normalised twice or, worse, differently. Null when the caption gave no address,
  -- which is 8 of 17 real candidates and must cost exactly nothing.
  p_address_hint  text,
  p_limit         integer
)
returns table (
  dataset_place_id   text,
  region_id          text,
  name               text,
  alt_names          text[],
  provider_category  text,
  address_line       text,
  locality           text,
  lat                double precision,
  lng                double precision,
  dataset_confidence real
)
language sql
stable
parallel safe
security invoker
set search_path = ''
set pg_trgm.strict_word_similarity_threshold = 0.37
as $fn$
  with tok as (
    -- The tokens arms 1 and 2 ask about. `10` §5's recall gate only means anything if the arms and
    -- the scorer ask the same question, so this is `queryTokens()`'s output verbatim — no
    -- stemming, no stop-word list, no length filter beyond dropping empties.
    --
    -- The `limit 12` is a SERVER-SIDE mirror of `MAX_PREFILTER_TOKENS`, not a second policy: the
    -- adapter already caps and orders longest-first, and this repeats the same ordering so the two
    -- pick the same twelve. It exists because each token is one index probe and a whole caption
    -- arriving as `ResolveQuery.text` must not be able to turn one import into 200 probes.
    select t
      from (select distinct t
              from pg_catalog.unnest(p_tokens) as t
             where t is not null and t <> '') d
     order by pg_catalog.length(t) desc, t
     limit 12
  ),
  pat as (
    -- Arm 1's LIKE patterns, built HERE rather than in TypeScript, so there is exactly one answer
    -- to "what does this token match" and the arms cannot drift apart.
    --
    -- `_` becomes `%`, which is the widening `place-resolver.ts` already shipped: `normalise()`
    -- keeps `_` (Python's `\w` does), and a token `cafe_bar` should still reach a row named
    -- `cafe bar`. 28 of the 10 462 loaded `tlv` rows carry a literal `_` in `name_norm`.
    --
    -- The backslash IS escaped, because it is LIKE's escape character. `normalise()` cannot emit
    -- one (it is neither `\w` nor `\s`, so the strip turns it into a space) — belt-and-braces
    -- against a caller that normalises differently, which is what `10` §4 is about.
    select pg_catalog.array_agg(
             '%' || pg_catalog.replace(pg_catalog.replace(t, '\', '\\'), '_', '%') || '%'
           ) as a
      from tok
  ),
  -- ── arm 3's tokens ─────────────────────────────────────────────────────────────────────────
  addr_raw as (
    -- §2(a) split on non-alphanumeric, §2(b) first comma segment only, drop 1-character tokens,
    -- §2 cap at 8 longest-first. `coalesce` rather than a null guard: `split_part(null, ...)` is
    -- null, `regexp_split_to_array(null, ...)` is null, `unnest(null)` is zero rows — the null
    -- path already collapses to "no tokens", and `coalesce` only makes that legible.
    select t
      from pg_catalog.unnest(
             pg_catalog.regexp_split_to_array(
               pg_catalog.split_part(coalesce(p_address_hint, ''), ',', 1),
               '[^[:alnum:]]+')) as t
     where pg_catalog.length(t) >= 2
     order by pg_catalog.length(t) desc, t
     limit 8
  ),
  addr as (
    -- §2(c): a bare house number is not an address. Empties the whole CTE rather than filtering
    -- the digits out — `דיזנגוף 99` must keep its `99`, `15` alone must select nothing.
    select t from addr_raw
     where exists (select 1 from addr_raw s where s.t !~ '^[0-9]+$')
  ),
  addr_pat as (
    -- No escaping and none needed: every token here is alphanumeric by construction (§2a), so no
    -- LIKE metacharacter can be in one. Asserted at the bottom of this file against a hint made of
    -- nothing but metacharacters.
    --
    -- `array_agg` over zero rows is NULL, not `{}`, and that distinction is load-bearing:
    -- `x ILIKE ALL (NULL)` is NULL (row excluded) while `x ILIKE ALL ('{}')` is vacuously TRUE
    -- (EVERY row selected). Both were checked on this container. The explicit `a is not null`
    -- below does not rely on knowing that.
    select pg_catalog.array_agg('%' || t || '%') as a from addr
  ),
  addr_lead as (
    -- The one token the index can start on (§3). Implied by the ALL below, so requiring it cannot
    -- lose a row; longest first because a token under three characters has no full trigram.
    select '%' || t || '%' as p from addr order by pg_catalog.length(t) desc, t limit 1
  ),
  hit as (
    -- ARM 1 — the substring arm, `06` §6.1 step 3.
    select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
           p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence, p.name_norm
      from public.poi_index p, pat
     where p.region_id = any(p_region_ids)          -- 06 §6.1 step 2 scoping, non-negotiable
       and p.name_norm like any (pat.a)

    union   -- deliberately UNION, not UNION ALL: a row several arms match appears once, and the
            -- dedup runs over at most `limit`-many rows. Three independently-costed scans, not one
            -- OR — that is what keeps every arm index-backed (0021 §4).

    -- ARM 2 — the trigram arm (0021). `operator(extensions.<<%)` is schema-qualified because
    -- pg_trgm lives in `extensions`, not `public` (0010, a security decision). Only the OPERATOR
    -- form is index-backed; `strict_word_similarity(...) > x` written out is not.
    select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
           p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence, p.name_norm
      from tok
      join public.poi_index p on tok.t operator(extensions.<<%) p.name_norm
     where p.region_id = any(p_region_ids)

    union

    -- ARM 3 — the address arm. THE NEW ONE, and the only arm that can return a row whose name has
    -- nothing in common with the query at all — which is the entire point: `קוהי` shares no
    -- trigram with `Kohi Coffee Shop`, and `בן יהודה 155` is the only thing connecting them.
    --
    -- Three guards, each of which independently reduces this arm to zero rows when there is no
    -- usable address, so a blank hint can never widen anything:
    --   * `addr_lead` has no row            -> the cross join is empty
    --   * `addr_pat.a is null`              -> excluded explicitly
    --   * `p.address_line is null` (7% of rows) -> `NULL ILIKE x` is NULL, excluded
    select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
           p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence, p.name_norm
      from public.poi_index p, addr_pat, addr_lead
     where p.region_id = any(p_region_ids)
       and addr_pat.a is not null
       and p.address_line ilike addr_lead.p        -- index-backed probe (§3)
       and p.address_line ilike all (addr_pat.a)   -- AND across every token (§1)
  )
  select h.dataset_place_id, h.region_id, h.name, h.alt_names, h.provider_category,
         h.address_line, h.locality, h.lat, h.lng, h.dataset_confidence
    from hit h
   -- Ordered by the NAME criterion, deliberately unchanged by this migration. It is what protects
   -- the cap: when a degenerate two-character address hint drags in 589 rows, they sort BELOW every
   -- name match and are the first thing the `limit` discards. Adding an address term here would be
   -- ranking, and `score.ts` is the only ranker (`10` §5, and 0021's note on this order).
   order by (select pg_catalog.max(extensions.strict_word_similarity(t, h.name_norm)) from tok)
              desc nulls last,
            extensions.similarity(h.name_norm, p_query_norm) desc,
            h.dataset_place_id
   -- Server-side ceiling mirroring `MAX_PREFILTER_ROWS`. Clamped rather than trusted; a null or
   -- absurd `p_limit` lands on 500, never on "unbounded".
   limit least(greatest(coalesce(p_limit, 500), 1), 500);
$fn$;

comment on function public.poi_prefilter(text[], text[], text, text, integer) is
  'Region-scoped THREE-arm POI prefilter (10 §5 + TLV-ADDR-2): per-token substring OR per-token '
  'trigram (strict_word_similarity > 0.37, pinned on the function) OR every token of the caption''s '
  'street address ANDed against address_line. The address arm is pure recall — score.ts owns '
  'precision. SECURITY INVOKER, service_role only. Read-only, capped at 500 rows, ordered by best '
  'per-token NAME match so the cap discards address-only rows first.';

-- Grants do not survive the DROP above, so this is a re-grant, not a tidy-up. `from public` FIRST:
-- EXECUTE defaults to PUBLIC on every newly created function and `revoke ... from anon` does not
-- remove a privilege held through PUBLIC. That is 0009's bug and then 0018's, in this repo, twice.
revoke all on function public.poi_prefilter(text[], text[], text, text, integer)
  from public, anon, authenticated;
grant execute on function public.poi_prefilter(text[], text[], text, text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- POST-CONDITIONS. Everything below runs at migration time, in CI, on every db reset.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_oid    oid;
  v_count  integer;
  v_args   text;
  v_config text;
begin
  -- 1. EXACTLY ONE. This is the assertion that makes `drop function if exists` safe: if the drop
  --    matched nothing because the signature was mistyped, there are now two and this fails here,
  --    naming this file — rather than in `inventory.sql` check 6b as anonymous grant drift, or at
  --    run time as 42725 `function is not unique` in the import path (0010/0011, fixed by 0014).
  select count(*), max(p.oid) into v_count, v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'poi_prefilter';
  if v_count <> 1 then
    raise exception '0022: expected exactly one public.poi_prefilter, found % — the four-argument signature was not dropped', v_count;
  end if;

  -- 2. The argument list, names and types, positionally. PostgREST binds RPC arguments BY NAME, so
  --    a renamed parameter is a 404 at run time and nothing else in this repo would notice.
  select pg_catalog.pg_get_function_identity_arguments(v_oid) into v_args;
  if v_args is distinct from 'p_region_ids text[], p_tokens text[], p_query_norm text, p_address_hint text, p_limit integer' then
    raise exception '0022: poi_prefilter argument list is %, expected the five-argument form', v_args;
  end if;

  -- 3. It cannot write and it cannot be elevated.
  if (select prosecdef from pg_proc where oid = v_oid) then
    raise exception '0022: poi_prefilter is SECURITY DEFINER; it is designed as INVOKER (0021 §3)';
  end if;
  if (select provolatile from pg_proc where oid = v_oid) <> 's' then
    raise exception '0022: poi_prefilter must be STABLE (it reads poi_index and writes nothing)';
  end if;

  -- 4. The two pinned settings. Without the search_path pin the body would resolve `poi_index`
  --    through the caller's path; without the threshold pin arm 2 would inherit whatever GUC a
  --    pooled connection happened to carry.
  select pg_catalog.array_to_string(proconfig, ',') into v_config from pg_proc where oid = v_oid;
  if v_config is null or v_config not like '%search_path=%' then
    raise exception '0022: poi_prefilter has no pinned search_path (proconfig = %)', coalesce(v_config, '<null>');
  end if;
  if v_config not like '%pg_trgm.strict_word_similarity_threshold=0.37%' then
    raise exception '0022: poi_prefilter does not pin the trigram threshold at 0.37 (proconfig = %)', v_config;
  end if;

  -- 5. The grant matrix, both directions. `has_function_privilege` accounts for privileges held
  --    via PUBLIC, which is the point — `revoke from anon` alone would leave this green-looking
  --    and wide open.
  if not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '0022: service_role cannot execute poi_prefilter — the resolver would fail at run time, in the import path';
  end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0022: anon can execute poi_prefilter (security.md §1: anon holds nothing, ever)';
  end if;
  if pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0022: authenticated can execute poi_prefilter — poi_index has zero browser grants (10 §6) and resolution is rate-limited server-side (06 §11 Q6)';
  end if;

  -- 6. The index the address arm is designed around.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'poi_index_address_trgm_idx'
                    and c.relkind = 'i') then
    raise exception '0022: poi_index_address_trgm_idx is missing — the address arm would seq-scan';
  end if;

  raise notice '0022: poi_prefilter replaced — 3 arms, STABLE, SECURITY INVOKER, search_path pinned, service_role only, address index present';
end
$$;

-- 7. THE BEHAVIOURAL PROOFS. Guarded on the index actually being loaded, because `poi_index` is
--    populated by `scripts/poi-ingest`, not by a migration or by seed.sql — a migration that fails
--    on an empty database cannot be applied to staging.
do $$
declare
  v_tokens  text[] := array['bellboy'];
  v_regions text[] := array['tlv'];
  v_baseline text;
  v_variant  text;
  v_blank    text;
  n_kohi     integer;
  n_name     integer;
  n_meta     integer;
begin
  if not exists (select 1 from public.poi_index where region_id = 'tlv' limit 1) then
    raise notice '0022: skipping the behavioural checks — region tlv holds no rows';
    return;
  end if;

  -- 7a. THE NO-ADDRESS INVARIANT, PROVEN RATHER THAN ASSERTED (§4).
  --     `v_baseline` is 0021's two arms, recomputed inline here from the same predicates, so this
  --     compares the new function against the OLD DEFINITION and not against itself.
  --
  --     THE THRESHOLD HAS TO BE SET FIRST, and forgetting it is how this check lies. Arm 2's `<<%`
  --     reads `pg_trgm.strict_word_similarity_threshold`, which the FUNCTION pins at 0.37 and this
  --     block would otherwise run at the session default of 0.5 — measured: `bellboy` matches 1 row
  --     at 0.5 and 15 at 0.37, so the first draft of this assertion failed against a "baseline"
  --     that was not 0021's behaviour at all. `true` = transaction-local, so it is gone at COMMIT.
  perform pg_catalog.set_config('pg_trgm.strict_word_similarity_threshold', '0.37', true);

  select pg_catalog.string_agg(x.dataset_place_id, ',' order by x.dataset_place_id) into v_baseline
    from (
      select p.dataset_place_id from public.poi_index p
       where p.region_id = any(v_regions)
         and p.name_norm like any (select '%' || pg_catalog.replace(pg_catalog.replace(t, '\', '\\'), '_', '%') || '%'
                                     from pg_catalog.unnest(v_tokens) t)
      union
      select p.dataset_place_id from pg_catalog.unnest(v_tokens) t
        join public.poi_index p on t operator(extensions.<<%) p.name_norm
       where p.region_id = any(v_regions)
    ) x;

  --     Every shape of "no usable address" must reproduce it exactly. `'15'` is in this list on
  --     purpose: §2(c) says a bare house number is not an address, and this is where that is
  --     enforced rather than described.
  foreach v_blank in array array[null, '', '   ', ',', ' , , ', '—/()', '15', '7575603']
  loop
    select pg_catalog.string_agg(r.dataset_place_id, ',' order by r.dataset_place_id) into v_variant
      from public.poi_prefilter(v_regions, v_tokens, 'bellboy', v_blank, 500) r;
    if v_variant is distinct from v_baseline then
      raise exception '0022: address hint [%] changed the result set with no usable address in it. baseline=[%] got=[%]',
        coalesce(v_blank, '<null>'), coalesce(v_baseline, '<none>'), coalesce(v_variant, '<none>');
    end if;
  end loop;

  -- 7b. NO LIKE METACHARACTER CAN REACH THE PATTERN (§2a). A hint that is nothing but
  --     metacharacters tokenises to nothing, so it takes the no-address path above; one that
  --     embeds them between letters must match the letters LITERALLY and not as wildcards. If
  --     `%` were passed through, `'a%z'` would match every address containing an `a` before a `z`.
  select count(*) into n_meta from public.poi_prefilter(v_regions, array['zzzznosuchtoken'], 'z', 'a%z\_%', 500);
  if n_meta > (select count(*) from public.poi_index
                where region_id = 'tlv' and (address_line ilike '%a%' and address_line ilike '%z%')) then
    raise exception '0022: a LIKE metacharacter survived address tokenisation (% rows)', n_meta;
  end if;

  -- 7c. THE CASE THIS MIGRATION EXISTS FOR. `קוהי` shares no trigram with `Kohi Coffee Shop`;
  --     without the address arm the prefilter returns zero rows for it (measured, TLV-ADDR-2).
  if exists (select 1 from public.poi_index
              where region_id = 'tlv' and address_line = 'בן יהודה 155' and name ilike '%kohi%') then
    select count(*) into n_name
      from public.poi_prefilter(v_regions, array['קוהי'], 'קוהי', null, 500);
    select count(*) into n_kohi
      from public.poi_prefilter(v_regions, array['קוהי'], 'קוהי', 'בן יהודה 155', 500) r
     where r.name ilike '%kohi%';
    if n_name <> 0 then
      raise exception '0022: the name arms now return % rows for `קוהי` — this migration''s premise no longer holds; re-measure', n_name;
    end if;
    if n_kohi <> 1 then
      raise exception '0022: the address arm did not return Kohi Coffee Shop for `בן יהודה 155` (% rows)', n_kohi;
    end if;
    raise notice '0022: קוהי recovered — 0 rows from the name arms, Kohi Coffee Shop from the address arm';
  else
    raise notice '0022: skipping the קוהי check — no `Kohi` row at בן יהודה 155 in this index';
  end if;
end
$$;
