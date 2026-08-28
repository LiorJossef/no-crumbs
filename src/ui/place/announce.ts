'use client';

/**
 * The one spoken channel on `/map`: whatever the page's single `role="status"` line is currently
 * saying, and the rule for who gets to overwrite whom.
 *
 * ## Why a channel rather than another live region
 *
 * `/map` already has exactly one `aria-live` region, rendered once in `map-page-client.tsx`,
 * deliberately: the mobile sheet and the desktop panel are two presentations of the same state and
 * only one of them is ever in the accessibility tree, so a region per surface would either
 * double-announce or announce from the hidden one. Marking a place as been is the second thing
 * that changes the list silently — the first was typing — so it belongs in that region rather than
 * in a second one. Two live regions on a page is how a screen reader ends up reading them
 * interleaved.
 *
 * ## Why a ticket, and why it is taken when the user acts
 *
 * The write is a Server Action, so two quick taps produce two round trips that can resolve in
 * either order. If the message were simply the last one to arrive, an earlier tap finishing late
 * would leave the region asserting something that is no longer true — the exact "stale result"
 * failure the search announcement already guards against by keying its sentence to the query it
 * describes.
 *
 * A ticket is taken at the moment of the gesture (`begin`) and presented when the sentence is ready
 * (`say`). `latestSpoken` then refuses anything not newer than what is already on screen, so
 * ordering is decided by when the user acted rather than by which request the network happened to
 * finish first.
 *
 * The filter sentence flows through the same channel for the same reason: two independent writers
 * of one region need one order between them, not two.
 */

import { createContext, use } from 'react';

/** What the region is saying, and the ticket of the interaction that put it there. */
export interface Spoken {
  readonly ticket: number;
  readonly message: string;
}

/** Nothing said yet. Ticket `0` so the first real announcement always wins. */
export const SILENT: Spoken = { ticket: 0, message: '' };

/**
 * The reducer: a message is accepted only if its ticket is at least as new as what is already
 * spoken. Equal tickets are accepted so a caller may correct its own sentence; older ones are
 * dropped, which is the whole point.
 */
export function latestSpoken(current: Spoken, ticket: number, message: string): Spoken {
  if (ticket < current.ticket) return current;
  return { ticket, message };
}

/** What a leaf needs in order to say something. `null` where no provider exists, exactly as
 *  `TagFilterContext` does — a control outside a provider simply does not announce. */
export interface Announcer {
  /** Claim the next position in the announcement order. Call this when the user acts, not when
   *  the result arrives. */
  readonly begin: () => number;
  readonly say: (ticket: number, message: string) => void;
}

export const AnnounceContext = createContext<Announcer | null>(null);

export function useAnnouncer(): Announcer | null {
  return use(AnnounceContext);
}
