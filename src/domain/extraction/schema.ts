/**
 * The extractor's output contract (`09` §3, L0-F4-T2). One Zod object, used three ways: to derive
 * the JSON Schema sent to the model (`integrations/llm/json-schema.ts`), to parse the response
 * inside each adapter, and to parse a cached `extractions.candidates` `jsonb` column back out on
 * read (`07` §"Validation", boundary 3) — never trusted twice, parsed twice.
 *
 * `categoryHint` is the **raw**, seven-value vocabulary the model may emit
 * (`places/category-hint.ts`'s `ExtractedCategoryHint`), and it stays that way all the way to
 * storage and to the review screen. `toPlaceCandidate` used to narrow it here with
 * `categoryHintFor`, which was the wrong seam: the scorer is the only consumer that needs three
 * values, so narrowing before storage silently saved every bakery as a cafe and threw
 * `attraction`/`shop`/`other` away entirely. The narrowing now happens where `ResolveQuery` is
 * built (`domain/import/pipeline.ts`), which is the only place it is actually required.
 *
 * ---
 *
 * # Schema v2 (RICH-EXT-T1)
 *
 * v1 paid a model to read a caption and then kept four facts out of it. Measured on the live local
 * database: 7 of 20 saved places carried no `extracted_reason` at all, 2 more echoed the place's
 * own name, and `categoryHint` had 4 distinct values across 20 rows with 14 of them `restaurant` —
 * so the field a user would filter their library by had almost no discriminating power. Meanwhile
 * the caption text we had already paid to read said *seasonal Italian*, *Nepalese*, *pan-Asian*,
 * *inside a hotel*, *tucked away in a market*. v2 keeps that.
 *
 * ## The provenance rule, which is the reason this file is long
 *
 * Every field below belongs to exactly one epistemic class, and `CANDIDATE_FIELD_PROVENANCE` at
 * the bottom of this file names it in code rather than in prose a reader has to trust:
 *
 *  - **`caption_verbatim`** — copied out of the caption. A fabrication is a substring test, not a
 *    judgement call (`rawName`, `evidence`, `addressHint`, the hints, `dishes`,
 *    `whyGo.groundedIn`).
 *  - **`caption_inference`** — the model's reading of what the caption says. Not copyable, but it
 *    may not go beyond the caption either (`categoryHint`, `tags`, `whyGo.text`).
 *  - **`world_knowledge`** — unverified model recall about the real world, mitigated only by a
 *    human clicking through to Google Maps (`06` §3.4): `identifiedName`, `coordinates` and
 *    `nameVariants`. The last of these is recall we deliberately *cannot* check — a translated
 *    name is not a caption substring by construction — so it is confined to the query side (see
 *    `RawPlaceCandidateSchema.nameVariants`).
 *  - **`model_self_report`** — `modelConfidence`, kept to be measured, never to be trusted or
 *    rendered (`02` §D3).
 *
 * `whyGo` is the field that could have quietly turned this schema into a machine for confident
 * invention, so it is not a bare string: it is a sentence **plus the verbatim caption fragment it
 * is based on**, and `extraction/grounding.ts` nulls the whole thing when that fragment is not in
 * the caption. The same discipline `evidence` already gave us for names, applied to prose.
 *
 * ## The cache key
 *
 * `EXTRACTION_SCHEMA_VERSION` is load-bearing. `extractions` is keyed on
 * `(source_id, model, prompt_version)` and nothing else, so a schema change that did **not** move
 * `prompt_version` would let a v2 row be read back and treated as v3. `PROMPT_VERSION` therefore
 * embeds the schema version (`p8-s3`), and `tests/unit/extraction/schema.test.ts` fails if the two
 * ever drift apart.
 */

import { z } from 'zod';

import { MAX_TAG_LENGTH, MAX_TAGS_PER_CANDIDATE, MIN_TAG_LENGTH } from './tags';
import type { PlaceCandidate } from '../types';

/**
 * Bumped whenever the shape of a candidate changes. Must appear inside `PROMPT_VERSION`
 * (`integrations/llm/prompt.ts`), because `prompt_version` is the only part of the `extractions`
 * cache key we control from application code.
 *
 * v1 → v2 (2026-08-27): added `areaHint`, `tags`, `dishes`, `whyGo`.
 * v2 → v3 (2026-08-28): added `nameVariants` (TLV-BILING-A).
 *
 * ## v3, and why it is not the `nameAliases` the owner cut from v2
 *
 * A `nameAliases` field (the venue's name in Hebrew and English, so the same venue saved from two
 * captions can be recognised as one place) was designed and then **cut from v2 by the owner**: it
 * reached place identity, `resolve_place` and the dedup guard, which is a different problem from
 * "make what we extract useful".
 *
 * `nameVariants` is **not that field wearing a new name**, and the difference is the entire reason
 * it is allowed in. `nameAliases` was an *identity* claim: it would have decided that two saved
 * rows are one venue, on the strength of model recall, with the merge already done by the time a
 * human saw it. `nameVariants` is a *query* term and nothing else. It widens what we look for in
 * `poi_index`; it is never written to `places.name`, never compared for dedup, and never displayed
 * as what the venue is called. Whatever we find, we find as a real indexed row, and that row —
 * not the variant — supplies the name, the coordinates and the identity. A wrong variant costs a
 * failed lookup or a candidate a human declines; a wrong alias silently merged two places.
 *
 * It earns its place by measurement, not by argument: `docs/evidence/places/bilingual-expansion.md`
 * fed the Latin form of six Hebrew-captioned venues to the shipped scorer by hand and all six came
 * back correct at rank 1 (0.867–0.997), where the Hebrew form returned nothing or the wrong venue.
 * The index holds those venues under `Kohi Coffee Shop`, `Trattoria Una`, `Cafe Europa`, `Under the
 * Tree`. Note that the last of those is a **translation**, not a transliteration — the
 * deterministic transliterator measured on 2026-08-27 reached 47% recall and failed on exactly that
 * class, which is why this is the model's job and not a function's.
 */
export const EXTRACTION_SCHEMA_VERSION = 3;

const EXTRACTED_CATEGORY_HINTS = ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other'] as const;

/** `places/category-hint.ts`'s `ExtractedCategoryHint`, restated as a Zod enum so this file is the
 *  one place the model-facing vocabulary is spelled out for schema generation.
 *
 *  **Kept in v2 deliberately.** `tags` supplements this vocabulary, it does not replace it: the
 *  map pins, the scorer's `cat_score` and `categoryHintFor` all key on these seven values, and an
 *  open vocabulary cannot be a closed enum's replacement without breaking all three. */
export const ExtractedCategoryHintSchema = z.enum(EXTRACTED_CATEGORY_HINTS);

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

/* ------------------------------------------------------------------------------------------- *
 * Length bounds, measured on the string the database will actually check
 * ------------------------------------------------------------------------------------------- */

/**
 * A length-bounded model string. The maximum is enforced **twice** — on the raw string and on its
 * NFKC normalisation — because those are two different lengths and the two sides of the write
 * bound different ones.
 *
 * ## The bug this exists to close
 *
 * Every enrichment column normalises its input to NFKC and *then* applies its `CHECK`. NFKC is a
 * compatibility normalisation, so it **expands**: `ﬄ` (U+FB04) becomes three characters, `½`
 * becomes three, and `U+FDFA` becomes eighteen. Bounding the raw string here and the normalised
 * string there means a value this schema accepts can be refused by the database with a bare
 * `check_violation`, at write time, on a real creator's caption. Measured against the bounds as
 * they stood: a 21-character tag of `ﬄ` normalises to 38 against a 32 bound; a 59-character dish
 * to 67 against 64; a 186-character `whyGo.text` to 288 against 280. `dishes` was the thinnest at
 * a 1.07x margin — one `½` was enough.
 *
 * This is not a theoretical Unicode hazard, it is an ordinary consequence of putting unbounded
 * model output over arbitrary caption text through two layers that measure different strings.
 *
 * ## Why a refinement and not just a bigger `.max()`
 *
 * Rejecting rather than truncating is the right call — a truncated dish name or a sentence cut
 * mid-word is worse than an absent one, and truncation would silently change a value the caption
 * licensed. So the schema refuses the value and the extraction fails loudly, which is what
 * `EXTRACTOR_INVALID_OUTPUT` is for.
 *
 * ## Why both lengths, rather than only the NFKC one
 *
 * NFKC can also *shrink* a string (it recomposes: `e` + U+0301 becomes `é`, and decomposed Hangul
 * jamo recompose into syllables). Checking only the normalised length would then let a longer raw
 * string through, which matters if any consumer stores the raw form. Checking both is one extra
 * comparison and removes the need to know which form is persisted.
 *
 * Normalisation itself is stable on both sides and is not in question: the database-side
 * normalisers were brute-forced against every non-surrogate BMP+SMP code point (194,559 probes)
 * plus 300,000 random pathological strings with **zero non-fixed-points**. The defect was only
 * ever that the two sides bounded *different strings*.
 */
export function boundedText(max: number, min = 0): z.ZodType<string> {
  return z
    .string()
    .min(min)
    .max(max)
    .refine((value) => value.normalize('NFKC').length <= max, {
      message: `must be at most ${max} characters once NFKC-normalised (NFKC expands: one code point can become 18)`,
    });
}

/* ------------------------------------------------------------------------------------------- *
 * whyGo (v2)
 * ------------------------------------------------------------------------------------------- */

/**
 * The model's own one-sentence answer to "why would I go here?", and the caption fragment it is
 * based on.
 *
 * The pairing is the whole design. `text` is synthesis — it is allowed, expected, to be words the
 * caption never used, which is exactly what makes it useful months later and exactly what makes it
 * dangerous. `groundedIn` is the verbatim fragment that licenses it, and `grounding.ts` sets the
 * whole object to `null` when that fragment is not in the caption. So the model cannot buy a
 * sentence without paying for it with a quote, and a reviewer (or a UI) can always show the quote
 * next to the claim.
 *
 * `null` is the correct, common answer: a caption that gives a name and nothing else must produce
 * `null` here rather than a plausible-sounding reason. An invented reason is worse than an absent
 * one — it is the failure mode the working agreement's "an uncertain result beats a confidently
 * wrong place" exists to prevent, moved from coordinates to prose.
 */
export const WhyGoSchema = z.object({
  /** The model's own sentence. Length-bounded so it stays a sentence and not a paragraph, and
   *  bounded on the NFKC length because that is what the `why_go` column checks. */
  text: boundedText(200, 8),
  /**
   * Verbatim caption fragment supporting `text`. Checked in `grounding.ts`, not here.
   *
   * **Nothing persists this.** It is an extraction-time proof obligation and nothing more: it
   * makes the model pay for a sentence with a quote, `grounding.ts` checks the quote against the
   * caption, and then the value is discarded. Deliberate, and reversed from an earlier mapping
   * decision — a verbatim caption quote written into a browser-supplied column could let a forged
   * quote be attributed to a named creator next to a real source link, which inverts which column
   * is trusted. The gate is the value; the storage was the risk.
   */
  groundedIn: boundedText(240, 3),
});

export type WhyGo = z.infer<typeof WhyGoSchema>;

/* ------------------------------------------------------------------------------------------- *
 * The candidate
 * ------------------------------------------------------------------------------------------- */

/** One candidate as the model must emit it — verbatim `rawName`, no confidence trusted (`02` §D3),
 *  `evidence` a caption fragment so a fabrication is a substring check, not a judgement call.
 *  `identifiedName` is the one exception to the verbatim discipline (`06` §3.4): the model's own
 *  real-world guess at the full venue, nullable when it has none beyond the raw fragment. */
export const RawPlaceCandidateSchema = z.object({
  rawName: boundedText(120, 2),
  cityHint: boundedText(80).nullable(),
  countryHint: boundedText(80).nullable(),
  /**
   * The neighbourhood, district, market or building the caption puts the venue in — `Brixton`,
   * `Market Peckham`, `Tooting Market`, `Middle Eighty Hotel`, `Shibuya`. Between `cityHint`
   * (London) and `addressHint` (a number plus a street).
   *
   * **Added in v2 for field discipline, not to suppress information.** The model routinely writes
   * these words into the *name* — `"La Nonna Brixton"`, `"MBER London"`, `"Kiaan's Tooting
   * Market"` — while `cityHint` sits alongside holding `London`. Both facts are worth keeping; the
   * name field is the wrong place for the second one. A measured run (n=20, stratified) found the
   * composed string `"La Nonna Brixton, London"` **outperforms** the plain name against a
   * free-form geocoder (6/9 vs 4/9, and a short area qualifier narrowed 5 of 10 ambiguous cases
   * while breaking none of 5 clean hits) — so the qualifier is an asset and must survive. It
   * survives *here*, and `venueQueryString()` in `grounding.ts` re-composes it for a query, which
   * keeps `"La Nonna"` displayable under a `Brixton` heading instead of reading `"La Nonna
   * Brixton"` there.
   */
  areaHint: boundedText(80).nullable(),
  categoryHint: ExtractedCategoryHintSchema.nullable(),
  /** A street address given verbatim in the caption — a number plus a street name, commonly (but
   *  not always) sitting near a "📍" marker, and separate from `cityHint`/`countryHint` and from
   *  `rawName`. `null` when the caption gives no address. Load-bearing for the Google Maps link:
   *  captured explicitly so it generalizes across caption formats instead of riding along inside
   *  `evidence` by incidental luck. */
  addressHint: boundedText(160).nullable(),
  evidence: boundedText(240).nullable(),
  modelConfidence: z.number().min(0).max(1).nullable(),
  identifiedName: boundedText(120, 2).nullable(),
  /**
   * The **same** venue's name in the other script — the Latin form when the caption gave Hebrew,
   * the Hebrew form when it gave Latin — plus a common alternate spelling of it. Never `rawName`
   * itself. `[]` is legal, common and correct: a Latin caption naming a Latin-only venue has no
   * variant to give, and neither does a name the model does not recognise.
   *
   * **A search hint, never an identity.** `world_knowledge` in `CANDIDATE_FIELD_PROVENANCE`
   * below, and unlike every `caption_verbatim` field there is no gate that can check it: `מתחת
   * לעץ` -> `Under the Tree` is a translation, so it is *by construction* not a caption substring.
   * The mitigation is therefore not a test, it is confinement — the value may widen a `poi_index`
   * query (`ResolveQuery.textVariants`) and may do nothing else. It is never stored as a place's
   * name, never used for dedup, never shown to a user as what the venue is called; the matched
   * index row supplies all of that. A wrong variant costs a missed lookup or a candidate a human
   * declines, and must never widen what auto-accepts.
   *
   * The cap is deliberately low. Three is enough for "the other script, plus one spelling of it",
   * and a model listing eight renderings of one name is producing noise that costs retrieval work
   * and raises the chance one of them names something else. It also sits under the measured
   * `maxItems: 5` ceiling the Gemini `responseSchema` validator imposes on nested arrays
   * (`integrations/llm/json-schema.ts`). The per-item bound matches `rawName`'s, because a variant
   * is the same kind of string.
   */
  nameVariants: z.array(boundedText(120, 2)).max(3),
  /**
   * Free-form labels for organising a library — cuisine, style, setting, vibe. The open
   * vocabulary the owner asked for on 2026-08-23 in place of one fixed category.
   *
   * Model-generated, but **caption-bounded**: a tag must be supported by something the caption
   * actually says. `"seasonal Italian plates inside Middle Eighty Hotel"` supports `Italian` and
   * `Hotel restaurant`; it does not support `Rooftop`. Tags are not gated by a substring test the
   * way `dishes` are — `Hotel restaurant` is a reading of the caption, not a quote from it — so
   * this is the one v2 field where the prompt is doing the work and only the *shape* is enforced
   * in code. Measure it; do not assume it.
   *
   * The Zod cap sits above `MAX_TAGS_PER_CANDIDATE` on purpose: an over-eager list should be
   * trimmed by `canonicaliseTags` (which also de-duplicates and does the final cap), not rejected
   * by Zod, which would throw away the whole extraction over a seventh tag.
   *
   * After `grounding.ts` runs, the values here are `normalise()`d — lowercase, accent-folded,
   * punctuation-free — because that is what gets **stored**, so the application and the database
   * agree on what one tag is (`tags.ts`'s header). `tagDisplayLabel()` is the render path.
   *
   * **Measured caveat, and the honest limit of the `caption_inference` label below.** The prompt
   * requires every tag to be supported by the caption, and **no code gate enforces it** — a tag
   * cannot be substring-checked without also killing the useful ones (`hotel restaurant` is a
   * reading of "inside Middle Eighty Hotel", not a quote from it).
   *
   * It leaked in testing. On `Resturants in Tel Aviv 📍Ha Kosem #foodie ...` — a caption that says
   * nothing whatsoever about food — two consecutive runs returned `falafel` and `middle eastern`.
   * Both are true of that venue and neither is in the caption: that is the model's own knowledge
   * arriving in a field labelled "what the caption says". Tightening the `whyGo` wording (the
   * "you may know a great deal about that venue — none of it belongs in this field" line) appears
   * to have closed it — the next run returned `[]` — but that is **one observation**, on one
   * caption, and there is no gate behind it. Treat a tag as a useful hint, never as something the
   * source said.
   */
  tags: z.array(boundedText(MAX_TAG_LENGTH, MIN_TAG_LENGTH)).max(MAX_TAGS_PER_CANDIDATE + 4),
  /**
   * Specific named food or drink items the caption itself names — "the sabich", "pistachio
   * croissant", "cortado". Verbatim-class: `grounding.ts` drops any item that is not in the
   * caption, so this field cannot become a menu the model imagined. Empty array when the caption
   * names none, which is most captions.
   */
  dishes: z.array(boundedText(60, 2)).max(5),
  /** See `WhyGoSchema`. `null` is the correct answer whenever the caption gives nothing beyond a
   *  name. */
  whyGo: WhyGoSchema.nullable(),
  /**
   * The model's own best-guess coordinates for `identifiedName`/`rawName`, inferred from
   * whatever context the caption gives (name, address, city/neighbourhood, business type) — not
   * a database lookup. `null` when the model has no real basis for a guess; never a fabrication
   * forced just to fill the field. Unresolved, unvalidated pending human confirmation, exactly
   * like `identifiedName` (`06` §3.4).
   */
  coordinates: CoordinatesSchema.nullable(),
});

export type RawPlaceCandidate = z.infer<typeof RawPlaceCandidateSchema>;

/**
 * The whole response. The 12-cap is at the schema level, below the API's own limits and above our
 * own `MAX_CANDIDATES = 7` (`07` §7) — a model that tries to emit 40 hashtag-derived "places" fails
 * schema validation rather than flooding the pipeline (`09` §3.3).
 */
export const ExtractionResultSchema = z.object({
  candidates: z.array(RawPlaceCandidateSchema).max(12),
  cityHint: boundedText(80).nullable(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/* ------------------------------------------------------------------------------------------- *
 * The domain shape
 * ------------------------------------------------------------------------------------------- */

/*
 * `CandidateEnrichment` and `RichPlaceCandidate` lived here, holding the four v2 fields, because
 * `domain/types.ts` belongs to the architect and the extraction task would not edit it. RICH-EXT-T3
 * landed them on `PlaceCandidate` itself, so `RichPlaceCandidate` became `PlaceCandidate &
 * (a subset of PlaceCandidate)` — an alias that reads, wrongly, as "PlaceCandidate does not have
 * these". Both are removed rather than deprecated: two names for one shape is exactly the drift
 * this file's header warns about, and the intersection would have gone on lying to every reader.
 */

/** Narrows one raw, model-vocabulary candidate to the domain's `PlaceCandidate`
 *  (`domain/types.ts`), the shape every adapter hands back to `PlaceExtractor.extract`'s caller.
 *  Field-level grounding (`grounding.ts`) runs after this, not inside it — this function stays a
 *  pure re-shaping so the gate is testable on its own. */
export function toPlaceCandidate(raw: RawPlaceCandidate): PlaceCandidate {
  return {
    rawName: raw.rawName,
    cityHint: raw.cityHint,
    countryHint: raw.countryHint,
    areaHint: raw.areaHint,
    categoryHint: raw.categoryHint,
    addressHint: raw.addressHint,
    evidence: raw.evidence,
    modelConfidence: raw.modelConfidence,
    identifiedName: raw.identifiedName,
    nameVariants: raw.nameVariants,
    tags: raw.tags,
    dishes: raw.dishes,
    whyGo: raw.whyGo,
    coordinates: raw.coordinates,
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Provenance, in code
 * ------------------------------------------------------------------------------------------- */

/**
 * What kind of claim each field is. See this file's header for the four classes.
 *
 * This exists so "preserve the extracted-vs-inferred distinction" is something a UI can branch on
 * and a test can enforce, rather than a convention that erodes one field at a time. The test in
 * `tests/unit/extraction/schema.test.ts` asserts this map covers every key of
 * `RawPlaceCandidateSchema` — add a field without deciding what kind of claim it is and the suite
 * goes red.
 */
export type FieldProvenance =
  | 'caption_verbatim'
  | 'caption_inference'
  | 'world_knowledge'
  | 'model_self_report';

export const CANDIDATE_FIELD_PROVENANCE: Readonly<Record<keyof RawPlaceCandidate, FieldProvenance>> = {
  rawName: 'caption_verbatim',
  cityHint: 'caption_verbatim',
  countryHint: 'caption_verbatim',
  areaHint: 'caption_verbatim',
  addressHint: 'caption_verbatim',
  evidence: 'caption_verbatim',
  dishes: 'caption_verbatim',
  categoryHint: 'caption_inference',
  tags: 'caption_inference',
  /** The object as a whole: `groundedIn` is verbatim, `text` is the model's own sentence. The
   *  pairing is the point — see `WhyGoSchema`. */
  whyGo: 'caption_inference',
  identifiedName: 'world_knowledge',
  coordinates: 'world_knowledge',
  /** Recall that *cannot* be gated — a translated name is not a caption substring — so it is
   *  confined to the query side instead. See `RawPlaceCandidateSchema.nameVariants`. */
  nameVariants: 'world_knowledge',
  modelConfidence: 'model_self_report',
};
