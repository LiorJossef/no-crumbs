# ACQ-3 — What "it worked" would mean for automatic transcription

**2026-08-29 · ai-extraction · investigation only, no `src/**` change.** The decision to pursue
automatic TikTok transcription was taken by the owner on 2026-08-29 and is **not re-litigated here**.
This document does one job: establish the acceptance bar, so that when the feature ships we can say
whether it worked.

Everything below is derived from data already in the repository, plus published ASR literature.
**No paid or quota-limited API was called: zero Gemini, zero Google Places, zero TikTok.** The only
network access was reading public documentation (an Interspeech 2025 paper, a FAccT 2024 paper,
Cloudflare's pricing page, Hugging Face model cards). Sources are named per claim, with the house
labels: **VERIFIED** (measured here or read from a primary source), **INFERRED** (a judgement from
recorded evidence, and labelled as one), **UNMEASURED** (nobody has established it and I am not going
to pretend otherwise).

> **The one sentence that matters most in this document.** The E7 labels **do not distinguish
> "the venue name is spoken in the audio" from "the venue name is shown as on-screen text."** E7
> records the disjunction — "spoken/on-screen" — and for three of the five posts it records no
> in-video observation at all. **No split between those two channels exists in this repository, and
> I have not invented one.** §1.3 gives a per-post *judgement* from format conventions and from the
> cover-frame OCR run; every cell in it is labelled as a judgement with its confidence, and none of
> it is a measurement. §1.4 is how to turn it into one, and it costs about ten minutes.

---

## 0. The three findings that change the shape of the question

1. **The "+5 max" figure is not a measurement of what audio carries.** It is a measurement of
   whether the *caption* names the venue, re-labelled ten days later into a claim about the video.
   Two of the five posts have documented in-video venue names; one of the five has **no in-video
   claim at all in the cited source**. My audio-specific estimate is **1–3 of 16, most likely 1–2**
   (§1, §2).
2. **E7 is the wrong denominator, and a better one is already on disk.**
   `docs/evidence/.local/corpus-100/oembed-results.json` holds **113 of the owner's own saved
   TikToks** with live captions. Its shape is nothing like E7's and nothing like the recognition
   corpus's. It is ~33% Hebrew, ~20% Spanish/Portuguese/Italian, and **46 of 113 are list-shaped
   captions with no venue name** — the exact population transcription is for. The transcription
   opportunity on the corpus that matters is far larger than "5 of 16"; the *ASR-specific* ceiling is
   still the open question (§2.4).
3. **A transcript converts none of the three "needless questions" we have today.** In all three, the
   deciding evidence is already written in the caption and is being discarded or mis-retrieved
   (§3). The enrichment case for transcripts is real but lives elsewhere — in the ~35 short hook
   captions where `whyGo` is null today, not in the resolver.

---

## 1. Is "+5" measured or estimated?

### 1.1 The provenance chain, traced

| Step | Document | What it says | What it was based on |
|---|---|---|---|
| 1 | `evidence/tiktok/07-caption-content-scoring.md` (2026-08-18) | Header: `Source: oembed-set1-raw.json`. Table column heading: **"Named place in caption?"** | The 16 oEmbed captions. The declared source is the caption file, not the videos |
| 2 | same file, §"The finding that matters" | "Two posts (#8, #12) demonstrably recommend a *specific named venue* (Simhovich Cafe; Nomena Café) that is **spoken/on-screen** in the video" | Someone watched **at least those two** — the names are not in the captions, so they came from somewhere. The channel is recorded as a **disjunction** |
| 3 | `docs/04-tiktok-feasibility.md` §"Level A is NOT achieved" | "…provably recommend a named venue (Simhovich Cafe; Nomena Café) that is **absent from the caption**" | The channel qualifier is dropped entirely |
| 4 | `tests/manual/caption-sufficiency-trigger.manual.ts` (2026-08-28) | `recoverable` = "place post, caption does not name the venue, **but the video demonstrably does**"; comment says the labels are "transcribed from the table in E7" | **They are not all transcribed from E7.** E7's table has no in-video claim for #13 at all (see below) |
| 5 | `evidence/extraction/transcription-and-media-feasibility-2026-08-28.md` §3 | "even a *perfect* trigger with a *perfect* escalator helps on **5 of 16 posts**" | The class table from step 4 |
| 6 | `docs/product-backlog-2026-08-29.md` §14 | "Perfect ASR over the audio, if it were ever permitted — **+5 max, the same five posts**" | Step 5, now attached to the word "ASR" |

**Verdict: the "+5" is a caption measurement wearing an audio claim's clothes.** The number 5 is real
— five posts are place recommendations whose caption names no venue, and that is VERIFIED from the
caption text. What is *not* measured, anywhere in this repository, is whether the audio track of any
of those five says the venue's name. Nobody transcribed anything. The feasibility report says so
itself, in its own "what I could not determine": *"E7 says the missing venue is 'on-screen and/or
spoken'. Neither stream is obtainable, so the split between them is unmeasurable and stays
unmeasurable."* That honesty was correct and then got lost two documents downstream.

### 1.2 One of the five is not supported by the source at all

E7's row 13 reads, in full:

```
| 13 | 7081307157660241157 | ysabellahazan | 83 | "Tel Aviv🇮🇱 >" | NO — city only |
```

No in-video claim. `#13` is also absent from E7's "the finding that matters" paragraph, which names
#8, #12, #16, #1 and #2 and nothing else. Its `recoverable` classification originates in the
2026-08-28 harness, whose own note for it is `'"Tel Aviv >" — city only'` — a verdict about the
caption, copied into a class defined as a verdict about the video. **The claim that a venue is
recoverable from post #13's video is unsourced.**

For completeness: post #16's `futile` note reads "name withheld in caption **AND speech**". E7 says
only "deliberately withheld". The "and speech" is an inference from the gimmick's logic — a
reasonable one, and still an inference.

### 1.3 Per-post breakdown of the five `recoverable` posts

**This table is INFERRED throughout and is not a measurement of anything.** The last column is my
judgement, with an explicit confidence, from three inputs: E7's hand labels, the cover-frame OCR run
(`evidence/tiktok/cover-frame-ocr-run-2026-08-28.json` — VERIFIED, n=15, one 429), and the
creator/format conventions of each genre. **I did not watch the videos and no recorded artefact in
this repository says what is on any of these audio tracks.** Read the confidence column as the load-
bearing part: where it says "low", the honest answer is *unmeasured*, and the row is there to say
which way I would bet and why, not to stand in for evidence.

| # | post | measured evidence we hold | format | audio carries the name? |
|---|---|---|---|---|
| **1** | `7245648559981350186` @briancantstopeating — "6 Must try spots in Tokyo Japan!" | Cover overlay text (VERIFIED, OCR): `6 Must Try Spots in Tokyo Japan`. `venuesOnScreen: []` on the cover | US food-vlogger countdown. This creator's genre is voiceover-narrated, one venue per beat | **LIKELY** — narrated countdowns say each name. But the names are Japanese venues spoken by an English speaker, so what ASR yields is a phonetic English rendering, not a searchable string (§4.3). Confidence: medium |
| **2** | `7220925199297039662` @nom_life — "our full list of #tokyorestaurant recs!" | Cover overlay text (VERIFIED, OCR): `everywhere to eat / everywhere to eat in tokyo / this is our full list of must try spots in Tokyo!`. `venuesOnScreen: []` | "Full list" rapid-cut montage. The genre is text-card-per-venue over trending audio far more often than narration | **UNCERTAIN, leaning on-screen.** Also note the caption's 28 hashtags *do* contain `#tsukijifishmarket` etc. — the list may be partly in the caption already, which is the defect in §5.2. Confidence: low |
| **8** | `7494360070369709354` @yallabikestlv — "The best coffee in Tel Aviv is only 9 shekels?!" | **The decisive case.** Cover-frame OCR returned `Pizza Lila` as an **overlay** (VERIFIED; the probe notes the one OCR success was an overlay and every false positive was background signage). E7's hand label says the venue is **Simhovich Cafe** | Short TLV hook video. Two different venue names are in play — the caption mentions pizza, the cover says Pizza Lila, E7 says Simhovich | **ON-SCREEN IS CONFIRMED; AUDIO IS UNCONFIRMED.** This post proves the channels are not interchangeable: at least one of its venues arrives as overlay text, which ASR by construction cannot see. Confidence: high on OCR, unknown on audio |
| **12** | `7347722826654305578` @alexandramoulavi — "coffee in tlv >" | Cover overlay text (VERIFIED, OCR): `perfection new coffee spot in tel aviv ☕️`, and the model **correctly returned no venue** because none was on the cover. E7 label: Nomena Café | Aesthetic B-roll cafe post, 73-char caption, Hebrew hashtags. This genre is overwhelmingly music + text overlays with no speech | **UNLIKELY.** The name most plausibly appears as a later text card, a cup sleeve or a shopfront. Confidence: medium-low |
| **13** | `7081307157660241157` @ysabellahazan — "Tel Aviv🇮🇱 >" | Cover overlay text (VERIFIED, OCR): `BEST COFFEE SHOPS IN TEL AVIV TO WORK AT 💻🤍🇮🇱🤓`. `venuesOnScreen: []` | Listicle title card, law-student lifestyle account | **UNLIKELY, and the `recoverable` label itself is unsourced (§1.2).** The title card makes it plausible venues appear later; the genre makes text cards the likely carrier. Confidence: low |

### 1.4 The cheapest measurement in this entire document

**Watch five videos, twice each: once muted, once with sound.** Record per post whether the venue
name arrives as speech, as on-screen text, as both, or as neither. That is five TikToks and roughly
ten minutes of human time. It is not automated retrieval, it breaches nothing, and it converts the
central number of this feature's business case from an inference into a measurement.

**Nothing else in this document is as cheap or as decisive.** It should happen before a line of code
is written, and §6 makes it gate 0.

---

## 2. The realistic ASR ceiling

### 2.1 The four channels, kept apart

| Channel | What ASR does with it | Present in E7's five? |
|---|---|---|
| **A. Venue named in speech** | Recovers it, subject to WER (§4) | Post #1 likely; #2 possible |
| **B. Venue as on-screen text only** (overlay card, sticker, title card) | **Recovers nothing.** This is a vision problem, not an audio one | #8 confirmed for at least one venue; #12 and #13 probable |
| **C. Venue inferable from spoken context but never named** ("this place in Florentin", "the one by the beach") | Recovers *words*, recovers no *name*. Worse than nothing if the extractor treats "this place in Florentin" as a candidate — the prompt already forbids exactly this shape ("a generic descriptor with no name"), and that rule now has to hold against 300 words of loose speech instead of 20 words of caption | Unknown; structurally common in hook videos |
| **D. Music only, no speech** | Recovers nothing, **and is the highest-risk input** — Whisper's documented failure mode is generating text during non-speech (§5.1) | Unknown; see §2.3 |

### 2.2 The number

**Estimated, not measured.** Reading §1.3 conservatively, and with the standing caveat that §1.3 is
itself a judgement:

| Estimate | Posts of 16 | Basis |
|---|---|---|
| **Floor** | **1** | Only #1 is better than a coin flip, and even that yields transliterated Japanese |
| **Most likely** | **1–2** | #1, plus one of {#2, #8} |
| **Optimistic** | **3** | #1, #2 and #8 all narrate |
| **The figure on record** | 5 | Requires all five to be narrated, which contradicts the OCR evidence for #8, #12 and #13 |

**So the realistic audio-only ceiling on E7 is 1–3 of 16, most likely 1–2 — versus a recorded "+5
max."** Caption-only is 3 of 16, so the honest ASR figure is **3 → 4 or 5 of 16**, not 3 → 8.

This does not say the feature is not worth building. It says **E7 is a bad instrument for sizing it**
(§2.4), and that if the recall case rests on E7, the case is roughly half of what is written down.

### 2.3 Music-only TikToks: how common? UNMEASURED, and cheaply measurable

**We hold no audio metadata whatsoever.** I re-checked `evidence/tiktok/oembed-set1-raw.json` and the
recognition cache: the oEmbed payload has no music field, no track name, no `has_original_sound`, no
duration. There is no signal in anything on disk from which to compute a music-only rate.

What I can say from format, as INFERRED and nothing more: the montage-with-text-cards genre — which
covers #2, #12 and #13 in E7, and a large slice of the owner's own corpus (`@telaviv_city`'s "These
Tel Avivian restaurants are iconic", `@sistersnacking`'s "THE 10 BEST RESTAURANTS IN BOSTON",
`@kelseyinlondon`'s numbered guides) — is conventionally trending-audio-over-B-roll with no speech.
If that convention holds, **music-only is plausibly the modal input on exactly the posts
transcription is meant to rescue**, which is the ugliest possible shape for this feature and the
single most important thing to check first. The five-video watch in §1.4 answers it for E7; a
25-post watch answers it for the corpus that matters.

### 2.4 The denominator problem — measured, and it is large

I measured caption shape across all three corpora on disk.

| Corpus | n | median caption | median words | carry 📍 | what it is |
|---|---|---|---|---|---|
| **E7** (`evidence/tiktok/oembed-set1-raw.json`) | 16 | **124 chars** | 20.5 | **1 of 16** | Found via web search in 2026-08. E7 says so and calls the bias unknown |
| **Recognition corpus** (`tests/manual/tiktok-recognition-corpus.json`) | 13 | **655 chars** | 118 | **13 of 13** | Owner-supplied, and **selected for adjudicability** — its own README calls it "caption-rich by construction" |
| **The owner's saved set** (`docs/evidence/.local/corpus-100/oembed-results.json`) | **113** | **232 chars** | — | **32 of 113 (28%)** | 113 live oEmbed fetches of the owner's real saved TikToks. **This is the product's actual input distribution and nothing has ever been measured on it** |

Shape of those 113, by a stated heuristic (pin/pushpin marker present; else list-shaped caption
matching a count word, "best/top/guide/list/these", or the Hebrew equivalents; else neither):

| class | n | what transcription would be for |
|---|---|---|
| carries 📍/📌 | 32 | caption likely already sufficient — escalation is waste |
| no pin, **list-shaped** | **46** | *"These Tel Avivian restaurants are iconic"*, *"THE TOP 15 NEW RESTAURANTS…"*, *"8 best bars & restaurants in Vienna"* — the venues are in the video. **This is the target population** |
| neither | 35 | *"One of my FAV restaurants in TLV"*, *"new spot in tel aviv 🥂"*, *"YUM YUM YUM!!!"*, *":)"* — single-venue hooks. Also the target population, and where `whyGo` is null today |

Language spread of the 113, by script and stopword detection: **50 English/other-Latin, 37 Hebrew, 22
Spanish/Portuguese/Italian, 2 Korean, 1 Arabic, 1 Chinese-mixed.** The he↔en scope note in the
project's memory describes the *priority*, not the input: a fifth of the real corpus is Romance
languages and this feature will meet them.

**Consequence for sizing.** On the corpus that matters, roughly **81 of 113 posts (72%) have a
caption with no venue name** — an opportunity roughly ten times E7's five posts in absolute terms.
Whether *audio* reaches them is exactly as unmeasured here as it is on E7, and the list-shaped 46 are
precisely the genre most likely to be text-card-over-music. **The upside is bigger than E7 says and
the channel risk is bigger too.** Both facts point at the same next action: watch a stratified sample
and label the channel.

---

## 3. Does a transcript help the posts that already work?

### 3.1 The three "needless questions" — none of them, and the reason is specific

Current Google-path numbers (`evidence/places/recognition-decisive-evidence-2026-08-28.md` §2,
regenerated in `recognition-scoreboard-run.json`): correct top-1 **15/16**, auto-resolution
**12/16**, wrong auto-match **0**, needless questions **3**. Those three, read from the run record
with their captions read from the local cache:

| candidate | why we asked | what would have answered it | would a transcript? |
|---|---|---|---|
| **מתחת לעץ** (@noyzo_eat) → `מתחת לעץ בן יהודה`, score 0.8735, `addressHint: null` | The provider's name carries a branch suffix the caption omits; `weak_name` holds it below the 0.92 gate | **The caption itself.** It ends `3 סניפים בת״א 📍 - נאת אפקה- נתן אלתרמן 13 … לבונטין 13 - בן יהודה 202` — all three branches, in writing. The extractor emitted `addressHint: null` and threw them away (failure class **C6**). With `בן יהודה 202` carried through, **F2 fires and this auto-accepts** | **No.** The evidence exists and is being discarded upstream. A transcript would be a second, noisier copy of something we already have and don't use |
| **טרטוריה אונה** (@thefoodnett) → `Trattoria Una @ בארט 2`, `addressHint: איינשטיין 69`, `addressScore 0` | Caption street ≠ provider street. The two points are **11 m apart** — one corner building addressed from two streets | Coordinate proximity overriding a street-name disagreement. A geometry fix in the scorer | **No.** The caption's address is correct and complete. Speech would repeat "רמת אביב", which the caption already says |
| **רוסטיקו** (@sapir_magal) → `רוסטיקו רוטשילד @ שדרות רוטשילד 15`, `addressHint: בזל 42` | Google returned the wrong branch of a two-branch venue | A **second Text Search including the address** — a *retrieval* fix, and it costs quota | **No.** The caption names both branches in writing (`כתובת: בזל 42… ויש מסעדה נוספת ברוטשילד 15`). The gap is in what we ask Google, not in what we know |

**0 of 3.** In every case the deciding fact is already written in the caption. That is not a
coincidence — it is what a corpus of 655-character, pin-bearing, address-carrying captions looks
like. The three remaining questions on this corpus are an extraction bug, a geometry bug and a
retrieval gap, and none of them is an information-availability problem.

The one extraction miss on the same corpus, **בראסרי 18** (@liran.rozen), is the same story: the
caption says `סיקרתי אותו כבר פעמיים: בראסרי 18 נפתחה…` and the model produced no candidate. A
transcript would offer a second chance at a name we already had — treating a prompt defect with an
ASR pipeline.

### 3.2 Where the enrichment case actually is, and how to cost it

The premise in the brief — a dish name, a neighbourhood, a "the one on Dizengoff" — is sound, but on
the **wrong corpus**. Read the recognition-corpus captions: they already carry dishes, prices, opening
hours, kosher certification, the chef's name, parking advice. @sapir_magal's Rustico caption alone
gives menu sections, happy-hour times, both addresses, delivery apps and event-room capacity in 780
characters. **There is nothing meaningful for a transcript to add there.**

The enrichment upside is in the **35 "neither" posts of the owner's 113** — `"One of my FAV
restaurants in TLV 🇮🇱💙"`, `"new spot in tel aviv 🥂"`, `":)"`. On those, `whyGo` is null by design
today (the prompt: *"Set whyGo to null whenever the caption gives nothing beyond the name, the city
and the category"*), and schema v2's own measurement found 7 of 20 saved places with no
`extracted_reason` at all. A transcript is the only source of a checkable detail for that class.

**But it is not free of the grounding problem.** `whyGo.groundedIn` earns its keep because it is
substring-tested against the caption in `extraction/grounding.ts`, and that test is the *entirety* of
the field's value — `groundedIn` is never persisted. Point that test at `caption + transcript` and
the gate still passes strings, but it no longer distinguishes *"the creator wrote this down"* from
*"an ASR model produced these tokens from audio"*. Those are different epistemic classes and the
schema's whole design (`CANDIDATE_FIELD_PROVENANCE`) exists to keep classes apart. §5.5 has the fix.

**Measurable claim to test, since I cannot measure it here:** on the 35 "neither" posts, does
transcript-enabled extraction raise the non-null `whyGo` rate, and do a human's blind pairwise
comparisons prefer the transcript-grounded sentence? That is a real, cheap, independent value case
for this feature, and §6 criterion **B2** makes it one.

---

## 4. Hebrew

### 4.1 The headline numbers, from a peer-reviewed source

Marmor et al., *Building an Accurate Open-Source Hebrew ASR System through Crowdsourcing*,
**Interspeech 2025**, Table 2 — WER (%), lower is better:

| model | ivrit-ai/eval-d1 (spontaneous, verbatim) | SASpeech (podcast) | FLEURS (read) | Common Voice (read) | KAN (broadcast) |
|---|---|---|---|---|---|
| ivrit.ai Whisper (fine-tuned from large-v2) | **8.0** | **6.2** | **24.1** | **20.7** | **11.3** |
| OpenAI Whisper large-v2 | 9.8 | 8.0 | 26.6 | 23.3 | 16.4 |
| OpenAI Whisper large-v3 | 9.6 | 9.4 | 26.2 | 23.1 | 13.4 |
| **OpenAI Whisper large-v3 Turbo** | **10.4** | **8.5** | **28.9** | **28.0** | **15.6** |

**Two things follow immediately.**

1. **`large-v3-turbo` is the worst Whisper variant on Hebrew on every one of the five datasets.**
   That is the exact model pinned in the orphaned migration
   `docs/evidence/db/orphans/transcription-0016_transcription_jobs.sql` — a `CHECK` constraint hard-codes
   `model = '@cf/openai/whisper-large-v3-turbo'`. If Hebrew matters, that constraint is the wrong
   default and should be a set, not a singleton. Cloudflare Workers AI does not host the ivrit.ai
   fine-tune, so "use the better model" is a hosting decision, not a config change.
2. **Hebrew WER ranges 8.5% to 28.9% depending on the audio.** The paper's own reading is that the
   spread is partly a scoring artefact (defective vs full spelling, digits vs words, disfluency
   handling all count as WER errors in Hebrew when they are not really errors), and partly real. For
   our purposes the honest range for "a Tel Aviv creator talking over restaurant noise" is the
   **spontaneous-speech end plus a noise penalty**, so call it **10–20% WER**, INFERRED.

### 4.2 Code-switching: Whisper is architecturally bad at it

Whisper commits to **one language token per 30-second window** — language identification runs on the
first 30 seconds and the decode is monolingual thereafter. That is a design property, not a bug, and
it is what Hebrew-English food TikToks violate constantly ("הבראנץ' פה insane, ה־matcha latte שלהם
הכי טוב בעיר"). Documented consequences, from the literature and from OpenAI's own issue tracker:

- With code-switched input, Whisper produced **no code-switched output in any tested configuration**;
  under some settings it silently switches from transcription to *translation* even when the task
  token says transcribe.
- Under a non-matching language token it outputs **transliterations** rather than the source words.
- Per-word language identification is not reliable; the model transcribes but does not label.

### 4.3 Why this is a serious risk *for the resolver specifically*, not just a quality nag

**A mangled name is worse than no name, and ASR produces mangled names in exactly the shape that
looks most legitimate.** The concrete documented example, from a Hebrew-English code-switch
fine-tuning writeup: stock Whisper renders spoken **`makolet`** (מכולת, "grocery") as **"Macaulay"**,
and **`teudat zehut`** as **"Theodette Sahoot"**. Those are not garbage strings that fail schema
validation. They are **capitalised, name-shaped, English proper nouns**, and our pipeline is built to
treat exactly that shape as a venue:

1. `filterPlausible` keeps it — it has a verbatim `evidence` quote, from the transcript.
2. The prompt tells the model to fill `identifiedName` and `nameVariants` from world knowledge, and
   to *"fix a misspelling or transliteration `rawName` cannot fix"* — so the model will confidently
   repair a hallucinated name into a real venue that was never mentioned.
3. Google Text Search returns a real, resolvable business.
4. `soleCandidateMeaning: 'exhaustive-search'` waives the null-margin block, which is worth **ten of
   the twelve** Google auto-accepts. A lone confident answer auto-accepts.

That is a complete, four-step path from "the creator said a Hebrew word" to "a wrong venue is saved
with no question asked." **Nothing currently in the pipeline can catch it**, because every gate we
have tests *provenance* (is this a quote from the source text?) and not *fidelity* (is the source
text what was actually said?). ASR breaks that assumption for the first time: until now, the source
text was literally the creator's own keystrokes.

Severity: **high, and it is the single strongest argument for the transcript-only banding rule in
§5.5.** It is also directly measurable — §6 criterion **E2**.

---

## 5. What could go wrong, ranked by likelihood of producing a *confidently wrong* place

The house rule is that an uncertain result beats a confidently wrong one. Ranked by (likelihood ×
undetectability-downstream), worst first.

### 5.1 ASR hallucination on music-only or silent audio — **rank 1 for undetectability**

Koenecke et al., *Careless Whisper: Speech-to-Text Hallucination Harms*, FAccT '24, over 13,140
audio segments: **~1% of transcriptions (1.4% of segments) contained entirely fabricated sentences**,
occurring specifically *"when no one is speaking in the input audio files"*, and correlating with
longer non-vocal durations. **38% of hallucinated transcriptions contained a categorised harm**, and
the taxonomy includes **made-up names** and **fabricated URLs** — the paper's own examples include an
invented website (`SnowBibbleDog.com`) and an invented person (`Dorothy Maxwell`). A December-2023
re-run showed real improvement but the authors' conclusion stands: Whisper *"still regularly and
reproducibly hallucinates."*

Now put that on a TikTok feed where a large fraction of the target posts are **B-roll over trending
audio with no speech at all** (§2.3). A hallucinated proper noun in a transcript is, to every gate we
own, a perfect citizen: it is genuinely present in the source text, so `evidence` passes, `groundedIn`
passes, and if it happens to name a real business it resolves cleanly and auto-accepts. This is
`#tsukijifishmarket` (§5.2) again, but generated rather than merely misread.

### 5.2 Mangled transliteration of a real spoken name — **rank 2, and rank 1 for likelihood on Hebrew**

§4.3 in full. `makolet` → "Macaulay". A name-shaped string that resolves to the wrong real venue.

### 5.3 Sponsor and ad reads — **rank 3**

A transcript of a sponsored TikTok contains a business name inside a sentence explicitly designed to
sound like a recommendation. This already exists in the caption corpus and we already mishandle its
cousin: E7 post #15's caption literally opens with the word `ad` and promotes `@firsttableuk`, and
the prompt has no rule about sponsors. In speech it gets worse — "this video is brought to you by X",
"use my code at Y", "download Z" — all with recommendation-shaped grammar around a real, resolvable
business.

### 5.4 Mentioned but not recommended — **rank 4**

Negation, comparison and abandoned plans ("we were going to go to X but it was closed so we ended up
at Y", "it's like Z but better", "don't bother with W"). A 20-word caption rarely contains these; 300
words of speech contain them constantly. The extractor's job becomes *intent* classification, which
it has never had to do, and the review card gives the user no way to see that we got the intent
backwards — the name and the category will look perfectly right.

### 5.5 Grounding dilution — **rank 5 by likelihood of a wrong place, rank 1 by likelihood of happening at all**

This is a code risk, not a model risk, and it is the default outcome if nobody names it.

Today, every provenance gate in the extraction domain resolves against one string:

- `plausibility.ts`: `evidenceFoundInCaption(caption, evidence)`, and a candidate whose evidence is
  not in the caption is **dropped**.
- `grounding.ts`: `whyGo.groundedIn` must be found in the caption or the whole `whyGo` is nulled;
  each `dishes` item must be found in the caption or it is dropped item-by-item.
- `isHashtagOnlyEvidence` splits the caption into `proseSegments` and hashtags to decide whether a
  candidate's only backing is a topic tag.

The one-line way to add a transcript is to concatenate it into `caption` and pass that. If that
happens, **all four gates silently widen at once**, the hashtag guard's notion of "prose" changes
meaning, and `caption_verbatim` — a provenance class the schema's own documentation defines as
*"copied out of the caption; a fabrication is a substring test, not a judgement call"* — quietly
starts admitting ASR output. The distinction between what the creator wrote and what a model heard
disappears with no test failing.

**Mitigation, and it is the first thing to build:**

1. **Never concatenate.** `ContentPart` already carries `kind: 'caption' | 'transcript' | 'onscreen-text'`
   and `origin` (`docs/07-import-execution-model.md`, the seam). Send both parts to the model in two
   separately-delimited blocks and keep them separate on the way back.
2. **Add `evidenceSource` to the candidate schema** — which part the `evidence` quote came from — and
   run each gate against *that* part. This is an `EXTRACTION_SCHEMA_VERSION` bump (3 → 4) and
   therefore a `PROMPT_VERSION` bump, which is correct: the cache key must change or v3 rows will be
   read back as v4. `src/domain/types.ts` belongs to `nextjs-architect`, so I would **propose** the
   `PlaceCandidate` field rather than add it.
3. **A transcript-only candidate never auto-accepts.** Cap it at `confirm`, so the user is always
   asked. One condition in the band policy, and it is the direct implementation of "an uncertain
   result beats a confidently wrong place." It also makes 5.1–5.4 survivable rather than silent: a
   hallucinated venue becomes a question the user declines, not a row in their library.
4. **Prompt rules, mirroring posture we already have and have measured.** The hashtag section already
   establishes the pattern — *"a tag whose name appears nowhere in the prose is a topic label until
   proven otherwise"* — and it works. The transcript equivalents:
   - *Corroboration is the strongest signal.* A name in **both** caption and transcript is the strong
     case; a name only in the transcript is the weak case and needs a clear statement that the
     speaker went there or recommends it.
   - *Sponsors are not recommendations.* A business named as a sponsor, a discount code, a link in
     bio, or an app being advertised is never a candidate.
   - *Intent, not mention.* A place named as a comparison, a rejection, an abandoned plan or someone
     else's rival is not a candidate.
   - *Speech is noisy.* If a name is garbled, partial, or you are reconstructing it phonetically, do
     not emit it. A missed venue is recoverable by the user; an invented one is not.
5. **Two mechanical pre-gates on the transcript, before the model ever sees it.** Both are free:
   - **Language disagreement.** Whisper returns a detected language (`transcription_jobs.detected_language`
     already exists in the orphaned migration). If it disagrees with the caption's dominant script,
     treat the transcript as absent — §4.2 says that is the configuration where Whisper transliterates
     or translates instead of transcribing.
   - **Degenerate output.** Discard a transcript that is under ~15 words, or whose repetition ratio is
     high (Whisper's documented loop failure), or that consists of the known boilerplate hallucinations.
     This is the cheap proxy for §5.1's music-only case.
6. **Captions and transcripts are equally hostile data.** A transcript is speech that was never typed,
   which makes it *more* likely to contain a spoken instruction, not less. `buildUserPrompt`'s
   per-call random delimiter must wrap **each** part with its own token, and the transcript must never
   be interpolated into `SYSTEM_PROMPT`. For the record: I scanned all 113 owner-corpus captions for
   injection-shaped content (`ignore previous`, `system prompt`, `you are now`, `<|`, `{{`, `<script`,
   `assistant:`) — **0 hits**. Nothing in this task was executed, and nothing from any fetched
   content should ever be.

---

## 6. The acceptance bar

### 6.0 The denominators, named first

An acceptance bar measured on the wrong corpus is worse than none. Three are required, and **two do
not exist yet.**

| id | corpus | n | status | what it is for |
|---|---|---|---|---|
| **D1** | The five E7 `recoverable` posts, **hand-watched**, each labelled `audio` / `on-screen` / `both` / `neither` | 5 | **DOES NOT EXIST — §1.4** | Falsifies or confirms the entire ASR recall premise, for ~10 minutes of human time |
| **D2** | The recognition corpus, `tests/manual/tiktok-recognition-corpus.json` | 13 URLs / 16 adjudicated candidates | exists, replayable offline at zero cost | **Regression only.** Its captions are pin-bearing and 655 chars — it can only show harm, never lift |
| **D3** | A stratified sample of the owner's 113 saved TikToks (`docs/evidence/.local/corpus-100/`), 25–30 posts, stratified by caption shape (pin 32 / list-shaped 46 / neither 35) **and** by language (he 37 / en 50 / other 26), each hand-labelled with its expected venues **and its audio channel** | 25–30 | **DOES NOT EXIST** | The only corpus whose distribution matches the product's real input. Every recall and precision number below is measured here |

**Hand-labelling D3 comes before any prompt tuning.** That is the standing rule for this domain and
it is doubly true here: a prompt tuned against unlabelled transcripts will be tuned to whatever the
ASR happened to produce.

### 6.1 Gate 0 — the premise check (before code)

**G0.** D1 exists and is committed. If **fewer than 2 of 5** carry the venue name in **audio**, the
"+5" claim is falsified as an ASR claim and the recall case must be re-argued on D3 alone before
engineering continues. This is a stop-and-rethink, not a stop-forever: §2.4 says D3's opportunity is
large regardless.

### 6.2 Recall — did it find places we could not find before?

**B1.** On D3, of the posts where caption-only extraction yields **zero candidates**, transcript-enabled
extraction yields **≥1 correct, human-adjudicated, resolvable venue on ≥20%**. Reported as a raw
fraction with its confidence interval, never as a bare percentage at n=30.

**B2.** On the "neither"-shaped posts of D3 (short single-venue hooks), the non-null `whyGo` rate
rises, **and** a human blind pairwise comparison prefers the transcript-grounded sentence in ≥60% of
pairs where both exist. This is the enrichment case from §3.2 and it is worth measuring separately —
it can pass while B1 fails, and it would still be a real product win.

**B3.** Report the channel split for every recovered venue: `audio` / `on-screen` / `both`. If most
recall comes from posts that D1/D3 labelled `on-screen`, then something other than ASR is doing the
work and the finding belongs in a different feature.

### 6.3 Precision — the hard gate

**C1. Zero wrong auto-accepts on D2 and D3.** Not "few". Zero. This is already asserted by
`recognition-failure-classes.manual.ts` and `benchmark-golden.test.ts` and it must stay asserted with
transcripts on. **Any breach is an immediate stop.**

**C2.** Of all candidates whose **only** evidence is the transcript, **≥70% adjudicated correct** to
ship. **50–70%** means keep it behind the flag. **<50%** means the evidence says stop — at that rate
the feature is manufacturing places, and every one it manufactures costs the user a decision.

**C3.** Zero transcript-derived candidates traceable to a **sponsor read** (§5.3) across D3.

**C4.** Zero transcript-derived candidates whose supporting speech is a **negation or comparison**
(§5.4) across D3.

**C5. Hallucination probe, and it needs its own fixtures.** Assemble ~10 known music-only or
speech-free TikToks. Required outcome: the transcript is discarded by the §5.5(5) pre-gates, **or**
the extractor returns zero candidates. **One fabricated place from silent audio is a stop**, because
it is the failure the whole product posture exists to prevent and it is silent by construction.

### 6.4 Regression — transcription must not make working posts worse

**R1. The caption path is bit-identical when the transcript is empty or discarded.** On D2 and on the
three E7 `sufficient` posts: with transcripts disabled, `rawName`, `addressHint`, `evidence`,
`categoryHint`, `tags`, `dishes` and `whyGo` are **unchanged** from the current p12-s3 run. This is
the cheapest and most important assertion in the set — it proves the change is additive.

**R2. On D2, with transcripts enabled, every headline number holds or improves:**

| metric | current (Google) | required |
|---|---|---|
| correct top-1 | 15/16 | ≥ 15/16 |
| auto-resolution | 12/16 | ≥ 12/16 |
| **wrong auto-match** | **0** | **= 0** |
| needless questions | 3 | ≤ 3 |
| extraction misses | 1 | ≤ 1 |
| golden-44 bands | 24 / 17 / 3 | unchanged |

**R3. The caption keeps precedence where it speaks.** On any post whose caption names a venue, the
transcript may not change `rawName` or `addressHint`. A creator's typed address outranks anything
heard in audio, always. Assert it as a test, not as a prompt instruction.

**R4. Counter regression.** `extraction.plausibility_dropped` and `extraction.grounding` counters on
the caption-only path do not rise. A rise means the gates changed meaning (§5.5), which is the
failure that will not otherwise announce itself.

**R5. Review-screen behaviour is verified in the running app**, at both breakpoints, on a real import
that produced a transcript-only candidate. Offline numbers are not evidence that a user sees the
right thing.

### 6.5 Hebrew — measured separately or not measured at all

**E1.** All of B1, C2 and C5 reported **split by language** (he / en / other) on D3. A single blended
number hides the failure mode §4 describes.

**E2. The transliteration probe.** Count transcript-derived `rawName` values that are phonetic
renderings rather than the venue's real written name (the `makolet` → "Macaulay" class). Adjudicated
by a Hebrew-reading human against the video. **>2 in 30 is a stop for Hebrew**, whatever the English
numbers say.

**E3.** If Hebrew transcript-only precision trails English by **more than 20 points**, ship
English-first with Hebrew behind the flag, and say so plainly in the UI rather than shipping a
quietly worse experience in the product's home language.

**E4.** Record the model actually used. `transcription_jobs`'s `CHECK` pins
`@cf/openai/whisper-large-v3-turbo`, which §4.1 shows is the **worst** Whisper variant on Hebrew on
all five published datasets. If that model ships, the constraint should be widened to a set and the
choice justified on measurement, not on it being the one Cloudflare hosts.

### 6.6 Cost and latency — reported, never assumed

**F1.** Report actual per-import cost: audio-minutes, Cloudflare neurons, and the delta in extractor
input tokens. Baselines on record: the caption call is **~4,880 input / 10–211 output tokens**, p50
≈ 2.2 s. Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` is **$0.0005 per audio-minute /
46.63 neurons per audio-minute**, with 10,000 neurons/day free (≈ 214 audio-minutes) and $0.011 per
1,000 neurons beyond. **ASR compute is not the cost** — a 60-second TikTok is ~$0.0005. The costs
that matter are the extra extractor tokens, the wall-clock, and the human review time spent on wrong
candidates.

**F2.** Report p50 and p95 wall-clock for the whole import with transcription on. If it exceeds the
streaming route's budget, it belongs in the async job the orphaned `transcription_jobs` migration was
designed for — with the import completing on caption alone and the transcript arriving as an update.

**F3.** State the media-acquisition mechanism and its compliance standing explicitly in the shipping
report. `transcription-and-media-feasibility-2026-08-28.md` §1 rates every known route **UNAVAILABLE**
on TikTok's ToS. Whatever route the reopened decision uses, it must be named, and its standing must
be labelled, in the same document as these numbers. **That is not my call and I am not making it** —
but the acceptance bar is incomplete without the row.

### 6.7 Honesty — non-negotiable, and cheap

**H1.** Any place whose name came only from speech is marked as such on the review card, in words a
person understands ("heard in the video, not written in the caption"), and it is never preselected.

**H2.** `model` and `promptVersion` are recorded on every extraction row, and the ASR model and its
detected language are recorded on every transcript. Without these, none of §6 is reproducible.

### 6.8 The three verdicts

| verdict | condition |
|---|---|
| **Ship it** | G0 passed; B1 ≥ 20%; C1 zero; C2 ≥ 70%; C3, C4, C5 clean; every R holds; E1–E4 reported with Hebrew within 20 points; F1–F3 reported |
| **Keep it behind the flag** | Recall passes but C2 lands 50–70%, **or** Hebrew trails by >20 points, **or** p95 latency blows the budget, **or** B3 shows most recall coming from `on-screen`-labelled posts. Ship it English-first, or with every transcript candidate forced to `confirm`, and say which |
| **The evidence says stop** | **Any** wrong auto-accept on D2/D3 (C1), **or** C2 < 50%, **or** C5 produces one fabricated place from silent audio, **or** G0 fails *and* D3 recall lift is under 5 points. In the last case the honest reading is that the venue names live in **on-screen text**, not in audio — and the effort should move to frame understanding, which is a different feature with a different compliance question |

---

## 7. What I could not establish

1. **Whether any of the five E7 `recoverable` posts says its venue name out loud.** Nobody has
   watched them for that question. Everything in §1.3 is a format-based judgement over cover-frame
   OCR, and I have labelled it as one. §1.4 is how to fix this for ten minutes of human time, and it
   is the highest-value unmeasured thing in this document.
2. **How common music-only TikToks are.** Zero audio metadata exists in anything on disk — oEmbed
   carries no music, duration or sound field, re-checked in `oembed-set1-raw.json` and in the
   recognition cache. Genuinely UNMEASURED.
3. **Real per-import cost of the extractor with a transcript attached.** Token counts for the
   caption-only call are VERIFIED; the delta is not, and Hebrew tokenises worse than English so it
   cannot be estimated from an English word count. The repo also has no verified per-token price for
   `gemini-3.5-flash-lite` — `costUsd` still logs as `0` with `costModel: "unmeasured"`, which is a
   separate open item.
4. **Whether the recognition corpus's three needless questions would survive the extraction fixes.**
   §3.1 says a transcript does not help them; it does **not** say F1/C6/geometry/retrieval fixes
   would not. Those are separate, cheaper, already-scoped pieces of work.
5. **Whether Hebrew ASR quality on *TikTok* audio resembles any published benchmark.** Every number in
   §4.1 comes from podcasts, read speech and broadcast news. Restaurant ambience, music beds,
   fast informal speech and a 15-second runtime are all off-distribution, and every one of them moves
   WER the wrong way. Treat 10–20% as a floor, not an estimate.
6. **Selection bias in the owner's 113.** They are saved TikToks, so they are already filtered by the
   owner's own taste and by whatever made them worth keeping. It is by far the best distribution we
   have and it is still not a random sample of what a future user would paste.
7. **The compliance question.** `transcription-and-media-feasibility-2026-08-28.md` rates every media
   route UNAVAILABLE against TikTok's ToS. The owner has reopened the feature; the route it will use
   was not stated to me and is not mine to choose. §6.6 F3 requires it to be named and labelled
   alongside the numbers — which is the most I can properly do about it here.
