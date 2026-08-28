# RICH-EXT-1 — Can we obtain TikTok audio, a transcript, or carousel images?

Date: **2026-08-28** · Owner: ai-extraction · Task: RICH-EXT-1 · Investigation only, no `src/**` change.
Raw primary sources: `docs/evidence/extraction/raw/`. Probe: `tests/manual/caption-sufficiency-trigger.manual.ts`.

> Labels per the house rule: **VERIFIED** = measured or read from a primary source here, with the
> artefact committed · **ASSUMED** = documented but untested · **UNAVAILABLE** = confirmed not
> possible · **OUT OF BOUNDS** = technically possible, we will not do it.

## Verdict in one paragraph

**There is no VERIFIED compliant mechanism to obtain a TikTok video's audio track, its media file,
its subtitle track, or the 2nd..Nth image of a photo carousel.** Every documented TikTok surface was
checked against its primary source today: oEmbed returns metadata and exactly one expiring cover
image and nothing else; the Display API returns the *authenticated user's own* uploads and exposes no
media, audio or caption-track field; the Research API is already UNAVAILABLE on eligibility and on
its own non-commercial / 30-day-deletion terms; the embed player renders inside TikTok's iframe and
is additionally `Disallow`ed in `robots.txt`. TikTok's Terms of Service prohibit, in terms,
extracting any data or content from the Platform with any automated system **not provided by
TikTok**. Media acquisition therefore requires either scraping (out of bounds) or a vendor that
scrapes on our behalf (the prohibition outsourced, not removed, plus money). **The cascade's ceiling
is the caption.** I stopped before fetching a single media byte. Step 2 of the brief was not run and
should not be.

---

## 1. Compliance — the primary sources, read today

### 1.1 `robots.txt` (VERIFIED · `raw/tiktok-robots-2026-08-28.txt`, HTTP 200, 1567 bytes)

Two findings, and the second corrects an imprecision in
`evidence/places/google-places-and-transcription-probe-2026-08-28.md` §B.

- **Every named AI agent is `Disallow: /`** — one group listing `GPTBot`, `OAI-SearchBot`,
  `anthropic-ai`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`, `Perplexity-User`,
  `CCBot`, `Bytespider`, `Google-Extended`, `Applebot-Extended`, `meta-externalagent`,
  `Gemini-Deep-Research`, `Google-NotebookLM`, `MistralAI-User`, `AI2Bot` and others, then
  `Disallow: /`. Any agent-driven fetch of any TikTok path is disallowed *by our own user-agent name*.
- **For `User-agent: *` the correct reading is narrower than "everything is blocked."** That group has
  `Allow` lines and `Disallow` lines but **no `Disallow: /`**, so under RFC 9309 a path matched by no
  `Disallow` rule is permitted. `/@handle/video/<id>` is therefore *not* robots-disallowed for a
  generic crawler. What **is** explicitly disallowed for `*`, and is exactly the surface a media grab
  would use: `/embed/@`, `/embed/v2`, `/embed/curated`, `/api/recommend/embed_videos`,
  `/api/share/settings`, `/inapp`, `/link`, `/search?`.

  The earlier note ("`/@user/video/…` is not in the Allow list for `*` either") read an allow-list
  where the standard reads a deny-list. It reached the right conclusion for the wrong reason. The
  right reason is the ToS, below — robots.txt was never the binding constraint here.

### 1.2 Terms of Service (VERIFIED, verbatim · `raw/tiktok-tos-*-2026-08-28.{html.gz,txt}` — the `.gz` is the unaltered fetched HTML, the `.txt` is its tag-stripped rendering)

US ToS, prohibited uses — you must not use the Platform to:

> scrape, crawl, export or otherwise extract any data or content in any form, for any purpose, from
> the Platform using any automated system or software, including automated "bots," except as
> approved in writing by TikTok USDS Joint Venture

EEA ToS, same list, and this wording is the one that actually decides our case:

> extract any data or content from the Platform using any automated system or software **that is not
> provided by TikTok** or approved in writing by TikTok

That clause is the line our product already sits on the correct side of, and it is worth naming
precisely because it is *not* a blanket ban:

| Automated system | Provided by TikTok? | Standing |
|---|---|---|
| The public oEmbed endpoint we use today | **Yes** — TikTok publishes and serves it, `access-control-allow-origin: *` | permitted by this clause (still undocumented in the dev docs — `04` §8 row 1 is the disclosure) |
| `yt-dlp`, a headless browser, an `item_detail` JSON fetch | No | **prohibited** |
| A vendor (Apify / ScrapeCreators / Supadata) that scrapes and resells | No — the vendor is not TikTok | **prohibited**; using them relocates the breach, it does not cure it |

Two further US clauses tighten it for a product rather than a hobby project: reverse engineering the
Platform "or any of its components… including its algorithms, code, or infrastructure" is prohibited
(a signed-CDN URL is such a component — see §2), and using TikTok Content "for commercial purposes
unless permitted" is prohibited.

I am an engineer, not a lawyer. What I can say with evidence is that the text above says what it
says, and that no reading of it makes a media download a VERIFIED-permitted mechanism. A ruling that
we accept the risk anyway is `security-privacy` + owner territory, not mine.

### 1.3 Official API surfaces (VERIFIED against the developer docs today)

| Surface | Media / audio / transcript field? | Whose content? | Label |
|---|---|---|---|
| **oEmbed** (M1) | **No.** Re-verified live on 2 posts today: field set is exactly `version, type, title, author_*, embed_product_id, embed_type, width, height, html, thumbnail_*, provider_*`. No `mp4`, `play_url`, `audio`, `music_url`, `.m3u8`, `video_url`, `subtitle`, `vtt`, `caption_track` anywhere in the payload. `raw/oembed-field-recheck-2026-08-28.json` | any public post | **VERIFIED — metadata + 1 cover image only** |
| **Display API** `/v2/video/list/` (M3) | **No.** Fields are `id, title, video_description, duration, cover_image_url, share_url, embed_link, height, width` and engagement counts. No media URL, no audio, no subtitle, no transcript. | "the given **user's** public TikTok video posts" — the OAuth'd account's own uploads | **UNAVAILABLE** — our users save *other people's* videos, so this is structurally useless even with a granted scope |
| **Research API** (M6) | n/a | any | **UNAVAILABLE** — `04` §8 already rules it out on eligibility *and* on its non-commercial + 30-day-deletion terms, which contradict charter §3 invariant 3 |
| **Embed / player** (M5) | **No.** TikTok's own doc: the embed provides attribution and TikTok's custom player; media is inside the proprietary player, not exposed as separate machine-readable assets. Additionally `Disallow`ed for `*` in robots.txt (§1.1). | any public post | **UNAVAILABLE for media** |
| **Subtitle / WebVTT endpoint** (M8) | TikTok auto-generates subtitles; **no official public endpoint serves them** | — | **UNAVAILABLE** (unchanged from `04`) |

**Compliance verdict: UNAVAILABLE.** Audio, video, subtitles: no permitted route. Stop.

---

## 2. The carousel branch closes on the same evidence, and it closes harder

The mid-flight reframe asked for a *progressive, non-exhaustive* way to pick which images of a 20–30
image carousel to inspect. That question is moot, because **we cannot obtain image 2**.

VERIFIED today on the real carousel specimen from `04` §5 category L
(`7665396684981095688`, @evesela · `raw/oembed-carousel-7665396684981095688-2026-08-28.json`):

1. oEmbed returns **one** image — `thumbnail_url`, on a `…-i-photomode-…/~tplv-photomode-image.jpeg`
   path. There is no array, no `images`, no `image_count`, no `slide` field.
2. oEmbed **does not even tell us it is a carousel.** `type: "video"`, `embed_type: "video"`,
   `html` is the standard video blockquote. The only tell is the `photomode` substring inside a
   signed CDN URL — an implementation detail of TikTok's infrastructure, not a contract.
3. That one image is the cover. Reading it is **exactly** the naive cover-frame OCR experiment that
   is already refuted (recall 1/8; read Brixton shopfronts — a hair salon and an organic shop — as
   recommended venues). Not a different experiment. The same one.

The only way to reach images 2..N would be to mutate the signed CDN path or scrape the item payload.
Both are **OUT OF BOUNDS**: the URL carries `x-signature` and `x-expires`, so manipulating it is
circumventing an access control, which is both the ToS reverse-engineering clause and a line I will
not cross on my own authority. **I did not attempt it.**

So the honest answer to "how would we rank carousel images cheaply" is: there is nothing to rank.

---

## 3. What I measured instead — the escalation trigger (this part survives the NO)

The reframe's first question — *what cheap signal says the caption was insufficient?* — is
answerable with no media at all, and it stays useful after the compliance NO, because the same signal
decides when the product should show the `NO_PLACES_FOUND` / manual-add surface rather than pretend.

Denominator is **E7** (`evidence/tiktok/07-caption-content-scoring.md`, n=16), not the recognition
corpus: E7 carries a human verdict, reached by watching the video, on whether the caption names the
venue. The corpus is caption-rich by construction and would flatter any trigger measured on it.

I split E7 into four classes, because "the caption is insufficient" and "escalating would help" are
**not the same set**:

| class | n | meaning | should a trigger fire? |
|---|---|---|---|
| `sufficient` | 3 | caption names a resolvable venue | **no** — escalation is pure waste |
| `recoverable` | 5 | place post; venue is in the video, not the caption | **yes** |
| `futile` | 3 | place post; venue is in *neither* — "comment for the name", "drop recs below", a question post | **no** — escalation costs money and finds nothing |
| `not-a-place` | 5 | control posts (cats, an app promo, comedy) | **no** |

That table alone caps the cascade: even a *perfect* trigger with a *perfect* escalator helps on
**5 of 16 posts**, and would fire wastefully on 8 if it merely detected "no venue in the caption."

### 3.1 Deterministic caption-shape signals — all weak (VERIFIED, free, n=16)

Positive class `recoverable`. Full matrix in `raw/caption-sufficiency-trigger-2026-08-28.json`.

| signal | tp | fp | fn | tn | precision | recall |
|---|---|---|---|---|---|---|
| `noPinMarker` (no 📍) | 5 | 10 | 0 | 1 | **0.33** | 1.00 |
| `cityWordOnly` | 4 | 6 | 1 | 5 | **0.40** | 0.80 |
| `noAtMention` | 4 | 7 | 1 | 4 | 0.36 | 0.80 |
| `noStreetHint` | 3 | 9 | 2 | 2 | 0.25 | 0.60 |
| `shortCaption` (<60 ch) | 0 | 2 | 5 | 9 | 0.00 | 0.00 |
| `hashtagOnly` | 0 | 1 | 5 | 10 | 0.00 | 0.00 |

`noPinMarker` has perfect recall and fires on 15 of 16 posts — it is not a gate, it is a
rubber stamp. `shortCaption` and `hashtagOnly` are worthless: the hard cases here are *long*
captions (#2 is 488 characters and names nothing). **No caption-shape heuristic is a usable trigger.**

### 3.2 "The extractor returned zero candidates" — the best trigger, and still not good (VERIFIED, n=9)

9 live `gemini-3.5-flash-lite` calls, `promptVersion` `p11-s3` (10 budgeted; 1 burned by a crashed
first attempt, so 9 ran — inside the 10-call task cap and the 500/day shared cap). Machine record:
`raw/caption-sufficiency-trigger-live-2026-08-28.json`. **Read that file's `_provenance` block**: an
offline re-run of the harness overwrote the live record, and re-running live would have taken this
task to 19 calls, so the results there are a faithful transcription of the run's output rather than a
fresh write. The clobber is fixed — the harness now writes the two passes to two files.

| post | class | candidates | trigger correct? |
|---|---|---|---|
| #1 @briancantstopeating | recoverable | **0** | ✅ fires, should fire |
| #2 @nom_life | recoverable | 1 — `tsukijifishmarket` | ❌ **silent, should have fired** (see §4) |
| #8 @yallabikestlv | recoverable | **0** | ✅ |
| #12 @alexandramoulavi | recoverable | **0** | ✅ |
| #13 @ysabellahazan | recoverable | **0** | ✅ |
| #6 @marielleisrael | futile | **0** | ❌ fires, would waste an escalation |
| #14 @gadderhq | futile | **0** | ❌ waste |
| #16 @emshelx | futile | **0** | ❌ waste |
| #7 @muchmorethanmatcha | sufficient | 1 — `Cafe Fiori` | ✅ correctly silent |

Recall **4/5 = 0.80**. Precision on the tested subset **4/7 = 0.57** — better than every
caption-shape signal, and still a coin flip. And it is optimistic: the 5 `not-a-place` controls were
not called (they were out of the 9-call budget) but would near-certainly also yield zero candidates,
which would push precision toward **4/12 ≈ 0.33** across the full set. **A cat video and a
"comment for the name" gimmick are indistinguishable from a recoverable post by this signal.**

Cost and latency of the caption call itself, for the record (real, not estimated):
**~4,880 input tokens, 10–211 output tokens per import**; elapsed p50 ≈ 2.2 s, with one 26.7 s
outlier in 9 calls. `costUsd` logs as `0` / `costModel: "unmeasured"` because no verified
per-token price for this model is on record — token counts are logged so a real price can be
applied retroactively. That is honest, and it should be closed out separately.

---

## 4. Defect found while doing this — a hashtag became a 0.95-confidence place

**Post #2 (@nom_life) has no venue in prose.** Its caption is a sentence plus 28 hashtags:

> `our full list of #tokyorestaurant recs! hard to have everything on one list, but this is a good
> jumping off point! 😉 what are you eating first? 🍣🍜🍨 #japanesefood #japan … #udon
> #tsukijifishmarket #tsukjimarket #tsukijioutermarket … #totoro #ghibli #studioghibli
> #hayaomiyazaki #sushi #omakase #foodtok #foodtiktok`

The extractor returned **one candidate, `rawName: "tsukijifishmarket"`, `cityHint: "Tokyo"`,
`modelConfidence: 0.95`.** The lowercase, space-free `rawName` is the tell: it is the hashtag,
copied. Nowhere does the caption say the creator went there.

This is `04` §5 category **H** — "hashtag noise does not produce phantom places (`#tokyofood` is not
a venue)" — failing on a real specimen. It costs twice:

1. **A confidently-wrong place.** Tsukiji Fish Market is real and will resolve cleanly, so nothing
   downstream catches it. It arrives at the user as a normal result. This is precisely the failure
   the working agreement puts above all others.
2. **It suppresses the trigger.** The one `recoverable` post the zero-candidate signal missed is
   missed *because* of this false positive.

The model's own confidence was **0.95 on a candidate derived from a topic tag** — a clean,
independent datum for the standing position that self-reported confidence is untrusted.

I did not fix it: RICH-EXT-1 is investigation-only and `src/domain/extraction/**` is out of scope for
this task. It should become its own task. The likely shape is a prompt rule plus a `post-process.ts`
guard: **a candidate whose `evidence` is only a hashtag token is not a place.** That is cheap,
testable against this exact specimen, and needs no new mechanism.

---

## 5. Recommendation

**Do not build transcription. Do not build carousel image analysis. Do not adopt a scraping vendor.**

- Compliance is **UNAVAILABLE**, from primary sources, and it is not a close call.
- Even if it were permitted, the ceiling is **5 of 16 posts**, and the best available trigger has
  ~0.33–0.57 precision, so most escalations would be spent on posts where no venue exists.
- The cost of being wrong is asymmetric and bad: an account/IP ban from TikTok kills the product's
  only VERIFIED retrieval mechanism, a ToS breach is indefensible in a RUNI final-project viva, and a
  vendor puts us in control of scraped third-party personal data (`04` §8 Q2/Q4).

**Build instead, in this order — all free, all inside the mechanism we already have:**

1. **Fix the hashtag-to-venue defect (§4).** It converts noise into a confident place *today*, on
   real user imports. Highest value per line of code in this report.
2. **Close `04` §7 step 1**, which is still unexploited: `@`-business-mention resolution, and the
   `📍` / `name + street + city` conventions. Free, and it raises the numerator rather than the
   denominator.
3. **Use the zero-candidate signal for honesty, not for escalation.** It is a poor gate for spending
   money and a perfectly good gate for "we found nothing here — add the place yourself." That is the
   modal outcome and it is already meant to be a first-class screen.

If the owner ever wants the media path reopened, the decision it needs is not an engineering one:
it is `security-privacy` + owner ruling on `04` §8 Q2, with the §1.2 clause above quoted in full.

## 6. What I could not determine

- **Whether TikTok would in practice object.** I read the terms; I did not seek a legal opinion, and
  I am not qualified to give one.
- **Whether the "on-screen text" half of the signal is recoverable at all.** E7 says the missing
  venue is "on-screen **and/or** spoken". Neither stream is obtainable, so the split between them is
  unmeasurable and stays unmeasurable.
- **Precision of the zero-candidate trigger on the 5 control posts** — not called, to stay inside the
  call budget. The reported 0.57 is therefore an upper bound.
- **Real dollars per import.** Token counts are VERIFIED; `gemini-3.5-flash-lite` per-token pricing
  is not on record in this repo, so `costUsd` is logged as `unmeasured` rather than guessed.
- **Whether `#tsukijifishmarket` reproduces.** One call, one sample. It should be pinned as a
  regression fixture, not treated as a measured rate.
- **Two of the nine cost events, and eight of the nine `modelConfidence` values**, were lost to the
  overwrite described in §3.2. Nothing in this report rests on them, and I chose not to spend nine
  more calls to recover them.
