# Place identification — measured evidence, and what to do if we resume

> **Task RESOLVE-M1, `maps-geospatial`, 2026-08-27. Measurement only.**
> Nothing under `src/` or the repo working tree was modified. Database access was `SELECT` only.
> No commit, branch, push or deploy.
>
> **Status: `PlaceResolver` / Nominatim is an OPEN FUTURE DIRECTION, explicitly not rejected.**
> The owner decided on 2026-08-27 not to make a provider decision or build resolver infrastructure
> as the next workstream. This document exists so that decision can be revisited later without
> re-running anything. Every number here is measured; every projection is labelled.
>
> **Two findings apply to the product right now, regardless of who supplies coordinates.**
> They are §9 and §10. Read those even if the resolver never happens.

---

## 0. What was actually run

| Phase | Live Nominatim calls | What |
|---|---|---|
| Phase 1 | 10 | Structured (`amenity=`) over the 9 real cached candidates, plus one `rawName` A/B |
| Phase 2 | 111 | Blocks A–G below, authorised by the lead at 120 |
| **Total** | **121** | Zero Gemini calls. Zero Overpass calls. |

Usage-policy compliance, VERIFIED against <https://operations.osmfoundation.org/policies/nominatim/>:
strictly sequential, one connection, ≥1.2 s between requests, identifying `User-Agent` carrying a
contact address, every response persisted so no query was ever repeated. Only a venue name, a city
name and an ISO-3166-1 alpha-2 code ever left the machine — never a URL, id, caption or location fix.
A persistent ledger (`call-ledger.json`) enforced the ceiling across every invocation.

**A sequencing note the next session needs.** The stop instruction arrived *after* blocks C, D, E, F
and G had already completed. So the Tel Aviv deep-dive (§6) and the Laughing Yak check (§7) **were
done**, contrary to what the stop message assumed. Their results are in here and are paid for.

| Block | Calls | File |
|---|---|---|
| Phase 1 | 10 | `nominatim-structured-real-candidates.json`, `nominatim-rawname-retry.json` |
| A | 7 | `blockA-rawname-arm.json` — `rawName` arm, structured |
| B | 15 | `blockB-freeform-arm.json` — free-form arm, both name forms |
| C | 44 | `blockC-freeform-44.json` — full benchmark replication |
| D | 13 | `blockD-telaviv-depth.json` — Tel Aviv absence vs ranking |
| E | 3 | `blockE-laughing-yak.json` |
| F | 20 | `blockF-area-qualifier.json` |
| G | 9 | `blockG-addresshint.json` |

Offline analyses (free to re-run, no network): `analyse-44.py`, `twin-pairs.py`, `adjudicate.py`,
`score-nominatim.mts`, `alias-delta.mts`. The `.mts` files import the **production** scorer from
`src/domain/places/score.ts` unmodified, via a scratchpad module-resolution hook
(`ts-loader.mjs` + `hook.mjs`) so Node's type stripping can run it. Read-only.

---

## 1. The LLM baseline — and the failure mode nobody has written down

Source: the 4 cached TikToks in the local `extractions` table, 9 candidates (8 London, 1 Tel Aviv).

**The repo's "65–470 m" is not what I measured.** Do not keep quoting it. The real shape is:

| | |
|---|---|
| Single-location venues, ground truth established (n=4) | 34.7, 69.6, 110.9, 198.1 m — **median 90 m** |
| Including multi-branch venues, distance to the *nearest real branch* (n=6) | 34.7, 69.6, 110.9, 198.1, **516**, **1140** m — **median 155 m, max 1.14 km** |

n is 4 and 6. That is not enough for a p90 and none is quoted.

**The finding that matters is the shape, not the median.** On a venue with one location the model is
decent — 35–200 m, close enough that a user recognises the street. On a venue with **several
branches it emits a coordinate that is no branch at all**:

- *The Life Goddess* has two real London branches (Store St, Bloomsbury; Kingly Ct, Soho). The model
  emitted one point, **1140 m** from one and 1572 m from the other. `modelConfidence: 0.90`.
- *HaKosem* has two real Tel Aviv locations. The model emitted one point **516 m** from the nearer.
  `modelConfidence: 0.99`.

This is not a prompting problem and better prompting will not fix it. It is what averaging over
recall produces: asked for *the* coordinate of a name that has several, the model returns something
near their centroid. **`modelConfidence` does not fall when this happens** — 0.90 and 0.99 are among
the highest in the set. So the product has no signal that it is about to place a pin in the middle
of nowhere, and "Pin is approximate" understates it: the pin is not approximate, it is *fictional*.

Ground-truth method, stated because it is the weakest link: the benchmark has no ground-truth
coordinates and these 9 venues are not in it. Each caption carries a human-written address hint that
is wholly independent of OSM ("Market Row, Brixton", "underground on Pudding Lane", "inside
Eccleston Yards"). Where an OSM row's address components corroborate that hint, two independent
sources agree and the OSM coordinate is taken as truth. Where the caption gives no hint, or
contradicts OSM, **no ground truth is claimed**. This method is OSM-derived and therefore cannot
measure Nominatim's own error — only the model's. That asymmetry is real; §7 is where it bites.

---

## 2. The clearest argument for ever doing this: a gazetteer hit is ~10 m

Offline, from the checked-in fixtures (`analyse-44.py`). For the 24 benchmark cases where a human
adjudicated **both** Nominatim and Overture top-1 as correct:

- **median distance between the two independent datasets: 8.2 m**; 18 of 19 single-location venues
  agree to under 50 m; the one outlier is 200 m.
- All five disagreements over 500 m are multi-branch venues where the two datasets picked *different
  branches* — that is not error, it is the branch-choice problem again.

So: **a gazetteer match is accurate to about 10 m; the model's guess is accurate to about 150 m and
sometimes 1 km.** One to two orders of magnitude, and it is the single strongest reason to do this
at all. It is also the number to quote to an examiner, because it is measured, not argued.

---

## 3. The twin-pair projection: 63% → 80%, ASSUMED

The repo records Nominatim at 63% top-1, but that was measured on **raw** candidate strings. Our
extractor corrects spelling and always emits a `cityHint`. Is 63% a floor?

The benchmark contains **paired cases** — a degraded variant alongside the clean form of the same
venue, run against the same endpoint on the same day. Comparing the two verdicts isolates exactly
the variable the extractor removes, at zero call cost (`twin-pairs.py`):

| Degraded | Result | Clean twin | Result |
|---|---|---|---|
| `Fuglin Tokyo` | zero | `Fuglen Tokyo` | OK |
| `Bar Benfidich` | zero | `Bar Benfiddich` | OK |
| `Port Sayid` | zero | `Port Said` | OK |
| `Belboy tel aviv` | zero | `Bellboy` + cityHint | OK |
| `Prufrock Cofee` | zero | `Prufrock Coffee` | OK |
| `Satans Wiskers` | zero | `Satan's Whiskers` | OK |
| `Padella` (no city) | mis-ranked | `Padella` + cityHint | OK |

**7 of 7 recover. Projected top-1: 26/41 (63%) → 33/41 (80%).** Excluding the two `low`-label cases:
67% → 85%.

**Labelled ASSUMED, with strong evidence.** It is the measured verdict of the same venue's clean
query, not a re-send of the fixed string. Block C re-ran all 44 on 2026-08-27 and every clean twin
still hits, so the projection is as firm as it can get without simulating the extractor end to end.

**My own live counter-evidence against it**, which the next session must not skip: the extractor does
not only *clean* names, it *embellishes* them, and embellishment is what §4 shows can zero a query.
The projection credits the cleaning and ignores the embellishing. Treat 80% as an optimistic bound.

**Replication stability, useful on its own:** 43 of 44 top-1 results were byte-identical to the
2026-08-18 fixture nine days later (the one change is an adjacent node on `TLV-14`, a `low`-label
case). Nominatim/OSM is stable enough at this timescale that old evidence stays usable, and 63%
replicated exactly.

---

## 4. The `identifiedName` embellishment finding — a strong lead, NOT an established rule

**This is three observations from four posts. It is not settled. Do not design on it without more data.**

Our extractor emits both `rawName` (copied from the caption) and `identifiedName` (its own
inference). Phase 1 sent `identifiedName` to Nominatim's **structured** `amenity=` endpoint and 3 of
9 returned zero — all three being names the model had embellished:

- `La Nonna` → `"La Nonna Brixton"` → **0 results**
- `Sycamore Restaurant` → `"Sycamore Vino Cucina"` → **0 results**
- `Kiaans Tooting` → `"Kiaan's Tooting Market"` → **0 results**

The one A/B that supports it (phase 1, call 10): identical parameters, `rawName` instead:

```
amenity="La Nonna Brixton", city=London  → 0 results
amenity="La Nonna",         city=London  → 3 results, #3 = "La Nonna, Market Row, Brixton, SW9 8JP"
```

Market Row, Brixton is exactly the caption's address hint. So Nominatim *has* the venue and the
model's own disambiguation hid it.

**Block A then inverted this, which is why it is a lead and not a rule.** Running the `rawName` arm
across the rest (7 calls) made things *worse*, not better:

| | structured, `identifiedName` | structured, `rawName` |
|---|---|---|
| `MBER London` | 1 correct hit | **0** |
| `Tokii London` | 1 correct hit | **0** |
| `Ha Kosem` | 2 hits | **0** |
| Candidates returning ≥1 result | **6/9** | **4/9** |

`rawName` won once (La Nonna) and lost three times. **"Query with `rawName`" is an anecdote.**

The real variable is not raw-vs-identified at all — it is **how close the string is to the OSM `name`
tag**. Any surplus token kills the structured endpoint: a city name (`"MBER London"`), a branch
(`"La Nonna Brixton"`), even a space in the wrong place (`"Ha Kosem"` vs `"HaKosem"`). Sometimes the
model's inference is closer to OSM, sometimes further. It is a coin toss, and that is the finding.

---

## 5. The endpoint matters more than the name form — and the qualifier rule

Block B ran the **free-form `q=`** endpoint over the same nine candidates, both name forms, same day:

| Candidates returning ≥1 result | |
|---|---|
| structured `amenity=`, `identifiedName` | 6/9 |
| structured `amenity=`, `rawName` | 4/9 |
| **free-form `q=`, best name form** | **7/9** |

And the case that reframes everything:

```
q="La Nonna, London"          → 3 results (Wimbledon, Borough Market, Brixton) — ambiguous
q="La Nonna Brixton, London"  → 1 result  — exactly the Brixton branch
```

**Under free-form, the model's branch qualifier is an asset, not a liability.** It collapsed a
three-way ambiguity to the single correct answer. That is the opposite of the phase-1 reading.

Block F tested that at n=20, stratified so the harm case was probed as hard as the help case
(`blockF-area-qualifier.json`). Appending a short neighbourhood qualifier to the name, free-form:

| Stratum | n | Outcome |
|---|---|---|
| **AMBIG** — plain query returned several | 10 | **5 narrowed** (4 of them to exactly the expected area), 1 unchanged, **4 zeroed** |
| **MISS** — plain query returned nothing | 5 | **0 rescued.** A qualifier never recovers a miss |
| **CLEAN** — plain query returned one correct row | 5 | **5 unchanged. A short qualifier never broke a clean hit** |

Block G then tested the caption's full `addressHint` as a query term, and it behaves differently:

| | |
|---|---|
| Rescued a miss | 0 of 5 |
| **Broke a clean hit** | **2** — `Tokii` and `Jones Family Kitchen` both went from 1 correct result to 0 |

**So the rule is about length, not source: a short single-token area qualifier is safe and often
disambiguating; a long multi-token address string destroys the query.**

**The design this implies, if we resume.** Do not pick one query form. Send the plain name first;
only if the result is ambiguous (n ≥ 2, or the scorer's margin is ~0) send a second, qualifier-added
query, and intersect. Adaptive, because you cannot know it is ambiguous until the first response.
On this sample 11 of 20 were ambiguous, so it averages ~1.5 calls per candidate.

**Operational consequence, and it is a real one.** `06` §6.4 caps resolution at 7 lookups per import
(`MAX_CANDIDATES = 7`). Two forms per candidate makes that 14 provider calls, and at the mandatory
≤1 rps that is **up to 14 seconds of wall clock per import**. That collides directly with the
streaming route (`L0-F6`). Either the cap drops, or resolution runs after the import returns, or a
hosted OSM geocoder with a real rate limit (LocationIQ / Geoapify — same data, same ODbL storage
position, already named as the escape hatch in `06` §0) becomes necessary rather than optional.

---

## 6. Tel Aviv — the weak spot, and it is a DATA hole, not a ranking problem

Tel Aviv is a target city and Nominatim's worst (5/14 raw). Block D spent 13 calls separating
"absent from OpenStreetMap" from "not found by that one query string".

**All three suspected absences confirmed, across every form tried:**

| Venue | Forms tried | Result |
|---|---|---|
| Imperial Craft Cocktail Bar | bare Latin; full name + `Tel Aviv-Yafo`; Hebrew `אימפריאל קראפט`; structured | **0 results on all 4** |
| Orna and Ella | Latin `Orna and Ella` (**the benchmark only ever sent Hebrew**); `Orna & Ella`; Hebrew + Sheinkin | **0 results on all 3** |
| Cafe Xoho | `Xoho`; `Xoho Gordon` | **0 results on both** |

Combined with the committed Overpass probe (`overpass-coverage-tlv.sh`, 2026-08-18), which regexed
**every `name:*` key** across the whole Tel Aviv bbox and returned no row for any of the three, this
is now **VERIFIED ABSENT from OpenStreetMap**, not merely unfound. No resolver, scorer or query
strategy recovers a row that does not exist.

> The lead's stop message recorded these as unconfirmed. They are confirmed. The one refinement still
> worth one call is a *fresh* Overpass re-run, since the absence evidence is 9 days old; Nominatim
> returning nothing is strong but not conclusive on its own, whereas an Overpass name regex is.

**And one of the two `low`-label cases is a bad label, not a miss.** `TLV-13` sends
`"Oved Daniel Sabich"`. OSM holds the venue as `הסביח של עובד` with `name:en = "Ovad's Sabich"`.
Querying either finds it (n=2 and n=1). The benchmark has been measuring a name the venue does not
have. **`TLV-13` should be relabelled or dropped before it is used to compare providers again.**
`TLV-14` (`Bar 51`, `expected_area: unknown`) returns house-number-51 street addresses — it is not
labelable as written and should be dropped too.

**Tel Aviv re-adjudicated on that basis:** 14 cases − 3 verified absent − 2 bad labels = **9
adjudicable**, of which free-form Nominatim gets 5, rising to **7 of 9** once the extractor's spelling
correction is credited (§3), and the remaining two are the cross-script cases that §8 fixes.

That reframes the whole city. It is not "Nominatim is bad in Tel Aviv". It is **"OpenStreetMap has
holes in Tel Aviv"** — and Overture holds two of the three missing venues (`06` §4.2). That is the
strongest measured argument for D2b's **two-source** design over Nominatim alone.

---

## 7. The Laughing Yak — the best argument against the whole approach, still unresolved

Nominatim returned **one** result for `The Laughing Yak`: `205 Richmond Road, Hackney, E8`. The
caption says "tucked away in **Market Peckham**" (SE15) and the model pinned Peckham. **8.4 km apart,
and the caption backs the model.**

Block E spent 3 calls looking for a Peckham site — free-form with `Peckham`, free-form with
`Peckham Levels`, structured with `city=Peckham`. **All three returned zero. OSM has exactly one
Laughing Yak and it is in Hackney.**

That does not settle it, and I want to be plain about why: either the Peckham site is a coverage hole
like the Tel Aviv three, or the business moved, or the caption/model is wrong. **Resolving it needs a
non-OSM source, which this task never had.** It stays UNVERIFIED.

**The finding survives regardless of who is right:** Nominatim returned a single, unambiguous,
confidently-wrong-looking result with **no signal at all** that it might be a different site. A
geocoder that returns one row is not more trustworthy than an LLM that returns one guess — it is
equally confident and can be equally wrong. Any resolver we build must treat `n = 1` as *unconfirmed*,
not as *certain*. This is also the case that validates cross-checking the returned address against
the caption's `addressHint` — "Peckham" vs "Hackney" is a mismatch a name-only scorer cannot see.

---

## 8. What the existing scorer does when you point it at a geocoder

`src/domain/places/score.ts` was run unmodified over the live rows (`score-nominatim.mts`).

**Finding 1 — zero `preselect` bands across all 10 real cases.** Every one landed `confirm` or
`no_match`. The `preselect` gate needs `score ≥ 0.92` **and** `margin ≥ 0.05`; a geocoder returns 1–3
rows, so the margin is either `null` (single result, which divergence 1 correctly caps at `confirm`)
or exactly 0.000 (two identically-named branches). **The 71% preselect rate in `06` §6.3 does not
transfer** — it was calibrated against a local prefilter returning 18–2904 candidates, not a remote
endpoint returning ≤5. See §11 for my judgement on what to do about that.

**Finding 2 — `altNames` scoring is a one-line change with a large, measured effect.**
`06` §7.1 lists an OSM alias join onto Overture as the fix for non-Latin queries, and calls it the
main mitigation for our weakest city. **Nominatim ships that data per row, for free, in
`namedetails`** — no join, no ingest: `name:en`, `name:he`, `name:ja`, `alt_name:en`, `int_name`.

`score.ts` divergence 5 explicitly does not score `altNames`, because Overture's were always empty.
Measured across all 58 rows returned by the 44-case free-form sweep (`alias-delta.mts`):

| | |
|---|---|
| Rows carrying at least one alias | 20 of 58 |
| Rows improved by scoring aliases | 9 |
| **Rows rescued from unscoreable (<0.3) to strong (≥0.8)** | **9, across 6 cases** |
| Mean improvement on improved rows | **+0.94** |
| **Rows made worse** | **0** |

Cases rescued: `TYO-05`, `TYO-08` (`Ichiran Shibuya` → `一蘭`, 0.000 → 0.817), `TYO-11`
(`Sarutahiko Coffee` → `猿田彦珈琲`, 0.000 → 1.000), `TLV-01` (`Port Said` → `פורט סעיד`, 0.175 →
1.000), `TLV-05` (`Miznon` → `מזנון`, 0.000 → 1.000), `TLV-06` (`HaKosem` → `הקוסם`, 0.000 → 1.000).

Zero regressions in 58 rows. The `score.ts` header already anticipates this exact change ("when
aliases land, this becomes the best score over `name` and `altNames`"). **If any resolver work
resumes, this is the first and cheapest thing to do.**

Note the layering: Nominatim's *search* already matches across scripts (a Latin query reaches a
Hebrew-named row — `Ovad's Sabich` found `הסביח של עובד`). It is only our *scorer* that then throws
the correct row away. The gap is ours, not the provider's.

---

## 9. `importance` is unusable — and `L0-F3-T3` currently assumes otherwise

**This is a live doc defect, not a future concern.** `L0-F3-T3` needs a per-candidate confidence
signal and Nominatim's `importance` is the obvious candidate. It does not work.

Measured across all rows returned in this task, `importance` takes **exactly two distinct values**:

- `9.307927061870783e-05` on **every** GB row
- `7.500038147550191e-05` on **every** IL row

It is a Wikipedia-derived global-prominence score, and unnamed/ordinary POIs all receive a
country-level default. It varies by *country*, not by venue. **It carries no per-candidate
information whatsoever** and anyone who wires it into a confidence band will produce a number that
looks meaningful and is not.

`L0-F3-T3`'s exit criterion should be corrected to say so before someone spends a session on it.
The usable confidence signal is the **margin between the top two scores**, exactly as `06` §6.2
already argues — not any field the provider hands us.

### The rest of the enrichment inventory (VERIFIED, from live responses)

| Field | Finding |
|---|---|
| `osm_type` / `osm_id` | On every row. A provider place id (`06` §3 already notes nodes are re-created on edit) |
| `address.country_code` | On every row (`gb`, `il`). **Directly fixes the NULL `country_code` dedup hole in `06` §3.2** |
| Address components | `house_number, road, neighbourhood, suburb, quarter, city_district, city, state, postcode, ISO3166-2-lvl4/6/8` |
| `category` / `type` | `amenity:restaurant`, `amenity:bar`, `amenity:fast_food` — and `building:yes`, i.e. also a *filter*: one returned "row" was a building, not a venue |
| `namedetails` | `name:en`, `name:he`, `name:ja`, `alt_name:en`, `int_name` — see §8 |
| `extratags` | `cuisine`, `website`, `phone`, `opening_hours`, `wheelchair`, `diet:kosher`, `outdoor_seating`, `payment:*`, `contact:instagram`. `cuisine` is a far better category signal than our 7-value guess |
| **`disused:amenity`** | Present on one returned row. **A closure signal.** `06` §7.5 declared freshness out of scope; it is partly free |
| `licence` | `Data © OpenStreetMap contributors, ODbL 1.0` on every response |

**Licensing is a merge gate, not a formality.** ODbL. `06` §11 Q2 is explicitly re-opened by the
first Nominatim write path and `security-privacy` holds that veto. An accurate-but-forbidden pairing
is not a candidate. Also unresolved: the usage policy's *"Applications and services whose primary
function is related to geocoding must run their own service."* We read ourselves as a saved-places
map rather than a geocoder — that is our reading, not theirs.

---

## 10. Two things that apply to the current work regardless of the resolver

### 10.1 The extractor embellishing names is an extraction-quality defect on its own

`identifiedName` is the model's inference and it is not stable. `llm-guess-place-id.ts` already
documents this from real captions — `"Kiaans Tooting"` came back as `"Kiaans"` once and
`"Kiaans Tooting Market"` the next run; `"Sycamore Restaurant"` as `"Sycamore Vino Cucina"` then
`"Sycamore Cucina & Bar"` — and that instability is precisely why the identity key was moved to
`rawName`. This task adds three independent reasons it is a defect beyond identity:

1. It **fabricates**. `"Sycamore Vino Cucina"` and `"Sycamore Cucina & Bar"` are two different names
   for one venue and OSM has neither. The model is not recalling a name, it is composing a plausible one.
2. It **appends location words into the name field** (`"La Nonna Brixton"`, `"MBER London"`,
   `"Kiaan's Tooting Market"`). That is address information in the wrong column — and the pipeline
   already has an `addressHint` field for exactly that.
3. It is what makes `identifiedName` a coin toss as a query string (§4).

Worth fixing in the extraction prompt whatever happens next: **keep the venue name in the name
field and the location in `addressHint`.** That is a prompt change, it needs no resolver, and it
makes `identifiedName` more stable, more honest and more usable later.

### 10.2 Multi-script aliases matter for Tel Aviv and Tokyo whoever supplies coordinates

Measured here (§8) but not specific to Nominatim. Of the 44 benchmark cases, 6 are venues whose
primary name is Hebrew or Japanese while the caption writes Latin, or vice versa. Any name-matching,
deduplication or search-box feature we build — including the manual-search fallback and
`resolve_place`'s near-duplicate guard — will fail on those rows unless it matches across scripts.

Note that `places.name` today stores whatever the model produced, in whatever script it chose, with
no alias column. Two users saving the same Tel Aviv venue from a Hebrew caption and an English one
get **two rows** and nothing will ever merge them. That is Charter invariant 4 (one row, many users)
quietly failing, and it is failing now, not in some future resolver.

---

## 11. The judgement asked for: is re-banding worth it?

**No. Delete the `preselect` band for shortlist-shaped providers rather than re-fit it, and say why in the UI.**

The reasoning, given that `L1-F3-T2` already requires an explicit human confirm before anything is
saved — so a `preselect` would pre-tick a box, not auto-save, and this costs *effort*, not *safety*:

1. **The gate is measuring something real, and the answer is genuinely "we don't know".** `margin`
   is `null` because there was no second candidate — not because the first one is certain. §7 is the
   proof: a single confident result that the caption contradicts. Re-fitting the thresholds so that
   `n = 1` reaches `preselect` would convert "unmeasured" into "certain", which is exactly what
   `working-agreement.md` and guardrail 25 forbid. **`06` §6.2's best idea is that we trust the gap,
   not the score. A provider that never gives us a gap has not earned the gate.**
2. **The effort saved is one tap on a screen the user is already reading.** The review sheet exists
   so a human decides. Pre-ticking saves a tap; it does not remove the screen. That is a small win
   to buy with a weakened honesty guarantee.
3. **Re-fitting is not free and it is not safe.** The current constants are the regression baseline
   for the 44-case golden file. Re-fitting them for a second provider means either two constant sets
   (and the golden file no longer pins either) or one set that fits neither well.
4. **The honest UI is better product.** "We found one possible match — is this it?" with the address
   and a map preview is a *better* screen than a pre-ticked row, because it tells the user what to
   check. Pre-ticking implies a verification we did not perform.

So: keep `preselect` for the local Overture index, where a real ranked corpus produces a real margin
and 29 of 44 cases earned it with zero false accepts. For a shortlist-shaped provider, return
`confirm` or `no_match` and let the UI stop pretending a third state might appear. **A band that can
never fire is worse than no band — it is dead code that implies a capability we do not have.**

The one thing I would add instead of re-banding: when `n = 1`, cross-check the returned address
against the caption's `addressHint` and **surface the disagreement** ("the caption says Peckham, this
result is in Hackney"). That is cheap, needs no new provider call, and turns §7 from a silent 8 km
error into a question the user can answer.

---

## 12. If this resumes: what to measure first, and what it costs

In order. Everything is $0 in provider spend; the cost is calls and time.

| # | What | Cost | Why first |
|---|---|---|---|
| 1 | **Enable `altNames` scoring in `score.ts` and re-run the golden file** | **0 calls.** All the data is in `blockC-freeform-44.json` | §8: 9 rows rescued, 0 regressions, one line. Largest effect per unit of work in the whole report |
| 2 | **Re-run the Overpass absence probe** (`overpass-coverage-tlv.sh`) | **1 call**, different endpoint — needs its own authorisation | Refreshes the only evidence that Tel Aviv's three misses are data holes rather than our failure. 9 days stale |
| 3 | **Fix `TLV-13`, drop `TLV-14`, correct `06` §4's "four `low`"** | 0 calls | §6. The benchmark is currently measuring a name a venue does not have. Every provider comparison inherits that error |
| 4 | **The adaptive two-form query, measured end to end** | ~60 calls | §5 gives the rule from 20 stratified cases plus 9 real ones. Turning it into a measured hit rate over the full benchmark is the last thing between 80% ASSUMED and a real number |
| 5 | **A larger real-candidate set** | 0 Nominatim calls; needs Gemini quota for new imports | Everything in §1 rests on n = 9 from 4 posts, 8 of them London. This is the biggest single weakness in the evidence and no amount of Nominatim calls fixes it |
| 6 | **Resolve the Laughing Yak** | 0 Nominatim calls; needs a non-OSM source | §7. The best argument against the approach is still untested, and it cannot be tested from inside OSM |

**What I would *not* do:** spend more calls on the structured `amenity=` endpoint. §4 and §5 settle
it at n = 29 — it is the weaker endpoint and free-form `q=` dominates it on every axis measured.

---

## 13. Honest limits of this evidence

- **n = 9 real candidates, from 4 posts, 8 London and 1 Tel Aviv.** Ground truth for 4. Every number
  in §1 is a direction, not a rate.
- **Ground truth is OSM-derived**, so it cannot measure Nominatim's own error — only the model's.
- **The 80% in §3 is a projection**, and §4 is my own counter-evidence against it.
- **The Laughing Yak is unresolved** and needs a source this task never had.
- **No Overture comparison on live data**: `poi_index` is empty locally (0 rows, all three
  `poi_regions` rows `is_loaded = false`). Every Overture number quoted here comes from the
  checked-in 2026-08-18 fixtures.
- **No credentialed provider was measured** — Google, Mapbox and Foursquare remain documentation-only
  in `06` §4.1, and that is still the single largest gap in D2.
- **`06` §4 says "four `low` cases"; the spec has 2 `low` and 6 `medium`.** The doc is stale.
