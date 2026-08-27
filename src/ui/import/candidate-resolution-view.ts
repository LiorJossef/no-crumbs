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

import { deriveResolution } from '@/domain/import/pipeline';
import type { StoredResolution } from '@/domain/import/resolution-record';
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
  /** The lookup itself failed. Not "no such place" — we never got an answer. */
  | { readonly kind: 'failed'; readonly reason: 'lookup_failed' | 'timed_out' }
  /** Past `MAX_CANDIDATES`: kept and shown, but never put to the resolver. */
  | { readonly kind: 'capped' }
  /** No record at all — this candidate was never put to the resolver. */
  | { readonly kind: 'not_attempted' };

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
  return 'No address in the map data';
}

function toOption(ranked: RankedPlace, index: number): ResolutionOption {
  return {
    index,
    name: ranked.place.name,
    detail: optionDetail(ranked.place),
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

  const options = resolution.result.shortlist.map(toOption);
  // An empty shortlist cannot produce `resolved`/`ambiguous` from `deriveResolution`, but a view
  // with a picker and no options would be a dead control, so the impossible case is stated.
  if (options.length === 0) return { kind: 'unresolved' };

  return derived.status === 'resolved' ? { kind: 'matched', options } : { kind: 'ambiguous', options };
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
 */
export function willSave(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): boolean {
  return effectivePick(view, pick) !== null || modelHasCoordinates;
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
      return 'Which one is it?';
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
      return 'We found these, but we can’t tell which one the caption meant. Nothing is matched until you pick.';
    default:
      return null;
  }
}

/**
 * The pin line, when — and only when — the resolver is what decides where this save lands. Null
 * means the screen keeps saying what it already said about the model's own guess
 * (`candidate-presentation.ts`'s `locationLine`), which is the unchanged fallback.
 *
 * The middle case is the one worth spelling out. A candidate with options, no pick and no model
 * coordinate used to read "We couldn't place this one" — sitting directly above a shortlist of
 * places we had, in fact, found. What is missing there is the user's answer, not the data.
 */
export function resolverPinLine(
  view: CandidateResolutionView,
  pick: number | null,
  modelHasCoordinates: boolean,
): string | null {
  if (effectivePick(view, pick) !== null) return 'Pin from the map data';
  if (resolutionOptions(view).length > 0 && !modelHasCoordinates) return 'Waiting on your pick';
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

/** What an `ambiguous` candidate needs before it can be saved, once it has no model pin to fall
 *  back on. Null whenever the save would go through as things stand. */
export function pickRequiredNotice(
  modelHasCoordinates: boolean,
  view: CandidateResolutionView,
  pick: number | null,
): string | null {
  if (willSave(modelHasCoordinates, view, pick)) return null;
  return view.kind === 'ambiguous' ? 'Pick one of these to save it.' : null;
}
