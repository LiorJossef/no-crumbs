/**
 * The shared type vocabulary. One definition each, owned here (07 §10, roster §"Architect").
 *
 * MS5 task 2 populates the resolution half of this file: the vocabulary that `PlaceResolver`
 * (ports.ts), the scorer (places/) and MS7's adapters all speak. `Source`, `Extraction`,
 * `PlaceCandidate`, `Candidate`, `CandidateResolution` and `SavedRecommendation` are declared in
 * 07 §10 and land here in MS6 with the import pipeline — deliberately not written ahead of the
 * code that uses them.
 *
 * Rules this file obeys:
 *  - No optional properties. `exactOptionalPropertyTypes` is on, and a hint that a caller forgot
 *    to think about is a bug we want at the call site, so every field is required and nullable
 *    where absence is legal.
 *  - Every field that has a database counterpart matches the real column: name, type and
 *    nullability, per migrations 0005/0010/0014. Prose that disagrees with the migration loses.
 */

/* ------------------------------------------------------------------------------------------- *
 * Identity
 * ------------------------------------------------------------------------------------------- */

import type { ExtractedCategoryHint } from './places/category-hint';

export type UserId = string & { readonly __brand: 'UserId' };
export type ImportId = string & { readonly __brand: 'ImportId' };
export type PlaceId = string & { readonly __brand: 'PlaceId' };

/**
 * A loaded POI region: `poi_regions.id`, e.g. `'tlv'`, `'tyo'`, `'ldn'`
 * (`^[a-z][a-z0-9_]{1,15}$`, migration 0010).
 *
 * Deliberately **not** branded, unlike the three ids above. A brand only pays for itself where
 * there is a constructor that validates; the only producer of a region id is a read of
 * `poi_regions`, and the only consumer is the next query against `poi_index`. A brand here would
 * buy a cast in the adapter, not a check.
 */
export type RegionId = string;

/**
 * Geographic point, domain-side. Named fields, never a tuple, and never called `LngLat`:
 * `06` §8's `LngLat` is the *renderer's* type and carries MapLibre's lng-first ordering. Two
 * types with different orders and the same name is a silent argument-order bug, so the domain
 * type has a different name and no positional form.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/* ------------------------------------------------------------------------------------------- *
 * Provenance
 * ------------------------------------------------------------------------------------------- */

/**
 * The alias namespace a resolved POI's id belongs to — written to
 * `place_provider_refs.provider` by `resolve_place(p_provider, ...)`.
 *
 * `'overture'`, not `06` §8's `'overture-local'`: `place_provider_refs.provider` is
 * `check (provider ~ '^[a-z][a-z0-9_]{1,31}$')` (migration 0005), which forbids the hyphen. The
 * documented spelling could not have been inserted.
 *
 * `'llm_guess'` (underscore, per that same CHECK): the confirm/save seam's fallback provenance for
 * a candidate saved straight off `PlaceCandidate.coordinates` — the model's own best-guess point —
 * with no `PlaceResolver` match behind it at all (the caption-preview screen, L0-F4-T3 follow-up,
 * 2026-08-23). Never returned by `PlaceResolver` itself; this is the confirm route's own
 * provenance mark for a save that skipped resolution entirely, kept in the same closed union so a
 * `ResolvedPlace`/`ConfirmItem`'s `provider` field can never silently drift out of sync with what
 * `resolve_place` actually accepts.
 */
/**
 * `'google'` (2026-08-28): Google Places API (New) Text Search, the provider the owner ruled
 * primary after `docs/evidence/places/google-places-and-transcription-probe-2026-08-28.md`
 * measured it at 14/15 top-1 against Overture's 12/15 on the real corpus. It needed **no
 * migration**: `place_provider_refs.provider` carries a pattern CHECK
 * (`^[a-z][a-z0-9_]{1,31}$`, migrations 0005/0007), not an enum, so `'google'` was already
 * accepted. `06` §3.3 predicted "a small migration"; the foresight cost even less than that.
 */
export type PlaceProvider = 'overture' | 'nominatim' | 'llm_guess' | 'google';

/**
 * Which dataset the row's *data* came from — the licensing/attribution mark, written to
 * `places.source_dataset` and constrained to `'overture-places'` on `poi_index`
 * (migration 0010; that CHECK is the enforcement of `06` §11 Q2).
 *
 * `'osm-nominatim'` is named here so MS7's Nominatim adapter does not invent a second spelling.
 * Note that `places.source_dataset` carries no CHECK today: this union is the only thing keeping
 * the vocabulary closed, and it is a TypeScript-only guarantee.
 *
 * `'llm-guess'` pairs with `PlaceProvider`'s `'llm_guess'` above: an LLM-guessed coordinate is not
 * data from either open dataset, so it gets its own honest mark rather than borrowing one of the
 * two real providers' licensing labels. `poi_index`'s CHECK (migration 0010, `06` §11 Q2) still
 * only ever admits `'overture-places'` — that constraint is about what may be *cached for
 * resolving*, not what `places.source_dataset` may record, so this addition does not touch it.
 */
export type SourceDataset =
  | 'overture-places'
  | 'osm-nominatim'
  | 'llm-guess'
  /**
   * Google Places. Its licensing position is unlike the other two and the mark exists to keep that
   * visible per-row: Service Specific Terms §5.4 caps lat/lng caching at 30 days and only the
   * place id is exempt, so a row carrying this dataset holds coordinates that are **cache, not
   * record**. `06` §3.1 also forbids pairing this content with a non-Google map — see
   * `integrations/google/place-resolver.ts` and `place-resolver-factory.ts` for where that is
   * enforced rather than merely noted.
   */
  | 'google-places';

/* ------------------------------------------------------------------------------------------- *
 * Resolution input
 * ------------------------------------------------------------------------------------------- */

/**
 * The three category hints the scorer can score. Closed on purpose: `06` §6.1 step 4's
 * `cat_score` indexes a fixed table of token sets (`CAT_TOKENS` in the prototype), and an
 * unknown hint there is a `KeyError`, not a zero. Anything the LLM emits outside these three
 * becomes `null` at the extraction gate (`09` §5.2) — a hint we cannot score is no hint.
 */
export type CategoryHint = 'cafe' | 'bar' | 'restaurant';

/**
 * One resolution request. The single input shape for both callers: a place candidate from an
 * import, and a user typing in the manual-search sheet (capability 13). See `ports.ts` for why
 * that is one method and not two.
 */
export interface ResolveQuery {
  /**
   * The name to resolve, **verbatim** as the caption wrote it or the user typed it.
   * Normalisation is the resolver's job (`places/normalise.ts`); a pre-normalised string
   * arriving here would be normalised twice and would break the `whole` term, which the
   * prototype computes from the raw candidate.
   */
  readonly text: string;
  /** Free text as extracted, e.g. `'Tel Aviv'`, `'תל אביב'`. Mapped to `RegionId`s by the adapter. */
  readonly cityHint: string | null;
  /** ISO-3166-1 alpha-2 where known. Disambiguates a city name that exists in two countries. */
  readonly countryHint: string | null;
  readonly categoryHint: CategoryHint | null;
  /**
   * The street address as the caption wrote it, verbatim — `PlaceCandidate.addressHint` carried
   * through (`'בזל 42, תל אביב'`, `'לבונטין 19'`). Compared against `poi_index.address_line` by
   * `places/score.ts`, which owns every decision about how (TLV-ADDR-1).
   *
   * **Optional, and it is the one field here that is.** Every other field is required because a
   * caller that forgets one is a bug; this one is optional so that adding it did not have to touch
   * the Supabase adapter, the probe route, or the two manual harnesses in the same change. Absent
   * and `null` mean the same thing — *no address was extracted* — and `rankPlaces` collapses them
   * with `?? null` so the two can never diverge.
   *
   * It is a **scoring** input, not a prefilter input. Nothing here promises the address was used to
   * *find* candidate rows; the prefilter still selects on name tokens alone, so a venue whose name
   * cannot be matched is still unreachable no matter how good its address is. An address arm in the
   * prefilter is the other half of this and it is not in this field's gift.
   */
  readonly addressHint?: string | null;
  /**
   * Alternate script/spelling forms of `text` naming the **same** venue, from
   * `PlaceCandidate.nameVariants` (plus `identifiedName` where it differs). The resolver may
   * retrieve on each and scores the name term as the **best** match across `text` and these —
   * so a Hebrew caption can reach a Latin-named row without the Hebrew original being discarded.
   *
   * **Optional for the same reason `addressHint` is**: every existing construction site — the
   * Supabase adapter, the probe route, both manual harnesses — keeps compiling untouched, and an
   * absent field, an explicit `null` and an empty array all mean the same thing (*no variants
   * offered*), and `rankPlaces` collapses them with `?? null` so they cannot diverge.
   *
   * A variant is a **retrieval and scoring** input only. It never reaches storage, never becomes a
   * place's name, and the auto-accept gates are unchanged — widening the query must not widen what
   * we are willing to accept without a human. The zero-false-auto-accept property is asserted on
   * both harnesses and is the constraint this field is most likely to threaten.
   */
  readonly textVariants?: readonly string[] | null;
  /**
   * Bias point for manual "search near me" (MS11), which is what `poi_index_lat_lng_idx`
   * exists for. **The scorer has no distance term** — this is a prefilter input only, and a
   * resolver that ignores it is not wrong.
   */
  readonly near: LatLng | null;
  /** Shortlist cap. `null` = the resolver's own default (5, `06` §6.1 step 5). */
  readonly maxResults: number | null;
}

/* ------------------------------------------------------------------------------------------- *
 * Resolution output
 * ------------------------------------------------------------------------------------------- */

/**
 * A real POI as the resolver found it. Field-for-field the columns of `poi_index`
 * (migration 0010) that leave the integration layer, because inventing a second shape for the
 * same row is how a nullability disagreement becomes a runtime crash.
 *
 * `name_norm` is deliberately **absent**: it is an index artefact for the trigram prefilter, not
 * a property of the place, and the scorer normalises `name` itself exactly as the prototype does.
 */
export interface ResolvedPlace {
  readonly provider: PlaceProvider;
  /**
   * The provider's own id — Overture's GERS id, verbatim from `poi_index.dataset_place_id`.
   * This is both `resolve_place(p_provider_place_id)` and `resolve_place(p_source_dataset_id)`
   * (migration 0014): for Overture they are the same string.
   */
  readonly providerPlaceId: string;
  readonly sourceDataset: SourceDataset;
  /** `poi_index.region_id`, NOT NULL there; `null` only for a place from a region-less provider. */
  readonly regionId: RegionId | null;
  readonly name: string;
  /** `poi_index.alt_names`, NOT NULL DEFAULT '{}' — empty until the OSM alias join (`10` §11). */
  readonly altNames: readonly string[];
  /** Overture `categories.primary`, verbatim. Our own taxonomy is derived at save time. */
  readonly providerCategory: string | null;
  /** Not decoration: this is what distinguishes five rows all called AFURI (`06` §6.2). */
  readonly addressLine: string | null;
  readonly locality: string | null;
  readonly lat: number;
  readonly lng: number;
  /**
   * `poi_index.dataset_confidence`, NOT NULL DEFAULT 0.5 — so this is `number`, not
   * `number | null`, and the prototype's `conf or 0.5` coalesce has no port.
   */
  readonly datasetConfidence: number;
}

/**
 * A `ResolvedPlace` plus how it scored. Field names track the per-result keys of
 * `evidence/places/raw-overture-scored.json` so the golden file (task 4) compares like with like.
 */
export interface RankedPlace {
  readonly place: ResolvedPlace;
  /** `0.72·nameScore + 0.18·categoryScore + 0.10·datasetConfidence` (`06` §6.1 step 4). 0..1 — the same range as `places.resolution_score`'s CHECK. */
  readonly score: number;
  /** `0.45·whole + 0.55·tokenCoverage − extra`, floored at 0. */
  readonly nameScore: number;
  /** Mean best per-token similarity over the query's distinctive tokens. */
  readonly tokenCoverage: number;
  /** 1 if the candidate's category is in the hinted category's token set, else 0. */
  readonly categoryScore: 0 | 1;
}

/**
 * The three bands, and the only confidence vocabulary in the system. Thresholds are owned by
 * `06` §6.2 and live in the scorer's constants object. `'confident'` and `'shortlist'` are UI
 * prose for a band, never type names.
 */
export type ConfidenceBand = 'preselect' | 'confirm' | 'no_match';

export interface Confidence {
  readonly band: ConfidenceBand;
  /** `shortlist[0].score`, or 0 for an empty shortlist. */
  readonly score: number;
  /**
   * `score(top1) − score(top2)`, or **`null` when there is no second candidate**.
   *
   * `null` is the fix for the defect recorded in `10` §8: the prototype sets `margin = 1.0` for a
   * single-row prefilter, which sails through the `margin ≥ 0.05` gate on score alone and makes
   * the margin gate — the idea `06` §12 defends to an examiner — inert in exactly that case.
   * Unmeasured margin is not perfect margin. `10` §12 Q3 ruled the band: `confirm`.
   */
  readonly margin: number | null;
}

/**
 * What one resolution produced. This is the resolver's whole output: `06` §6's four fields with
 * one type each, plus the two diagnostics that make the `10` §5 recall gate checkable.
 *
 * MS6's `CandidateResolution` (`07` §8) is **derived** from this, not returned instead of it:
 * `preselect → resolved`, `confirm → ambiguous`, `no_match → unresolved`, per `07` §10's stated
 * 1:1 mapping. The derivation drops evidence, so it happens as late as possible — in the
 * pipeline, not in the adapter.
 */
export interface ResolveResult {
  /** Ranked best-first, at most `ResolveQuery.maxResults` (default 5). May be empty. */
  readonly shortlist: readonly RankedPlace[];
  readonly confidence: Confidence;
  /**
   * The regions the prefilter actually searched. Empty means nothing was searched — either the
   * city hint mapped to no loaded region, or no region is loaded at all. `06` §7.3's
   * `region_loaded` boolean is the negation of empty; see `places/resolve-result.ts`, which owns
   * it as a function so there is no second field to keep in sync.
   */
  readonly regionsSearched: readonly RegionId[];
  /**
   * Rows the prefilter returned, before scoring. `10` §5's gate ("the eventual winner must be
   * inside the prefilter's output") and the `limit 500` cap are only auditable if this is
   * reported; it is also the number that tells `margin === null` apart from a shortlist truncated
   * by `maxResults`.
   *
   * MS5 task 3 sharpened what it disambiguates: the scorer computes `margin` **and** the band from
   * the full ranking, before `maxResults` truncates the shortlist, so `margin === null` means
   * *there was no second candidate at all* — never *the shortlist was cut to one*. This field is
   * therefore an audit trail rather than the way to tell those two apart. At the default cap of 5
   * the two readings coincide, which is why the 44-case benchmark is unaffected.
   */
  readonly candidatesPrefiltered: number;
}

/* ------------------------------------------------------------------------------------------- *
 * Import pipeline (07 §8, §10) — the slice needed to type `ImportEvent`'s terminal outcome.
 * `Extraction` and `SavedRecommendation` are not declared yet: nothing in `domain/errors.ts` or
 * `domain/import/events.ts` (L0-F1-T1) needs them, and they land with the task that does.
 * ------------------------------------------------------------------------------------------- */

/** A name the LLM thinks is a place. Not yet a place (07 §10). */
export interface PlaceCandidate {
  /** Exactly as the caption wrote it — shown verbatim in the review/search UI. */
  readonly rawName: string;
  readonly cityHint: string | null;
  readonly countryHint: string | null;
  /**
   * The full seven-value vocabulary the model may emit (`places/category-hint.ts`'s
   * `ExtractedCategoryHint`), **not** the three the scorer can score. A candidate is the
   * wrong place to narrow: `bakery` collapsing to `cafe` and `attraction`/`shop`/`other`
   * collapsing to `null` used to happen inside `toPlaceCandidate`, before the value had
   * reached storage or the UI, so a bakery was saved and shown as a cafe and three of the
   * seven categories were unrecoverable. `categoryHintFor()` is now applied at the one seam
   * that genuinely needs three values — `ResolveQuery` below — and nowhere else.
   */
  readonly categoryHint: ExtractedCategoryHint | null;
  /**
   * A street address the caption gives verbatim (e.g. "דרך רמתיים 24", "12 Main St") — a number
   * plus a street name, commonly but not always sitting near a "📍" marker. Distinct from
   * `cityHint`: this is the street-level line, not the city/neighbourhood/country. `null` when the
   * caption gives no address. Load-bearing for the Google Maps link (a separate task), since a
   * name+address+city text search is far more reliable than the model's own guessed
   * `coordinates` below — captured explicitly here rather than left to ride along inside
   * `evidence` by incidental luck.
   */
  readonly addressHint: string | null;
  /**
   * The neighbourhood, district, market or building the caption puts the venue in — "Brixton",
   * "Market Row", "Tooting Market", "Middle Eighty Hotel", "Shibuya". `null` when the caption
   * names none.
   *
   * **Deliberately distinct from `addressHint` above, and from `cityHint`.** `addressHint` is the
   * street line (a number plus a street name); `cityHint` is the city; this is everything in
   * between, and the three are separate fields because they are separately true and separately
   * useful. Collapsing them would be lossy in the one direction that matters: "La Nonna" in
   * "Market Row" in "London" is three facts, and a Google Maps query wants a different subset of
   * them than a heading on a card does.
   *
   * It exists because the model was writing these words into the **name** — `"La Nonna Brixton"`,
   * `"MBER London"`, `"Kiaan's Tooting Market"` — while `cityHint` sat alongside holding
   * `"London"`. Both facts are worth keeping; the name field is the wrong place for the second.
   * Measured over four real captions, welding the area into the name went 3/8 → 0/8 once this
   * field existed to receive it. The qualifier is an asset, not noise: a measured run (n=20)
   * found `"La Nonna Brixton, London"` beats the plain name against a free-form geocoder, so
   * `venueQueryString()` (`extraction/grounding.ts`) re-composes it for a *query* while the
   * display path keeps `"La Nonna"` under a `Brixton` heading.
   *
   * **No `places` or `saved_places` column holds this today** (migration `0019` added `tags`,
   * `why_go` and `dishes`, not an area). It therefore survives only inside
   * `extractions.candidates`, which is enough for the review screen and for a maps query built at
   * confirm time, and not enough for one built from a saved row later. Stated here rather than
   * papered over by writing it into `places.address_line`, which would be a different fact under a
   * name that already means something else.
   */
  readonly areaHint: string | null;
  /** The caption fragment the name came from, for our own debugging only. */
  readonly evidence: string | null;
  /** Kept, never trusted (`02` §D3): nothing gates on the model's own confidence. */
  readonly modelConfidence: number | null;
  /**
   * The model's best real-world identification of `rawName`, using its own world knowledge —
   * e.g. raw `"Paradiso"` (Prague, cafe) identified as `"Paradiso Matcha Bar"` (`06` §3.4,
   * L0-F2/L0-F3 paused 2026-08-22 in favour of this). Unlike `rawName`/`evidence`, this field is
   * explicitly allowed — expected — to be inference rather than a caption-verbatim copy.
   *
   * `null` when the model cannot go beyond the raw fragment (the caption gives no disambiguating
   * context and the model has no confident guess) — a null here means "search the raw name
   * as-is," not a failure. Nothing auto-accepts this value; it only ever feeds a Google Maps
   * search link a human clicks through and judges (`06` §3.4's stated mitigation, since this is
   * unverified recall, not a database match).
   */
  readonly identifiedName: string | null;
  /**
   * The same venue's name written in the **other script** — the Latin form when the caption gave
   * Hebrew, the Hebrew form when it gave Latin — plus any common alternate spelling. Never
   * includes `rawName` itself. Empty is legal and is the correct answer for a Latin caption
   * naming a Latin-only venue.
   *
   * **Why this field exists, measured (TLV-BILING-1).** 64% of the loaded `tlv` index is
   * Hebrew-named, but the venues we were failing to find are in it under their *Latin* names
   * while the caption gave the Hebrew one. `docs/evidence/places/bilingual-expansion.md` fed the
   * Latin form to the resolver by hand and all six test venues came back correct at rank 1. The
   * blocker was never retrieval breadth or ranking; it was that we only ever asked in one script.
   *
   * **This is `model_knowledge`, not `caption_verbatim`, and the distinction is the point.**
   * `מתחת לעץ` -> `Under the Tree` is a *translation*: it cannot be a substring of the caption, so
   * no grounding gate can check it. The deterministic transliterator measured on 2026-08-27
   * managed 47% recall and failed on exactly this class. A variant is therefore a **search hint
   * only** — it may widen what we look for, and it may never become the saved identity of a
   * place. Name, coordinates, address, provenance and dedup identity all still come from the
   * matched `poi_index` row, which stays the single source of truth.
   */
  readonly nameVariants: readonly string[];
  /**
   * The model's own best-guess coordinates for the place, inferred from whatever context the
   * caption gives (name, address, city/neighbourhood, business type) — not a database lookup, and
   * not gated on `modelConfidence`. `null` when the model has no real basis for a guess. Like
   * `identifiedName`, this is unresolved, unvalidated recall pending human confirmation — no code
   * path may treat it as an authoritative coordinate (`06` §3.3's ODbL/ToS reasoning for why we
   * do not call a credentialed places API here).
   */
  readonly coordinates: { readonly lat: number; readonly lng: number } | null;
  /**
   * Short free-form labels for organising a library — cuisine, style, setting, occasion
   * (`italian`, `matcha`, `hotel restaurant`). At most five, already de-duplicated and stored in
   * `normalise()`'s form by `extraction/tags.ts`, because there must be exactly one answer in this
   * codebase to "are these the same text?" and `normalise()` is it. `tagDisplayLabel()` is the
   * render path; nothing downstream may title-case before storing. Empty array, never `null`, when
   * the caption supports none — an absent list and an empty list would be two spellings of the
   * same state, which `domain/types.ts`'s no-optional-properties rule exists to avoid.
   *
   * `caption_inference`, not `caption_verbatim` (`extraction/schema.ts`'s
   * `CANDIDATE_FIELD_PROVENANCE`), and **the only v2 field with no code gate behind it**: a tag
   * cannot be substring-checked without killing the useful ones. The prompt is doing that work
   * alone, and it has been observed to leak world knowledge (`falafel` on a caption that never
   * mentions food). Treat a tag as a useful hint, never as something the source said.
   *
   * Persisted per save to `saved_places.tags` (migration `0019`), not to `places`: a label derived
   * from one creator's caption is a claim about one recommendation, not a provider fact about a
   * venue other users also saved.
   */
  readonly tags: readonly string[];
  /**
   * Named food or drink items the caption itself names — "the sabich", "pistachio croissant",
   * "cortado". At most five. Verbatim-class: `extraction/grounding.ts` drops any item that is not
   * findable in the caption, so this cannot become a menu the model imagined. Stored **unfolded**,
   * unlike `tags` — a dish name is prose to read, not a key to match on, and `normalise()` would
   * cost `crème brûlée` its accents for no gain. `saved_places.dishes`' own trigger lowercases and
   * NFKC-folds it on write (migration `0019`), which is hygiene rather than identity.
   *
   * Empty array when the caption names none, which is most captions.
   */
  readonly dishes: readonly string[];
  /**
   * The model's one-sentence answer to "why would I go here?", **plus the verbatim caption
   * fragment that licenses it**. The pairing is the whole design, and it is why this is not a bare
   * string: `text` is synthesis — allowed, expected, to use words the caption never used, which is
   * exactly what makes it worth reading months later and exactly what makes it dangerous —
   * while `groundedIn` is the quote that paid for it. `extraction/grounding.ts` nulls the whole
   * object when that fragment is not in the caption, and again when the fragment quotes only the
   * venue's own name (a citation that licenses nothing).
   *
   * `null` is the correct and common answer: a caption that gives a name and nothing else must
   * produce `null` here rather than a plausible-sounding reason. An invented reason is worse than
   * an absent one.
   *
   * The two halves land in **two differently-named columns** at save time
   * (`import/candidate-place.ts`): `text` → `saved_places.why_go`, `groundedIn` →
   * `saved_places.extracted_reason`. The extracted-vs-inferred distinction becomes schema rather
   * than a convention someone has to remember.
   */
  readonly whyGo: { readonly text: string; readonly groundedIn: string } | null;
}

/**
 * What one candidate resolved to. **Derived** from `ResolveResult` by the pipeline, never
 * returned by `PlaceResolver` itself (`07` §8, `11` §2 ruling 5): `preselect → resolved`,
 * `confirm → ambiguous`, `no_match → unresolved`. `lookup_failed`, `timed_out` and `capped` have
 * no `ConfidenceBand` counterpart — they are pipeline-level outcomes, which is why this type is
 * declared in the pipeline's vocabulary and not derived mechanically from `Confidence` alone.
 */
export type CandidateResolution =
  | {
      readonly status: 'resolved';
      readonly place: ResolvedPlace;
      readonly alternates: readonly ResolvedPlace[];
      readonly confidence: Confidence;
    }
  | { readonly status: 'ambiguous'; readonly options: readonly ResolvedPlace[] }
  | { readonly status: 'unresolved'; readonly reason: 'no_match' | 'lookup_failed' | 'timed_out' | 'capped' };

/**
 * The three per-save enrichment columns migration `0019` added to `saved_places`, in the shape
 * `apply_saved_place_extraction(p_tags, p_why_go, p_dishes)` takes them.
 *
 * `null` per field, not `[]`/`''`, because the database has exactly one empty state: the
 * normalising trigger collapses an empty array to `NULL`, and `0019`'s header calls two spellings
 * of "no labels" out by name as the bug it is avoiding. This type therefore matches the column, not
 * the candidate — `PlaceCandidate.tags` is `readonly string[]` and empty-means-empty, and the
 * conversion happens once, in `import/saved-place-enrichment.ts`.
 *
 * Not on `places`. These are claims one creator made in one video that one user chose to import,
 * not provider facts about a venue other people also saved (`0019`'s header, reasons 1-4).
 */
export interface SavedPlaceEnrichment {
  /** `saved_places.tags` — at most 5 from the extractor, stored in `normalise()`'s form. */
  readonly tags: readonly string[] | null;
  /** `saved_places.why_go` — `PlaceCandidate.whyGo.text`, the model's own sentence. */
  readonly whyGo: string | null;
  /** `saved_places.dishes` — verbatim item names the caption itself gave. */
  readonly dishes: readonly string[] | null;
}

/** A candidate plus what resolution made of it. This is what the review UI renders (07 §10). */
export interface Candidate {
  readonly candidate: PlaceCandidate;
  readonly resolution: CandidateResolution;
}

/* ------------------------------------------------------------------------------------------- *
 * Import pipeline (continued) — raw source material and stage bookkeeping, landing with L0-F1-T3
 * (`runImport`). `Extraction` was the one piece of 07 §10's vocabulary this file's header said was
 * "still to come" — it lands here now, alongside the shapes `SourceAdapter`, `ContentExtractor`
 * and `ImportStore` need (`ports.ts`).
 * ------------------------------------------------------------------------------------------- */

/** One piece of raw text pulled off a source post. V1 emits exactly one, `kind: 'caption'` — the
 *  verbatim oEmbed `title` (07 §10, 09 §1). */
export interface RawText {
  readonly kind: 'caption';
  readonly text: string;
}

/** V1 always emits `media: []` on every `RawSource` — this type exists so a future ASR/OCR
 *  analyser is a second `ContentExtractor` implementation, not a signature change anywhere
 *  (07 §10, §12's stage-B trigger). */
export interface MediaRef {
  /** `'audio'` is the demuxed audio track of a post, produced by the media-acquisition step, not
   *  something a platform hands us directly — it is what `ContentExtractor` `'transcript'` keys on
   *  (`integrations/transcription/`). A `'video'` ref is deliberately not the same thing: a
   *  transcriber needs bytes it can send, and turning an MP4 into those bytes is a separate step. */
  readonly kind: 'video' | 'image' | 'audio';
  readonly url: string;
  readonly expiresAt: Date | null;
}

/** What `SourceAdapter.fetch` returns: a post's raw material, before any `ContentExtractor` or
 *  `PlaceExtractor` has touched it (07 §10). */
export interface RawSource {
  /** `sources.id` — the row this raw material was cached to/from. Threaded through so a later
   *  save (even one with zero resolved candidates) can still link the real source row instead of
   *  silently discarding it as a `sourceId: null` manual save. */
  readonly id: string;
  readonly externalId: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly texts: readonly RawText[];
  readonly media: readonly MediaRef[];
}

/** One `ContentExtractor`'s output: text plus its provenance, so extraction quality stays
 *  attributable per source kind (07 §10). The orchestrator concatenates every extractor's parts
 *  before calling `PlaceExtractor`; V1's array length is 1. */
export interface ContentPart {
  readonly kind: 'caption' | 'transcript' | 'onscreen-text';
  readonly text: string;
  readonly origin: string;
}

/** What stage B produced from a source's text, for one `(extractorVersion, promptVersion)` —
 *  the extraction cache's key (07 §10, `09` §7). Not yet read back from `jsonb` by anything in
 *  this task: the cache itself is `ImportStore`'s job, and L0-F1-T3 does not implement
 *  `loadCached`/`getOrCreateImport` (see `ports.ts`'s note on `ImportStore`). */
export interface Extraction {
  readonly sourceId: string;
  readonly extractorVersion: string;
  readonly promptVersion: string;
  readonly candidates: readonly PlaceCandidate[];
  readonly cityHint: string | null;
  readonly producedAt: Date;
}

/**
 * One stage's output plus its elapsed ms, recorded by `ImportStore.recordStage` before the next
 * stage starts (07 §6). A discriminated union on `stage` rather than 07 §10's sketch of a
 * separate `stage: ImportStage` parameter alongside an already-discriminated `StageOutput`: two
 * values that must always agree are one bug waiting for a call site to pass them out of step, so
 * this file collapses them into the single value that already carries the truth.
 */
export type StageOutput =
  | { readonly stage: 'source'; readonly ms: number; readonly source: Source }
  | { readonly stage: 'extract'; readonly ms: number; readonly extraction: Extraction }
  | {
      readonly stage: 'resolve';
      readonly ms: number;
      readonly candidates: readonly Candidate[];
      /** Set only when every attempted lookup failed with a transport error (07 §8 rule 3). */
      readonly degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null;
    };

/** The post. Global, one row per platform post, shared across users (07 §10). */
export interface Source {
  readonly id: string;
  readonly platform: 'tiktok';
  /** The numeric video id — the identity (`04` §6). */
  readonly externalId: string;
  /** Rebuilt from `author_unique_id`, never from user input. */
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  /** Signed, ~6 month expiry: never treated as a permanent reference. */
  readonly thumbnailUrl: string | null;
  readonly fetchedAt: Date;
}

/** What the UI may see of a `Source` (07 §10) — the caption never crosses this seam. */
export type SourceView = Pick<Source, 'externalId' | 'canonicalUrl' | 'authorHandle' | 'thumbnailUrl'>;
