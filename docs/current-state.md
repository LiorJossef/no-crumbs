# Current state — the cold-start document

> **CURRENT.** Everything here was verified against the running system or the code on
> **2026-08-30**. If it is wrong, that is a defect — fix it in the same branch as the change that
> made it wrong.
>
> This file used to be 1,241 lines of stacked session notes, and its first section warned about
> unpushed commits that had landed and a production outage that was over. That history is now
> [`history-2026-08.md`](history-2026-08.md); it is dated and is not maintained. Read
> [`README.md`](README.md) for what else in `docs/` can be trusted.
>
> **Other documents cite section numbers this file no longer has** (`§0.1b`, `§5.1`, `§9.1`, `§9.3`
> and so on). Those all resolve in `history-2026-08.md`, which kept the old numbering.

## Where the product is

The core loop works end to end and is deployed. A TikTok link becomes a caption, an LLM extraction,
a resolved place and a saved row; the map shows it; the library finds it again.

**Live** at `https://p-002-zeta.vercel.app`, auto-deployed from `main`.
`/healthz` → `{"ok":true,"stage":"production","commit":"99324dd"}`.

**Built:** auth · the map, camera and pins (MapLibre + CARTO) · the saved list, search, category
filter and pressable tag chips · place detail · TikTok import with review and confirm · manual add
by name · been / not been yet · near me · collections including shared collections · a profile page.

**Not built:** the streaming import route (`L0-F6`) — `/api/imports/probe` is still the
request/response stand-in — and `L1-F8-T1`, the account menu with delete-my-data. That is the last
unbuilt L1 product feature.

**Superseded rather than delivered:** D2b's two-source global resolver. Google Places is the
canonical provider (15/16 top-1); Nominatim was never built and no adapter exists in `src/`.

## Measured, not remembered

Re-measure these rather than copying them forward. Every one of them was wrong in at least one
document before 2026-08-30.

| | |
|---|---|
| Tests | 107 files, 1,959 passing (`npx vitest run`) |
| Migrations on disk | 29 — `0001`–`0030`, `0027` does not exist |
| Staging database | `0018` — missing `0019`–`0030` |
| Production database | `0026` — missing `0028`–`0030` |
| Git | `main` == `origin/main` == `99324dd`, tree clean |
| Open PRs | #72, #64, #22 — all green, all 153–424 commits behind `main` |

**Production is eight migrations ahead of staging.** Staging is the stale environment, so it is no
longer a rehearsal for a production push.

## CI is not running

**There is no active GitHub workflow**, so nothing is being checked automatically. `npm run verify`
locally is the only gate, and it covers one of the four jobs the workflow used to define.

The `e2e` job was never evidence even when it ran: it set no `E2E_PASSWORD` and started no Supabase,
so seven of nine spec files skipped and the check reported green over four signed-out tests.
`tests/e2e/global-setup.ts` was written to make that impossible and was itself dead code —
`playwright.config.ts` had no `globalSetup` key. **It is wired now** (verified against all four
environments it distinguishes), so it is ready for whatever workflow comes back.

**Follow-up, owed: restore CI.** Whatever replaces the workflow, its e2e job must stand up a local
Supabase, seed the demo user and pass `E2E_PASSWORD`, or the guard will fail it — which is the
intended behaviour, not a bug to work around.

## Open, in impact order

1. **`L1-F8-T1`** — account menu, delete-my-data, and the zero-places first-run state. Blocked by
   nothing. **Trap:** `collections.owner_id` is `on delete cascade` and ownership transfer was never
   built, so deleting an account destroys shared collections for everyone in them.
2. **`L1-F10` graded artefacts** — `test-specification.md`, `scale.md`, `deployment.md`,
   `how-the-system-works.md` do not exist; `security.md` is interim with 8 items owed. Largest
   submission gap.
3. **Restore CI**, and make its e2e job satisfy the now-wired guard (above).
4. **Unverified code on `main` and in production**: the `{ kind: 'user' }` arm of `Framing`
   (`map-surface.mapcn.tsx`) was written as a minimal fix and never exercised in a browser.
5. **Defect 1, undiagnosed** — production settled on a country view with no pin under a header
   naming a city. Two theories measured and disproved. Best remaining lead: `framing.current`
   records a country framing and `refitFramed` replays it on every `ResizeObserver` hit.
6. **Migration pushes** — staging `0019`–`0030`, production `0028`–`0030`.
7. Pin labels are gated at `LABEL_MIN_ZOOM = 14` while home settles at z12–13, so "a readable place
   name once the map settles" is still not met.
8. `EMPTY_LIBRARY_BOUNDS` is a guessed region and needs an owner ruling.
9. Four `llm_guess` duplicate pairs no distance guard reaches (327 m median drift against a 75 m
   radius). The `llm_guess` → Google upgrader does not exist. **No backfill without reviewing the
   rows.**
10. A TikTok connect timeout is still reported to the user as "this share link has expired".
11. Dark mode is an unsigned first pass. **The product name is still open** (`L1-F1-T1`).

## Decisions not to reopen

Google Places is canonical and Overture is out (2026-08-28) · production resolves with Overture
behind a ToS gate, because Google content may not pair with a non-Google map (`06` §3.1) · density
clustering of saved places is removed · no Elsewhere country-to-city tree (`d9cbdf2`) · area
grouping is 2 km OR (50 km AND same normalised locality), and three fixes in that family are
measured-and-rejected · TikTok only; Instagram and YouTube are a recognised redirect to manual add ·
no return triggers of any kind · caption pipeline first, before new inputs.

## Open questions for the owner

1. Do we accept a lower hit rate as the price of staying inside official APIs? (Recommendation: yes,
   and say so in the product's voice.)
2. Do we hold the grounding line, or attribute model knowledge as model knowledge?
3. Should export exist?
4. OD-1: does the "info" boundary govern place facts only, or every stored field? Gates `user_tags`.
5. Backfill the phantom duplicate rows?
6. The TikTok data-export experiment — costs one request against the owner's own account.
7. Is `PLACE_RESOLVER=google` set on production? If so, production is serving Google-resolved
   coordinates on a MapLibre map, which is the pairing `06` §3.1 forbids.
