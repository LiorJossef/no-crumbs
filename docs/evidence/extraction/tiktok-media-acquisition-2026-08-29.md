# ACQ-1 — Routes to TikTok audio or a transcript, from a public URL, server-side

Date: **2026-08-29** (UTC; the working session was 2026-08-28 local) · Owner: social-integration ·
Task: **ACQ-1** · Investigation only. No `src/**`, `services/**` or other doc was touched.

> **Why this re-opens a closed file.** `docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md`
> and `docs/product-backlog-2026-08-29.md` §14 rule media acquisition "dead, not dormant". The product
> owner re-opened it on 2026-08-29. This document maps every route honestly, including the ones the
> previous investigation declared out of bounds, so the owner can take an informed risk decision
> rather than inherit a verdict.
>
> **What I did not do.** I did not crawl or fetch `tiktok.com`. Its `robots.txt`
> (`raw/tiktok-robots-2026-08-28.txt`) puts `ClaudeBot`, `Claude-User`, `Claude-SearchBot` and
> `anthropic-ai` under a single `Disallow: /`. Everything below comes from vendor documentation,
> open-source issue trackers, the GitHub API, peer-reviewed literature, third-party write-ups, and
> raw evidence already captured in this repo. The one exception, explicitly permitted: **one** call
> to the public oEmbed endpoint (§A). I did not execute, prototype or benchmark any unofficial route.

> Labels: **VERIFIED** = measured here or read from a primary artefact committed in this repo ·
> **ASSUMED** = documented by a credible source but not tested by us · **UNAVAILABLE** = confirmed
> the capability does not exist · **OUT OF BOUNDS** = the capability exists and we will not use it
> without an explicit owner + `security-privacy` ruling.

---

## 0. The answer in one paragraph

**There is exactly one route that automatically turns a public TikTok URL into a transcript,
server-side, from a datacentre IP, at trivial cost: a commercial vendor transcript API.** Two of
them — Supadata and ScrapeCreators — expose a single HTTPS `GET`, take the TikTok URL as a query
parameter, return transcript JSON in seconds, cost **$0–$5/month at 100 imports/month**, need
**no proxy, no browser, no binary and no Whisper pipeline at all**, and would take roughly a day to
wire in. Every other route has a blocker I would call fatal: the official APIs structurally do not
carry third-party media or caption tracks; the Research API is barred to us three times over and its
transcript field is populated for only ~10–20% of videos anyway; and the unofficial direct route is
blocked at TikTok's edge for datacentre IPs, now requires JS-challenge solving plus TLS-fingerprint
impersonation, and was globally broken for eight days earlier this month. **So the decision is not
"is it possible" — it is possible and it is cheap. The decision is whether to accept a plainly-worded
ToS breach and a third-party-personal-data controller role, in exchange for a recall gain whose size
is currently unmeasured and may be much smaller than anyone thinks.** §7 says how to measure that
gain for free, with zero exposure, before spending the risk. That measurement is my top
recommendation and it does not depend on which route wins.

**One correction to the previous verdict, and it is material.** The 2026-08-28 report dismissed the
Research API on eligibility and ToS without noting that it *does* carry a transcript field
(`voice_to_text`) and *does* accept `video_id` as a query filter. That made it, on paper, an official
transcript route. It fails anyway — see §1.3 — but it failed for reasons nobody had checked, and
"we ruled it out for the wrong reason" is exactly the kind of thing this project should not repeat.

---

## 1. Official TikTok surfaces

### 1.1 Public oEmbed — VERIFIED, and it carries no media

Re-confirmed live today from server-side Node, one call, full response in §A.

- HTTP 200 in **635 ms**, `access-control-allow-origin: *`, `cache-control: no-store`, Akamai-fronted.
- Field set **unchanged** from the 2026-08-18 and 2026-08-28 inventories — 16 fields:
  `version, type, title, author_url, author_name, width, height, html, thumbnail_width,
  thumbnail_height, thumbnail_url, provider_url, provider_name, author_unique_id, embed_product_id,
  embed_type`.
- Scanned the raw body for every media-ish token: `mp4`, `play_addr`, `playAddr`, `audio`, `m3u8`,
  `video_url`, `subtitle`, `vtt`, `caption_track`, `cla_info`, `download`, `bitrate`, `duration` —
  **all absent**. `title` is the full caption (1230 chars on this specimen, uncut).

**One new observation the prior reports missed.** The `html` blockquote contains the post's
**original-sound music URL**: `https://www.tiktok.com/music/original-sound-7346702399104011040`.
So oEmbed hands us a *music id* for free, and `robots.txt` has `Allow: /music` for `User-agent: *`.
That is *not* a route to audio: the `/music/` page is an HTML page whose playable URL sits in the same
signed-CDN, JS-hydrated payload as everything else (§2), the clip served there is TikTok's trimmed
sound preview rather than the post's full audio track, and our own named user agents are
`Disallow: /` regardless. **Label: UNAVAILABLE as a media route.** Recorded so it is not
re-discovered later and mistaken for an opening.

**Label: VERIFIED — metadata plus one expiring cover image. No media, no audio, no caption track.**

### 1.2 Display API (`/v2/video/list/`, `/v2/video/query/`)

Confirmed against the prior read of the developer docs (doc last updated 2026-08-19, recorded in
backlog §14) and independent third-party documentation of the endpoint shape. `video/query/`
"given a user and a list of video ids, can check if the videos **belong to the requesting user**"
— it is own-uploads-only by construction, and the field set is
`id, title, video_description, duration, cover_image_url, share_url, embed_link, height, width`
plus engagement counts. No media URL, no audio, no subtitle, no transcript.

**Label: UNAVAILABLE.** Structurally useless: our users save *other people's* videos, and even for
their own the endpoint carries no media or caption field.

### 1.3 Research API — the route the previous verdict got right by accident

This is the one that deserved a real look, because it is the only *official* surface that carries a
transcript.

**What it actually offers.** `POST https://open.tiktokapis.com/v2/research/video/query/`. The
requestable fields include `id, video_description, create_time, region_code, share_count, view_count,
like_count, comment_count, music_id, hashtag_names, username, effect_ids, playlist_id,
video_duration, favorites_count, is_stem_verified` — and **`voice_to_text`**, documented as returning
"voice to text and subtitles (for videos that have voice to text features on, show the texts already
generated)". The query filter field names include **`video_id`** alongside `create_date, username,
region_code, hashtag_name, keyword, music_id, effect_id, video_length`, with `EQ`/`IN` operations.
So `video_id EQ <id>` requesting `voice_to_text` is a *real, official, single-post transcript lookup*.

**And it still fails, four independent times, any one of which is fatal:**

| # | Blocker | Evidence |
|---|---|---|
| 1 | **Coverage.** `voice_to_text` is populated for **~10% of videos** in one peer-reviewed evaluation and **~1 in 5** in another, skewed toward American male creators and toward post-2021 content. | Bai & Gu 2026 (*Social Science Computer Review*); "TikTok's Research API: Problems Without Explanations" (Brussels School of Governance) |
| 2 | **Region.** Eligible applicants are in the **US, Europe and Brazil**. RUNI is in Israel. The applicant must be the *institution*, with formal non-profit academic affiliation. | TikTok Research Tools eligibility page; DSA vetted-researcher framing |
| 3 | **Purpose.** "Independent and academic researchers who conduct research on a **non-for-profit** basis"; commercial users, creators and advertisers are explicitly ineligible. A shipping product is not approved Research. | TikTok Research Tools ToS |
| 4 | **Retention.** Researchers must "regularly refresh TikTok Research API Data **at least every fifteen (15) days**, and delete data that is not available… at the time of each refresh." That is now **15 days, not the 30 recorded in `04` §8** — it got stricter. It directly contradicts charter §3 invariant 3 (the source survives forever). | TikTok Research Tools ToS |
| 5 | Application turnaround "within 4 weeks", manual review, ethics review, funding disclosure. | eligibility page |

**Label: UNAVAILABLE.** Even in the counterfactual where RUNI applied on our behalf and we accepted
15-day deletion, blocker 1 alone caps the route at roughly one transcript per ten imports. Note the
shape of that number: it is the *same* ceiling problem as §7, arriving from a completely different
direction.

### 1.4 Content Posting API · Data Portability API · embed player

| Surface | Carries media / audio / a caption track for an arbitrary public post? | Label |
|---|---|---|
| **Content Posting API** | No — write-only, publishes on behalf of an authorised user. | UNAVAILABLE |
| **Data Portability API** | No. User-authorised via Login Kit; returns *the authorising user's own* watch/share/favourites history — links and post titles. No captions, no transcripts, no third-party media. It is a **volume** mechanism (bulk links), not a **recall** one, and it is app-review-gated. | UNAVAILABLE for media (already recorded as backlog 14.6) |
| **Embed player / postMessage bus** | No. Re-verified 2026-08-28 (doc updated 2026-08-04): the bus exposes player state, and `closed_caption=1` toggles a caption *icon* — **no message carries caption text**. Additionally `Disallow: /embed/@`, `/embed/v2`, `/embed/curated` for `User-agent: *`, and `Disallow: /` for our named agents. | UNAVAILABLE, and robots-disallowed |
| **A public subtitle/WebVTT endpoint for arbitrary posts** | TikTok generates auto-captions and stores them (they surface as `cla_info.caption_infos[].url` inside the *internal* item payload — §2). **No official public endpoint serves them.** | UNAVAILABLE officially |

**Official-surface verdict: there is no official route.** Not "hard" — absent. Every official surface
that returns media-adjacent data is either own-content-only or research-gated.

---

## 2. The unofficial direct route (`__UNIVERSAL_DATA_FOR_REHYDRATION__` / `item_detail`)

**Mechanism in one sentence.** Fetch the post's HTML as a browser, parse the
`__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag (formerly `SIGI_STATE`) or call the internal
`item_detail` JSON endpoint, and read out `video.playAddr` / `download_no_watermark_addr` and the
`cla_info.caption_infos[]` WebVTT subtitle URLs — then fetch those signed CDN URLs before they expire.

**I did not implement, execute or benchmark any of this.** What follows is the documented blocker set.

| Blocker | Detail | Source |
|---|---|---|
| **Datacentre IP — the decisive one** | TikTok maintains datacentre IP blocklists and blocks AWS/GCP/cloud ranges **at the edge**, returning a captcha or an empty feed. Reported success rates: datacentre proxies **10–30%**, residential **85–95%**, mobile **95–99%**. **Vercel egress is AWS. Cloudflare Workers egress is Cloudflare.** Both are datacentre. | 2026 proxy-vendor measurements; corroborated by a yt-dlp reporter — "same thing is happening with my us vps" — and by another who resolved it only by finding "a magical IP (proxy)" |
| **JS challenge** | TikTok now serves an interactive JS challenge. yt-dlp had to ship a native Python challenge solver (`#15672`, 2026-01-25) and then fix it again (`#16223`, 2026-03-13). | yt-dlp commit history (GitHub API, §B) |
| **TLS fingerprint** | As of `#17480` (2026-08-19) the TikTok extractor **attempts impersonation by default** and warns "no impersonate target is available… you need `curl_cffi`". Plain `fetch`/`undici` presents a Node TLS fingerprint, not a browser one. PR title: "Hopefully avoid mysterious, hard-to-reproduce HTTP Error 403s with impersonation." | yt-dlp PR #17480; issue #17393 |
| **Cookies / session** | The most-repeated community workaround is `--cookies-from-browser <browser>` — i.e. borrowing a real logged-in session. There is no server-side equivalent that isn't account impersonation. | yt-dlp issue #17403 comment thread |
| **Signed, expiring CDN URLs** | Media and subtitle URLs carry `x-expires` and `x-signature`. Our own oEmbed thumbnail shows the same construction (§A: `x-expires=1788112800&x-signature=…`). They must be consumed immediately and cannot be stored. Mutating one is circumventing an access control. | §A, VERIFIED |
| **Breakage cadence** | See §3. |

**ToS position, quoting the binding clauses verbatim from the copies captured in
`raw/tiktok-tos-*-2026-08-28.txt`:**

> **EEA ToS** — you must not "extract any data or content from the Platform using any automated
> system or software **that is not provided by TikTok** or approved in writing by TikTok"

> **US ToS** — you must not "scrape, crawl, export or otherwise extract any data or content in any
> form, for any purpose, from the Platform using any automated system or software, including
> automated 'bots,' except as approved in writing by TikTok USDS Joint Venture"

> **US ToS** — you must not "reverse engineer, disassemble, or decompile the Platform or any of its
> components, including its algorithms, code, or infrastructure"

Solving a JS challenge and impersonating a browser TLS fingerprint to defeat bot detection is
squarely inside the third clause as well as the first two. **Who bears the risk:** we do, directly
and solely. The exposed asset is our Vercel egress and, if a session were ever used, an account.
The realistic worst case is that TikTok blocks our egress range — which would take **oEmbed down with
it**, and oEmbed is the product's only VERIFIED retrieval mechanism. That asymmetry is the whole
argument: we would be risking the working 27% to chase the missing 73%.

**Label: OUT OF BOUNDS** on ToS, and **effectively UNAVAILABLE from Vercel or a Cloudflare Worker**
on the datacentre-IP evidence even setting ToS aside. Making it work would mean buying residential
proxies, which is buying our way *deeper* into the breach, not out of it.

---

## 3. yt-dlp and equivalents

**Mechanism.** A mature open-source extractor that implements §2 for you.

**Maturity and breakage cadence — VERIFIED via the GitHub API today, not by impression (§B):**

- **10** commits touching the TikTok extractor in the last 12 months.
- **74** issues with "tiktok" in the title opened in the last 12 months; **32 open right now**.
- **Four TikTok fixes landed in a single week**, 2026-08-18/19: `Fix extractor (#17452)`,
  `Fix formats extraction (#17460)`, `Support share URLs (#17459)`, `Re-implement impersonation
  support (#17480)`.
- Issue **#17403** documents a **total, global outage from 2026-08-10 to 2026-08-18/19** — reporters
  in the US, Europe and Brazil, "all obviously". **That is ~8 days of complete unavailability, ten
  days before this report.** Issue #17393, "Unable to extract universal data for rehydration"
  (2026-08-08), is still open.

That is the honest reliability number: **a total outage of about a week happens, and it happened
this month.** When it breaks, every import silently loses its transcript until an upstream volunteer
fixes it and we redeploy.

**Serverless viability:**

- **Cloudflare Workers: impossible.** No Python-with-native-extensions, no `curl_cffi`, no control
  over the TLS fingerprint (Workers use Cloudflare's stack), no ffmpeg. Not a close call.
- **Vercel: technically possible now, practically bad.** Fluid compute raised the package limit from
  250 MB to **5 GB** (auto-enrolled for projects created after 2026-06-30; otherwise
  `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`), so a Python runtime + `yt-dlp` + `curl_cffi` + a static ffmpeg
  (70–100 MB on its own) would now fit. Vercel's own position is that ffmpeg in functions is "not
  recommended". And it does not matter, because the egress is still AWS (§2).

**Cost.** The software is free. The *working* configuration is not: residential proxy bandwidth runs
roughly $3–$8/GB, and at ~3 MB per TikTok, 100 imports ≈ 0.3 GB ≈ **$1–$3/month** plus a proxy
subscription minimum, typically $15–$50/month.

**Effort.** Days, not hours — a Python runtime alongside a Node app, binary packaging, proxy
plumbing, plus **permanent unpaid maintenance** at the cadence above.

**Label: OUT OF BOUNDS** (same ToS clauses as §2) **and operationally unfit** for a product path.

---

## 4. Commercial vendors

All of these run **server-side over plain HTTPS from any IP**, including Vercel and a Cloudflare
Worker. None of them cares where we call from — the vendor absorbs the proxy, the challenge, the
impersonation and the breakage. That is precisely what we would be paying for.

| Vendor | What it returns | Endpoint | Price (concrete) | Free tier | Rate limit | 100 imports/mo | Effort |
|---|---|---|---|---|---|---|---|
| **Supadata** | **Transcript directly.** Timestamped JSON (`text`, `offset`, `duration`) or plain text. Native captions where present, **AI speech-recognition fallback** where not. 50+ languages, auto-detected. Accepts full URLs *and* `vm.tiktok.com` short links. | `POST https://api.supadata.ai/v1/transcript?url=…`, header `x-api-key` | 1 transcript = **1 credit**; generated (ASR) transcript = **2 credits per audio-minute**. Free 100/mo · Basic $5/300 · Pro $17/3,000 · Mega $47/30,000 | **100 credits/mo, no card** | 1/s free, 10/s paid | **$0** (free tier) to **$5/mo** if ASR fallback is common | **~1 day** |
| **ScrapeCreators** | **Transcript directly** *and*, separately, **media URLs + TikTok's own WebVTT**. `/v1/tiktok/video/transcript` returns `{status, platform, url, duration, language, transcript}`. The v2 video endpoint returns `download_no_watermark_addr`, `play_addr`, `download_addr` **and** `cla_info.caption_infos[]` with `url` (WebVTT), `lang`, `is_auto_generated`. | `GET https://api.scrapecreators.com/v1/tiktok/video/transcript?url=…`, header `x-api-key` | Video endpoint **1 credit/request**; `use_ai_as_fallback` **10 credits** (videos < 2 min). $47/25,000 credits (**$0.00188/credit**) · $497/500,000 (**$0.00099**) · entry $10/5k | **100 credits** | states "no rate limits" | **$0** (free tier) to **~$0.19–$1.88** | **~1 day** |
| **Apify** | Media URL + subtitles, via third-party actors. `apidojo/tiktok-scraper` extracts subtitles; `premiumscraper/tiktok-video-scraper` returns `subtitleInfos` with WebVTT links, language codes and an auto-generated/ASR flag. Dedicated transcript actors exist (`sociavault`, `memo23`, `sian.agency`). | Actor run via Apify API | `apidojo` **$0.30/1k posts**; `xtdata` $1/1k; `clockworks` $1.70/1k; transcript actors ~1 credit/video | Free plan with **$5 usage/mo** | per actor | **~$0.03–$0.17** usage; Starter plan $29/mo if the free tier is outgrown | **~1–2 days** (actor lifecycle, polling, dataset fetch) |
| **RapidAPI TikTok downloaders** | Media URL only (no-watermark MP4, sometimes an audio-only URL). Dozens of listings. | varies | **Could not verify.** RapidAPI pricing pages did not render usable numbers; typical listings are $0–$10/mo for a few thousand calls | varies | varies | ~$0–$10/mo | ~half a day |
| **Bright Data / EnsembleData** | Records including media metadata | — | Bright Data **$1.50/1k records** pay-as-you-go, 5,000 records/mo free. EnsembleData 50 units/day free, $100/mo for 1,500 units/day | yes | — | Bright Data ~$0.15; EnsembleData free tier fits | ~1 day |

**Labels.** Supadata and ScrapeCreators: **ASSUMED capability** — the field lists and prices above are
read from vendor documentation, not measured by us, because measuring them *is* using them and that
needs the ruling first. Apify, Bright Data, EnsembleData, RapidAPI: **ASSUMED**, same reason.

**Official partnership: none of them.** ScrapeCreators states it plainly in its own FAQ —
*"ScrapeCreators provides an **unofficial** TikTok API"* and *"an unofficial Transcript endpoint"*.
**No vendor I found claims a TikTok partnership.** If one ever does, treat the claim as the first
thing to verify, not as a reassurance.

**ToS and legal exposure — stated precisely.**

1. **The TikTok clause still binds us.** The EEA wording is "any automated system or software **that
   is not provided by TikTok**". Supadata's scraper is not provided by TikTok. Paying someone else to
   run it does not make it TikTok's software. **The breach is ours, as principal.** That is the
   previous report's finding and it is correct as a matter of text.
2. **But the operational risk profile is genuinely different, and the previous report elided this.**
   The party whose IPs get blocked, whose sessions get burned and who absorbs the eight-day outages
   is *the vendor*. Our egress never touches TikTok beyond oEmbed. The catastrophic failure mode of
   §2 — losing oEmbed and with it the whole product — **does not exist on this route.** That is a
   real distinction and the owner is entitled to weigh it. It reduces *operational* risk to near
   zero. It does not reduce *contractual* risk at all.
3. **Data protection.** Supadata's TikTok page carries no statement about the customer's
   responsibility for TikTok's terms. ScrapeCreators is silent on customer liability. Apify's own
   legal position is explicit that the *customer* is the data controller and Apify only processes on
   the customer's instructions — so the GDPR Article 6 lawful-basis question for storing a
   third-party creator's **speech**, on top of their handle and caption, lands on us. This is
   materially more sensitive than a caption: a transcript is a recording of a person's voice rendered
   as text. **This is `security-privacy` territory and it is `04` §8 Q2 and Q4, still unanswered.**
4. **Academic integrity.** The project must be defensible in a RUNI viva. "We paid a vendor to
   scrape TikTok" is a harder sentence to say out loud than "we used TikTok's public oEmbed
   endpoint", and the examiners can read the ToS as easily as I can. This is the owner's call, not
   an engineering one, and I will not soften it.

---

## 5. Routes not on the brief's list

| Route | Mechanism | Label | Why |
|---|---|---|---|
| **Gemini `url_context`** | Hand the model the TikTok URL and let Google fetch it | **UNAVAILABLE** | The tool "does not support video and audio files" and is documented as unsuitable for multimedia pages. It fetches text/HTML/images/PDF only. It would also just relocate the same scrape to Google. |
| **`/music/original-sound-<id>`** | oEmbed hands us the music id free (§1.1); `robots.txt` has `Allow: /music` for `*` | **UNAVAILABLE as media** | The playable URL sits in the same JS-hydrated, signed-CDN payload; the sound page serves a trimmed preview, not the post's full audio; our named UAs are `Disallow: /` anyway. |
| **Client-side capture in the user's own browser** (extension / bookmarklet) | The *user's* residential IP and logged-in session fetch the media, then POST it to us | **OUT OF BOUNDS, and out of scope** | It does move the ToS breach and the ban risk onto the user's own account — which is arguably worse, not better, since we would be engineering it. It is also excluded by the brief's "server-side" constraint, needs an extension we do not have, and iOS Safari cannot do it. |
| **Ask the creator for consent / Login Kit as the creator** | The creator authorises us and we read their own uploads via the Display API | **UNAVAILABLE in practice** | Correct and fully compliant, and completely unusable: our users save strangers' videos. It also still yields no media field (§1.2). |
| **On-screen text via video-frame OCR** | Download the video, sample N frames, OCR them | **Blocked upstream** | Needs the media, so it inherits §2/§4 entirely. Worth flagging because **cover-frame-only OCR is already refuted** (1/8 recall, read Brixton shopfronts as recommendations — `evidence/tiktok/cover-frame-ocr-run-2026-08-28.json`). Do not re-run the cover-frame version. |
| **TikTok GO Dining merchant APIs** | TikTok's own venue/voucher APIs (changelog 2026-01-20) | Not a transcript route | Recorded in backlog 14.9 as a competitive note. TikTok is building a venue graph next to this product's premise. |

---

## 6. What the existing pipeline actually needs

`stash@{3}` (`codex/cloudflare-audio-transcription`, paused) contains a complete Whisper pipeline:
a `transcription_jobs` table with RLS and five `service_role`-only RPCs
(`start_/claim_/complete_/requeue_/fail_transcription_job`), a `TranscriptionDispatcher` port, a
Cloudflare Worker at `services/transcription-worker`, and a `transcription-audio` bucket keyed
`<user-id>/<source-id>/audio.mp3`. Its entry point is
`parseStartTranscriptionInput({ sourceId, storageObjectPath })` — **it starts from an MP3 that is
already in the bucket.** The missing piece is exactly one function: URL → MP3 in that bucket.

**Two consequences the owner should weigh:**

1. **Cloudflare Workers AI Whisper is effectively free at this volume.**
   `whisper-large-v3-turbo` costs **46.63 neurons per audio-minute** = **$0.00051/audio-minute**, and
   the free plan grants **10,000 neurons/day** ≈ 3.5 audio-hours/day. 100 imports × ~45 s ≈ 75 audio-
   minutes ≈ **$0.04, or $0 inside the free tier**. Transcription is not the cost. Acquisition is.
2. **A vendor transcript API makes that entire pipeline unnecessary.** Supadata and ScrapeCreators
   return *text*. There is no MP3, no bucket, no worker, no queue, no job table. If the owner
   chooses the vendor route, `stash@{3}` should stay stashed and the integration becomes one adapter
   behind the existing port — which is both the cheapest route **and** the one that leaves the least
   behind if it is later withdrawn.

---

## 7. The blocker nobody has measured, and it may be the real answer

Backlog §14 caps the gain at **+5 of 16 posts** on the E7 corpus, on the ground that the recoverable
posts put the venue "on-screen **and/or** spoken". **That "and/or" is doing enormous work and it has
never been split.**

- Whisper transcribes **audio only**. TikTok's native auto-captions (`cla_info`, and what the vendors
  resell) are **also audio-derived ASR**. Supadata's ASR fallback: audio.
- Food and travel TikToks routinely put the venue name **only in an on-screen text overlay**, with
  the audio being music or unrelated chatter.
- **If the five recoverable posts are mostly on-screen-text, every audio route in this document
  returns approximately nothing** — and we would have paid the ToS price for it.

**This is measurable today, by a human, in about twenty minutes, at zero cost and zero ToS exposure:
watch the five `recoverable` E7 posts and record, per post, whether the venue name is *spoken*,
*on-screen*, or *both*.** The five URLs are in `evidence/tiktok/urls-set1.txt`
(`@briancantstopeating`, `@nom_life`, `@yallabikestlv`, `@alexandramoulavi`, `@ysabellahazan`).

**Do this before any acquisition decision.** It is the cheapest experiment in this document and it
can invalidate the entire question. If the answer is "spoken", the vendor route has a real ceiling
worth paying for. If it is "on-screen", the honest recommendation is to stop, and no ruling is needed.

I would also note honestly that n=16 with one labeller is a thin basis for a ceiling that is now
carrying this much weight, and the corpus predates the Google Places switch. The ceiling is a
**estimate**, not a measurement, and it should be described that way wherever it is cited.

---

## 8. Ranked recommendation

**Genuinely fatal — no owner ruling can unblock these:**

| Route | Fatal because |
|---|---|
| oEmbed, Display API, Content Posting, Data Portability, embed player | The capability is **absent**, not restricted. No amount of risk appetite creates a field. |
| Research API | Region (Israel ineligible), non-commercial-only purpose, 15-day deletion vs charter invariant 3, **and ~10–20% `voice_to_text` coverage**. Four independent fatalities. |
| Gemini `url_context` | Does not process video or audio. |
| Direct unofficial route from Vercel or a Cloudflare Worker | Datacentre egress is blocked at TikTok's edge (10–30% success), Workers cannot do TLS impersonation at all, and the worst case takes oEmbed down with it. |
| yt-dlp in our runtime | Same edge block, plus an **8-day total outage this month**, plus permanent unpaid maintenance, plus a Python + `curl_cffi` + ffmpeg footprint on a Node app. |

**A risk the owner could knowingly accept — one route, ranked simplest-first:**

1. **Supadata transcript API.** One HTTPS GET, transcript JSON back, accepts short links natively,
   **free at 100 imports/month**, ~1 day of work, no Whisper pipeline, no proxy, no binary, runs on
   Vercel or a Worker unchanged. Simplest and most robust. Trade-off: the transcript is a black box
   — we cannot see whether it came from native captions or ASR, so we cannot label provenance as
   precisely as this project normally demands. That matters for the extracted-vs-inferred rule.
2. **ScrapeCreators.** Slightly more work, materially more transparency: the video endpoint returns
   `cla_info.caption_infos[].is_auto_generated` and `lang`, so we could record *where the text came
   from* — which fits the working agreement's provenance rule better than option 1. It also has a
   separate media path if we ever wanted frames for on-screen text. ~$0.19–$1.88 per 100 imports
   after the free 100 credits. Slightly higher exposure: it also hands us media URLs, which invites
   scope creep we would have to discipline.
3. **Apify.** Only if a specific actor's output beats both above. More moving parts (actor runs,
   polling, datasets), a $29/mo cliff, and a third-party actor author between us and the data.
4. **RapidAPI listings.** Do not use. Unverifiable pricing, unknown operators, no accountability.

**Before any of that, do §7.** Twenty minutes, no cost, no exposure, and it can end the question.

**My own position, since I am asked for it and not to soften it.** The route is technically real,
cheap and easy — I want to be clear that "impossible" was the wrong word and I am not going to
repeat it. But the ToS text is unambiguous, the breach would be ours as principal, storing a
stranger's transcribed speech is a heavier data-protection posture than storing their caption, and
the expected gain is **five posts in sixteen at the absolute best**, possibly far fewer once §7 is
run. On that balance I would not build it, and I would spend the same day on `04` §7 step 1
(`@`-business-mention and `📍` resolution, still unexploited after three reports recommended it) —
which is free, ToS-clean, and raises the numerator instead of the denominator.

**But that is a recommendation, not a verdict, and the difference matters here.** If the owner rules
that the risk is acceptable, option 1 or 2 is a day's work and I will build it. What I will not do is
build §2 or §3 in our own runtime — those fail on engineering grounds independent of any ruling.

**What still needs a `security-privacy` sign-off if a vendor is chosen:** `04` §8 **Q2** (may we use
a provider that itself scrapes) and **Q4** (lawful basis for storing third-party personal data),
extended to cover transcribed speech specifically. Neither is mine to answer.

---

## 9. What I could not determine

- **Whether the vendors actually work**, and their real latency, coverage and failure modes. Testing
  them means using them, which needs the ruling first. Every vendor number above is **ASSUMED** from
  documentation. If the owner rules yes, the first task is a 10-URL harness against `urls-set1.txt`
  measuring transcript presence, language, latency and empty-result rate — the same shape as E1.
- **What fraction of TikToks have native captions at all**, i.e. how often a vendor falls through to
  paid ASR. This drives the real per-import cost. ScrapeCreators prices the AI fallback at **10×** the
  base credit, which suggests fallback is common enough to price separately.
- **Whether vendor-returned WebVTT URLs are themselves signed and expiring.** They come from the same
  CDN family as the thumbnail in §A, so I would assume yes and design for immediate consumption.
- **RapidAPI pricing.** The pages did not render usable numbers.
- **Whether TikTok would in practice object.** I read the terms; I am an engineer, not a lawyer, and
  I did not seek a legal opinion.
- **The spoken-vs-on-screen split (§7).** Not mine to run — it needs a human watching videos.

---

## Appendix A — the one live oEmbed call (VERIFIED, 2026-08-29)

`GET https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40exploringlondon%2Fvideo%2F7346702347491446049`
from server-side Node, IL ISP egress. **HTTP 200 · 635 ms · 4,320 bytes.**

Response headers of note:
```
access-control-allow-origin: *
cache-control: max-age=0, no-cache, no-store
content-type: application/json; charset=utf-8
server: TLB          x-cache: TCP_MISS from …deploy.akamaitechnologies.com
x-tt-logid: 2026082902161760D876124AE8CE3656CB
```

Keys returned (16, unchanged):
```
version, type, title, author_url, author_name, width, height, html,
thumbnail_width, thumbnail_height, thumbnail_url, provider_url,
provider_name, author_unique_id, embed_product_id, embed_type
```

Media-token scan over the raw body:
```
mp4=false  play_addr=false  playAddr=false  audio=false  m3u8=false
video_url=false  subtitle=false  vtt=false  caption_track=false
cla_info=false  download=false  bitrate=false  duration=false
music=true   <- only inside the html blockquote's /music/original-sound-<id> link (§1.1)
```

`title` length **1230** characters, caption complete and uncut. `thumbnail_url` is signed and
expiring — `…~tplv-tiktokx-origin.image?dr=14575&x-expires=1788112800&x-signature=DsTpSFsTPVBvMOW6uX93omCiqEw%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my`
— which is the same signed-CDN construction described in §2.

## Appendix B — yt-dlp TikTok extractor, measured via the GitHub API (VERIFIED, 2026-08-29)

```
commits touching "tiktok", last 12 months .................. 10
issues titled "tiktok" opened, last 12 months .............. 74
issues titled "tiktok" open right now ...................... 32
```

```
2026-08-19  [ie/tiktok] Re-implement impersonation support (#17480)
2026-08-18  [ie/tiktok] Support share URLs (#17459)
2026-08-18  [ie/tiktok] Fix formats extraction (#17460)
2026-08-18  [ie/tiktok] Fix extractor (#17452)
2026-03-13  [ie/tiktok] Fix challenge solving (#16223)
2026-01-25  [ie/tiktok] Solve JS challenges with native Python implementation (#15672)
2026-01-03  [ie/tiktok] Extract `save_count` (#15054)
2025-10-14  [ie/tiktok:user] Fix private account extraction (#14585)
2025-10-01  [ie/tiktok] Support browser impersonation (#14473)
2025-09-10  [ie/tiktok:live] Fix room ID extraction (#14287)
```

Issue **#17403** (opened 2026-08-10, closed 2026-08-19) — global outage, reporters in US, Europe and
Brazil; workarounds in-thread were a spoofed User-Agent, `--cookies-from-browser`, downgrading to
`2026.03.17`, and "I stumbled upon a magical IP (proxy)". Issue **#17393** (2026-08-08, "Unable to
extract universal data for rehydration") remains open, with the maintainer response
*"You need `curl_cffi`."*

## Appendix C — sources

Primary artefacts already in this repo: `raw/tiktok-robots-2026-08-28.txt`,
`raw/tiktok-tos-us-terms-of-service-en-2026-08-28.txt`,
`raw/tiktok-tos-eea-terms-of-service-en-2026-08-28.txt`,
`evidence/tiktok/06-datacenter-ip.md`, `evidence/tiktok/urls-set1.txt`,
`evidence/tiktok/cover-frame-ocr-run-2026-08-28.json`,
`evidence/extraction/transcription-and-media-feasibility-2026-08-28.md`.

External, consulted 2026-08-29 (none of them `tiktok.com`):

- TikTok Research API field list and `voice_to_text` semantics — `developers.tiktok.com/doc/research-api-codebook`, `developers.tiktok.com/docs/en/research-api-specs-query-videos` (via search index; not fetched)
- Research API filter field names — traktok (`jbgruber.github.io/traktok/reference/tt_search_api.html`, CRAN vignette)
- Research Tools eligibility and 15-day refresh — `developers.tiktok.com/products/research-api/`, `tiktok.com/legal/page/global/terms-of-service-research-api/en` (via search index; not fetched)
- `voice_to_text` coverage — Bai & Gu, "Harnessing Big Data, Hindered by Bias: Evaluating TikTok Research API…", *Social Science Computer Review*, 2026 (journals.sagepub.com/doi/10.1177/08944393251413277); "TikTok's Research API: Problems Without Explanations", Brussels School of Governance
- yt-dlp — GitHub API on `yt-dlp/yt-dlp`; issues #17403, #17393, #17332, #15418; PR #17480
- Datacentre-IP blocking and proxy success rates — aimultiple.com/tiktok-proxy, nodemaven.com/blog/proxy-for-tiktok, proxyomega.com/use-cases/tiktok-scraping
- Supadata — supadata.ai/tiktok-transcript-api, supadata.ai/pricing
- ScrapeCreators — scrapecreators.com/tiktok-api, scrapecreators.com/tiktok-transcript-api, docs.scrapecreators.com/v2/tiktok/video/, scrapecreators.com/blog/best-social-media-scraping-apis
- Apify — apify.com actor listings (`apidojo`, `clockworks`, `xtdata`, `premiumscraper`, `sociavault`, `memo23`), docs.apify.com/legal/gdpr-information
- Gemini URL context limits — ai.google.dev/gemini-api/docs/url-context
- Vercel function limits — vercel.com/docs/functions/limitations, vercel.com/docs/fluid-compute, vercel.com/kb/guide/troubleshooting-function-250mb-limit
- Cloudflare Workers AI pricing — developers.cloudflare.com/workers-ai/platform/pricing/
