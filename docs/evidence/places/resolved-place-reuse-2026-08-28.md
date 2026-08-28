# Reusing places we have already resolved — TRACK2-REUSE

**Date** 2026-08-28 · **Task** TRACK2-REUSE · **Branch** `feat/resolution-confidence`
**Question** should we keep an internal index of venues we have already resolved, so a second
import naming the same place does not pay to rediscover it?

**Ruling: build (a), the provider-response cache. Do not build (b), the alias index — not yet.**
The counted reason is in §3: on the only real corpus we have, **every repeated venue is a repeated
string**, so (b) would have resolved zero lookups that (a) does not already resolve.

---

## 1. What already exists

Checked before proposing anything, which was the instruction.

| Thing | Where | State |
|---|---|---|
| `public.place_lookups` | migration `0007_functions.sql` | Table exists. Deny-all RLS (ENABLE + FORCE, **no policy**), `service_role` granted in `0012`, partial index `place_lookups_expiry_idx` on `expires_at`. **0 rows. Nothing in `src/` referenced it** (`grep -rn place_lookups src/` was empty). |
| `place_provider_refs (provider, provider_place_id)` UNIQUE | `0005`/`0007` | The canonical-place-id home. Already collapses two resolutions of the same Google place onto one `places` row. |
| `places.name_key` + `places_name_key_idx (name_key, country_code)` | `0005` | Feeds `resolve_place`'s 75 m near-duplicate guard. A heuristic, not identity — `name_key` is not unique. |
| Extraction cache | `readCachedExtraction` in `/api/imports/probe` | Caches candidates **and** resolutions keyed on `(source, model, promptVersion, captionHash)`. Per **post**, so it never helps a second TikTok naming the same venue. |
| Gateway disk cache | `tests/manual/tiktok-recognition.manual.ts` | Already caches Google at the gateway, keyed on `[textQuery, regionCode, languageCode, maxResultCount]`. Gitignored, local only. This is the seam, already proven in the harness; it had simply never been given a shared home. |

The design docs had already ruled on most of this: `technical-design.md` R6/R11 put `place_lookups`
behind the `PlaceResolver` port, keyed on the normalised candidate, with `expires_at NULL` meaning
"cache permanently". So the infrastructure was right and unused.

---

## 2. The two mechanisms, ruled on separately

### (a) Provider-response cache — **IN SCOPE, built**

Same provider request → replay the stored provider answer, skip the network.

### (b) Alias / known-venue index — **OUT OF SCOPE, deferred**

`"קוהי" in Tel Aviv → Google place ChIJ…`, resolved directly without asking a provider.

Four reasons, in order of weight:

1. **It buys nothing measurable on real data.** §3: 0 of 16 corpus lookups reach a venue by a
   second, different string. Every repeat is byte-identical, and (a) catches those.
2. **The consistency problem it was proposed for is already solved by a constraint.** The duplicate
   `places` rows in `handoff-2026-08-28-categories-and-the-picker.md` §5 (HaKosem ×3, Kiaans /
   Kiaans Tooting, Sycamore ×2) were created with provider `llm_guess`, i.e. before a real resolver
   existed — the "provider id" was a model guess and differed every run. With Google answering,
   both spellings return the same `place_id` and `place_provider_refs (provider, provider_place_id)`
   UNIQUE collapses them to one row. An alias table would be a second, weaker mechanism for
   something an enforced constraint already does.
3. **It cannot be seeded honestly yet.** The bar would have to be "a `preselect` band this user
   confirmed". We have no confirm-outcome telemetry, so today the only available seed is the
   resolver's own guess — and a `confirm`-band guess becoming a permanent string→place fact is
   precisely the "convert uncertainty into certainty" failure the working agreement forbids.
4. **It has no correction path.** A wrong alias is wrong forever with no user-visible way to fix it,
   and no expiry, because the whole point of an alias is that it does not expire.

**Revisit (b) when** confirm-outcome telemetry exists **and** a measurement shows a material number
of venues being reached by more than one distinct candidate string. Neither is true today. When it
is, the cheapest correct shape is a small table keyed `(name_key, country_code) → place_id` seeded
only from user-confirmed saves, with a `confirmed_by_user_count` and an explicit demotion path —
**not** `place_lookups` with a second key discipline, because mixing a licence-expiring cache and a
permanent identity claim in one table is how the 30-day cap gets broken by accident.

There is a cheaper fix for the remaining duplicate class that does not need (b) at all, already
identified in the handoff: relax `resolve_place`'s `WHERE name_key = …` to a loose prefilter so the
75 m distance check is the actual decision. Kiaans/Kiaans Tooting are 18 m apart and Sycamore's two
rows 26 m — both blocked purely on spelling. That is one forward-only migration and it is a better
next step than an alias table. Not done here; it is a different task.

---

## 3. The counted hit rate

Source: `docs/evidence/places/tiktok-recognition-run.google.json` (real run, 2026-08-28, provider
`google`, 13-URL corpus `tests/manual/tiktok-recognition-corpus.json`). Counted, not estimated.

Keys computed exactly as the shipped resolver builds them —
`[textQuery, regionCode, languageCode, maxResultCount]`, where `textQuery = "<name>, <cityHint>"`.

| Measure | Count |
|---|---|
| Candidate lookups in the run | **16** |
| Distinct provider requests | **14** |
| Hits **within** a single first run | **2 of 16 (12.5%)** |
| Hits on a **second** run of the same corpus | **16 of 16 (100%)** — zero Text Search requests |
| Distinct venues resolved | 14 |
| Venues resolved more than once | 1 (`האחים`, from 3 different TikToks) |
| **Venues reached by more than one distinct request** | **0** |
| Zero-result lookups | 0 |

Two numbers carry the ruling:

- **16/16 on a second run.** Against a project quota of **100 Text Search requests per day across
  all users** (`integrations/google/place-resolver.ts`), a re-import is free and the second person
  to save a venue costs nothing.
- **0 venues reached by more than one distinct request.** This is the number that rules (b) out.
  The one repeated venue in the corpus repeats as the identical string `האחים, תל אביב` three times
  — which (a) already collapses to one request.

Also counted: adding `categoryHint` to the key changes nothing on this corpus (14 distinct keys
with it, 14 without), so the design doc's category term is pure downside risk. See §5.

---

## 4. The seam

**Below the ranker, at the provider request.** Not around `PlaceResolver`.

```
resolveCandidates
  └─ PlaceResolver.resolve(query, ctx)            ← ranked ResolveResult; NOT cached
       ├─ build GoogleTextSearchParams
       ├─ cachedProviderRows( … )                 ← THE CACHE, on raw GooglePlaceRow[]
       │     ├─ place_lookup_get(hash)            ← hit: return stored rows
       │     └─ gateway.searchText(params)        ← miss: network, then place_lookup_put
       └─ scoreCandidates(query, candidates, …)   ← always runs, on whatever the rows are
```

`PlaceResolver.resolve` returns a **ranked** `ResolveResult`, so a decorator around the port would
have cached ranked output. That is the trap: every scoring change would then either have to
invalidate the cache — a coupling nobody would remember — or would serve rankings the current
scorer would not produce. The category weight moved to 0 during this very session, which is the
concrete version of that risk rather than a hypothetical one.

Caching the raw rows instead means a scoring change simply re-ranks cached rows on the next
request, and a cached corpus run measures *current* code against *fixed* provider input. That is
exactly the argument the manual harness's own header already makes for its disk cache; this is that
seam moved into the product.

**The Overture resolver takes no lookup cache.** It queries a table in the same database, so an
entry would be a round trip saving a round trip, and it already holds a bounded in-process cache of
prefiltered rows for the within-import case.

---

## 5. The key

`sha256("v1" ␟ provider ␟ textQuery ␟ regionCode ␟ languageCode ␟ maxResultCount)`, hex — the shape
`place_lookups.lookup_hash`'s CHECK demands.

**It is the request, not a normalised candidate.** `technical-design.md` R6 specifies
`sha256(normalised_candidate + region_id + category_hint)`; this deliberately differs on both terms.

- **No normalisation.** Keying on the exact request makes the key *provably complete* — anything
  that can change the provider's answer is part of the request, therefore part of the key. A
  normalised key is a claim that Google answers two different strings identically, which we have
  never measured. And it buys nothing: `normalise()` over the corpus produces the same 14 distinct
  keys. It also keeps the shipped resolver and the recorded harness runs keyed identically, so
  evidence and production agree on what counts as the same lookup.
- **No `category_hint`.** It never reaches Google — `buildTextQuery` sends name + city only — so it
  cannot change the provider's answer. With `SCORING.total.category` at 0 it no longer changes the
  ranking either. A key term that cannot change the answer can only fragment the cache. Asserted:
  `googlePlaceResolver` spends one request for two resolves differing only in `categoryHint`.
- **`region_id` is a column, not a key term.** Google is global; the adapter stores `'global'`
  (`GLOBAL_REGION`) for the same reason it reports it in `regionsSearched` — an empty region list
  means "we have not loaded that city", which for a global provider would be a lie. The country
  *is* in the key, as `regionCode`.
- **`v1` prefix.** A change to the key recipe re-keys everything; old entries become unreachable
  and age out on their own TTL. Cheaper than a migration.
- **U+001F separator.** `['ab','c']` and `['a','bc']` must not collide, or one venue's answer gets
  served for another's request.

`response` holds `{ v, provider, rows }` — the raw provider rows plus an envelope version. A version
or provider mismatch is a **miss**, never a reinterpretation.

---

## 6. TTL per provider — a compliance boundary, enforced in the database

`06-map-and-places-decision.md` §3.1 is VERIFIED: Google's Service Specific Terms **§5.4** permit
caching Places content for at most **30 consecutive calendar days**; only `provider_place_id` is
exempt. A cached Text Search row carries `location.latitude/longitude`, so the whole entry is inside
that cap.

| Provider | TTL | Why |
|---|---|---|
| `google` | **28 days** | Under §5.4's 30-day cap, with slack because the prune is opportunistic rather than scheduled. |
| `overture` | `null` (indefinite) | Open data (ODbL). Declared, and unused — that adapter reads a local table. |
| `nominatim` | **not cacheable** | No adapter, and `06` §11 Q2 (the ODbL write path) is unsigned. Not cached until it is. |
| `llm_guess` | **not cacheable** | Not a provider we query; a model guess has no provider response to replay. |
| any answer with **zero results** | **1 day**, whatever the provider's policy says | A miss is a statement about the index *at a moment*. A venue that opens next week must not sit behind a 28-day "not found". |

`LOOKUP_TTL` is exhaustive over `PlaceProvider`, so adding a provider does not compile until
somebody rules on its caching policy.

Three things make this a boundary rather than a constant:

1. **`place_lookup_put` refuses a `google` write with a null or over-30-day TTL**, raising
   `check_violation`. The ceiling holds even if the TypeScript is changed carelessly — the same
   reasoning `place-resolver-factory.ts` gives for putting the non-Google-map gate in code.
2. **Expiry is decided by the server's clock**, inside `place_lookup_get`'s single `UPDATE …
   RETURNING`. A boundary evaluated against a caller's clock is not a boundary.
3. **Expired rows are deleted, not merely hidden.** §5.4 caps how long content may be *kept*, not
   how long it may be answered with, so a read gate alone would not satisfy it. Every
   `place_lookup_put` deletes up to 200 expired rows, riding `place_lookups_expiry_idx`. Bounded, so
   a cache write can never become a long transaction; no cron, no extension (D6).

---

## 7. What was built

| File | What |
|---|---|
| `supabase/migrations/0023_place_lookup_cache_rpcs.sql` | `place_lookup_get` / `place_lookup_put`. **NOT applied to staging or production.** |
| `src/integrations/places/lookup-cache.ts` | Key, TTL policy, `PlaceLookupStore` port, `cachedProviderRows`. |
| `src/integrations/supabase/place-lookup-store.ts` | The store over the two RPCs. Never throws. |
| `src/integrations/google/place-resolver.ts` | `GooglePlaceResolverOptions.lookupStore`, wired below ranking. |
| `src/integrations/places/place-resolver-factory.ts` | Composes the store. `PLACE_LOOKUP_CACHE=off` disables. |
| `supabase/tests/0008_policy_tests.sql` | P26a–P26g. |
| `tests/unit/integrations/places/lookup-cache.test.ts`, `.../supabase/place-lookup-store.test.ts`, additions to `.../google/place-resolver.test.ts` and `.../places/place-resolver-factory.test.ts` | 27 + 7 + 5 + 1 assertions. |
| `tests/manual/place-lookup-cache-live.manual.ts` | The live round trip against the local container. |

Neither function is `SECURITY DEFINER`. `place_lookups` has FORCE RLS with no policy, and
`service_role` has `rolbypassrls` plus the `0012` table grant, so invoker rights suffice — a definer
here would be privileged surface bought for nothing.

**Failure modes, all deliberate:** an unreadable entry, a database that is down, an envelope from a
future version, or a write refused by the 30-day ceiling all degrade to "ask the provider" and
"do not store". A cache that can fail an import is worse than no cache. A **provider** failure is
*not* swallowed — it still throws, so an outage can never be recorded as an empty answer.

---

## 8. Verified against the local container

`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, migration applied locally only.

- Put → get returns the response, `hit_count` 1, `last_hit_at` stamped.
- Expired entry (`expires_at = now() - 1s`) → `place_lookup_get` returns NULL.
- Next `place_lookup_put` deletes the expired row; the fresh one survives.
- `google` + `ttl_seconds = null` → refused. `google` + `30 days + 1s` → refused.
  `google` + 28 days → accepted. `overture` + null → accepted with `expires_at` NULL.
- `has_function_privilege`: `anon`, `authenticated`, `public` all **f** on both functions;
  `service_role` **t**.
- P26a–P26g run green; P26a and P26g were checked **failure-first** — granting `anon` EXECUTE and
  granting `authenticated` SELECT each produced the expected `FAIL`, inside a rolled-back
  transaction.
- `npm run db:inventory` passes unchanged (checks 3, 4c, 6, 6b, 9 all still green with the two new
  functions present).
- The live harness ran the real adapter against the real database and the row that landed was read
  back in psql:

```
lookup_hash | fd994cbd0940c33b758f9740f74eb5f5421368008fcc012d43f2fe0273677845
provider    | google
region_id   | global
hit_count   | 1
created_at  | 2026-08-28 10:44:03.289544+00
expires_at  | 2026-09-25 10:44:03.289544+00        -- 28 days
response    | {"v": 1, "provider": "google", "rows": [{"id": "ChIJ-trk2-fixture", …}]}
```

Raw provider rows, `region_id` `global`, a 28-day expiry, and one provider call for two resolves.
The fixture row was deleted afterwards; `place_lookups` is back to 0.

---

## 9. Not verified, and deliberately left out

- **The migration is local only.** `0023` has **not** been pushed to staging or production; that is
  the orchestrator's and the owner's call. Note also that the local `supabase_migrations` ledger
  stops at `0020` while `0021`, `0022` and now `0023` are applied to the local schema — pre-existing
  drift, not caused here, but it means `supabase migration up` is not a safe way to apply this.
- **No end-to-end import was run through the cache.** The route composes it via
  `createPlaceResolver`, and the adapter + database round trip is proven by the live harness, but a
  real TikTok import through the UI with the cache on has not been done — and it would spend real
  quota, which is at 100/day.
- **No metrics surface.** `hit_count` and `last_hit_at` are written and nothing reads them. A hit
  rate in production is a query, not a dashboard.
- **No cross-request coalescing.** Two concurrent identical lookups both miss and both call Google.
  One import resolves candidates sequentially, so this needs two simultaneous users importing the
  same venue; not worth a lock today.
- **The `resolve_place` name-key relaxation** (§2, the real fix for the remaining duplicate class)
  was not done. It is a separate migration and a separate task.
- **The alias index (b)** is not built. §2 states the two conditions for revisiting it.
