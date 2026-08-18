# 04 — TikTok Feasibility (D1 input)

> Owner: Social Platform Integration. Date: **2026-08-18**.
> Supersedes the TikTok rows of `02-risks-and-unknowns.md` §A1.
> Evidence: `docs/evidence/tiktok/` (E1–E7 + `harness.mjs`, `urls-set1.txt`, `oembed-set1-raw.json`).
> Labels: **VERIFIED** = tested from server-side Node with committed evidence · **ASSUMED** =
> researched, untested · **UNAVAILABLE** = confirmed not possible · **OUT OF BOUNDS** = possible but
> we will not do it.

## 0. Answer in one paragraph

An arbitrary public TikTok URL can be converted, server-side, with **no auth, no API key, no
account and no cost**, into the **complete post caption** (hashtags and emoji intact, verified
uncut to 1229 characters), the **current creator handle**, the **numeric video id** and a
**thumbnail URL** — via TikTok's public oEmbed endpoint. That is VERIFIED on 16 real public posts,
16/16, p90 626 ms, with no rate limiting at 40 sequential / 30 concurrent requests and no
bot-protection of any kind. The retrieval half of the product premise is solid. The *extraction*
half is not: on hand-labelling those same 16 real posts, only **3 of the 11 genuine place
recommendations (~27%) name a resolvable venue in the caption**. The rest put the venue name on
screen or in speech only — sometimes deliberately, to farm comments. So the mechanism is Level A
and the product outcome is **LEVEL B**. With manual caption paste withdrawn, that 27% is the honest
V1 ceiling for automatic extraction, and closing the gap requires media-level analysis (ASR of the
audio track), which is currently out of charter scope.

---

## 1. Mechanism inventory

| # | Mechanism | Reads an arbitrary public post? | Caption text? | Auth / cost | Status |
|---|---|---|---|---|---|
| M1 | **Public oEmbed** `GET https://www.tiktok.com/oembed?url=…` | **Yes** | **Yes, full** | none | **VERIFIED** (E1, E2, E5, E6) |
| M2 | Short-link resolution via HTTP redirects (`vm.`/`vt.`/`/t/`) | Yes (yields video id) | n/a | none | **VERIFIED** (E3) |
| M3 | Display API `video.list` / `video.query` (Login Kit + OAuth) | **No — authenticated user's OWN videos only** | own only | OAuth app review | **UNAVAILABLE** |
| M4 | Content Posting API | No — write-only (publish on behalf of user) | no | OAuth + audit | **UNAVAILABLE** |
| M5 | Embed / Player API (`embed.js`, `/embed/v2/<id>`) | Yes, renders | **No machine-readable caption** (iframe render only); oEmbed rejects `/embed/` URLs as input | none | **UNAVAILABLE for text** |
| M6 | Research API (`/v2/research/video/query/`) | Yes, incl. `video_description` | Yes | Non-profit academic institution in US/EEA/UK/CH/BR, funding disclosure, ethics review, ~30-day approval, **non-commercial only**, **must delete data not present on 30-day refresh** | **UNAVAILABLE** (eligibility + ToS both fail) |
| M7 | Commercial Content API / Ad Library (`library.tiktok.com`) | Only **paid/commercial** content in EEA/UK/CH | ads only | approved researchers, 1k req/day, non-commercial | **UNAVAILABLE** (wrong corpus) |
| M8 | Subtitle / caption-track endpoint | — | TikTok auto-generates WebVTT subtitles, but **no official public endpoint exposes them** | — | **UNAVAILABLE officially** |
| M9 | Scraping the public HTML / `og:` tags / the internal `item_detail` JSON | technically yes | yes | — | **OUT OF BOUNDS** (ToS, bot protection, fragile) |
| M10 | Third-party commercial data providers (Apify actors, RapidAPI, ScrapeCreators, Supadata…) | Yes, incl. caption **and** WebVTT subtitles | yes | paid, ~$0.004/item + $0.03/run tier | **ASSUMED capability; compliance UNRESOLVED — security-privacy decision** |
| M11 | Audio transcription of the media file (ASR) | requires obtaining the media | yes, speech | our own cost | **NOT ASSESSED — out of current scope** (§7) |

### M1 detail — the recommended mechanism (VERIFIED)

`GET https://www.tiktok.com/oembed?url=<urlencoded>` · GET only (**HEAD returns 404**) ·
`access-control-allow-origin: *` (a deliberately public embed endpoint) · Akamai-fronted ·
`cache-control: no-store` so every call is an origin hit.

Fields (identical across all 16 responses — E1):
`version, type, title, author_name, author_unique_id, author_url, embed_product_id, embed_type,
width, height, html, thumbnail_url, thumbnail_width, thumbnail_height, provider_name, provider_url`

- `title` **is the caption**, plain text, hashtags and emoji preserved, no HTML entities to unwind.
  **Not truncated or derived** — VERIFIED complete at 1229 chars / 1265 bytes on
  `7346702347491446049`, ending naturally on its final hashtag with all 8 restaurant names present.
  Lengths seen: 27 → 1229. Behaviour between 1229 and TikTok's ~2200-char cap is **ASSUMED** fine.
- `author_unique_id` is the **current, authoritative** handle. VERIFIED to differ from the handle in
  the pasted URL (`@gadderapp` in the URL → `@gadderhq` in the response). Consequence: never key
  anything on the handle.
- `html` adds only the sound name (`♬ sunflower - owlh`) beyond what `title` gives; parse `title`.
- **Absent:** post timestamp, view/like counts, location tag, duration, image count, language.
  If we want "saved on / posted on" we must store our own fetch time.
- `thumbnail_url` is a **signed, expiring** CDN URL (`x-expires` ≈ 6 months out). Do not persist it
  as a permanent image reference; either re-fetch on demand or copy the bytes (→ security-privacy Q6).

Refuted assumption from `02-risks-and-unknowns.md` §A1: the row saying oEmbed's `title` "appears to
carry the caption" with "undocumented rate limits" is now **VERIFIED for content** and
**VERIFIED as unthrottled at our scale** — but it remains formally undocumented, and TikTok can
change or gate it without notice. See §8 R-TT1.

---

## 2. URL canonicalisation rules (implementable)

Internal source key: **`tiktok:video:<id>`**. Display URL: `https://www.tiktok.com/@<handle>/video/<id>`
where `<handle>` is rebuilt from `author_unique_id` **after** the oEmbed call, never from user input.

### Step 1 — parse and host allow-list, BEFORE any network call (SSRF gate)
Accept only: scheme `http`/`https` (normalise to `https`), no userinfo (`user@`), no explicit port,
host case-insensitively **exactly one of**:
`www.tiktok.com`, `tiktok.com`, `m.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`.
Reject IP literals, any other host, and any host merely *ending* in `tiktok.com`
(`tiktok.com.evil.io`, `nottiktok.com` must both fail — match the full host, never a suffix).
Anything else → `UNSUPPORTED_HOST`. This gate is also the SSRF boundary (§6, Q1).

### Step 2 — strip noise
Drop the fragment. Drop **all** query parameters (oEmbed needs none; `is_from_webapp`,
`sender_device`, `web_id`, `_r`, `_t`, `_d`, `share_app_id`, `share_link_id`, `u_code`, `utm_*`,
`lang` are all VERIFIED harmless but must not enter the dedup key). Collapse duplicate slashes,
drop the trailing slash. Strip a leading locale segment matching `^[a-z]{2}(-[A-Za-z]{2})?$`
(`/en/@user/video/<id>` VERIFIED accepted by oEmbed, but normalise it away).

### Step 3 — classify the path
| Pattern | Action |
|---|---|
| `/@<handle>/video/<id>` | `kind=video`, id captured |
| `/@<handle>/photo/<id>` | `kind=photo`, id captured — see §3 `PHOTO_POST` |
| `/video/<id>` | `kind=video` |
| `/v/<id>.html` (m host) | `kind=video` |
| `/embed/v2/<id>`, `/embed/<id>` | `kind=video` (rewrite; oEmbed rejects these forms verbatim) |
| `vm.`/`vt.` host + `/<code>`, or `www.tiktok.com/t/<code>` where code `^[A-Za-z0-9]{6,20}$` | → Step 4 |
| `/@<handle>` with no post segment | `UNSUPPORTED_URL` — a profile is not a post |
| `/tag/…`, `/music/…`, `/discover/…`, `/live`, `/channel/…`, anything else | `UNSUPPORTED_URL` |

`<id>` must match `^\d{17,20}$` (all observed real ids are 19 digits). Otherwise `MALFORMED_URL`.

### Step 4 — short-link resolution (VERIFIED, E3)
`vm.tiktok.com/<code>`, `vt.tiktok.com/<code>` and `www.tiktok.com/t/<code>` share **one code
namespace** — the same code returns the same video on all three hosts.

```
fetch(shortUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
```
Follow at most **5** hops manually; re-apply the Step-1 host allow-list to **every** `Location`
before following it. Observed chain (2 hops):
`vm.tiktok.com/<code>` → `301 m.tiktok.com/v/<id>.html?…&share_item_id=<id>&…` → `301 www.tiktok.com/@/video/<id>?_r=1` → `200`.

Extract the id from the **first** `Location` matching `/\/v\/(\d{17,20})\.html/`,
`/\/video\/(\d{17,20})/`, or `share_item_id=(\d{17,20})`. **Never fetch the final HTML page** — the
id is available from headers alone, so no HTML is parsed anywhere in this design.

Two mandatory guards:
- **The final URL carries an EMPTY handle: `/@/video/<id>`.** Short links do not reveal the creator.
  Take the handle from oEmbed, not the URL.
- **A dead short code 302s to `https://www.tiktok.com/?_r=1` and then returns HTTP 200 — it does not
  404.** Never infer success from the status code; success is "an id was extracted."
  → `SHORT_LINK_UNRESOLVED`.

### Step 5 — call oEmbed
Submit `https://www.tiktok.com/video/<id>` (VERIFIED 200) or
`https://www.tiktok.com/@<handle>/video/<id>` — **oEmbed keys off the numeric id and ignores the
handle entirely** (VERIFIED: correct handle, wrong handle `@x`, and empty handle `@` all return the
same true author). Two hard requirements: the `www.` prefix is **mandatory** (bare `tiktok.com`
→ 400 even for a valid video), and `vt.`/`/t/` short forms are **rejected** by oEmbed (only `vm.`
is accepted), so always resolve short links ourselves rather than passing them through.

### Step 6 — identity
**Dedup key is the numeric video id alone.** Not the URL, not the handle (handle drift VERIFIED),
not the query string. Two users pasting `vm.tiktok.com/ZMrRs9oPp/` and
`https://www.tiktok.com/@petsmeowwoof/video/7290074173500706079?is_from_webapp=1` must land on one
source row. Rewrite the stored display URL from `author_unique_id` on every successful refetch.

### Test cases the canonicaliser must pass (all VERIFIED against live behaviour)
`https://tiktok.com/@a/video/<id>` → normalise host to `www.` · `/en/@a/video/<id>` → strip locale ·
`m.tiktok.com/v/<id>.html` → same id · `@x/video/<id>` with wrong handle → correct author returned ·
`vm|vt|/t/ + ZMrRs9oPp` → id `7290074173500706079` · `vm.tiktok.com/ZMdYXsQLW` → `SHORT_LINK_UNRESOLVED`
(302→homepage→200) · `tiktok.com.evil.io/@a/video/<id>` → `UNSUPPORTED_HOST` ·
`https://www.tiktok.com/@definitelynotarealuser999xyz` → `UNSUPPORTED_URL`.

---

## 3. Failure taxonomy

**The hard constraint (VERIFIED, E4): oEmbed returns one opaque response for every failure —**
`{"message":"Something went wrong","code":400}` with HTTP 400 — for nonexistent ids, real-id±1,
non-numeric ids, profile URLs, foreign hosts (`instagram.com`, `example.com`), a valid video missing
`www.`, and a `/photo/` path. It cannot distinguish deleted from private from region-locked, and it
exposes no `429`, `retry-after` or `x-ratelimit-*` header, so a throttle would be indistinguishable
from a bad id. Therefore **all specificity in our taxonomy must come from our own validation and
redirect resolution, which happen before the oEmbed call.** We must not display a cause we cannot
actually determine.

| Domain error | Detected by | VERIFIED? | User-facing state |
|---|---|---|---|
| `UNSUPPORTED_HOST` | Step 1 allow-list | VERIFIED | "We support TikTok links. Instagram and YouTube aren't supported yet." + manual-place search |
| `MALFORMED_URL` | Steps 2–3 (no id / bad id shape) | VERIFIED | "That doesn't look like a link to a single TikTok post." Show an example URL. |
| `UNSUPPORTED_URL` | profile / tag / music / discover / live path | VERIFIED | "That's a profile, not a post. Open the specific video and copy its link." |
| `SHORT_LINK_UNRESOLVED` | Step 4 found no id (incl. 302→homepage) | VERIFIED | "This share link has expired or no longer points to a post. Try opening it and copying the full link." |
| `PHOTO_POST` | Step 3 `kind=photo` | **UNVERIFIED — no specimen** | Provisionally treat as `POST_UNAVAILABLE`; see §5 category L |
| `POST_UNAVAILABLE` | oEmbed 400 after passing validation | VERIFIED (the 400; not the cause) | **One honest state:** "We couldn't read this post. It may be private, deleted, or unavailable in this region." → offer manual place search. **Do not guess which.** |
| `UPSTREAM_TIMEOUT` | our own AbortSignal (5 s short-link, 8 s oEmbed) | VERIFIED as implementable | "TikTok didn't respond. Retry." Retry ×2 with jitter. |
| `RATE_LIMITED` | reserved; **no 429 ever observed** | not reproducible | Same copy as `UPSTREAM_TIMEOUT`. Keep the error case so a future TikTok change surfaces cleanly. |
| `NO_CAPTION` | oEmbed 200 but `title` empty/whitespace | VERIFIED as detectable (shortest real caption seen: 27 chars, 2 hashtags only) | "This post has no caption to read." → manual place search |
| `NO_PLACES_FOUND` | oEmbed 200, caption present, extractor returns 0 candidates | **the ~73% case (E7)** | The product's most important error screen — see §4 |

`NO_PLACES_FOUND` is not an error, it is the modal outcome. It must be designed as a first-class
screen offering (a) manual POI search-and-save with the TikTok link attached, and (b) "open the
video" — never a red toast.

---

## 4. Capability level

### **LEVEL B.**

**Level A is achieved for retrieval** (VERIFIED): arbitrary public TikTok URL → full caption text +
current handle + video id + thumbnail, server-side, unauthenticated, free, ~0.5 s.

**Level A is NOT achieved for structured place extraction**, because the caption frequently does not
contain the place. Hand-labelled on the 16 real posts in E7:

| Class of recommendation TikTok | Share of sample | V1 support |
|---|---|---|
| Caption names venue(s) explicitly, often with street/neighbourhood — the "list post" / "📍 address" style | **3 of 11 (~27%)**, yielding 10 places | **RELIABLY SUPPORTED** |
| Caption names a city/neighbourhood but not the venue ("6 must-try spots in Tokyo", "best coffee in Tel Aviv") | ~5 of 11 | **NOT SUPPORTED** — venue is on-screen/spoken only |
| Caption deliberately withholds the name to drive comments ("this london restaurant", "comment for the name") | ~2 of 11 | **NOT SUPPORTED** — structurally unrecoverable from text |
| Caption is hashtag-salad or SEO keywords with no venue | ~1 of 11 | **NOT SUPPORTED** |
| Not a place post at all | 5 of 16 | correctly yields 0 candidates |

Two posts in the sample (`7494360070369709354`, `7347722826654305578`) provably recommend a named
venue (Simhovich Cafe; Nomena Café) that is absent from the caption. This is a content-structure
property of TikTok — creators put names on screen because the algorithm rewards watch time — not a
retrieval gap we can engineer around with a different endpoint.

**Sample caveat, stated plainly:** n=11 recommendation posts, sourced via web search, so biased
toward indexed high-reach content. 27% has a wide interval. §5 exists to replace this number with a
measurement on the owner's own saved TikToks. Level B stands regardless; only the percentage moves.

**What this means for V1 scope.** V1 supports the caption-bearing class end-to-end and treats the
rest as `NO_PLACES_FOUND` with a designed manual-POI-search recovery (which the superseding
constraints still permit, since it is manual *place* addition, not manual *text* paste). It must not
be presented in the demo as "paste any TikTok and it works."

---

## 5. Test-set spec (ready to run the moment URLs arrive)

Harness is committed and runnable today:
```
cd docs/evidence/tiktok
node harness.mjs <urls-file> > oembed-<set>-raw.json     # Node 22, no deps, no credentials
```
It records per URL: HTTP status, latency ms, full JSON, caption char/byte length, hashtag count, an
`endsAbrupt` truncation flag, and the field-key set.

**Deliver as a TSV: `url<TAB>category<TAB>expected_places` (semicolon-separated, `NONE` if none).**
Expected places must be hand-labelled by watching the video, *not* by reading the caption — that is
precisely what makes the set able to measure the caption gap.

| # | Category | Min | Measures |
|---|---|---|---|
| A | One named restaurant | 3 | happy path, single candidate |
| B | Several restaurants in one post (list/carousel style) | 3 | N-candidate review UI; per-place recall |
| C | Café | 2 | POI coverage for small independents (feeds D2/A2) |
| D | Bar | 2 | POI coverage + category mapping |
| E | Attraction (non-food) | 2 | extractor is not food-overfitted |
| F | City explicitly mentioned in caption | 3 | geocoding disambiguation with a city hint |
| G | **City NOT mentioned anywhere in text** | 3 | the unresolvable-without-context case; expected outcome is `NO_PLACES_FOUND`, and that must look deliberate |
| H | Hashtag-heavy (20+ tags) | 2 | hashtag noise does not produce phantom places (`#tokyofood` is not a venue) |
| I | Emoji-heavy, incl. `📍` marker convention | 2 | `📍` is a strong extraction signal — confirm and exploit |
| J | Creator commentary only, no venue named | 3 | the negative class; must yield 0 candidates, never a hallucination |
| K | Very short caption (<30 chars) | 2 | `NO_CAPTION` / low-signal boundary |
| L | **Photo/slideshow post** (`/@user/photo/<id>`) | 2 | **UNTESTED — no specimen found.** Determines whether `PHOTO_POST` is supported, a distinct error, or canonicalisable to `/video/<id>` |
| M | Non-Latin caption (Hebrew and/or Japanese) | 3 | transliteration + geocoding in target cities (feeds A5) |
| N | **Known-private post** | 1 | confirms the `POST_UNAVAILABLE` 400 |
| O | **Known-deleted post** (note the URL before deleting) | 1 | confirms deleted is indistinguishable from private |
| P | Fresh `vm.`/`vt.` share links copied from the mobile app | 4 | confirms Step 4 against *current* share-link format, not a 2023-era code |
| Q | Prompt-injection-looking caption ("ignore previous instructions…") | 1 | charter R9 |

Minimum viable: **~40 URLs**. Report produced: retrieval success rate, caption-completeness rate,
**caption-names-the-place rate per category** (the headline number), latency distribution, and any
non-400 failure signature.

---

## 6. Vercel / server-IP reliability

| Finding | Status |
|---|---|
| Works from server-side Node with global `fetch`, no browser, no cookies, no session | **VERIFIED** (E1) |
| No auth, no API key, no account | **VERIFIED** |
| No User-Agent gating: absent UA, `node`, `curl/8.7.1`, a self-identified bot UA, and a Chrome UA all → 200 | **VERIFIED** (E5) |
| No CAPTCHA / JS challenge / cookie requirement; HTTP/1.1 also fine | **VERIFIED** (E5) |
| No rate limiting at 40 sequential + 30 concurrent from one IP; no `429`, no `retry-after`, no `x-ratelimit-*` | **VERIFIED** (E5) |
| Latency: p50 511 ms, p90 626 ms, max 938 ms, cold 1.08 s | **VERIFIED** (E5) |
| Works from a **non-residential US datacenter IP** — byte-identical JSON incl. full caption, fetched through a cloud egress rather than this laptop | **VERIFIED** (E6) |
| Responses are `cache-control: no-store` behind Akamai → every import is an origin hit; we must cache ourselves | **VERIFIED** (E5) |
| Works from **Vercel's own egress IPs**, at volume, from multiple regions | **NOT VERIFIED — this is the GO/NO-GO gate** |

**The one thing that must be tested before any pipeline code is written.** Vercel egress IPs are
shared AWS ranges used by every Vercel customer, which is exactly where an undocumented per-IP quota
would bite, and a demo that only works on the student's laptop is a project failure. E6 contains a
ready-to-deploy ~10-line probe route and the exact protocol: all 16 URLs, then 200 sequential calls
logging every status, from both `iad1` and `fra1`. Estimated 30 minutes. Commit the output as
`docs/evidence/tiktok/06b-vercel-probe.json`.

Design consequences either way:
- Cache oEmbed responses in Postgres keyed by video id (also satisfies charter R7 and idempotency in
  A3), so re-imports and retries cost zero upstream calls.
- Keep the fetch behind the `SourceAdapter` seam with a 8 s timeout and 2 retries with jitter, so a
  future need to route through a provider (M10) is a one-class change.
- `runtime = 'nodejs'` (not `edge`) — the manual-redirect handling and timeouts are simplest there
  and it matches where the rest of the pipeline runs.

---

## 7. If caption text proves insufficient — smallest legitimate next step (scope only)

TikTok auto-generates WebVTT subtitle tracks for most videos, and they demonstrably contain the
venue names that the captions omit. **There is no official public endpoint that serves them**
(M8, UNAVAILABLE), and reaching them ourselves would mean parsing TikTok's internal item-detail
payload — **OUT OF BOUNDS**.

The smallest legitimate step is therefore, in order of increasing cost:

1. **Exploit the caption conventions we can already see.** The `📍` marker, `@`-mentions of venue
   accounts (`@cafe fiori` in `7496222617053990175` — a *business handle*, resolvable), and
   `Name + street + city` patterns are all present in the VERIFIED caption text and currently
   unexploited. `@`-mention-to-business resolution may lift the 27% at zero new mechanism cost.
   **Do this first; it is free and inside V1.** → hand to ai-extraction and maps-geospatial.
2. **Measure the real ceiling** on the owner's labelled set (§5) before spending anything.
3. **Only then** consider one media-level modality: ASR over the audio track. That requires
   obtaining the media, which the official surfaces do not provide → it depends entirely on M10 or a
   licensed provider, and on a security-privacy ruling. It is a charter §4 out-of-scope item
   ("video/audio/OCR/vision analysis") and a **V2 candidate behind the `Extractor` seam** — the
   architecture should keep the seam and build nothing.

Scoping note only. No design is proposed here and none should be until §5 is measured.

---

## 8. ToS / compliance notes per mechanism

| Mechanism | Posture |
|---|---|
| **M1 oEmbed** | Public, unauthenticated, `access-control-allow-origin: *`, purpose-built for third-party embedding. We consume the documented oEmbed response shape and parse no HTML. **Undocumented in TikTok's developer docs**, so no SLA and no contractual promise — TikTok may gate or change it without notice. Mitigation: `SourceAdapter` seam + our own cache + an honest `POST_UNAVAILABLE` state. |
| **M2 short-link redirects** | Following HTTP redirects on a share link the user gave us. No content is fetched or parsed; we stop at the `Location` header. Lowest-risk mechanism in the inventory. |
| **M6 Research API** | Fails on **two** independent grounds, either fatal: (a) eligibility — non-profit academic/independent research institution, funding disclosure, ethics review, ~30 days; a student final project is not an eligible applicant even at RUNI unless the institution applies on its own behalf; (b) ToS — "solely… for the sole purpose of undertaking the approved Research", commercial use and product development prohibited, and data **must be refreshed every 30 days and deleted if no longer available**, which directly contradicts charter §3 invariant 3 ("the source URL survives forever"). **Do not apply.** |
| **M7 Commercial Content API** | Ads/paid content in EEA/UK/CH only, approved researchers, non-commercial. Wrong corpus. |
| **M9 HTML scraping** | Against ToS, behind bot protection, fragile. **We will not do it, and no design may assume it.** Flagging here so it is not proposed later under another name ("just read the og: tags"). |
| **M10 third-party providers** | These exist, work, and are cheap (Apify pay-per-event ~$0.03/run + $0.004/item; Supadata-style transcript APIs with ~100 free credits/month). They return caption **and** WebVTT subtitles for arbitrary public posts. **But** they obtain it by scraping — the compliance problem is not removed, it is *outsourced*, and the vendors say so explicitly ("You are responsible for compliance with TikTok terms and applicable law"; "output may include personal data… GDPR/CCPA"). Using them makes us the controller of scraped third-party personal data (creator handle, display name, thumbnail, speech). **This is a security-privacy and academic-integrity decision, not mine to make.** My engineering position: M1 alone is sufficient for a defensible LEVEL B V1, so **no provider is needed for V1** and none should be adopted before Q1–Q8 below are answered. |

### Questions for security-privacy (blocking, in priority order)
1. **SSRF.** The Step-1 host allow-list is the only barrier between a user-supplied string and
   server-side `fetch`, and Step 4 follows redirects. Confirm: full-host equality (never suffix
   match), re-validate every `Location` hop, cap at 5 hops, reject userinfo/ports/IP literals,
   5 s/8 s timeouts, and — do we additionally need egress DNS/IP-range pinning, or is the
   allow-list on a fixed 5-host set sufficient given we never fetch a user-controlled *body*?
2. **M10 ruling.** May we use a commercial provider that itself scrapes TikTok? If the answer is
   ever "yes", it changes the V1 capability level, so we need the answer even though V1 does not
   need the mechanism. Is there a difference in your view between a caption and a transcript here?
3. **Academic integrity.** For a RUNI final project the student must defend every choice. Does
   relying on an *undocumented* (M1) endpoint need explicit disclosure in the report? My position:
   yes, and §8 row 1 is the disclosure.
4. **Personal data.** `author_unique_id`, `author_name` and the caption are third-party personal
   data under GDPR. What is our lawful basis for storing them indefinitely on a user's private map,
   and what is the minimum field set we may retain? Can we store the caption at all, or only the
   extracted place names + the URL?
5. **Prompt injection (charter R9).** Captions are attacker-controlled and go straight to an LLM.
   Confirm the extractor has no tools, no side effects, and schema-validated output only.
6. **Thumbnails.** `thumbnail_url` is a signed URL expiring in ~6 months. Copying the bytes into
   Supabase Storage means hosting TikTok CDN content; hot-linking means broken images later and
   leaking our users' referer to TikTok. Which?
7. **Rate limiting / abuse.** M1 has no observable quota, so *we* must be the limiter (charter R7,
   D11). What per-user and global ceilings on oEmbed calls per hour?
8. **Log hygiene.** Do resolved TikTok URLs and captions belong in Vercel logs at all? Default
   position: no captions in logs, video ids only.

---

## 9. Recommendations (D1)

1. **TikTok is the V1 flagship platform.** M1 + M2 only. No official API application, no third-party
   provider, no scraping, no credentials, no cost. Consistent with the owner's superseding priority.
2. **Run the Vercel probe (§6) before writing pipeline code.** It is the only unresolved
   *mechanism* risk and it takes 30 minutes.
3. **Get the labelled test set (§5), especially categories G, J, L, N, O, P.** It is the only
   unresolved *product* risk and it decides whether 27% is the real number.
4. **Design `NO_PLACES_FOUND` as a first-class screen**, not an error. At Level B it is the modal
   outcome, and disguising it would be dishonest to both the user and the examiners.
5. **Amend the charter**: §4 capability 4 (manual caption paste) is withdrawn per the owner;
   `02-risks-and-unknowns.md` §A1 TikTok rows move ASSUMED → VERIFIED as recorded here; §A1's
   contingency sentence and R1's mitigation must be rewritten, because with manual paste gone the
   accepted mitigation no longer exists and the residual risk is the 73% caption gap, not caption
   access. Instagram (secondary) and YouTube (optional) still need their own runs of this
   investigation; nothing here transfers to them.
6. **Exploit `📍`, `@`-business-mentions and `Name + street + city` patterns first** (§7 step 1) —
   free, in scope, and the only lever that raises coverage without a new mechanism.

---

## 10. Verdict

VERIFIED on 16/16 real public posts from server-side Node: the public oEmbed
endpoint returns the complete caption (uncut to 1229 chars, hashtags and emoji intact) plus the
authoritative creator handle and video id, with no auth, no key, no cost, no bot protection, no
observed rate limit at 40 sequential/30 concurrent, p90 626 ms, and confirmed working from a
non-residential datacenter IP; canonicalisation of `/@user/video/`, `/photo/`, `m.`, `/embed/`,
locale prefixes, tracking params and `vm.`/`vt.`/`/t/` short links to a single numeric video id is
VERIFIED and implementable. **GO is conditional on two things and is LEVEL B, not LEVEL A:** (1) the
30-minute Vercel-egress probe in §6 must pass, because that is the one untested mechanism risk and a
laptop-only demo is a project failure; (2) only ~27% of real recommendation TikToks name the venue
in the caption (3 of 11, hand-labelled, E7) — the rest put the name on screen or in speech, some
deliberately — so V1 reliably supports caption-bearing posts and must show a designed
`NO_PLACES_FOUND` state with manual POI search for the majority, rather than implying universal
coverage. Nothing here is blocked by TikTok's official developer platform, which is confirmed
UNAVAILABLE for arbitrary public posts (Display API is own-videos-only; Research API fails both
eligibility and its non-commercial/30-day-deletion ToS).

**TIKTOK V1: GO**
