# Multi-link paste, and every other route considered

Investigated 2026-08-27.

## 1. Multi-link paste — no platform obstacle, one hard ceiling

### The oEmbed side is fine — VERIFIED, already on record

`04-tiktok-feasibility.md` E5: no rate limiting at **40 sequential + 30 concurrent** from one IP, no
`429`, no `retry-after`, no `x-ratelimit-*`. Latency p50 511 ms / p90 626 ms / max 938 ms. Re-measured
today at 0.28–0.30 s. Responses are `cache-control: no-store`, so every import is an origin hit and
our own `sources` cache is the only thing that keeps repeat work off TikTok.

**oEmbed is not what limits batch import.**

### The Gemini side is what limits it

Read from the code today, not assumed:

- `src/app/api/imports/probe/route.ts` makes **exactly one** model call per import, cached in
  `extractions` on `(source_id, model, prompt_version)`. `src/domain/import/llm-guess-place-id.ts`
  is a pure hashing function, not a second call. So **1 uncached link = 1 Gemini call.**
- The ceiling is **500 calls/day, per call, not per token** (`current-state.md`).

Therefore the honest per-link cost is:

| | Per link |
|---|---|
| TikTok oEmbed | ~0.5 s, 1 request, no quota |
| Gemini extraction | 1 call against 500/day, only if `(source, model, prompt_version)` misses |
| Expected yield | ~27% of links produce at least one place (LEVEL B) |

**A 200-link batch is 200 of the day's 500 calls to produce ~54 useful imports.** Two users doing a
back-catalogue import on the same day exhaust the project's entire daily budget. That is not a reason
to refuse batch — it is the reason batch needs an explicit per-user cap and a resumable queue rather
than a fire-and-forget loop.

### Two more constraints worth naming before anyone designs this

- **Vercel function max duration is 300 s on Hobby** and the request body cap is **4.5 MB**
  (`vercel.com/docs/functions/limitations`, last updated 2026-08-24). 200 links × (0.5 s oEmbed +
  1–3 s model) run sequentially is 300–700 s. Batch import **cannot** be a request/response route.
  It needs the streaming/queued path `L0-F6` already owes, or chunking. This is a genuine dependency,
  not a nice-to-have.
- **`/api/imports/probe` has no rate limit today** — `current-state.md` unresolved item 7 records
  that `rateLimitedLocal` has zero production call sites. Shipping multi-link paste before the real
  limiter exists hands any user a one-paste way to drain the daily quota.

### The finding that matters most about multi-link paste

**Nobody has twenty TikTok links to paste.** They are inside the TikTok app, one tap apart. Without
a bulk source, a multi-link field is a field that receives one link. Multi-link paste is not an
independent feature — **it is the back half of the data-export feature**, and it has little value
shipped alone.

## 2. Everything else considered

| Route | Label | Why |
|---|---|---|
| **YouTube via oEmbed** | **UNAVAILABLE for our purpose** | Live probe today (`raw/06`): `200`, but returns `title / author / thumbnail / html` and **no description field**. TikTok's oEmbed `title` *is* the full caption; YouTube's is just the video title. The place names live in the description. YouTube is not the cheap second platform it looks like. |
| **YouTube Data API v3 `videos.list?part=snippet`** | **ASSUMED** | Returns the full description, API-key only (no OAuth), 10,000 units/day free with `videos.list` at 1 unit. On paper a *better*-documented dependency than TikTok's undocumented oEmbed. Needs a Google Cloud project and key — no payment method required, but not verified here. Cheap to verify if YouTube is ever promoted. |
| **Instagram** | **UNAVAILABLE (unchanged)** | Legacy `api.instagram.com/oembed` `301`s to the Graph oEmbed, which needs a Facebook app token and App Review. No new information; `05-secondary-platforms.md`'s deferral stands. |
| **TikTok collection URLs** (`tiktok.com/@user/collection/<slug>-<id>`) | **OUT OF BOUNDS** | The URL form is real (yt-dlp's `_VALID_URL` matches it) and a public collection is a curated list of exactly what we want. But oEmbed serves single videos only; reading a collection means parsing TikTok's HTML/internal JSON — `04` M9, out of bounds on ToS. Naming it so nobody re-proposes it. Worth adding `collection` to the `UNSUPPORTED_URL` path list so it gets an honest sentence instead of a generic error. |
| **Google Takeout "Saved Places"** | **ASSUMED, recommend against** | Google Takeout does export the user's Maps saved lists, which would fill a map fast. But those places have **no source post**, which breaks charter §3 invariant 3 ("the source URL survives forever") and, more importantly, breaks the product's claim: it would no longer be "the places your TikToks recommended," it would be a Google Maps mirror. Add that Maps content carries its own reuse terms. Wrong feature for this product. |
| **Onboarding sample library** | **VERIFIED trivially (it is our own data)** | Seeding a few real Tel Aviv places so the map is not empty on first run. Zero platform risk, zero ToS risk, no spend. But be honest about what it buys: it fixes the *empty-screen* problem, not the *zero-value* problem — they are not the user's places and they do not answer "what did I save near me?". Already on the L2 list as "onboarding and empty-state seeding"; leave it there. |
| **Third-party scraping providers (Apify, RapidAPI…)** | **UNAVAILABLE here** | `04` M10 leaves compliance unresolved and every option is paid. The no-new-spend constraint closes it without needing the compliance answer. |
| **Improving the ~27% hit rate itself** | Out of my domain, but worth naming | The cheapest unbuilt thing that shortens 0→20 is not a new intake mechanism at all: it is that 73% of links currently yield nothing. Raising the hit rate raises the value of *every* mechanism above, including the export. `ai-extraction` owns it. |
