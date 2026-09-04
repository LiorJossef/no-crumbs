"use client";

/**
 * The card's **"a panel is about to take room in me"** channel.
 *
 * A field row that opens an inline panel at `peek` or `half` would divide a column that is already
 * short between the panel and the card it belongs to. So the sheet is raised to `full` first, and
 * the row asks for that by calling this before it opens.
 *
 * A context rather than a prop for the reason `CollectionsContext` next door records: the rows that
 * own the panels live in `saved-place-edits.tsx` and `add-to-collection.tsx`, and a prop would have
 * to be threaded through three components' signatures for a value only the innermost one spends.
 *
 * It lives here rather than in `place-sheet.tsx` — which declares it and provides it — because
 * those two row files are imported *by* that file, so importing back out of it would close a cycle.
 *
 * `undefined` is a real value: outside `PlaceDetail`, and inside it for every host that passes no
 * `onPanelOpen` — the `lg+` popover and panel, `/collections/[id]`, and any test host. A consumer
 * calls it optionally (`useDetailPanelOpen()?.()`) and gets today's behaviour when nobody answers.
 */

import { createContext, use } from "react";

export const DetailPanelOpenContext = createContext<(() => void) | undefined>(
  undefined,
);

/** What a field row calls **before** it opens its panel. See `DetailPanelOpenContext`. */
export function useDetailPanelOpen(): (() => void) | undefined {
  return use(DetailPanelOpenContext);
}
