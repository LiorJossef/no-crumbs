# Handoff — Google Places becomes the primary resolver

**Status: adapter delivered and measured; app-level verification next.** Written so this resumes cold.

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

## What is NOT done

- **App-level verification** — running the import in the browser at both breakpoints and reading
  the persisted rows. The numbers above are the harness, which is the same code path but not the
  same proof.
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

- Corpus adjudication **never checks distance**; `Gelalucci`'s index row is ~6.9 km from its own
  address and still scores as correct. Task chip raised.
- Whether Google needs its own band policy — answer with the measurement, not by argument.
- The `06` §3 table still says Google is "Not measured — no key". Stale; superseded by the
  evidence file above.
