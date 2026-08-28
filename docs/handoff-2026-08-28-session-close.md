# Handoff — eight parallel streams, two landed, six stopped mid-flight

Cold-start document, 2026-08-28. Written at a session close called with work still running.
**Everything unfinished is preserved on branch `wip/session-2026-08-28-parallel-streams`
(commit `aa31aa1`, pushed).** Nothing was discarded; nothing is still running.

---

## 1. Owner rulings from this session — preserve these above all

These were given mid-session and are the most important thing in this document, because they
change decisions already written into other docs.

1. **"We are not using Overture anymore."** Overture is out as a product direction, not merely
   deprioritised. `place-resolver-factory.ts` still gates production to Overture; that gate is now
   obsolete and its removal is blocked only by §2's compliance question.
2. **Google Places stays the canonical resolver** — "the source we ultimately want for place
   identity, coordinates, photos and future enrichment."
3. **Resolution must never dead-end.** When Google is unavailable or out of quota, fall back to the
   model's guess and let the user continue and save. The fallback must stay `llm_guess`, must never
   fabricate a canonical provider identity, and its coordinates are approximate. When Google is
   available again, unresolved places should be upgradeable to canonical Google identities. The
   owner was explicit: *"resilience and continued progress, not lowering the long-term quality bar."*
4. **The product is behaviourally thin after the save.** "It risks becoming a nice map of pins
   rather than something I keep using." Not a feature request — an instruction to find the smallest
   capabilities that make the library useful, organisable and revisitable. Collections named as a
   direction but explicitly **not** pre-chosen.
5. **The near-term goal**: curate ~100 real TikToks worldwide and persist the resulting places,
   provider identities and coordinates **in production**. Google quota is reserved for that batch.

Standing directions restated: local density clustering is going away with world/country-level
summarisation as the zoomed-out direction; personal collections → later collaborative collections,
richer extraction (transcription, visual/OCR) and natural-language search all stay on the roadmap.

---

## 2. What merged

| PR | What |
|---|---|
| [#63](https://github.com/LiorJossef/P-002/pull/63) | Hebrew basemap labels (RTL plugin) + the product's own category vocabulary |
| [#65](https://github.com/LiorJossef/P-002/pull/65) | **The score is the name score**, the branch guard, `place_lookups` wired up, the collapsed-space extraction fix, user-editable category, one-area-one-name |

`main` is at `5e312fe`. PR #65 was 26 commits that had never been pushed — it existed only on a
local branch at session start. It is now landed. Its CI run on `main` was still in progress at
close; all six checks were green on the PR itself immediately before merge.

**Still open and untouched:** [#64](https://github.com/LiorJossef/P-002/pull/64) (retrieval e2e)
and #22 (stale, from July — probably closeable).

---

## 3. What each stopped stream found

All six were stopped by me, not by failure. Their work is in the WIP commit.

### 3.1 Production readiness — the highest-value finding of the session

`docs/evidence/deploy/production-readiness-2026-08-28.md`. Verdict: **production cannot serve an
import today, and would not produce trustworthy rows if it could.** Three gates are shut:

1. **The Vercel env store has no Supabase values** — measured on a 4-minute-old build. Owner-only
   to fix.
2. **Both hosted projects are at migration `0018`; local is at `0023`.** Missing on staging *and*
   production: `0019_saved_place_enrichment`, `0020_poi_region_tlv_launch_area`,
   `0021_poi_prefilter_trigram`, `0022_poi_prefilter_address_arm`, `0023_place_lookup_cache_rpcs`.
   I verified this myself against both projects.
3. Production `poi_index` is empty and production is gated to Overture — now moot under ruling §1.1,
   but it means the gate must be replaced rather than simply opened.

The agent **refused two requested measurements** because `docs/agent-guardrails.md` forbids a
specialist from running `db:inventory:prod` or `vercel env`. That was correct behaviour. §1.1 and
§3.3 of its file name the exact commands the orchestrator must run to close the gap.

**Answer to the owner's question about mechanism:** do not import the batch into production until
gates 1 and 2 are open. Opening them without a working resolver would write 100 rows of
`llm_guess` — measured 65–470 m out, drifting a median 327 m between identical calls — permanently,
into the one database with no point-in-time recovery.

### 3.2 Google Places persistence and the ToS

`docs/evidence/places/google-places-persistence-tos-2026-08-28.md`, with primary sources in
`docs/evidence/places/raw/`. Two findings that matter:

- **Our citations are stale.** Google renumbered the Service Specific Terms: Places API is now
  **§14**, not §5. Everywhere the repo says §5.3 it means **§14.2**; §5.4 means **§14.3**. The
  substance is unchanged. Affected: `06` §3.1/§3.3/§12, `place-resolver-factory.ts`,
  `google/place-resolver.ts`, migration `0023`.
- **The 30-day cache limit is enforced on the cache and nowhere else.** `place_lookup_put` correctly
  refuses a Google row over 30 days — verified by attack in a rolled-back transaction. But `places`
  and `extractions.candidates` hold Google names, addresses and coordinates with **no TTL, no CHECK
  and no refresh**, and `PLACE_RESOLVER` defaults to Google in local, preview and staging. **We are
  accumulating Google content past 30 days today.** This is unresolved and directly affects whether
  the 100-TikTok batch may persist as intended.

The agent was stopped before finishing its recommendation on whether Google-derived coordinates may
be displayed on a MapLibre basemap. That question is now the blocker for removing the Overture gate.

### 3.3 The others, briefly

- **Duplicate place identity** (`src/domain/places/name-key.ts`, partial). Root cause confirmed by
  me in the running app: the `llm_guess` provider id is minted from the model's raw spelling
  (`llm:hakosem|…` vs `llm:ha kosem|…`) while `places.name_key` is already a generated normalised
  column. HaKosem appears **three times** in the list — twice as a guess, once correctly resolved at
  0.968. Same for `La Nonna Brixton` and `Tokii`. The 75 m merge radius cannot catch these (they sit
  470–530 m apart) and widening it has already been refused on evidence. **No backfill was run and
  none should be run without reviewing the exact row list first.**
- **CI runs no signed-in e2e tests.** The `playwright` job starts no Supabase and sets no
  `E2E_PASSWORD`, so every signed-in spec in all nine files skips — while the check reports green.
  `tests/e2e/global-setup.ts` is a partial fix. **Do not trust the `playwright` check until this is
  closed.**
- **Recognition harness rival coordinates** — partial (`tests/manual/recognition-ranking.ts`,
  `tests/unit/places/recognition-record-rivals.test.ts`). The branch guard still cannot be evidenced
  on the Google corpus.
- **TikTok corpus curation** — stopped while building the fixture; count unknown, nothing verified
  landed. Confirmed by me: short `vt.tiktok.com` links resolve correctly through the redirect.
- **Listicle extraction** and **the degraded resolution path** — both stopped early, little on disk.
  Their briefs are worth re-issuing verbatim; see §5.

---

## 4. What I verified by using the app

Signed in at `localhost:3000/map` with 25 real saved places.

- **A real import, end to end, on a link the owner sent**: `https://vt.tiktok.com/ZSVG11K7V/` →
  `@oli.prague/video/7650457633689701664`, a Prague ice-cream roundup. The caption names **five**
  venues. Extraction found **four** (`Etapa` missed). **All four resolutions returned
  `{"kind":"failed","reason":"lookup_failed"}`** and the review screen said *"3 of these have no
  location — they won't be saved."* From five real venues the product offered to save one.
- **Why the lookups failed is unknown**, and that is itself a defect: the gateway throws on a
  non-OK Google response and **nothing is logged server-side**. There is no way to tell an exhausted
  quota from a bad key from a timeout. Fixing this is cheap and is the first thing to do — see §5.
- The model *did* supply a coordinate (50.1034, 14.3912) for the first candidate and the resolution
  path still treated it as locationless. That is exactly the dead end ruling §1.3 forbids.
- Three identical **"Open HaKosem"** buttons in the accessibility tree — the duplicate bug is an a11y
  bug too.

---

## 5. Highest-priority next steps, in order

1. **Log why a Google lookup fails.** Small, and everything else on the resolution track is guesswork
   without it. `src/integrations/google/place-resolver.ts` — status and error class to the server
   log, nothing vendor-specific to the client. Then re-run the Prague import and read the reason.
2. **Build the degraded path** (ruling §1.3). Brief is in this session's history; the two defects are
   the dead end and the missing observability.
3. **Settle the display question** in §3.2 — may Google-derived coordinates be shown on a MapLibre
   basemap? It blocks removing the Overture gate, which ruling §1.1 has already made obsolete.
4. **Open gates 1 and 2** from §3.1: owner restores the Vercel env store; orchestrator pushes
   `0019`–`0023` to staging, verifies, then production. **Do not import the batch before this.**
5. **The duplicate identity fix**, then review the backfill row list before running it anywhere.
6. **Make CI run the signed-in e2e tier**, or stop treating that check as evidence.
7. **The post-save capability.** `docs/product-ruling-after-the-save.md` ranks it: **been / not been
   yet** is #1 and costs almost nothing — `saved_places.visit_state`, `visited_at`, their CHECK and
   the user's UPDATE grant **have existed since migration `0006`**, `get-spots.ts` already selects
   them and `Spot` already carries them; nothing reads or writes them. No migration, no new grant.
   The trap is `saved_places_visited_at_consistent`: both columns must move in one UPDATE, both
   directions. #2 is near-me, #3 is user-written labels. Collections are argued **down** to L2 behind
   labels — read the argument before overriding it.
   `docs/ux-library-at-scale.md` specifies the surface, including the country → area → place zoom
   bands that replace density clustering.

**One unresolved disagreement between the two advisors, left open deliberately:** `product-lead`
says a been/not-been state needs no owner decision (it stores no new fact about a place and the
column already exists); `ux-interaction` says a user-set visit state widens the MVP's five stored
fields and does need one. Both arguments are in their documents. The owner should settle it.

---

## 6. Repo state at close

- `main` = `5e312fe`, with #63 and #65 merged.
- `wip/session-2026-08-28-parallel-streams` = `aa31aa1`, pushed, **holds all unfinished work**.
- `feat/resolution-confidence` is merged and can be deleted.
- Working tree clean. No agents running. No background jobs.
- **Nothing was pushed to any hosted database.** No migration, no backfill, no destructive
  operation. Both hosted projects remain at `0018`.
- Google Places quota spend this session: the Prague import's four lookups, all of which failed.
