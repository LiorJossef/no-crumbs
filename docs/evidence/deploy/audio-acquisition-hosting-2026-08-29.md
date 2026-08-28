# ACQ-2 — Where the audio→transcript step runs, what it costs, and which Gemini surface to call

Date: **2026-08-29** · Owner: `devops-vercel` · Task: **ACQ-2** · Investigation only. No `src/**`,
no `services/**`, no deploy, no hosted migration. The one reproducible artefact (a ~120-line
MP4→ADTS demuxer I wrote and measured) is inlined in §3.2.

> Labels: **VERIFIED** = measured here, or read verbatim from the vendor's current doc with the quote
> reproduced · **DOCUMENTED** = stated by the vendor, not exercised by me · **ASSUMED** = reasoned,
> untested · **UNDOCUMENTED** = the vendor does not say, either way · **UNAVAILABLE** = confirmed
> not possible.

> ### Live-call declaration
>
> **I made zero live calls to Gemini, Google Places, or any other paid or quota-limited API during
> this task. Not one. No API key was read or resolved.** The owner's no-live-calls constraint arrived
> late in the task; I record here that it was already satisfied, rather than merely obeyed from the
> moment it landed.
>
> Everything in this document comes from: unauthenticated documentation fetches
> (`ai.google.dev`, `developers.cloudflare.com`, `vercel.com/docs`, `supabase.com`), the public npm
> registry, the **`@google/genai` v2.19.0 SDK source** (downloaded from npm and read, §2.4), the
> Cloudflare docs repository on GitHub, `git show` against `stash@{3}`, existing evidence files in
> this repo, and **local measurements on my own machine** (§3.2 — a demuxer I wrote, run against an
> MP4 that ships with macOS, verified with macOS's own `afinfo`/`afconvert`). None of that touches a
> quota.
>
> Three questions genuinely cannot be settled without a live call. **I did not make them.** They are
> in §10 as approval-required experiments, each with its exact endpoint, payload, call count and
> quota bucket, for the owner to approve or decline. §10.0 — the most valuable of them — costs zero
> calls and is a page the owner already has open.

**This task was re-scoped twice while in flight.** First the owner ruled the architecture
(TikTok → audio → Gemini transcription → existing Gemini extraction), retiring the stashed
Cloudflare Whisper pipeline. Then the owner read real quota numbers off their own project and the
question became *which Gemini surface*. §2 answers that — it is the load-bearing section and it
changes the recommendation I would have given an hour earlier. §12 records what I established about
the retired Cloudflare pipeline, because two of those findings are corrections rather than
preferences.

---

## 1. Answer first

**Call `generateContent` on `gemini-3.5-flash-lite` with an inline `audio/aac` part. Do not use
either Transcribe endpoint.**

Your hypothesis was right, and it is right for a stronger reason than quota. Quota alone would make
`gemini-3.5-transcribe` unusable (25 requests/day = a 100-post batch takes four days). But the *Live*
variant, which has the generous quota, **accepts only raw 16-bit PCM at 16 kHz** — so feeding it
would require decoding AAC and resampling, which is a real transcode and drags back exactly the
ffmpeg/WASM problem this task otherwise eliminates. Ordinary `generateContent` takes `audio/aac`
directly.

So the audio path is:

> fetch MP4 → **demux the AAC track in 1.43 ms of pure JS** → base64 inline into one
> `generateContent` call on the model this codebase already calls → transcript → existing extraction
> call → discard every byte.

| Question | Answer | Decided by |
|---|---|---|
| Which Gemini surface | **`generateContent`, `gemini-3.5-flash-lite`** | 20× the RPD, takes AAC natively, stable, already our call pattern (§2) |
| `gemini-3.5-transcribe`? | **No** | 25 RPD. 100 posts = 4 days (§2.3) |
| `gemini-3.5-transcribe-live`? | **No** | Needs 16 kHz PCM → a decode we otherwise never do; WebSocket in a serverless function; **Preview** (§2.4) |
| MP4→audio | **Pure-JS ADTS demux**, 0 dependencies | 1.43 ms CPU, measured (§3.2) |
| Audio by URL? | **No — bytes only** | Only Files-API URIs and YouTube URLs accepted (§4) |
| Inline or Files API | **Inline base64** | 120 s of TikTok audio ≈ 1.9 MB; inline ceiling 20 MB (§4) |
| Sync or async | **Synchronous** in `POST /api/imports` | Hobby ceiling 300 s; work is ~10–40 s, all I/O (§6) |
| Store the audio | **No. Discard.** | 1,000 imports × 3 MB = 3 GB against a 1 GB free cap (§7) |
| Ceiling | **~250 imports/day** free, or ~500 if the two calls are collapsed into one (§2.5) | |

**Nothing here needs the owner to spend money.**

**And the paragraph you asked for (§9): if a vendor returns transcript text, do not build any of
this.** Every argument for our own transcription step evaporates, and the audio path also carries the
larger legal and privacy exposure. Keep this document; it is one day's work to resurrect if a vendor
transcript turns out to be bad at Hebrew.

---

## 2. Which Gemini surface — the quota question

### 2.1 First, an honest word about citations

Google **no longer publishes free-tier RPM/TPM/RPD numbers.** Verbatim from
`ai.google.dev/gemini-api/docs/rate-limits` (read 2026-08-29):

> Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI
> Studio. […] Specified rate limits are not guaranteed and actual capacity may vary.

The former per-model table is gone; the page now links to `aistudio.google.com/rate-limit`. So **the
owner's own quota page is the authoritative source and I cannot second-source it.** What I *can* do
with citations is establish the structure — which surfaces exist, whether they are distinct buckets,
and what each one physically accepts — and that turns out to settle the question anyway.

Two structural facts, verbatim from the same page:

> Rate limits are applied **per project**, not per API key. Requests per day (RPD) quotas reset at
> midnight Pacific time.

> **Limits vary depending on the specific model being used**, and some limits only apply to specific
> models.

**Quota is bucketed per model.** That is the whole answer to Q1: the fact that the owner sees *two
separate rows* for Transcribe and Transcribe Live is itself proof that the bucket is per model
endpoint, not per modality — and therefore `gemini-3.5-flash-lite` has its own row and its own
bucket, and audio arriving in a `generateContent` call is metered there.

### 2.2 The three surfaces, and they are genuinely three

Not two variants of a thing. Three separately-listed model endpoints with different protocols,
different accepted formats and different capability tables.

From `ai.google.dev/gemini-api/docs/models` (read 2026-08-29), the Gemini 3 endpoint table lists
`gemini-3.5-transcribe` and `gemini-3.5-transcribe-live` as **two endpoints** of the Transcribe
family, and `gemini-3.5-flash-lite` as its own stable model. And the `gemini-3.5-transcribe` model
card carries a table whose columns are literally the two endpoints:

> | Feature | Live Streaming (`gemini-3.5-transcribe-live`) | Audio File Processing (`gemini-3.5-transcribe`) |
> | **Max Audio Duration** | 10 minutes per session. | Up to 1 hour |
> | **Speaker Diarization** | Not Supported | Supported (up to 8 speakers) |
> | **Word-level Timestamps** | Not Supported | Supported |

The pricing page also prices them separately, under two headings, at different rates.

| | **A.** `gemini-3.5-transcribe` | **B.** `gemini-3.5-transcribe-live` | **C.** `generateContent` on `gemini-3.5-flash-lite` |
|---|---|---|---|
| Protocol | HTTPS unary | **Stateful WebSocket (WSS)** | HTTPS unary |
| Accepted audio | WAV/MP3/AIFF/**AAC**/OGG/FLAC | **raw 16-bit PCM, 16 kHz, mono, LE — only** | WAV/MP3/AIFF/**AAC**/OGG/FLAC |
| Status | Stable | **Preview** | Stable |
| Max audio | 1 h (30 min with diarization/timestamps) | 10 min per session | 9.5 h per prompt |
| Audio token rate | 25 tok/s | 25 tok/s | **32 tok/s** |
| Paid input price | $2.00/M | $3.50/M | **$0.30/M** |
| Free-tier quota (owner's page) | **3 RPM / 10K TPM / 25 RPD** | Unlimited RPM / 20K TPM / Unlimited RPD | **not yet read — see §2.6** |
| Distinct bucket? | Yes | Yes | **Yes** |

Sources, all read 2026-08-29: `docs/models/gemini-3.5-transcribe`, `docs/models/gemini-3.5-flash-lite`,
`docs/live-api`, `docs/live-api/live-transcribe`, `docs/audio`, `docs/pricing`.

**That C exists at all is settled by its own model card**, verbatim:

> `gemini-3.5-flash-lite` — Supported data types: **Inputs** Text, Image, Video, **Audio**, and PDF.
> **Output** Text. […] **Live API** Not supported.

Read that last clause twice. Flash-Lite *cannot* use the Live API. It has exactly one surface —
`generateContent`/`interactions` — and it takes audio on it. There is no way for the Transcribe
quotas to apply to a flash-lite call, because a flash-lite call cannot reach either Transcribe
endpoint. **Your hypothesis is confirmed, structurally, not just by inference.**

And transcription-on-generateContent is not a hack we are inventing. From `docs/audio`, the listed
capabilities of ordinary audio understanding:

> - Describe, summarize, or answer questions about audio content
> - **Transcription and translation (speech to text)**
> - Speaker diarization (identifying different speakers)

with `gemini-3.5-flash` in the worked example.

### 2.3 Surface A is dead on quota

25 RPD. Which limit binds:

| Limit | Ceiling in imports/day (60 s clips) |
|---|---|
| 3 RPM | 4,320 — not binding |
| 10K TPM ÷ 1,500 tok per audio-minute | 6.7 audio-min/min — not binding |
| **25 RPD** | **25** |

**RPD binds, by a factor of 170.** A 100-post batch takes four calendar days. This is the model I
recommended in the pre-correction draft of this document, on quality grounds (85+ locale detection,
code-switching — genuinely attractive for Hebrew↔English). **That recommendation is withdrawn.** A
better transcriber you can call 25 times a day is not a transcriber for this product.

### 2.4 Surface B is dead on format, before quota even matters

Its quota is fine. Its input is not. Verbatim from `docs/live-api/live-transcribe`, "Sending audio":

> Stream audio chunks over the active connection as raw 16-bit PCM audio.
> - **Audio format:** Raw 16-bit PCM at 16kHz (mono, little-endian).
> - **Chunk size:** Send audio in chunks of 100ms (1,024 to 2,048 frames).
> - **MIME type:** `audio/pcm;rate=16000`

and from `docs/live-api`, "Technical specifications":

> | Input modalities | Audio (**raw 16-bit PCM audio, 16kHz**, little-endian), images (JPEG <= 1FPS), text |
> | Protocol | **Stateful WebSocket connection (WSS)** |

**This is the finding that decides it.** TikTok gives us AAC. Surfaces A and C accept `audio/aac`
verbatim (`docs/audio`: "AAC - `audio/aac`"), so my 1.43 ms demuxer feeds them unchanged. Surface B
accepts *only* PCM — which means **decoding** AAC and **resampling** to 16 kHz mono. That is not a
remux, it is a codec. It needs ffmpeg, or an AAC decoder in WASM, and §3.3 shows what those cost:
64–68 MB of binary to do what 4 KB of JavaScript does for the other two surfaces. Choosing B
reintroduces the entire problem this task was set to eliminate.

Four more reasons, any one of which would be enough on its own:

- **Preview.** The Live API page opens with `> [!WARNING] Preview: The Live API is in Preview.`
  Flash-Lite is Stable. We do not put a Preview API on the critical path of the product's core loop.
- **Real-time ingestion is the design, and faster-than-real-time is UNVERIFIED.** See §2.4.1 — I
  read the SDK source rather than guessing, and it gets us halfway. If ingestion *is* 1×, a 90 s
  TikTok occupies a 90 s session, which as you say is unattractive regardless of quota.
- **No file-upload ingress.** Streaming is the only path in. There is no Files-API or batch route
  into the Live surface.
- **A WebSocket inside a serverless function.** Technically fine — outbound WSS from a Vercel Node
  function is just a socket, and a 90 s session fits the 300 s ceiling. But it means a stateful,
  long-lived connection, its own reconnect and partial-transcript-assembly logic, and a second client
  library, to replace one `fetch`. Vercel's own AI Gateway is listed as a partner integration for
  exactly this, which tells you the expected shape is "let a platform manage the media plumbing" —
  and AI Gateway is billable, so it is not an option here.

#### 2.4.1 Can the Live surface ingest prerecorded audio faster than real time? — **UNVERIFIED**

I did not test this, and I am not going to: settling it means opening a Live session, which is a live
call against the owner's quota. Here is exactly what the evidence supports and how far.

**What the SDK source says (VERIFIED — `@google/genai` v2.19.0, downloaded from npm and read).**
`sendRealtimeInput` is a thin pass-through. Its entire body, after shaping the payload, is:

```js
this.conn.send(JSON.stringify(clientMessage));
```

**There is no pacing, no sleep, no rate limiter, no backpressure and no bytes-per-second gate
anywhere in the client.** Nothing on our side of the wire stops us pushing a 90-second file as fast
as the socket drains. Every Live method is also annotated `@experimental` in the source, consistent
with the docs' `Preview` banner.

The SDK's own remarks add a second useful line:

> `sendRealtimeInput` is optimized for responsiveness at the expense of deterministic ordering
> guarantees. Audio and video tokens are [added] to the context when they become available.

"When they become available" describes event-driven server-side ingestion, not a fixed clock — which
is mildly encouraging, and no more than that.

**What that does and does not establish.**

| Claim | Confidence | Why |
|---|---|---|
| The *client* can transmit a whole file in one burst | **High** | SDK source imposes no pacing; the docs' 100 ms chunking is advice for a live mic, not an enforced protocol rule |
| The *server* will accept the burst without erroring | **Moderate** | Nothing documents a rejection, but nothing documents acceptance either; a server-side buffer or flow-control limit would be invisible from the client source |
| The server will *process* it faster than 1× and return a full transcript quickly | **Low — genuinely unknown** | Never stated anywhere. The pipeline is built around VAD, pauses and turn completion; it may well consume at playback rate by design |
| Transcript quality is unaffected by burst-feeding | **Low** | VAD segments on silence. Feeding 90 s at once may produce different segmentation than 90 s in real time. Nobody documents this |

**My reading: the two rows that matter are Low confidence, and they are the two the architecture
would rest on.** Even if both resolved favourably, Surface B would still be ruled out by §2.4's other
four reasons — the PCM requirement alone is decisive, because it forces an AAC decode we otherwise
never perform. **So this question does not need to be answered to make the decision.** I am recording
it as unverified with a costed experiment (§10.5) rather than leaving a confident-sounding guess in
the record, but I would not spend the owner's quota on it: it can only change the answer for a
surface that is already disqualified on grounds that have nothing to do with timing.

### 2.5 Surface C, and the throughput maths

Audio token rate, verbatim from `docs/audio`:

> Each second of audio is represented as **32 tokens** — for example, one minute of audio is
> represented as **1,920 tokens**.

Note this is *not* the 25 tok/s used by the Transcribe models (from the pricing page's own footnote:
"Estimated pricing is based on 25 audio tokens per second for input"). Different models, different
tokenisers. Your 32 tok/s estimate is right for C; the Transcribe rows want 25.

Your TPM arithmetic, corrected: 20K TPM ÷ (25 tok/s × 60) = **13.3 audio-minutes per wall-clock
minute** for Surface B, so ~6.7 imports/min for 2-minute clips, not 5. Better than you thought, and
irrelevant, because §2.4 rules B out on format.

Ceilings, side by side, for a 60 s clip:

| Surface | Tokens per clip | Binds first | Imports/day | 100-post batch? |
|---|---|---|---|---|
| A `transcribe` | 1,500 | **RPD 25** | **25** | **4 days. No.** |
| B `transcribe-live` | 1,500 | TPM 20K | ~19,000 audio-min/day | Yes on quota, no on format |
| **C `flash-lite`** | **~2,000** (1,920 audio + instruction) | **RPD** | **~250** at 2 calls/import; **~500** at 1 | **Yes, in one sitting** |

Surface C at 100 posts uses 200 calls of the owner's ~500/day budget — **40%**, done in an afternoon.
Surface A would need four days and Surface B needs a codec. That is the whole comparison.

**Which binds for C, TPM or RPD?** RPD, and not closely. A transcription call is ~2,000 tokens and an
extraction call is ~5,200 (the 4,880 measured in-repo plus the transcript). Even a conservative
free-tier TPM would allow tens of imports per minute; RPD allows 250 per *day*. **RPD binds, and it
is the number the owner already tracks as "500 Gemini calls/day".** No new budget concept.

### 2.6 The one thing the owner should check, and it takes 60 seconds

I have proved C is a distinct bucket. I have not seen its number. **Please read the
`Gemini 3.5 Flash-Lite` row off the same AI Studio quota page the Transcribe rows came from** and
record RPM / TPM / RPD. The working assumption throughout this document is the owner's standing
figure of ~500 calls/day, and every ceiling here scales linearly with it.

If that row comes back small — anything under ~200 RPD — then §2.7 stops being an optimisation and
becomes the design.

### 2.7 The one-call option, now genuinely worth considering

Because C is the *same model on the same surface* as the existing extractor, transcription and place
extraction can be **one call**: audio part + the existing extraction prompt, one response.

That halves the RPD spend: **~500 imports/day instead of ~250.**

I did not recommend this an hour ago and the reason still partly holds — the extraction prompt is
version-pinned (`p11-s3`) and graded against a 44-case golden file, and feeding it audio invalidates
that grading. Two calls keeps the transcript a plain `ContentPart` concatenated with the caption,
exactly the seam `completedTranscriptContentExtractor()` in `stash@{3}` already assumed, and keeps
the golden file meaningful.

**My recommendation stands at two calls**, because 250 imports/day is comfortably above any realistic
demo or marking load and the golden file is worth more than the headroom. But this is now a live
lever rather than a theoretical one: if §2.6 returns a tight number, collapsing to one call is the
first thing to reach for, and it costs no infrastructure — just a prompt revision and a re-grade.
`ai-extraction` owns that call.

### 2.8 Recommendation

**`generateContent` (or the `interactions` equivalent) on `gemini-3.5-flash-lite`, one inline
`audio/aac` part plus a short transcription instruction.**

1. **Quota** — its own bucket, ~20× the Transcribe RPD, and it is the budget the project already
   counts.
2. **Format** — takes AAC natively, so the 1.43 ms demuxer in §3.2 is the entire extraction step. B
   would need a codec.
3. **Protocol** — one HTTPS request, structurally identical to `src/integrations/llm/gemini.place-extractor.ts`.
   No WebSocket, no session state, no second client library, no streaming assembly.
4. **Stability** — Stable, not Preview.
5. **Cost** — $0.30/M input against $2.00/M (A) and $3.50/M (B). Even paying, C is ~5× cheaper per
   audio-minute.
6. **Optionality** — same model as the extractor, so §2.7 stays available.

You said you would much rather add an audio part to a call pattern this codebase already has than
stand up a WebSocket client inside a serverless function. **That is also the technically correct
answer, and not by a small margin.**

**The quality trade-off, stated honestly.** `gemini-3.5-transcribe` is purpose-built: 85+ locale
auto-detection, documented intra-sentence code-switching, diarization, custom vocabulary. For
Hebrew↔English food TikToks that is a real advantage, and general-purpose Flash-Lite may transcribe
noisy code-switched speech less well. But at 25 RPD it cannot be the production path regardless, so
the comparison never arrives. If Flash-Lite's transcription proves weak in probe §10.1, the next step
is **`gemini-3.5-flash`** — a bigger model, still `generateContent`, still audio-in, still a separate
quota row — not the Transcribe endpoints. `ai-extraction` should judge the output; I am reading spec
sheets, not benchmarks.

---

## 3. The MP4→audio step

### 3.1 What has to move

A TikTok clip in product range is 15–120 s: progressive H.264 + AAC MP4.

| | 15 s | 60 s | 120 s |
|---|---|---|---|
| MP4, ~1.5 Mbps (ASSUMED) | ~2.8 MB | ~11 MB | ~22 MB |
| AAC track only, 128 kbps (ASSUMED) | 0.24 MB | 0.96 MB | 1.9 MB |
| …base64'd for an inline request | 0.32 MB | 1.3 MB | 2.6 MB |

The MP4 column is ASSUMED — I fetched no TikTok bytes, and per
`docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` nobody should until the
acquisition question closes. The AAC column is robust: TikTok's audio ladder is 128 kbps-class
regardless of video bitrate. **Audio is ~1 MB per minute; video is 10–20× that**, which is the first
argument for extracting rather than shipping the container.

### 3.2 Pure-JS MP4 demux — RECOMMENDED, and measured

Extracting AAC from an MP4 is not transcoding. Read the `moov` atom, find the `soun` track, read
`AudioSpecificConfig` out of `esds`, walk `stsc`/`stsz`/`stco` for each access unit's byte range,
prefix each with a 7-byte ADTS header. Samples are copied verbatim. No codec, no DSP.

**VERIFIED today.** I wrote it — no npm package — and ran it against a real H.264+AAC MP4 (8.6 MB,
11.6 s, 48 kHz stereo):

```json
{ "inputBytes": 8636761, "outputBytes": 465241, "sampleRate": 48000,
  "channels": 2, "aacFrames": 546, "cpuMsPerRun": 1.43, "wallMsPerRun": 1.32 }
```

Then proved the output is a real ADTS stream, not plausible-looking bytes, by handing it to
CoreAudio, which is not my code:

```
$ afinfo out.aac
File type ID:   adts
Data format:    2 ch, 48000 Hz, aac
audio packets:  546              # == aacFrames, nothing dropped

$ afconvert out.aac -d LEI16 -f WAVE out.wav && afinfo out.wav
estimated duration: 11.648000 sec   # == 546 * 1024 / 48000, exact
```

546 packets in, 546 out, decoded duration exactly `frames × 1024 / sampleRate`. **Lossless and
complete.** Node v22.22.3, macOS arm64; the code uses only `node:fs` and `Buffer`, nothing
platform-specific, so it runs unchanged in a Vercel Node function.

The load-bearing part is the ADTS header — the only place this silently goes wrong:

```js
const h = Buffer.alloc(7);
h[0] = 0xff; h[1] = 0xf1;                                     // syncword, MPEG-4, no CRC
h[2] = ((objType - 1) << 6) | (srIdx << 2) | ((ch >> 2) & 1); // profile, sample-rate idx, chan hi
h[3] = ((ch & 3) << 6) | ((frameLen >> 11) & 3);              // chan lo, frame length hi
h[4] = (frameLen >> 3) & 0xff;
h[5] = ((frameLen & 7) << 5) | 0x1f;
h[6] = 0xfc;
```

`objType`, `srIdx`, `ch` come from the 2-byte `AudioSpecificConfig`; `frameLen` is the sample size
**plus 7**. Get any wrong and decoders return silence rather than an error — which is why the
`afconvert` round-trip above is the acceptance test, not the packet count alone. `qa-reliability`
should golden-file it across a handful of MP4s.

Bundle cost: **zero**; the file is ~4 KB. If a hand-rolled parser is judged too much surface area,
`mp4box` is 2.26 MB unpacked and `@webav/mp4box.js` 945 KB (npm registry, read 2026-08-29) — both
fine on Vercel, both enormous next to 4 KB you can read in full during review.

**The one thing I could not verify: that Gemini accepts ADTS.** `audio/aac` is in the supported list
verbatim; ADTS is the standard framing for a bare `.aac` file; Google never writes "ADTS". That is a
one-call probe (§10.1) with a one-line fallback (§3.4).

### 3.3 Static ffmpeg or ffmpeg.wasm — reject

| | Value | Source |
|---|---|---|
| Hobby function size, uncompressed | **250 MB** | `vercel.com/docs/functions/limitations`, read 2026-08-29 |
| `@ffmpeg-installer/linux-x64@4.1.0` unpacked | **68.2 MB** | npm registry, read 2026-08-29 |
| `@ffmpeg/core@0.12.10` (WASM) unpacked | **64.7 MB** | npm registry, read 2026-08-29 |

68 MB fits inside 250 MB and is still the wrong trade against 4 KB and 1.43 ms:

- Next.js ignores `vercel.json`'s `includeFiles`; the binary must be dragged in via
  `outputFileTracingIncludes` — a build-config change on a path I do not own, and a failure class
  that appears only on Vercel, never locally.
- `ffmpeg-static` (48 KB on npm) downloads its ~78 MB binary in a `postinstall`, so the build gains a
  network dependency and stops being reproducible from a clean clone — directly against the thing I
  am here to protect.
- Cold start pages in 68 MB to run `ffmpeg -vn -acodec copy`, which is what §3.2 does in 1.43 ms.

**The only scenario that needs a codec is Surface B**, and §2.4 already ruled it out. That is not a
coincidence — it is the same finding twice.

### 3.4 The fallback if Gemini rejects ADTS

Ship the demuxer behind a narrow seam —
`extractAacFromMp4(bytes): { aac: Uint8Array, mimeType: 'audio/aac', durationSeconds: number }` — so
the fallback is changing one call site to pass the original MP4 as `mime_type: 'video/mp4'` with
`media_resolution: 'low'`.

Cost of that fallback, from `docs/video-understanding` (read 2026-08-29):

> Individual frames (sampled at 1 FPS): If `media_resolution` is set to low, frames are tokenized at
> **66 tokens per frame**. Otherwise, **258 tokens per frame**. Audio: **32 tokens per second**.

| Input form | 60 s | 120 s | vs audio-only |
|---|---|---|---|
| `video/mp4`, default resolution | 17,400 tok | 34,800 | **9.1×** |
| `video/mp4`, `media_resolution: low` | 5,880 tok | 11,760 | **3.1×** |
| `audio/aac` only | 1,920 tok | 3,840 | 1× |

So the escape hatch costs 3.1× the tokens, is still $0 on the free tier, and **spends the same one
RPD** — which is what actually binds. **We are never stuck.** But run §10.1 first; this should not be
discovered in production. (Note a second reason not to send video by default: a 120 s MP4 at ~22 MB
breaches the 20 MB inline ceiling and would force the Files API, where 1.9 MB of audio never will.)

---

## 4. Does Gemini take a URL, or must we send bytes?

**Bytes. VERIFIED, read 2026-08-29.** Three input paths, none of which is "here is an HTTPS URL":

| Path | Ceiling | Notes |
|---|---|---|
| **Inline base64** (`{"type":"audio","data":"<b64>","mime_type":"audio/aac"}`) | **< 20 MB total request** | "For small audio files under 20MB total request size" |
| **Files API** (`{"type":"audio","uri":"<files-api-uri>"}`) | 20 GB/project, 2 GB/file, **48 h retention**, free of charge | Upload first, then reference |
| **YouTube URL** (`{"type":"video","uri":"https://www.youtube.com/watch?v=..."}`) | — | The only external URL form, and it is YouTube-specific |

An arbitrary signed CDN URL in `uri`/`fileUri` is **UNAVAILABLE** — the field takes a Files-API URI
or a YouTube URL; third-party URLs return `Invalid or unsupported file uri`. **The download must
happen on our infrastructure.** Handing TikTok's signed URL to Google is not an option.

**Use inline, never the Files API.** 120 s of AAC is 1.9 MB raw / 2.6 MB base64 — an order of
magnitude under the ceiling. That removes an upload round trip, removes a 48-hour copy of a third
party's audio sitting in Google's storage, and removes the "does the upload consume a request?"
question entirely. (For the record: it would have been an extra HTTP request but not an extra *model*
request — `/v1beta/files` is documented as "available at no cost in all regions" with its own limits,
not the model's RPD. Moot, since we never call it.)

---

## 5. Cost

Free tier: **$0**, verbatim "Free of charge" for every model here
(`docs/pricing`, read 2026-08-29). Paid-tier numbers matter only as the price of the escape hatch.

| Step | Model | Tokens (60 s) | Paid cost |
|---|---|---|---|
| Transcribe | `gemini-3.5-flash-lite`, audio in | ~2,000 in / ~200 out | **$0.0011** |
| Extract | `gemini-3.5-flash-lite`, text in | ~5,200 in / 10–211 out (**measured**, n=9) | **$0.0021** |
| **Per import** | | | **~$0.0032** |

| Volume | Paid cost |
|---|---|
| 100 imports | **$0.32** |
| 1,000 imports | **$3.20** |

Extraction token counts are the *measured* ones from
`docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` §3.2, not estimates.

**Cheapest paid step up, if the owner ever needs more than ~250 imports/day.** From
`docs/rate-limits`, the tier table: **Tier 1 qualification is "Set up and link an active billing
account"** — no monthly minimum, no subscription, pay per token, with a $250 billing-tier cap and a
$10-per-10-minutes spend rate limit as a runaway guard. At $0.0032/import that is $3.20 for a
thousand imports. It also removes the free-tier training clause (§8.2). **But it requires adding a
payment method, which is the owner's decision every single time, and I am not proposing it — only
pricing it.**

---

## 6. Sync or async — synchronous, and it is not close

**Vercel Hobby's ceiling is 300 s**, verbatim from `docs/functions/limitations` (read 2026-08-29):
Hobby "300s default and maximum", memory "2 GB / 1 vCPU". The 10 s/60 s figures that circulate are
the pre-fluid-compute legacy limits, applying only to projects deployed before 2025-04-23 that are
not on fluid compute. `docs/07-import-execution-model.md` §2 already says this; still true.

| Stage | Time | Basis |
|---|---|---|
| Fetch MP4 (~11 MB) from TikTok CDN | 1–3 s | ASSUMED |
| Demux to ADTS | **0.0014 s** | **VERIFIED**, §3.2 |
| Base64 encode ~1 MB | ~0.005 s | ASSUMED |
| Transcription call, 60 s audio | **UNMEASURED** — assume 3–10 s | §10.2 |
| Extraction call | **p50 2.2 s; worst of 9 was 26.7 s** | VERIFIED in-repo |
| Places resolution | existing | — |
| **Total** | **p50 ~10 s; realistic p95 ~40 s** | |

**A 7.5× margin at p95.** Async buys nothing the ceiling does not already give. Do it synchronously
inside `POST /api/imports` (`L0-F6`): transcription becomes two more NDJSON stage events on the rail
the streaming route already emits. No queue, no worker, no cron, no second runtime. `docs/07` §3
rejected all of those on evidence and nothing here reopens it.

> **Proposed, for the orchestrator: raise the declared `maxDuration` on the import route from 60 to
> 180.** That 60 was chosen against an 8 s pipeline. We are adding a fetch and a second LLM call to a
> pipeline whose *existing* single LLM call has already been observed at 26.7 s once in nine samples.
> 60 is no longer an outer fence catching bugs; it is close enough to realistic p95 to truncate real
> imports. 180 is still 40% of the platform ceiling and still an explicit statement of intent in
> code. **Gate the exact number on §10.2** — if transcription lands at 3–5 s, 120 may be better.
> Measure, then pick. What I am confident of is that 60 is now too low.

### 6.1 Where the fetch runs

`docs/evidence/tiktok/06-datacenter-ip.md` establishes that TikTok oEmbed is **not** residential-IP
gated (byte-identical response from a US datacentre IP) but was **never tested from Vercel**, whose
egress is shared AWS space. That gap is unchanged and belongs to the acquisition task — and to a
different CDN host than oEmbed's.

For architecture it is moot: since Gemini cannot fetch a URL (§4), and a signed URL is short-lived
and may be bound to the requester, **obtain the URL, fetch, demux and transcribe in one invocation on
one host.** Splitting the fetch onto another provider to get different egress would mean shipping
megabytes between two clouds to buy an IP reputation we have no evidence we need.

---

## 7. Storage — discard the bytes

Supabase Free (`supabase.com/pricing`, read 2026-08-29): **500 MB database, 1 GB file storage, 5 GB
egress, 50 MB max upload**; projects suspended after a week of inactivity.

| At ~3 MB per MP4 | Storage | vs the 1 GB free cap |
|---|---|---|
| 100 imports | 300 MB | **30%** |
| 350 imports | 1.05 GB | **over** |
| 1,000 imports | 3 GB | **3× over** |

We breach the free storage cap around the 350th import, in a project whose *database* also lives
inside that plan's 500 MB. Keeping only the AAC (~1 MB) just moves the wall to ~1,000.

The three candidate reasons to keep them all fail:

- **Retry on failure** — better served by retrying inside the same invocation, while the signed URL
  is live and the bytes are in memory. Persisting helps only if the retry happens *after* the request
  ends, and §6 decided nothing happens after the request ends.
- **Re-transcribe when models improve** — that is a re-*import*, not a re-transcribe: by then the
  signed URL is dead and the post may be gone, so we would be re-transcribing a stale archive. It is
  also the strongest argument *against*: a permanent local archive of other people's TikTok audio is
  precisely the exposure `docs/evidence/extraction/…-2026-08-28.md` §1.2 flags under TikTok's ToS.
- **Debugging** — solved free by what follows.

**Keep instead, at a few hundred bytes per import:** transcript text, detected language, audio
duration, model and prompt version, and a **SHA-256 of the audio bytes**. The hash gives idempotency
("already transcribed these exact bytes") and proves which audio produced which transcript without
holding the audio — the project's own provenance rule satisfied more cheaply than by storage.

**Therefore drop from the stash:** the private `transcription-audio` bucket, migration `0017`'s
bucket creation and 10 MiB limit, the upload RLS policies `docs/12-audio-transcription.md` defers to
a later feature, and the `storage_bucket`/`storage_object_path` columns in `0016`. The
`transcription_jobs` table loses its purpose once the work is synchronous. What survives is a
nullable transcript + provenance on the existing source/import row — exact shape is
`supabase-database`'s call.

**Privacy.** Discarding is not merely cheaper, it is the materially better position: we would
otherwise hold audio of identifiable third parties who are not our users and have not consented. Not
storing it is the only version where there is nothing to leak, nothing to subject-access and nothing
to delete on request. It does **not** fix §8.2's remaining exposure; `security-privacy` still rules.

---

## 8. Free-tier headroom, and everything that could cost money

### 8.1 Headroom

**Vercel Hobby** — included per month: 1,000,000 invocations, 4 Active-CPU-hours, 360 GB-hours
provisioned memory, 100 GB Fast Data Transfer.

| | 100 imports | 1,000 imports | Used |
|---|---|---|---|
| Invocations | 100 | 1,000 | **0.1%** |
| Active CPU (~50 ms/import; demux is 1.4 ms) | 5 s | 50 s | **0.35%** |
| Provisioned memory (2 GB × ~30 s) | 1.7 GB-hr | 16.7 GB-hr | **4.6%** |
| Fast Data Transfer | ~0 | ~0 | **~0%** |

That last row is the one people get wrong. Verbatim from `vercel.com/docs/manage-cdn-usage` (read
2026-08-29): **"Fast Data Transfer: Data sent between the CDN and the visitor's device. Fast Origin
Transfer: Data sent between the CDN and Vercel Functions."** A function's outbound `fetch()` to a
third-party API is **neither**. **Downloading MP4s consumes no metered Vercel transfer allowance.**
Only our NDJSON response does, at single-digit KB.

Peak memory ~22 MB of MP4 + ~2 MB of AAC + base64, against 2 GB. Non-issue.

**Supabase Free** — untouched, because nothing is stored. It becomes a problem at ~350 imports if we
change our mind (§7).

**Gemini** — the binding constraint, and it is requests, not bytes: **~250 imports/day** at two calls
each, subject to §2.6.

### 8.2 Anything requiring the owner to spend money

**Today: nothing.** No new account, no new plan, no payment method, no recurring cost. Cloudflare
leaves the architecture entirely.

Four things that *could* become spend, none of which I have incurred or would:

1. **Sustained >250 imports/day** exhausts the call budget. Then it is Gemini Tier 1 (link a billing
   account; no monthly minimum) at ~$0.0032/import — $0.32 per 100. Small, not $0, and a
   payment-method decision, which is the owner's every time.
2. **Free-tier terms train on our inputs.** The pricing page's own row: *Used to improve our
   products — Free Tier: **Yes**, Paid Tier: No.* We would send third parties' TikTok audio to Google
   under terms permitting training on it. Not a cost, but it is a thing that gets *fixed* by paying,
   so it belongs here. **`security-privacy` + owner, not me.**
3. **Vercel Hobby is non-commercial/personal use only** under the fair-use guidelines. Correct for an
   academic project; named so nobody discovers it at submission.
4. **Vercel AI Gateway** is listed as a Live-API partner integration and is billable. Not used, and
   §2.4 means it never needs to be.

---

## 9. If a vendor returns transcript text, do we still need our own transcription step?

**No. Do not build it.**

If the acquisition route is a commercial vendor (Supadata, ScrapeCreators) that returns transcript
text, then every argument for our own audio step disappears at once: no media fetch, no demuxer, no
second Gemini call, no doubled RPD spend, no 22 MB buffers, no `maxDuration` increase, no ADTS probe,
no storage question and no privacy question about holding third parties' audio. The vendor's text
drops straight into the existing extraction call and **the entire delta is zero new moving parts**.
Building our own path alongside it would mean paying the vendor *and* spending Gemini calls *and*
acquiring media we would otherwise never touch — which is also the larger legal exposure, since
fetching and processing the media is a bigger step than receiving text. There are three futures where
the audio path comes back — vendor transcript quality is poor on Hebrew↔English code-switching,
vendor coverage misses posts, or we want independence from a single vendor — and all three are things
to **measure after a vendor transcript exists**, not reasons to build now. Note the standing
compliance caveat from `docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md`
§1.2: a vendor that scrapes on our behalf *relocates* the ToS breach rather than curing it, so the
vendor route is not automatically the safe one either — that is `security-privacy` and owner
territory. **My recommendation: keep this document, delete the Cloudflare pipeline, and build nothing
in the audio path until a vendor transcript has been measured and found wanting.** The demuxer is
4 KB and one day's work whenever it is needed.

---

## 10. Unverified items, and the exact experiments that would settle them

**None of these was run.** Each is specified below to the level the owner needs to approve or decline
it: endpoint, payload, call count, and which quota bucket it spends. **Total cost of everything I
would actually recommend running: 7 Gemini calls, all against the `gemini-3.5-flash-lite` bucket
(~500/day), plus one 60-second look at a web page that costs nothing.**

### 10.0 — `gemini-3.5-flash-lite`'s real free-tier RPM / TPM / RPD · **0 calls** · BLOCKING

Google no longer publishes free-tier numbers (§2.1); the owner's AI Studio page is the only source.

- **Experiment:** open `https://aistudio.google.com/rate-limit`, read the `Gemini 3.5 Flash-Lite`
  row, record RPM / TPM / RPD.
- **Cost: zero calls, zero dollars, ~60 seconds.** No API request of any kind.
- **Why it matters:** every ceiling in §2.5 scales linearly with it. If RPD comes back under ~200,
  §2.7 (collapsing the two calls into one) stops being an optimisation and becomes the design.
- **This is the highest value-per-cost item in the document and it costs nothing. Do this one first.**

### 10.1 — Does Gemini accept ADTS-framed AAC? · **1 call** · BLOCKING if we build the audio path

`audio/aac` is in the supported MIME list verbatim; the docs never write "ADTS". My demuxer emits
ADTS and I verified it against macOS CoreAudio (§3.2), but CoreAudio is not Google's decoder.

- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/interactions` (or the
  `generateContent` equivalent), `model: "gemini-3.5-flash-lite"`.
- **Payload:** one text part `"Transcribe the speech in this audio. Return only the transcript."`
  plus one audio part `{ type: "audio", data: "<base64 ADTS>", mime_type: "audio/aac" }`, using the
  ~465 KB ADTS file already produced in §3.2 from an MP4 that ships with macOS. **No TikTok content
  is involved.**
- **Cost: 1 call**, ~11,000 input tokens (11.6 s of audio at 32 tok/s, plus the instruction), against
  the **`gemini-3.5-flash-lite` bucket**. Free tier: $0. Paid: ~$0.004.
- **Pass:** any transcript comes back. **Fail:** a 400 on the MIME type or an empty transcript.
- **On failure:** §3.4's fallback — send the MP4 as `video/mp4` with `media_resolution: "low"`, 3.1×
  the tokens, same one RPD, one-line change. **We are not blocked either way**; this only decides
  which line of code ships.

### 10.2 — Transcription latency, p50/p95 · **6 calls** · gates the `maxDuration` number

§6's proposal to raise `maxDuration` from 60 to 180 rests on an assumed 3–10 s transcription.

- **Endpoint and payload:** as 10.1, on 3 clips of ~60 s and 3 of ~120 s; record wall-clock elapsed
  per call.
- **Cost: 6 calls**, ~2,000 and ~4,000 input tokens each, against the **`gemini-3.5-flash-lite`
  bucket**. Free tier: $0. Paid: ~$0.02 total.
- **Can share source material with 10.1**, so 10.1 + 10.2 is **7 calls total** — 1.4% of a 500/day
  budget.
- **Until it runs, `maxDuration` should not be changed.** The current 60 is too low on my analysis,
  but the replacement number should come from a measurement, not from me.

### 10.3 — Real TikTok MP4 sizes and audio bitrates · **0 calls** · not blocking

§3.1's MP4 column is ASSUMED.

- **Experiment:** none of its own. It falls out of the acquisition task for free — log `content-length`
  on the first media fetch and the demuxed AAC byte count beside it.
- **Cost: zero.** No Gemini involvement.
- Not blocking: it can only be wrong by a factor, and every limit in this document has 5×+ margin.

### 10.4 — Hebrew↔English transcription quality · **`ai-extraction`'s to scope** · not blocking

Whether general-purpose Flash-Lite transcribes code-switched Hebrew/English food TikToks well enough,
and whether `gemini-3.5-flash` is needed instead.

- **Not mine to specify** — it is a quality benchmark against the E7 corpus, and `ai-extraction` owns
  both the corpus and the grading. Flagged here because it decides whether the feature is worth
  shipping at all, and because it should be costed against the same 500/day budget.

### 10.5 — Can the Live surface ingest prerecorded audio faster than real time? · **~2 calls** · **RECOMMEND NOT RUNNING**

Specified because you asked, not because I think it should be spent.

- **Endpoint:** `wss://generativelanguage.googleapis.com/ws/…BidiGenerateContent?key=…`,
  `model: "gemini-3.5-transcribe-live"`, `responseModalities: ["TEXT"]`.
- **Payload:** decode a 90 s clip to 16 kHz mono 16-bit PCM, push the entire buffer in 100 ms chunks
  **with no delay between chunks**, send `audioStreamEnd`, and measure wall-clock time from first
  chunk to final `inputTranscription`. Run twice — once burst-fed, once paced at 1× — and compare
  both elapsed time and transcript text.
- **Cost:** ~2 sessions against the **`gemini-3.5-transcribe-live` bucket** (unlimited RPM/RPD, 20K
  TPM), so it does **not** touch the flash-lite budget. ~2,250 audio tokens each.
- **Extra cost that is not quota:** it needs an AAC→PCM decoder before it can run at all — i.e. the
  ffmpeg/WASM dependency §3.3 rejects — plus a throwaway WebSocket client. **That is real engineering
  time to test a surface we have already rejected.**
- **My recommendation: decline.** Even a perfect result cannot change §2.4's verdict, because Surface
  B is disqualified by its PCM-only input, its Preview status and the WebSocket-in-a-serverless-function
  shape — none of which is about timing. Run this only if the flash-lite quota (10.0) comes back so
  small that Surface B's unlimited RPD becomes the only viable path; at that point the decode cost is
  worth paying and this experiment becomes the gate.

### What I did not do, and would not have

I have no compliant source of TikTok bytes — the acquisition question is open, and
`docs/evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` says nobody should fetch
one yet. Every experiment above is therefore specified against material that already exists on this
machine or in the repo. Manufacturing a substitute TikTok would have tested my demuxer against my own
file rather than against the real input, which is worse than an honest gap.

---

## 11. Recommended architecture

**One process, one host, no new accounts.** Inside `POST /api/imports` — the Node-runtime streaming
route from `L0-F6`, `maxDuration` raised to 180 pending 10.2 — after oEmbed and whatever the
acquisition task lands as the media step:

> the route `fetch`es the MP4 into memory (~11 MB for 60 s) and emits a stage event; runs
> `extractAacFromMp4()` — ~120 lines, zero dependencies, **1.43 ms measured** — to lift the AAC track
> into an ADTS buffer (~1 MB); base64s it **inline** into a single `generateContent` call on
> **`gemini-3.5-flash-lite`** with a short transcription instruction (the Files API is never touched:
> the 20 MB inline ceiling is 10× our payload, and this is a different, far more generous quota
> bucket than either `gemini-3.5-transcribe` endpoint); emits another stage event; **drops both
> buffers on the floor**; concatenates the transcript with the caption as a `ContentPart`, exactly
> the seam `completedTranscriptContentExtractor()` in `stash@{3}` already assumed; and hands that to
> the existing `gemini-3.5-flash-lite` extraction call at its pinned `p11-s3` prompt — after which
> the pipeline is unchanged. Persisted: transcript text, detected language, audio duration, model and
> prompt version, and a SHA-256 of the audio bytes. Persisted media: **none.**

**Moving parts added: three.** The demuxer, one extra Gemini call on an existing client, one extra
pair of stage events.

**Moving parts removed versus the stash: eight.** Cloudflare account, Worker deployment, Cloudflare
Queue, Workers AI binding, a Supabase service-role key held outside our app, a private storage bucket
with its RLS policies, a job-state table with its claim/complete/requeue/fail RPCs, and a polling
endpoint.

**Free-tier position:** Vercel Hobby ≤5% of any allowance at 1,000 imports. Supabase Free untouched.
Gemini $0 to ~250 imports/day, ~500 if §2.7 collapses the two calls into one.

**Spend required to build this: none.**

**And per §9 — if a vendor returns transcript text, build none of it.**

---

## 12. What I established about the retired Cloudflare pipeline

Recorded because two of these are corrections rather than preferences, and one is a `$5/month` trap
we avoided.

1. **`ffmpeg.wasm` in a Worker was never possible.** Workers Free CPU time is **10 ms per
   invocation** and the Worker size limit is **3 MB compressed**
   (`developers.cloudflare.com/workers/platform/limits/`, read 2026-08-29). `@ffmpeg/core` is 64.7 MB
   unpacked. It misses the bundle limit by more than an order of magnitude and CPU by several. Not
   marginal — impossible.
2. **The stashed design's premise was half wrong.** `docs/12-audio-transcription.md` asserts "Workers
   AI and Queues remain on the Workers Free plan". Queues **is** free (10,000 operations/day, 24 h
   non-configurable retention) and Workers AI **is** free (10,000 Neurons/day; `whisper-large-v3-turbo`
   bills 46.63 neurons per audio minute → ~214 audio-minutes/day, ~107 two-minute clips). Both hold.
   But —
3. **Whisper's accepted containers are undocumented.** The model's input schema
   (`cloudflare/cloudflare-docs`, `whisper-large-v3-turbo.json`, read 2026-08-29) defines `audio` as
   only *"Base64 encoded value of the audio data"* or `{body, contentType}`. **No container list, no
   codec list, no max size, no max duration** — not on the model page, not in
   `workers-ai/platform/limits`. The stashed Worker hardcodes `contentType: 'audio/mpeg'` and a
   10 MiB cap; both are the author's invention, not a documented contract. That route therefore
   needed an MP3, which needs a **transcode**, not a demux — strictly more work than §3.2's 1.43 ms.
4. **A `$5/month` trap avoided.** Pushing the demux to a Cloudflare Container is Workers Paid only —
   "no free plan option", $5/month minimum (`developers.cloudflare.com/containers/pricing/`, read
   2026-08-29). The chosen design needs no Cloudflare account at all.

---

## 13. For the orchestrator

Three things I am proposing rather than doing, per my tier:

1. **Ask the owner for the `Gemini 3.5 Flash-Lite` quota row** (§2.6, §10.0). **Zero API calls.** One line off a page
   they already have open. Everything in §2.5 scales with it, and it is the cheapest evidence in this
   document.
2. **`maxDuration` 60 → 180** on the import route, plus the matching edits to
   `docs/07-import-execution-model.md` §2 and §4 (three places), `docs/technical-design.md:295` and
   `docs/implementation-plan.md:169`. **Gate on 10.2** — take the number from the measurement, not
   from me. Only if the audio path is built at all (§9).
3. **Retire `docs/12-audio-transcription.md` as the design of record.** It coherently describes an
   architecture the owner has ruled out, and §12 shows two of its factual claims do not hold. Left
   unmarked in `docs/`, it will mislead the next reader.

None of these is mine to apply. All three are diffs I can write out in full on request.
