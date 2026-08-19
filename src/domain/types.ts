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
 */
export type PlaceProvider = 'overture' | 'nominatim';

/**
 * Which dataset the row's *data* came from — the licensing/attribution mark, written to
 * `places.source_dataset` and constrained to `'overture-places'` on `poi_index`
 * (migration 0010; that CHECK is the enforcement of `06` §11 Q2).
 *
 * `'osm-nominatim'` is named here so MS7's Nominatim adapter does not invent a second spelling.
 * Note that `places.source_dataset` carries no CHECK today: this union is the only thing keeping
 * the vocabulary closed, and it is a TypeScript-only guarantee.
 */
export type SourceDataset = 'overture-places' | 'osm-nominatim';

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
   */
  readonly candidatesPrefiltered: number;
}
