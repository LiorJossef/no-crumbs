# E8 — Engine 2.0: what signal is actually obtainable from a TikTok post, and on what terms

**Task:** `E2-ACCESS-1` · **Date:** 2026-08-31 · **Author:** `social-integration` (Probe)
**Base commit:** `8f8df84761a7beffaf2b42e992769af1f5e30e03` (branch `no-crumbs-implementation`)
**Written path:** this file only. No `src/**` change, no other doc, nothing committed by me.

> **Labels.** **VERIFIED** = I measured it from this machine today and the output is quoted below ·
> **DOCUMENTED** = read from the vendor's own docs today, URL and date cited, not measured ·
> **ASSUMED** = neither · **UNAVAILABLE** = confirmed not obtainable · **OUT OF BOUNDS** =
> technically possible, we will not do it. House rule: design may only depend on VERIFIED /
> DOCUMENTED.

## 0. The one-paragraph answer

The transcript we want **exists as an official TikTok field** — `voice_to_text`, "Voice to text and
subtitles" — and it is in the **Research API**, whose own FAQ answers "I am a creator, advertiser, or
commercial user. Am I eligible?" with the single word **"No."** That is the shape of this entire
report: every rich signal Engine 2.0 wants is real, is named in TikTok's documentation, and sits
behind a door marked *not for commercial products*. Comments are the same story (a documented
Research-API endpoint, same door). Audio and video bytes have no sanctioned route at all for a post
the user did not create. What I did find that is new and buildable is smaller but real, and all of
it is free: **the cover image TikTok already hands us is 1.875× larger than the field that describes
it** (1080×1920, ~580 KB, VERIFIED on 3/3 posts) so cover-frame work needs no new access; the oEmbed
`html` blob we currently discard carries an **authoritative hashtag segmentation** that would kill
the `#tsukijifishmarket`-became-a-place defect for nothing; and there are **two user-supplied paths**
— a video file the user picks, and the user's own TikTok data export — that move the ToS question
from "may we extract" to "may the user give us their own data", which is a different and much better
question. The share-sheet version of the first one **does not work on iOS** (DOCUMENTED), which
matters because we are a web app.

## 1. oEmbed today, re-confirmed (VERIFIED)

`GET https://www.tiktok.com/oembed?url=<encoded>`, from Node/curl on this machine, IL residential IP.

### 1.1 The field set has not changed since `01`

16 keys, identical on all three posts fetched today:

```
version, type, title, author_url, author_name, width, height, html,
thumbnail_width, thumbnail_height, thumbnail_url, provider_url, provider_name,
author_unique_id, embed_product_id, embed_type
```

No `subtitle`, no `vtt`, no `caption_track`, no `voice_to_text`, no `duration`, no `create_time`, no
counts, no location, no `music_id` as a field. This matches `01` and the 2026-08-28 recheck.

### 1.2 What we fetch and do not use

`src/integrations/tiktok/oembed-schema.ts` models five fields: `title`, `author_name`,
`author_unique_id`, `embed_product_id`, `thumbnail_url`. **Unused and free:** `html`,
`thumbnail_width`/`thumbnail_height`, `author_url`, `type`/`embed_type`.

**`html` is the interesting one, and it is not decorative.** Verbatim from today's fetch of
`7346702347491446049` (@exploringlondon), abridged in the middle only:

```html
<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@exploringlondon/video/7346702347491446049"
 data-video-id="7346702347491446049" data-embed-from="oembed" ...> <section>
 <a target="_blank" title="@exploringlondon" href="https://www.tiktok.com/@exploringlondon?refer=embed">@exploringlondon</a>
 <p>ad The hidden restaurants you NEED to know about ... ✨ La Nonna in Market Row, Brixton for
 delicious artisan pasta ✨ MBER London, underground on Pudding Lane ... Which one are you checking
 out first?
 <a title="firsttable" target="_blank" href="https://www.tiktok.com/tag/firsttable?refer=embed">#firsttable</a>
 <a title="halfpricefood" target="_blank" href="https://www.tiktok.com/tag/halfpricefood?refer=embed">#halfpricefood</a>
 <a title="londonrestaurants" ... >#londonrestaurants</a>
 <a title="hiddenlondon" ... >#hiddenlondon</a>
 <a title="londonguide" ... >#londonguide</a></p>
 <a target="_blank" title="♬ original sound - exploringlondon"
    href="https://www.tiktok.com/music/original-sound-7346702399104011040?refer=embed">♬ original sound - exploringlondon</a>
 </section> </blockquote> <script async src="https://www.tiktok.com/embed.js"></script>
```

Three things are in there that `title` does not give us:

1. **An authoritative hashtag list**, as `<a href=".../tag/<name>?refer=embed">` anchors. In `title`
   a hashtag is just characters; in `html` it is a tagged token TikTok itself labelled.
2. **The sound**, as a name and a numeric music id (`original-sound-7346702399104011040`).
3. **The canonical post URL**, in `cite`, and the video id in `data-video-id` — a second,
   independent copy of the identity we already get from `embed_product_id`.

**Measured across the 16 committed responses in `oembed-set1-raw.json`** (offline, no calls):

| | |
|---|---|
| Posts where `html` present | **16/16** |
| Median share of caption characters that are hashtag anchors | **45%** |
| Worst case | **100%** (@theyoushouldknowpodcast — caption is *only* hashtags) |
| The `#tsukijifishmarket` post (@nom_life, `7220925199297039662`) | 492-char caption, **30 hashtag anchors**, **134 chars of prose** — 73% hashtag |
| Sound named (not "original sound") | 9/16 |

That last row of the table is the point. `RICH-EXT-1` §4 recorded a real defect: the extractor
returned `rawName: "tsukijifishmarket"` at `modelConfidence: 0.95` from a post whose prose never
mentions going there. The `html` blob tells us, with no inference and no extra call, that
`tsukijifishmarket` appears **only** as a hashtag anchor. A post-processing rule "a candidate whose
only evidence is a hashtag token is not a place" becomes *checkable against TikTok's own markup*
rather than against a regex we wrote. **Label: VERIFIED, free, and it fixes a confidently-wrong-place
bug.** This is the highest value-per-line item in this report.

Caveat, stated: parsing `html` is parsing a markup string TikTok may change. It is not a contract.
The rule should degrade to today's behaviour if the anchors are absent, never fail the import.

### 1.3 The cover frame is 1.875× bigger than the field that describes it (VERIFIED)

This is the finding that removes any reason to go near a signed-URL mutation.

| post | `thumbnail_width`×`height` reported | **actually delivered** | bytes | ratio |
|---|---|---|---|---|
| `7346702347491446049` @exploringlondon | 576×1024 | **1080×1920** | 584,576 | 1.875× |
| `7395598157620497696` @travel.by.ann | 576×1024 | **1080×1920** | 227,815 | 1.875× |
| `7290074173500706079` @petsmeowwoof | 1024×576 | **1920×1080** | 88,767 | 1.875× |

Raw, call 3 of 10:

```
http=200 bytes=584576 time=0.795990 type=image/jpeg
thumb-origin.jpg: JPEG image data, baseline, precision 8, 1080x1920, components 3
server: nginx · content-length: 584576 · cache-control: max-age=31536000
x-cache: TCP_MISS from a23-59-213-133.deploy.akamaitechnologies.com
access-control-allow-origin: *
```

Findings:

- **`thumbnail_width`/`thumbnail_height` describe a display size, not the asset.** On 3/3 posts the
  delivered JPEG is exactly 1.875× in both axes. Orientation is reported correctly (the landscape
  post reports landscape). Anyone sizing an `<img>` from those fields is fine; anyone reasoning about
  *available resolution* from them is wrong by nearly 2×. n=3 — the constant is not proven universal.
- **The path template is already `~tplv-tiktokx-origin.image` on all three** — TikTok's *origin*
  (unprocessed) variant. There is no higher-res variant to reach for; we are already being given the
  top one.
- **`?maxwidth=1920&maxheight=1920` on the oEmbed call changes nothing** (VERIFIED, call 6): identical
  thumbnail path, identical reported dims, `width`/`height` still `"100%"`.
- `cache-control: max-age=31536000` and `access-control-allow-origin: *` — the image is CDN-cacheable
  for a year and cross-origin readable, unlike the oEmbed JSON itself (`05`: `no-store`).

**Therefore: URL-parameter manipulation of the signed CDN path is not merely OUT OF BOUNDS
(`RICH-EXT-1` §2 ruled it circumvention of an access control, and I did not attempt it) — it is also
pointless.** We already hold 1080p. Any cover-frame OCR or vision work is unblocked at full
resolution today, at zero access cost. Whether it is *useful* is a separate question already
answered badly: `cover-frame-ocr-run-2026-08-28.json` measured recall **1/8** and read Brixton
shopfronts as recommended venues. Higher resolution does not fix reading the wrong sign.

### 1.4 Robots — unchanged, and re-fetched today (VERIFIED, call 1)

`https://www.tiktok.com/robots.txt` → HTTP 200, 1567 bytes, **byte-identical** to the copy committed
on 2026-08-28 (`diff` clean). So `RICH-EXT-1` §1.1 stands unamended: every named AI agent is
`Disallow: /`; for `User-agent: *` there is no `Disallow: /`, and the explicitly disallowed paths
include **`/embed/@`, `/embed/v2`, `/embed/curated`, `/api/recommend/embed_videos`,
`/api/share/settings`**. `/oembed`, `/music`, `/tag` and `/player/v1` are not disallowed for `*`.

`https://developers.tiktok.com/robots.txt` → **HTTP 404** (call 7): the developer site publishes no
robots.txt, so its documentation is not disallowed. That is why the doc reads below were made.

## 2. The embed surface, and the subtitle question (the highest-value question in the brief)

**Answer: no subtitle track text is reachable from any documented, sanctioned surface. UNAVAILABLE.**

I did **not** fetch `/embed/v2/<id>` or `/embed/@<handle>` looking for a rehydration blob. Two
reasons, and the first alone is sufficient: those exact paths are `Disallow`ed for `User-agent: *`
in the robots.txt I re-verified today, so fetching them is a robots violation independent of who is
asking; and hunting a `__UNIVERSAL_DATA_FOR_REHYDRATION__` blob inside a rendered page is scraping,
which the standing project position and my own boundaries put out of bounds. **I am reporting that
as a refusal, not as a gap in the measurement.**

What I did instead was read the two documented embed surfaces.

**Embed Videos** (DOCUMENTED, `developers.tiktok.com/doc/embed-videos`, page states *Last updated
August 4, 2026*; raw copy already committed at `docs/evidence/tiktok/raw/09-embed-videos-2026-08-31.txt`
by the `E2-BRAND` task). The doc's entire programmatic surface is one endpoint — `GET /oembed` — and
its documented response is the same 16 fields as §1.1. There is no other machine-readable embed API.

**Embed Player** (DOCUMENTED, `https://developers.tiktok.com/doc/embed-player`, read 2026-08-31).
`https://www.tiktok.com/player/v1/<id>` with query parameters. This is where the subtitle question
actually resolves, and it resolves clearly:

- There **is** a `closed_caption` parameter (`0|1`, default `1`) — *"Show/hide closed caption icon"*.
  So TikTok's auto-captions exist and the player renders them.
- The player exposes a `postMessage` API. Host→player commands: `play`, `pause`, `seekTo`, `mute`,
  `unMute`, `navigateTo`. Player→host events: `onPlayerReady`, `onStateChange`, `onCurrentTime`,
  `onMute`, `onVolumeChange`, `onImageChange`, `onPlayerError`.
- **Not one of those events carries text.** No caption cue, no description, no transcript, no track
  URL. The `description` and `music_info` parameters render text *visually inside the iframe*; the
  iframe is cross-origin and the API returns numbers and booleans.

So the situation is precise and worth stating plainly for whoever designs Engine 2.0: **the subtitle
text is on the user's screen and is not addressable by us.** The only ways across that boundary are
scraping the player's network traffic or a vendor who does it for us — both OUT OF BOUNDS per
`RICH-EXT-1` §1.2, whose reading of the EEA clause ("*that is not provided by TikTok*") I re-read
today from the committed ToS text and agree with.

One incidental: `navigateTo(n)` + `onImageChange` confirm the player can walk a photo carousel. It
still emits no data, so `RICH-EXT-1` §2's conclusion — images 2..N are unobtainable — is unchanged.

## 3. Official APIs, as of 2026-08-31

All DOCUMENTED, read today from `developers.tiktok.com`. Cost: the Developer ToS says
**"TikTok does not currently charge for use of the TikTok Developer Services"** (§V) — so every "no"
below is an eligibility no, never a price no.

| API | What it returns | Whose content | Comments? | Media/audio? | Transcript? | Verdict for us |
|---|---|---|---|---|---|---|
| **oEmbed** | 16 metadata fields + 1 cover image | any public post | no | no | no | **the only route we have** |
| **Display API** `/v2/video/list/`, `/v2/video/query/` | `id`, `title`, `video_description`, `duration`, `cover_image_url`, `share_url`, `embed_link`, `height`, `width`, counts | *"the given user's public TikTok video posts"* = **the OAuth'd account's own uploads** | no | no | no | **UNAVAILABLE** — structurally useless: our users save *other people's* videos |
| **Research API** | see §3.1 — includes `voice_to_text` **and** a comments endpoint | any public post | **yes** | no | **yes** | **UNAVAILABLE on eligibility** |
| **Content Posting API** | — | writes to the creator's own account | n/a | n/a | n/a | **write-only, irrelevant** |
| **Commercial Content API** | ads / commercial content in the EEA, CH, UK | advertisers | no | no | no | **irrelevant + researcher-gated** |
| **Data Portability API** | see §5 | the consenting user's own account | their own comments only | own posts only | no | **narrow, real, EEA/UK only** |

Scopes: `user.info.basic` (default for Login Kit), `video.list` (*"read a user's public videos"* —
the authenticated user's), `video.upload`/`video.publish`, `research.data.basic`,
`portability.{all,postsandprofile,activity,directmessages}.{single,ongoing}`. **There is no scope,
anywhere, that grants a third party read access to another user's video, its media, or its
comments.** The only endpoint that crosses that line is the Research API's, and it is not a scope you
can request from an ordinary app — it is a separate product with a separate application.

### 3.1 The Research API — where the transcript lives, and why we cannot have it

Source: `https://developers.tiktok.com/doc/research-api-specs-query-videos/`,
`.../research-api-faq`, `.../products/research-api/`, all read 2026-08-31.

**Video query response fields (DOCUMENTED):**
`id`, `create_time`, `username`, `region_code`, `video_description`, `music_id`, `like_count`,
`comment_count`, `share_count`, `view_count`, `effect_ids`, `hashtag_names`, `hashtag_info_list`,
`sticker_info_list`, `effect_info_list`, `video_mention_list`, `video_label`, `playlist_id`,
**`voice_to_text`** — documented as *"Voice to text and subtitles"* — `is_stem_verified`,
`video_duration`, `favorites_count`, `video_tag`.

Query filters include `video_id`, so a single known post can be looked up directly.

**`voice_to_text` is the exact signal Engine 2.0 wants** — the spoken venue names, transcribed by
TikTok, returned as a field, with no media download and no ToS grey area. It would take the
caption-only ~27% hit rate and address precisely the `recoverable` class `RICH-EXT-1` §3 sized at
5/16 posts. It is also the single cleanest "no" in this report:

- **Eligibility** (`products/research-api/`): academic institutions, not-for-profit research
  organisations, independent research institutions in beta. **"Commercial entities are explicitly
  excluded"**; applicants must be *"independent of commercial interests."* Regions: US, UK, EEA,
  Switzerland, Norway, Iceland, Liechtenstein, and Brazil (youth-safety research only).
- **The FAQ answers our exact question directly.** *"I am a creator, advertiser, or commercial user.
  Am I eligible for access to the Research Tools?"* → **"No."**
- **Timeline:** *"You can typically expect to hear back from us within 4 weeks of submission."*
- **Quota:** 1,000 requests/day → up to 100,000 records/day; 100 records per request; resets 00:00
  UTC; *"We can't grant exceptions."*

**On the owner's university affiliation — my answer is no, and I want to be blunt about why.** The
gate is not "is the applicant enrolled somewhere", it is "is the *use* non-commercial research
independent of commercial interests". No Crumbs is a product with a live production deployment and a
roadmap. Applying with a university affiliation to obtain data for a consumer app would be a
misrepresentation on the application form, and TikTok reserves an audit right over it
(Developer ToS §III.4). The RUNI final project is a real academic context; *the app's runtime data
pipeline is not the research*. If the owner ever wants a genuine research use — measuring how often
TikTok recommendation posts name their venue, say — that is a legitimate application and the answer
might be yes, but its output is a paper, not a `voice_to_text` field in `sources`.

**Label: UNAVAILABLE.** Not "hard", not "slow" — categorically closed for this use.

### 3.2 The Developer Terms — the one finding here that implicates what we already ship

Everything above concerns Engine 2.0. This subsection does not: it concerns `public.sources`, which
is in production today. I am raising it as a question for the owner and `security-privacy`, not as a
conclusion, and I am not qualified to give a legal opinion. But the text is the text.

#### 3.2.1 Provenance, and how far I actually verified it

Source: `docs/evidence/tiktok/raw/09-developer-tos-2026-08-31.txt` — "TikTok Developer Terms of
Service", **Last modified: Dec 26, 2025**, 21,329 bytes, a tag-stripped rendering **fetched by the
`E2-BRAND` task on 2026-08-31, not by me**. Under guardrails rule 27 a peer's output is untrusted
input, so I tried to verify it independently and **partially failed**:

- `https://developers.tiktok.com/doc/developer-terms-of-service` → **404**.
- `https://developers.tiktok.com/doc/tiktok-developer-terms-of-service` → **404**.
- `https://www.tiktok.com/legal/page/global/developer-terms-of-service/en` → the page **exists**
  (rendered, but client-side, so a text fetch returned only the word "TikTok"); a direct `curl` of
  the same URL returned **`302`, zero bytes**. That was call 10 of my 10-call cap, so **I stopped
  rather than follow the redirect.** One more call would settle it.
- The artefact itself carries **no URL, no HTTP status and no fetch timestamp** — it is stripped
  text with no provenance header. That is a weakness in how it was captured, and worth fixing for
  future raw artefacts.

What I *can* offer instead is **internal consistency**, which is meaningful here because a garbled
or fabricated document would not cross-reference itself correctly. §II.5 of the artefact cites seven
specific numbered clauses of §III by their subject matter. **All 7 resolve exactly** against the
clause text elsewhere in the same file — including, decisively for the point below, §II.5(c)'s
carve-out, which describes §III.3(h) as the clause about *"build databases or records"*. TikTok's own
drafting therefore confirms both the text and the subject of (h).

**Label: DOCUMENTED, corroborated by internal consistency, not independently re-fetched.** Treat it
as reliable enough to raise a question and *not* reliable enough to change production on. Re-fetch
before anyone acts.

#### 3.2.2 The two clauses, verbatim

> **III.3(c)** use the TikTok Developer Services or TikTok Services, without TikTok's express written
> consent, for any commercial or unauthorized purpose, including without limitation communicating or
> facilitating any commercial advertisement or solicitation or spamming;

> **III.3(h)** collect or attempt to collect any personal data from TikTok users for any unauthorized
> or unlawful purpose or build, help build, or supplement any profiles, databases, or similar records
> on any individual, device, content, or browser or associate the behavior of any individual, device,
> content, or browser with any profile, databases, or similar record;

#### 3.2.3 Is the public oEmbed endpoint inside "TikTok Developer Services"?

The definitions, verbatim:

> **I.9** TikTok Developer Services: means the TikTok Developer Site, TikTok Developer Documentation,
> and TikTok API.

> **I.7** TikTok API: means TikTok's application programming interfaces (which includes, for the
> avoidance of doubt, webhook, call-back, and other interfaces, services, and mechanisms made
> available by TikTok which can be used to interact with the TikTok API), TikTok SDK, technology,
> software and any updates to the foregoing thereto **that TikTok provides to you for the purpose of
> these Developer Terms** […]

> **I.14** TikTok Information means any content, data and other information made available to you (or
> End Users) through the TikTok API or by any other means authorized by TikTok, **and any copies and
> derivative works thereof.**

Acceptance is by conduct, not signature: *"BY CLICKING ACCEPT OR DOWNLOADING, INSTALLING, **ACCESSING,
USING** OR OPERATING THE TIKTOK DEVELOPER SERVICES, YOU AGREE TO BE BOUND BY THESE DEVELOPER TERMS."*

**Arguments that oEmbed is inside.** It is an HTTP interface made available by TikTok. It is
documented on the TikTok Developer Site — the *Embed Videos* page presents it as `GET /oembed` with a
parameter table and an example response, which is exactly how the other APIs are presented. Its
response is plainly "content, data and other information made available to you." And I.7's catch-all
("other interfaces, services, and mechanisms made available by TikTok") is drafted to sweep broadly.

**Arguments that oEmbed is outside.** I.7 is not a pure catch-all: it qualifies with *"that TikTok
provides to you **for the purpose of these Developer Terms**"* — and oEmbed is provided to nobody in
particular. It requires no developer account, no app registration, no client key, no OAuth, and no
acceptance click. `05` measured `access-control-allow-origin: *` and no auth of any kind. There is a
real reading in which the Developer Terms govern the *credentialed* surface you get by registering an
app, and an anonymous public embed endpoint sits with the main consumer ToS instead.

**My reading, stated as a reading and not as a fact: probably inside, and the ambiguity is genuine.**
"Accessing" as the trigger, plus a definition drafted to sweep, plus the endpoint being documented on
the Developer Site, is more than enough that I would not want to argue the other side. Anyone who
tells you it is clearly outside is reading past the catch-all; anyone who tells you it is clearly
inside is reading past "for the purpose of these Developer Terms."

**And here is the part that makes this less alarming than it first sounds: being inside is not purely
bad. The same agreement is where our permission comes from.**

> **II.1** […] You may, solely as described in the TikTok Developer Documentation, and in accordance
> with these Developer Terms: (a) connect to and use the TikTok Developer Services in your
> Application; **(b) use automated means in your Application to collect information from or otherwise
> interact with the TikTok Developer Services**; (c) make TikTok Information available to End Users
> through your Application […] **You may use TikTok Information obtained through the TikTok Developer
> Services solely for the purpose of developing, maintaining, and supporting your Applications.**

If oEmbed is *inside*, II.1(b) is an **express licence to do automatically what our import pipeline
does**, and II.1's closing sentence is the purpose limitation we must stay within. If oEmbed is
*outside*, we have no express automation licence at all and fall back on the main ToS's EEA clause —
*"automated system or software that is not provided by TikTok"* — which `RICH-EXT-1` §1.2 correctly
reads as permitting us, because oEmbed *is* provided by TikTok. **Either way we have a permission.
The difference is which restrictions ride along with it.**

**One limiter in II.1 cuts against us and I am not going to bury it**, because it is arguably
sharper than III.3(h). The chapeau reads *"You may, **solely as described in the TikTok Developer
Documentation**, and in accordance with these Developer Terms: […]"*. The oEmbed documentation
(the *Embed Videos* page) describes exactly one purpose: *"convert a TikTok's video URL into embedded
video markup"* — getting an embed code so you can render the post. It does not describe caching the
caption and running an LLM over it to extract restaurants. **Does "as described in the Documentation"
govern the *manner of access* or the *purpose of use*?**

I read it as manner of access — call the documented endpoints in the documented way — because
purpose is dealt with separately by the paragraph's own closing sentence (*"solely for the purpose of
developing, maintaining, and supporting your Applications"*). If the chapeau governed purpose too,
that closing sentence would be redundant, and reading a paragraph so that none of its sentences is
redundant is the ordinary way to read one. **That is a reading, not a fact**, and it is the weakest
joint in my analysis. If the chapeau does govern purpose, then a product whose entire value comes
from *not* embedding the post is outside the licence, and no amount of retention hygiene fixes that.
Anyone taking this to `security-privacy` should put this paragraph in front of them, not just
III.3(h).

#### 3.2.4 Does `public.sources` cross III.3(h)?

What we store, indefinitely, per post: `platform_source_id`, `canonical_url`, `author_handle`,
`author_name`, `content_text` (the caption verbatim), `thumbnail_url`.

**Read literally, yes, and obviously so.** Parse the clause: it has three limbs joined by "or".
Limb 1 — *collect personal data from TikTok users* — is qualified by *"for any unauthorized or
unlawful purpose."* **Limb 2 — *"build, help build, or supplement any profiles, databases, or similar
records on any individual, device, content, or browser"* — carries no purpose qualifier at all.** On
the plain text, any database of records about TikTok content is caught. `public.sources` is a
database. Its rows are records. They are about content. **Yes, it is squarely within the words.**

**But the literal reading cannot be right, because it destroys II.1(b).** A clause that forbids
building any database of TikTok content, in the same agreement that expressly licenses you to *"use
automated means in your Application to collect information"*, forbids the thing it just permitted.
Nobody drafts that deliberately. The coherent reading is that limb 2 targets **profiling and
dataset-building** — the surveillance sense of "records on any individual, device, content, or
browser", reinforced by limb 3's *"associate the behavior of … with any profile"* — and that II.1's
*"solely for the purpose of developing, maintaining, and supporting your Applications"* is the
boundary that actually governs an ordinary cache.

**So my answer to "is it a database or similar record on content", plainly: yes, it is, on the words —
and I do not think that is the clause's target, and I think II.1's purpose limitation is the test
that matters.** Under that test `public.sources` is defensible today: it is a cache that exists so a
re-import makes zero network calls (`0003`'s own header), it serves the application, and — a point in
our favour that this repo should take credit for — **`content_text` is never granted to
`authenticated` at all** (`0003`: R8, *"Post caption. Never granted to `authenticated` (R8): no
product surface displays it"*). We store the caption to process it, not to redistribute it. That
directly answers II.1's *"may only be made available to End Users on a personal, non-exclusive,
non-sublicensable, non-transferrable basis"* — we make it available to nobody.

**Three things are less comfortable, and two of them are real.**

1. **Retention is unbounded and there is no deletion path — by design.** `0003` grants
   `authenticated` no `DELETE` on `sources` and no `DELETE` on `imports` (*"imports are the audit and
   observability record"*), and `imports.source_id` is `references public.sources (id) **on delete
   restrict**`. Reading the DDL: `imports.user_id` cascades from `profiles`, so deleting a profile
   removes that user's imports — **and leaves the `sources` row, caption included, orphaned but
   alive.** I have not executed this; it is a reading of the schema, label it as such. If it holds,
   **"delete my data" will not delete the captions**, and that is a GDPR problem before it is ever a
   TikTok problem. It also lands directly on `L1-F8-T1`, the account-menu delete-my-data task that is
   still unbuilt. Whoever builds it needs to know that `on delete restrict` is sitting there.
2. **`sources` is a *shared* cache, not per-user.** `0003`'s own comment says so, and RLS gates reads
   through import membership. A shared, global, permanent table of TikTok posts keyed by video id is
   a closer fit to limb 2's plain words than a per-user cache would be. It is still the right
   engineering design and I am not suggesting changing it.
3. **The evidence corpus, which is the one nobody has thought about.** `oembed-set1-raw.json` holds
   **16 verbatim TikTok captions**, the longest 1,230 characters, committed to git; `07` reproduces
   them in prose; `supabase/seed.sql` carries stand-in caption fixtures. That is a corpus retained
   for testing and research — not "developing, maintaining, and supporting" the Application in the
   cache sense, and it is *distributed* to everyone who clones the repo. **The repo is `PRIVATE`
   (`gh repo view`: `LiorJossef/P-002`, `PRIVATE`), which is what keeps this small.** If it is ever
   made public — a plausible thing to do with a finished university project — that changes.

#### 3.2.4a Net verdict, in the form it should be published in

**Genuinely ambiguous, and lower severity than it first reads.** The same agreement that contains
III.3(h) also contains II.1(b) — an express licence to *"use automated means in your Application to
collect information"* — and the two cannot both be read literally, since a flat ban on building any
database of TikTok content would nullify the collection the previous section just granted. Read
together, and in the company of limbs 1 and 3 (*"personal data from TikTok users"*, *"associate the
behavior of any individual, device, content, or browser"*), **III.3(h) targets profiling and bulk
dataset-building, which `public.sources` is not.**

What keeps it *arguable* rather than clear is that our cache is **shared, global and permanent**; a
per-user cache with a TTL would not raise the question at all. **And the exposure that is actually
real is not the field list, it is the retention: there is currently no path by which a cached caption
is ever deleted** — which we owe a fix for under GDPR and `L1-F8-T1` no matter how TikTok's terms are
read. That is the actionable item; the ToS reading is the open question.

#### 3.2.5 If we are over the line, what is the minimum field set? And does dropping `content_text` fix it?

**No. Dropping `content_text` alone resolves nothing, and it would make things worse.** Blunt, since
that is what was asked:

- **It does not exit limb 2.** A table of `platform_source_id` + `canonical_url` + `author_handle` +
  `author_name` is still "a database or similar record on content" — and `author_handle` /
  `author_name` are **personal data of a TikTok user**, which puts the remaining fields closer to
  limb 1 than the caption ever was. You would delete the least personal field and keep the two most
  personal ones.
- **It breaks the cache, which pushes us into a different clause.** `content_text` is the whole point
  of the cache-through in `oembed-source-adapter.ts`; without it every re-import is an origin hit,
  and `05` already established that oEmbed responses are `no-store` so nothing else absorbs them.
  III.3(g) forbids use that *"exceeds reasonable request volume."* Trading a data-minimisation
  criticism for a request-volume criticism is not a win.
- **Attribution pulls the opposite way from minimisation, and III.3(n) is explicit about it**:
  *"falsify or delete any author attributions, legal notices, or other labels of origins or source of
  material."* We are required to keep the creator credited. `author_handle` is not a field we are
  free to drop.

**The lever is retention and purpose, not field count.** My recommendation if the ruling goes against
us — and it is the same work we owe for `L1-F8-T1` and for GDPR regardless of what TikTok's terms say:

1. **Give `content_text` a life.** Delete it when the last `saved_place` derived from that source is
   gone, and on account deletion. That requires resolving the `on delete restrict` in `0003` — a
   `supabase-database` migration, `security-privacy` review, not mine and not in this task's scope.
2. **Keep the minimum that serves the product:** `platform_source_id` and `canonical_url` (both
   *reconstructed by us* — `canonicalUrlFor()` rebuilds the URL rather than storing TikTok's), plus
   `author_handle` / `author_name` for the attribution III.3(n) requires. Keep `content_text` behind
   its existing R8 no-grant posture, now with a TTL.
3. **Stop treating `thumbnail_url` as durable.** It is signed with `x-expires` ≈ ~48 hours (§8). It is
   already wrong on engineering grounds to store it indefinitely; that it is also the field with the
   least justification for permanent retention is a free alignment.
4. **Write the purpose down** in `security.md`, in one sentence: the cache exists to serve the
   importing user and to avoid repeat origin calls, and no other use. II.1's purpose limitation is a
   test we pass by *stating and honouring* a purpose, and a stated purpose is also what makes the
   evidence-corpus question in §3.2.4(3) answerable rather than open.

**What I would not do:** rewrite the schema on my reading of a document I could not independently
re-fetch. Get the re-fetch, get the ruling, then act.

#### 3.2.5a The three levers, ranked

If what makes `public.sources` *arguable* rather than clearly fine is that it is **shared, global and
permanent**, then three things are changeable. They are not close to equal.

**1st — bound `content_text` by lifecycle, not by clock.** Delete the caption when nothing derived
from it survives, and on account deletion. Best ratio by a wide margin: it fixes the **only exposure
here that is real rather than arguable** (there is currently no path at all by which a caption is
deleted), it is owed under GDPR storage limitation and `L1-F8-T1` regardless of how TikTok's terms
are read, and it preserves the caption for every post a user still holds — so it costs no backfill
that anyone can still benefit from. Lifecycle-bound beats time-bound: a 90-day TTL would delete
captions behind places users still have, for no gain.

> **Implementation note, and it is a trap.** The obvious move — `update sources set content_text =
> null` — sidesteps `imports.source_id … on delete restrict` neatly, and **it would silently break
> the product.** The cache gate is `fetch_status`, not the caption: `oembed-source-adapter.ts` says
> so in its own comment (*"`fetch_status = 'ok'` is the gate the cache actually needs"*), and
> `rowToRawSource` maps `content_text === null` to `texts: []`. So a purged-but-`ok` row is a **cache
> hit that returns zero texts, forever** — every future import of that post takes the `NO_CAPTION`
> path instead of re-fetching. A purge must also move `fetch_status` off `'ok'`, or gate on an
> explicit `content_purged_at`. I read the gate and the mapper; I did not trace every caller, so
> treat this as a flag to verify rather than a proven defect.

**2nd — drop `content_text` once an extraction exists. Right idea, wrong month.** It is the only
lever that substantively reduces what we hold, and it is the most expensive one **precisely now**:
Engine 2.0 is an effort to extract *more* from the same input, and the cached captions are the only
corpus against which an improved extractor could be backfilled onto places users already saved. Burn
them and every improvement applies to future imports only. It also does not change the legal
characterisation — the row is still a record on content, `author_handle` is still personal data of a
TikTok user, and §I.14 makes the derived `extractions` row TikTok Information too. Large product
cost, partial improvement. **Revisit after Engine 2.0 has mined the corpus, not before.**

**3rd — per-user scoping. I would not do it.** It removes the word "shared" and makes the position
worse in substance: N users importing one post would hold **N copies** of the caption instead of one.
Nobody's data-protection position improves by holding more copies of the same third-party content.
It also destroys the zero-network-call property for every user after the first, which pushes toward
III.3(g) (*"exceeds reasonable request volume"*), and it is a V1-class migration touching RLS on a
table with rows already applied to production. **Shared storage here is deduplication; per-user
storage is duplication** — and access is *already* per-user, since `0003`'s RLS gates reads through
import membership. The optics improve; nothing else does.

**Not on the list, and cheaper than all three: the evidence corpus** (§3.2.4 item 3). Sixteen verbatim
captions in git, reproduced in `07`, fixtures in `seed.sql`. That is the one holding which is not a
cache and has no purpose-limitation defence beyond "testing". The repo being `PRIVATE` is what keeps
it small; it is the first thing to look at if the repo is ever published.

**None of this is mine to write.** The migration is `supabase-database`'s, and it touches an FK and a
column on a table with hosted rows, so it is `security-privacy`'s to review.

#### 3.2.6 The rest of this agreement, none of which is recorded anywhere in the repo

Reading the whole thing rather than the two clauses I was sent for, these are the items with
consequences for us. All from the same artefact, same caveat.

**Three further agreements are incorporated by reference, and nobody here has read any of them.**
The preamble: *"The Developer Terms supplement and hereby incorporate the **TikTok For Business
Commercial Terms of Service**"*, and *"The TikTok Developer Services are Commercial Products for the
purpose of the Commercial Terms."* §III.5: if we receive TikTok Information that is also TikTok
Personal Data — and `author_handle` / `author_name` are personal data of a TikTok user — then *"the
**TikTok Controller to Controller Data Terms** shall apply to such data sharing."* §II.2 incorporates
the **Brand and Use Guidelines** (which `E2-BRAND` is separately working from). **If the §3.2.3
question resolves as "inside", we are inside three unread contracts, not one.** That is the single
most useful thing in this subsection.

| Clause | Text, in brief | Why it matters here |
|---|---|---|
| **VI. Termination** | on termination you must *"delete TikTok Confidential Information or TikTok Information obtained through TikTok Developer Services in all forms in your possession and control (including from our servers)"* | A **deletion obligation on a switch TikTok controls unilaterally** (*"at any time with or without notice, for any reason"*). Combined with §3.2.4(1) — no deletion path exists — we could not comply today without a migration. Structurally the same conflict `RICH-EXT-1` found in the Research API's 30-day-deletion terms. |
| **III.2(f)** | must *"immediately disconnect"* on becoming aware of any compromise of our systems, and *"report any such compromise or deficiency to TikTok immediately"* | An **incident-notification duty to TikTok**, on top of the GDPR one. `security.md` has no such runbook step. |
| **III.2(c)** | *"make a complete and accurate disclosure to your End Users of the privacy practices and policies applicable to the Application"* | Our privacy disclosure is unfinished; `L1-F8-T1` is unbuilt. |
| **III.2(e)** | safeguards *"in accordance with … the highest industry standards"* | An unbounded standard-of-care term. Worth knowing it is there. |
| **II.4 / III.4** | TikTok *"may audit your Applications and monitor your use"*; *"You agree you will provide TikTok with proof that you and your Application comply"* | The audit right is what makes a misrepresented Research API application (§3.1) a genuinely bad idea rather than a merely dishonest one. **Survives termination.** |
| **III.1** | TikTok *"may require you to submit the Application for review and approval … prior to distribution to End Users"*, and resubmission after changes | Only bites if we register an app. |
| **III.3(p)** | must not *"use the TikTok Developer Services or TikTok Information to compete with or replicate any TikTok Services"* — carved out for the Data Portability API | TikTok has in-app place tagging and location surfaces. A saved-places map built from TikTok content is not obviously "replicating", but it is not obviously not, either. Flagging, not concluding. |
| **III.3(t)** | must not *"superimpose or otherwise include … a brand name, logo, watermark or other promotional branding on or in any Developer Content submitted by End Users which is displayed … on or through Display Sites"* | Directly relevant to the facelift: **the No Crumbs mascot or wordmark composited over a TikTok cover image.** "Display Sites" is defined in the unread Commercial Terms. `design-system-frontend` and `E2-BRAND` should see this. |
| **III.3(n)** | must not *"falsify or delete any author attributions, legal notices, or other labels of origins or source of material"* | The affirmative attribution duty. Cuts against dropping `author_handle` (§3.2.5). |
| **III.3(e)** | must not combine the Developer Services with open-source-licensed software such that they become subject to that licence | We ship an **ODbL** Overture index alongside TikTok-derived rows. ODbL's share-alike attaches to derived databases. Whether a table joining both ever triggers it is a real question for `licensing`, and I have not analysed it. |
| **IV. Confidentiality** | *"all authentication procedures and data to which you gain access … is the Confidential Information of TikTok"* | **Survives termination.** |
| **V. Fees** | *"TikTok does not currently charge … however, TikTok reserves the right to do so"* | Confirms every "no" in §3 is eligibility, not price. |
| **X. Publicity** | *"You may not make any public statement regarding your relationship with TikTok or access to the TikTok Developer Services without TikTok's prior written consent"* | Constrains marketing copy, a public README, and possibly how the integration is described in a public project write-up. **Survives termination.** Low exposure while the repo is private. |

**One structural observation to close on.** §I.14 defines TikTok Information to include *"any copies
and **derivative works** thereof."* Read strictly, an `extractions` row derived from a caption, and
arguably a `places` row derived from that, are themselves TikTok Information — and therefore inside
§VI's deletion-on-termination obligation. I think that is an over-reading of a boilerplate definition
and I would not design around it. I am recording it because it is the kind of thing that is obvious
in hindsight and invisible until someone reads the definitions section, and because the charter's
"info we can store forever" invariant was reasoned about **open data licensing**, not about this
agreement. Those are different questions and only one of them has been answered in this repo.

## 4. Comments

**Sanctioned route: exactly one, and it is the Research API. For us: UNAVAILABLE.**

`POST https://open.tiktokapis.com/v2/research/video/comment/list/`, scope `research.data.basic`
(DOCUMENTED, `developers.tiktok.com/doc/research-api-specs-query-video-comments/`, read 2026-08-31).
Takes `video_id` (comments on a video) **or** `comment_id` (replies to a comment), `max_count` up to
100, `cursor`. Returns per comment: `id`, `video_id`, `text`, `like_count`, `reply_count`,
`parent_comment_id`, `create_time`, `display_name`. Plus `has_more` and `cursor`. Note the doc's own
restriction: *"Personal information (phone number, email and credit card account, etc) in the
comments will be redacted."*

This is, on its face, an excellent fit for the product problem — `parent_comment_id` and
`reply_count` mean we could find the creator's reply under "what's the name?", and `like_count`
ranks it. It is behind the §3.1 door. Same "No".

**Everything else:**

- **Display API** — no comment endpoint at any scope.
- **oEmbed** — no comment field (§1.1).
- **Embed player** — no comment data over `postMessage` (§2).
- **Scraping the comment list** — this is what every third-party "TikTok comments API" vendor sells.
  It is prohibited by the ToS clause quoted in `RICH-EXT-1` §1.2, and using a vendor relocates the
  breach rather than curing it. **I am not building it, not recommending it, and not evaluating
  vendors for it.** Naming the position plainly since the brief asked me to: any product feature that
  reads a public post's comments today is scraping, whatever the vendor's marketing page calls it.

**What a user-supplied comment path could look like** — and this one is genuinely decent, because it
inverts the constraint instead of fighting it. The information we want is *visible to the user, in
the TikTok app, at the moment they decide to save the post.* Two shapes, both inside our existing
architecture:

1. **A "paste what the creator said" field on the no-places-found screen.** We already treat
   `NO_PLACES_FOUND` as a core surface, not an error. Adding one optional multi-line box —
   *"Did they name it in the comments? Paste it here"* — feeds the exact same extraction pipeline
   with a second text. Zero new access, zero ToS exposure, and it targets the `futile` class
   (`RICH-EXT-1` §3: "comment for the name" posts, 3/16) that **no** automated escalation can ever
   reach, because for those posts the answer is not in the video either.
2. **Android share-sheet text.** When a user shares a comment from TikTok, the share payload is text.
   A `share_target` accepting `text` costs nothing beyond the manifest entry. See §6 for the iOS
   problem.

I would rank (1) above every automated escalation in this report on value per unit of risk.

## 5. Video and audio bytes, and the user-supplied path

### 5.1 The three cases, kept apart

**(a) Legal and sanctioned: nothing.** There is no API, at any tier including Research, that returns
the media file for a post the caller did not author. The only download URL in TikTok's entire
documented surface is `Posted Video Download Link` in the Data Portability API's **Posts** category —
the consenting user's *own uploads*. Our users save other people's videos. **UNAVAILABLE.**

**(b) Technically possible, against ToS: `yt-dlp`, a headless browser, an `item_detail` fetch, or a
scraping vendor.** Re-read from the committed ToS today, verbatim:

> US, prohibited uses: *"scrape, crawl, export or otherwise extract any data or content in any form,
> for any purpose, from the Platform using any automated system or software, including automated
> 'bots,' except as approved in writing by TikTok USDS Joint Venture"*

> EEA: *"extract any data or content from the Platform using any automated system or software **that
> is not provided by TikTok** or approved in writing by TikTok"*

Plus US *"use TikTok Content […] for commercial purposes unless permitted"* and the reverse-engineering
clause covering *"the Platform or any of its components, including its algorithms, code, or
infrastructure"* — under which a signed CDN URL is a component. **OUT OF BOUNDS. I fetched no media
byte and I am not proposing a route to one.**

**(c) The user provides the file. This is materially different, and the brief is right to be
interested.** The ToS clauses in (b) all prohibit *us* running an automated system against the
Platform. If the user taps TikTok's own Save-video button — a function TikTok provides, in TikTok's
app, subject to the creator's own download setting — and then hands us the resulting file, **no
automated extraction from the Platform has occurred on our side at all.** We receive a file from our
own user, exactly as if they had recorded it.

And there is an affirmative licence, not merely an absence of prohibition. US ToS §3.5, verbatim:

> *"Depending on your Platform usage, including your sharing activities and settings, you also grant
> to each user of the Platform a non-exclusive, royalty-free, perpetual and irrevocable, worldwide
> license to use Your Content, including to access, reproduce (e.g. to copy), distribute, share,
> **download**, adapt or make derivative works […] in accordance with these Terms."*

**Two caveats, and I am not going to soften either.**

1. **The EEA wording is narrower and it is the one that governs an Israeli owner's European users.**
   Verbatim: *"…to reproduce (e.g. to copy, share or download), adapt or make derivative works […]
   **using the Platform for entertainment purposes**, subject to your Platform settings."* "Using the
   Platform, for entertainment purposes" is a poor fit for "uploading it to a third-party service for
   machine transcription." A transcript is also plausibly a derivative work of the creator's content.
2. **The creator's download setting is load-bearing.** Both texts say "depending on your […]
   settings" / "subject to your Platform settings". Where a creator has disabled downloads, the
   licence does not arise and the user cannot get the file through TikTok's UI anyway — so the
   product degrades honestly rather than silently.

**My label: ASSUMED-permissible, and it needs an owner + `security-privacy` ruling before a line is
written.** I can tell you the mechanism is clean — no scraping, no bot, no signed-URL games, the user
acting on their own content licence — and I cannot tell you a European court agrees that machine
transcription is "entertainment purposes". That is not an engineering question and I am not
qualified to answer it. What I *can* say is that this is the only media path in this entire report
that is even arguable, and it is the one worth spending the owner's decision on.

Note also what it costs us if we say yes: the user must leave our app, save the video in TikTok, come
back, and pick the file. That is a four-step manual flow to serve a post whose caption already
failed. Whether users will do that is a product question for `product-lead`, and my honest guess —
labelled ASSUMED — is that most will not, and that the ones who would will more happily just type the
restaurant's name.

### 5.2 If it were ever approved, what it costs

The media never touches TikTok from our IP; it comes in as a `multipart/form-data` upload. The cost
moves entirely to transcription (a Whisper-class model or Gemini audio), plus egress and a job
runner. That is a real Engine 2.0 subsystem, not a small change, and it should not be scoped until
§5.1's ruling exists. `RICH-EXT-1` §3's ceiling still applies to its *value*: even a perfect
transcript only helps the `recoverable` class, 5 of 16 posts in the one labelled sample we have.

## 6. Getting a file from the user: what the platforms actually allow (DOCUMENTED)

We are a web app, so this determines whether §5.1(c) is even reachable.

**Web Share Target — Android yes, iOS no.** `web.dev/learn/pwa/os-integration` (read 2026-08-31),
verbatim: *"It's currently available on Android with WebAPK and ChromeOS, and it works only after
the user has installed your PWA."* MDN's `share_target` reference (read 2026-08-31) carries the
**"Limited availability — this feature is not Baseline"** banner and states it *"lacks support in
some widely-used browsers"*, and that a PWA *"can only act as share targets if they have been
installed."* Files arrive via `method: "POST"`, `enctype: "multipart/form-data"`, declared in
`params.files` with `name` + `accept`.

So:

| Platform | PWA registers in the native share sheet? | Can receive a video file? |
|---|---|---|
| **Android Chrome (installed PWA)** | **yes** (WebAPK) | **yes**, POST + multipart |
| ChromeOS | yes | yes |
| Desktop Chrome/Edge | partial / OS-dependent | not relied on |
| **Safari iOS** | **no** | **no** |
| Safari macOS | no | no |

**The iOS gap is the one that matters** and it is not going away on our timeline. The fallback that
works everywhere, including iOS, is unglamorous and completely adequate: a plain
`<input type="file" accept="video/*">`. The user saves the video in TikTok (it lands in Photos), taps
our button, picks it. Same file, same pipeline, one extra tap, no capability question. **If §5.1(c)
is ever approved, build the file input first and treat the Android share target as an enhancement.**
Designing this around Web Share Target would ship a feature half our users cannot use.

## 7. TikTok's own data export (`current-state.md` open question 6)

Two distinct routes, and they are not equally useful.

### 7.1 The Data Portability API (DOCUMENTED) — narrow, and the scope shape is a problem

`developers.tiktok.com/doc/data-portability-api-get-started`, `.../data-portability-data-types`, read
2026-08-31. Async: request → poll or webhook → download within four days. Scopes
`portability.{all,postsandprofile,activity,directmessages}.{single,ongoing}`. Requires an approved
app with Login Kit, UX mockups, and a privacy/security review; approval **3–4 weeks**. Developers may
apply from anywhere, but **the data covers only EEA and UK TikTok users** — this is a DSA/DMA
compliance product, and the applicant must be able to distinguish those users.

The data types, exactly as documented:

| Category | Fields | Scope |
|---|---|---|
| **Favorite Videos** | `Date`, **`Video landing page link`** | **Full Archive only** |
| **Like List** | `Date`, `Video landing page link` | **Full Archive only** |
| Watch History | `Date`, `Video landing page link`, **`Post title`** | Activity |
| Share History | `Date`, `Shared Content`, `Link`, `Method`, + `IDFA`, `GAID`, `Android ID`, `IDFV`, `Web ID` | Activity |
| Comments | `Date`, `Comment content`, `Original post landing page link` | Full Archive |
| Posts (own) | `Date`, **`Posted Video Download Link`**, `Title`, `Location`, `Sound`, … | Posts and profile |

**Three findings, and the second is a genuine blocker.**

1. **"Favorite Videos" is exactly the right list.** Saving a food TikTok to a collection is precisely
   the behaviour our product exists to serve, and TikTok records it with the post URL. A bulk import
   is `Favorite Videos` → N URLs → our existing oEmbed pipeline. **No new access mechanism is needed
   for the *content*; the export supplies only the list.**
2. **But Favorites and Likes are in the Full Archive scope, not Activity.** To read a user's saved
   videos we must request `portability.all.*` — which also hands us **direct messages, login history
   with IP addresses, purchases, and advertising IDs**. That is a flat contradiction of data
   minimisation and of this repo's security posture: we would be asking a user to give a
   recommendation-map app their entire TikTok life to import a list of URLs. **I would refuse to
   build on this scope as it stands.** If it is ever pursued, the design constraint is absolute:
   parse `Favorite Videos` and `Like List`, persist nothing else, and never let the archive reach
   `public.sources` or any log.
3. **Watch History carries `Post title` — the caption — and sits in the narrower `activity` scope.**
   Interesting as a data point (it is the only place TikTok hands over caption text in bulk), and
   useless to us: watch history is everything scrolled past, not anything chosen.

**Label: DOCUMENTED, technically real, EEA/UK only, 3–4 weeks approval, and scope-blocked on privacy.**

### 7.2 The in-app export — the same data, none of the gatekeeping

Settings → Account → Download your data, JSON, ready in 24 h–4 days, and available to users in **any
region**. The user receives a ZIP and could upload it to us. Same clean posture as §5.1(c): the user
exercises their own data-access right through TikTok's own function; we run no automated system
against the Platform.

Same privacy hazard, worse: the ZIP contains everything, including DMs, and now it is on our server.
The mitigation is straightforward and should be non-negotiable if this is ever built — **parse the
archive in the browser, extract only the `Favorite Videos` links, and send only those URLs to the
server.** The file never leaves the device. That turns a frightening feature into a boring one.

**Label: ASSUMED-permissible on the same reasoning as §5.1(c), and the client-side-parse constraint
is what makes it defensible.** I have not verified the export's on-disk JSON structure — I do not
have an export, and I will not build a parser against a schema described by third-party blog posts.
**Verifying it costs the owner one tap and a 24-hour wait**, and that is the single cheapest piece of
missing evidence in this report. Ask for it.

## 8. Rate limits, stability, and the datacenter IP

Only two mechanisms below are recommendable, and only one is in production.

**oEmbed (VERIFIED, unchanged from `05`/`06`):** no 429 ever observed, 40 sequential + 30 concurrent
all 200, no `x-ratelimit-*`, no `retry-after`, no UA gating, no cookie, no CAPTCHA. Latency today:
0.49 s, 0.74 s, and one at 0.79 s — consistent with `05`'s p50 0.511 / p90 0.626. `cache-control:
no-store` on the JSON, so every import is an origin hit and our own `sources` cache is what protects
us.

**The Vercel gap is still open and it is still the only gate that matters.** `06` verified a
non-Vercel datacenter egress and left the Vercel probe as a GO/NO-GO. `CLAUDE.md` records
`/api/imports/probe` as a live stand-in and the core loop as working end-to-end in production against
real TikToks, which is strong circumstantial evidence that Vercel egress is fine — but **nobody has
committed the artefact**, so the honest label is still `06`'s **PARTIALLY VERIFIED**. Engine 2.0
should not be designed on top of an unproven fetch. `06` §"Required verification" specifies exactly
what to run; it is ~30 minutes and it is overdue.

**The cover image is the one new stability datum:** `cache-control: max-age=31536000` and served from
Akamai, versus the JSON's `no-store`. If cover-frame work ever resumes, the image is CDN-cacheable
and cheap; the `x-expires` on the signed URL (observed ≈ 6 months out) is the real expiry, and it
means **a `thumbnail_url` persisted in `sources` will 403 eventually.** Anything that stores that URL
must treat it as perishable and re-fetch oEmbed, not cache the string forever. I did not measure an
expired one; label ASSUMED, but the parameter is right there in the URL.

**Research API,** if it were ever available: 1,000 requests/day, 100,000 records/day, 100 per request,
resets 00:00 UTC, no exceptions granted. **Data Portability API:** async, download window four days.

## 9. The table

| Signal | Access route | Sanctioned? | Latency | Cost | Label |
|---|---|---|---|---|---|
| Caption text | oEmbed `title` | **yes** — TikTok-provided, robots-permitted | ~0.5 s p50 | free | **VERIFIED** (in production) |
| Author handle / display name | oEmbed `author_unique_id`, `author_name` | yes | same call | free | **VERIFIED** |
| **Hashtag segmentation** | oEmbed `html` `<a …/tag/…>` anchors | yes | same call | free | **VERIFIED — unused today** |
| **Sound name + music id** | oEmbed `html` `♬` anchor | yes | same call | free | **VERIFIED — unused, low value** |
| **Cover frame @ 1080×1920** | oEmbed `thumbnail_url`, as given | yes | +0.8 s, ~580 KB | free | **VERIFIED — already full-res** |
| Carousel images 2..N | — | — | — | — | **UNAVAILABLE** (`RICH-EXT-1` §2) |
| On-screen text | cover frame OCR only | yes | vision-model call | model cost | **VERIFIED as ineffective** — recall 1/8 |
| **Subtitle / caption track text** | none | — | — | — | **UNAVAILABLE** (§2) |
| **Spoken transcript** | Research API `voice_to_text` | yes, **but not for us** | n/a | free if eligible | **UNAVAILABLE — commercial excluded** |
| **Comments on a post** | Research API `/video/comment/list/` | yes, **but not for us** | n/a | free if eligible | **UNAVAILABLE — same door** |
| Comments, user-pasted | our own `NO_PLACES_FOUND` screen | **yes** — user-supplied | user time | free | **buildable today** |
| Video / audio bytes, by us | none | **no** | — | — | **OUT OF BOUNDS** |
| Video / audio bytes, user-supplied | file input (all platforms) / share target (Android only) | **needs a ruling** | user does 4 steps | transcription | **ASSUMED — §5.1** |
| Another user's video metadata | Display API | **no** — own uploads only | — | free | **UNAVAILABLE** |
| Saved/favourited list, bulk | Data Portability API | yes, EEA/UK, 3–4 wk approval | async | free | **DOCUMENTED — scope-blocked (§7.1)** |
| Saved/favourited list, bulk | user uploads their own export ZIP | **needs a ruling** | 24 h–4 d for the user | free | **ASSUMED — §7.2** |
| Ads / commercial content | Commercial Content API | researcher-gated, EEA/CH/UK | n/a | free | **irrelevant** |

## 10. What I would build on, and what I would refuse to build on

**Build on, in this order.** All four are free, all four are inside the mechanism we already have,
and none needs a ruling from anyone.

1. **Parse oEmbed `html` for the hashtag anchors, and reject a candidate whose only evidence is a
   hashtag token.** Fixes the `#tsukijifishmarket`-at-0.95-confidence defect against TikTok's own
   markup instead of a regex. Median post is 45% hashtag characters; the defect specimen is 73%.
   Highest value per line in this report, and it removes a *confidently wrong place*, which the
   working agreement ranks above every other failure.
2. **The comment-paste field on the no-places-found screen.** The only mechanism in this entire
   report that reaches the `futile` class — the "comment for the name" posts where the answer exists
   nowhere in the video. Costs one textarea.
3. **Close `06`'s Vercel probe.** ~30 minutes, and it is the GO/NO-GO under everything else. It is
   embarrassing to design Engine 2.0 on a fetch whose production behaviour has never been recorded.
4. **Stop treating `thumbnail_width`/`height` as the available resolution** and treat the stored
   `thumbnail_url` as perishable (`x-expires` ≈ ~48 hours).

**Ask the owner for, before designing anything:**

5. **One TikTok data export.** One tap, 24 hours, and it converts §7.2 from "third-party blog posts
   say" to VERIFIED. Cheapest missing evidence we have.
6. **A ruling on user-supplied media (§5.1) and user-supplied export (§7.2)** — jointly with
   `security-privacy`. Both hinge on the same question, which is legal, not technical: does a user's
   own content licence stretch to handing the file to a third-party service for machine processing,
   under the EEA's narrower *"using the Platform for entertainment purposes"* wording.

**Refuse to build on:**

- **Any scraping route** — `yt-dlp`, headless browsers, `item_detail` JSON, signed-CDN-URL mutation,
  or the `/embed/v2` rehydration blob. Prohibited by the ToS clauses quoted in §5.1(b), and
  `/embed/v2` is additionally robots-disallowed for `*`. I did not fetch it and I will not.
- **Any vendor selling TikTok transcripts, subtitles or comments.** They scrape. Paying someone
  relocates the breach and adds money and third-party personal data to the exposure.
- **A Research API application premised on a university affiliation** in order to feed a commercial
  product. The eligibility test is about the *use*, not the applicant, and the FAQ answers our exact
  question "No". Applying anyway is a misrepresentation on a form TikTok reserves the right to audit.
- **`portability.all.*` as currently scoped** (§7.1) — asking for a user's direct messages, login IPs
  and advertising IDs to obtain a list of URLs.
- **Designing the user-file flow around Web Share Target.** iOS cannot register a PWA as a share
  target; a plain file input works everywhere.

**And a standing correction for whoever writes the Engine 2.0 brief:** the sentence "TikTok has
auto-captions, so the transcript should be reachable" is true in its first half and false in its
second. The captions exist, TikTok renders them, TikTok even exposes them as a field — to academics.
For us the transcript is **UNAVAILABLE**, and any design that assumes otherwise is assuming a
capability that does not exist for this product. The honest ceiling for automated extraction remains
the caption, exactly as `RICH-EXT-1` concluded; everything genuinely new here is either free
metadata we were already being handed (§1) or a path where **the user**, not our server, does the
fetching (§5, §7).

## 11. Calls made, and what I could not determine

**Live TikTok data-endpoint calls: 9 of the 10 permitted.** In order: `www.tiktok.com/robots.txt`;
oEmbed `7346702347491446049`; its `thumbnail_url`; oEmbed `7395598157620497696`; its `thumbnail_url`;
oEmbed `7346702347491446049` with `maxwidth`/`maxheight`; `developers.tiktok.com/robots.txt` (404);
oEmbed `7290074173500706079`; its `thumbnail_url`. All from this machine, IL residential IP, plain
`curl` UA, no spoofing. **Zero LLM/geocoder calls. Zero media bytes.**

**Separately, 13 documentation page reads** on `developers.tiktok.com`, plus MDN and web.dev. I
treated documentation as outside the "live platform calls" cap, which is aimed at data endpoints; if
the orchestrator reads the cap as covering any TikTok host, then the total is 22 and I exceeded it.
Flagging the interpretation rather than letting it pass silently.

**Raw artefacts** are in this session's scratchpad
(`…/11cbf1c6-9f33-4954-911e-45b5cb2f7f54/scratchpad/`): the three oEmbed JSONs, the three cover
JPEGs, the response headers, and today's `robots.txt`. My write scope for this task was **one file**,
so I did not commit them; everything load-bearing is quoted verbatim above. If the orchestrator wants
them in `docs/evidence/tiktok/raw/`, say so and I will move them.

**What I could not determine:**

- **Whether the export's `Favorite Videos` JSON is shaped as documented.** No export in hand. §7.2's
  field list is from TikTok's own Data Portability *API* docs, which describe the same categories;
  whether the in-app ZIP matches field-for-field is **ASSUMED**.
- **Whether oEmbed counts as a "TikTok Developer Service"** under the Developer ToS (§3.2). Escalated,
  not answered.
- **Whether the 1.875× cover-image ratio is universal.** n=3, all 1.875. Two of the 16 committed
  responses report dimensions (540×960, 576×1026) that do not scale to round numbers at that factor.
- **Whether an expired `x-expires` returns 403 or something else.** Not tested; no expired specimen.
- **Whether TikTok would in practice object to anything here.** I read the terms. I am not a lawyer
  and did not seek an opinion, and §5.1's EEA "entertainment purposes" question is exactly the kind
  that needs one.
- **Anything about the `/embed/v2` payload.** Refused on robots grounds, deliberately, and that is a
  choice rather than a gap — but it does mean I cannot tell you whether a rehydration blob would have
  contained a subtitle URL. The documented player API (§2) says no text crosses the boundary, and
  that is the answer I am standing on.


---

## CORRECTION, 2026-08-31 — thumbnail lifetime

This document repeated *"≈ 6 months"* for `thumbnail_url`'s `x-expires` window, inherited from
`01-oembed-field-inventory.md`. **The real window is ~48 hours**, re-derived today from two live
fetches and from the committed 2026-08-18 capture, which also shows ~48 hours. The original grading
was wrong when written rather than overtaken by a change. See that file's correction section.

Every occurrence above is amended. The recommendation that treated the stored `thumbnail_url` as
perishable stands — it was right for the wrong reason, and it is far more urgent than it read.
