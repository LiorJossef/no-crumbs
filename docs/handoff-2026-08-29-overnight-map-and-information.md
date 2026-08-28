# Handoff — overnight, 2026-08-28 → 29: the map, and the information on it

Brief: take broad ownership, use the product on both breakpoints, fix what is worth fixing,
investigate why the information feels generic, improve the map visually, keep investigating place
recognition. Everything below is on `main` and green unless it says otherwise.

**No specialist agents were used** — this session ran under an instruction not to invoke them.
All of it is my own work.

---

## 1. What shipped

**Five PRs merged**, `main` verified after each: `npm run verify` exit 0, **1021 tests**.

| PR | What |
|---|---|
| [#50](https://github.com/LiorJossef/P-002/pull/50) | Category pins, clusters that open, a basemap in our own palette |
| [#51](https://github.com/LiorJossef/P-002/pull/51) | Information quality: presentation, storage, extraction p9→p11 |
| [#52](https://github.com/LiorJossef/P-002/pull/52) | Whole tag labels, one category vocabulary, `/import` not half-empty |
| [#53](https://github.com/LiorJossef/P-002/pull/53) | Clusters coloured by their majority category, plus idempotent layer setup |

### The map — all three complaints in the brief

1. **"The basemap and pins feel generic."** Every saved place is now a teardrop pin in its
   category's colour with a drawn white glyph, and the basemap is re-tinted at runtime into warm
   paper / mint water / sage parks. Each Positron layer takes a role from its id and every colour
   in its paint moves to that role's hue and saturation **while keeping its own lightness**, so
   Positron's contrast between a road and its casing and every zoom ramp it fades features in with
   survive untouched. A layer whose id matches nothing is left exactly as CARTO drew it.
2. **"The clusters aren't working."** Tapping one now eases into its members
   (`getClusterExpansionZoom`); they size by count and carry the count; and #53 colours them by
   the category holding a strict majority, mint when none does.
3. **"You cannot tell a café from a bar."** `MapPlace.category` was already on every GeoJSON
   feature and had nowhere to go — mapcn's `MapClusterLayer` exposes colours and nothing else. We
   own the source and the three layers now (~150 lines against `useMap()`, which mapcn exports).

**Google Maps is not needed, and that is now a measurement rather than the previous session's
read.** The limitation really was one wrapper component. D2 stands.

### The information

The owner's read was that it feels *"too generic, unclear, or possibly disconnected from what was
actually in the TikTok"*, and was unsure whether that is extraction, enrichment, normalisation,
storage or presentation. **It is three of those**, and they are separated in #51:

- **Presentation.** Three stacked uppercase kickers (`FROM THE POST` / `NAMED IN THE POST` /
  `IN SHORT`) over a card that often held three lines between them, under a category printed as
  the raw enum in capitals. Now: one category word and colour shared with the map, **the street
  address shown for the first time** (it was in the data all along and answers "can I find this
  place"), the caption fragment rendered as a quotation instead of a labelled field, and the
  model's sentence as plain unlabelled prose beneath it — the extracted-vs-inferred distinction
  carried by shape rather than by two competing labels. The quote is hidden when it repeats the
  lines above it, which for `האחים` it did: `📍האחים, אבן גבירול 26` is the name, a comma and the
  address.
- **Storage.** A Hebrew caption yields `countryHint: "ישראל"`, and `toCountryCode`'s ICU index was
  English-only, so the row stored `country_code` NULL. `resolve_place`'s dedup guard compares
  `country_code is not distinct from`, so a NULL misses and writes a second `places` row for one
  venue. The index now covers `['en','he']`.
- **Extraction.** Four rules, each against measured p8 output — see §2.

### Two mobile defects found by using it on a phone

- **The map attribution was completely covered by the sheet** at 375×812 (y=776 of an 812
  viewport). Crediting CARTO and OpenStreetMap is a licence condition, so a credit no phone user
  can see is a compliance defect, not a cosmetic one. Fixed, and verified visible.
- Compass and fullscreen are gone. The map never leaves bearing 0 and already fills the viewport,
  so they were ~100px of stacked buttons buying nothing — and the two lowest buttons in the stack
  were unreachable under the sheet.

---

## 2. What I learned, with the numbers

### The extraction was not inventing things — the *mood* was wrong

I assumed the marketing voice in `why_go` was hallucination. It was not. For `האחים`, p8 wrote
*"Enjoy a dreamy morning breakfast with endless varieties of pastries in a stunning, huge
courtyard"* — and the caption says בוקר חלומי (dreamy morning), כמויות בלתי נתפסות של מאפים
(unimaginable quantities of pastries), חצר ענקית ומהממת (huge and stunning courtyard). Every
adjective is the creator's own; it is a faithful translation.

What makes it read as invented is the **imperative mood**. The caption is first-person ("I had a
perfect morning"); the model turned it into a command. And in doing so it dropped
*"Sunday to Friday"* — the one checkable fact in the caption — to keep "dreamy". p11 forbids the
imperative and requires the checkable detail over the adjective. It now writes: *"Serves a
breakfast featuring a large variety of pastries in a large courtyard, Sunday to Friday."*

### Tags were a broken index, not bad words

p8 emitted `["בקר", "מאפים", "חצר"]`. A tag is an index entry — the user taps it to pull up every
place that shares it — so `מאפייה` and `Bakery` are two tags and neither finds the other. Tags are
English now, whatever the caption's language. (`בקר` is also a typo of `בוקר`: "beef" for
"morning". Writing the concept in English removes that class outright.) Dishes stay verbatim in the
caption's language, because a dish is a quote and a tag is a key.

### One long quote was throwing away a whole caption

The Rustico caption produced `EXTRACTOR_INVALID_OUTPUT` — no places at all — and it was the caption
the model read **best** in the corpus: both branches, both addresses, both Latin variants. One
`evidence` string ran to ~400 characters against a 240 bound, and a Zod failure discards every
candidate in the response, not the field. `clippedQuote` clips instead. A prefix of a substring is
still a substring, so `grounding.ts`'s honesty gate is untouched; no ellipsis, because "…" is a
character the caption does not contain.

### Recognition: 44%, and the composition moved

Corpus of 13 real TikToks, prompt p11: **7/16 (44%), zero false auto-accepts** — the same rate the
owner corrected me to at the start of the session, with a better failure shape.

| bucket | p8 | p11 |
|---|---|---|
| `extraction_miss` | 3 | **1** |
| `absent_from_index` | 1 | 2 |
| `unreachable_in_index` | 1 | 1 |
| `not_auto_accepted` | 4 | **5** |
| false auto-accepts | 0 | **0** |

Gelalucci and WOW moved from "the venue was never named" to "the right venue at rank 1, one tap
away". That is a materially better place to be stuck.

**Two regressions I caused and then fixed, both only visible from a corpus run:**

- p9 broke `מתחת לעץ` — auto-matching at 0.997 through the variant `Under the Tree` under p8, it
  produced `Metahat LeEtz` (a phonetic rendering of a phrase that *means* something) and became
  unreachable. The translate-vs-transliterate rule was already in the prompt **with that exact
  venue as its example**; thirty lines added after it were enough to stop the model following it.
  p10 makes it a decision procedure with the failure named.
- p10's clipping fix let the Rustico caption through, and it immediately produced the corpus's
  **first false auto-accept**: the model offered `Rustico Rothschild` as a *variant*, which matched
  that branch at 0.999 while the Basel branch the caption gives as its address sat at rank 5. p11
  forbids a branch qualifier in a variant — the rule `identifiedName` already had, and it matters
  more for a variant because a variant is what we search on.

### The band-policy idea, and the case that kills it

Full write-up in **`docs/evidence/places/band-policy.md`**. Short version: the largest bucket is
`not_auto_accepted` (5), every one the right venue at rank 1. The obvious fix is a second path into
`preselect` for a decisive margin, and on the corpus it is compelling — 7/16 → 11/16, zero false
auto-accepts.

**The 44-case golden benchmark refutes it.** Under today's shipped weights, TLV-14 (`Bar 51`)
scores 0.900 with margin 0.095 on `Hostel 51` — the wrong venue, which Overture files as `bar` and
which therefore *earns* the category term the real `Bar 51` loses by being filed as `restaurant`.
No threshold separates it: 0.900 sits between two of the correct cases seven ten-thousandths apart,
and a correct case (Palette Bistro, margin 0.0888) has a *lower* margin than it does.

Nothing shipped. `SCORING.bands` is untouched. **The negative result is the useful part**, and it
points somewhere specific: the same category term subtracts from a correct row and adds to a wrong
one. That is the TLV-RANK-1 problem, still open at weight 0.10.

A trap worth recording: my first pass measured against `raw-overture-scored.json`'s **recorded**
scores, where TLV-14 is 0.822 and harmless. That is a different scoring era. Band work has to be
judged on `resimulated()`.

---

## 3. What needs your input

Five things, roughly in order of how much they cost to leave.

1. **Duplicate places are the most visible defect left.** The library shows `HaKosem` three times
   and `La Nonna Brixton` twice. Measured: the two La Nonna rows are **90 m apart** against
   `resolve_place`'s **75 m** merge radius (`08` §1.2), same `name_key`, same country — so the
   guard misses by 15 m. The radius was set for resolver-grade coordinates; an LLM guess is
   documented at 65–470 m out, so for an unresolved place the guard is structurally too tight.
   Widening it is a migration and a real trade: two branches of a chain 200 m apart would then
   merge wrongly. **Not mine to decide overnight.** Note that improving recognition fixes this for
   free — once a venue resolves to an Overture row, everything converges on that row.
2. **The category term in the scorer** (§2's TLV-14). Making a category *mismatch* cost nothing
   rather than 0.10 less than a match would address both the false-accept case and two of the five
   `not_auto_accepted` cases. It re-measures every number in both harnesses, so it wants a session
   with you awake.
3. **Should a lone candidate auto-accept?** `WOW` has one prefiltered row, so it has no margin and
   can never reach `preselect` by construction. "The only row we found, and it matches" is a
   policy question nobody has ruled on.
4. **Drawn glyphs, not emoji** — the previous handoff put this to you and I chose. Reasons: emoji
   render differently on every platform and get toy-ish at pin size, whereas a drawn glyph is
   consistent at 2× DPI and the palette is one table to restyle. Easy to reverse if you disagree.
5. **Seven pin types, not fewer** — also asked in the previous handoff. All seven
   `ExtractedCategoryHint` values get their own colour and glyph. The hues are spread far enough
   apart to stay distinguishable at pin size; the scorer's collapsing of `bakery → cafe` is
   unaffected, because that only ever applied to scoring.

Still open from before and untouched: **the product name**.

---

## 4. What I deliberately did not do

- **No change to `SCORING.bands`** — see §2.
- **No change to the merge radius or `places` identity** — §3.1.
- **No rewrite of the landing page or sign-in copy.** That is positioning, and you have a rebrand
  session planned. I kept to copy that was *technical* rather than *branded*: the ALL-CAPS enum,
  the three stacked kickers, and a two-sentence picker explanation under a heading that already
  asked the question.
- **No dark-mode work.** Still an unsigned first pass.
- **No new spend.** ~40 Gemini calls against the 500/day budget, all on the 13-URL corpus and four
  hand-checked captions.

## 5. Repo state

- `main` clean and green, 1021 tests. Five PRs merged tonight, each verified on `main` after.
- **Verified on localhost** against the live local Supabase and a real TikTok import, at 1280×800
  and 375×812. The Vercel preview builds and deploys green in CI but sits behind Vercel's
  deployment protection, so I could not drive the preview itself — that is unchanged from previous
  sessions, and worth knowing when reading "verified" here.
- Local database has one new real save (`Kohi Coffee Shop`, resolved to Overture at 0.9004 with
  `country_code IL`, English tags, three Hebrew dishes) made by driving the real import flow.
- The 3× `HaKosem` and 2× `La Nonna Brixton` rows are **left in place deliberately** — deleting
  rows is destructive and they are the evidence for §3.1.
- **The older rows still show pre-p11 enrichment**, and that is expected rather than the fix not
  working. `האחים` still carries `בקר / מאפים / חצר` because nothing re-extracts a saved row.
  Backfilling would overwrite existing `tags` / `why_go` / `dishes` — including the hand-written
  fixture sentences on Anat Bakery and Kiaans — and spend ~11 model calls, so it is a data decision
  for you, not one to take overnight. The one row saved tonight through the real flow
  (`Kohi Coffee Shop`) is what p11 output looks like.
- `docs/evidence/places/tiktok-recognition.md` and `-run.json` are rewritten to the p11 run.
