# Growth plan — from demo to product

> **Drafted 2026-08-30** by six specialists working in parallel, each on a different angle, then
> reconciled and spot-verified. Companion to [`facelift-plan.md`](facelift-plan.md), which fixes how
> the product *looks*. This one is about what the client actually **gets**.
>
> Rendered, with the rest of the system: [`no-crumbs-design-system.html`](no-crumbs-design-system.html).

## 1. The diagnosis

**The product is not thin on features. It is thin on places** — and every emptiness downstream is
that one fact wearing a different coat.

The arithmetic of a first session, measured rather than guessed:

| | |
|---|---|
| Places before the map is useful | **~20** (Charter §2) |
| Posts that yield any place | **~27%** |
| Places per import, averaged over all imports | **~0.9** (`04` §194, 3 of 11 posts yielding 10 places; n=11) |
| Places per *successful* import | **~3.3**, capped at 7 |
| Imports to reach 20 places | **~22**, of which ~16 end on the no-places screen |

Two consequences the team had not stated before:

1. **At three places every retrieval feature we shipped is correct and inert.** Search, filters,
   near-me, been/not-been — all of them need density to mean anything. The map is worse than a note
   until roughly place fifteen.
2. **The library does not arrive as a trickle. It arrives in bursts.** A listicle adds 3–7 places in
   one city on one day, separated by long runs of zero. That shape breaks different things than a
   steady stream does — see §3.

## 2. Four defects found while looking, all verified in the code

| # | Defect | Evidence |
|---|---|---|
| **G1** | **The zero-state screen was designed, specified, and never built.** `showImport` is `useState(false)`; `ux-map-is-the-query.md` §5 specifies the empty-library screen — regional map from the browser timezone, import overlay auto-opened — with **"no new components and no permission prompt"**, and line 6 of that same document admits the overlay is unbuilt. The first screen a new user sees is one sentence and a plus button | `map-page-client.tsx:170` |
| **G2** | **A post naming 13 places yields zero places, not twelve.** `ExtractionEnvelopeSchema` caps `candidates` at 12; `safeParse` fails the whole envelope, and the item-by-item salvage runs only *after* the envelope parses. Total loss, silently | `domain/extraction/schema.ts:401,458,463` |
| **G3** | **Our best real listicle loses its last place by one.** The `exploringlondon` post names 8 venues; `MAX_CANDIDATES = 7`. The 8th is extracted, never resolved, shown capped. `GEMINI_MAX_CANDIDATES = 8` caps the model schema too, so there is no headroom to widen into | `domain/import/pipeline.ts`, `gemini.place-extractor.ts:70` |
| **G4** | **An Instagram link becomes a place name.** `universal-input.ts` classifies any non-TikTok URL as `kind: 'text'`, which `manualAddSeed` hands to manual add, so the Add sheet offers `Add "https://www.instagram.com/reel/D…" manually`. `/import` handles the identical URL correctly. Two surfaces, opposite behaviours | `universal-input.ts:45-47` vs `import-page-client.tsx:429` |

## 3. What bursts break, in the order they break

Re-modelled once we knew a single import can add seven places.

1. **Area granularity breaks first, and in weeks rather than at 300 saves.** An area is a ~50 km
   cluster, so all of Tel Aviv is one pill. Twenty successful listicle imports in one city is ~66
   places behind a single pill, and the area→pin transition drops straight into an overlapping mat.
   **A ~1.5 km neighbourhood band moves from "nice at scale" to "the first thing that breaks".**
2. **The list stops being a library.** `created_at desc` with seven rows written in one transaction
   means the top of the list is one post's worth of places with arbitrary tie-breaks. The sheet
   becomes the last listicle you pasted, re-rendered. **Date ordering does not survive batch writes.**
3. **`Not been yet` stops discriminating.** Seven places arrive unvisited together, so the chip that
   separates intent from history flattens as bursts come to dominate.
4. **The camera can betray the moment.** A national-scope listicle fits to a box that can land in the
   *area* band, so a user's seven new pins resolve to two grey pills at the exact moment they most
   want to see them. Unverified against a real import; worth checking.

## 4. What we already know and never show

Every row below is queried, mapped into a type, and reaches a renderer that ignores it.

| Fact | Where | Rendered? |
|---|---|---|
| `collections.description` | queried twice, mapped twice (`get-collections.ts:101,160,202,276`) | **Nowhere** — only fed back into the edit form |
| `creatorBreakdown` — places per creator | computed at `profile-stats.ts:163` | **Nowhere** — the section was deleted 2026-08-30, the computation stayed |
| `collections.updated_at`, `collection_items.created_at`, `collection_members.joined_at` | `get-collections.ts:174,72,51` | **Nowhere** |
| Tag frequency across the library | `tags` on every spot | Chips render; **there is no tag facet with counts**, though categories have one |
| `created_at` as *elapsed* time | `spot.ts:188` | Absolute date, detail only |
| `source_thumbnail_url` | `spot.ts:183` | Detail only — **not on any list row** |
| `saved_places.origin` | column exists | **Not selected at all**; origin is inferred from `tiktokUrl` instead |

**The pattern:** the product has no surface that reads the library *in aggregate*. You can filter by a
tag only if you already happened to see it on a place.

## 5. The plan

### Now — makes the demo a product

| | Item | Why | Size |
|---|---|---|---|
| 1 | **Ship the specified zero-state** (G1) | The first screen, already designed, no new components | S |
| 2 | **Fix G2 and G4** | Two silent correctness bugs on the two ways in | S |
| 3 | **Raise the candidate cap past 8** (G3) | Our best listicle currently loses a place to an off-by-one | S |
| 4 | **Seed the first session from a shared collection** | The join flow already ships (`collections/join/[token]`); it needs curated content and an entry point. This is the only path that makes the map non-empty *before* the first import | S–M |
| 5 | **Thumbnail + elapsed time on the list row** | Twenty identical grey rows become twenty posts | S |
| 6 | **Sort control** — recently saved · nearest · A–Z | Batch writes break recency; the list has one order and three legitimate questions | S |
| 7 | **A neighbourhood band (~1.5 km)** | The first thing bursts break | M |
| 8 | **"This is an ad" disclosure** | One of three venue-naming posts in the corpus is a paid promotion, saved indistinguishably from a friend's recommendation. Extends the existing attribution line; displaces nothing | S |

### Next — real value, real cost

- **Walk radius from a chosen origin.** Near-me *sorts* today; it does not filter. `haversineKm` plus
  a fourth term in the existing AND chain, and a circle on the map. No provider, no stored data.
- **Global search** that escapes the viewport. Today a user who knows the name but not the city must
  move the camera first.
- **`/p/[id]` — a shareable single place.** Every share currently requires creating a collection.
  This is the product's only outward-facing surface. Needs an RLS read policy and a privacy ruling.
- **A destination surface for a city** — promote the existing area row to a real tap target that
  frames, scopes and says `4 not been yet`.
- **The multi-source place.** `saved_place_sources` is keyed `(saved_place_id, source_id)`, so one
  place can carry many TikToks — Charter invariant 4 in the schema — and `PlaceDetail` renders one.
- **A tag facet with counts**, so the library has a self-portrait.
- **Bulk paste / archive import.** Mechanism verified (40 sequential, 30 concurrent, no 429). Only
  worth building alongside a real source of many links.

### Not now, and why

- **"Open now"** — the most-wanted question on a saved-restaurants map, and it is **blocked**: we
  resolve through Google, and `06` §3.1 forbids pairing Google content with a non-Google map. Needs a
  licensing answer before it is a design question.
- **Price filter** — right idea, wrong source. 2/16 captions carry price. The real source is the
  resolver field mask (`place-resolver.ts:171`, which requests five fields and not `priceLevel`).
- **PWA share target** — **Android only; unavailable on iOS**, and requires the user to install the
  app first. Worth building, but it is not the iOS answer it looks like.
- **Instagram** — unavailable. **YouTube** — assumed possible via the Data API; unproven here.

### Refused, so nobody re-proposes them

Itinerary and route planning (Charter §1). Ratings and scores. A social graph, public profiles or a
discovery feed. Streaks, badges, gamification. AI chat. Google Takeout import — it would make the
product a Maps mirror rather than a map of what your feed recommended, which is the whole positioning.

## 6. The one thing

**Ship the zero-state.** It is already designed, it needs no new components, it costs a day, and it
is the exact moment the product currently feels like an empty demo — because at that moment it
literally is one.
