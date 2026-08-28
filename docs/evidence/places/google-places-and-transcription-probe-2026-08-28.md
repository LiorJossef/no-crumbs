# Two lean feasibility probes — Google Places, and TikTok transcription
Date: 2026-08-28 · Owner-requested reality check, **not** a decision or a proposal.
Raw run records were kept out of the repo deliberately — see "Why no coordinates are committed".

> Labels per house rule: **VERIFIED** = measured here with evidence · **ASSUMED** = documented, untested.

---

## A. Google Places — does it resolve our real extracted candidates better?

### What was run
`06-map-and-places-decision.md` §3's table says of Google Places Text Search:
*"Not measured — no key."* **That is now stale — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is present in
`.env.local` and works server-side, unrestricted.** So the row was measured.

The **exact 16 extracted candidate strings** from `tiktok-recognition-run.json` (the 13 real
owner-supplied TikToks) were replayed through Places API (New) `places:searchText`, with
`textQuery = "<rawName>, <cityHint>"`, `regionCode=IL`, and a 20 km location bias on Tel Aviv.
Same inputs our resolver got. Adjudicated against the same corpus expectations.

19 Text Search calls total (Pro SKU; 5 000/month free — VERIFIED against Google's pricing page,
matching what §3 already claimed). Cost of this probe: **$0**.

### Result (VERIFIED)

| | our resolver (`poi_index` + `score.ts`) | Google Text Search |
|---|---|---|
| Top-1 is the right venue | **12 / 15** | **14 / 15**, +1 partial |
| Auto-accepted without a picker | 7 / 15 (`preselect` band) | n/a — no score is returned |
| Wrong top-1 | 3 | 0 |

**Google got right all three that we got wrong**, and all three of ours were *coverage*
failures, not scoring failures:

- `בל עמי` → we returned `בלאגן` (a different venue, 2.6 km away). Google: `Bel Ami`, Ben Ami St 14.
  Our bucket for this was `absent_from_index`.
- `Oscar's` → we returned `פונדק השובבים`, the previous tenant. Google: `Oscar's`, Nahalat Binyamin 68
  — the correct new opening. Our index simply predates it.
- `דיזנגוף 99` → we returned `Hayarkon 99 Restaurant`. Google returned the **street address** as a
  `premise`, not a business: right location, wrong entity kind. Counted as partial, not a win.

Also notable, and the thing that bears on "simplify our logic":

- **Hebrew queries resolved to Latin-named rows with no alias machinery at all.** `קוהי` →
  `Kohi Coffee Shop`, `קפה אירופה` → `Cafe Europa`, `רוסטיקו` → `Rustico`, `טרטוריה אונה` →
  `Trattoria Una`. This is precisely the cross-script gap that migrations `0021`/`0022`, the address
  arm and `textVariants` exist to bridge.
- **Multi-branch disambiguation came for free**: `רוסטיקו` returned the Rothschild and Basel
  branches as top-1 and top-2, which is the shape our margin gate needs.
- `בראסרי 18` — our **extraction** miss — resolved correctly (`Brasserie 18`, Levontin 19).
  Resolution was never the problem there; noted so it is not miscounted as a Google win.

### Two honest caveats
1. **Google returns no confidence score.** Our `preselect` / `confirm` banding is built on
   `score` + `margin`. 5 of our 12 correct answers were "correct but not auto-accepted" — Google
   does **not** automatically fix those, because there is nothing to threshold on. A Google-based
   acceptance rule would have to be invented (result count, `primaryType` agreement, address match).
2. `בל עמי` is scored a pass on the corpus rule (expected area is just "תל אביב"); the venue
   identity was not independently confirmed. `טרטוריה אונה` is the same venue as ours (11 m apart)
   but Google labels it `Bart St 2`, which a strict `addressPattern` check would fail.

### The blocker is unchanged, and it is not accuracy
`06` §3.1 already rules, VERIFIED: **MapLibre map + Google Places is explicitly forbidden**
(Service Specific Terms §5.3, "must not use Google Maps Content from the Places API in conjunction
with a non-Google map"), plus §5.4's 30-day cache limit on lat/lng. §3.3 (owner, 2026-08-22) settled
the shape of any move: renderer and resolver switch **together**, as a separate, explicitly-requested
task, with its own `maps-geospatial` + `security-privacy` + `product-lead` sign-off.

Nothing here changes that. What it changes is the *input* to that decision: the accuracy premium is
now measured rather than ASSUMED, and it is real but narrower than "replace everything" —
**+2 of 15 on top-1, concentrated entirely in index coverage and cross-script naming.**

### Why no coordinates are committed
Google's §5.4 caps lat/lng caching at 30 days. Committing this probe's coordinates to git would be
storage past that. Names, addresses and verdicts are recorded above; raw coordinates stayed in a
scratch directory and are not in the repo.

### Defect found while doing this (unrelated to Google, and real)
`Gelalucci` is scored **correct** by our corpus harness. Its `poi_index` row carries address
`שדרות מסריק 1` and coordinates `(32.02421, 34.74155)` — **6.9 km from Masaryk Square**
`(32.078, 34.778)`, which is where that address is. The address and the coordinates in that row
disagree with each other.

The harness did not catch it because **adjudication matches on name and address strings, never on
distance.** On a map product, a row that is right by name and 6.9 km wrong on the map is a failure,
and we currently count it as a pass. `האחים` shows a milder version: 232 m between our centroid and
Google's. Recommendation: add a distance assertion to the corpus adjudication.

---

## B. TikTok transcription — what is the simplest path?

### The value ceiling, from evidence we already had (VERIFIED, small n)
`evidence/tiktok/07-caption-content-scoring.md` hand-labelled where the venue name lives. Of the 8
place-recommendation posts whose caption does **not** name the venue: ~4 have the name on-screen
and/or spoken (#1, #2, #8, #12), 1 deliberately withholds it to farm comments (#16, and it is
withheld in speech too — that is the gimmick), and the rest are city-only or comedy.

So the realistic ceiling is roughly **27% → ~55-60%** of posts yielding a venue. That is the single
largest available lift in the product, and it is much bigger than anything resolution can buy.

**But the signal is "on-screen and/or spoken", not "spoken".** Audio-only ASR addresses only part of
it. Whatever we build wants frames *and* audio, which points at Gemini's video understanding
(VERIFIED from Google's docs: accepts MP4 etc., samples ~1 fps, processes both streams,
~300 tokens/sec of video, ~100 at low resolution) rather than a dedicated ASR step.

### The actual blocker is media acquisition, not transcription
- oEmbed — our only VERIFIED mechanism — returns **no video or audio URL**. `thumbnail_url` is the
  only media it gives (E1 field inventory, re-confirmed today).
- `04-tiktok-feasibility.md` already labels M8 (subtitle/WebVTT endpoint) **UNAVAILABLE officially**
  and M11 (ASR on the media file) **NOT ASSESSED**. Both still hold.
- **`tiktok.com/robots.txt` (read today) `Disallow: /` for `ClaudeBot`, `Claude-User`,
  `anthropic-ai`, `Claude-SearchBot`, `GPTBot`, `CCBot` and every other named AI agent**, and
  `/@user/video/…` is not in the `Allow` list for `*` either. `yt-dlp` is installed on this machine
  and was **deliberately not run** against TikTok for that reason. Media acquisition is a
  `security-privacy` + ToS decision, not an engineering one.

### What was tried instead, because it is free and compliant (VERIFIED, n=2)
`thumbnail_url` is a cover frame we **already fetch and currently throw away**. TikTok creators put
the hook text on the cover. Two posts from E7 whose captions name no venue were fed
cover-frame + caption to `gemini-3.5-flash-lite` (~1 240 tokens in, 2 calls):

| post | caption names venue? | cover frame yielded |
|---|---|---|
| `7494360070369709354` @yallabikestlv | no ("best coffee in Tel Aviv is only 9 shekels?!") | on-screen text **"Pizza Lila"** → venue name recovered |
| `7347722826654305578` @alexandramoulavi | no ("coffee in tlv >") | on-screen text "perfection new coffee spot in tel aviv" → **correctly returned `null`**, no name present |

Both frames were opened and read by the lead; Gemini's OCR was accurate in both cases, and it did
**not** hallucinate a venue on the one that had none — the right posture for a low-confidence signal.
`Pizza Lila` then resolves cleanly (Merkhavya St 4, Tel Aviv) — a real, findable venue that the
caption never mentioned.

Caveat, stated plainly: E7 hand-labelled post #8's venue as *Simhovich Cafe*, and the cover says
*Pizza Lila*. One frame is one moment in a video that may cover several venues, so this is a
**recovered candidate, not a confirmed answer** — which is exactly how it would have to be treated
in the product.

### The simplest path, in order of cost and risk
1. **Cover frame (free, compliant, ~1 image per import).** Uses a field oEmbed already gives us. No
   new access mechanism, no ToS question, no new dependency. Recovers the hook text, which is often
   the venue name. n=2 here — worth a proper measurement over the 13-post corpus before anything else.
2. **Full video understanding via Gemini** (frames + audio in one call) — strictly better, and the
   right shape for the "and/or spoken" half. **Blocked on legitimately obtaining the media**, which
   oEmbed does not provide and robots.txt/ToS do not permit us to scrape.
3. **Licensed third-party providers** (M10: Apify, ScrapeCreators, Supadata — caption *and* WebVTT
   subtitles, ~$0.004/item) — the only path that supplies media/subtitles without us doing the
   scraping. Still **ASSUMED capability, compliance UNRESOLVED**, and it costs money, so it is an
   owner + `security-privacy` decision.

**Bottom line:** transcription proper is gated on a media-access decision that has not been taken.
The cover frame is the part that is free, compliant, already in our hands, and unmeasured.
