# How stable is extraction output? — measured, 2026-08-28

> Harness: `tests/manual/extraction-determinism.manual.ts`. Machine record:
> `docs/evidence/.local/extraction-determinism-run.json` (gitignored — it holds per-run
> caption-derived model output). Extractor `2026-08-gemini-gemini-3.5-flash-lite`, prompt `p11-s3`,
> `temperature: 0`. **No prompt or model change was made for this measurement.**

## 0. What this was, and what it found instead

`tiktok-recognition.manual.ts` records exactly one `extraction_miss` on the 13-URL corpus: the
caption at `https://vt.tiktok.com/ZSVprTkwJ/` names **בראסרי 18** and the run returned zero
candidates. Re-running the same caption gave `[]` once and the right candidate twice, so the
question put to this task was the general one — *how stable is this pipeline's output at all* — and
whether a retry on an empty result is worth a second model call.

**The answer to the general question is: the model is far more stable than the repo assumed, and
every empty result measured here was our own code, not the model.**

All four empty results across 79 sampled runs were `filterPlausible` dropping a correct,
fully-addressed candidate on `evidence_not_in_caption`. The model named the venue every time. It is
fixed deterministically in `src/domain/extraction/plausibility.ts`; §5 rules against the retry.

## 1. Sample size and cost

| | |
|---|---|
| Captions | 13 (the recognition corpus, read from disk — **no oEmbed traffic**) |
| Runs in the main grid | 5 per caption = **65** |
| Targeted follow-up probes | `7416278674976034056` ×8, `7548837331906645256` ×6 = **14** |
| **Total samples** | **79** |
| **Gemini calls actually spent** | **90** |
| — of which produced a sample | 79 |
| — of which failed in transport | 11, all `EXTRACTOR_UNAVAILABLE` at ~19 calls/min. The harness now spaces calls 4.5 s apart and retries transport failures; the retried grid came back clean. |
| Budget context | 500/day, shared. 18% of one day. |

Re-running the harness now costs **zero** calls: every run is on disk in
`docs/evidence/.local/extraction-determinism/` and is replayed unless `DETERMINISM_REFRESH=1`.

**Per-import token cost, measured:** ≈5 169 input + ≈470 output tokens, one call, median latency
≈2.5 s. Input dominates because the prompt is ~5 k tokens and the caption is 70–960 characters, so
input is close to constant per import regardless of caption length. No verified per-token price for
this model is on record in this repo, so no dollar figure is quoted; **the binding constraint is
calls/day, not tokens**, which is what makes §5's ruling turn on call count.

**This is 13 captions, all Tel Aviv, all naming at least one real venue.** It is not a sample of
what users actually paste. See §6 for what it therefore cannot say.

## 2. Empty-vs-non-empty

| | |
|---|---|
| Empty results, main grid | **1 / 65 runs (1.5%)** |
| Captions with ≥1 empty run, main grid | 1 / 13 |
| Captions always empty | 0 / 13 |
| Empty results including the targeted probes | **4 / 79** |
| **Empty because the model returned nothing** | **0 / 79** |
| Empty because `filterPlausible` dropped every candidate | **4 / 4** |

Per caption, counting the probes:

| Caption | Empty runs | Cause |
|---|---|---|
| `7548837331906645256` (בראסרי 18 — the recorded `extraction_miss`) | 2 / 11 | `evidence_not_in_caption` |
| `7416278674976034056` (רוסטיקו) | 2 / 13 | `evidence_not_in_caption` |
| the other 11 captions | 0 / 55 | — |

### 2.1 The cause, exactly

The harness wraps `globalThis.fetch` before the factory builds the adapter, so it keeps the **raw
model response** alongside each run. That is what made the diagnosis possible: `PlaceExtractor`
returns post-`postProcessCandidates` candidates, so a returned `[]` is otherwise ambiguous between
the model declining and our gate dropping.

`filterPlausible` tested `caption.includes(candidate.evidence)` — byte-exact. Two benign quoting
habits break it:

1. **A collapsed double space.** The caption reads `…עבר מרמת אביב␣␣ללב העיר בלבונטין 19…`; the
   model quoted it with one space. Byte-diffed: that single space is the *only* difference across a
   93-character quote. The candidate carried `rawName: "בראסרי 18"` and `addressHint: "לבונטין 19"`
   — correct venue, correct street, correct house number — and the user was shown "no places found".
2. **An elided quote.** For רוסטיקו the model wrote
   `מסעדת רוסטיקו 🍽️ במקום תמצאו תפריט מגוון**...** כתובת: בזל 42, תל אביב 📍 ויש מסעדה נוספת ברוטשילד 15`
   — two real caption fragments joined by an ellipsis the model added itself.

Both are the model behaving well: it quoted the caption and it tidied the quote. Neither is
fabrication, and the gate has no way to tell fabrication from tidying while it compares bytes.

**Fixed** in `src/domain/extraction/plausibility.ts` (`evidenceFoundInCaption`): whitespace runs
collapse on both sides, and an elision splits the quote into segments that must each be ≥12
characters and appear in the caption **in order, non-overlapping**. Case, accents, punctuation and
emoji all remain significant — this stops well short of `grounding.ts`'s `normalise()` tolerance,
because a failed `evidence` test drops a whole candidate and that consequence is what buys the
strictness.

Verified by replaying every captured raw response through the new gate: **3 rescued, 0 still
dropped, 0 previously-passing quotes changed** (the fourth empty predates raw capture but carries
the identical `evidence_not_in_caption: 1` signature). Unit tests in
`tests/unit/extraction/plausibility.test.ts` use the real strings, including the negative cases:
wrong order, short segments, one real segment plus one invented one.

### 2.2 A related defect found on the way, not fixed here

The רוסטיקו caption names **two branches** — `בזל 42` and `רוטשילד 15`. In 3 of 13 runs the model
correctly emitted both, and `filterPlausible`'s `duplicate` rule — keyed on normalised `rawName`
alone, ignoring `addressHint` — silently dropped the second. One venue at two addresses collapses to
one candidate, non-deterministically, depending on whether the model felt like listing both. Not
touched under this task; recorded as its own defect.

## 3. Candidate-set instability

Signature = the set of `normalise(rawName)` a run produced.

| | |
|---|---|
| Captions whose set was identical across all 5 runs | **10 / 13 (77%)** |
| Captions whose set varied | 3 / 13 |

The three, in ascending severity:

| Caption | Sets seen | What varied |
|---|---|---|
| `7416278674976034056` | `{רוסטיקו}` ×4, `{∅}` ×1 | the §2.1 gate bug |
| `7606612154493488402` (5 venues in one post) | `{eats בית חנה \| קפה אירופה \| האחים \| בל עמי \| palette bistro}` ×4, same with `eats` for `eats בית חנה` ×1 | one name truncated; the set is otherwise identical, and all five venues are found every run |
| `7647572114941201671` (Gelalucci) | `{ג לאטו לוצ י}` ×2, `{gelalucci}` ×2, `{ג׳לאטו איטלקי}` ×1 | **three different names for one venue, none in a majority** |

The Gelalucci case is the important one. The caption names the venue only through an `@gelalucci`
handle and a Hebrew description. Across 5 runs the model called it the transliterated Hebrew name,
the Latin handle, and — once — `ג׳לאטו איטלקי` ("Italian gelato"), which is a *description*, not a
name. **`rawName` for this caption is a coin flip between three values.**

## 4. Field instability on a stable candidate

Conditioned on the same `normalise(rawName)` appearing in ≥2 runs of the same caption — 18 such
groups in the grid. "Unstable" = the field took more than one value across those runs.

| Field | Unstable / groups | Read |
|---|---|---|
| `cityHint` | 1 / 18 | **identity-grade.** The one miss is `תל אביב` vs `ת״א`. |
| `categoryHint` | 2 / 18 | identity-grade in practice (`shop`↔`cafe`, `bar`↔`restaurant`) |
| `areaHint` | 2 / 18 | identity-grade; both misses are a longer vs shorter form of the same area |
| `identifiedName` | 4 / 18 | usable; but one miss is a **typo** — `בראסרי 18` became `ברארי 18` |
| `addressHint` | 4 / 18 | **all four are the same variation**: `לבונטין 19` vs `לבונטין 19, תל אביב`. The street and number never changed. Normalise the city suffix off and this is 18/18 stable. |
| `dishes` | 8 / 18 | not identity |
| `modelConfidence` | 11 / 18 | not identity (0.90–1.00, and it reports 0.99 on the coordinates in §4.1) |
| `nameVariants` | 12 / 18 | not identity — by design, it is a query hint |
| `evidence` | 17 / 18 | not identity — the quote's extent moves constantly (`📍קפה אירופה` vs `קפה אירופה`) |
| `tags` | **18 / 18** | **never stable, in any group** |
| `coordinates` | 15 / 16 | see §4.1 |

**Ruling on identity.** Use `addressHint` (street + number, city suffix stripped) and `cityHint`;
they are the most stable things the extractor produces, and they are also script-neutral, which
`rawName` is not. Do **not** key identity on `rawName` alone: §3 shows it varying across three
values for one venue. `current-state.md` §7's "`rawName` decides identity; `identifiedName` decides
display" is right that `identifiedName` is worse, but it overstates how good `rawName` is — it is
stable for 10 of 13 captions, not for all of them.

### 4.1 Coordinate drift — the number that matters most

`coordinates` is the model's own guess. Largest pairwise distance between the guesses for the *same
venue from the same caption*, across the 5 runs, 16 groups with ≥2 coordinates:

| | metres |
|---|---|
| median | **327** |
| p90 | **647** |
| max | **1 007** (`eats בית חנה`) |
| min non-zero | 38 |
| exactly 0 | 1 of 16 |

Every group's spread: 1007, 647, 587, 547, 526, 421, 327, 327, 323, 297, 288, 257, 198, 198, 38, 0.

**`resolve_place`'s near-duplicate guard is 75 m.** The model's guess for one venue moves a median
**327 m — 4.4× the merge radius — between two calls on the same caption.** That is the direct,
measured cause of `current-state.md` §5.8's phantom library: La Nonna at 91 m and Tokii at 85 m are
not near-misses of a slightly-too-tight radius, they are ordinary draws from a distribution whose
median is four times wider than the radius. Widening 75 m to cover it would mean a ~400 m radius,
which merges genuinely different venues on the same street. **The guard cannot be fixed by tuning;
the coordinate has to stop being the model's guess.** This is an argument for the resolver, taken
independently of accuracy-vs-truth: even a *biased* provider coordinate that is stable would fix
identity, and the model's is neither.

`modelConfidence` on these candidates sat at 0.90–1.00 throughout.

Two candidates (`בל עמי`, `palette bistro`) returned `null` coordinates in all 5 runs — correctly,
the caption gives no address for either. The nulling is itself stable, which is worth saying: the
model declines consistently when it should.

## 5. Ruling on retry-on-empty: **do not build it**

The proposal was to retry once when, and only when, extraction returns zero candidates.

**Simulated over all 260 ordered pairs of distinct runs in the grid** (i = first call, j = the
retry — sampling without replacement from the same distribution is exactly what "call it again"
is): first call empty in 4/260 pairs, and **one retry rescued 4 of 4**. On its own terms the retry
works.

It is still the wrong fix, for three reasons in ascending weight:

1. **It routes around a bug instead of fixing it.** 4 of 4 empties were `filterPlausible` dropping a
   correct candidate. The fix in §2.1 rescues 100% of them, deterministically, for zero calls. After
   it, the measured empty rate on this corpus is **0 / 79** — there is no residual empty left for a
   retry to act on, so shipping one would be untestable speculation.
2. **It is far more expensive than the "only on the empty path" framing suggests.** Per `CLAUDE.md`,
   "no places found" is the **modal** import outcome at LEVEL B's hit rate. A retry on empty
   therefore fires on the *majority* of real imports and approaches **+73% call volume** against a
   hard 500/day cap — the cheapest path in the product becomes the most expensive one. The measured
   marginal cost is exact: +1 call, +≈5.2 k input tokens, +≈2.5 s of user-visible latency, on every
   import that found nothing.
3. **It spends that on the one case where a false positive is worst.** A caption that genuinely
   names no place gets a second draw at inventing one; the empty screen is a designed, honest
   surface, and a retry biases the pipeline toward not showing it.

**If the empty rate is ever measured to be non-zero from the model's own side, revisit — with two
retries ruled out already.** In the grid a retry never needed a second attempt (0 of 0 triples), and
the residual after one retry was 0.

### 5.1 The cheaper deterministic pre-check: **refuted**

Tested `emptyIsSuspicious(caption)` — a 📍/🍽️ marker, an address-shaped `word + number`, an explicit
`כתובת:`/`address:` label, an `@handle`. It fires on **13 of 13 captions**, i.e. it is a constant on
this corpus and discriminates nothing. `parseAddress` in `places/score.ts` would be even more
permissive: it accepts any token run containing a digit-free word, so asked "does this caption
contain an address" it says yes for essentially every caption. Neither can tell "empty is probably
wrong" from "empty is right" here.

The corpus cannot refute the pre-check properly either, because it contains **no caption for which
`[]` is the correct answer** — see §6. Recorded as refuted-on-what-we-have, not as proven useless.

### 5.2 Where the retry would have belonged, had it shipped

In `src/domain/import/pipeline.ts` (and its twin in `/api/imports/probe`), **not** in the adapter.
`cost.ts` logs one `extraction.cost` event per adapter call, so an adapter-internal retry would be
invisible to per-import cost accounting exactly when cost matters most — the count of calls against
a per-call daily cap is the number this project actually needs. A retry at the pipeline is also the
only place that can see the plausibility drop counters and decide on them.

## 6. What the data refused to say

- **The false-positive side of any empty-handling policy is unmeasured.** All 13 corpus captions
  name at least one real venue, so there is no caption here for which `[]` is correct. The local
  database holds no place-free real caption either. Deciding whether a retry (or a pre-check) mints
  spurious candidates needs a **negative-control corpus**: 8–10 real TikTok captions that name no
  venue, adjudicated by hand. That is the single highest-value thing missing, and it costs URLs
  rather than calls.
- **Whether the anti-hallucination gate has any true positives at all.** Over 79 runs,
  `evidence_not_in_caption` fired 4 times and was wrong 4 times. It has never been observed catching
  a fabricated venue. It is defensible to keep it — the corpus cannot show a rate for something it
  contains no instance of — but nobody should believe a number for it.
- **Generalisation.** 13 captions, all Tel Aviv, mostly Hebrew, 70–960 characters. Nothing here
  measures English-only captions, London posts, or the 3–7-venue list posts beyond the single
  5-venue one, whose set was 4/5 stable.
- **The 11 rate-limited calls.** They produced no sample and are excluded from every rate above.
  They cost budget, and they are counted in §1's 90.

## 7. Recommendations, in order

1. **Ship the `evidenceFoundInCaption` fix** (done, in the tree, with tests). It converts the
   corpus's one `extraction_miss` into a hit at zero marginal cost.
2. **Do not ship retry-on-empty.** §5.
3. **Build the negative-control corpus** before any further empty-handling work. §6.
4. **Stop keying place identity on the model's coordinates.** §4.1 measures the guess drifting a
   median 327 m against a 75 m merge radius; no radius tuning can absorb that.
5. **Fix the branch-collapsing `duplicate` rule** — key it on `rawName` + `addressHint`, not
   `rawName` alone. §2.2.
6. **Prompt recommendation, not made** (out of scope by instruction — `PROMPT_VERSION` untouched):
   the prompt could ask for `evidence` to be the *shortest* caption span that names the venue, which
   would make both observed failure modes structurally impossible rather than tolerated. It would
   also cut output tokens. Re-measuring everything downstream is the cost, which is why it is a
   recommendation.
