# Scale — No Crumbs

> **M8**, the course's basic scale document (`docs/03-university-requirements.md`).
> Written **2026-08-31** against base commit **`2fae46ba`** on branch `no-crumbs-implementation`.
>
> **The question this answers is the one the course asks: what happens at tens or hundreds of
> users.** Not millions. A document about sharding a product with two hundred rows in it would be
> the wrong answer confidently delivered, and this project's own house rule is that an uncertain
> answer beats a confidently wrong one. Where the honest answer is "nothing happens, and here is
> why", that is what is written — and §9 still names the first thing that breaks, and at roughly
> what number.
>
> **Evidence labels.** **MEASURED** = I ran it against the local Postgres 17.6 container on
> 2026-08-31 and the plan is in §12. **PRIOR MEASUREMENT** = a number measured earlier in this
> repo, cited to the file that recorded it. **DERIVED** = arithmetic from the DDL or from
> documented vendor limits, not observed. Every claim about an index, a constraint or a grant was
> read out of the migration file cited beside it; nothing here is taken from prose.

---

## 1. The system in one paragraph

A signed-in user pastes a TikTok link. The server reads the post's caption through TikTok's oEmbed
endpoint, sends it to a language model, gets back candidate place names, resolves each one against
Google Places, and — after the user confirms — writes a row into their library. The map draws that
library. Everything a user sees is their own rows, plus the shared identity of places other people
also saved, plus whatever a collaborator shared with them in a collection. There is one role
(`authenticated`) and one anonymous surface (sign-in). Row-level security, not application code, is
what makes one user's library invisible to another.

---

## 2. The data model, and the distinction that runs through this whole document

**Some tables grow with the number of users. Some grow with the number of distinct real-world
things.** That split decides which query is dangerous and which index is load-bearing, so it comes
first.

| Table | Scope | Grows with | Rate |
|---|---|---|---|
| `profiles` | per-user | signups | 1 per user (`0002`) |
| `imports` | **per-user** | pastes | 1 per paste, forever — it is the audit record, there is no DELETE grant (`0003:130–141`) |
| `sources` | **globally shared** | *distinct TikTok posts ever pasted by anyone* | 1 per post, deduped on `(platform, platform_source_id)` (`0003:40`) |
| `extractions` | **globally shared** | distinct posts × model/prompt versions | unique on `(source_id, model, prompt_version)` (`0004:20`) |
| `places` | **globally shared** | distinct real-world POIs | 1 per resolved POI; a second user saving the same restaurant adds **no** row |
| `place_provider_refs` | globally shared | provider aliases per place | ≥1 per place (`0005:42`) |
| `saved_places` | **per-user** | saves | 1 per (user, place); unique (`0006:23`) |
| `saved_place_sources` | per-user | provenance links | ≥1 per imported save (`0006:35`) |
| `place_mentions` | **per-user** | candidates that did not become places | 1 per kept-for-later mention (`0031:234`) |
| `collections` / `_members` / `_items` / `_invites` | per-user | hand-made lists | tens per user at most (`0024`) |
| `place_lookups` | globally shared | provider responses | bounded by a **28-day TTL** (`0023`, `lookup-cache.ts:92`) |
| `poi_index` | **global, rebuildable** | cities ingested, *not* users | 10,462 rows for Tel Aviv (PRIOR MEASUREMENT, `0021` §4) |

Two consequences worth stating plainly, because an examiner will ask:

1. **The shared tables are the ones that grow superlinearly with product success, and they are the
   ones no user query scans.** Every read of `places` is reached *through* a user-scoped row —
   either the reader's own `saved_places` row (`places_select_if_saved`, `0006:150`) or a
   collection they are a member of (`places_select_if_in_shared_collection`, `0024:582`). There is
   no product query anywhere that says "select from places where …". `poi_index` is stricter still:
   it carries **zero grants to `anon` or `authenticated`** (`0010` §5, Q2), so a browser cannot
   query it at all.
2. **The per-user tables are the ones the user's own screens scan, and they are small by
   construction.** A library is tens to low hundreds of rows. The design target written down before
   this document is *"100+ saved places across many countries, on a phone, one hand"*
   (`ux-library-at-scale.md`). That is the size the queries below have to be good at.

**Arithmetic at the course's scale.** 200 users × 40 pastes each = 8,000 `imports` and at most
8,000 `sources`. About 27% of imports yield a place (`CLAUDE.md`, LEVEL B hit rate), so roughly
3,000–4,000 `saved_places` and fewer `places` after dedup. Add collections and mentions and the
whole database is **under 50,000 rows**. Postgres does not notice a database of 50,000 rows. The
largest single object is not user data at all: it is `poi_index`, at ~45 MB for three cities
(`06` §5) against Supabase's 500 MB free tier.

---

## 3. The heavy queries, named

Six queries matter. For each: what it scans, which index serves it, and what happens as rows grow.

### Q1 — the map / library read. **This is the dangerous one.**

`getSpots()` — `src/app/map/_lib/get-spots.ts:225`:

```
select <22 columns>, place:places(10 columns), saved_place_sources(source:sources(5 columns))
  from saved_places
 order by created_at desc
```

**There is no `LIMIT`, no `WHERE`, and no viewport bound.** It returns the user's entire library on
every render of `/map`, and `/profile` runs it a second time alongside a second full-library read
(`profile/page.tsx:79–83`, and the comment there says so deliberately).

*What it scans (MEASURED, 30,008 `saved_places` rows across 200 users, 150 for the reader):* a
bitmap index scan on `saved_places_user_place_unique` returning exactly the reader's 150 rows, then
a `Memoize` + primary-key lookup into `places` per row, then a sort. **1,052 shared buffers,
0.570 ms.** It never touches another user's rows — the RLS predicate is an index condition, not a
post-filter.

*The part worth understanding:* the `places` RLS is `EXISTS(subplan) OR place_is_in_my_collection(id)`
and it is evaluated **once per returned row**, 450 of those 1,052 buffers. The cheap arm runs first
as an index-only scan on `saved_places_place_user_idx` (`0006:100` — that index exists for exactly
this), and because `OR` short-circuits, the `SECURITY DEFINER` function
`place_is_in_my_collection` is only called for places the reader has *not* saved. Ordering the two
arms the other way round would call a function per row instead of probing an index per row.

*As rows grow:* cost is linear in **the reader's own library**, not in the table. Ten thousand
other users cost this query nothing. What does hurt is the payload — §6.

### Q2 — the same read with a `LIMIT`, which is what pagination would buy

MEASURED, same dataset: adding `order by created_at desc limit 50` changes the plan outright. The
planner switches to `saved_places_user_recent_idx` (`0006:99`), the sort disappears entirely, and
the cost falls from 1,052 buffers to **402 — 2.6× less work** at 0.251 ms. The ordered index is
already in the schema and today's query cannot use it, because a query with no `LIMIT` has to read
everything anyway and sorting 150 rows in memory is cheaper than walking an index. **Pagination is
the one change that would make an existing index start earning its keep.**

### Q3 — the saved-list read with search and category filter

**This query does not exist.** Search, the category filter, the tag chips and the been / not-been
filter are all **client-side array operations** over the array Q1 already returned
(`src/components/map/filter-places.ts:35`, applied in `src/app/map/map-page-client.tsx:697`). The
database is not asked.

That is the right call at this scale and it should be said as a decision rather than an omission: a
filter over 150 objects already in memory is instant, needs no round trip, and lets the map pins and
the list agree by construction because they are literally the same array. It stops being the right
call when the array stops fitting comfortably in a phone's memory — §9.

For completeness I measured what the server-side version would cost: `p.name ilike '%…%'` over the
reader's library is **1,053 buffers, 0.565 ms** (MEASURED), and no index can serve it — a leading
wildcard is unindexable without a trigram index, and the driving side is `saved_places` anyway.
Moving search to the server would make it *slower*, not faster, until the library is large enough
that shipping it costs more than querying it.

### Q4 — the collections index read

`getCollections()` — `src/app/collections/_lib/get-collections.ts:136`, whose select
(`SUMMARY_SELECT`, line 96) embeds **every item of every collection the user is in**, joined to
`places`, in order to produce two things: a count, and five category chips.

MEASURED at 400 memberships / 16,000 collection items, reader in 2 collections of 40 items:
**1,289 buffers, 2.081 ms** — more work than the whole map read, for 80 items. It is index-served
throughout (`collection_members_user_idx` → `collections_pkey` → `collection_items_order_idx`), and
984 of those buffers are the `places` RLS re-check running once per item.

*As rows grow:* linear in *the total number of items across all the user's collections*. Fine at
tens; this is the read that gets expensive first if collections become large, and it is expensive
for a reason the UI does not need — see §6.

### Q5 — the POI resolver's prefilter (`poi_prefilter`, `0021` + `0022`)

The heaviest query in the system by a wide margin, and the only one that touches a six-figure table.
Three arms, `UNION`ed so each is planned and costed independently rather than `OR`ed into one
`WHERE`:

| Arm | Predicate | Index | Migration |
|---|---|---|---|
| 1 | `name_norm like any (patterns)` | `poi_index_name_trgm_idx` (GIN, `pg_trgm`) | `0010:169` |
| 2 | `token <<% name_norm` (`strict_word_similarity` > 0.37) | the **same** GIN index — `gin_trgm_ops` serves `%`, `<%`, `<<%` and `LIKE` alike | `0021` §4 |
| 3 | `address_line ilike` a single leading token, then `ilike all(tokens)` | `poi_index_address_trgm_idx` (GIN) | `0022:169` |

PRIOR MEASUREMENT, recorded in the migrations themselves against the real 10,462 Tel Aviv rows:
**1.17–2.0 ms** for realistic captions; **38–53 ms** worst case (twelve generic tokens, 1,383 rows
matched, the cap actually biting); the naive `OR ... EXISTS(unnest())` form sequential-scans at
**31.7 ms, 24× slower**; arm 3 is **0.475 ms with the index against 6.5 ms without**. I could not
reproduce these today — the local `poi_index` is empty (0 rows, MEASURED) — so they are cited, not
re-measured.

Two caps keep this bounded and both are enforced **server-side in the function**, not only in the
caller: at most 12 query tokens (`0021:251`, mirroring `MAX_PREFILTER_TOKENS`) and at most 500 rows
(`limit least(greatest(coalesce(p_limit, 500), 1), 500)`, `0021:314`). The `ORDER BY` before that
`LIMIT` is what makes the cap principled rather than arbitrary: rows are ordered by best per-token
similarity, so the 500 that survive are the 500 most likely to contain the true match. The shipped
adapter before `0021` sent a bare `.limit(500)` with no ordering at all, which is a silent
recall bug rather than a performance one.

**This query is not on the hot path today.** Google Places is the canonical resolver
(`place-resolver-factory.ts`); `poi_prefilter` is production's ToS-gated fallback. It also runs at
most a handful of times per *import*, never per page view.

### Q6 — the invite lookup, and the one index the schema deliberately does not have

`getActiveInvite()` (`get-collections.ts:332`) filters `collection_invites` by `collection_id` with
`revoked_at is null`. `0024:189–191` states outright that no index on `collection_id` is created,
and why. MEASURED at 2,400 invite rows: **a sequential scan of the whole table, 137 buffers,
0.393 ms** — the DDL's judgement holds. See §5 for when it stops holding.

---

## 4. What happens at tens or hundreds of users

Nothing, and the reason is structural rather than lucky.

- **Every user-facing read is scoped by `user_id` at the index level.** RLS predicates are written
  as `user_id = (select auth.uid())` — the scalar-subquery form, evaluated once per statement as an
  `InitPlan` rather than once per row (`0002:23–24` explains the choice). MEASURED: it lands as an
  `Index Cond`, not a `Filter`, in every plan in §12. **A user's cost does not depend on how many
  other users exist.**
- **The globally-shared tables are reached only through a user-scoped row**, so their growth does
  not enter any per-request plan.
- **Concurrency is a Supabase pooler concern, not a query concern.** At hundreds of users the
  request rate is a handful per second and every query above is sub-3 ms.

The load that scales with *users* rather than with *one user's data* is not the database at all. It
is the external services in §8.

---

## 5. Indexes

### What exists (MEASURED — read from `pg_indexes` on the local container)

**Load-bearing — a named query above degrades without it:**

| Index | Serves | Migration |
|---|---|---|
| `saved_places_user_recent_idx (user_id, created_at desc)` | Q1's ordering; the *only* index Q2's paginated form can use | `0006:99` |
| `saved_places_user_place_unique (user_id, place_id)` | Q1's driving scan today; also the "no duplicate save" constraint | `0006:23` |
| `saved_places_place_user_idx (place_id, user_id)` | the `places` and `place_provider_refs` RLS `EXISTS`, which lead on `place_id` and cannot use the index above | `0006:100` |
| `collection_members_user_idx (user_id, joined_at desc) where removed_at is null` | Q4's driving scan; partial since `0026` so tombstoned memberships are not walked | `0024:136`, `0026:131` |
| `collection_items_order_idx (collection_id, position, created_at)` | Q4 and the single-collection read, in display order | `0024:168` |
| `collection_items_place_idx (place_id)` | `place_is_in_my_collection`, called from the `places` SELECT policy — the DDL calls it "not optional" and it is right | `0024:173` |
| `poi_index_name_trgm_idx` (GIN) | Q5 arms 1 **and** 2 | `0010:169` |
| `poi_index_address_trgm_idx` (GIN) | Q5 arm 3; 13× measured | `0022:169` |
| `imports_source_idx (source_id, user_id)` | the `sources` membership gate (`0006:163`) | `0003:96` |
| `sps_source_idx (source_id, user_id)` | the second arm of that same gate | `0006:48` |
| `place_mentions_saved_place_idx (saved_place_id, user_id)` | the FK `SET NULL` lookup Postgres runs on **every** saved-place delete; without it that is a sequential scan per delete | `0031:355` |
| `collection_members_one_owner_idx` (partial unique) | "exactly one live owner", enforced by the database rather than by policy arithmetic | `0024:133`, `0026:127` |
| `imports_open_one_per_source` (partial unique) | idempotency: one open import per (user, post) | `0003:102` |

**Speculative, and the schema says so itself:**

- `saved_places_tags_gin` (`0019:439`). `0019` §5 measured it as **decorative** — at a few hundred
  rows the planner prefers `saved_places_user_recent_idx` plus a heap filter — and created it
  anyway with a written note to drop it if it is still unused when a library grows. It is now
  *more* speculative than when it was written, because tag filtering moved to the client (Q3) and
  **no server query reads `tags` at all**. MEASURED: it costs 1,360 kB at 30,000 rows.
- `places_lat_lng_idx` (`0005:39`). The DDL is explicit that it is for "whole-table geographic
  maintenance only; no per-user query needs it", and my Q3 bounding-box measurement confirms it: a
  viewport query is driven from `saved_places` (RLS makes it so), so the coordinate predicate lands
  as a `Filter` on the `places` primary-key lookup and this index is never consulted. It is honest
  in the DDL and it is unused in practice.
- `poi_index_lat_lng_idx` (`0010:172`) — for a "search near me" surface that does not exist yet.

**Index cost, MEASURED:** `saved_places` carries **six** indexes. At 30,008 rows they total
**~15 MB**, more than the table's own heap. That is the correct trade for a table read constantly
and written rarely, and it is worth saying out loud rather than leaving as an accident.

### The finding: one index is missing, and it is Q6's

`collection_invites` has **no index on `collection_id`** (`0024:189–191`), by an explicit decision
recorded in the DDL: "the only query that leads on it is the owner listing their own invites, over a
table with a handful of rows per collection."

That reasoning is right about *rows per collection* and wrong about *rows per table*.
`collection_invites` is a **globally growing table read by a per-user query** — the one shape §2
says to watch for. Q6 measured a full sequential scan of 2,400 rows at 0.393 ms, which is fine; the
scan is linear in the total number of invites ever created **product-wide**, and it runs every time
any owner opens any collection. At tens of thousands of invite rows it is tens of milliseconds on a
page open, which is the point at which it stops being free.

**Recommendation:** add `create index collection_invites_collection_idx on public.collection_invites
(collection_id) where revoked_at is null;` when the table passes a few thousand rows. It is not
needed at the course's scale and I am not proposing it be added blind — but it is the one place
where the schema's own justification does not survive the growth model, and it should be named.

There is a second, milder version of the same shape: the RLS predicate on `collection_invites`
calls `collection_role(collection_id)`, a `SECURITY DEFINER` function. MEASURED, the planner
correctly evaluated the cheap `collection_id` equality first and called the function only for the 6
surviving rows. On a query with **no** equality predicate to lead with, the same plan would call it
2,400 times — each call an index lookup. **A `SECURITY DEFINER` function in a policy is only cheap
while something cheaper narrows the scan first**, and adding the index above is what guarantees
that stays true.

---

## 6. Over-fetching and pagination

**There is no pagination anywhere in this product.** The only `.limit()` calls in `src/` are three
`.limit(1)` singleton lookups (`collections.ts:178`, `get-collections.ts:337`,
`confirm/route.ts:328`). No `.range()`, no cursor, no infinite scroll. Stating that plainly is more
useful than defending it.

Whether that is a defect depends on the surface:

**The map: nothing bounds the number of pins.** It is a map, so the natural bound is the viewport —
and the product does not use it. `getSpots()` fetches the whole library and `MapPageClient` receives
all of it. The rendering side *is* banded — `place-marker-layer.tsx` carries a `minzoom` floor and
below it `summary-marker-layer.tsx` draws one marker per ~50 km area and then one per country
(`ux-library-at-scale.md` §0, the repair `06` §9.1 named) — but that is a **rendering** strategy,
not a **fetching** one: the GeoJSON source still holds every saved place as its own feature at every
zoom, with no clustering, by explicit decision. **This is a current limitation and it belongs in
§10.**

It is also, at today's sizes, the right trade, and the reason is specific to this product rather
than general: the map has to fit a camera box around the *whole* library on first paint
(`current-state.md` item 0a — opening zoomed into one cluster was a real, fixed bug), the list and
the pins must agree, and search must find a place that is off-screen. Every one of those needs the
whole set. A viewport query would have to be paired with a separate "give me the bounds of
everything I have" query, and would make an off-screen search result unreachable.

**The payload, MEASURED on the 8 real rows in the local database** through the exact column list
`SAVED_PLACES_SELECT` requests: **1,306 bytes per saved place on average, 2,011 at the widest.**
Then `toMapPlace` (`to-map-place.ts:34`) attaches the entire `Spot` under `detail` *in addition to*
the flattened fields beside it, so the RSC payload carries roughly 1.4× that. DERIVED from those
bytes:

| Library size | Payload per `/map` render |
|---|---|
| 50 places | ~90 kB |
| 150 places | ~270 kB |
| 300 places | ~550 kB |
| 1,000 places | ~1.8 MB |

**Column-level over-fetching is genuinely well controlled**, and that is not an accident of taste —
it is enforced by the database. `sources` grants `authenticated` a **named column list** that
deliberately omits `content_text` (`0003:114`), so `select *` on that table fails with permission
denied and the caption can never reach a browser. `places` hands a collaborator identity columns
only; a collection share carries no note, no tags and above all no `visit_state`, because that is a
statement about where a person intends to be (`0024:560–580`). Nothing in `src/` asks for a column
it does not render.

**The one real over-fetch is Q4.** The collections index pulls every item of every collection,
joined to `places`, to compute a count and five category chips. The count is `count(*)`; the chips
are five distinct categories. Both are aggregates the database could return in a few dozen bytes,
and instead ~80 joined rows crossed the wire in my measurement. At 40-item collections it is
invisible; at 500-item collections it is the first thing to fix, and the fix is an aggregate — a
view or an RPC returning `(id, name, place_count, top_categories[])` — not pagination.

---

## 7. The client/server split

**Server Components do all data fetching.** Every route's `page.tsx` is a server component that
builds a cookie-bound Supabase client (`src/app/_lib/supabase/server.ts`) and queries under the
**anon key carrying the user's JWT** — so every one of those queries is subject to RLS. `/map`
issues its reads in one `Promise.all` and skips the collections queries entirely on the places view
(`map/page.tsx:95–100`), so the common route pays exactly the two round trips it needs.

**Client Components hold interaction, not data.** 67 files carry `'use client'`; they exist because
MapLibre needs the DOM, and because the drawer, sheets, filter chips and search box are state. They
receive already-fetched arrays as props and **make no data queries of their own** — search and
filtering are array operations (§3, Q3). The browser client (`src/lib/supabase/client.ts`) holds
only the anon key and is used for authentication, and its own header says why that key is public by
design: RLS is the authorisation boundary, not the secrecy of a key.

**Mutations are Server Actions** (`src/app/actions/*.ts`), also under the anon key and RLS. A
mutation that RLS or a column grant forbids fails at the database. Several are unexpressible from
the browser by construction rather than by policy: `saved_places` grants `UPDATE` on five overlay
columns only, so "move my save onto someone else's place" cannot be written (`0006:117`);
`collection_members` has **no `INSERT` grant at all**, so a membership row cannot be forged even if
a policy were later widened (`0024:118–127`).

**The service-role key never reaches the browser, and three independent things ensure it.**
It is read only by `src/integrations/supabase/service-role-client.ts`, whose first line is
`import 'server-only'` — a build-time error if a client component ever pulls it in (21 files carry
that import). Its environment variable is `SUPABASE_SERVICE_ROLE_KEY`, with no `NEXT_PUBLIC_`
prefix, so Next.js will not inline it into a client bundle; the only `NEXT_PUBLIC_*` values in the
codebase are the Supabase URL, the anon key, two map keys and two build-identity strings. And it is
reachable only from the two API route handlers, each of which calls `supabase.auth.getUser()`
**before** the service client is constructed (`probe/route.ts`, `POST` — `createClient()` and `getUser()` precede `serviceRoleClient()`). The standing review rule,
written in that client's own header: **a service-role query never filters by `user_id`** — the only
rows it touches are the global `sources`/`extractions`/`place_lookups` caches, which have no user
column. Reading on a user's behalf with it would silently bypass every policy in §5.

**One correction to the codebase's own comments, found while writing this.**
`src/app/map/page.tsx:17` says "the middleware already redirects an unauthenticated visitor
server-side". **There is no `middleware.ts` in this repository** (MEASURED — `find`, whole tree).
The redirect works because every page that renders user data calls `getUser()` and redirects
itself, which the same comment calls its belt-and-suspenders check. The safety property holds; the
stated reason for it does not. It is noted here rather than fixed because this task's write scope is
this file.

---

## 8. The external-service ceilings — the real limit, and it is denominated in money

Per import, in order:

| Call | Count | Cost | Source |
|---|---|---|---|
| TikTok oEmbed | 1 | free, rate limit undocumented | `04` |
| Language model (`claude-haiku-4-5`) | 1, only when a caption exists | **$0.005880** | PRIOR MEASUREMENT, `evidence/extraction/engine2-cost-model-2026-08-31.md` §5.2 |
| Google Places Text Search | **up to 8** — one per in-budget candidate, `MAX_CANDIDATES = 8` (`pipeline.ts:65`) | 5,000/month free, then ~$32 CPM | `06` §11 |

Three ceilings follow, and **the binding one is not the database**:

1. **`SearchTextRequestPerDayPerProject = 100`.** The Cloud project behind the live key carries a
   hard cap of **100 Text Search requests per day**, project-wide
   (`src/integrations/google/place-resolver.ts:86`, PRIOR MEASUREMENT). At 2–8 lookups per import
   that is **roughly 12–50 imports per day across every user of the product combined.** At 100
   users that is well under one import per user per day. **This is the ceiling that is live today**,
   and raising it is a console and billing action for the owner, not an engineering change.
2. **The free tier: 5,000 Text Search calls per month** → roughly 600–2,500 imports/month before
   any bill exists at all. Beyond it, ~$0.032 per lookup dominates the $0.0059 model call by a
   factor of five to forty.
3. **73% of imports return zero candidates** (`CLAUDE.md`; the cost model's §5.3 tables the
   evidence) — and **they still pay the full model call.** The largest cost lever in the product is
   therefore not compute: the 411-line system prompt is 83% of the bill on *every* import including
   the ones that find nothing (`engine2-cost-model` §0.3).

**What is already done about it.** `place_lookups` is a shared provider-response cache with a
28-day TTL, wired through two RPCs (`0023`) — and that TTL is not a tuning knob, it is Google's
Service Specific Terms §5.4 enforced *in the database*: `place_lookup_put` **raises** on a `google`
row with a null or over-30-day TTL, so the compliance limit survives a careless refactor of the
caller. Failed lookups get a 1-day negative TTL so a transient outage cannot poison a place for a
month (`lookup-cache.ts:119`). The cache is shared globally, so the second user to save a
much-recommended restaurant costs nothing.

**One more ceiling, and it is ours.** Neither `vercel.json` nor any route exports `maxDuration`
(MEASURED — no such file, one grep hit and it is a comment). The import route runs
oEmbed → model → up to eight sequential provider lookups inside a single request, and
`probe/route.ts`'s own header still describes itself as a dev-only route for which the serverless timeout is
"a deploy concern" — but it is what production uses, because the streaming route (`L0-F6`) was never
built. A slow chain hits Vercel's default function duration and the user sees a failure with no
recoverable state. Setting `maxDuration` explicitly is a one-line change and should be made.

---

## 9. What breaks first, and at roughly what number

In the order it will actually happen:

1. **The Google Places daily quota, at ~12–50 imports per day product-wide.** Today. It is already
   the binding constraint, it is the reason "the product works" and "the product is usable by a
   hundred people" are different statements, and it is fixed with a billing change rather than
   code.
2. **The import request's wall-clock time**, on any import with several candidates and a slow
   provider — a per-request failure, not a scale wall, but it arrives at one user, not at a
   hundred.
3. **The map payload, at roughly 500–1,000 saved places in one library** (DERIVED from the measured
   1,306 bytes/place). Around 1 MB of RSC payload on every `/map` render, on a phone, plus a
   thousand-feature GeoJSON source rebuilt on every filter change and a thousand-element array
   re-filtered on every keystroke. The database
   is still answering in under a millisecond at that size; the *browser* is what degrades. This is
   several times the product's own stated design target of 100+ places, which is why it is third
   and not first.
4. **Q4's collections index read**, if collections become large — linear in total items across all
   of a user's collections, ~1,300 buffers for 80 items MEASURED.
5. **`collection_invites`'s missing index** (§5), at a few thousand invite rows product-wide.

**Nothing in that list is "the database at hundreds of users."** That is the honest headline of this
document.

---

## 10. Current limitations

Stated as defects, not as decisions, where they are defects:

1. **No pagination and no viewport bound on the library read.** `getSpots()` returns everything,
   always (§3 Q1, §6). The ordered index that a paginated form would use already exists and is
   currently unusable by the shipped query.
2. **`/profile` reads the whole library twice** in one render — two full-library queries, knowingly
   (`profile/page.tsx:79–83`).
3. **Q4 over-fetches structurally**: every item of every collection to produce a count and five
   chips (§6).
4. **`collection_invites` has no `collection_id` index**, and its per-user read scans a globally
   growing table (§5).
5. **`saved_places_tags_gin` serves no query at all.** Tag filtering is client-side; the index was
   already measured as decorative when it was created (`0019` §5).
6. **No `maxDuration` on the import route**, which runs a multi-second external chain (§8).
7. **The Google daily quota is a product-wide ceiling of ~100 lookups/day** and is not a code
   problem, but it is the real scale limit and it is not written down anywhere a reader of the
   codebase would find it.
8. **No caching layer of any kind on the read path** — no `unstable_cache`, no revalidation tags,
   no `Cache-Control`. Every `/map` render is a fresh query. Correct today (a library changes
   whenever the user adds to it, and the data is per-user so a shared cache buys nothing) and worth
   naming so it is not mistaken for an oversight.
9. **`places_lat_lng_idx` and `poi_index_lat_lng_idx` are unused** by any product query (§5).
10. **Staging is eight migrations behind production** (`current-state.md`). Not a query-performance
    fact, but any statement in this document about "the schema" describes **local at `0031`** and
    **production at `0026`** — production does not yet have `place_mentions` or the taxonomy
    alignments.

---

## 11. What I would do for larger scale, in the order I would do it

*(This section feeds M11's "what would you improve with more time" slide.)*

1. **Raise or replace the Google quota, and make the cost visible.** Everything else is theory
   until an import can be run more than fifty times a day. Pair it with a per-user daily import cap
   so one user cannot spend the whole product's budget — the `imports` table already has
   `imports_user_recent_idx (user_id, created_at desc)` (`0003:95`), which is precisely the index a
   rate limiter needs, and there is no rate limiter using it.
2. **Cut the model bill before adding capability.** 83% of every import's cost is our own 411-line
   prompt, and 73% of imports return nothing. Prompt caching, a shorter system prompt, or a cheaper
   model on the first pass is a multiple-times saving with no product change.
3. **Set `maxDuration` and finish the streaming import route (`L0-F6`).** It converts the longest
   request in the product from a timeout risk into progress on screen.
4. **Paginate the library read and add a viewport query** — but only once a real library passes a
   few hundred places, and keeping the "bounds of everything" query the camera fit needs. Measured
   payoff: 2.6× fewer buffers and no sort (§3 Q2), plus a payload that stops growing without bound.
5. **Turn Q4 into an aggregate** — a view or RPC returning `(id, name, place_count,
   top_categories[])` — so the collections index stops shipping items it does not render.
6. **Add `collection_invites (collection_id) where revoked_at is null`** at a few thousand rows.
7. **Drop `saved_places_tags_gin`** unless server-side tag filtering arrives, exactly as `0019`'s
   own note instructs.
8. **Only then**: read replicas, `pg_stat_statements` in production, connection pooling limits.
   None of these is warranted by anything measured here, and doing them first would be building for
   an imagined problem while the real ceiling is a number in a Google Cloud console.

---

## 12. How the measurements were taken

**Environment.** Local Supabase container `supabase_db_P-002`, **PostgreSQL 17.6** — the same image
the hosted projects are built from. Migrations `0001`–`0031` applied (30 rows in
`supabase_migrations.schema_migrations`; there is no `0027`). Base commit **`2fae46ba`**.

**Real row counts before any probe** (MEASURED): `sources` 9, `imports` 9, `saved_places` 8,
`places` 8, `place_provider_refs` 8, `poi_regions` 3, `place_lookups` 2, `profiles` 2,
`extractions` 2, and **`poi_index` 0** — which is why §3 Q5's numbers are cited from the migrations
that measured them rather than re-run here.

**Synthetic scale.** Because eight rows prove nothing about a plan, the query measurements were
taken inside a **single transaction that was rolled back**: 200 users, 5,008 `places`, 30,008
`saved_places`, 400 `collections`, 16,000 `collection_items`, then `ANALYZE`, then `set role
authenticated` with a JWT claim naming one of the 200 users so that **every plan below was produced
with RLS active as a real signed-in user**. `EXPLAIN (ANALYZE, BUFFERS)`. The transaction rolled
back, so no synthetic row survives; the tables were `VACUUM (ANALYZE)`-ed afterwards and the real
row counts above are unchanged.

**Results, as cited above:**

| Query | Buffers | Execution | Driving index |
|---|---|---|---|
| Q1 map/library read, no `LIMIT` | 1,052 | 0.570 ms | `saved_places_user_place_unique` + sort |
| Q2 same with `limit 50` | **402** | 0.251 ms | `saved_places_user_recent_idx`, **no sort** |
| Q3 bounding-box viewport | 617 | 0.322 ms | driven from `saved_places`; coordinates land as a `Filter` |
| Q4 collections index | 1,289 | 2.081 ms | `collection_members_user_idx` → `collection_items_order_idx` |
| Q5 server-side `ilike` search | 1,053 | 0.565 ms | none available for a leading wildcard |
| Q6 invite lookup, 2,400 rows | 137 | 0.393 ms | **sequential scan** |

**Payload size** was measured separately against the **8 real rows**, serialising exactly the
columns `SAVED_PLACES_SELECT` requests: mean **1,306 bytes**, max **2,011 bytes** per saved place.

**What I did not measure, and am not claiming.** No hosted database was touched — every number here
is local. No load test, no concurrency test, no cold-start measurement, and no `poi_prefilter` plan
(the local index is empty). The 30,000-row dataset is uniform synthetic data; a real distribution
would have skew this does not model. Sub-millisecond timings on a warm local container are not
production latencies — they are evidence about **plan shape and buffer counts**, which is what this
document actually argues from.
