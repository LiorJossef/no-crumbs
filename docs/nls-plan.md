# Natural Language Search — the plan

**Status: planned, not staffed. Nothing below is built.** Written 2026-09-04 against commit
`7fb1bed` on `no-crumbs-implementation`, measured against the local database (64 places, 59 saved
places, 3 collections). Staging and production were not contacted and no provider quota was spent.

The feature in one sentence: **the user types a sentence, a small model turns it into a structured
intent, and the deterministic filter code that already ships does the filtering.** The model never
returns places.

**V1 is Stages 1 and 2, as a separate search surface** — owner ruling, 2026-09-04. The existing
search field is not touched. How the two searches eventually become one is deferred until this has
been used against a real library; §7 records the candidate designs so that argument is not had
twice.

---

## 1. What the inspection established

Five specialists measured the code and the local database before any of this was designed
(`nextjs-architect`, `supabase-database`, `maps-geospatial`, `ai-extraction`, `ux-interaction`).
Four findings moved the design.

### 1.1 The filters already compose, in one place

`src/app/map/map-page-client.tsx:734-754` runs four pure passes over the whole library, client-side,
on state held in four `useState` cells:

```
places
 → filterByTag(activeTags)        L734
 → filterByVisit(visitFilter)     L739
 → filterByCategory(activeCategory) L746
 → filterPlaces(query)            L754   ← the map draws this
 → ∩ listScope.memberIds          L791   ← the list renders this
```

Interpreting a sentence into those four values needs no new execution path, no query language and
no server-side filtering. **Stage 1 writes state and nothing else.**

`getSpots()` (`src/app/map/_lib/get-spots.ts:298`) has no `.eq`, no `.limit` and no `.ilike` — the
entire library comes down on every `/map` render, RLS-scoped to the user. At the hundreds of saved
places this product realistically reaches, client-side filtering is microseconds.

### 1.2 Proximity has already solved Tel Aviv

The library stores four spellings of one city. Applying `normalise()` still leaves four distinct
keys, because it folds hyphens and accents but nothing across scripts:

| stored | normalised | rows |
|---|---|---|
| `תל אביב-יפו` | `תל אביב יפו` | 14 |
| `Tel Aviv-Yafo` | `tel aviv yafo` | 8 |
| `Tel Aviv` | `tel aviv` | 2 |
| `ת״א` | `ת״א` | 1 |

**But `clusterByProximity` has already merged all four into one 20-place area.** Today
`filterBySearch("tel aviv")` returns 7 rows and `filterBySearch("תל אביב")` returns 13. Neither
returns 20. That is the defect Stage 2 closes, and it closes by *expanding a match to its cluster*,
not by building a gazetteer.

`normaliseLocality()` at `src/domain/places/clusters.ts:463` is a bare alias of `normalise()`, with
a comment saying it exists so a future locality rule has one place to land. Nothing has landed.

### 1.3 The dishes are in Hebrew; the prose is in English

58 distinct dish strings across the library, roughly 50 of them Hebrew (`ספוליאטלה`, `סינייה קבב`,
`בורקס תפוחי אדמה`), while `why_go` is English. Postgres ships no Hebrew text-search configuration,
so `tsvector` is worse than useless here. **Stage 3's real problem is translation, not retrieval** —
see §8.

### 1.4 The benchmark exists and was never run

`docs/evidence/.local/nls-benchmark-dryrun.json`, dated 2026-08-30: 35 golden queries across
English, Hebrew and mixed script, two prompt arms, `temperature: 0`, already aimed at
`gemma-4-26b-a4b-it` — and marked `"DRY RUN — no call was made."` The prompt already carries the
right rule: *"emitting a filter the query does not state is worse than emitting none."*

Someone built the eval and stopped before calling it. **That is the Stage 1 acceptance gate,
already paid for.**

---

## 2. Architecture

The model proposes; only the user changes the result set.

```
sentence panel ──► Gemma 4 ──► SearchIntent ──► clamp to this library
  explicit submit   6s cap      closed enums     no rows behind it → dropped
                                                          │
                                     preview: "{n} places" │  nothing has changed yet
                                                          │
                                              [ Show these ]
                                                          ▼
                        four useState cells · map-page-client.tsx
                        activeTags · visitFilter · activeCategory · query
                                                          │
                        filterByTag → filterByVisit → filterByCategory → filterPlaces
                                          (unchanged)

the existing search field · untouched · still live, still literal, still zero latency
```

### 2.1 The clamp, applied twice

**An intent may only select values that exist in _this user's_ library.** Server-side against the
vocabulary that was sent, then again client-side against the live facets before render. A category
absent from the facets, a tag absent from the tag list, a city absent from the areas is dropped
before it reaches the screen.

Three consequences, and they are why this rule is the centre of the design:

- every chip shown has rows behind it before combination, so a hallucinated filter can never be the
  reason a list is empty;
- prompt injection is **structurally inert** — the model returns enum values, never places, and a
  value with nothing behind it never renders (golden case `nls-020` is exactly this attack);
- the "understood you but nothing matches" case becomes a genuine combination problem rather than a
  fabrication.

It costs one `filter()` call.

### 2.2 New files

| File | Purpose |
|---|---|
| `src/domain/search/intent.ts` | schema, validation, the clamp. Pure, testable with no model |
| `src/app/api/search/interpret/route.ts` | auth, budget, abort signal, rate limit |
| `src/components/sheet/sentence-panel.tsx` | the surface and its five states |
| `src/integrations/llm/query-intent.ts` | the adapter, its own short prompt and version string |

### 2.3 Untouched, on purpose

`PlaceSearchField`, `src/domain/places/search.ts`, every existing empty state, every camera mover,
and **the database — zero migrations across both stages.**

### 2.4 The prompt gets its own module, not a flag

`src/integrations/llm/note-extractor.ts` is the precedent and its header carries the finding: a rule
added to the 21,000-character extraction prompt produced **zero** candidates over four iterations,
and the fix was the shape of the call, not the wording of the rule. Query→intent is a third sibling
task with its own `INTENT_PROMPT_VERSION`, not a branch in `SYSTEM_PROMPT`.

One trap recorded there at the cost of an afternoon: the model returned a bare array when asked for
`{"places":[...]}` and the wrapper read `.places` off it and got `undefined`, silently. Send
`responseSchema`, not only `responseMimeType`.

---

## 3. The V1 surface

One entry point, one panel, one submit. It is an **input** surface, not a results surface: what it
produces is the same map and the same list, filtered — because it is the same library, and a second
way to render places would be a second product.

### 3.1 The flow

1. **Entry.** A control that opens the panel. Deliberately *not* a fifth trigger in
   `library-filter-bar.tsx` — that row's grammar is one trigger per axis, each stating its current
   value at rest, and this has neither an axis nor a resting value.
2. **Type a sentence and submit.** Nothing filters as you type here; this input has no live
   behaviour to be confused with, which is the whole point of separating it.
3. **The interpretation is shown in the panel** as plain outline chips, with a count of how many
   places it would produce. Nothing on the map has changed yet.
4. **Show these** writes the four filter cells, closes the panel, moves the camera.
5. **Undo** restores the previous filters, scope and camera as one transaction.

### 3.2 The preview count

Showing `{n} places` before applying turns the panel into a preview rather than a leap, and it is
nearly free — the clamp already runs the filters client-side to know which values have rows behind
them. It also makes the empty case honest before it costs anything: `no places` in the panel beats
an empty map the user has to undo their way out of.

### 3.3 Breakpoints

**Mobile (390×844)** — the panel opens over the sheet using the existing inline-panel machinery, the
same path the filter axes already use, so the sheet, the keyboard and the drag behaviour are all
solved. Submit is a real button, not the keyboard's Return.

**Desktop** — the same component as an anchored popover, the way `library-filter-bar.tsx` already
splits. One genuine difference: Return in the input *may* submit here, because this input has no
second behaviour to collide with. That is the opposite of the rejected design in §7.4, and it is
safe for exactly the reason that one was not.

### 3.4 Copy

| Slot | String |
|---|---|
| Entry control | `Find places from a sentence` |
| Input placeholder | `What are you looking for?` |
| Submit | `Find places` |
| In flight | `Reading…` |
| Result | `Show these` · `{n} places` |
| Applied | `Filtered from what you typed.` · `Undo` |
| Nothing understood | `Nothing in your places matches that.` |
| Failed | `Couldn't do that just now.` · `Try again` |

**The feature has no visible name, and "Smart Search" cannot be one.** `voice-and-vocabulary.md` §4
bans `AI`, `LLM` and `model` outright; "smart" is a euphemism for exactly those, and it is an
adjective about how good our own machinery is, which §7 rule 1 cuts on sight. The controls say what
they do. If a name is ever forced — release notes, the deck — use **Filter suggestions**. `NLS` as a
task ID is fine; it just never reaches a string.

Also banned by extension: `We think you meant…` and `We understood…`. Both editorialise about our
own certainty.

### 3.5 Accessibility

- The panel is a labelled dialog; focus moves to the input on open and returns to the entry control
  on close.
- The interpretation is announced politely once, including the count:
  `Restaurant, Italian, not been yet, Tel Aviv. 12 places.`
- `Show these` carries the whole interpretation as its accessible name, so label-in-name holds.
- On apply, the **existing** results live region reports the new count — unchanged and untouched.
  `ux-map-is-the-query.md` §7.1 is explicit that a second live region destroys the page.
- The input takes `dir="auto"` and logical properties from the start, so it inherits none of the
  existing field's RTL debt (see §6).

---

## 4. Stage 1 — sentences become the filters that already exist

### 4.1 Intent shape

| Field | Values | Executed by |
|---|---|---|
| `category` | `restaurant` · `cafe` · `bar` · null | `filterByCategory` |
| `tags[]` | 0–2 from the closed 15-value `SUB_TAGS` list | `filterByTag` |
| `visit` | `been` · `not-been` · `all` | `filterByVisit` |
| `keyword` | free text, copied verbatim, never translated | `filterBySearch` |

Both vocabularies are closed and live in `src/domain/places/taxonomy.ts`. Neither has a CHECK
constraint in the database — they are enforced in TypeScript and by data migrations `0028`/`0029`/
`0030`. The model's output is clamped against them; it never gets to invent a filter value.

**`productCategoryFor` precedence must be reproduced, not shortcut.** Category resolves
`category_override` → `provider_category` → extracted hint → null, in TypeScript at read time. A
WHERE clause on `places.category` alone is wrong for ~24 of 64 rows.

### 4.2 Scope correction — two axes in the original brief are not axes

- **Source.** `sources.platform` is `CHECK IN ('tiktok')` — a single value, so it cannot
  discriminate. The nearest real axis is `saved_places.origin` (`import` | `manual`), which is worth
  including.
- **Collections.** A separate filter model: `collection-content.tsx:328` holds its own `query` and
  an `addedBy` filter, and has no tag, visit or category axes at all. `collection_items.place_id`
  points at `places`, not `saved_places`, so the per-user overlay is not even visible to a
  collaborator. Folding collections in means unifying two filter systems. **Recommend deferring.**

### 4.3 Done when

- The 35-case golden set runs live against Gemma 4 and is scored, with the number published in
  `docs/evidence/` whatever it turns out to be.
- **≥ 90% no-false-filter.** The gate that matters: inventing a filter is far worse than returning
  none, because it silently hides the row the user wanted.
- ≥ 70% exact-intent match, Hebrew and English scored and reported separately.
- The clamp is proven — a hand-injected intent naming a category the library lacks produces no chip.
- The preview count always equals the number of places that appear after `Show these`. A mismatch
  here is the feature lying.
- Every failure path leaves the panel open with the sentence in it. Verified by pulling the network,
  not by a unit test.
- **The existing search still behaves identically**, verified by using it.
- Used on a real phone in both languages, at both breakpoints, with the persisted rows read
  afterwards.

---

## 5. Stage 2 — geography

### 5.1 Resolution order

1. **Country first.** `toCountryCode()` (`src/domain/places/country-code.ts`) already handles
   English and Hebrew through ICU over `INDEX_LOCALES = ['en','he']`, with deprecated-alias
   filtering. `Italy` and `איטליה` both give `IT`. Covers 56 of 59 saved rows. `countryBuckets()`
   already gives the count, the bounds and the camera.
2. **Then city**, against the distinct localities in the user's own library: exact normalised match
   → a small he↔en alias table → prefix → Jaro-Winkler ≥ 0.9
   (`src/domain/places/jaro-winkler.ts` exists, used today only by the resolver).
3. **Then expand to the cluster.** Matching `tel aviv` hits 7 rows; expanding to the area those rows
   belong to gives all 20, every spelling included. The clusters are already computed at
   `map-page-client.tsx:574` — the expansion is free.
4. **Unresolved is a real answer.** The interpretation carries no place filter and the panel says so
   before anything is applied. It must never quietly become a text search that looks like it worked.

The alias table must be a **join only** — mapping a query term to a set of normalised keys. The
moment it edits `places.locality` it becomes a fabrication. Precedent for the shape and its traps
(including the `normalise()` punctuation trap that makes `ארה״ב` and `ארה ב` two entries) is
`ALIASES` in `country-code.ts:57`.

### 5.2 The camera

It moves **on apply only**, through the movers that already exist: **mover 4** for an area, **mover
5** for a country. The list in `map-page-client.tsx` stays at nine and gains a trigger, **and its
docblock is amended in the same commit** — that file's own rule is that the list is only worth
having if it is complete.

The camera frames the user's own pins, never a geocode, so it can never fly somewhere empty. Undo
restores it in the same transaction as the filters.

The panel itself moves nothing before apply, which agrees with the rule already written at
`map-page-client.tsx:538`: **typing is not a camera mover and must never become one.**

### 5.3 Two rules against confident wrongness

- **Display the user's own spelling, never the model's canonical string.** A library written
  `תל אביב-יפו` must not get a chip saying `Tel Aviv`. `clusterLabel()` already returns the raw
  plurality spelling and returns `null` on a tie rather than flipping a coin.
- **The cluster decides the list; the bounding box only moves the camera.** Coupling the list to a
  rectangle is a bug this codebase already fixed once (`active-area.ts` opens with a docblock about
  it).

### 5.4 Geocoding the query is rejected

Three independent grounds, any one sufficient:

1. **Quota.** Google Places is 100/day. A search box would burn it in an afternoon.
2. **Licensing.** A geocoded scope drawn on a MapLibre/CARTO map is exactly the
   Google-content-on-a-non-Google-map pairing `06` §3.1 forbids and
   `place-resolver-factory.ts:96` refuses in production. The feature would be dead where it matters.
3. **It answers the wrong question.** It can say where Kyoto is; it cannot say whether the user
   saved anything there.

### 5.5 Open decision before this stage ships

Stage 2's prompt sends the user's own city names to the provider so the model can pick from them
(`citiesShownToModel` in the dry run). That is a question about location data leaving the device and
belongs to `security-privacy`. **Stage 1's prompt carries no city names**, so Stage 1 can proceed
while it is answered.

### 5.6 Done when

- All four stored Tel Aviv spellings, plus `תל אביב` and `Tel Aviv-Yafo`, each return the same 20
  places. This is the measured defect; it closes or the stage is not done.
- `in Italy` and `באיטליה` agree, and the 3 rows with no country code are reported rather than
  silently dropped.
- A city the user has nothing in produces no place filter and no flight.
- Chips show the library's own spelling, verified on a Hebrew-majority area.
- The camera flies once, respects reduced motion, and Undo returns it.
- The mover docblock is amended in the same commit as the code.
- `security-privacy` has signed off on sending locality names to the provider.

---

## 6. Model, cost and edge cases

### 6.1 Gemma 4 — VERIFIED

Released **2026-03-31**, Apache 2.0, sizes E2B/E4B/12B Unified/26B A4B/31B, natively multilingual
(140+ languages), with native structured JSON output
([releases](https://ai.google.dev/gemma/docs/releases),
[overview](https://ai.google.dev/gemma/docs/core),
[announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)). Served
on the Gemini API as `gemma-4-31b-it` and `gemma-4-26b-a4b-it`, **free of charge, free tier only**
([pricing](https://ai.google.dev/gemini-api/docs/pricing)).

**`responseSchema` works with `gemma-4-26b-a4b-it` — VERIFIED in this repo, by measurement.** Commit
`2e3aee0` shipped it as the adapter default while sending `responseSchema`. Google's own
Gemma-on-Gemini-API page does not mention `responseSchema`, so the repo measurement is the better
evidence.

**The warning that must be carried.** This repo tried Gemma 4 for *extraction* and rejected it:
latitudes correct, longitudes wrong by 15–40°, putting Israeli venues in Iran, India or Egypt.
Reproduced with the full prompt, a hardened prompt, and a bare single-fact prompt — a genuine gap in
the small model's geographic recall, not a wording problem
(`src/integrations/llm/gemini.place-extractor.ts` header).

It should not transfer to query→intent, which needs no world knowledge: it maps words onto a
3-value enum and a 15-value enum, and Stage 2 resolves cities against the user's own saved
localities rather than the model's geography. **"Should not" is why the golden set is a gate and not
a formality.**

Fallback is one environment variable: `gemini-3.5-flash-lite` is already wired, and at
$0.30/1M in and $2.50/1M out is about **$0.0002 per search**.

**ASSUMED / unmeasured, and both get measured in Stage 1:** Gemma 4's free-tier requests-per-day on
the Gemini API (Google now defers to the AI Studio dashboard — nobody here has read it), and the
real latency of a short intent-shaped call. Every latency figure this repo holds is for the ~5k-token
extraction prompt: p50 ≈ 2.2–2.5 s with a fat tail. **The existing extraction path has no timeout
and no retry**; this one must have both a hard cap and no retry.

**Schema complexity is budgeted and fails as a bare 400.** `json-schema.ts` records the live
bisection: `maxItems` above 8 returns `400 INVALID_ARGUMENT` with no explanation, and a 15-value
enum on a *nested* array's `items` is flagged there as the open, unmeasured risk. The intent schema
walks straight into it. **Bisect before trusting it**; the failure mode is every search returning
400.

### 6.2 Edge cases

| Case | Behaviour |
|---|---|
| Prompt injection | Golden case `nls-020`. Structurally inert via the clamp — enum values only, and a value with no rows never renders. Scored as a gate. |
| Empty submit | Submit disabled until there is text. No call. |
| Emoji only | Golden case `nls-019`. Normalises to nothing; the panel reports nothing understood before anything is applied. |
| Model invents a tag | Dropped by the clamp before it can become a chip. |
| Partial understanding | The unmatched part stays a keyword and still filters — `Kyoto` matches `locality` text. Less strict, not broken, shown without apology. |
| Understood but empty | The preview count is `no places`. The user never lands on an empty map they must undo out of. |
| Same query, different answer | `temperature: 0` is "usually the same", not deterministic — this repo has measured captions flipping under an unchanged prompt. Undo must always restore the exact prior state. |
| Slow or failed call | The panel stays open with the sentence in it, so the user edits rather than retypes. Never an error screen. |
| Quota exhausted | Indistinguishable from any other failure. Never mentioned to the user. |
| RTL | The new input gets logical properties from the start. **Note the existing field's debt:** its leading glyph is `left-4` and its clear button `right-1.5`, both physical, and both will collide with Hebrew if §7 ever unifies the surfaces. |
| Hebrew final forms | `normalise()` folds niqqud for free but not ם/ן/ץ, so a final-form keyword can miss. Known gap, belongs to `normalise()`. |
| Dead column | `places.region` is NULL on 64 of 64 rows. Nothing may reason about it. |
| Local DB drift | The local container is behind the migration files: `place_mentions` (`0031`), `profile_names` (`0035`) and the `*_confirmed_at` columns (`0036`/`0037`) are designed but unapplied, and `supabase_migrations.schema_migrations` is unreliable. **Plan against measured columns only.** |

---

## 7. Future UX — bringing the two searches together

Deferred by owner decision, 2026-09-04, not by omission. V1 ships two ways to find a place, which is
a real cost and is accepted deliberately: it is far easier to judge these designs after using the
interpretation against a real library than to argue them in advance.

**What to watch while V1 is in use**, because it is what decides between them: how often the
sentence panel is opened at all; how often a sentence is submitted only after the ordinary search
has been tried and failed; how often a preview is abandoned rather than applied; and whether the two
entry points feel like one product or two. The first three are instrumentable; the fourth is the
owner's judgement.

### 7.1 The reinterpret button — strongest candidate

The existing field stays literal and live. Once it has text, a persistent control under it —
`Filter from what you typed` — reads that same text as a sentence. **Not a mode: an action**, so
there is nothing to set in advance and nothing to switch back from, because Undo already returns
you.

- **For:** one field, one live behaviour, one explicit verb. Always visible, so it cannot ship
  invisible. Needs no gate, no debounce and no heuristics — the user says when.
- **Against:** someone has to notice a button and press it, so it will be used less than something
  that offers itself. The control must appear only when there is text, or an empty field carries a
  verb with nothing to act on.

### 7.2 The offer bar — viable, more machinery

Interpretation as a suggestion. When a typed query settles and looks worth interpreting, a
dismissible row appears as the first row of the results list showing the filters it would set;
nothing changes until it is tapped.

- **For:** zero effort from the user, and the best possible first encounter — watching a sentence
  become four filter pills teaches the feature in one moment.
- **Against:** it needs the whole "when do we call?" subsystem — a 700 ms debounce, an
  outcome-aware gate, a session cache, a two-call cap, abort-on-keystroke, keyboard-occlusion
  suppression. And an offer nobody taps ships invisible, so it needs a kill number agreed **in
  advance** (suggest 15% applied ÷ shown; below it, delete the automatic half).
- **If it is ever built, the gate must be outcome-based, not shape-based.** "Looks like a sentence"
  cannot work in this library: Hebrew tokenises differently, and two-word queries like
  `dizengoff cafe` or `רמת אביב` are ordinary searches that look exactly like sentences. A short
  query earns a call only once the literal search has demonstrably failed.
- It must also sit **inside the scroll area, not in the fixed header** —
  `ux-overwhelm-audit-2026-09-02.md` measured 46% of an 812 px viewport spent on controls before the
  first place, and a new band between the field and the filter bar re-opens that wound.

### 7.3 A mode toggle on the field — rejected

A segmented control (`Words | Sentence`) set before typing.

**Nobody knows which mode they need before they have typed.** Is `sushi tel aviv` a literal search or
a sentence? You find out by trying, so the toggle makes you guess and punishes a wrong guess with a
retype. It also doubles the surface — two modes, two empty states, two sets of rules — and leaves
one question unanswerable: in Sentence mode, does typing still filter live? If yes, the ambiguity is
back. If no, the instant feedback that makes the current search good is gone.

### 7.4 Enter in the existing field — rejected

Typing filters live; Enter sends the sentence for interpretation. **One control, two rules.** On
mobile the keyboard's Search key would be actively lying about what it does — it reads as "search",
not "now interpret my sentence". This was the first proposal, rejected by the owner on 2026-09-04,
and it is recorded here so it is not re-proposed.

### 7.5 What carries over regardless

Three properties survive whichever design wins, and should not be re-litigated:

1. the interpretation is written into **the filter controls that already exist**, never a parallel
   set;
2. it is undoable as **one transaction**, including the camera;
3. **offer chips never wear the active filter pill.** That pill means *this is on*; an offer wearing
   it would be lying about state before the user agreed to anything.

---

## 8. Future work — Stage 3, parked

Semantic search over dishes and notes. Moved out of the MVP by owner ruling, 2026-09-04. The
findings are kept so it can be picked up without re-deriving them.

- **Half of it already works.** `src/domain/places/search.ts` already searches `dishes` and `tags`
  alongside name, category, locality and note — deliberately, and the file argues the case in its
  own header. `momos` finds The Laughing Yak today. `saved_places.dishes` is a real `text[]` column
  from `0019`, populated on 17 of 59 rows, and every item is grounded against the caption by
  `src/domain/extraction/grounding.ts` — a dish the caption did not name is dropped as an invented
  menu.
- **The gap is translation, not retrieval.** `schnitzel` → `שניצל`, `something sweet` → `ספוליאטלה`.
- **The lean answer is query expansion** — the same call returns up to four keyword variants and the
  existing matcher runs over all of them. One prompt field, zero migrations.
- **Rejected: `tsvector`.** Postgres ships no Hebrew text search configuration; `simple` gives
  stemless matching that `normalise()` + substring already gives without a migration, and `english`
  over a Hebrew corpus is worse than nothing.
- **Rejected for now: pgvector.** `vector 0.8.2` is available in the local image but not installed,
  and installing it **fails `supabase/tests/inventory.sql` check 8** — a hard `raise exception`, not
  a notice — so the allow-list must be edited in the same migration. Add a table with its own
  RLS/FORCE/REVOKE, a backfill, a re-embed path on every `apply_saved_place_extraction` write, a
  multilingual embedding provider and a per-query embedding call. Against a 58-string corpus, that
  is the expensive answer to a translation problem. It needs an explicit owner ruling.
- **If it ships:** every expanded match must show *why* it matched, and expanded matches must be
  appended after literal ones under a heading, never interleaved.

---

## 9. Open decisions

1. **Where the entry point lives.** Proposal: a control under the search field rather than a fifth
   trigger in `library-filter-bar.tsx`, whose grammar it would break. The one surface question V1
   still has open.
2. **Gemma 4 as default**, with `gemini-3.5-flash-lite` one environment variable away, gated on the
   golden set (§1.4, §6.1).
3. **Collections deferred out of Stage 1** (§4.2).
4. **Sending the user's own city names to the provider** in Stage 2 — `security-privacy` review
   (§5.5).

---

## Change log

| Date | Entry |
|---|---|
| 2026-09-04 | Written. Five specialists measured the code and the local DB first. **Three revisions in one session, all before any code:** rev 1 proposed Enter in the existing field for three stages; the owner rejected the Enter trigger — *"the existing search filters live on every keystroke, so using Enter for NLS mixes two different search behaviors and is especially unclear on mobile"* — and narrowed the MVP to Stages 1–2. Rev 2 replaced it with an automatic offer bar. The owner then proposed a switch between the two searches, which split into a rejected mode toggle and a strong reinterpret button (§7.1, §7.3). Rev 3 is the owner's ruling: **NLS ships as its own surface, the existing search is untouched, and unification is decided later against evidence.** That ruling deleted the whole "when do we call?" subsystem from V1 — no debounce, no gate, no cache, no call cap — leaving exactly one call per submit. |
