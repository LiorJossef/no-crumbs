/**
 * What this user has already added to their map **from this exact TikTok video**, and what the
 * review screen says about it.
 *
 * ## The defect this exists for
 *
 * Round-3 feedback §6.1 reported one video saved twice — "once using a caption-derived candidate
 * and once using the Google Maps-derived match". The plan blamed a missing dedupe between two
 * candidates of one extraction. Measured on the local database on 2026-09-02, that hypothesis is
 * **refuted**: source `7532812892819721479` holds one extraction with one candidate (`רגאצי`),
 * **three** `imports` rows, and two saved places — an `llm-guess` pin at 32.0853,34.8878 and a
 * `google-places` pin at 32.0864,34.8583. Same `name_key`, 2.7 km apart, so `resolve_place`'s
 * 75 m + `name_key` guard cannot merge them. They came from two *separate imports* 29 seconds
 * apart, not from two candidates of one.
 *
 * At scale, source `7346702347491446049`: 16 imports, 3 extractions, **18 saved places**, of which
 * five pairs share a `name_key` outright (`kiaans`, `lanonnabrixton`, `thelaughingyak`,
 * `thelifegoddess`, `tokii`).
 *
 * So the cause is **re-adding one video**, with nothing on screen telling the person they have
 * been here before. Nothing in the product ever said so, and `PROMPT_VERSION`'s move from p16 to
 * p17 made it worse rather than better: the extraction cache is keyed on the prompt version, so
 * every re-paste after a bump re-extracts and can spell the same venue a new way.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is **information, not a block**. Everything here is a default and a sentence; the person can
 * still add the same place again on purpose, and the screen never refuses. That is the same
 * position `docs/product-ruling-one-place-one-object.md` takes elsewhere — state the fact, leave
 * the decision.
 *
 * It **invents no new notion of sameness**. Place identity lives in `docs/08-place-identity.md`
 * and in the database's `place_name_key`; this compares `placeNameKey()` outputs, the existing
 * TypeScript reading of that same normalisation, on both sides — the prior save's stored name and
 * the name this card would write. Two names that key alike, from the same video, are the same
 * recommendation. Nothing fuzzier: `Kiaans` and `Kiaans Tooting` key differently and this module
 * says nothing about them, which is honest rather than clever. Widening that is a place-identity
 * change and belongs to resolution, not to a review screen.
 *
 * A **global** duplicate check — "you already have this place, from anywhere" — was built and
 * rejected by the owner on 2026-08-29, for a reason the screen made obvious: on a post whose only
 * candidate was already saved, the single card arrived unticked and the primary button read
 * `Select a place to save`, so the review screen offered nothing to do and never said why.
 *
 * ## H-T3 — the second import that finds a *better* answer, and why nothing here merges
 *
 * The 7532… pair is not two mistakes. The first import guessed the pin from the caption
 * (`llm-guess`, no `resolution_score`); the second resolved the same name against Google
 * (`google-places`, 0.8) and landed 2.7 km away, which is 2.7 km *better*. The user now owns both.
 *
 * **The right behaviour is to re-point the existing save, not to write a second one and not to
 * merge two rows afterwards.** That capability already exists and is unused:
 * `repoint_saved_place(p_user_id, p_saved_place_id, p_place_id)`, migrations `0032`/`0033`,
 * reviewed by `security-privacy` and signed off in `docs/db-ruling-repoint-place-2026-08-31.md`.
 * It moves one person's save onto a different `places` row, keeping the note, the tags, the
 * been-mark and the link back to the TikTok — which is exactly the shape of "the same
 * recommendation, better located". `grep -rn repoint_saved_place src/` returns **nothing**: the
 * function has no caller anywhere in the product.
 *
 * **What it would cost, honestly.** The migrations are not applied to the local container (its
 * applied head is `0027`; the ruling records `0032`/`0033` as unapplied and every proof in it ran
 * inside a rolled-back transaction), so nothing about the upgrade path can be exercised here today.
 * Beyond applying them it needs: a server action that calls the function with a `places` id **it**
 * resolved — the function's own header makes the caller the trust boundary, because a browser-
 * supplied id would let anyone re-point a save onto any row; a screen that asks, since silently
 * moving somebody's pin is the confidently-wrong move the charter forbids; and a decision about the
 * user's `display_name`, category override and note, none of which the provider's answer replaces.
 *
 * **And it is explicitly not a backfill.** `docs/current-state.md` open item 9 records four
 * `llm_guess` duplicate pairs that no distance guard reaches and rules out backfilling them without
 * reviewing the rows first. Nothing in this module writes, moves or merges anything. It is one
 * read and one sentence — the part that can be built honestly today.
 *
 * ## The 2026-08-29 ruling
 *
 * This is scoped to **this source**, and it is never silent: the screen leads with a sentence
 * naming what was added before, and each affected card says `Already added from this video` on
 * its face. The rejected version withheld a tick and explained nothing. That said, this does
 * re-take a decision the owner has ruled on once, in a narrower form, and the report for lane H
 * says so rather than burying it.
 */
import { placeNameKey } from '../places/name-key';

/**
 * One place this user already added from this source, as the API hands it over.
 *
 * Two names and nothing else. No `places.id`, no coordinate, no `saved_places.id`: the screen's job
 * is to say *what* is already there, and this surface has no use for an identifier it is not
 * allowed to write with. Re-pointing a save — the thing an id would be for — is H-T3 above, and it
 * is deliberately not built here.
 */
export interface PriorSave {
  /**
   * `places.name` — the identity spelling, and what the match below is made on. Never the user's
   * override: a person who renamed their save still added *that place*, and matching on the label
   * would make the mark disappear the moment they personalised it.
   */
  readonly placeName: string;
  /**
   * What this person calls it — their `saved_places.display_name`, or `placeName` when they never
   * set one. What the notice prints, because a sentence about someone's map should use their word
   * for it.
   */
  readonly label: string;
}

/** How many names the notice spells out before it starts counting instead. */
const NAMES_SHOWN = 3;

/**
 * The identity spellings of everything already added from this source.
 *
 * Through `placeNameKey`, not through the database's `name_key` column, and that asymmetry is
 * deliberate — `domain/places/name-key.ts` explains it at length. The TS function is at least as
 * collapsing as the SQL one, and the only comparison made here is TS output against TS output.
 */
export function priorSaveKeys(saves: readonly PriorSave[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const save of saves) {
    const key = placeNameKey(save.placeName);
    if (key !== '') keys.add(key);
  }
  return keys;
}

/**
 * Whether the name this card would write is already on the map from this same video.
 *
 * `candidateName` must be the name the **save** would write — `savedPlaceName(view, pick)` where
 * the resolver settled it, the candidate's own title otherwise — for the same reason
 * `candidate-presentation.ts` exists: a card that marks itself against a string it is not going to
 * save is worse than no mark at all.
 */
export function alreadyAddedFromSource(
  priorKeys: ReadonlySet<string>,
  candidateName: string | null,
): boolean {
  if (candidateName === null) return false;
  const key = placeNameKey(candidateName);
  return key !== '' && priorKeys.has(key);
}

/**
 * The screen-level notice, in three parts so the names can be wrapped in `<bdi>`.
 *
 * Parts rather than one string because half this product's place names are Hebrew: a joined
 * sentence puts an RTL run next to LTR punctuation and the bidi algorithm moves the comma. The
 * same reason every name on this screen is already a `<bdi>`.
 *
 * `null` when this source has never been added from — the common case, and the screen shows
 * nothing at all.
 */
export interface PriorSaveNotice {
  readonly lead: string;
  readonly names: readonly string[];
  /** `null` when every prior save is named in `names`. */
  readonly more: string | null;
  readonly tail: string;
}

/**
 * @param saves       every place already added from this source, in the order the API returned.
 * @param markedCount how many candidates on screen this run were marked as already added — which
 *                    decides whether the second sentence can honestly talk about the list below.
 */
export function priorSaveNotice(
  saves: readonly PriorSave[],
  markedCount: number,
): PriorSaveNotice | null {
  if (saves.length === 0) return null;

  const names = saves.slice(0, NAMES_SHOWN).map((s) => s.label);
  const remaining = saves.length - names.length;

  return {
    lead:
      saves.length === 1
        ? 'Already on your map from this TikTok video:'
        : `${saves.length} places are already on your map from this TikTok video:`,
    names,
    more: remaining > 0 ? `and ${remaining} more` : null,
    // Three endings, because there are three different true things to say. The first two describe
    // the list below; the third refuses to, because nothing below matches — which is exactly what
    // happens when the model re-spells a venue between prompt versions, and the person needs to
    // know that before they add `Kiaans Tooting` beside their `Kiaans`.
    tail:
      markedCount === 0
        ? 'Nothing found this time matches those names, so check before you add.'
        : markedCount === 1
          ? 'It’s not selected below. Select it to add it again.'
          : 'They’re not selected below. Select one to add it again.',
  };
}

/** The mark on a card whose name is already on the map from this same video. */
export const ALREADY_ADDED_LINE = 'Already added from this video';
