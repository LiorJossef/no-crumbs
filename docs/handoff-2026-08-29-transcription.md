# Handoff — automatic TikTok transcription, 2026-08-29

Branch `feat/tiktok-media-acquisition`, pushed to `origin`. **Not merged. No PR opened. `main` is
untouched.** `npm run verify` green — lint 0 errors (2 pre-existing `<img>` warnings in files this
work never touched), typecheck clean, **83 files / 1543 tests passing**.

**Resume at §0.** Everything after it is what was established and why.

---

## 0. Resume here

**Status: the feature is built end to end and blocked on one HTTP 403.** Every stage is implemented,
unit-tested and proven on real data individually; the chain does not yet complete in one run because
the media CDN refuses our download.

### The exact blocker

The media CDN (`v16-webapp-prime.tiktok.com`) returns **403** to our download. Measured directly,
same signed URL and headers throughout:

| Request | Result |
|---|---|
| UA + referer (what the code sent originally) | **403** |
| + `Range: bytes=0-` | **403** |
| **+ cookies from the page fetch (`curl -c` jar)** | **200, 7,096,912 bytes** |

So the session is the answer, and the fix is **half-built**. `acquireTikTokMedia` now captures
`Set-Cookie` from the page response and hands it to the downloader via an `onSession` callback.
It works, and it is not enough:

```
{"event":"tiktok.media_acquisition.session","captured":true,"pairs":2}
{"event":"transcription.audio_unavailable","reason":"status","status":403}
```

**We capture 2 cookie pairs. The successful `curl` jar contained more.** The captured set is
incomplete, so the CDN still refuses us.

### What I tried, and what happened

| Attempt | Result |
|---|---|
| UA + referer only | 403 |
| Adding `Range: bytes=0-` | 403 — no effect either way |
| `curl` with a full cookie jar (`-c`/`-b`) | **200, full 7 MB file** — proves cookies are the discriminator |
| Capturing `Set-Cookie` off the final page response and replaying it as `Cookie` | `captured=true pairs=2`, download still **403** |

### Where I believe the gap is

Two candidates, in order of likelihood:

1. **Cookies from earlier hops are being dropped.** `fetchPageOnce` follows redirects by hand
   (`redirect: 'manual'`) and `sessionCookieFrom` reads `Set-Cookie` only from the **final** response.
   `curl -c` accumulates across the whole chain. Any cookie issued on a redirect hop is lost.
2. **A cookie the page fetch never receives.** The CDN may want `ttwid`, which is typically issued by
   a different TikTok endpoint than the post page. If so, no amount of reading the page response will
   produce it and a separate priming request is needed.

### Recommended next step

Reproduce the four `curl` commands in the table above, then **diff the cookie names** in the working
jar against the two we capture. That names the missing cookie immediately and distinguishes cause 1
from cause 2. It costs **zero Gemini calls** and no model spend. Then either accumulate `Set-Cookie`
across every redirect hop (cause 1) or add the priming request (cause 2).

Do **not** start by rewriting the acquisition module. The mechanism is right; the cookie set is
incomplete.

---

---

## 1. The ruling this session overturned, and the two facts that overturned it

`product-backlog-2026-08-29.md` §14 called transcription **"dead, not dormant"** on two legs. The
owner reopened it on 2026-08-29. Both legs turned out to be wrong, and neither for the reason
anyone expected.

**Leg 1 — "there is no route from our own infrastructure."** Measured from a Vercel preview
(`fra1`), fetching the public post page: **18 of 18 attempts returned the rehydration payload**,
mean **491 ms**, zero throttles, zero blocks. From the owner's residential connection the same code
scores **33%** at ~1500 ms. Datacentre egress is *better than residential and three times faster* —
the exact opposite of the published 10–30%-vs-85–95% figures this project had been reasoning from,
and the opposite of what I predicted. **No vendor is needed.**

**Leg 2 — "the ceiling is +5 posts, the same five a user typing a name would recover."** That figure
is a **caption measurement wearing an audio label**. E7's column header reads *"Named place in
caption?"*; where it mentions the video at all it records a disjunction (*"spoken/on-screen"*), and
the spoken-versus-on-screen split has never existed anywhere in this repo. One of the five posts
(#13) is unsourced. Post #8 disproves the equivalence outright: cover-frame OCR measured `Pizza
Lila` as an on-screen overlay while E7 names the venue as *Simhovich*. Realistic audio-only ceiling
on E7 is **1–3 of 16**, not 5. Details: `evidence/extraction/transcript-value-ceiling-2026-08-29.md`.

**A third correction, to our own docs:** the TikTok **Research API does carry a `voice_to_text`
field** — nobody had noticed. It still fails, but now for checked reasons: eligibility is
US/Europe/Brazil and RUNI is in Israel, it is non-commercial only, the deletion clause has tightened
from 30 days to **15**, and peer-reviewed work finds the field populated on ~10% of videos.

## 2. The end-to-end proof

One real TikTok the owner supplied, chosen because **the venue name is in the audio and not in the
caption** — `https://vt.tiktok.com/ZSVGnmKJc/` → `@maygilboa/7606044724532612370`.

| Step | Result |
|---|---|
| Short link → id | first attempt |
| Download | 2,220,583 B MP4 |
| **Demux (our code, no ffmpeg)** | **1 ms** → 168,442 B, **HE-AAC v2**, 22.05 kHz mono, 20.67 s, 445 frames |
| **Gemini transcribe** | **1,833 ms**, language auto-detected `he` |

Transcript ends `…המקום נקרא בר קפה` — *"the place is called Bar Kafe"*. The caption
(*"a perfect cafe in Tel Aviv, the matcha is insane"* plus hashtags) names no venue. **The audio
route recovers what the caption cannot.** That is the feature's premise, demonstrated once on real
data.

## 3. The architecture, and why

`TikTok URL → page fetch → MP4 → demux to AAC → Gemini transcribe → ContentPart('transcript') →
existing Gemini extraction → place`

- **Gemini, not Whisper.** Whisper `large-v3-turbo` is the *worst* Whisper variant on Hebrew (28.9
  WER on FLEURS) and it is pinned in a CHECK constraint in the stashed migration. Gemini detected
  and transcribed Hebrew cleanly on the first real attempt.
- **Ordinary `generateContent` on `gemini-3.5-flash-lite`**, not `gemini-3.5-transcribe` (25 RPD)
  and not Transcribe Live (WebSocket, 16 kHz PCM only — which would drag back a 68 MB ffmpeg
  dependency to resample into). Quota is bucketed per model; Flash-Lite cannot reach either
  Transcribe endpoint, so neither cap applies.
- **Two calls, not one.** Tested head-to-head (§5). Keeps the transcript as inspectable, cacheable,
  quotable text; keeps `filterPlausible`'s evidence gate working; makes failures diagnosable.
- **No storage.** Fetch, transcribe, discard the audio. 1,000 imports × 3 MB would breach Supabase's
  1 GB free tier around import 350. This deletes the stash's bucket, migration `0017` and the
  storage-policy question entirely.
- **Synchronous.** ~1.8 s transcription against a 300 s Hobby ceiling. No queue, no job table, no
  polling, no Cloudflare account.

## 4. What the Codex stash contributed, and what was dropped

`stash@{3}` (2026-08-23) was a complete, careful implementation — **for an architecture the owner's
Gemini ruling retired**. It has NOT been popped, applied or dropped; it was read with `git show`.

**Reused:** the `ContentExtractor` shape and its `supports` predicate, the "empty transcript
produces no part" rule, and the injected-loader seam.

**Dropped as superseded:** the Cloudflare Worker, queue, dispatcher and job store (Gemini is
synchronous); migrations `0016`–`0018` (no audio is stored); `gemini.place-extractor.ts`,
`place-extractor-factory.ts` and `cost.ts` — `main` had already moved past all three, and the
stash's Gemini extractor is the *ancestor* of the one on `main`.

**The stash can now be dropped**, but that is the owner's call and their stash. Nothing in it is
still needed.

Also confirmed: the transcription objects were **already removed from staging** on 2026-08-26. The
only residual is the empty private `transcription-audio` bucket, which `storage.protect_delete()`
refused to drop. Nothing in the repo watches `storage.buckets`.

## 5. Two bugs on `main` that would have silently killed this

Both predate the transcription work, neither was caught by any test.

1. **Fixed** (`cf44a75`). The extraction cache keyed on `sha256(caption)`. Adding a transcript did
   not change the key, so any source already extracted caption-only would have served its cached
   zero-candidate answer forever. The hash now covers the whole `ContentPart[]` — but stays
   **byte-identical for a lone caption part**, verified against all 20 local `extractions` rows, so
   nothing re-extracts.
2. **Fixed in the same commit.** The route re-ran `filterPlausible` against the caption string while
   the adapters run it against every part joined. Every transcript-sourced candidate would have been
   dropped as `evidence_not_in_caption` *after* the adapter accepted it.

3. **NOT fixed, and it is the next blocker — see §6.** The **p12 prompt has no concept of a
   transcript.** It wraps its input in a delimiter named `CAPTION` and says *"list the real,
   findable places this caption names"*; `grep -i transcript src/integrations/llm/prompt.ts` returns
   nothing.

   **Measured, not predicted:** extraction over `[caption, transcript]` for the Bar Kafe post
   returned `cityHint: תל אביב` and **zero candidates**, with the venue name sitting in plain text in
   the transcript. The pipeline works; the prompt throws the result away.

**The one-vs-two-call comparison** (`tests/manual/one-call-vs-two-call.manual.ts`) ran both arms on
the same post. Arm B (caption + audio in one multimodal call) returned **HTTP 400
`INVALID_ARGUMENT`** — notable because the same audio and the same `responseSchema` mechanism each
work individually, so it is a combination issue, not a capability one. Arm A's failure is the better
argument anyway: it was *diagnosable* precisely because the transcript existed as text. Fused, the
same run would have said "no places found" with no way to tell misheard from mis-extracted.

## 5b. What was built after §5, and the one thing still broken

**p13 shipped and is verified live.** The same Bar Kafe post went from **0 candidates to 1**:
`rawName: בר קפה`, `evidence: המקום נקרא בר קפה` quoted from the **transcript**, and
`whyGo.groundedIn: המאצ׳ה עננים מטורפת` quoted from the **caption**. Name from the audio, reason
from the caption, each grounded in the part it came from. A lone caption part still builds a
byte-identical prompt to p12, asserted against a hand-written golden string.

**The pipeline is wired into the real import flow** (`integrations/import/transcription.ts`,
`audio-acquirer.ts`) behind two flags, `TIKTOK_MEDIA_ACQUISITION=on` and `IMPORT_TRANSCRIPTION=on`,
both off by default.

**Running it for real found two bugs no test caught:**

1. **Fixed.** The hard-block detector substring-matched bare `captcha`, which is in TikTok's own
   script bundle on every healthy page. The first real import tripped the breaker on a **200 that
   had just served us the payload** and then refused everything for thirty minutes. A page carrying
   the rehydration payload is now never a block. Regression test confirmed to fail against the old
   logic.
2. **NOT fixed — the one remaining blocker.** The media CDN returns **403**. Measured directly
   against `v16-webapp-prime.tiktok.com`, same signed URL and headers throughout:

   | Request | Result |
   |---|---|
   | UA + referer | **403** |
   | + `Range: bytes=0-` | 403 |
   | **+ cookies from the page fetch** | **200, 7,096,912 bytes** |

   So the fix is the session, and it is half-built: `acquireTikTokMedia` now captures `Set-Cookie`
   from the page response and hands it to the downloader. But it captures only **2 cookie pairs**
   (logged as `tiktok.media_acquisition.session captured=true pairs=2`) and the download still 403s,
   where a full `curl -c` jar succeeds. **The captured set is incomplete.** Likely causes, in order:
   cookies set on earlier hops of the redirect chain are being dropped (we only read the final
   response), or the CDN wants a token (`ttwid`) issued by a request we never make. Reproduce with
   the `curl` table above — it is four commands and no Gemini spend.

**What did work end to end in the real flow:** short-link → page → retry-through-sheds → media ref.
One import logged `acquired attempts=3 shed=2`, proving retry-on-shed in production code. And every
failure degraded exactly as designed — each 403 produced a caption-only import at HTTP 200, never an
error.

**Separate bug, unrelated to transcription:** `vt.tiktok.com` short links fail from the app with
`ConnectTimeoutError` after 10 s, surfacing as `SHORT_LINK_UNRESOLVED` / "This share link has
expired." `yt-dlp` resolves the same link instantly from the same machine, so it is our fetch, not
the link — probably an IPv6/undici issue in `resolve-short-link.ts`. **Any user pasting a Share
link hits this**, which makes it higher-priority than transcription.

## 6. Resume here — remaining work, in order

0. **Complete the CDN session** (§5b.2). The single thing between here and a working feature.
   Diagnose with the `curl` table; no model spend needed.

0b. **Fix `vt.tiktok.com` short-link resolution** (§5b). User-facing today, independent of this work.

1. ~~**`p13`: teach the extraction prompt that a transcript is a source.**~~ **DONE and verified
   live** — see §5b. Original note follows for context. `ContentPart`
   carries `kind` and `origin`, and both adapters currently discard them via
   `parts.map(p => p.text).join('\n\n')`. The prompt must distinguish caption from transcript,
   because the provenance rules differ: a caption is what the creator wrote, a transcript is what an
   ASR model heard, and `whyGo.groundedIn` should be able to say which. Bump `PROMPT_VERSION`
   (`p12-s3` → `p13-s3`) — the extraction cache keys on it, so old rows fall out cleanly. Re-run
   `one-call-vs-two-call` afterwards; the Bar Kafe post going from 0 candidates to Bar Kafe is the
   acceptance test.

2. **Verify the payload parser against a real payload.** `parseMediaRefFromPayload` has **never seen
   one** — its field path
   (`__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct.video.playAddr`) is community
   knowledge, not a parsed specification. Its author hit the 40-fetch cap before capturing a body.
   **One fetch**: save a rendered body to a gitignored artefact and assert against it. Until then
   "we can extract a media URL" is **ASSUMED**, and it is the last unverified link in the chain.

3. **Wire the transcript extractor into a running path.** The `ContentExtractor[]` seam is real in
   `domain/` but the only code path that runs — the probe route — still calls
   `captionContentExtractor` directly. `runImport` has exactly one caller in the repo and it is a
   test. Either build `L0-F6` or extend the probe route to compose the array.

4. **Delete `src/app/api/acquisition-probe/`** before this branch merges. It is temporary
   measurement scaffolding, preview-gated, and it has done its job. Kept for now so the datacentre
   number can be re-measured on resume.

5. **Then measure properly**, and not on the corpora we have been quoting. See §7.

## 6b. Requirement recorded for the next iteration — do NOT implement yet

**Owner requirement, 2026-08-29: only run transcription for videos with short captions.**

The goal is to avoid transcription cost and latency when the caption already carries enough
information. A caption that names the venue makes the audio redundant, and paying a model call plus
a page fetch plus a multi-megabyte download for it is waste on the modal import.

**This is recorded, not built.** Nothing in the current code gates on caption length; when
transcription is enabled it runs for every post that yields a media ref. Deciding the trigger is its
own task, and note two things the evidence already says about it:

- `evidence/extraction/transcript-value-ceiling-2026-08-29.md` §3.1 measured caption-shape signals
  and found **none of them usable as a gate on their own** — `shortCaption` (<60 chars) scored
  precision 0.00 and recall 0.00 on the E7 corpus, because the hard cases are *long* captions (one
  is 488 characters and names nothing). A naive length threshold is the one variant already measured
  to fail.
- The better-performing signal was **"the extractor returned zero candidates"**, which implies a
  cheaper shape than length: extract from the caption first, and only escalate to audio when that
  produces nothing. That costs one extra model call on the posts that need it and none on the posts
  that do not — but it makes transcription a second pass rather than a pre-step, which is a real
  change to the route's control flow.

Whoever picks this up should decide between those two shapes deliberately rather than reaching for
the length threshold because it is easiest.

## 7. Sizing must move to the owner's own corpus

`docs/evidence/.local/corpus-100/oembed-results.json` holds **113 of the owner's own saved TikToks**
with live captions. Nothing has ever been measured on it. Found this session.

| corpus | n | median caption | carry 📍 |
|---|---|---|---|
| E7 | 16 | 124 chars | 1 of 16 |
| recognition corpus | 13 | 655 chars | **13 of 13** |
| **owner's saved set** | **113** | 232 chars | 32 of 113 |

**~81 of 113 real posts carry no venue in the caption** — roughly ten times E7's opportunity in
absolute terms. Shape: 32 pin-bearing, 35 short hooks, **46 list-shaped with no venue name**.
Language: 50 English, 37 Hebrew, 22 Spanish/Portuguese/Italian, 2 Korean, 1 Arabic.

**The recognition corpus is caption-rich by construction** (its own README says so), so it can only
ever demonstrate harm, never lift. Use it for regression only. All 113 captions were scanned for
injection-shaped content: 0 hits.

## 8. Risks to carry forward

- **Hebrew ASR fails *plausibly*, and our gates cannot catch it.** Stock Whisper renders spoken
  *makolet* as **"Macaulay"** — a capitalised, name-shaped English proper noun that passes
  `evidenceFoundInCaption`, gets tidied by the prompt's `identifiedName` instruction, resolves to a
  real business and auto-accepts. Four steps from a Hebrew word to a confidently wrong venue.
  **Every gate we own tests provenance, never fidelity**, and ASR is the first input that breaks
  that assumption. Proposed mitigation, unbuilt: a transcript-only candidate never auto-accepts —
  cap it at `confirm`.
- **Hallucination over silence.** FAccT '24 measured ~1% of Whisper transcriptions as fabricated
  *specifically when nobody is speaking*, with invented names and URLs. The transcriber guards this
  in the prompt and again in code (`no-speech.ts`, five suppression reasons), but a fluent invented
  sentence over silent audio is indistinguishable from a true transcript by inspecting the string.
  Residual risk is real and unmeasured.
- **ToS.** Reading the rehydration payload is contrary to TikTok's terms (*"extract any data or
  content… using any automated system or software that is not provided by TikTok"*) and the breach
  is ours as principal. The owner reopened this knowingly. The engineering answer to the worst case
  — losing oEmbed — is the breaker and rate limits in `media-acquisition.ts`, not a claim that the
  clause does not apply. `04` §8 Q2/Q4 still want a `security-privacy` sign-off, extended to cover
  transcribed speech.
- **The measured shed rate is time-varying** — 33% in one window, 55% in another the same day. Do
  not design against any fixed hit rate; retry on the shed signal instead.

## 9. Cost and quota

- **5 Gemini calls spent this session**, the owner's approved budget. No further calls without
  approval.
- Steady state: **2 Gemini calls per import** (transcribe, extract). Free-tier `generateContent`
  supports roughly 250 imports/day at that rate.
- **Nothing here requires spending money.** No vendor, no Cloudflare account, no ffmpeg, no storage.
- Vercel Protection Bypass for Automation is enabled on this project — the secret is the owner's and
  was deliberately not written to disk or into any commit.

## 10. Where the evidence lives

- `evidence/extraction/tiktok-media-acquisition-2026-08-29.md` — every acquisition route assessed
- `evidence/extraction/transcript-value-ceiling-2026-08-29.md` — the ceiling correction, acceptance bar
- `evidence/deploy/audio-acquisition-hosting-2026-08-29.md` — Gemini surfaces, quota, demux options
- `evidence/extraction/raw/mstoken-carry-2026-08-29.json` — the 40-row cookie-carry measurement
- `tests/manual/transcription-e2e.manual.ts`, `tests/manual/one-call-vs-two-call.manual.ts`
