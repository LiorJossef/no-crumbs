# Handoff — automatic TikTok transcription, 2026-08-29

Branch `feat/tiktok-media-acquisition`, pushed, seven commits, `npm run verify` green
(80 files / 1481 tests, only the two pre-existing `<img>` warnings). Not merged, no PR opened.

**Resume at §6.** Everything above it is what was established and why.

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

## 6. Resume here — remaining work, in order

1. **`p13`: teach the extraction prompt that a transcript is a source.** The blocker. `ContentPart`
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
