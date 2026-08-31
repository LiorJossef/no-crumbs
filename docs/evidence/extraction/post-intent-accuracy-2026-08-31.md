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

---

# Addendum — the end-to-end run, with real place matching

Second run, same day, after `GOOGLE_PLACES_API_KEY` turned out to be absent but
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` present — the factory's documented fallback. `PLACE_RESOLVER=google`
was set explicitly, because an unset `NEXT_PUBLIC_STAGE` fails safe to Overture and the local index
holds zero rows. **10 provider lookups spent** (~20 across both runs, against a 100/day quota).

## The headline: 27% reproduced through the shipped code

**3 of 16 posts yielded at least one matched place.** Against the 11 genuine recommendation posts in
this set, that is **3/11 = 27%** — the same figure `07-caption-content-scoring.md` reached by hand in
August, now produced by running the actual engine rather than by a human reading captions.

That matters more than the agreement itself. The 27% has been quoted all month as a hand-count on a
small sample. It is now a **measured property of the code as it stands**, on the same sample.

## Matching is not the bottleneck. Extraction is the whole gap.

| | |
|---|---|
| Candidates extracted, all 16 posts | **10** |
| Lookups that found nothing at all | **0** |
| Pre-selected outright (`resolved`) | 4 |
| Sent to the user as a shortlist (`ambiguous`) | **6** |

**Every single candidate matched something.** Not one `no_match`. The engine's failure is upstream:
on 13 of 16 posts it never produces a candidate to look up. Any effort spent on the matcher is
effort spent on the part that already works.

## But the bands are conservative, and that is a real finding

Six of ten matches ask the user to adjudicate, including cases that need no adjudication:

| Extracted | Matched to | Band |
|---|---|---|
| `Cafe Fiori` | `Cafe fiori` | shortlist — *differs only in casing* |
| `Nomena Roasters` | `Nomena` | shortlist |
| `La Nonna` | `La Nonna (Pasta fresca)` | shortlist |
| `Sycamore Restaurant` | `Sycamore Covent Garden` | shortlist |
| `Jones Family Kitchen` | `The Jones Family Kitchen` | shortlist — *differs by a leading "The"* |
| `Kiaans Tooting` | **`Kaosarn Tooting`** | shortlist — **wrong venue** |
| `MBER London` | `MBER` | resolved |
| `The Life Goddess` | `The Life Goddess` | resolved |
| `The Laughing Yak` | `The Laughing Yak` | resolved |
| `Tokii London` | `TOKii` | resolved |

Two things follow, and they pull in opposite directions:

- **The bands are costing us confirmed saves.** `Cafe Fiori` → `Cafe fiori` and
  `Jones Family Kitchen` → `The Jones Family Kitchen` are the same venue by any reading. Making the
  scorer case- and article-insensitive before it scores would move at least those two to
  pre-selected without touching the thresholds.
- **And the shortlist is earning its place.** `Kiaans Tooting` matched **`Kaosarn Tooting`** — a
  different restaurant with a similar-sounding name on the same street. Pre-selecting that would put
  a wrong pin on someone's map. The band that looks over-cautious on five rows is the only thing
  standing between the user and a confident error on the sixth.

**So the recommendation is narrow, not "raise the thresholds":** normalise casing and leading
articles *inside* the scorer, and leave the bands alone.

## One operational note

The sixteenth call returned **HTTP 429** from Gemini — the free tier's rate limit, reached because
adding a resolver round trip per candidate bunched the calls. It is a harness artefact, not a product
one: an import makes one extraction call. It does mean `@emshelx`'s intent was not re-measured in
this run, so the first run's result stands for that row.
