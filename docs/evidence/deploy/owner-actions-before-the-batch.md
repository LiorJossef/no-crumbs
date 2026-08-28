# What only the owner can do before the ~100-TikTok batch

Assembled by the orchestrator, 2026-08-28, from four measurements made this session. Every item
here is blocked on the owner because it is credential entry into a third party, a billing action,
or a decision. Everything *not* on this list is mine and is either done or in flight.

Read with `hosted-migration-state-2026-08-28.md`, `production-resolver-gate-2026-08-28.md` and
`hosted-migration-runbook-2026-08-28.md`.

---

## 1. `PROD_DATABASE_URL` is empty in `.env.local`

Measured directly: the key exists on line 50 with **no value**. `STAGING_DATABASE_URL` is set.

**What it blocks.** Everything to do with production, in both directions. `scripts/db-push.sh`
step 2b calls `require_db_url` *before* it writes anything, so the production push refuses to
start. `npm run db:inventory:prod` cannot run either — so production's row counts, its real grant
state and its actual RPC signatures are all currently **unverifiable**, and several statements
about production in this session's evidence are reasoned from migration files rather than read off
the database.

**Where the value comes from.** Supabase dashboard → the `p-002-prod` project → Connect → session
pooler. The comment above the key in `.env.local` already says so, and notes that the scripts
refuse a value that does not contain its own project ref — an empty value would otherwise silently
fall back to the local container and "prove" a hosted project that was never contacted.

This is the cheapest item on the list and it unblocks the most.

## 2. The Vercel environment store is empty

All three scopes returned `No Environment Variables found`, confirmed independently of the CLI (the
production bundle contains no Supabase URL at all). `/map` and `/import` 500 as a direct result.
The full checklist is `docs/vercel-env-restore.md`, **corrected this session** — it was missing four
variables and recommended one that is obsolete:

- **Add**: `PLACE_RESOLVER`, `PLACE_LOOKUP_CACHE`, `GOOGLE_PLACES_API_KEY`,
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. All four are read by the file that decides which resolver
  production uses.
- **Do not set**: `NEXT_PUBLIC_PROTOMAPS_API_KEY`. The live map surface is CARTO's keyless
  basemap; the Protomaps module's own header says not to wire it in.
- **Treat `NEXT_PUBLIC_STAGE` as a control, not config.** Set to `preview` or `staging` on
  production it would silently flip the resolver to Google and breach `06` §3.1. Leave it unset so
  it inherits `VERCEL_ENV`.

It is the owner's job because it is credential entry into a third party.

## 3. The Google Places quota is 100 requests/day

`SearchTextRequestPerDayPerProject = 100` on the Cloud project behind the current key; one night of
benchmarking exhausted it. At 1–7 lookups per import that is roughly 15–100 imports per day across
all users combined — so a 100-TikTok batch does not fit, even before a single retry.

Raising it is a Cloud console action and probably a billing one. The published free tier is 5 000
Text Search (Pro) calls/month, so this is a project-level cap rather than the product's real
ceiling.

**Everything this session was measured with zero live quota spend**, by replaying recorded
responses from disk and by using an invalid key for the failure paths. That was deliberate: the
quota is reserved for this batch.

## 4. The decision: may Google-derived places be shown on a MapLibre map?

This is the one that is genuinely a decision rather than a chore, and it is the gate that neither
of the two above opens. `resolverProviderFor()` returns Overture on production **before it reads
the Google key**, because `06` §3.1 (VERIFIED) says Google Places content may not be paired with a
non-Google map. Production's `poi_index` is empty. So with items 1–3 all done, the batch would
still resolve `no_match` on every candidate and persist ~100 `llm_guess` rows — coordinates 65–470 m
out, drifting a median 327 m between two runs of the same caption — into the one database with no
point-in-time recovery.

The three options are written out in `production-resolver-gate-2026-08-28.md` §"The three ways
out". `security-privacy` is producing the compliance ruling that narrows them. The owner picks.

---

## What is not on this list, because it is mine

The staging push (rehearsed as a dry run, ready), the production push once item 1 lands, the
fourteen-migration ordering and its verification, the resolution failure classification and the
honest degraded path, the duplicate identity key, the hashtag-as-venue defect, the recognition
scoreboard, and the post-save capability. Progress on those does not wait on any of the above.

## Ordering

**1 → 2 → 4 → 3.** Item 1 is a copy-paste and makes production observable, which everything else
depends on. Item 2 makes production servable. Item 4 decides whether the batch is worth importing
at all, and it does not need 3 to be answered. Item 3 is last because the answer to 4 may change
how much quota the batch actually needs — and if option (c) is chosen, it needs none.
