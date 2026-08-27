# TLV benchmark subset against the real `poi_index` — measured run

> **Task TLV-RESOLVE-T4, `qa-reliability`, 2026-08-27. Independent verification, plus the harness.**
> Database access was `SELECT` only, local container only. No migration, no reset, no commit, no
> deploy. Nothing under `src/` was modified.

## What this is

The first time any of the 44 benchmark cases has been run through the **shipped resolver against a
loaded index**. Until 2026-08-27 `public.poi_index` held zero rows, so
`tests/unit/places/benchmark-golden.test.ts` could only replay a *recorded* candidate list — it
proves the scorer has not drifted and can say nothing about whether the SQL prefilter returns the
right row, or whether the loaded region contains the venue at all.

The harness is [`tests/manual/tlv-resolve-benchmark.manual.ts`](../../../tests/manual/tlv-resolve-benchmark.manual.ts).
It drives `overturePlaceResolver(supabasePoiIndexGateway(client))` — the real adapter, the real
`@supabase/supabase-js` client, the real database — and reimplements no scoring, no prefiltering and
no region logic.

```
SUPABASE_SERVICE_ROLE_KEY=<local service key from `npx supabase status`> \
  npx vitest run tests/manual/tlv-resolve-benchmark.manual.ts \
    --config tests/manual/vitest.manual.config.ts --disable-console-intercept
```

`--disable-console-intercept` only affects whether the table below is printed live; the assertions
and the JSON record do not need it. Each run rewrites
[`tlv-resolve-benchmark-run.json`](tlv-resolve-benchmark-run.json) with the full per-case record
including the top-3 and every score component.

It is **not in CI and cannot be**: the root `vitest.config.ts` includes only `tests/unit/**` and
`src/**`, and `.github/workflows/ci.yml` runs `npm run test` and `npm run test:e2e`. When the
service key is unset, the URL is not local, the container is down, `poi_regions.tlv.is_loaded` is
false, or `poi_index` holds no `tlv` rows, it **skips with a printed reason** — verified for the
first three by running it that way. It refuses to run against a non-local Supabase URL at all:
it reads with the service role, and pointing a "test" at staging would be a silent escalation.

## Conditions of this run

| | |
|---|---|
| Date | 2026-08-27 |
| Database | local container, `http://127.0.0.1:54321` (`postgres@127.0.0.1:54322`) |
| Overture release | `2026-07-22.0` (`scripts/poi-ingest.config.json`) |
| Region | `tlv`, `is_loaded = true`, `norm_version = 1` |
| bbox | 31.95–32.40 lat, 34.70–35.00 lng (migration `0020`, Tel Aviv + Hasharon) |
| Rows | 10 462 food-and-drink rows, all `region_id = 'tlv'` |
| Cases | the 14 `TLV-*` cases plus `NEG-03` from `benchmark-spec.json` |
| Code under test | `src/integrations/supabase/place-resolver.ts` + `src/domain/places/score.ts`, as they stood uncommitted in the working tree at the time of the run |

## Result

```
case     regions  pre   band       score   margin  top1                           address                  lat,lng              rank  verdict
TLV-01   tlv      34    preselect  0.999   0.174   Port Said                      הר סיני 5                32.06470,34.77237    1     ok
TLV-02   tlv      9     no_match   0.502   0.009   street39levinsky               לוינסקי 39               32.05976,34.77172    —     FAIL not_in_prefilter
TLV-03   tlv      1     confirm    1.000   null    Bellboy                        ברדיצ'בסקי 14            32.07095,34.78033    1     ok
TLV-04   tlv      26    preselect  0.977   0.184   Imperial Craft Cocktail Bar    66 hayarkon              32.07554,34.76677    1     ok
TLV-05   tlv      2     preselect  0.996   0.390   Miznon                         אבן גבירול 23            32.07385,34.78167    1     ok
TLV-06   tlv      1     confirm    0.991   null    HaKosem                        שלמה המלך 1              32.07642,34.77674    1     ok
TLV-07   tlv      3     confirm    0.885   0.053   הקוסם שרונה מרקט               אלוף מגן קלמן 3          32.07117,34.78655    2     FAIL ranking
TLV-08   tlv      3     no_match   0.600   0.004   גלידת קוואלה גבעתיים           דרך יצחק רבין 53         32.06586,34.81291    —     FAIL not_in_prefilter
TLV-09   tlv      2     preselect  0.980   0.369   CafeXoho                       בן יהודה 73              32.08090,34.77032    1     ok
TLV-10   tlv      18    no_match   0.795   0.064   Zucca Cafe & Gelato            הרוגי מלכות 7            32.10991,34.83269    4     FAIL ranking
TLV-11   tlv      33    preselect  0.982   0.209   Port Said                      הר סיני 5                32.06470,34.77237    1     ok
TLV-12   —        0     no_match   0.000   null    —                              —                        —                    —     FAIL no_region_searched
TLV-13   tlv      9     no_match   0.767   0.131   Gouje and Daniel               אנשי בראשית 28           32.22283,34.86673    —     FAIL not_in_prefilter
TLV-14   tlv      5     confirm    0.822   0.002   Hostel 51                      51 Yehuda Halevi St.     32.06277,34.77417    2     FAIL ranking

NEG-03   tlv      93    confirm    0.813   0.011   Tirza wine bar                 החלוצים 3                32.06035,34.77348    —     ok

top-1 correct: 8/15  (7/14 on the TLV cases; NEG-03 is the eighth)
bands: preselect=5  no_match=5  confirm=5
false auto-accepts (preselect AND wrong): 0
failure kinds: not_in_prefilter=3 (TLV-02 TLV-08 TLV-13)  ranking=3 (TLV-07 TLV-10 TLV-14)  no_region_searched=1 (TLV-12)
negatives (expect NONE): 1; reaching preselect: 0; reaching confirm: NEG-03
```

`rank` is the position of the first acceptable row in the **whole** ranking, not the product's top
five — that is how `not_in_prefilter` (the row never came back from the database) is separated from
`ranking` (it came back and lost). Those are two different defects with two different fixes, and a
top-1 verdict alone cannot tell them apart. `maxResults` does not affect the band or the margin
(`score.ts` divergence 2), so asking for the full ranking changes no number above.

**The one assertion that matters — zero false auto-accepts — holds.** All five `preselect` results
are the right venue. The margin gate is doing the work it was designed for: TLV-14 scores 0.822
with a margin of 0.002 and is correctly held back for confirmation rather than auto-accepted onto
the wrong pin.

## Adjudication rules

`expected_name` in `benchmark-spec.json` is prose for a human ("any real Tel Aviv venue named Bar
51"). The harness encodes one machine rule per case, derived from that case's `expected_name` /
`expected_area`:

- **Name match is the default.** The spec's own `scoring.branch_ok` says any genuine branch counts
  for a multi-branch case with no branch hint — so TLV-05 (Miznon), TLV-10 (Anita) and TLV-14
  (Bar 51) carry no address constraint.
- **An address constraint is added only for TLV-06 and TLV-07**, where the spec pins a street
  ("Shlomo HaMelech / King George") *and* the index really does hold several distinct HaKosem
  venues. Without it the Sarona Market branch would score as a pass and a genuine wrong-branch
  failure would be invisible — which is exactly what TLV-07 is.
- **NEG-03 counts as correct when it does not reach `preselect`**, which is `06` §6.3's own
  standard for the three no-name captions ("caught by the 0.92 gate"). Under the stricter reading
  of `benchmark-spec.json` ("the provider returns nothing"), NEG-03 is a *failure*: at 0.813 it
  clears the 0.80 `confirm` floor and the user is shown "Tirza wine bar" as a candidate for a
  caption that names no venue. The summary reports both readings; the pass/fail column uses the
  documented one.

## Per-case findings

Everything below was re-checked directly in `poi_index` with `psql`, not inferred from the run.

**TLV-02 (`Cafe Levinsky 41`) — genuinely absent.** No row whose name contains `levinsky 41` or
`לוינסקי 41` exists in the extract. The nearest neighbours are `street39levinsky`,
`לוינסקי 53 - Levinsky 53` and `סביח לוינסקי`. Nothing in the resolver can fix this.

**TLV-08 (`אורנה ואלה`) — genuinely absent.** The only `%אורנה%` row in the index is
`אורנה בן חיים יחסי ציבור ותקשורת`, a PR firm. Not a resolver defect.

**TLV-13 (`Oved Daniel Sabich`, Givatayim) — NOT absent; unreachable from a Latin query.** The
index holds `הסביח של עובד` at `סירקין 7, גבעתיים` (32.07690, 34.81428), which is very probably the
intended venue (the case's own `label_confidence` is `low`, so the identification is a judgement,
not a fact). The query is Latin, the row is Hebrew, and the prefilter is a per-token substring
match, so the row can never be returned — `acceptedRank` is `null` for a row that is sitting in the
table. This is the Hebrew↔English alias gap (`06` §7.1 mitigation 1a, `10` §11, `score.ts`
divergence 5), not a coverage gap, and it is fixed by populating `alt_names`, not by re-ingesting.

**TLV-12 (`Belboy tel aviv`) — the executed failure is region scoping, not the prefilter.**
`regionsSearched` is `[]` and `candidatesPrefiltered` is `0` because the case has
`city_hint: null` and the city is inside the query text, so `regionHintFor(null, null)` returns
`unknown` and **the database is never queried**. The substring point is separately true —
`select count(*) from poi_index where name_norm like '%belboy%'` is `0`, so a prefilter would have
returned nothing either — but it is not what happened on this run, and the two have different
fixes: a city extracted from the query text (or a country-scoped fallback) versus the trigram
similarity arm of `10` §5 that PostgREST cannot express.

**TLV-07 (`הקוסם`) — wrong branch, and the margin is 0.053.** Top-1 is
`הקוסם שרונה מרקט` (0.885), the right venue `פלאפל הקוסם` at `שלמה המלך 1` is second (0.832). Both
are in `confirm`, so the user sees both; the defect is the ordering, not a fabricated pin.

**TLV-10 (`Anita Gelato`) — `gelato` is treated as identity-bearing, and it dominates.**
`queryTokens('Anita Gelato')` is `['anita','gelato']`; `gelato` is not in `SCORING.generic`. So
`Zucca Cafe & Gelato` scores 0.786 (token coverage 0.742 **plus** the 0.18 category-hint bonus,
`cafe` vs the hint `cafe`) and every plain `Anita` row scores 0.663 with no category bonus, despite
`Anita`'s `ice_cream_shop` being the more specific category. Correct row at rank 4. Confirms the
orchestrator's reading of this case.

**TLV-14 (`Bar 51`) — a *different* defect from TLV-10, and the more interesting one.** Here the
generic list works: `bar` **is** in `SCORING.generic`, so `queryTokens('Bar 51')` is `['51']` and
the query has almost no identity left. Measured components:

| candidate | Overture category | `nameScore` | category bonus | `dataset_confidence` | score |
|---|---|---|---|---|---|
| `Hostel 51`, 51 Yehuda Halevi St. | `bar` | 0.785 | **+0.18** | 0.770 | **0.822** |
| `Bar 51`, הירקון 59 | `restaurant` | **1.000** | +0 | 0.998 | 0.820 |

A perfect 1.000 name match loses by 0.0024 because Overture files the actual bar as a
`restaurant` and files a hostel as a `bar`. The category hint is worth 0.18 — more than the entire
gap between an exact name match and a 0.785 one — and that is a weight question (`06` §6.1 step 4),
not a "generic word" question. The band gate caught it: `confirm`, not `preselect`.

**TLV-06 (`HaKosem`) — the coordinate is corroborated.** Two rows sit at `שלמה המלך 1`:
`HaKosem` (32.076416, 34.776737) and `פלאפל הקוסם` (32.0764275, 34.7766800). They are **~5.4 m
apart**, i.e. two records of the same storefront, which is independent corroboration that the
address and the point agree. I did **not** re-measure the "~11 m from the real venue" or the
"555 m / 483 m" model-guess figures — that needs a ground-truth coordinate this harness does not
have, so those numbers remain the orchestrator's, unverified here.

**TLV-03 / TLV-06 — `margin = null` from a single prefiltered candidate is real.** Both prefiltered
exactly one row (`pre = 1`), both are correct, both land in `confirm` because
`Confidence.margin` is `null` and `preselect` needs a measured margin (`score.ts` divergence 1).
Two of the fourteen cases are correct-but-unconfirmable for want of a second candidate.

## What this run does *not* establish

- **Nothing about `tyo` or `ldn`.** Both regions are `is_loaded = false` with 0 rows.
- **Nothing about the 30 non-TLV benchmark cases**, which have no loaded region to run against.
- **Nothing about the import route.** This exercises the resolver port directly. Whether
  `/api/imports/*` calls it, stores what it returns, and shows the right thing is a separate
  verification against the running app.
- **The "index empty" skip branch is reasoned, not exercised** — testing it would mean emptying a
  loaded table, which the guardrails forbid. The "region not loaded", "no key", "non-local URL" and
  "container down" branches were each run and printed their reason.
- **`06` §6.3's headline accuracy figures are not comparable to this table.** Those were measured
  with a Python prototype over a DuckDB extract of a *narrower* bbox; this is the TypeScript
  resolver over the loaded `0020` launch area, and the candidate sets differ.
