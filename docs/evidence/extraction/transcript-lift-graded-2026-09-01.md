# The transcript path, graded against the corpus — 2026-09-01

**Commit**: `15ddb06`. Live run of `tests/manual/transcript-lift.manual.ts`: the real shipped
extractor, twice per post (caption, then caption + transcript), then the real resolver.
12 model calls, 8 lookups. Transcripts are TikTok's own auto-caption track, captured once.

**Totals: 9 candidates caption-only → 17 with the transcript. 6 of 8 new lookups resolved.**

That headline is the least interesting number here. Mapping each post to its corpus case is
what the run is actually worth, and it splits four ways.

## 1. The negative control holds — this is the most important result

`@emshelx`, `7541775954906041622`, class **`futile`**, true places **none**.

**502 words of speech → 0 candidates.** Caption-only also 0.

A `futile` post is one where no place is recoverable, and the failure mode everyone fears from
feeding an LLM half a kilobyte of restaurant chatter is that it invents somewhere. It did not.
This is the single strongest piece of evidence that the transcript path is safe to ship.

## 2. No regression where the caption already works

| post | class | caption only | + transcript |
|---|---|---|---|
| `@exploringlondon` | sufficient | 8 | 8 (identical list) |
| `@muchmorethanmatcha` | sufficient | 1 | 1 (identical list) |

The transcript adds no noise to posts that never needed it. It also adds no value there, which
is the argument for gating the escalation rather than always sending it.

## 3. The thesis works: 0 → N on the class it exists for

| post | class | caption only | + transcript |
|---|---|---|---|
| `@yallabikestlv` | recoverable | 0 | **1** — `Pita Lila` → `Pizza Lila` (shortlist) |
| `@gadderhq` | recoverable | 0 | **7** — 6 resolved |

`@gadderhq`'s seven are real London venues, and the resolver handled the mangling well:
`Ishbela`→`Ishbilia Restaurant`, `hoppers`→`Hoppers Soho`, `Tokyo ICCO`→`ICCO Pizza - Soho`,
`Bodega Negra`→`LA BODEGA NEGRA`. Two stayed unresolved (`Jinsei Yakitori`, `John Balcom`).

## 4. And yet `recoverable` still scores 0 — for a labelling reason, not a capability one

This is the finding that keeps the engine at B+, and it is worth stating precisely because the
obvious reading of §3 is wrong:

- **`@gadderhq` has an empty `places` label.** On a `futile` case empty means "none exist";
  on a **`recoverable`** case it means **unlabelled**. Seven plausible finds, nothing to grade
  them against. Unscoreable, not wrong.
- **`@yallabikestlv` found a place that is not its label.** The e7 label is `Simhovich`; the
  transcript yielded `Pita Lila` → `Pizza Lila`. The caption ("best coffee in Tel Aviv is only
  9 shekels?! They also have some of the best pizza…") mentions both a coffee and a pizza, so
  the post plausibly covers two venues and the label captures one. **I have not changed this
  label.** Deciding which is right needs the video or the owner, and editing ground truth to
  make a metric move is the one thing this corpus exists to prevent.

## What this changes about the grade

The cap on the engine's grade is **not** that transcripts are unproven. Within this run they are
demonstrably safe (§1), non-regressive (§2) and effective (§3). The cap is that the two posts
where they fire have no usable ground truth.

The highest-value action remains the owner's: labelling `@gadderhq`'s seven, and adjudicating
`@yallabikestlv`. One caveat worth flagging first — labelling `@gadderhq` **from its transcript**
and then grading the transcript-fed extractor against those labels measures extraction fidelity,
not real-world correctness. Both are worth knowing; they must not be reported as the same number.

## Standing limit

Acquisition, not analysis, is the bottleneck. TikTok refuses this machine's IP after ~35 requests
— verified four times, and still refused with 456 valid cookies, so it is address- or
fingerprint-level rather than auth. The six transcripts here were captured before that.
`scripts/fetch-transcripts.sh` exists so the owner runs it under their own session.
The yt-dlp route used for these six is a **measurement-only** mechanism and must be disclosed as
such in the submission; `RICH-EXT-1`'s conclusion still governs anything that ships.
