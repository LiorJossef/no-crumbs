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

---

# Addendum 2 — why six of ten need a human, and why my own recommendation was wrong

Third run, same ten candidates, now printing score, margin and the top three. **Zero new lookups**
where the cache served them.

| candidate | matched to | band | score | margin |
|---|---|---|---|---|
| MBER London | MBER | **preselect** | 1.000 | null |
| The Life Goddess | The Life Goddess | **preselect** | 1.000 | 0.120 |
| The Laughing Yak | The Laughing Yak | **preselect** | 1.000 | null |
| Tokii London | TOKii | **preselect** | 1.000 | null |
| Jones Family Kitchen | The Jones Family Kitchen | confirm | 0.908 | null |
| Kiaans Tooting | **Kaosarn Tooting** | confirm | 0.887 | 0.088 |
| La Nonna | La Nonna (Pasta fresca) | confirm | 0.864 | null |
| Nomena Roasters | Nomena | confirm | 0.857 | null |
| Sycamore Restaurant | Sycamore Covent Garden | confirm | 0.857 | null |
| Cafe Fiori | Cafe fiori | confirm | **0.800** | 0.168 |

## Three findings, and the first two kill my own proposal

**1. Every one of the six fails the *score* gate, not the margin gate.** I recommended normalising
casing and leading articles and leaving the thresholds alone. `normalise()` **already lowercases** —
`Cafe Fiori` and `Cafe fiori` produce byte-identical output. Casing was never the cause, and margin
is comfortable everywhere it exists (0.088–0.168 against a 0.05 gate).

**2. The score ranks a wrong venue above a right one.** `Kiaans Tooting` matched **`Kaosarn
Tooting`** — a different restaurant — at **0.887**, while the correct `Cafe fiori` sits at **0.800**.
So lowering the score gate promotes the wrong answer *before* it promotes several right ones. The
band is not over-cautious; the score carries no signal that separates these two cases, and any
threshold move trades a real save for a wrong pin. **Leave the thresholds alone** — that half of my
recommendation survives, for a reason I had not found.

**3. The real defect: supplying a correct address makes the result worse.**

`address.weight` is **0.2**, and `Cafe Fiori` scored **exactly 0.800**. That is `0.8 × 1.000 + 0.2 ×
0.000` — a **perfect** name match, an address comparison that scored **zero**, and a 20% weight
dragging it under the 0.92 gate.

The caption is `Cafe Fiori 📍 Yom Tov St 20, Tel Aviv-Yafo`. It is the *ideal* caption: name, street,
city, all present. `07-caption-content-scoring.md` files it as one of only three `sufficient` posts
in the whole corpus. **The one post that gives us everything is demoted to a manual confirmation
because it gave us the address.** A caption that had omitted the street would have scored 1.000 and
pre-selected.

That is worth stating plainly: on this evidence the address arm is not corroborating, it is
penalising, and it penalises hardest exactly where the caption is richest.

## What this means for the unplaced-mentions surface

Asked by the session building `place_mentions`: **how many of the ten would become
`match_too_weak`?** On these thresholds, **zero** — every candidate cleared `confirmScore`, so all
six shortlists reach the user as a choice rather than as a kept-for-later mention. The surface is
therefore *not* currently being fed our own near-misses from this sample.

But the margin is thin and the direction is the wrong one: `Cafe Fiori` at 0.800 is the closest to
the `no_match` floor, and it is a **correct** match held down by the address arm. **If the address
penalty is left alone and thresholds ever rise, the first rows to fall into `match_too_weak` are the
correct ones with the richest captions.** That is the failure mode worth designing against.

## Next, and it is one experiment rather than a change

Establish why the address comparison scored 0 on `Yom Tov St 20` before touching a weight. Either
Google returns a form our parser cannot read, or the comparison is right and the venue's registered
address genuinely differs. **Those two have opposite fixes**, and the ten candidates here are enough
to tell them apart.

---

# Addendum 3 — the wrong option is gone

A scorer guard, `nameIsEstablished`, landed after the diagnosis above. It asks one question the
existing score cannot: **was the weakest distinctive token of the caption's name actually found in
this candidate**, or did an average carry it?

## Why a minimum, when `tokenCoverage` is a mean

`streetSimilarity` in the same file is already a minimum, and its docblock says why — a mean lets one
matching word carry a wrong street. Names have the identical failure, and it was measured on a real
import: `Kiaans Tooting` matched **`Kaosarn Tooting`** at **0.887**, because `tooting` covers at
1.000 and averages `kiaans`/`kaosarn` up. That score sat *above* four correct matches in the same
run (0.857–0.864), so **no threshold could separate them** — the wrong venue reached the user as an
option to tap.

The guard changes no score. It caps a band, and only downward.

## What it demotes, across everything we hold

| set | rows | demoted | correct matches lost |
|---|---|---|---|
| 44-case golden benchmark | 44 | **2** | **0** |
| Live end-to-end run | 10 | **1** | **0** |

All three are wrong matches:

- **`Kiaans Tooting` → `Kaosarn Tooting`** — a different restaurant on the same street.
- **`TLV-08`**, `אורנה ואלה` → `אולמי קונקורד` — a venue the index does not contain at all, so the
  shortlist was offering one of two wrong rows.
- **`NEG-02`**, `best coffee ever` → `Bees Coffee` — a caption naming **no venue**, which was still
  being offered a specific one. The ranking was never wrong here; the *offer* was.

**Preselect is untouched at 24 on the golden set and 4 on the live run.** The guard demoted nothing
that was being auto-accepted, which is the property that makes it safe to add this late.

## The one case that nearly broke it, and why the implementation is what it is

A bare Jaro-Winkler minimum demotes `Cafe Xoho` → `CafeXoho` — **the same venue, space removed** — at
0.458 on its only distinctive token. That case is in the golden set. `nameScore` already handles it
with a substring credit of 0.97, and the guard mirrors that loop exactly rather than reimplementing
a simpler one. Without the credit the guard would have cost a correct high-confidence match; with it,
that row scores 0.97 and is untouched. **This is why the function may not be "simplified" later.**

## The live corpus, before and after

| | before | after |
|---|---|---|
| Pre-selected | 4 | 4 |
| Shortlist | 6 — **one a wrong venue** | **5, all correct** |
| No match | 0 | 1 |

The wrong option the engine offered on this corpus is gone, and it becomes a kept mention rather
than a silent drop — which is what `place_mentions` exists for.

---

# Addendum 4 — a corroborating address no longer subtracts

The last defect from Addendum 2, fixed. `compareAddress` now reports **whether the comparison
settled anything**, and only a decisive one may move the score.

- **Decisive**: matched street with equal house numbers (corroboration), a different street, or two
  different house numbers (both contradictions). The blend keeps hearing all three.
- **Indecisive**: the street matched and one side had no house number. `בזל` matches every address
  on Basel Street — that is not weak evidence for a venue, it is no evidence either way. It now
  leaves the base score alone instead of subtracting from it.

`addressScore` still returns its 0.5 to F2, so *"somewhere on Basel Street is not an
identification"* still holds and the three tests pinning that veto pass untouched. **The two callers
wanted different things from one comparison; conflating them was the bug.**

## The corpus, start to finish

| | at session start | now |
|---|---|---|
| Candidates extracted | 10 | 10 |
| **Pre-selected** | **4** | **5** |
| Shortlist | 6 — one a wrong venue | **4, all correct** |
| No match | 0 | 1 — the wrong venue |
| **Wrong options offered to the user** | **1** | **0** |

Two changes did it, and neither moved a threshold:

1. `nameIsEstablished` — `Kiaans Tooting` -> `Kaosarn Tooting` demoted to `no_match`.
2. `compareAddress` — `Nomena Roasters` promoted 0.857 -> 0.946 -> `preselect`, because
   `Allenby Street` against `Allenby Street 54` is corroboration and was being scored as a penalty.

**Every candidate the engine extracts from these sixteen links now either auto-accepts correctly,
offers a correct choice, or honestly declines.**

## What did not move, and will not without new input

**3 of 16 posts yield a place.** Extraction is the ceiling and it is a property of the content:
13 posts name no venue in their caption, and on 5 of those the venue is spoken or on screen. No
scorer change reaches them. That gap needs a signal we do not currently read.

---

# Addendum 5 — a prompt fix found by the owner's own link, and the gate's real ceiling

## The miss

The owner supplied a live link — `@sivanskitchen`, Tel Aviv — and the engine returned **zero
candidates** with `postIntent = place_question`. The caption:

> *"The best place in all of Tel Aviv 🇮🇱 Come hungry with money to spend, and enjoy every bite 😋
> Should we tour Shuk Machne Yehuda in Jerusalem? Let me know in the comments below ⬇️
> #sivanskitchen #shukhacarmel #telaviv"*

That is a **recommendation**. The model matched the question-post pattern on the trailing sentence —
but that question is about **a different city, for a future video**. The existing rule covered a post
that *"both recommends and asks"* about the same thing; it did not cover asking about what to cover
next.

Expensive, because `place_question` is precisely what tells the engine **not to look any harder** at
a post whose venue is in the video.

## The fix, and what it recovered

One rule added at `p16`, with the owner's caption as the worked example: *judge the post by what it
is showing you, not by whether its last sentence has a question mark.*

| | before (`p15`) | after (`p16`) |
|---|---|---|
| `postIntent` | `place_question` | **`place_recommendation`** |
| candidates | **0** | **1 — `Shuk HaCarmel`** |

Re-run over the whole corpus, `postIntent` accuracy is unchanged at **9/10** and no row regressed.
So the rule bought a real recovery on a real link and cost nothing measurable.

## The finding that matters more: the gate has a ceiling no threshold can lift

Re-labelling `@gadderhq` from `futile` to `recoverable` — justified by its transcript, where the
creator names eight restaurants aloud — exposed something the earlier numbers hid.

Its caption is *"What's the best hidden gem restaurant in London? 💎 Comment below"*. The model
answers `place_question`, and **the model is right about the caption.** The class is `recoverable`,
and that is right about the **post**. Both are correct and they disagree, because:

> **`postIntent` describes the caption. The class describes the post.**

That distinction was invisible while the only `recoverable` posts in the sample had
recommendation-shaped captions. The consequence is a hard limit, now measured: the escalation gate's
recall falls from **1.00 to 0.75** once the corpus contains a recoverable post with a question-shaped
caption, and **no threshold recovers it** — the only signal the gate has says *question*, truthfully.

**A caption-only gate cannot reach a post that withholds its recommendation until the audio.** That
is not a tuning problem, and it is the clearest statement yet of why reading past the caption is the
only remaining lever.
