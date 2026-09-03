/**
 * What the review screen shows about the resolver's answer for one candidate — as pure data, so
 * the copy and the option list can be tested without a DOM.
 *
 * ## Why this module exists rather than an `if` inside the card
 *
 * `/api/imports/probe` now runs a real `PlaceResolver` and returns each candidate with a
 * `resolution` sibling (`domain/import/resolution-record.ts`). Roughly a third of candidates come
 * back in the `confirm` band: a real shortlist, but a margin too small to say which entry is the
 * venue. Until this screen existed there was no way for the user to pick, so those saves fell back
 * to the model's own guessed coordinate — measured 555 m and 483 m from truth for the same caption
 * on two runs, where the resolver's row for the same venue is 11 m out.
 *
 * Three rules are load-bearing here, and each of them was a bug waiting to happen:
 *
 *  1. **The band is derived once, by `deriveResolution`.** `domain/import/pipeline.ts` owns the
 *     `preselect → resolved` / `confirm → ambiguous` / `no_match → unresolved` mapping and the
 *     confirm route applies it through `chooseResolvedPlace`. A second mapping written in the UI
 *     is a place for the screen and the server to disagree about what was saved.
 *  2. **An option's identity is its index in the stored shortlist.** That index is the entire
 *     payload the browser is allowed to send about *which* place (`optionIndex`). It may never
 *     send a name, a coordinate or a provider id — the authority boundary written in
 *     `domain/import/candidate-place.ts`'s header, after a POST once renamed and relocated a place
 *     other users had saved. So `ResolutionOption.index` is carried explicitly rather than being
 *     the array position of whatever the view happened to render.
 *  3. **`null` is not `no_match`.** A `null` record means the candidate was never put to the
 *     resolver (an extraction row written before the resolver was wired in, or a candidate past
 *     `MAX_CANDIDATES`). Saying "we found nothing" for "we never looked" is the
 *     uncertainty-into-certainty move the working agreement forbids, so the two have different
 *     kinds and different words.
 */

import { offerableShortlist } from '@/domain/import/offerable-shortlist';
import { deriveResolution } from '@/domain/import/pipeline';
import type { StoredFailureReason, StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolvedPlace } from '@/domain/types';

/**
 * One entry of a stored shortlist, ready to render.
 *
 * `detail` — not the name — is what the user actually decides on: a chain with four branches
 * returns four rows called "Cafe Cafe", and the address is the whole answer.
 */
export interface ResolutionOption {
  /** Position in the **stored** shortlist. This, and nothing else, is what a confirm may send. */
  readonly index: number;
  readonly name: string;
  /** Address and/or locality, deduplicated. Never empty — see `optionDetail`. */
  readonly detail: string;
  /**
   * The same fields as `detail`, but `null` where `detail` is the "no address" sentence.
   *
   * `detail` is a line to render and is never blank, deliberately. That makes it the wrong thing to
   * put in a query: `googleMapsSearchUrl` was handed it and searched Google for
   * `Kohi, No address in the map data`. Two fields rather than a caller that pattern-matches the
   * sentence, because the sentence is copy and copy changes.
   */
  readonly address: string | null;
  readonly lat: number;
  readonly lng: number;
}

export type CandidateResolutionView =
  /**
   * `preselect` band. The top entry auto-accepts on save (measured: zero false auto-accepts on 14
   * adjudicated Tel Aviv cases), but the shortlist is still offered — `chooseResolvedPlace`
   * deliberately honours an explicit pick here, because "the top entry is a default, not a verdict".
   */
  | { readonly kind: 'matched'; readonly options: readonly ResolutionOption[] }
  /** `confirm` band. Options are real; the margin says we cannot tell them apart. No auto-accept. */
  | { readonly kind: 'ambiguous'; readonly options: readonly ResolutionOption[] }
  /** We looked and found nothing that matched. */
  | { readonly kind: 'unresolved' }
  /**
   * The lookup itself failed. Not "no such place" — we never got an answer. `reason` carries the
   * adapter's classification since 2026-08-28 (`domain/import/provider-failure.ts`), which is what
   * lets `lookupFailureNotice` say "we are out of lookups for today" rather than the one
   * undifferentiated "that broke" this screen used to have for every cause.
   */
  | { readonly kind: 'failed'; readonly reason: StoredFailureReason }
  /** Past `MAX_CANDIDATES`: kept and shown, but never put to the resolver. */
  | { readonly kind: 'capped' }
  /** No record at all — this candidate was never put to the resolver. */
  | { readonly kind: 'not_attempted' };

/** What `optionDetail` says when the map data carried neither an address nor a locality. Named so
 *  `ResolutionOption.address` can recognise it without matching on the copy. */
const NO_ADDRESS_DETAIL = 'No address in the map data';

/**
 * `21 Kingly St, London` — the fields that actually distinguish two rows with the same name.
 *
 * The locality is dropped when the address already contains it ("חצר השוק 6, רעננה"), the same
 * duplication `candidateMeta` and `googleMapsSearchUrl` both guard against. With neither field,
 * the honest line is that the map data has no address, not a blank.
 */
export function optionDetail(place: ResolvedPlace): string {
  const address = place.addressLine?.trim() ?? '';
  const locality = place.locality?.trim() ?? '';
  if (address !== '' && locality !== '') {
    return address.toLowerCase().includes(locality.toLowerCase()) ? address : `${address}, ${locality}`;
  }
  if (address !== '') return address;
  if (locality !== '') return locality;
  return NO_ADDRESS_DETAIL;
}

function toOption(ranked: RankedPlace, index: number): ResolutionOption {
  const detail = optionDetail(ranked.place);
  return {
    index,
    name: ranked.place.name,
    detail,
    address: detail === NO_ADDRESS_DETAIL ? null : detail,
    lat: ranked.place.lat,
    lng: ranked.place.lng,
  };
}

/** The one place a `StoredResolution` becomes something the screen can render. */
export function resolutionView(resolution: StoredResolution | null): CandidateResolutionView {
  if (resolution === null) return { kind: 'not_attempted' };
  if (resolution.kind === 'capped') return { kind: 'capped' };
  if (resolution.kind === 'failed') return { kind: 'failed', reason: resolution.reason };

  // The band mapping is `deriveResolution`'s, not ours — rule 1 in this file's header.
  const derived = deriveResolution(resolution.result);
  if (derived.status === 'unresolved') return { kind: 'unresolved' };

  // Not the whole shortlist (E-T1): the rows within a score band of the top. Under `confirm` the
  // band is decided on the top row alone, so rows 2..5 used to arrive with no floor at all and a
  // weak name plus a city hint offered five unrelated venues as five equally likely answers.
  // `offerableShortlist` is a prefix, so an option's index is still its stored shortlist index.
  const options = offerableShortlist(resolution.result.shortlist).map(toOption);
  // An empty shortlist cannot produce `resolved`/`ambiguous` from `deriveResolution`, but a view
  // with a picker and no options would be a dead control, so the impossible case is stated.
  if (options.length === 0) return { kind: 'unresolved' };

  return derived.status === 'resolved' ? { kind: 'matched', options } : { kind: 'ambiguous', options };
}

/**
 * An `ambiguous` view whose offerable list holds **exactly one** row.
 *
 * ## Why this state needs a name of its own
 *
 * Measured 2026-09-03 on the owner's six failing TikToks: three of the six land here, and all three
 * read the same way. `offerableShortlist` cuts the stored shortlist to the rows within
 * `rivalScoreBand` of the top, so a `confirm`-band result routinely arrives with **one** offerable
 * row — and the screen still asked *"Which one is it?"* over a list of one. A question with one
 * answer is not a question; it is a control the user has no reason to touch.
 *
 * That was the harmless half. The harmful half is that `arrivesTicked` was `willSave(..., null)`,
 * true whenever the model produced a coordinate — so the card arrived **pre-ticked on the model's
 * own pin while the provider's unpicked row sat directly above it**. Drift between the two, same
 * candidate, measured: 2.78 km (`רגאצי`), 4.70 km (`Bread - Lehi 2`), 1.36 km (`Kro Bakery`). Two
 * competing answers for one venue on one card, and the silent default took the worse one — which is
 * also the owner's round-4 feedback 6.1, one place saved twice.
 *
 * The fix is not to promote the provider row to a match and it is not a new threshold. The band
 * stays `deriveResolution`'s, the scorer is untouched, the cut is untouched. What changes is that
 * the card asks the question that genuinely has two answers — **this row, or the caption's own
 * pin** — and answers neither on the user's behalf.
 */
function isSoleOption(view: CandidateResolutionView): boolean {
  return view.kind === 'ambiguous' && view.options.length === 1;
}

/** The options a user may pick from, or an empty list for every view that has none. */
export function resolutionOptions(view: CandidateResolutionView): readonly ResolutionOption[] {
  return view.kind === 'matched' || view.kind === 'ambiguous' ? view.options : [];
}

/**
 * Which option is shown as chosen: the user's explicit pick, or — under `matched` only — the top
 * entry, which is what the server would auto-accept if the user sends no `optionIndex` at all.
 * `ambiguous` has no default on purpose: a silent default there *is* the auto-accept the band
 * exists to prevent.
 */
export function effectivePick(view: CandidateResolutionView, pick: number | null): number | null {
  if (pick !== null) return pick;
  return view.kind === 'matched' ? (view.options[0]?.index ?? null) : null;
}

/**
 * The name this candidate would actually be **saved** under, or `null` when the save would use the
 * model's own name.
 *
 * ## The bug this closes
 *
 * `candidateTitle` in `domain/import/candidate-presentation.ts` documents itself as *"what the card
 * is titled — and, by construction, what `derivePlaceSave` writes to `places.name`"*. That is true
 * only on the unresolved path, where the save really does write `identifiedName ?? rawName`. On the
 * resolved path `derivePlaceSave` writes `place.name` — the provider's name — with its own comment
 * explaining that this is the entire point of resolving: *"the gazetteer knows what the venue is
 * called and the caption only knows what it was called."*
 *
 * Both comments are right and together they were a lie on screen. The user confirmed a card titled
 * `קוהי` — the model's reading of the caption — and got `Kohi בית קפה יפני` in their library. It is
 * the same defect `ux-import-review-screen.md` §3.2 was written to kill, reintroduced by resolution
 * rather than by copy.
 *
 * The fix is the general one rather than a rename: **the card is titled with whatever the save will
 * write**, derived from the same `effectivePick` the save is derived from, so the two cannot drift
 * again. `null` means there is no resolved pick, and the caller falls back to `candidateTitle`.
 */
export function savedPlaceName(
  view: CandidateResolutionView,
  pick: number | null,
): string | null {
  const chosen = effectivePick(view, pick);
  if (chosen === null) return null;
  return resolutionOptions(view).find((option) => option.index === chosen)?.name ?? null;
}

/**
 * Whether pressing Save would actually write this candidate.
 *
 * This replaced `isSaveable(candidate)` alone, which asked only whether the *model* gave a
 * coordinate. A candidate the resolver matched but the model never placed is saveable — the
 * server derives the coordinate from the stored shortlist entry — and the old test hid it from the
 * screen entirely. The three ways a save gets a coordinate, and they are exactly the server's
 * (`chooseResolvedPlace` + `derivePlaceSave`):
 *
 *  - the user picked a shortlist entry;
 *  - the band is `preselect`, so the top entry auto-accepts;
 *  - the model gave a coordinate, which is the unchanged `llm_guess` fallback.
 *
 * An `ambiguous` candidate with no model coordinate and no pick yet is deliberately **not**
 * saveable: the server would return `skipped` for it, and counting it on the Save button would be
 * a promise the request cannot keep.
 *
 * **Saveable is not the same question as ticked-on-arrival**, and conflating them was defect G5 —
 * see `arrivesTicked` below, which is what the review screen seeds its selection from.
 */
export function willSave(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): boolean {
  return effectivePick(view, pick) !== null || modelHasCoordinates;
}

/**
 * Whether the review screen ticks this candidate **before the user has touched it**.
 *
 * `willSave` answers "would Save write this?"; this answers "should Save write this without being
 * asked?". They were the same function until 2026-08-31, and the gap between the two questions was
 * growth defect G5: a `capped` candidate — one past `MAX_CANDIDATES`, which the resolver **never
 * looked at** — arrived ticked whenever the model had produced a coordinate, so the card carrying
 * the least provenance on the screen was saved by default. Nothing had verified that pin and
 * nothing had claimed to.
 *
 * The line is drawn at *was this candidate put to the resolver at all*, and only there:
 *
 *  - `matched` / `ambiguous`-with-a-pick — a provider row. Ticked.
 *  - `ambiguous` with rows and no pick — **not** ticked, since 2026-09-03. The tick used to fall
 *    through to the model's coordinate here, so the one card holding two competing answers for one
 *    venue silently took the worse of them. See `isSoleOption` for the measurement.
 *  - `unresolved` / `failed` with a model coordinate — the degraded path the owner ruled in on
 *    2026-08-28 (*resolution must never dead-end*). We looked, we got nothing back, and the card
 *    says `Pin from the caption` about the pin it is about to save. **Still ticked**, deliberately:
 *    this is not the defect, and un-ticking it would quietly repeal that ruling.
 *  - a name the caption gives **only inside a hashtag** — **not** ticked. The prose never says the
 *    creator went there, so nothing has established it is a recommendation.
 *  - `capped` / `not_attempted` with a model coordinate — **not** ticked. Not because the pin is
 *    worse than the one above it (it is the same model coordinate) but because nothing about it has
 *    been checked, and the default has to be the one that does not decide on the user's behalf.
 *
 * It is a *default*, not a veto. Such a candidate stays saveable, keeps its checkbox, is counted in
 * `saveableIndices`, and is included by `Select all` — one tap saves it, and the card states its
 * provenance while the user is deciding (`resolverPinLine`). Making it unsaveable would trade one
 * silent decision for another.
 */
export function arrivesTicked(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  /**
   * The caption named this place **only inside a hashtag** — `isHashtagOnly`, the same function the
   * card's notice comes from. Defaults to `false` so no caller is silently changed.
   *
   * **Added 2026-09-01 for the same reason as `capped`, on a measured recurrence.** The caption of
   * one sentence and 28 tags — `RICH-EXT-1` §4's specimen — produced `tsukjimarket`, which resolved
   * to `Tsukiji Market` at **1.000 and pre-selected**. `filterPlausible` caps such a candidate's
   * `modelConfidence` at 0.5 and the card writes "Only mentioned in a hashtag", and **neither of
   * those reaches this decision**: `SCORING.total.datasetConfidence` is 0, so the cap gates
   * nothing, and the notice is drawn beside a box that is already ticked. That file's own docblock
   * says the intent was for such a candidate to arrive "as a labelled, capped candidate the user
   * can reject, rather than as the confident find it used to be" — and pre-ticked *is* the
   * confident find.
   *
   * The prose of that caption never says the creator went to Tsukiji. Nothing has checked that it
   * is a recommendation at all, which is the exact test the `capped` rule above is drawn on.
   */
  hashtagOnly = false,
): boolean {
  if (view.kind === 'capped' || view.kind === 'not_attempted') return false;
  if (hashtagOnly) return false;
  // 2026-09-03, feedback 6.1/6.4. An `ambiguous` view always carries offerable rows, none of them
  // picked — so before this line the tick fell through to the model's coordinate while the
  // provider's own row for the same candidate sat unpicked above it. See `isSoleOption`: three of
  // the owner's six failing links were this, 1.36-4.70 km apart. The user is not being told the
  // provider row is right; they are being asked, and neither answer is taken for them.
  if (view.kind === 'ambiguous' && view.options.length > 0) return false;
  return willSave(modelHasCoordinates, view, null);
}

/**
 * Whether this candidate's pin would come from the **model** rather than from a resolver match.
 *
 * The mirror of `willSave`'s three cases: a picked option and an auto-accepted `matched` top entry
 * both yield a provider coordinate, so only the `llm_guess` fallback is left. That is the one case
 * `LOCATION_CAVEAT` ("pins can be a street or two off") is actually true of.
 *
 * It exists because the caveat used to be unconditional, on the stated grounds that "our honest
 * position is identical on every candidate". That stopped being true when resolution shipped: a
 * resolved pin is the venue's own coordinate — measured 11 m for HaKosem, against 65-470 m for the
 * model's guess — so telling that user their pin may be a street off is simply false, and a
 * caveat the user learns to disbelieve is worse than none.
 */
export function usesModelCoordinate(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): boolean {
  return effectivePick(view, pick) === null && modelHasCoordinates;
}

/**
 * Whether the review screen collapses to a single confident result (`ux-import-flatten.md` §3):
 * one candidate, and the resolver settled it.
 *
 * The condition is `deriveResolution`'s existing `preselect` band and nothing else — no second
 * threshold, no number of its own. That matters twice over:
 *
 *  - `matched` is the one boundary we have measured (Google: 15/16 correct top-1, zero wrong
 *    auto-matches), so the state that removes the tickbox is the state that earned it;
 *  - **`matched` can never be a caption pin.** `effectivePick` always returns its top entry, so
 *    `usesModelCoordinate` is false and `resolverPinLine` is `Pin from the map data` for every
 *    view this returns true for. The collapse therefore cannot be the thing that hides a guess —
 *    which is exactly the defect §1.3 found on the `ambiguous` + model-coordinate card.
 *
 * Two or more candidates, `ambiguous`, `unresolved`, `failed`, `capped` and `not_attempted` all
 * render as they always have.
 */
export function collapsesToOneResult(views: readonly CandidateResolutionView[]): boolean {
  return views.length === 1 && views[0]?.kind === 'matched';
}

/**
 * The heading over an option list.
 *
 * Only the two states that *have* options get one. `unresolved`, `failed`, `capped` and
 * `not_attempted` deliberately return `null`: this task added the picker and changed nothing about
 * how those four already read, and the last two in particular must never acquire wording that
 * claims a search happened — "we never looked" is not "we looked and found nothing"
 * (`resolution-record.ts`). Giving each of the four its own honest sentence is worth doing; doing
 * it here, untested against the screens they share, is how "no match" and "not checked" end up
 * saying the same thing.
 *
 * There is no confidence number in any of this copy, for the same reason
 * `candidate-presentation.ts` has none: the score behind these bands is an internal ranking, and
 * rendering it as a percentage would dress it as a finding.
 */
export function resolutionHeadline(view: CandidateResolutionView): string | null {
  switch (view.kind) {
    case 'matched':
      return 'Matched to a place on the map';
    case 'ambiguous':
      // A list of one cannot be asked "which one" (`isSoleOption`). The real question there has two
      // answers and only one of them is in the list: this row, or the pin the caption gave us.
      return isSoleOption(view) ? 'Is this the place?' : 'Which one is it?';
    default:
      return null;
  }
}

/** The sentence under that heading — what we know, and what we are still asking. */
export function resolutionExplanation(view: CandidateResolutionView): string | null {
  switch (view.kind) {
    case 'matched':
      return 'Pick a different one if this isn’t it.';
    case 'ambiguous':
      // Two short sentences rather than one: what we have, and what picking it does. It says
      // nothing about how likely the row is — the band behind it is an internal ranking, and
      // "close" is already the most this screen may claim.
      return isSoleOption(view)
        ? 'One close match. Pick it to use its pin.'
        : 'The caption doesn’t say which.';
    default:
      return null;
  }
}

/**
 * Where this card's pin comes from, in the same slot for every candidate. `null` only for the one
 * case that has no pin at all, where the screen keeps saying what it already said
 * (`candidate-presentation.ts`'s `locationLine`: "We couldn't place this one").
 *
 * Four answers, and they are the provenances a save can actually have:
 *
 *  - **"Pin from the map data"** — a picked or auto-accepted shortlist entry. The venue's own
 *    coordinate; measured 11 m out for HaKosem.
 *  - **"Waiting on your pick"** — options exist, none chosen, and the model gave nothing to fall
 *    back on. This used to read "We couldn't place this one" while sitting directly above a
 *    shortlist of places we had in fact found; what is missing there is the user's answer, not the
 *    data.
 *  - **"Pin from the caption"** — the degraded path (owner ruling §1.3, 2026-08-28),
 *    and **only** where the place database genuinely gave us nothing: `failed` (we never got an
 *    answer) and `unresolved` (we got one and it was "no such place"). A card in either state can
 *    now be saveable *because* the lookup produced nothing, and `locationLine`'s older "Pin is
 *    approximate" reads as a hedge on a match rather than as the absence of one. This line and
 *    `lookupFailureNotice` are the two places the screen states that the coordinate came from what
 *    the caption said and not from a place database.
 *  - **"Pin from the caption. We didn’t check this one."** — the same coordinate, and a second fact
 *    the bare line above would misstate. See the `capped`/`not_attempted` paragraph below.
 *
 * `ambiguous` used to be excluded from that last case on the grounds that its pin is waiting on a
 * decision rather than on the data. That is true only while there is no model coordinate to save
 * instead — and when there is, `willSave` returns true, so `Save this place →` is live,
 * `pickRequiredNotice` is suppressed, and this line used to fall through to `locationLine`'s
 * `Pin is approximate`. The one card that would save a guess was the one card that did not say so,
 * with the provider's own rows sitting unpicked directly above it. Reaching here as `ambiguous`
 * means exactly that case: options exist, none is picked, and the model gave a pin. Such a card no
 * longer arrives **ticked** (`arrivesTicked`, 2026-09-03) — it stays saveable, and this line is
 * what it says about the pin it would save.
 * (`matched` can never reach here — `effectivePick` always returns its top entry.)
 *
 * `not_attempted`/`capped` get their **own** line, and the reason they cannot share the one above
 * is the reason they had none at all until 2026-08-31: they were never put to the resolver, so the
 * bare "Pin from the caption" — which contrasts the caption *with* a place database — would claim a
 * search that never happened. "We never looked" is not "we looked and found nothing"
 * (`resolution-record.ts`), and that distinction is not negotiable.
 *
 * Silence turned out to be the worse of the two errors, though. These cards still save the model's
 * coordinate when they have one, so the card carrying the least provenance on the screen was the
 * one card saying nothing about where its pin came from — and beside a sibling reading "Pin from
 * the map data", saying nothing reads as having nothing to declare. So both facts are stated and
 * neither is implied: where the pin came from, and that nobody checked it.
 *
 * It stops there. It does not say *why* nobody checked it: the cap is ours, not the post's, and
 * "only the first N candidates are looked up" is machinery, not news the reader can act on. And
 * with no model coordinate there is no pin to have a provenance, so it stays `null` and
 * `locationLine`'s "We couldn't place this one" is still the whole truth.
 */
export function resolverPinLine(
  view: CandidateResolutionView,
  pick: number | null,
  modelHasCoordinates: boolean,
): string | null {
  if (effectivePick(view, pick) !== null) return 'Pin from the map data';
  if (resolutionOptions(view).length > 0 && !modelHasCoordinates) return 'Waiting on your pick';
  if (
    modelHasCoordinates &&
    (view.kind === 'failed' || view.kind === 'unresolved' || view.kind === 'ambiguous')
  ) {
    // Deliberately short. This renders in a fixed-width row beside the Maps link, and the longer
    // wording it replaced measured 208 px into a 180 px box on a Pixel 7 — clipped to
    // "Approximate pin from the ca…", losing the half of the sentence that says where the pin came
    // from. Mobile is the primary target, so the honest wording arrived and was immediately cut.
    // "Approximate" is not lost: LOCATION_CAVEAT says how far off at screen level, and this line's
    // whole job is the provenance. The row also wraps now rather than truncating, so a future
    // longer string degrades visibly instead of silently.
    return 'Pin from the caption';
  }
  if (modelHasCoordinates && (view.kind === 'capped' || view.kind === 'not_attempted')) {
    // Two sentences rather than one clause, and longer than the line above on purpose: the row
    // wraps (see the note above) and the second fact is the one that stops this reading as a
    // match. The short-line constraint that shaped "Pin from the caption" was a truncation
    // hazard, and truncation is no longer how this row degrades.
    return 'Pin from the caption. We didn’t check this one.';
  }
  return null;
}

/**
 * The chip next to the candidate's name — the one-glance answer to "is this settled?".
 *
 * `needs_pick` is the only tone that must never look like the others: an ambiguous candidate the
 * user has not answered yet is the one state this screen exists to stop reading as a confirmed
 * match. Once they *have* picked, it is settled — a person who read the addresses and chose is
 * better evidence than the scorer — so the chip changes rather than sitting on a stale question.
 */
export function resolutionChip(
  view: CandidateResolutionView,
  pick: number | null,
): { readonly label: string; readonly tone: 'settled' | 'needs_pick' } | null {
  if (pick !== null && resolutionOptions(view).length > 0) {
    return { label: 'Your pick', tone: 'settled' };
  }
  if (view.kind === 'matched') return { label: 'Matched', tone: 'settled' };
  if (view.kind === 'ambiguous') return { label: 'Needs your pick', tone: 'needs_pick' };
  return null;
}

/**
 * The badge beside the candidate's name — the one-glance answer to **"where did this pin come
 * from?"** (W6-4, `overnight-copy-deck.md` §3.2).
 *
 * ## What changed, and why it is a correctness fix rather than a restyle
 *
 * The badge used to carry `resolutionChip`'s *settledness* in an 11px mint pill while provenance
 * sat at the bottom of the card in 12px grey. `facelift-plan.md` §1 called that out: the hierarchy
 * inverted the epistemics. The loudest thing on the card was how settled we were; the quietest was
 * whether anything had verified it. The two swap here — settledness demotes to the line this
 * vacates (`settlednessLine`), and it does not disappear, because a user who picked an option must
 * still see that their pick took.
 *
 * **None of the underlying logic moved.** The band is still `deriveResolution`'s, the three
 * provenances are still `resolverPinLine`'s three, and `not_attempted`/`capped` are still not
 * `no_match`. What changed is which slot renders which.
 *
 * ## The five labels
 *
 * | id | When | Label | Tone |
 * |---|---|---|---|
 * | C120 | a picked or auto-accepted shortlist entry | `From the map data` | settled |
 * | C121 | options exist, none picked, no model pin | `Needs your pick` | needs-pick |
 * | C122 | `failed`/`unresolved`/`ambiguous`, saving the model's coordinate | `From the caption` | caption |
 * | C123 | `capped`/`not_attempted` | `Not checked` | caption |
 * | C124 | `unresolved` with no coordinate at all | `No match` | needs-pick |
 *
 * **C120 and C122 are a matched pair.** They are the two answers to one question, and it is the
 * parallel that makes the difference legible at a glance; shortening one and not the other destroys
 * it. If the pair ever cannot fit, both go short together — `Map data` / `Caption` — never one of
 * each. A test pins that they carry the same `From the ` prefix or neither does.
 *
 * **C121 keeps `resolutionChip`'s own words**, read from it rather than repeated, because it is not
 * provenance at all — it is the absence of one — and it already ships, already tests and is already
 * right.
 *
 * **`caption` is its own tone, not the quiet one.** A pin the model guessed is not a lesser version
 * of a matched pin, it is a different kind of claim, and painting it grey is what made it the
 * quietest thing on the card in the first place.
 *
 * **`null` for a `failed` lookup with no model coordinate.** There is no honest five-word answer
 * for it: `No match` would say we looked and found nothing, which is precisely what `failed` is
 * not, and the copy deck specifies no sixth string. `lookupFailureNotice` already states that case
 * at screen level and the card's own line still says the pin is missing. Recorded as a gap rather
 * than filled by inventing a string.
 *
 * There is no confidence number, band, bar or percentage in any of this, and there may never be —
 * the score behind these bands is an internal ranking and rendering it would dress it as a finding.
 */
export function provenanceBadge(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): { readonly label: string; readonly tone: 'settled' | 'caption' | 'needs_pick' } | null {
  // C120. A picked or auto-accepted shortlist entry: the venue's own coordinate, 11 m out for
  // HaKosem against 65-470 m for the model's guess.
  if (effectivePick(view, pick) !== null) return { label: 'From the map data', tone: 'settled' };

  // C121. Read off `resolutionChip` rather than restated: one set of words for one state.
  const chip = resolutionChip(view, pick);
  if (chip !== null && chip.tone === 'needs_pick' && !modelHasCoordinates) {
    return { label: chip.label, tone: 'needs_pick' };
  }

  // C122. The degraded path (owner ruling §1.3, 2026-08-28), and only where the place database
  // genuinely gave us nothing: `failed` (no answer), `unresolved` (an answer of "no such place"),
  // and `ambiguous` with a model pin — the one card that would save a guess while the provider's
  // own rows sat unpicked above it.
  if (
    modelHasCoordinates &&
    (view.kind === 'failed' || view.kind === 'unresolved' || view.kind === 'ambiguous')
  ) {
    return { label: 'From the caption', tone: 'caption' };
  }

  // C123. Its own words, before C124's, because these two were never put to the resolver and
  // "we never looked" is not "we looked and found nothing" (`resolution-record.ts`). It is the
  // same distinction `resolverPinLine` draws with C125's second sentence.
  if (view.kind === 'capped' || view.kind === 'not_attempted') {
    return { label: 'Not checked', tone: 'caption' };
  }

  // C124. We looked, and there was nothing there.
  if (view.kind === 'unresolved') return { label: 'No match', tone: 'needs_pick' };

  return null;
}

/**
 * Where settledness went when provenance took the badge (W6-4).
 *
 * `Matched` and `Your pick` are the same two labels `resolutionChip` has always produced, in the
 * line the provenance vacated. They demote rather than vanish: a user who read three addresses and
 * chose one must still be able to see that their choice took, and the card's largest text is the
 * name the save will write, not a status.
 *
 * `null` for everything else. `Needs your pick` is deliberately **not** here — it moved to the
 * badge (C121), because "we have not settled this" is what the badge slot is for and repeating it
 * twice on one card would make the unsettled state the loudest thing on the screen.
 */
export function settlednessLine(
  view: CandidateResolutionView,
  pick: number | null,
): string | null {
  const chip = resolutionChip(view, pick);
  return chip !== null && chip.tone === 'settled' ? chip.label : null;
}

/** What an `ambiguous` candidate needs before it can be saved, once it has no model pin to fall
 *  back on. Null whenever the save would go through as things stand. */
export function pickRequiredNotice(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): string | null {
  if (willSave(modelHasCoordinates, view, pick)) return null;
  if (view.kind !== 'ambiguous') return null;
  // "one of these" over a list of one is the same one-answer question `isSoleOption` names.
  return isSoleOption(view) ? 'Pick it to save this place.' : 'Pick one of these to save it.';
}

/* ------------------------------------------------------------------------------------------- *
 * The degraded path — what the screen says when the place database could not answer.
 *
 * Owner ruling, 2026-08-28: *resolution must never dead-end.* A candidate whose lookup failed but
 * which carries the model's own coordinate is still saveable — `willSave` above has always said so
 * and `derivePlaceSave` has always written it as `llm_guess` with a null score. What the screen did
 * **not** do was say why there was no match, or that the pin it was about to save came from the
 * caption rather than from a place database. A user looking at four cards with no matches learned
 * nothing about whether to try again in a minute, tomorrow, or never.
 *
 * These two functions are that missing sentence. They are deliberately about the *cause*, and they
 * are deliberately screen-level rather than per-card: one failed lookup and seven failed lookups
 * have the same explanation, and repeating it eight times would read as eight problems.
 * ------------------------------------------------------------------------------------------- */

/**
 * The one failure to speak about when several candidates failed for different reasons.
 *
 * Priority, and each step is a claim about what the user can do next rather than about severity:
 *
 *  1. `quota_exhausted` wins outright. It is the only cause with a *time* attached — nothing works
 *    until tomorrow, and everything does then — so it must never be hidden behind a generic
 *    "something went wrong" that invites an immediate, guaranteed-useless retry.
 *  2. `timed_out` is next, but only when **every** failure was one: "it was too slow" is a claim
 *    about the provider's latency, and it stops being true the moment one of the failures was in
 *    fact a rejected key.
 *  3. Everything else collapses to one sentence. `auth`, `bad_request`, `provider_error`,
 *    `transport` and `lookup_failed` differ in what *we* must fix and not at all in what the user
 *    can do, and spelling out "our API key was rejected" on a review screen would be leaking our
 *    operational state into a product surface for no user benefit. The distinction is not lost —
 *    it is in the server log, which is where an operator reads it.
 *
 * `null` when nothing failed. A screen with no failures says nothing about failures.
 */
export function dominantFailure(
  views: readonly CandidateResolutionView[],
): StoredFailureReason | null {
  const reasons = views.flatMap((v) => (v.kind === 'failed' ? [v.reason] : []));
  if (reasons.length === 0) return null;
  if (reasons.includes('quota_exhausted')) return 'quota_exhausted';
  if (reasons.every((r) => r === 'timed_out')) return 'timed_out';
  return 'lookup_failed';
}

/**
 * What went wrong, and whether the user can still proceed — the sentence that turns a silent dead
 * end into a stated, recoverable one.
 *
 * `rescuedFromCaption` is how many of the **failed** candidates will still be written from the
 * model's own coordinate. It is a parameter rather than something derived here because it depends
 * on the user's current picks, which this module does not hold.
 *
 * ## It must count failures, and it must say a number
 *
 * Both halves of that were wrong when this shipped, and both were caught by rendering the screen
 * rather than by reading it. The caller passed "does *any* candidate on this screen use a model
 * coordinate", which is a different question: a `capped` candidate the resolver never saw, or one
 * that resolved to `no_match`, both satisfy it. So a screen whose failure left nothing behind
 * still read *"you can still save them"*, crediting the failure for a survivor it had nothing to
 * do with.
 *
 * The number matters for the same reason. A screen-level sentence about a per-candidate fact is
 * false as soon as the screen is mixed: with two matched candidates and one failure this said
 * *"these pins come from the captions"* directly above two cards chipped **Matched** and footed
 * *"Pin from the map data"*, and in the no-coordinate case it said *"we couldn't match these to a
 * place"* directly above the card that disproved it. Saying "2 of these" instead of "these" is
 * what makes one sentence at the top of a mixed screen true.
 *
 * The wording otherwise obeys the same rule as the rest of this screen: it says where the pin came
 * from ("the captions") and never that it is a match. It also stops short of promising the upgrade
 * — `resolution-record.ts` documents how these rows get a canonical Google identity later, but the
 * upgrader does not exist yet, and a UI promise is not the place to record an intention.
 */
export function lookupFailureNotice(
  views: readonly CandidateResolutionView[],
  rescuedFromCaption: number,
): string | null {
  const reason = dominantFailure(views);
  if (reason === null) return null;

  const failed = views.filter((v) => v.kind === 'failed').length;
  const cause =
    reason === 'quota_exhausted'
      ? 'We’ve used up today’s place lookups'
      : reason === 'timed_out'
        ? 'The place database didn’t answer in time'
        : 'We couldn’t reach the place database just now';

  if (rescuedFromCaption > 0) {
    const pins =
      rescuedFromCaption === 1 ? '1 of these pins comes' : `${String(rescuedFromCaption)} of these pins come`;
    return `${cause}, so ${pins} from the captions rather than a place database. You can still save them.`;
  }
  const them = failed === 1 ? 'one of these' : `${String(failed)} of these`;
  return `${cause}, so we couldn’t match ${them} to a place.`;
}
