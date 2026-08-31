# How the system works — the study guide

> **What this is.** The internal explanation document the course recommends
> (`03-university-requirements.md` R2), written for one reader: the owner, the night before the
> viva, answering a question an examiner just asked.
>
> **How to read it.** One sentence per component, per library, per decision. It is a *map*, not a
> replacement — `product-specification.md` (M2), `technical-design.md` (M4), `scale.md` (M8) and
> `security.md` (M9) are the graded artefacts and this document does not duplicate them.
>
> **Everything here was checked against the code**, not against another document, on 2026-08-31 on
> branch `no-crumbs-implementation`. Where a document and the code disagreed, the code won and
> §11 says so.

---

## 1. The product in five sentences

1. **No Crumbs** turns the TikToks you saved because of a place into a private map of that place.
2. You paste one TikTok link; the app reads the caption, works out which venues it names, matches
   each one to a real venue with real coordinates, shows you what it found, and saves only what you
   confirm.
3. The saved place lands on your own map with its name, category, coordinates, the link it came
   from, and anything you wrote about it.
4. Everything after that is retrieval: the map, a searchable list, category filters, "been / not
   been yet", "near me", place detail, and collections you can share with another account.
5. The product is worth nothing at zero saved places, so the first session has to end with places
   on the map — hence the seed links, manual add, and the join-a-collection path.

**Business value in one sentence:** a TikTok save is chronological and unsearchable, so the thing
you saved is effectively lost at the moment you need it — this converts that graveyard into a
geographic index you can use in seconds.

---

## 2. The one central process, end to end

This is the single most likely interview question. Eleven steps, each with the file that owns it.

| # | Step | File that owns it |
|---|---|---|
| 1 | User pastes a link into the paste screen | `src/app/import/screens/paste-screen.tsx` |
| 2 | The string is classified in the browser (TikTok host? video, photo, profile, short link?) | `src/domain/source/canonicalise-tiktok-url.ts` |
| 3 | The client fires two sequential requests and owns which screen the answer lands on | `src/app/import/_lib/use-import-run.ts` |
| 4 | **Round trip 1** — fetch the post so the thumbnail, `@handle` and caption are on screen in ~1s | `src/app/api/imports/source-preview/route.ts` |
| 5 | **Round trip 2** — the whole rest of the pipeline, one request | `src/app/api/imports/probe/route.ts` |
| 5a | Re-validate the URL **server-side** (this is the SSRF gate; the browser's check does not count) | `canonicalise-tiktok-url.ts`, called again in the route |
| 5b | Open the `imports` bookkeeping row | `start_import()` RPC, `supabase/migrations/0007_functions.sql` |
| 5c | Fetch the post from TikTok oEmbed, cache-through `public.sources` | `src/integrations/tiktok/oembed-source-adapter.ts` |
| 5d | Pull the caption text out of the raw post | `src/integrations/tiktok/caption-content-extractor.ts` |
| 5e | Check the extraction cache before spending a model call | `readCachedExtraction()` in the probe route |
| 5f | Send caption + versioned prompt to the model, get schema-constrained JSON back | `src/integrations/llm/anthropic.place-extractor.ts` (prompt: `llm/prompt.ts`) |
| 5g | Drop candidates the caption does not support (e.g. a city name with no venue) | `src/domain/extraction/plausibility.ts` |
| 5h | Ask the places provider for each candidate, rank the answers, assign a confidence band | `src/domain/import/resolve-candidates.ts` → `src/domain/places/score.ts` |
| 5i | Persist the extraction + shortlist into `extractions.candidates`, advance the `imports` row | `persistExtraction()` / `advanceImport()` in the probe route |
| 6 | The review screen shows what was found; **nothing is saved yet** | `src/app/import/screens/review/review-screen.tsx` |
| 7 | User confirms; the browser sends an *extraction id, a candidate index, an option index and a note* — never a place fact | `src/domain/import/confirm.ts` (the Zod request schema) |
| 8 | The server re-reads its own stored row and derives every place fact from it | `src/domain/import/candidate-place.ts` |
| 9 | Find-or-create the shared `places` row, then write the user's `saved_places` row | `resolve_place()` + `save_place()` RPCs via `src/integrations/supabase/place-store.ts` |
| 10 | The import row closes as `completed` | `src/app/api/imports/confirm/route.ts` |
| 11 | `/map` re-reads the library and draws the pin | `src/app/map/_lib/get-spots.ts` → `src/components/map/place-marker-layer.tsx` |

**If a caption names nothing** — which is the *usual* outcome, see §9 — step 6 is replaced by
`src/app/import/screens/no-places-screen.tsx`, which offers add-by-name
(`src/app/api/imports/place-search/route.ts`) so the user's knowledge can rescue the import.

**The one sentence to memorise:** *the browser sends a link in, and later sends back an index —
every fact that reaches the database is derived on the server from a row the server itself wrote.*

---

## 3. The layers, and the rule that keeps them apart

Four layers, one direction of dependency: **`ui → app → domain → integrations` is the wrong way to
read it; the real rule is that `domain/` depends on nothing.**

| Layer | Directory | What lives there | What it may import |
|---|---|---|---|
| UI | `src/ui/`, `src/components/` | React components, presentation logic | `domain/`, `app/actions/` |
| App | `src/app/` | Next.js routes, pages, Server Actions, the composition root | anything |
| Domain | `src/domain/` | Pure business logic: URL classification, scoring, plausibility, derivation | only other `domain/` files |
| Integrations | `src/integrations/` | Every adapter that touches a network, a vendor or the database | `domain/` (types and ports only) |

- **A "port" here is a TypeScript interface in `src/domain/ports.ts`, and nothing more** — no DI
  container, no barrel file, no framework; a port is a function parameter.
- There are six: `SourceAdapter`, `ContentExtractor`, `PlaceExtractor`, `PlaceResolver`,
  `ImportStore`, `Clock`, plus `PlaceStore` for the save seam.
- `domain/` never imports from `integrations/` because that is what makes the scorer, the
  canonicaliser and the plausibility gate testable with no network, no database and no clock.
- **What that buys, concretely:** `src/domain/places/score.ts` is checked against a 44-case golden
  file in `tests/unit/places/benchmark-golden.test.ts` in milliseconds, and swapping Overture for
  Google Places was one new file in `integrations/` and zero changes in `domain/`.
- `Clock` exists so that `Date.now()`, `setTimeout` and `Math.random` inside `domain/` are a bug
  rather than a shortcut.

**This is a checked property, not a convention.** `npm run check:layers`
(`scripts/check-layer-guard.sh`) writes deliberate violations into the tree, asserts ESLint rejects
each one, removes them, then greps the real `domain/` tree for I/O independently of ESLint — so
disabling the lint config alone does not open the door. A fourth check proves every module in
`src/app/_lib/` imports the `server-only` package, which is what makes a secret reaching the
browser a *build* failure rather than a review failure.

---

## 4. The surfaces: pages, routes and actions

**Pages** (Next.js App Router, `src/app/`):

| Route | What it is |
|---|---|
| `/` | Marketing / first impression, signed out |
| `/sign-in` | Email + password sign-in and sign-up, `?next=` return path |
| `/map` | The whole app shell — the map, the saved-places drawer, place detail |
| `/map?view=collections[&collection=<id>]` | Collections index and one collection, **same route segment** so the drawer is not unmounted |
| `/import` | Paste → rail → review → confirm, and the no-places and failure screens |
| `/profile` | Stats, theme choice, account menu, sign out, delete-my-data |
| `/collections/join/[token]` | Accept a share link |
| `/healthz` | Deploy smoke check: `{ok, stage, commit}`, reveals no configuration |

**API routes** — four, and all of them exist because they need a service-role client or a
long-running call, which a Server Action is a poor fit for:

- `POST /api/imports/source-preview` — read the post, fast, for the waiting screen.
- `POST /api/imports/probe` — source → extract → resolve → persist.
- `POST /api/imports/confirm` — reviewed candidates → saved places.
- `POST /api/imports/place-search` — search-and-add by name from the no-places screen.

**Server Actions** (`src/app/actions/`, `'use server'`) — everything that is a simple authenticated
mutation of the user's own rows: `saved-places.ts` (delete, rename, re-categorise, note, visited),
`manual-add.ts`, `collections.ts` (15 actions), `account.ts` (delete account), `sign-out.ts`.

**Route protection** is `src/proxy.ts`, the Next.js middleware: it refreshes the Supabase session
cookie on every request and redirects a signed-out visitor away from `/map` before any React
renders. Every page that renders user data *also* calls `getUser()` itself rather than trusting the
layer above it.

---

## 5. Every external library and service — one sentence each, with why

M3 requires the justification, not the list. "What we would otherwise have built" is the honest
test.

### Required by the course

| Thing | Version | What it does for us | Without it |
|---|---|---|---|
| **Next.js** | 16.3.1 | One framework for routing, server rendering, API routes and Server Actions, so there is no separate backend to deploy | A React SPA plus an Express API plus a build pipeline plus a session story |
| **React** | 19.2 | The component model the whole UI is written in | Hand-rolled DOM updates |
| **TypeScript** | 6.0.3 | Types are the contract between the four layers, and `exactOptionalPropertyTypes` is on so "field absent" and "field null" cannot be confused | Every port boundary re-checked by hand or by test |
| **Supabase** (Postgres + Auth + RLS) | js 2.112, ssr 0.12 | Managed Postgres, email/password auth, and **row-level security as the authorisation layer** | Our own user table, password hashing, session cookies, email verification, and an authorisation check on every query |
| **Vercel** | — | Zero-config deploy of a Next.js app from `main`, preview per branch, env-var store | A container, a reverse proxy, a CI deploy step and TLS |

### Chosen, and each one has to be defended

| Thing | Version | What it does for us | Why it, and not the alternative |
|---|---|---|---|
| **MapLibre GL** | 6.4.1 | Renders the vector map, the pins and the camera | Open-source fork of Mapbox GL, no per-load billing, no vendor lock on the renderer |
| **CARTO basemaps** | — | The map tiles themselves, `basemaps.cartocdn.com`, **no API key** | Free tier of 5M tiles/month, one dischargeable attribution line; Protomaps was the original choice and was dropped by the owner |
| **mapcn** | vendored | shadcn-registry map components (`src/components/ui/map.tsx`), installed as source not as a package | Declarative `<MapPopup>` / `<MapControls>` over raw MapLibre layer objects; being source means we can read and edit it |
| **Zod** | 4.4.3 | Parses every untrusted input — request bodies, oEmbed responses, model output, and `jsonb` read back out of our own database | Hand-written type guards at four boundaries, each one a place to forget a check |
| **Anthropic Claude Haiku 4.5** | via REST | Reads a caption and returns schema-constrained JSON naming the venues in it | This is the capability the product is built on; there is no rule-based substitute for "which of these words is a restaurant" |
| **Google Places API** | via REST | Turns a venue name plus a city hint into a real venue with real coordinates | Model-guessed coordinates measured **65–470 m out**, and 541 m apart between two runs of the same caption; this is the difference between a product and a demo |
| **Overture Maps** (`poi_index` table) | loaded data | The open-data fallback resolver, queried in our own Postgres | Google Places content may not be paired with a non-Google map (ToS), so production needs a compliant provider |
| **TikTok oEmbed** | public endpoint | The only officially supported way to read a public post's caption, author and thumbnail | Scraping — unsupported, fragile, and against the terms |
| **Tailwind CSS** | 4.3.3 | Styling without a parallel CSS file per component | A hand-maintained design-token stylesheet |
| **motion** | 13.1.1 | The transitions and the mascot motion set, with reduced-motion support | Hand-written CSS keyframes and interruption handling |
| **vaul** | 1.1.2 | The mobile bottom sheet with real drag physics and snap points | The single hardest interaction in the app, rebuilt badly |
| **lucide-react / @base-ui / cva / clsx / tailwind-merge** | — | Icons, accessible primitives, and class composition | Icon SVGs, focus management and class-string bugs |
| **server-only** | 0.0.1 | Makes a server module reaching a client bundle a *build* failure | A lint rule people can silence |
| **Vitest / Playwright** | 4.1.10 / 1.62.1 | Unit and end-to-end tests | — |

**Point worth making out loud:** there is **no Anthropic SDK and no Google client library** in
`package.json`. Both integrations are a single `fetch` against the documented REST endpoint —
`api.anthropic.com/v1/messages` and `places.googleapis.com/v1/places:searchText`. That was
deliberate: it keeps the dependency tree to things we can explain, and it means the retry, timeout,
abort and error-mapping behaviour is ours and is visible.

---

## 6. The database in one page

Postgres, via Supabase. **The single most useful distinction: which tables are shared between users
and which are per-user.** It explains almost the whole security model.

### Shared across all users (facts about the world)

| Table | What it holds | Who may write it |
|---|---|---|
| `places` | One row per real venue: name, category, lat/lng, address, locality, country | **Only** `resolve_place()`, which is service-role |
| `place_provider_refs` | The alias namespace — this place is Google id X / Overture id Y | Same |
| `poi_index`, `poi_regions` | The loaded Overture gazetteer used by the fallback resolver | Load scripts only |
| `place_lookups` | Cached provider responses, keyed by a hash of the query | The resolver adapter |
| `sources` | One row per TikTok post: caption, author, thumbnail, canonical URL | The oEmbed adapter (service-role) |
| `extractions` | One row per (source, model, prompt version): the model's candidates and the resolver's shortlists | The probe route (service-role) |

### Per-user (facts about a person)

| Table | What it holds |
|---|---|
| `profiles` | One row per `auth.users` row, display name |
| `saved_places` | **The library.** A user's link to a `places` row, plus their note, display-name override, category override, visit state, tags, why-go, dishes |
| `saved_place_sources` | Which TikTok(s) a saved place came from — provenance |
| `imports` | One row per import attempt: status, stage, timings, model and prompt version, error code |
| `collections`, `collection_members`, `collection_items`, `collection_invites` | Shared lists, their membership, their contents, and the share tokens |
| `place_mentions` | Table exists on disk (migration `0031`); **nothing in `src/` reads or writes it yet** |

### How they relate, in one sentence each

- `auth.users` → `profiles` → `saved_places` → `places`: a user has a library, and each library row
  points at a venue that other users may also have saved.
- `saved_places` → `saved_place_sources` → `sources` → `extractions`: the provenance chain from a
  pin on the map back to the caption that produced it.
- `imports` sits beside `sources` and records what happened, so a failed import is auditable.
- `collections` → `collection_items` → `places`: a shared list points at the *shared* venue rows,
  never at another person's private `saved_places` row.

### Three schema properties worth quoting

1. **`places` is shared, which is why the client may never write it.** A confirmed exploit existed:
   `resolve_place` refreshes provider-owned columns on a matched row, so a request carrying a name
   and a coordinate let one user rename and relocate a venue other people had saved. The fix is the
   contract change in §2 step 7.
2. **Provenance is enforced by a deferred trigger**, not by application discipline:
   `assert_saved_place_provenance` fails a save whose `origin = 'import'` has no
   `saved_place_sources` link.
3. **Deletion is by foreign-key cascade from `auth.users`**, deliberately — an application-level
   sweep would be a second, drifting definition of "the user's data" alongside the graph Postgres
   actually obeys.

### Migrations

31 numbered files in `supabase/migrations/` (`0001`–`0031`, `0027` does not exist). Numbers are
never edited once pushed; `npm run check:migrations` asserts every grant is explicit.

---

## 7. Authentication and authorisation, in five sentences

1. **Authentication** is Supabase Auth, email and password, with the session in an HTTP-only cookie
   refreshed by `src/proxy.ts` on every request.
2. Server code always calls `supabase.auth.getUser()`, never `getSession()`, because the former
   validates the token against the auth server and the latter only trusts the cookie payload.
3. **Authorisation is row-level security in Postgres**, not `if` statements in TypeScript: every
   per-user table carries `..._select_own` / `_insert_own` / `_update_own` / `_delete_own` policies
   whose predicate is `user_id = auth.uid()`.
4. There is exactly **one role** — the authenticated owner — plus the anonymous visitor who can
   reach only `/`, `/sign-in` and `/healthz`; collections add a second axis (`owner` / `editor` /
   `viewer`) enforced by `collection_role()` and `can_edit_collection()`.
5. The **service-role key** bypasses RLS, lives only in `src/app/_lib/` and `src/integrations/`
   behind `server-only`, and every route that holds one re-checks `getUser()` itself first.

**The demonstration an examiner will respect:** `supabase/tests/0008_policy_tests.sql`,
`0024_collections_policy_tests.sql` and `0031_place_mentions_policy_tests.sql` assert that a
cross-user read returns **zero rows** — a *failing* access attempt, proven in SQL, is stronger
evidence than any passing test.

---

## 8. Decisions an examiner is likely to poke at

Each one: the decision, the reason, and the alternative that lost.

**Why Supabase Auth rather than custom auth?**
Because password hashing, session rotation, email confirmation and reset flows are a large amount of
security-critical code with no product value, and because using Supabase's auth is what makes
`auth.uid()` available inside every RLS policy. *Lost:* a `users` table with bcrypt and our own
cookies — more code, more risk, and authorisation would then have had to live in application code.

**Why RLS rather than checks in application code?**
Because an application check protects the queries you remembered to guard, and a policy protects the
table. *Lost:* a `where user_id = ?` on every query — one forgotten clause in one new feature is a
data leak, and there is no way to test for the clause you did not write.

**Why a places provider rather than storing the model's coordinates?**
Because the model's own coordinates were measured 65–470 m out and 541 m apart between two runs of
the same caption, which is a pin on the wrong street. *Lost:* trusting the model — cheaper, one
fewer dependency, and useless for the one thing the product is for. When the resolver genuinely
cannot match, the save is marked `llm_guess` rather than dressed up as resolved.

**Why Google Places as canonical, but Overture in production?**
Because Google won the measurement (15/16 top-1) but its Service Specific Terms §5.3 forbid pairing
Google Places content with a non-Google map, and our map is MapLibre. The gate is *code*
(`place-resolver-factory.ts`), not prose, because a documented-only gate is one refactor from gone —
and an unknown or unset stage counts as production, so it fails safe.

**Why TikTok only?**
Because oEmbed is the only officially supported read mechanism we verified; an Instagram or YouTube
link is therefore a *recognised redirect to manual add*, never a failure screen. *Lost:*
multi-platform breadth — which would have meant either scraping or four half-working integrations.

**Why does the review screen exist at all, instead of saving automatically?**
Three reasons: the model is not always right and a wrong place in your library is worse than no
place; a caption often names several venues and only some are the recommendation; and the save is
the moment the user takes ownership of the result. *Lost:* one-tap import — faster, and it would
have made every extraction error permanent and invisible.

**Why is the extraction stored server-side instead of round-tripped through the browser?**
Because `places` rows are shared, so any place fact the browser can send is a place fact the browser
can forge. The client sends an index into a list the server wrote; `authenticated` holds no
`INSERT`/`UPDATE` grant on `extractions.candidates` at all, so a shortlist in that column can only
have come from our own route.

**Why is there an extraction cache keyed on a hash of the caption?**
Because "no places found" is the modal outcome, re-pasting is the natural retry, and every retry was
paying the model again — and because the model is not deterministic, so without the cache the same
TikTok showed different places on the second run. The `input_hash` is what keeps it honest: an
edited caption misses the cache and re-extracts.

**Why one route segment for the map, the collections index and one collection?**
Because the App Router unmounts the outgoing subtree on a segment change, which took the drawer and
every piece of state inside it; `?view=` and `?collection=` are in the URL so back, forward and deep
links still work.

**Why is `domain/` pure?**
So that the parts of the system a wrong answer actually damages — scoring, plausibility, URL
classification, place derivation — are testable in milliseconds against fixed inputs, and so the
provider behind `PlaceResolver` can change without touching them.

---

## 9. Questions you should expect, with the honest answer

**"Why does it only find a place in about a quarter of posts?"**
Because that is a property of the content, not of our code: creators put the venue name *on screen*
and *in speech*, not in the caption. It was measured — 3 of 11 genuine recommendation posts named a
resolvable venue in caption text, ~27% (`04-tiktok-feasibility.md` §4) — and it is why the
no-places screen is a **designed core surface with its own spec**
(`spec-no-places-found.md`), not an error path. `NO_PLACES_FOUND` is deliberately *not* a member of
the error taxonomy: modelling the modal result as an error would poison every log, metric and
screen. The screen's answer is add-by-name: the user watched the video and knows the place.

**"Could you not read the video itself?"**
Yes, and the architecture is already shaped for it: `ContentExtractor` is an array of adapters, so
an ASR or OCR analyser is a second implementation in `Ports.content` and no other stage changes.
V1's array length is one. It was not built because it is a cost and latency decision, not a design
one.

**"What happens if the model returns nonsense?"**
It is parsed with Zod against a fixed JSON schema; a parse failure is `EXTRACTOR_INVALID_OUTPUT`,
which is retryable and cheap to retry because the source is cached. Anything that survives the parse
still has to pass `plausibility.ts`, which drops a candidate that names only a city or a country.

**"What stops one user reading another user's data?"**
RLS, and the SQL policy tests that assert a cross-user read returns zero rows. The places *table* is
shared on purpose — a venue is a fact about the world — but a `places` row is only visible to a user
who has saved it (`places_select_if_saved`).

**"Where do you validate input?"**
Four boundaries, each with Zod or a pure classifier: the pasted URL (client *and* again on the
server, because the server-side check is the SSRF gate), the oEmbed response, the model output, and
the confirm request body. Stored `jsonb` is re-parsed on read as well — it is untrusted input like
anything else.

**"How do secrets work?"**
`NEXT_PUBLIC_*` is browser-visible by design (the Supabase anon key is safe because authorisation is
RLS, not secrecy); everything else is server-only, lives in Vercel's env store, and
`scripts/check-layer-guard.sh` fails the build if a module in `src/app/_lib/` forgets
`import 'server-only'`.

**"What is not finished?"** — say these four plainly:

1. **The streaming import route (`L0-F6`) does not exist.** The design calls for one NDJSON stream
   with per-stage events; what ships is two honest request/response round trips
   (`/api/imports/source-preview`, then `/api/imports/probe`), so the post is on screen in about a
   second while extraction runs underneath. The progress rail claims no stage the server did not
   send.
2. **`runImport` in `src/domain/import/pipeline.ts` is written and unit-tested but has no production
   caller.** The live path is the probe route's own straight-line `await` chain. Say this before an
   examiner finds it.
3. **CI has been unable to start a runner since 2026-08-29** — 22 consecutive failures, 0 steps
   executed, ~2 seconds, no logs. `.github/workflows/ci.yml` is present, active and correct (four
   jobs: `lint · typecheck · layer guard · unit`, `next build`, `playwright`, `migrations · RLS
   policy tests`); this is an account-level GitHub Actions problem, most plausibly a spending limit.
   Local `npm run verify` is the gate that runs today.
4. **Staging and production are behind on migrations** — production is at `0026` of `0031`, staging
   at `0018`. Production is *ahead* of staging, so staging is no longer a rehearsal.

**"What would you do with more time?"** — in priority order:

1. Ship the streaming route and wire `runImport`, so the UI reflects real stage events rather than
   two round trips.
2. Read the video, not just the caption — on-screen text (OCR) is the single change that moves the
   ~27% number, and the port for it already exists.
3. An `llm_guess` → resolver upgrader, so a place saved from a model guess is re-resolved when the
   provider later can answer.
4. Restore CI and land the queued work, then push migrations to both hosted environments.
5. Pagination and viewport-bounded queries on the map read, which is currently one unbounded query
   per page load (fine at hundreds of places, not at thousands).

**"What are you proudest of?"** — the trust boundary at confirm: the browser sends an index, the
server derives every fact from a row it wrote itself, and the database grants make that the only
possible path rather than a rule people have to remember.

---

## 10. Things that will be quicker to answer if you have read them once

- **The error taxonomy is closed and small: 13 codes** (`src/domain/errors.ts`), every one with
  exactly one constructor that fixes its `retryable` value, so no call site can claim a code is
  retryable when the taxonomy says it is not. The client receives a code and two booleans — never a
  message, a stack or a vendor string.
- **Logging never carries a caption or a coordinate** — event name plus scalar fields only
  (`Logger` in `domain/ports.ts`).
- **The confidence bands** are `preselect` / `confirm` / `no_match`; a `confirm`-band shortlist the
  user did not pick from falls through to the `llm_guess` path, because an ambiguous shortlist is
  information, not permission to pick for the user.
- **`npm run verify`** is lint → typecheck → layer guard → migration grants → schema check → agent
  config → Claude config → unit tests, in that order.
- **`npm run db:verify`** rebuilds the schema from migration `0001` and runs the RLS policy tests
  against it.

---

## 11. Where the code disagreed with an existing document

Recorded here because "the code wins" is only useful if the disagreement is written down.

| # | Claim | Reality in the code |
|---|---|---|
| 1 | `07-import-execution-model.md` §9 and `src/domain/errors.ts`'s own docblock both say the error taxonomy has **14** codes; two route headers say "the same fourteen `DomainErrorCode`s" | `DomainErrorCode` has **13** members. `PHOTO_POST` was removed deliberately — photo posts are now handled as ordinary posts (`canonicalise-tiktok-url.ts` lines 81–87), because oEmbed 400s the `/photo/` URL form but answers the `/video/` form for the same id. The removal is right; the count in the prose is stale. |
| 2 | `map-surface.mapcn.tsx`'s own file header says the surface requests CARTO **Positron**, and gives a paragraph of reasoning for rejecting Voyager | The constant on line 132 is `voyager-gl-style`, under an `EXPERIMENT (exp/richer-basemap)` comment. The live basemap is **Voyager**, re-tinted by `basemap-tint.ts`. |
| 3 | The same header says the brand is "light only… no dark map" and that the dark style is never requested | True in the sense that both `styles.light` and `styles.dark` are the same URL — but the app *does* ship a dark theme (`components/theme/theme-provider.tsx`, `/profile` theme choice), so the sentence describes the map, not the product. |
| 4 | `.env.example` documents `NEXT_PUBLIC_PROTOMAPS_API_KEY` | Protomaps is unused; `map-surface.live.tsx` is not wired in. **More importantly, `.env.example` is missing four variables the code actually reads**: `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `PLACE_RESOLVER` and `PLACE_LOOKUP_CACHE`. This matters for M10, which asks for an explanation of the required environment variables. |
| 5 | `03-university-requirements.md` M9 says `security.md` is interim with 12 items owed; `current-state.md` says 8 | Both are documents about a document; not resolved here, but the two numbers disagree. |
| 6 | Migration `0031` adds `place_mentions` with full RLS and policy tests | No file in `src/` references it. The table is real, the feature is not. |

---

## 12. Where to go next

| You need | Read |
|---|---|
| What the product is for, and for whom | `product-specification.md` |
| Folder tree, schema DDL, CRUD matrix, error taxonomy, UX flows | `technical-design.md` |
| What is true *right now*, and what is broken | `current-state.md` |
| Why TikTok, and what ~27% actually means | `04-tiktok-feasibility.md` |
| Why Google Places, and the ToS gate | `06-map-and-places-decision.md` |
| The prompt, the schema, the scoring | `09-extraction-and-resolution.md` |
| The scope contract | `00-project-charter.md` §4 |
| The course contract | `03-university-requirements.md` |
