-- 0021_poi_prefilter_trigram.sql — the second arm of `10` §5's prefilter: trigram similarity,
-- as a function, because it is not expressible through PostgREST.
--
-- =============================================================================================
-- THE DEFECT THIS CLOSES, MEASURED RATHER THAN ARGUED
-- =============================================================================================
--
-- `10` §5 specifies a prefilter with two OR-ed arms — a per-token substring match and a trigram
-- similarity match. Only the substring arm shipped. `src/integrations/supabase/place-resolver.ts`
-- says why in its own header: `%` is a custom operator and PostgREST's filter grammar has no
-- syntax for one, so the similarity arm needed a function and a migration.
--
-- The consequence is observed, not hypothetical. Benchmark case TLV-12, query `Belboy tel aviv`
-- (a misspelling of `Bellboy`, which IS in the index at ברדיצ'בסקי 14):
--
--     regionsSearched      ["tlv"]     -- region scoping works
--     candidatesPrefiltered 0          -- and we still never see the venue
--
-- because `belboy` cannot substring-match `bellboy`. Real captions are full of misspellings; this
-- is the arm that recovers them.
--
-- =============================================================================================
-- 1. WHICH TRIGRAM METRIC. `10` §5's literal SQL is the WRONG one, and the measurement says so.
-- =============================================================================================
--
-- `10` §5 proposes `name_norm operator(extensions.%) $2` — whole-string `similarity()` between
-- `name_norm` and the whole normalised query. Measured against the loaded `tlv` index (10 462 rows,
-- release 2026-07-22.0) it is fragile in exactly the case it was written for:
--
--     similarity('bellboy', 'belboy tel aviv')   = 0.333   -- the WHOLE-STRING arm, `10` §5 literal
--     similarity('bellboy', 'belboy')            = 0.667   -- per token
--     strict_word_similarity('belboy', 'bellboy')= 0.667   -- per token, extent-matched
--
-- 0.333 barely clears pg_trgm's 0.3 default; one more context word in the caption and the true row
-- drops below it. And the rows the whole-string arm brings in are noise: on the 15 TLV benchmark
-- cases at threshold 0.3 it adds **97 rows to TLV-09 and 69 to TLV-14** while adding nothing at all
-- to the six long-query cases. It is diluted by long candidate names, which is most of the index.
--
-- So this function uses **`strict_word_similarity` per query token** (`<<%`) instead: for each token
-- the scorer will later score on, is there a word-boundary-aligned extent of `name_norm` that is
-- close to it? That is the same question the substring arm asks, with typo tolerance, and it is the
-- same question `score.ts`'s per-token `tokenCoverage` asks. Measured on the same 15 cases, the
-- rows it adds beyond the substring arm at the threshold chosen below:
--
--     TLV-01 +1   TLV-02 +2   TLV-03 +14  TLV-07 +2   TLV-08 +23  TLV-10 +5
--     TLV-11 +1   TLV-12 +1..3 (the venue)  TLV-13 +1   NEG-03 +4
--     every other case +0.   Worst case 98 rows, against a cap of 500.
--
-- `word_similarity` (`<%`, no word-boundary alignment) was measured too and rejected: it returns
-- 191 rows for NEG-03 and 289 for TLV-08 at 0.30 for no extra true positives here.
--
-- =============================================================================================
-- 2. THE THRESHOLD IS 0.37, AND IT IS ARITHMETIC, NOT A ROUND NUMBER
-- =============================================================================================
--
-- pg_trgm's similarity of a word against itself-with-one-character-changed is fixed by trigram
-- counting, so the useful thresholds are not evenly spaced — they are the values those fractions
-- land on. For a token of n characters (padded trigrams, as pg_trgm builds them):
--
--     6-char token, one character DELETED       4/9  = 0.444
--     6-char token, one character SUBSTITUTED   4/10 = 0.400
--     5-char token, one character DELETED       3/8  = 0.375
--     5-char token, one character SUBSTITUTED   3/9  = 0.333
--     'bellboy' vs 'belboy'                            0.667
--
-- Verified empirically, not just derived: 400 real `tlv` names, longest token corrupted two ways
-- (delete a middle character, substitute one), `strict_word_similarity(corrupted, name_norm)`:
--
--     token length   >0.30            >0.37            >0.44            >0.50
--     4              2/44   0/44      2/44   0/44      2/44   0/44      0/44  0/44   (del, sub)
--     5              104/104 104/104  104/104 0/104    0/104  0/104     0/104 0/104
--     6-7            178/178 178/178  178/178 178/178  178/178 68/178   21/178 1/178
--     8-10           67/67  67/67     67/67  67/67     67/67  67/67     67/67 31/67
--     11+            7/7    7/7       7/7    7/7       7/7    7/7       7/7   7/7
--
-- **0.37 is the last value that still catches every single-character typo in a token of 6 or more
-- characters, and every deletion in a 5-character token.** Going to 0.44 loses 62% of 6–7 character
-- substitutions and all 5-character typos; going to 0.30 buys only 5-character substitutions and
-- costs measured noise (NEG-03 115 rows instead of 97, TLV-08 58 instead of 26, TLV-12 18 instead
-- of 3). `<<%` compares STRICTLY GREATER than the threshold, so 0.37 admits 0.375 and 0.400.
--
-- **0.44 was considered and rejected by the lead, after first choosing it and reversing.** Widening
-- recall has one measured cost on the benchmark: TLV-08 (`אורנה ואלה`, a venue genuinely absent
-- from the index) moves from `no_match` at 0.660 to `confirm` at 0.846 — a wrong answer offered
-- where none was before, and 0.074 from the auto-accept gate. 0.44 removes that. But it is the
-- wrong lever: an absent venue drawing a plausible wrong answer is the **scorer** failing to
-- reject, and narrowing the prefilter to hide it trades a visible scoring bug for an invisible
-- recall one. Measured independently at 0.44: 6–7 character substitution recall drops from 100%
-- to 41%, and 6–7 characters is the modal token length. Typos are what this arm exists for.
--
-- The real-caption corpus was checked too and is silent on the choice — all twelve of its queries
-- return identical row counts at 0.37 and 0.44, as do `belboy`→Bellboy, `miznun`→Miznon and
-- `hakosm`→HaKosem. The decision therefore rests on the substitution measurement above, not on a
-- handful of typos that happened to survive both.

-- Four-character tokens are not recoverable by trigrams at any usable threshold and this function
-- does not pretend otherwise — that is the alias/transliteration problem, not this one. Transposed
-- characters are also mostly out of reach (trigram similarity destroys three trigrams at once);
-- measured recall for transposition is 13% at 0.30. Recorded, not papered over.
--
-- The threshold is pinned as a FUNCTION-LEVEL `SET`, so it is a property of the function definition
-- and can only be changed by a migration — not by whatever GUC a pooled connection happens to carry.
-- That is the main reason this has to be a function at all, beyond PostgREST's grammar.
--
-- =============================================================================================
-- 3. SECURITY: `SECURITY INVOKER`, DELIBERATELY, AND THIS IS A DOWNGRADE FROM THE TASK BRIEF
-- =============================================================================================
--
-- TLV-TRGM-1 asked for a `SECURITY DEFINER` RPC. It does not need to be one, and a definer function
-- that does not need to be one is a privilege boundary maintained for no reason.
--
--   * The only caller is `service_role` (`10` §6, §12 ruling 2: zero browser grants on `poi_index`,
--     resolution runs server-side so the per-user rate limit can be enforced — `06` §11 Q6).
--   * `service_role` ALREADY holds `select` on `public.poi_index`, granted explicitly by 0010, and
--     already has BYPASSRLS. `inventory.sql` check 9 asserts both.
--   * So `SECURITY DEFINER` would elevate nothing. What it WOULD do is make the function keep
--     working if that grant were ever revoked — i.e. it would hide exactly the regression
--     `inventory.sql` check 9 exists to catch.
--
-- `security.md` §1 invariant 1 and `agent-guardrails.md` §5 rule 18 read on the definer case; the
-- safe answer here is not to open it. If a later caller genuinely needs elevation, that is a new
-- migration and a `security-privacy` review, not a property smuggled in now.
--
-- What IS pinned, and matters for an invoker function too:
--
--   * `set search_path = ''` — stricter than this repo's usual `public, pg_temp`. Every object in
--     the body is schema-qualified (`public.poi_index`, `extensions.strict_word_similarity`,
--     `operator(extensions.<<%)`, `pg_catalog.*`), so nothing here resolves through a caller-
--     controlled path. `pg_catalog` is implicitly searched even when absent from `search_path`,
--     which is what keeps `like`, `any`, `coalesce`, `least`/`greatest` and the text operators
--     working; those are grammar and cannot be qualified.
--   * `stable` — it reads `poi_index` and nothing else, and writes nothing. `language sql` with a
--     single `select` means there is no statement in it that COULD write.
--   * `parallel safe` — no side effects, no temp state.
--   * EXECUTE revoked from `public`, `anon` and `authenticated` before it is granted to anything.
--     `revoke ... from public` is the load-bearing line: EXECUTE defaults to PUBLIC on every new
--     function and `revoke ... from anon` does not remove a privilege held through PUBLIC. That is
--     0009's bug and then 0018's bug, in this repo, twice. `inventory.sql` check 6 is exhaustive in
--     both directions over `anon`/`authenticated`, so this function appearing there at all is a
--     failure; the post-condition block at the bottom of this file asserts the same thing at
--     migration time, which is earlier and names the problem.
--
-- NO DYNAMIC SQL, ANYWHERE. Every argument is a bound parameter compared with `=` / `like` / `<<%`.
-- There is no `quote_ident`, no `format`, no `execute` — so there is no injection surface to
-- reason about, and a region id or a token is only ever data. The one place hostile text touches
-- an operator's grammar is the LIKE pattern built from a token, and that is handled explicitly
-- below.
--
-- =============================================================================================
-- 4. NO NEW INDEX. THE EXISTING GIN INDEX SERVES BOTH ARMS — MEASURED, ON THE REAL 10 462 ROWS
-- =============================================================================================
--
-- `poi_index_name_trgm_idx` (`gin (name_norm extensions.gin_trgm_ops)`, migration 0010) already
-- supports `<<%`: `gin_trgm_ops` indexes `%`, `<%`, `<<%` and `LIKE` alike. `EXPLAIN (ANALYZE)`
-- with bound parameters, worst benchmark case (NEG-03, two tokens, 98 rows out):
--
--     Bitmap Index Scan on poi_index_name_trgm_idx   Index Cond: name_norm ~~ ANY (...)   -- arm 1
--     Bitmap Index Scan on poi_index_name_trgm_idx   Index Cond: name_norm %>> tok.t      -- arm 2
--     Execution Time: 1.293 ms
--
-- TLV-12 (one token): 1.174 ms. Realistic three-token captions through the installed function:
-- 0.9–2.0 ms. **The worst case is not those, and it is stated rather than buried.** A query that
-- falls through `queryTokens`'s all-generic branch — twelve generic tokens, 1 383 rows matched, the
-- 500-cap actually biting — costs **38–53 ms**, against 8 ms for the substring arm alone. Roughly
-- half of that gap is the second arm's twelve index probes and half is the ORDER BY term below
-- (19 ms with the term removed). It is spent exactly where it buys something: the ordering only
-- changes the answer when more than 500 rows match, which is this case and no other measured one.
--
-- `10` §5 warned the COMBINED predicate's plan was not stable on
-- synthetic data — a Seq Scan in one run, a BitmapOr minutes later. The shape below is why that is
-- no longer a coin toss: the two arms are a `UNION` of two independently-planned scans rather than
-- an `OR` inside one `WHERE`, so each is costed on its own and neither can drag the other into a
-- sequential scan. The naive `OR ... EXISTS (select from unnest(...))` form was measured too, and
-- it seq-scans: **31.7 ms against 1.2 ms, 24x slower**, calling `strict_word_similarity` 10 462
-- times per token. Adding `btree_gin` to index-narrow `region_id` is still refused (`10` §5, and
-- `inventory.sql` check 8's allow-list forbids a second extension); at 10 462 rows and 1.3 ms it
-- would buy nothing.

-- ---------------------------------------------------------------------------------------------
-- PRECONDITION: FORCE pg_trgm's LIBRARY TO LOAD BEFORE THE `SET` BELOW IS PARSED.
-- ---------------------------------------------------------------------------------------------
-- This one line is not decoration and it is not caution — without it this migration FAILS, and it
-- fails on the hosted projects for the same reason it fails locally. Measured on the local
-- container (supabase/postgres 17.6.1.064, migration role `postgres`, `usesuper = f`, exactly as on
-- staging and production):
--
--     show pg_trgm.strict_word_similarity_threshold;
--       ERROR:  unrecognized configuration parameter
--     create function ... set pg_trgm.strict_word_similarity_threshold = 0.37 ...
--       ERROR:  permission denied to set parameter "pg_trgm.strict_word_similarity_threshold"
--
-- `pg_trgm`'s GUCs are registered by its shared library, and the library is loaded LAZILY on first
-- use of one of its functions. Until then `pg_trgm.*` is an unrecognised custom placeholder, and
-- pinning a placeholder as a function attribute is superuser-only. Calling any pg_trgm function
-- first loads the library, registers the GUC, and the `SET` is then an ordinary USERSET pin.
--
-- `select` into nothing rather than a `do` block, because a `do` block runs in its own snapshot but
-- the same backend, and either works — this is simply the shortest form that cannot be mistaken for
-- a no-op assertion.
do $$
begin
  perform extensions.strict_word_similarity('a', 'a');
end
$$;

-- ---------------------------------------------------------------------------------------------
-- THE FUNCTION
-- ---------------------------------------------------------------------------------------------
-- Returns the same ten columns `place-resolver.ts` already selects, in the same order, so the
-- adapter's row → `ResolvedPlace` mapping is untouched. `name_norm` is deliberately NOT returned:
-- it is an internal matching key, the scorer re-normalises `name` itself (`10` §4 — one
-- implementation, in `src/domain/places/normalise.ts`), and returning it would invite a second one.
create or replace function public.poi_prefilter(
  p_region_ids text[],
  p_tokens     text[],
  p_query_norm text,
  p_limit      integer
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
    -- The tokens both arms ask about. `10` §5's recall gate only means anything if the two arms
    -- and the scorer ask the same question, so this is `queryTokens()`'s output verbatim — no
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
    -- to "what does this token match" and the two arms cannot drift apart.
    --
    -- `_` becomes `%`, which is the widening `place-resolver.ts` already shipped: `normalise()`
    -- keeps `_` (Python's `\w` does), and a token `cafe_bar` should still reach a row named
    -- `cafe bar`. 28 of the 10 462 loaded `tlv` rows carry a literal `_` in `name_norm`, so this is
    -- a real if small case.
    --
    -- The backslash IS escaped, because it is LIKE's escape character and a stray one would change
    -- the meaning of the pattern that follows it. `normalise()` cannot emit a backslash (it is
    -- neither `\w` nor `\s`, so the strip turns it into a space) — this is belt-and-braces against
    -- a caller that normalises differently, which is precisely the failure `10` §4 is about.
    -- A literal `%` is likewise impossible out of `normalise()`, and if one arrived it would only
    -- widen the pattern: more rows, still capped, never a different KIND of query.
    select pg_catalog.array_agg(
             '%' || pg_catalog.replace(pg_catalog.replace(t, '\', '\\'), '_', '%') || '%'
           ) as a
      from tok
  ),
  hit as (
    -- ARM 1 — the substring arm, `06` §6.1 step 3, exactly what ships today.
    select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
           p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence, p.name_norm
      from public.poi_index p, pat
     where p.region_id = any(p_region_ids)          -- 06 §6.1 step 2 scoping, non-negotiable
       and p.name_norm like any (pat.a)

    union   -- deliberately UNION, not UNION ALL: a row both arms match must appear once, and the
            -- dedup runs over at most `limit`-many rows. See §4 above for why this is not an OR.

    -- ARM 2 — the trigram arm. This is the half that was missing.
    -- `operator(extensions.<<%)` is schema-qualified because pg_trgm lives in `extensions`, not
    -- `public` (0010, a security decision — every function it creates would otherwise arrive
    -- EXECUTE-able by PUBLIC in `public`). Only the OPERATOR form is index-backed;
    -- `strict_word_similarity(...) > x` written out is not.
    select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
           p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence, p.name_norm
      from tok
      join public.poi_index p on tok.t operator(extensions.<<%) p.name_norm
     where p.region_id = any(p_region_ids)
  )
  select h.dataset_place_id, h.region_id, h.name, h.alt_names, h.provider_category,
         h.address_line, h.locality, h.lat, h.lng, h.dataset_confidence
    from hit h
   -- THE CAP IS NOW PRINCIPLED, WHICH IT WAS NOT BEFORE. The shipped adapter sent `.limit(500)`
   -- with no ORDER BY at all, so which 500 rows survived was whatever the plan happened to emit —
   -- `10` §5's "a cap can silently exclude the true match" in its worst form. Ordered by the
   -- prefilter's OWN criterion (best per-token match), then by `10` §5's whole-string similarity,
   -- then by the primary key so the result is reproducible run to run.
   --
   -- This is a RECALL order, not a ranking: `score.ts` alone decides what wins. Nothing downstream
   -- reads this order, and it must stay that way — the day it does, there are two rankers.
   order by (select pg_catalog.max(extensions.strict_word_similarity(t, h.name_norm)) from tok)
              desc nulls last,
            extensions.similarity(h.name_norm, p_query_norm) desc,
            h.dataset_place_id
   -- Server-side ceiling mirroring `MAX_PREFILTER_ROWS`. Clamped rather than trusted: the cap is
   -- the thing standing between 8 candidates per import and a timeout, so it does not live only in
   -- the caller. A null or absurd `p_limit` lands on 500, never on "unbounded".
   limit least(greatest(coalesce(p_limit, 500), 1), 500);
$fn$;

comment on function public.poi_prefilter(text[], text[], text, integer) is
  'Region-scoped two-arm POI prefilter (10 §5): per-token substring OR per-token trigram '
  '(strict_word_similarity > 0.37, pinned on the function). SECURITY INVOKER, service_role only — '
  'poi_index carries no browser grant and resolution is server-side (06 §11 Q6). Read-only, '
  'capped at 500 rows, ordered by best per-token match so the cap keeps the most similar rows.';

-- `from public` FIRST, and it is not a formality — see §3. `anon` and `authenticated` are named as
-- well so the intent survives a future reader who has not read 0009's and 0018's history.
revoke all on function public.poi_prefilter(text[], text[], text, integer)
  from public, anon, authenticated;
grant execute on function public.poi_prefilter(text[], text[], text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- POST-CONDITIONS, asserted at migration time rather than eyeballed.
-- ---------------------------------------------------------------------------------------------
-- `inventory.sql` check 6 is the exhaustive, permanent assertion that no browser role can execute
-- anything it should not, and it would catch a missing revoke here. These run EARLIER — inside the
-- migration that creates the function — so the failure names this file instead of surfacing as
-- generic grant drift later, and so the volatility/definer/search_path properties (which check 6
-- does not look at) are pinned too.
do $$
declare
  v_oid    oid;
  v_config text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'poi_prefilter';
  if v_oid is null then
    raise exception '0021: public.poi_prefilter was not created';
  end if;

  -- 1. It cannot write, and it cannot be elevated.
  if (select prosecdef from pg_proc where oid = v_oid) then
    raise exception '0021: poi_prefilter is SECURITY DEFINER; it is designed as INVOKER (see header §3)';
  end if;
  if (select provolatile from pg_proc where oid = v_oid) <> 's' then
    raise exception '0021: poi_prefilter must be STABLE (it reads poi_index and writes nothing)';
  end if;

  -- 2. The two pinned settings. A SECURITY DEFINER function without a pinned search_path is a
  --    privilege-escalation bug; an INVOKER one without it is a correctness bug (the body would
  --    resolve `poi_index` through the caller's path). The threshold is pinned for a different
  --    reason: it is the tuning constant, and it must not be inheritable from a pooled session.
  select pg_catalog.array_to_string(proconfig, ',') into v_config from pg_proc where oid = v_oid;
  if v_config is null or v_config not like '%search_path=%' then
    raise exception '0021: poi_prefilter has no pinned search_path (proconfig = %)', coalesce(v_config, '<null>');
  end if;
  if v_config not like '%pg_trgm.strict_word_similarity_threshold=0.37%' then
    raise exception '0021: poi_prefilter does not pin the trigram threshold at 0.37 (proconfig = %)', v_config;
  end if;

  -- 3. The grant matrix, in BOTH directions. has_function_privilege accounts for privileges held
  --    via PUBLIC, which is the whole point: `revoke from anon` alone would leave this green-
  --    looking and wide open.
  if not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception '0021: service_role cannot execute poi_prefilter — the resolver would fail at run time, in the import path';
  end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '0021: anon can execute poi_prefilter (security.md §1: anon holds nothing, ever)';
  end if;
  if pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '0021: authenticated can execute poi_prefilter — poi_index has zero browser grants (10 §6) and resolution is rate-limited server-side (06 §11 Q6)';
  end if;

  raise notice '0021: poi_prefilter created — STABLE, SECURITY INVOKER, search_path pinned, threshold 0.37, service_role only';
end
$$;

-- 4. The behaviour, asserted only where there is data to assert it against. This block is a no-op
--    on a freshly reset database (poi_index is loaded by scripts/poi-ingest, not by a migration or
--    by seed.sql), which is why it is guarded rather than unconditional: a migration that fails on
--    an empty database is a migration that cannot be applied to staging.
do $$
declare
  n_before integer;
  n_after  integer;
begin
  if not exists (select 1 from public.poi_index where region_id = 'tlv' and name_norm = 'bellboy') then
    raise notice '0021: skipping the TLV-12 behavioural check — no loaded `bellboy` row to check against';
    return;
  end if;

  -- The substring arm alone, which is what shipped: zero rows for the misspelling.
  select count(*) into n_before
    from public.poi_index
   where region_id = 'tlv' and name_norm like '%belboy%';

  -- Both arms, through the function actually being installed.
  select count(*) into n_after
    from public.poi_prefilter(array['tlv'], array['belboy'], 'belboy tel aviv', 500);

  if n_before <> 0 then
    raise exception '0021: the substring arm now matches `belboy` (% rows) — this migration''s premise no longer holds; re-measure before trusting the threshold', n_before;
  end if;
  if not exists (select 1 from public.poi_prefilter(array['tlv'], array['belboy'], 'belboy tel aviv', 500) r
                  where r.name = 'Bellboy') then
    raise exception '0021: the trigram arm does not return Bellboy for `belboy` — the threshold is wrong';
  end if;
  raise notice '0021: TLV-12 recovered — substring arm % rows, two-arm prefilter % rows, Bellboy present', n_before, n_after;
end
$$;
