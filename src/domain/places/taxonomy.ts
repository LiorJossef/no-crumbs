/**
 * **The category and tagging taxonomy** — owner specification, 2026-08-29.
 *
 * One closed vocabulary, in one file, so that the extractor, the map, the filter row and the
 * library index cannot each hold a different idea of what a saved place *is*. Before this there
 * were three overlapping answers and they disagreed in ways a user could see: a gelateria read
 * `Shop` on the review card and `Dessert` on the saved row one tap later, `bakery` was
 * simultaneously a category and a tag, and `מאפייה` was a third spelling of that same one concept.
 *
 * ## Two levels, and the split between them is the whole design
 *
 * **A primary category** is what the venue *is*. Exactly one, always from `PRIMARY_CATEGORIES`.
 * It is the coarse fact the product is built on: it colours the pin, it draws the icon, and it is
 * what the top filter chips offer. Three values is a deliberate floor, not a first draft — the map
 * needs a legend a person can hold in their head, and a legend of eight is not one.
 *
 * **A sub-tag** is what the venue is *like*. Zero, one or two, always from `SUB_TAGS`. This is the
 * discriminating power the three categories give up, handed back as a closed list rather than as
 * free text, because a library index is only worth anything if two imports six months apart put
 * the same place under the same label.
 *
 * ## Why the sub-tags are a closed list now, having been open by design before
 *
 * `extraction/tags.ts` shipped an open vocabulary on the owner's 2026-08-23 instruction, and the
 * argument for it was sound: a closed list cannot say `Natural wine` or `Hotel restaurant`, and
 * canonicalisation-in-code was enough to keep spellings from fragmenting. What it could not stop
 * was *facet* fragmentation, and the live rows measured it — 31 saved places produced a vocabulary
 * mixing cuisine (`italian`), dish (`pasta`, `matcha`, `בורקס`), venue type (`market stall`),
 * neighbourhood (`marylebone`, which `locality` already holds), vibe (`hidden gem`) and outright
 * noise (`בקר`, a typo of "morning" that reads as "beef"). Every one of those is a legitimate thing
 * to say about a place and none of them filters a library, because no two of them are the same
 * *kind* of statement. Canonicalisation made the strings agree; nothing made the concepts agree.
 *
 * The cost is stated rather than buried: `Natural wine`, `Rooftop`, `Hidden gem` and `Market stall`
 * are no longer expressible, and captions that say them will now produce no tag at all rather than
 * a wrong one. That is the right trade for an index and the wrong one for prose, which is why
 * `whyGo` and `dishes` still carry the caption's specifics and are untouched by this.
 *
 * ## Open at the top, closed at the bottom
 *
 * `PRIMARY_CATEGORIES` is expected to grow — hotels and nightlife events are already named as
 * likely — and everything downstream derives from the array rather than restating it, so a fourth
 * value is one edit here plus whatever new pin colour it needs. What must *not* happen is a value
 * arriving in only one of the two vocabularies, so the display vocabulary in
 * `product-category.ts` proves the superset relation at compile time.
 *
 * ## What this file is not
 *
 * It is not the display vocabulary. `ProductCategory` still carries eight values and still must:
 * it renders rows saved before today (`dessert`, `shop`, `attraction`, `other`) and it reads the
 * resolver's provider category, which is Google's taxonomy and not ours. A place can therefore
 * *display* as `Dessert` while nothing new is ever *extracted* as one — see
 * `product-category.ts`'s header for why those two vocabularies are separate types on purpose.
 */

/**
 * The primary categories, in the order they are listed wherever the whole set is shown.
 *
 * Bakeries, patisseries, ice cream and dessert shops fold into `cafe`, per the specification: they
 * are places you sit down or stop at for something sweet, and splitting them off bought a fourth
 * pin colour for a distinction the filter row does not need. `bar` is evening drinks — cocktail
 * bars, wine bars, pubs, speakeasies — and each of those four keeps its own identity as a sub-tag.
 */
export const PRIMARY_CATEGORIES = ['restaurant', 'cafe', 'bar'] as const;

export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];

/** What each primary category covers, in the words the extraction prompt uses. One sentence each,
 *  because the prompt is generated from this rather than restating it — a category whose
 *  definition lives in two places is a category that will be defined two ways. */
export const PRIMARY_CATEGORY_SCOPE: Readonly<Record<PrimaryCategory, string>> = {
  restaurant: 'a place whose business is serving meals — casual through fine dining',
  cafe: 'coffee, bakeries, patisseries, ice cream and desserts — anywhere the reason to go is a drink or something sweet',
  bar: 'drinks in the evening — cocktail bars, wine bars, pubs, speakeasies',
};

export function isPrimaryCategory(value: unknown): value is PrimaryCategory {
  return typeof value === 'string' && (PRIMARY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The sub-tag whitelist: **stored key → display label**.
 *
 * The key is the string that reaches the database, and it is `tags.ts`'s `tagKey` of the label —
 * lowercased, accent-folded, punctuation-stripped. That relation is not a convention anyone has to
 * remember: `tests/unit/places/taxonomy.test.ts` asserts `tagKey(label) === key` for every
 * entry, so a label that does not canonicalise to its own key fails the build rather than storing
 * a tag no filter can find. It is why `Beer & Pub` is keyed `beer pub` — `normalise` drops the
 * ampersand — and why the label cannot simply be derived by title-casing the key.
 *
 * The model is shown the **labels**; the pipeline stores the **keys**.
 */
export const SUB_TAGS = {
  // — cuisines and dining styles, mostly for `restaurant` —
  italian: 'Italian',
  japanese: 'Japanese',
  asian: 'Asian',
  'middle eastern': 'Middle Eastern',
  mexican: 'Mexican',
  american: 'American',
  mediterranean: 'Mediterranean',
  // — sub-vibes and specialities, mostly for `cafe` and `bar` —
  bakery: 'Bakery',
  desserts: 'Desserts',
  'specialty coffee': 'Specialty Coffee',
  brunch: 'Brunch',
  cocktails: 'Cocktails',
  'wine bar': 'Wine Bar',
  'beer pub': 'Beer & Pub',
  speakeasy: 'Speakeasy',
} as const satisfies Readonly<Record<string, string>>;

export type SubTag = keyof typeof SUB_TAGS;

/** The keys, in specification order. The one thing that iterates the vocabulary. */
export const SUB_TAG_KEYS = Object.keys(SUB_TAGS) as readonly SubTag[];

/** The labels the model is offered, in the same order. */
export const SUB_TAG_LABELS: readonly string[] = SUB_TAG_KEYS.map((key) => SUB_TAGS[key]);

/**
 * At most two sub-tags on one place.
 *
 * Two rather than "as many as apply", and the reason is the chip row rather than the data: a place
 * carrying five labels stops being findable *by* any of them, because the row that renders them
 * truncates and the two that survive are whichever the model happened to emit first. Two is the
 * most a saved row shows without wrapping at 375 px, which is the width this product is designed
 * for.
 */
export const MAX_SUB_TAGS_PER_PLACE = 2;

/**
 * **Terms that mean a whitelisted label, keyed by their canonical form.**
 *
 * This started as spelling variants only, on the argument that anything more is *rounding* — and
 * rounding is how a closed vocabulary quietly reopens. The owner widened it on 2026-08-29 when the
 * existing library was aligned to the whitelist ("map obvious equivalents"), and the widening needs
 * a rule or it becomes taste. The rule is: **an alias is admitted only when the specification's own
 * text already says the target covers it.**
 *
 * That is what separates the three classes below from the ones deliberately left out. `Greek` is
 * admitted because the specification writes `Mediterranean (Greek, coastal, seafood)`; `Natural
 * wine` is refused because nothing says `Wine Bar` covers it, and a wine style is not a venue type.
 * `Pasta` is admitted because the specification writes `Italian (pizza, pasta)`; `Schnitzel` is
 * refused because it is a dish, and dishes have their own field. When in doubt the tag is dropped,
 * because a place with no tag is honest and a place with a tag nothing supports is not.
 *
 * Kept deliberately small in one direction: these are *cuisines and specialities*, never dishes,
 * vibes, neighbourhoods or venue types. `matcha`, `hidden gem`, `marylebone` and `market stall` all
 * have obvious-looking neighbours on the list and none of them is admitted.
 */
const SUB_TAG_ALIASES: Readonly<Record<string, SubTag>> = {
  // — 1. spelling variants of a listed label: the same word, written differently —
  bakeries: 'bakery',
  dessert: 'desserts',
  cocktail: 'cocktails',
  'beer and pub': 'beer pub',
  // British spelling. `specialty` is the label because the specification writes it that way.
  'speciality coffee': 'specialty coffee',

  // — 2. terms the specification's own coverage text names for that label —
  // `Italian (pizza, pasta)`
  pizza: 'italian',
  pasta: 'italian',
  // `Japanese (sushi, ramen, izakaya)`
  sushi: 'japanese',
  ramen: 'japanese',
  izakaya: 'japanese',
  // `Asian (Thai, Vietnamese, Chinese, pan-Asian)`
  thai: 'asian',
  vietnamese: 'asian',
  chinese: 'asian',
  'pan asian': 'asian',
  // `Middle Eastern (Levantine, skewers, local street food)`. Bare `street food` is **not** here:
  // the specification gives it to both Middle Eastern and Mexican, so on its own it names neither.
  levantine: 'middle eastern',
  skewers: 'middle eastern',
  // `Mexican (tacos, Mexican street food)`
  tacos: 'mexican',
  // `American (burgers, BBQ, diners)`
  burgers: 'american',
  bbq: 'american',
  diner: 'american',
  diners: 'american',
  // `Mediterranean (Greek, coastal, seafood)`. `coastal` is left out: alone it describes a view.
  greek: 'mediterranean',
  seafood: 'mediterranean',
  // The `cafe` category covers "bakeries, patisseries, ice cream and desserts", and the sub-tags
  // are where that distinction survives now that the category itself cannot express it.
  patisserie: 'bakery',
  patisseries: 'bakery',
  pastries: 'bakery',
  'ice cream': 'desserts',
  gelato: 'desserts',
  // Breakfast and brunch are one facet in this vocabulary, by the owner's ruling of 2026-08-29.
  // It was dropped by the first alignment rather than mapped, on the grounds that they are not the
  // same meal and `Brunch` carries no coverage text to admit it — the owner overruled that, which
  // is the right call for a list with one morning label and no second one.
  breakfast: 'brunch',
  // An Asian cuisine the specification does not name individually, and `Asian` is the label that
  // exists for exactly that case. The live library carries it on two places.
  nepalese: 'asian',

  // — 3. direct translations of a listed label —
  // The prompt requires English and `p11` measured that requirement leaking anyway. A Hebrew tag
  // reaching the gate is a bug upstream; mapping it is cheaper than a permanently unfindable chip,
  // and Hebrew<->English is this product's stated language scope.
  'מאפייה': 'bakery',
  'מאפים': 'bakery',
};

/** The alias pairs, for the callers that have to reproduce this table somewhere else — today the
 *  one-off data alignment in `supabase/migrations/0028_align_tags_to_taxonomy.sql`, which cannot
 *  import TypeScript and is held to this list by `tests/unit/places/taxonomy-migration.test.ts`. */
export const SUB_TAG_ALIAS_PAIRS: readonly (readonly [string, SubTag])[] = Object.entries(
  SUB_TAG_ALIASES
) as readonly (readonly [string, SubTag])[];

/** The whitelist entry a canonicalised tag belongs to, or `null` if it is not in the vocabulary. */
export function resolveSubTag(canonical: string): SubTag | null {
  if (isSubTag(canonical)) return canonical;
  return SUB_TAG_ALIASES[canonical] ?? null;
}

export function isSubTag(value: unknown): value is SubTag {
  return typeof value === 'string' && Object.hasOwn(SUB_TAGS, value);
}

/** How a stored sub-tag is written for a human. Falls back to the stored string for a tag saved
 *  before this vocabulary closed — those rows still exist and still render. */
export function subTagLabel(stored: string): string | null {
  return isSubTag(stored) ? SUB_TAGS[stored] : null;
}
