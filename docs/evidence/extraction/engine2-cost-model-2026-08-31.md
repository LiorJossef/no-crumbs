# E2-COST-1 — Engine 2.0 cascade: a costed model of ASR, vision and video

Date: **2026-08-31** · Owner: `ai-extraction` · Task: **E2-COST-1** · Research and measurement only.
Base commit: **`8f8df84`** (`no-crumbs-implementation`). Files written by this task: **this file only.**
No `src/**` change, no commit.

> Labels, per the house rule.
> **DOCUMENTED** = read today from the vendor's own pricing or docs page, URL and date cited ·
> **VERIFIED** = I measured it in this task, or it is a measurement already committed in this repo ·
> **ASSUMED** = reasoned from documented inputs, untested · **UNKNOWN** = I looked and could not find
> a defensible answer, and I am saying so rather than guessing.

**Live provider calls spent on this task: 0.** Everything below is vendor documentation plus local
measurement against a synthetic clip I generated myself. The Gemini budget is untouched.

---

## 0. Read this before the tables

### 0.1 The cost model is conditional on a ruling that does not exist

Four of the five tiers in the owner's cascade need the **video or its audio track**. This repo already
has a primary-source finding on that, from eight days ago:

> **There is no VERIFIED compliant mechanism to obtain a TikTok video's audio track, its media file,
> its subtitle track, or the 2nd..Nth image of a photo carousel.**
> — `docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` §"Verdict"

That finding quotes the EEA ToS clause verbatim — *"extract any data or content from the Platform
using any automated system or software that is not provided by TikTok"* — and rules `yt-dlp`, a
headless browser, and scraping vendors (Apify / ScrapeCreators / Supadata) all prohibited. Nothing I
found today changes it, and I did not re-open it; it is a `security-privacy` + owner question, not
an engineering one.

So this document costs a cascade **as if** the media were obtainable, because that is the question I
was asked and the owner is entitled to the number before deciding. **One tier is legal today**: the
oEmbed `thumbnail_url` cover frame, which TikTok itself serves and which we already fetch. It is §3
below and it is the only row here that can ship without a ruling.

### 0.2 The headline is not what the brief expected

The brief's framing was *"reading the video is expensive, reading thumbnails is cheap."* **At 2026
prices that is no longer true, and the arithmetic is not close.**

| What | Cost for one 60s TikTok |
|---|---|
| Today's caption-only call, `claude-haiku-4-5`, as production is configured | **$0.00588** |
| **Full video understanding**, `gemini-2.5-flash-lite`, `media_resolution=low` | **$0.00059** |

Reading the entire video — every frame at 1 fps plus the whole audio track — through a current
Flash-Lite model costs **one tenth** of what we already spend reading the caption alone. The
expensive things in this product are, in order: **(1) our own 411-line system prompt**, **(2) the
model we chose**, and **(3) the media we are not allowed to have.** The compute was never the
problem.

### 0.3 The `09` §2.2 cost figure is stale and understates by ~1.8×

`09` §2.2 computes ~$0.0032/import from "a system prompt budgeted at ≤800 tokens". The measured
figure is **~4,880 input tokens per import** (VERIFIED, `transcription-and-media-feasibility-2026-08-28.md`
§3.2, 9 live calls). `src/integrations/llm/prompt.ts` is 411 lines / 31,269 bytes. The prompt is
**6× its own budget**, and it is **83% of the bill on every single import**, including the ~73% that
return zero candidates.

### 0.4 One number this task closes for free

`src/integrations/llm/cost.ts` logs `costModel: 'unmeasured'` for Gemini because "no verified
per-token price for this model is on record". **It is on record now**: `gemini-3.5-flash-lite` is
**$0.30 / $2.50 per MTok** (input / output), DOCUMENTED below. `costModel` can become `'measured'`
for the Gemini adapter with a two-constant change.

---

## 1. Price table — everything, one place, all read 2026-08-31

### 1.1 Text / multimodal models

| Model | Input $/MTok | Output $/MTok | Cache write (5m) | Cache read | Label |
|---|---|---|---|---|---|
| `claude-haiku-4-5` | 1.00 | 5.00 | 1.25 | 0.10 | DOCUMENTED [A1] |
| `claude-sonnet-5` | 2.00 | 10.00 | 2.50 | 0.20 | DOCUMENTED [A1] |
| `gemini-3.5-flash-lite` | 0.30 (text/image/video/**audio**) | 2.50 | — | 0.03 | DOCUMENTED [G1] |
| `gemini-2.5-flash-lite` | 0.10 (text/image/video) · **0.30 audio** | 0.40 | — | 0.03 | DOCUMENTED [G1] |
| `gemini-2.5-flash` | 0.30 (text/image/video) · **1.00 audio** | 2.50 | — | 0.10 | DOCUMENTED [G1] |
| `gemini-3.1-flash-lite` | — · **0.50 audio** | — | — | 0.05 | DOCUMENTED [G1] |
| `gpt-4o-mini` | 0.15 | 0.60 | — | — | DOCUMENTED [O1] |

Anthropic Batch API is −50% on both directions; Gemini batch mode is −50% (`gemini-3.5-flash-lite`
batch: $0.15 in). **Neither is usable here** — an import is interactive and must answer inside the
25 s deadline (`07` §7).

> **Anthropic has no audio input.** Checked today rather than assumed: the Messages API takes text,
> images and files; the vision guide enumerates JPEG/PNG/GIF/WebP and nothing else, and the pricing
> page has no audio line [A1][A2]. Third-party writeups agree that as of 2026 no Claude model accepts
> an audio file [X1]. **Any ASR tier is therefore a second vendor by construction** if we stay on
> Anthropic — which is itself an argument for Gemini, where audio is just another input token type.

### 1.2 Hosted ASR, per minute of audio, cheapest first

| Provider / model | $/hour | **$/60 s** | $/30 s | Latency for 30–90 s | Word timestamps | URL input | Hebrew |
|---|---|---|---|---|---|---|---|
| **Gemini native audio** (`3.5-flash-lite`) | — (32 tok/s) | **$0.000576** | $0.000288 | p50 ~2.2 s measured on our caption calls | not as ASR timestamps | inline/Files API | **UNKNOWN** |
| **Groq `whisper-large-v3-turbo`** | **$0.040** | **$0.000667** | $0.000333 | 216× realtime → **<1 s** | **yes** (`verbose_json`) | **yes** | multilingual; band UNKNOWN |
| Groq `whisper-large-v3` | $0.111 | $0.001850 | $0.000925 | 189× realtime | yes | yes | multilingual; band UNKNOWN |
| **Gemini native audio** (`2.5-flash-lite`, audio $0.30) | — | $0.000576 | $0.000288 | as above | no | inline | UNKNOWN |
| OpenAI `gpt-4o-mini-transcribe` | $0.180 | $0.003000 | $0.001500 | ASSUMED 2–5 s | **no** (whisper-1 only) | **no**, upload only, ≤25 MB | not listed → UNKNOWN |
| AssemblyAI Universal-2 | $0.150 | $0.002500 | $0.001250 | ASSUMED async, 5–20 s | yes | yes | **`he`, "Good accuracy (>10% to ≤25% WER)"** [S3] |
| AssemblyAI Universal-3.5 Pro | $0.210 | $0.003500 | $0.001750 | ASSUMED async | yes | yes | `he` supported [S3] |
| ElevenLabs Scribe v2 | $0.220 | $0.003667 | $0.001833 | ASSUMED | yes | yes | "90+ languages"; Hebrew ASSUMED [S4] |
| Deepgram Nova-3 monolingual | $0.258 | $0.004300 | $0.002150 | ASSUMED <2 s | yes | yes | **`he`, Nova-3 only** [S2] |
| Deepgram Nova-3 multilingual | $0.312 | $0.005200 | $0.002600 | ASSUMED <2 s | yes | yes | `he` [S2] |
| OpenAI `whisper-1` / `gpt-4o-transcribe` | $0.360 | $0.006000 | $0.003000 | ASSUMED 3–8 s | `whisper-1` yes | no, upload only | UNKNOWN |

Deepgram's own rate is quoted per minute ($0.0043 / $0.0052 mono / multilingual, pay-as-you-go);
I converted to $/hour for comparability [S1].

**The spread is 10×, and the whole spread is smaller than one of today's Haiku calls.** Even the
most expensive row (whisper-1, $0.006/min) costs about what we already pay per import for text.

### 1.3 Self-hosted / serverless GPU

| Path | Price | Reality |
|---|---|---|
| Modal, Nvidia T4 | $0.000164/s [M1] | `faster-whisper large-v3` at ~10× realtime → ~6 s GPU for a 60 s clip = **$0.001**. Already **1.5× Groq's price** before cold start. |
| Modal, Nvidia L4 | $0.000222/s [M1] | Faster, dearer. Same conclusion. |
| Replicate, T4 | $0.000225/s [R1] | Same shape. Replicate bills private-model idle time too. |
| Cold start | **60–90 s → 12 s** with GPU memory snapshots; 2–5 s for small models on local NVMe [M2] | This is the killer. Our stage budget is 12 s and the global deadline is 25 s. A cold Whisper container **eats the entire import**. |
| Modal free credits | $30/mo Starter, $100/mo Team [M1] | Would cover the whole project at our volume — but see cold start. |

**Verdict: self-hosting ASR is more expensive and far riskier than Groq, at every volume we will
ever see.** Groq's `whisper-large-v3-turbo` is $0.04/hour with a claimed 216× realtime and a URL
input; there is no version of running our own GPU that beats that on price *or* on latency. The only
argument for self-hosting is a **Hebrew-specific fine-tune** — `ivrit-ai/whisper-large-v3`, a 2B
Apache-2.0 Hebrew continued-pretrain of `whisper-large-v3` [S5]. That is a quality argument, not a
cost one, and §7 says why it may still matter.

### 1.4 Dedicated OCR versus a general multimodal model

| Path | $/image | Hebrew script | Verdict |
|---|---|---|---|
| **`gemini-2.5-flash-lite`, one 9:16 frame** | **$0.000155** | multimodal, band UNKNOWN | **10× cheaper than Cloud Vision, and it does the extraction in the same call** |
| `gemini-3.5-flash-lite`, one 9:16 frame | $0.000464 | UNKNOWN | |
| `claude-haiku-4-5`, one 1080×1920 frame | $0.001560 | UNKNOWN | Same price as dedicated OCR, for a model that also reasons |
| `claude-haiku-4-5`, pre-downscaled to 540×960 | $0.000700 | UNKNOWN | Pre-downscaling **halves** Claude's image cost — see §4.1 |
| Google Cloud Vision `TEXT_DETECTION` | **$0.001500** (first 1 000/mo free) [V1] | Hebrew is a long-supported Cloud Vision script | Returns *text*, not places. Needs a second LLM call anyway. |
| Azure AI Vision Read | **UNPRICEABLE** — the public page renders the rates as `$-` [V2] | — | I could not obtain a number from a primary source. Not carried forward. |
| Apple Vision on-device | $0 | good Hebrew | Runs on a Mac, not on Vercel. Irrelevant to the deployed path. |
| `tesseract.js` server-side | $0 compute, ~$0.0004 Vercel CPU ASSUMED | Hebrew traineddata exists; accuracy on stylised TikTok overlay text is **UNKNOWN and probably poor** | Adds 10–20 MB of wasm + traineddata to the bundle for a worse answer than a $0.00016 model call |
| PaddleOCR | $0 licence | Hebrew support weak | Needs a Python worker. Same conclusion. |

**A dedicated OCR is the wrong shape for this product.** It returns a bag of strings, and we would
then pay a model to decide which string is a venue — the `04` §5 category-H problem, but worse,
because shopfront signage in the background is indistinguishable from the creator's recommendation.
That is not speculation: it is exactly what the **cover-frame OCR run already measured** — recall
**1 of 8**, and the false positives were *"Rama Hair & Be"* and *"Ersimes Organic & Her"*, a hair
salon and an organic shop read off Brixton shopfronts and offered as restaurant recommendations
(`docs/evidence/tiktok/cover-frame-ocr-run-2026-08-28.json`, entry `7346702347491446049`).

---

## 2. Audio preprocessing — and the distinction the brief called the crux

### 2.1 The crux, stated plainly

**Every hosted ASR provider in §1.2 bills by audio-seconds submitted, not by bytes uploaded.**
Deepgram, AssemblyAI, ElevenLabs and Groq all quote per hour or per minute of audio. OpenAI quotes
per minute. Compressing a 60 s clip from 874 KB to 113 KB therefore saves **bandwidth and upload
latency, and exactly zero dollars.**

The exceptions, and they are the ones that matter to us:

- **Gemini bills audio as tokens at a fixed 32 tokens/second** [G2]. Also duration, not bytes.
- **OpenAI's upload cap is 25 MB** [O2], so compression is a *feasibility* constraint for long audio,
  not a cost one. A 60 s TikTok is nowhere near it.

**Nothing in the ASR market charges by the byte.** The only lever compression gives us is latency —
and the only lever that reduces *spend* is reducing **duration**, which is §2.3 and which costs
accuracy.

### 2.2 What preprocessing actually costs and produces (VERIFIED, measured today)

Measured on a synthetic proxy clip I generated with ffmpeg 8.1.2 on an Apple M1 Max: **60 s,
1080×1920, 30 fps, H.264 3.5 Mbit/s, AAC 128 kbit/s stereo 44.1 kHz, 4 real scene cuts, and real
speech** from macOS TTS (an English restaurant-recommendation script plus a Hebrew one, voice
`Carmit he_IL`). Source file 34.0 MB. Script: `measure2.sh` / `measure3.sh` in the task scratchpad,
not committed. **CPU time** is what Vercel bills, so it is reported separately from wall time.

| Operation | CPU | Wall | Output bytes (60 s) | Effective bitrate |
|---|---|---|---|---|
| `-vn -c:a copy` (demux only, no re-encode) | **0.06 s** | 0.16 s | **873 733** | 116 kbit/s |
| `-vn` → MP3 64 k mono 16 kHz | 0.34 s | 0.88 s | 481 108 | 64 kbit/s |
| `-vn` → Opus 32 k mono 16 kHz VoIP | ~0.9 s | 2.1 s | 217 035 | 29 kbit/s |
| `-vn` → **Opus 24 k mono 16 kHz VoIP** | ~0.9 s | 2.7 s | **165 130** | 22 kbit/s |
| `-vn` → **Opus 16 k mono 16 kHz VoIP** | **0.90 s** | 4.41 s | **113 382** | 15.1 kbit/s |
| `-vn` → **Opus 12 k mono 16 kHz VoIP** | ~0.9 s | 2.7 s | **87 618** | 11.7 kbit/s |
| `-vn` → WAV PCM16 mono 16 kHz | 0.19 s | 0.19 s | 1 920 090 | 256 kbit/s |
| Opus 16 k **+ silence trim** (−40 dB, 0.4 s) | ~1.0 s | 3.10 s | 111 464 | 56.5 s survived of 60 |
| Opus 16 k **+ `atempo=1.5`** | ~0.8 s | 1.86 s | 77 087 | 40.0 s of audio |
| Opus 16 k **+ `atempo=2.0`** | **0.56 s** | 1.89 s | **58 718** | 30.0 s of audio |

**Read the first row again.** `-c:a copy` — demux the AAC track and hand it over untouched — is
**15× cheaper in CPU than Opus** and produces 874 KB, which every provider accepts without complaint.
Since nobody bills by the byte, **transcoding to Opus buys us nothing but a slower import.** The
compression question the brief asked has a clean answer: *don't*.

Two caveats I am not going to hide. The audio is TTS, not a TikTok with a music bed under a voice —
Opus at a given `-b:a` will land near nominal on either, but the *intelligibility* at 12 kbit/s of
speech mixed with music is not something this clip can tell you. And an M1 Max core is roughly 2–4×
a Vercel vCPU, so scale the CPU column accordingly (§5.2).

### 2.3 Speed-up: the only lever that reduces spend, and it costs more than it saves

`atempo=2.0` halves the audio duration, and duration is what providers bill. On Groq turbo that turns
$0.000667 into $0.000333 — a saving of **$0.00033 per escalated import**.

The accuracy cost is documented and it is not small. In the PAREDA multi-accent study, feeding
Whisper 1.5×-accelerated audio raised WER from **~18% → ~26%** on Australian samples and **~10% →
~15%** on Indian samples [S6]. At 1.5×, not 2×. DOCUMENTED, third-party, and directionally
unambiguous.

**Verdict: do not speed up the audio.** We are buying a saving of a third of a thousandth of a dollar
with 5–8 points of WER, on a task where the single token we need is a **proper noun** — the exact
class of token that degrades first. Silence trimming is the same trade at an even worse ratio: it
recovered 3.5 s of 60 (saving $0.00004) for 1.0 s of CPU (costing $0.00004). It is a wash. Skip both.

---

## 3. Frame acquisition and vision — the cheap tier, quantified

### 3.1 Frame extraction cost (VERIFIED, measured today, same clip)

| Strategy | CPU | Wall | Frames out | Vercel `iad1` cost |
|---|---|---|---|---|
| **`-skip_frame nokey` (keyframes only), scale 540w** | **0.54 s** | 0.92 s | **31** | **$0.0000246** |
| `-skip_frame nokey`, scale 360w | 0.49 s | 0.66 s | 31 | $0.0000225 |
| First 10 s at 1 fps | 1.13 s | 1.27 s | 10 | $0.0000480 |
| Uniform 6 frames via `fps=6/60` | **7.12 s** | 5.04 s | 6 | $0.0002828 |
| Scene detection `select='gt(scene,0.3)'` | **9.01 s** | 10.39 s | 2 | $0.0003815 |
| Full video decode (`-f null`) | 7.33 s | 7.59 s | 1800 | $0.0003053 |
| **Tile 4 already-extracted JPEGs into one 1080×1920 grid** | **0.05 s** | 0.08 s | 1 image | $0.0000022 |

Peak RSS across all of these: **135 MB**, against Vercel's 2 GB Hobby / 4 GB Pro ceiling. Vercel rates
are DOCUMENTED: `iad1` Active CPU **$0.128/hour**, Provisioned Memory **$0.0106/GB-hour** [D2]; the
figures above bill 2 GB for the wall duration plus CPU for the CPU column.

**The finding that changes the design:** `-skip_frame nokey` gets **31 frames for 0.54 s of CPU**,
while `fps=6/60` gets **6 frames for 7.12 s** — because the `fps` filter still decodes all 1800
frames and throws 1794 away. **Keyframe-only extraction is 13× cheaper than the naive sample and
yields 5× more frames.** And on TikTok that is not merely cheaper, it is *better*: a keyframe is
where the encoder saw a cut, which is where the creator changed the shot, which is where the venue
caption card appears.

**Scene detection is the worst option on every axis** — 9.01 s of CPU (17× the keyframe path) to
produce 2 frames. It re-derives, expensively and worse, what the encoder already recorded for free.
Do not build it.

### 3.2 Vendor image-token math at TikTok's aspect ratio (DOCUMENTED, derived)

**Claude** charges `⌈w/28⌉ × ⌈h/28⌉` visual tokens, downscaling to fit a 1568 px long edge **and** a
1568 visual-token cap on standard-tier models (Haiku 4.5 is standard tier; the 4784-token
high-resolution tier is 4.7-and-later only) [A2].

**Gemini** charges 258 tokens per 768×768 tile, where the crop unit is `floor(min(w,h)/1.5)` and the
tile count is the ceiling of each dimension divided by it — or a flat 258 tokens if **both**
dimensions are ≤384 px [G3].

| Frame size | Claude visual tokens | Haiku $ | Gemini tiles → tokens | `2.5-flash-lite` $ |
|---|---|---|---|---|
| 1080×1920 (native) | 1560 (forced to 813×1446) | $0.001560 | 6 → 1548 | $0.000155 |
| 720×1280 | 1196 | $0.001196 | 6 → 1548 | $0.000155 |
| **540×960** | **700** | **$0.000700** | 6 → 1548 | $0.000155 |
| 360×640 | 299 | $0.000299 | 6 → 1548 | $0.000155 |
| **216×384** | 112 | $0.000112 | **1 → 258** | **$0.000026** |

Two non-obvious consequences, and they point in opposite directions:

1. **Gemini's image cost is aspect-ratio driven, not pixel driven.** Downscaling a 9:16 frame from
   1080×1920 to 360×640 saves **nothing** — both are 6 tiles. The only cliff is getting *both*
   dimensions under 384 px, which for 9:16 means 216×384, and at that size Hebrew overlay text on a
   moving background is not going to survive. **Do not bother pre-downscaling frames for Gemini.**
2. **Claude's image cost is pixel driven.** Pre-downscaling 1080×1920 → 540×960 cuts the cost
   **2.2×** with no loss the model would see anyway (it downscales to 813×1446 regardless).
   **Always pre-downscale frames for Claude.**

### 3.3 The grid trick, verified against the current tiling rules

Packing N frames into one same-aspect image grid:

| | 4 separate frames | One 2×2 grid at 1080×1920 | Saving |
|---|---|---|---|
| `gemini-2.5-flash-lite` | 4 × 1548 = 6192 tok = $0.000619 | 1548 tok = **$0.000155** | **4.0×** |
| `claude-haiku-4-5` (frames pre-scaled 540×960) | 4 × 700 = 2800 tok = $0.002800 | 1560 tok = **$0.001560** | **1.8×** |

**It works, and on Gemini it works exactly 4×**, because the tile count depends only on the aspect
ratio, which a 2×2 grid preserves. The grid costs $0.0000022 of CPU to build from already-extracted
JPEGs (measured, §3.1) — free. A 3×3 grid of 360×640 tiles into the same 1080×1920 canvas gives 9
frames for the same 1548 tokens, i.e. **9×**, at the cost of each frame being 360×640 inside it.

The honest caveat: **I have not measured whether a model reads Hebrew overlay text out of a tile as
well as out of a full frame.** Tiling is a cost claim here, not a quality claim, and it must be
measured on the golden set before it ships. Anthropic's own vision guide warns that compression
artefacts "can make text difficult to read" [A2], and a 3×3 tile is a 3× linear downscale.

---

## 4. Latency and where it runs

| Step | Measured / documented | On Vercel (ASSUMED 2–4× M1 Max per vCPU) |
|---|---|---|
| Fetch media, 3–8 MB from a CDN | ASSUMED 1–3 s | 1–3 s |
| `-c:a copy` audio demux | 0.06 s CPU / 0.16 s wall (VERIFIED) | <1 s |
| Keyframe extraction + tile | 0.59 s CPU / 1.00 s wall (VERIFIED) | 2–4 s |
| Groq `whisper-large-v3-turbo`, 60 s clip | 216× realtime, DOCUMENTED [S1b] | <1 s + network |
| One Gemini extraction call | **p50 2.2 s, one 26.7 s outlier in 9 calls** (VERIFIED, 2026-08-28) | same |
| **Total escalated path** | | **ASSUMED 8–12 s** |

`07` §7's budget is 12 s for stage B inside a 25 s global deadline. **An escalated import fits, with
almost no margin, and only if nothing retries.** The 26.7 s outlier already observed on a plain
caption call would blow the deadline on its own. Two consequences the owner should hear:

- **The streaming route (`L0-F6`) stops being optional.** A cascade that can take 12 s cannot run
  behind a silent spinner; the user has to see the tiers resolving.
- **Vercel can host the ffmpeg step.** A static ffmpeg binary is ~80 MB; the standard function bundle
  limit is **250 MB uncompressed**, and Large Functions (Node.js, fluid compute) allow **5 GB** [D1].
  Memory measured at 135 MB peak against a 2 GB floor. Max duration is 300 s default on Hobby. It
  fits comfortably, and **no separate worker is needed for the ffmpeg tier**. A separate worker would
  only be needed for self-hosted ASR — which §1.3 already rejects.

One trap: the Vercel **request/response body cap is 4.5 MB** [D1]. The media must be fetched by the
function from the CDN, never proxied through our own request body.

---

## 5. The cascade, costed end to end

### 5.1 The lift ceiling, from the evidence we already have

`docs/evidence/tiktok/07-caption-content-scoring.md` (n=16, hand-labelled by watching the videos) and
its four-class split in `transcription-and-media-feasibility-2026-08-28.md` §3:

| Class | n | Can any media tier help? |
|---|---|---|
| `sufficient` — caption names the venue | 3 | No. Escalation is pure waste. |
| **`recoverable` — venue is in the video, not the caption** | **5** | **Yes. This is the entire prize.** |
| `futile` — venue is in neither ("comment for the name", question posts) | 3 | **No.** No tier can find a name the post does not contain. |
| `not-a-place` — controls | 5 | No. |

**Every tier above the caption chases the same 5 posts.** Frames, audio and full video are *not*
additive — E7 records the missing venue as "on-screen **and/or** spoken", and that split is
unmeasurable because neither stream is obtainable. So:

- Today: **3/11 genuine recommendation posts yield a place = 27%** (VERIFIED).
- Cascade ceiling: **8/11 = 73%** (ASSUMED — assumes a *perfect* escalator on all 5 recoverable posts).
- The 3 `futile` posts are permanently out of reach at any price.

**+46 percentage points is the absolute ceiling of Engine 2.0, on n=11, from a web-search-biased
sample.** A realistic escalator recovering 3 of the 5 gives ~55%. That is the number to build a
business case on, not 73%.

### 5.2 Per-tier cost, per import (60 s clip, Vercel `iad1`)

| Tier | What | Model | Cost | Marginal lift (of the 11) | Legal today? |
|---|---|---|---|---|---|
| **T0** | Caption | `claude-haiku-4-5` (production default) | **$0.005880** | 3/11 baseline | **yes** |
| **T0′** | Caption | `gemini-3.5-flash-lite` | **$0.001964** | same | **yes** |
| **T0″** | Caption | `gemini-2.5-flash-lite` | **$0.000568** | same, quality UNKNOWN | **yes** |
| **T1** | + oEmbed cover frame | `gemini-3.5-flash-lite`, 1 image | +$0.000464 | **measured 1/8 recall, with false positives** | **yes — the only media tier that is** |
| **T2** | + 4 keyframes as one 2×2 grid | `gemini-3.5-flash-lite` | +$0.000464 model, +$0.000025 CPU | ASSUMED 2–4 of the 5 | **no — needs media** |
| **T3** | + full audio transcript | Groq turbo → text into T0 call | +$0.000667 ASR, +$0.000003 CPU, +$0.000155 extra prompt tokens | ASSUMED 3–4 of the 5, **overlapping T2** | **no** |
| **T3′** | + audio as native Gemini input | `gemini-3.5-flash-lite`, 1920 tok | **+$0.000576**, one call, zero extra hops | as T3 | **no** |
| **T4** | Full video, `media_resolution=low` | `gemini-2.5-flash-lite`, 5880 tok | **+$0.000588** | ≤ T2+T3 combined | **no** |
| **T4′** | Full video, default resolution | `gemini-3.5-flash-lite`, 17400 tok | +$0.005220 | same | **no** |

Gemini video tokenisation, DOCUMENTED [G4]: frames sampled at **1 fps**, **258 tokens/frame** at
default or **66 tokens/frame** at `media_resolution=low`, plus **32 tokens/second** of audio — the
docs summarise this as ~300 tok/s and ~100 tok/s respectively.

**T4 is cheaper than T2+T3.** Reading the whole video at low resolution on `2.5-flash-lite` costs
$0.000588; sampling frames and transcribing audio separately costs $0.001155 and requires ffmpeg, a
second vendor and two extra network hops. **If we ever get the media, the cascade's own bottom rung
is obsolete on arrival.** The only reasons to prefer T2/T3 over T4 are latency (frames arrive
sooner), corroboration (§7.2) and the fact that T4 needs the whole file while T2 needs only its
keyframes.

### 5.3 Stopping rules — the part that decides whether any of this pays

The escalation gate is where the money is lost, because **73% of imports return zero candidates and
most of them deserve nothing.** The measured triggers, all from `transcription-and-media-feasibility-2026-08-28.md` §3:

| Signal | Precision | Recall | Verdict |
|---|---|---|---|
| Extractor returned **zero candidates** | **0.57** on the tested subset, **~0.33 across the full set** | 0.80 | The best available, and still a coin flip. It cannot tell a cat video from a recoverable post. |
| `cityWordOnly` | 0.40 | 0.80 | worse |
| `noPinMarker` (no 📍) | 0.33 | 1.00 | fires on 15/16 — a rubber stamp |
| `shortCaption`, `hashtagOnly` | 0.00 | 0.00 | worthless |

At 0.33 precision we spend **three escalations per useful one**, which triples the marginal cost of
every tier in §5.2 and is the difference between "cheap" and "why is the bill like this".

**My proposal, and it is the highest-value idea in this document:**

> **Make the escalation gate a field on the call we already make, not a new call.**

Add `postIntent: 'place_recommendation' | 'place_question' | 'not_a_place'` to
`ExtractionResultSchema`. It costs **~10 output tokens ≈ $0.000025** on Gemini and **zero extra
requests**, and it separates precisely the classes the zero-candidate signal conflates: the 3
`futile` posts are `place_question`, the 5 controls are `not_a_place`, and escalation fires only on
`place_recommendation` **and** zero candidates. On E7's labels that would be **5 true fires and 0
waste**, taking precision from 0.33 to 1.00.

That number is **ASSUMED, not measured** — it is what a perfect classifier would do on 16 posts, and
the model will not be perfect. But it is cheap, it is testable against a labelled set that already
exists, and it needs no media and no ruling. **It should be measured before any tier above T0 is
built,** because every tier's economics are multiplied by it.

Then, layered on the resolution evidence already calibrated in `06` §6.2:

| Condition | Action |
|---|---|
| ≥1 candidate resolves `score ≥ 0.92 ∧ margin ≥ 0.05` | **Stop.** Pre-select and show. Escalation is waste. |
| ≥1 candidate resolves in `0.80–0.92` | **Stop.** Shortlist. The user's tap is cheaper and more accurate than another tier. |
| Candidates exist, **all** resolve `no_match` | **Escalate to T2/T3.** We have a name we cannot place — a frame or a transcript may supply the city or the street that fixes it. This is the *strongest* escalation case and the current design does not exploit it. |
| Zero candidates **and** `postIntent = place_recommendation` | **Escalate.** The modal recoverable case. |
| Zero candidates **and** `postIntent ≠ place_recommendation` | **Stop.** Show `no_places`. This is the ~73% and it is a first-class screen, not a failure. |

**On the case the brief singled out** — caption yields zero candidates, ~73% of imports — the
cheapest next tier that turns a meaningful share into a place is **T3′, audio as native Gemini
input, at $0.000576**. Not frames: E7's two cleanest recoverable specimens (#8 @yallabikestlv →
"Simhovich", #12 @alexandramoulavi → "Nomena Café") are creators *saying* the name, and #12's caption
is Hebrew hashtags with the venue never written down. Audio is also the tier that degrades most
gracefully — a transcript is text, and text is what our existing prompt, plausibility filter and
resolver already consume unchanged.

### 5.4 Blended $/import and the 10k-import month

Assuming an escalation rate of **50%** (the ~73% zero-candidate rate filtered by a `postIntent` gate
that suppresses the `futile` and control classes):

| Design point | $/import | 10k-import month | vs today |
|---|---|---|---|
| **A. Today as deployed** — Haiku, caption only | **$0.005880** | **$58.80** | 1.00× |
| B. A + prompt caching (5 m), at 10k/mo | $0.003482 | $34.82 | 0.59× |
| **C. Provider switch to `gemini-3.5-flash-lite`, caption only** | **$0.001964** | **$19.64** | **0.33×** |
| C′. `gemini-2.5-flash-lite`, caption only | $0.000568 | $5.68 | 0.10× |
| **D. C + oEmbed cover frame on every import** (legal today) | **$0.002428** | **$24.28** | 0.41× |
| **E. C + 50% escalate to T3′ (native audio)** | **$0.002252** | **$22.52** | **0.38×** |
| F. C + 50% escalate to T2+T3 (grid + Groq ASR) | $0.002620 | $26.20 | 0.45× |
| G. C + 50% escalate to T4 (full video, low res) | $0.002258 | $22.58 | 0.38× |
| H. **Haiku** + 50% escalate to grid + Groq ASR | $0.007196 | $71.96 | 1.22× |
| I. Sonnet 5 + 50% escalate to full video default-res | $0.014370 | $143.70 | 2.44× |

**The answer to "is this 10–30× today's cost" is no, and the truth is stranger: the full cascade on
a current Flash-Lite model costs less than half of what we spend today on captions alone.** The
$0.003/import figure in `09` §2.2 was never achieved; we are at $0.0059, and every cascade design
point that switches provider lands *below* it.

The one design that is genuinely expensive is **H** — keeping Haiku and bolting a cascade on. That
is 1.2× today, and it is the path of least resistance, which is exactly why it should be named.

---

## 6. Prompt caching, priced at our volume

The system prompt is ~4,500 cacheable tokens of the ~4,880 sent. Anthropic's multipliers: 5-minute
cache write **1.25×**, 1-hour write **2×**, cache read **0.1×** [A1].

Break-even hit rates, derived: **5-minute cache pays off above a 21.7% hit rate; 1-hour above 52.6%.**

| Volume | Arrivals/hour | P(warm, 5 m) | Effective multiplier | Saving/import | **Saving/month** |
|---|---|---|---|---|---|
| 1 000/mo | 1.4 | 0.11 | **1.13** | **−$0.00057** | **−$0.57 (a loss)** |
| **10 000/mo** | 13.7 | 0.68 | **0.47** | **+$0.00240** | **+$23.98** |
| 100 000/mo | 137 | ~1.00 | 0.10 | +$0.00405 | +$405 |

(Poisson arrivals, uniform over 730 h — optimistic, since real traffic is bursty and concentrated in
one timezone, which *raises* daytime hit rate and drops the night rate to zero.)

**Caching is worth $24/month at 10k imports and loses money at 1k.** It is real, it is free to
implement, and it is **an order of magnitude less valuable than simply deleting prompt tokens or
changing model** — which is the point §0.3 was making.

---

## 7. Things the brief did not ask for

### 7.1 Audio fingerprinting the music track — no

TikTok audio is a licensed music bed selected from a library. Identifying it tells you the *sound*,
which the oEmbed payload arguably already implies, and tells you nothing whatsoever about the venue.
The one theoretical use — "creators who use this sound cluster around a place" — is a recommender
feature, not an extractor, and it needs a corpus we do not have. **Drop it.**

### 7.2 Word timestamps × on-screen text — the idea worth keeping

This is the one place where a second tier buys something other than recall. If ASR reports *"Nomena"*
at t=12.4 s and the keyframe nearest t=12 s carries the overlay **נומנה**, we have **two independent
witnesses to the same name** — one spoken, one written, neither of them the model's world knowledge.

That matters more for this product than any cost line, because our standing problem is the one
recorded in `transcription-and-media-feasibility-2026-08-28.md` §4: the extractor returned
`tsukijifishmarket` with `modelConfidence: 0.95`, from a hashtag, and it resolved cleanly, and
nothing downstream caught it. **Corroboration is the only mechanism proposed anywhere in this
document that raises *precision* rather than recall.** It also feeds directly into the
extracted-vs-inferred distinction the working agreement requires us to preserve: a corroborated name
is an *extracted* claim, and the LLM venue-identification path from the 2026-08-22 deviation is an
*inferred* one, and the UI must not render them the same way.

Cost: word timestamps are free on Groq (`verbose_json` + `timestamp_granularities`) [S1b]; seeking
one extra keyframe is ~$0.000002 of CPU. **Effectively free, and it is the only precision lever here.**

### 7.3 Two-model split — yes, but not the way it is usually done

The usual split (cheap model triages, expensive model handles hard cases) barely helps us, because
**the cost is the prompt, not the model.** Sending 4,880 tokens to a cheap model still costs 4,880
tokens.

The version that works: **a ~300-token triage prompt** on `gemini-2.5-flash-lite` answering one
question — *"does this caption name a specific findable venue, yes or no"* — at **$0.00004**, and the
full 411-line prompt only on the ones that say yes. At E7's distribution that is ~5 of 16 posts
paying full price. Blended: $0.00004 + 0.31 × $0.001964 = **$0.000649/import**, a **3× saving over
C** and **9× over today**, with the triage model's false-negative rate as the risk. Measurable
against the golden set before shipping.

### 7.4 The lever nobody has pulled: delete prompt tokens

**83% of every import's cost is a 411-line system prompt sent on all of them, including the 73% that
return nothing.** Cutting it from 4,880 to 1,500 tokens saves **$0.0034/import on Haiku** — more than
prompt caching, more than any tier in §5.2, more than the entire cascade costs. It needs no vendor,
no ruling, no new capability, and it is testable against the golden set with the versioning machinery
(`promptVersion`) that `09` §7 already built for exactly this.

I am not claiming the prompt can be cut by 70% without losing accuracy. I am claiming **nobody has
measured what it costs us**, and that this is the cheapest experiment in this document.

### 7.5 Cache on caption hash, not only `source_id`

`extractions` is keyed on `(source_id, extractor_version, prompt_version)` (`08` §3.4). E7 entry #11
(@joiceglobal) is a **verbatim repost of #10** (@zachmargs) — different `source_id`, identical
caption, and we pay twice. Adding a caption-hash lookup is a one-column index and it is free.

### 7.6 The LLM venue-identification path is a T0.5 that needs no media

The 2026-08-22 deviation — the model names the most likely real venue from caption context using its
own world knowledge, and the app links out to Google Maps for a human to verify — costs **~10 extra
output tokens, $0.000025**, and needs no video, no audio and no ToS ruling. On E7's `city-only` posts
(#1 "6 must try spots in Tokyo", #13 "Tel Aviv🇮🇱") it is the *only* tier that can produce anything at
all. It is also **unverified recall, mitigated by exactly one thing: the human click.** That has to be
said in the UI copy, not just in this report, and the row must be visually distinguishable from an
extracted name.

---

## 8. Ranked recommendation — the cascade I would actually build

**Do these three first. None needs media, a ruling, a vendor or a new tier.** They are, in order,
larger than everything below them.

| # | Action | Cost effect | Confidence |
|---|---|---|---|
| **1** | **Measure the prompt.** Cut `prompt.ts` from ~4,880 to ~1,500 tokens at a new `promptVersion`, evaluate against the golden set before and after | **−58% of every import**, all volumes | High — the lever is arithmetic; only the accuracy cost is unknown |
| **2** | **Switch production to `gemini-3.5-flash-lite`.** The adapter exists, the factory selects it by config, the price is now DOCUMENTED. Set `costModel: 'measured'` while you are there | **$0.00588 → $0.00196**, 3.0× | High on cost, **UNMEASURED on quality** — must be run against the golden set first |
| **3** | **Add `postIntent` to the schema.** ~10 output tokens. It is the escalation gate, and until it is measured every tier below is uncosted | +$0.000025; multiplies every tier's economics | Medium — plausible, unmeasured |

**Then, if and only if `security-privacy` + the owner rule that media may be obtained:**

| # | Tier | Cost | Why this one |
|---|---|---|---|
| **4** | **T3′ — the audio track as native Gemini input**, `-c:a copy`, no transcode, no second vendor | **+$0.000576/escalated import** | Cheapest tier that addresses the modal failure. One call, one vendor, no ASR hop, no ffmpeg transcode. E7's clearest recoverable specimens are *spoken*, not on-screen |
| **5** | **T2 — 4 keyframes as one 2×2 grid**, via `-skip_frame nokey` | **+$0.000489** | 0.54 s of CPU, 4× cheaper than 4 separate images, and keyframes land where the creator cut the shot — which is where the caption card is |
| **6** | **Corroboration**: align Groq word timestamps against the nearest keyframe | ~free | The only precision lever in this document. Buy it with the ASR call you are already making |
| **7** | Prompt caching (5 m) | −$0.0024/import at ≥10k/mo, **negative below ~3k/mo** | Do it when volume justifies it, not before |

**Do not build:** scene-change detection (17× the CPU of keyframes for fewer frames); Opus
transcoding (nobody bills by the byte); audio speed-up (5–8 WER points to save $0.0003); a dedicated
OCR (10× the price of a model call, and already measured at 1/8 recall with shopfront false
positives); self-hosted ASR (dearer than Groq before you count a 12–90 s cold start); music
fingerprinting; and **T4 at default `media_resolution`** — `low` is 3× cheaper and reads 1 fps of a
vertical phone video perfectly well.

**Budget summary.** Today $0.00588/import = $58.80 per 10k. **Recommendations 1 and 2 alone** (a
1 500-token prompt on `gemini-3.5-flash-lite`): **$0.00095/import = $9.50 per 10k, a 6.2×
reduction.** The full media cascade layered on top of them (T2 + T3′ at a 50% escalation rate):
**$0.00148/import = $14.82 per 10k**, still **4.0× cheaper than today**. Adding §7.3's triage split
takes the caption-only figure to ~$0.00065. **The owner's fear that this is a 10–30× cost increase
is not supported by any 2026 price I could find.**

---

## 9. What I could not determine, stated plainly

- **Hebrew WER for any of these providers on TikTok-like audio.** The only vendor-published band I
  found is AssemblyAI's, which places Hebrew in "Good accuracy (>10% to ≤25% WER)" for Universal-2
  [S3]. Deepgram confirms `he` on Nova-3 only, with no accuracy figure [S2]. OpenAI does not list
  Hebrew in its supported-language documentation [O2] — that is **UNKNOWN**, not "unsupported".
  Gemini publishes no per-language audio WER. **Nobody publishes a number for speech over a music
  bed at TikTok pacing, which is our actual corpus.**
- **And WER is the wrong metric for us anyway.** We need one **proper noun** correct. A 20% WER
  concentrated in function words is survivable; a 20% WER that mangles *"Simhovich"* into
  *"Simchovic"* is a total loss on the one token that mattered. **No public benchmark measures
  proper-noun recall**, which is the metric this product actually needs. Measuring it on our own
  Hebrew corpus is a task, not a citation.
- **The `ivrit-ai/whisper-large-v3` leaderboard numbers.** The Hugging Face Space exists and is
  actively maintained; the model is Apache-2.0 and 2B parameters [S5]. I could not read the
  leaderboard's table through a fetch. If Hebrew turns out to be the blocker, that fine-tune is the
  answer, and §1.3's cost rejection would need re-opening on quality grounds.
- **Azure AI Vision Read pricing.** The public page renders the rates as `$-` [V2]. Not carried.
- **Whether Hebrew overlay text survives a 2×2 or 3×3 tile.** §3.3's saving is a cost claim only.
- **Real escalation rate.** I used 50%. The measured zero-candidate rate is ~73% and the `postIntent`
  gate that would reduce it is unbuilt and unmeasured. Every blended figure in §5.4 moves with it.
- **The E7 denominator.** n=11 genuine recommendation posts, found via web search, acknowledged
  biased in `07-caption-content-scoring.md` itself. **Every lift percentage in §5.1 rests on eleven
  posts.** Before any of §8 items 4–7 is built, that set needs to be the owner's own saved TikToks.
- **Vercel ffmpeg wall time.** Measured on an M1 Max; the 2–4× vCPU factor is ASSUMED. If it is 6×,
  the keyframe tier alone eats 6 s of a 12 s stage budget.

---

## Sources — every one read on 2026-08-31

| Ref | URL |
|---|---|
| [A1] | https://platform.claude.com/docs/en/docs/about-claude/pricing |
| [A2] | https://platform.claude.com/docs/en/build-with-claude/vision |
| [X1] | https://parsejet.com/guides/can-claude-transcribe-audio/ (secondary; corroborates the absence of an audio input path in [A1]/[A2]) |
| [G1] | https://ai.google.dev/gemini-api/docs/pricing |
| [G2] | https://ai.google.dev/gemini-api/docs/tokens |
| [G3] | https://ai.google.dev/gemini-api/docs/image-understanding |
| [G4] | https://ai.google.dev/gemini-api/docs/video-understanding |
| [O1] | https://developers.openai.com/api/docs/pricing |
| [O2] | https://developers.openai.com/api/docs/guides/speech-to-text |
| [S1] | https://deepgram.com/pricing |
| [S1b] | https://console.groq.com/docs/speech-to-text |
| [S2] | https://developers.deepgram.com/docs/models-languages-overview |
| [S3] | https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/supported-languages · https://www.assemblyai.com/pricing |
| [S4] | https://elevenlabs.io/pricing/api |
| [S5] | https://huggingface.co/ivrit-ai/whisper-large-v3 |
| [S6] | https://arxiv.org/pdf/2605.17860 (PAREDA — 1.5× speed-up WER degradation) |
| [M1] | https://modal.com/pricing |
| [M2] | https://modal.com/blog/truly-serverless-gpus (GPU memory snapshots, cold start ~70 s → ~12 s) |
| [R1] | https://replicate.com/pricing |
| [V1] | https://cloud.google.com/vision/pricing |
| [V2] | https://azure.microsoft.com/en-us/pricing/details/cognitive-services/computer-vision/ (rates rendered as `$-`) |
| [D1] | https://vercel.com/docs/functions/limitations |
| [D2] | https://vercel.com/docs/functions/usage-and-pricing |

**In-repo evidence relied on:** `docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` ·
`docs/evidence/tiktok/07-caption-content-scoring.md` · `docs/evidence/tiktok/cover-frame-ocr-run-2026-08-28.json` ·
`docs/09-extraction-and-resolution.md` · `src/integrations/llm/cost.ts` · `src/integrations/llm/prompt.ts` ·
`src/integrations/llm/place-extractor-factory.ts`.
