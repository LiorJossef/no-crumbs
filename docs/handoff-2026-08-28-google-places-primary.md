# Handoff — Google Places becomes the primary resolver

**Status: all of this session's work is merged to `main` and verified there.** Written to resume cold.

## What landed (all merged, `main` green at 1068 tests)

| PR | What |
|---|---|
| [#55](https://github.com/LiorJossef/P-002/pull/55) | Google Places provider behind the existing port; language follows the caption's script; `SoleCandidateMeaning` band policy; the provenance bug fix |
| [#56](https://github.com/LiorJossef/P-002/pull/56) | 5 s per-lookup timeout, and the 100/day quota recorded |
| [#57](https://github.com/LiorJossef/P-002/pull/57) | TikTok photo/carousel posts supported; `PHOTO_POST` retired |
| [#58](https://github.com/LiorJossef/P-002/pull/58) | Cover-frame OCR measured and rejected as framed; exploration findings |
| [#59](https://github.com/LiorJossef/P-002/pull/59) | The location caveat is shown only when it is true |

**The single most important thing to read before continuing** is "Questions only the owner can
answer" below: the Google resolver is **not shippable** until the 100/day quota is raised, and that
is a console action nobody but the owner can take.

## The result, measured through the shipped flow

Same 13 real TikToks, same oEmbed → caption → extraction → resolve path, same scorer, one run each.
Records: `docs/evidence/places/tiktok-recognition.md` (Overture) and `…google.md` (Google).

|                    | Overture `poi_index` | **Google Places** |
|--------------------|----------------------|-------------------|
| Correct top-1      | 12 / 15              | **15 / 15**       |
| Wrong              | 3                    | **0**             |
| Auto-match         | **7 / 16 (44%)**     | 6 / 16 (38%)      |
| False auto-accepts | 0                    | 0                 |

**Google is more accurate and slightly less decisive.** Its three wins are exactly the coverage
failures Overture cannot fix by scoring (`Oscar's` resolving to the previous tenant, `בל עמי`
absent, `דיזנגוף 99`). Its nine non-auto-accepted answers are all *correct* — the user confirms a
picker with one right option in it, which is a worse feel than Overture's 44% but never a wrong pin.

Honest limits, stated because the number will be quoted: **n = 15 adjudicated candidates, one
city.** The corpus is 13 URLs against the owner's brief of 20-30, and `bars_and_wine_bars` has no
URL at all. This is a pilot, not a result.

### Three things had to be fixed before the comparison meant anything

1. **Language.** Unset, Google answered `האחים` with `Haachim @ Shlomo Ibn Gabirol Street 26` — the
   right venue, transliterated. `addressScore` cannot compare across writing systems (it returns
   null by design), so every Latin address silently discarded the address corroboration. The
   adapter now asks in the caption's own script. Correct answers went 9 → 13 on that alone.
2. **The corpus was provider-coupled.** Two `addressPattern`s were written against Overture's
   Hebrew strings, so they tested *which dataset answered* rather than *which venue came back*.
   Widened to accept either script. **Overture re-ran at 7/16 unchanged** — that control is what
   makes the widening safe rather than self-serving.
3. **The lone-candidate band rule.** Google returns one result for 14 of 16 candidates, so `margin`
   is null and the band capped at `confirm` — a structural 0% auto-accept while 15/15 were right.
   `SoleCandidateMeaning` now makes that a provider property: `'narrow-filter'` (default, Overture,
   `10` §12 Q3 unchanged) vs `'exhaustive-search'` (Google). It waives only the *unmeasurable*
   margin; the score gate is untouched and a real-but-poor margin still cannot pass.

## App-level verification (done, 2026-08-28)

Ran the real app at 1280x720 and 375x812, signed in as the local demo user, imported real TikToks
and read the rows back in psql. **This is where the harness's green run turned out to be hiding a
defect**, so it is worth stating what it caught:

- `Oscar's` resolved correctly and the review screen showed `Oscar's @ נחלת בנימין 68` — and the
  row written to `places` was `llm-guess` at the model's own coordinate. Two silent causes, both
  now fixed and pinned by `tests/unit/import/candidate-place-provenance.test.ts`: the stored
  resolution schema did not list `'google'` (so it failed to parse and the confirm step fell
  through to the guess path with no error), and `derivePlaceSave` hardcoded `provider: 'overture'`
  for any resolved place, which would have filed a Google coordinate under Overture's licence.
- After the fix, importing `Gelalucci` writes `source_dataset=google-places`, `provider=google`, a
  real Google place id, and `(32.078032, 34.777851)` — Masaryk Square. **The Overture row for the
  same venue carries the same address string and sits 6.9 km away.**
- Mobile (375x812) renders the map, clusters, sheet peek and the review sheet correctly, including
  RTL Hebrew in the candidate card.

**The `Oscar's` row in the local demo database is still the pre-fix `llm-guess` artifact.** Left
alone deliberately — deleting rows is not a call to make unasked. Re-import it to replace it.

## Exploration after the main work (owner's list, same session)

| Item | Outcome |
|---|---|
| **Multiple places from one TikTok** | **Already works — no work needed.** Verified in the running app: one caption → "5 places found", with honest per-candidate degradation ("2 of these have no location — they won't be saved"). |
| **TikTok photo / carousel links** | **Shipped.** `04` §5 category L was UNTESTED for want of a specimen; the owner supplied one and the premise was wrong. oEmbed 400s the `/photo/` URL form and 200s the same id under `/video/<id>`, full caption. Two code paths fixed, `PHOTO_POST` retired. A whole class of refusal removed. |
| **Free OCR** | **Measured and, as currently framed, rejected.** See below. |
| **Free transcription** | **Blocked on media access, not on transcription.** oEmbed exposes no video/audio URL and TikTok's robots.txt disallows every named AI agent, so `yt-dlp` was deliberately not run. |

### OCR: the cover frame does not carry the product

Full evidence in `docs/evidence/places/google-places-and-transcription-probe-2026-08-28.md` §B2,
machine record in `docs/evidence/tiktok/cover-frame-ocr-run-2026-08-28.json`.

- **Recall 1 of 8.** Only one caption-less post yielded a venue from its cover. The rest carry a
  hook line and no name — the cover exists to make you watch, so naming the place defeats it.
- **Precision is the real problem.** On a London post the model read four *accurate* shopfront
  signs off the frame (verified by eye) — a hair salon, an organic shop, a market — none of which
  the post is about. A naive cover reader would invent places the creator never recommended.
- If revisited, the ask is "read the text the creator **added**", not "read the image".
- **`thumbnail_url` expires** — every URL cached on 2026-08-18 now 403s. A cover frame must be read
  *during* the import.

### Transcription: there is prior work in a stash

`git stash list` carries **`stash@{3}: codex/cloudflare-audio-transcription (paused)`**, and
`execution-plan.md`'s 2026-08-26 entry records an out-of-band transcription feature whose orphan
database objects were dropped from staging. So this ground has been walked before. Anyone resuming
should read that stash before starting fresh.

## Questions only the owner can answer

1. **The Google Places quota is 100 requests/day** on this Cloud project
   (`SearchTextRequestPerDayPerProject`), and one night of measurement exhausted it. At 1–7 lookups
   per import that is ~15–100 imports/day for all users combined. Raising it is a console (and
   probably billing) action. **Until it is raised, Google is measurable but not shippable.**
2. **Media access for transcription** — licensed third-party providers (Apify/ScrapeCreators/
   Supadata, ~$0.004/item) are the only path that supplies video or subtitles without us scraping.
   That is a spend decision and a `security-privacy` decision, both yours.

## What is NOT done
- **A server-only Google key.** The adapter falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, which
  is compiled into the browser bundle and therefore spendable by anyone. `GOOGLE_PLACES_API_KEY`
  is read first and should be set, restricted, before any deploy. Security follow-up, not a blocker
  for local measurement.
- **The 30-day coordinate rule (§5.4).** Nothing yet refreshes or expires Google-sourced
  coordinates in `places`. Only `place_id` is exempt. Needed before production, and production is
  gated anyway.


## The ruling (owner, 2026-08-28, overnight session)

1. **Google Places is the active direction for place resolution/data.** Move the
   database/index resolver **out of the primary path, but preserve it** — do not delete.
2. **Do NOT switch the map renderer yet.** Google Maps is the *next thing to prototype*, so the
   owner can experience both and then choose. Avoid investment that makes that comparison harder.
3. Keep it lean, verify on real TikToks, desktop and mobile.
4. Then keep exploring: multi-place extraction, TikTok photo/carousel links, free OCR, free
   transcription, and any other product/UX improvement found.

### What this session told the owner before they ruled
`docs/evidence/places/google-places-and-transcription-probe-2026-08-28.md` measured it:
Google top-1 **14/15** vs our resolver **12/15** on the same real extracted candidates; all three
of our misses were index *coverage*, not scoring. The owner then ruled as above.

### The constraint that is NOT resolved by the ruling, and how this session handles it
`06-map-and-places-decision.md` §3.1 (VERIFIED): **Google Places data + a non-Google map is
forbidden** (Service Specific Terms §5.3), and §5.4 caps lat/lng caching at 30 days.
The owner has been told this, twice, and directed Google Places into the primary path while
keeping MapLibre for now.

**How that is squared here, and it is a sequencing answer, not a legal one:**
the adapter is built and made primary **by configuration**, and the *production* default is
unchanged until the Google renderer prototype lands (item 2 above, which the owner has already
named as next). So the forbidden pairing is never what a real end user is served. This is written
down rather than assumed because it is the one thing that must not be quietly lost:

> **GATE: do not enable the Google resolver for production end users until the map renderer
> prototype ships.** Dev/preview measurement is fine. This is a ToS gate, not a taste one.

Storage follows §5.4 the same way: we persist Google's `place_id` (explicitly exempt, storable
indefinitely) and treat coordinates as refreshable cache, not as permanent record.

## Decisions taken this session (reversible, made without waiting)

- **No migration is needed to add a `'google'` provider.** `place_provider_refs.provider` carries a
  *pattern* CHECK (`^[a-z][a-z0-9_]{1,31}$`, migration `0005`/`0007`), not an enum list, so
  `'google'` is already accepted. Widening `PlaceProvider` / `SourceDataset` is a TypeScript-only
  change. `06` §3.3 predicted "a small migration"; it turned out to be less than that.
- **The Google adapter reuses `domain/places/score.ts`, it does not rank.** Google results are
  mapped to `ResolvedPlace[]` and handed to the existing `scoreCandidates(...)`. One ranker in the
  system, and Overture-vs-Google numbers stay directly comparable. No scoring code is duplicated.
- **`datasetConfidence` for a Google row is `0.5`** — the schema's neutral default. Google exposes
  no per-result confidence and inventing one would be exactly the "confidently wrong" failure the
  working agreement forbids.
- **Band policy is left unchanged for now, deliberately.** `margin === null → confirm` means a
  single Google result can never auto-accept. That may be wrong *for this provider* (Google
  searched a global index and returned one place; a one-row Overture prefilter meant something
  else). **Measure first, then decide.** Do not loosen an auto-accept rule on intuition — a false
  auto-accept is the most damaging failure mode in `benchmark-spec.json`.

## Where things are

- Evidence for the ruling: `docs/evidence/places/google-places-and-transcription-probe-2026-08-28.md`
- Overture adapter (preserved, still tested): `src/integrations/supabase/place-resolver.ts`
- Scorer (shared by both providers): `src/domain/places/score.ts`
- Real-TikTok harness of record: `tests/manual/tiktok-recognition.manual.ts`
  + corpus `tests/manual/tiktok-recognition-corpus.json`
- Baseline to beat: **7/16 auto-match**, 12/15 top-1 correct (run record
  `docs/evidence/places/tiktok-recognition-run.json`)

## Open loose ends (carry these forward)

- **Why nine correct Google answers do not auto-accept — measured, not guessed.** The first
  hypothesis (the extra-token penalty punishing Google's branch suffixes) is **wrong**, and the
  real cause is more structural. Actual `nameScore`s, computed against the shipped scorer:

  | query | Google top-1 | nameScore | final |
  |---|---|---|---|
  | `קפה אירופה` | `קפה אירופה` | **1.000** | 0.850 |
  | `Palette Bistro` | `Palette Bistro` | **1.000** | 0.850 |
  | `רוסטיקו` | `רוסטיקו רוטשילד` | 0.913 | 0.705 |
  | `מתחת לעץ` | `מתחת לעץ בן יהודה` | 0.874 | 0.849 |

  The top two are **byte-identical names scoring a perfect 1.000**, and they still land at 0.850.
  The arithmetic says why: `0.8·1.0 + 0.1·categoryScore + 0.1·datasetConfidence`, where
  `datasetConfidence` is pinned at 0.5 for Google (it publishes none) and `categoryScore` is 0
  because Google types both venues `restaurant` while the caption's hint was `cafe` and `bar`.
  Checked against Google's full `types` array too — it is `['restaurant','food',…]` with no `cafe`
  in it, so reading `types` instead of `primaryType` would **not** fix this. It is a genuine
  taxonomy disagreement, not a field we are failing to read.

  **So on the Google path a perfect name tops out at 0.85 and cannot reach the 0.92 gate unless the
  category also agrees.** The 0.05 handicap is the fabricated confidence term: an Overture row at
  confidence 1.0 contributes 0.10 where Google contributes 0.05, for a number Google never claimed.
  The principled fix is probably to **renormalise the blend when a provider publishes no
  confidence** rather than to feed it a made-up 0.5 — `(0.8·name + 0.1·category) / 0.9` — which is
  honest arithmetic rather than tuning. **Deliberately not done tonight**: it is a third scoring
  change in one session, on n=15, affecting auto-accept, and it wants its own measurement.

- **`רוסטיקו` is a multi-branch case, not a bug.** The caption says בזל 42; Google returned the
  רוטשילד 15 branch; `addressScore` correctly reads a different street as contradicting evidence
  and drives the row to `no_match`, so the product falls back to the model's guess and shows "Pin
  is approximate". The scoring reasoning is sound — the disagreement is real. What is wrong is the
  *outcome*: Overture auto-matched this venue and Google does not, so the primary path got worse
  on this one case. The fix is a disambiguation surface (show both branches), not a weight.
- **The review-screen copy is now wrong for resolved places.** It says "We work out pins from what
  the caption said, so they can be a street or two off." On a Google-resolved place the pin is the
  venue's own coordinate, ~10 m. The caveat should follow the provenance, not be printed always.

- Corpus adjudication **never checks distance**; `Gelalucci`'s index row is ~6.9 km from its own
  address and still scores as correct. Task chip raised.
- Whether Google needs its own band policy — answer with the measurement, not by argument.
- The `06` §3 table still says Google is "Not measured — no key". Stale; superseded by the
  evidence file above.
