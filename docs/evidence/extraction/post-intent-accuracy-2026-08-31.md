# E2-T3-EVAL — is the model any good at classifying post intent?

Date: **2026-08-31** · Harness: `tests/manual/intent-eval.manual.ts` · **VERIFIED, n=16**

> The `postIntent` field shipped in `ade521b` with its accuracy explicitly unmeasured. This closes
> that. Sixteen live `gemini-3.5-flash-lite` calls at `p15-s5`, run over the captions already
> committed in `oembed-set1-raw.json` — **no TikTok requests were made**, the captions were on disk.

## Result

**15 of 16 correct. 94%. Zero nulls** — the model answered every time, and every answer was one of
the three permitted values.

| expected | got |
|---|---|
| `place_recommendation` (8) | `place_recommendation` × 8 |
| `not_a_place` (5) | `not_a_place` × 5 |
| `place_question` (3) | `place_question` × 2, `place_recommendation` × 1 |

## The escalation gate — the number this field exists for

The whole purpose is deciding when it is worth spending money past the caption. Scored against E7's
`recoverable` class (a genuine recommendation whose venue is in the video but not the caption —
the only posts where escalating can find anything):

| Trigger | Fires | Useful | Precision | Recall |
|---|---|---|---|---|
| **Old** — the extractor returned zero candidates | 13 | 5/5 | **0.38** | 1.00 |
| **New** — zero candidates **and** `place_recommendation` | **6** | 5/5 | **0.83** | **1.00** |

**Seven of the eight wasted escalations disappear, and not one real one is lost.** The prior
investigation measured the old trigger at 0.33–0.57 precision and called it a coin flip; this
replaces it at 0.83 with full recall, for about ten output tokens and no extra request.

## The single miss, and it may be my label rather than the model

`@emshelx` — *"my Italian friend told me not to make a tiktok about this london restaurant"* —
was labelled `place_question` and the model said `place_recommendation`.

**The model has a case.** The creator *is* recommending a specific restaurant; they withhold the
name to drive comments. E7 filed it as `futile` because the answer is reachable nowhere, and I
carried that across — but `postIntent` asks *what is this post*, not *can we answer it*. On the
first question the model is arguably right and the label is wrong.

That distinction is worth keeping straight, because it bounds what this field can do: it separates
posts that are about places from posts that are not. It does **not** predict whether the answer is
obtainable, and a post that deliberately withholds a name will always read as a recommendation.

## Incidental, and worth recording

`@nom_life` returned **zero candidates**. In `RICH-EXT-1` §4 that same caption produced
`rawName: "tsukijifishmarket"` at `modelConfidence: 0.95` — a hashtag that became a confident
place. The hashtag-evidence gate has closed it on the one specimen that demonstrated it.

## Limits, stated

- **n=16, and the sample is not ours.** These URLs were found by web search and skew toward indexed,
  high-reach posts. `07-caption-content-scoring.md` says so about itself. Re-measure on the owner's
  own saved TikToks before treating 94% as the number.
- **One run, no repeats.** The model is not deterministic; this is not a stability measurement.
- **One provider, one model.** `gemini-3.5-flash-lite`. The production default is Anthropic, and no
  Anthropic key was present in this checkout, so the shipping path is unmeasured.
- The escalation table scores a gate that **is not built**. It shows what the field would buy, not
  what the product currently does.
