/**
 * **Regression: the header names an area that contains none of the places it is counting.**
 *
 * Reported on production, 2026-08-30: the owner imported the King David Hotel (Jerusalem), the pin
 * landed correctly and the extraction carried the right city — and the sheet header read
 * `1 in הרצליה`.
 *
 * This is not a resolution defect and not a clustering defect. It is `MapPageClient`'s scope state
 * machine, reproduced here as the two lines that own it:
 *
 *  - the optimistic write on a finished import — `setScope(scopeForAreaTap(savedPlaceIds[0]))`
 *    (`src/app/map/map-page-client.tsx:953`), whose comment claims it "resolves itself once the
 *    refreshed rows arrive, so this does not wait on the data";
 *  - the converge-during-render correction —
 *    `if (!sameScope(storedScope, listScope.scope)) setScope(listScope.scope)`
 *    (`src/app/map/map-page-client.tsx:389`).
 *
 * `onSaved` runs **before** `router.refresh()` (`src/app/import/import-page-client.tsx:722-724`),
 * so there is always at least one render in which the anchor names a place the library does not yet
 * contain. `resolveScope` returns `null` for it, `resolveScopeOrFallback` substitutes
 * `fallbackScope`, and the correction writes that substitute back into state — destroying the
 * anchor the import just wrote, in the same render pass, before the data can arrive to redeem it.
 *
 * The model below is deliberately the page's own derivation, line for line, so that a fix to either
 * line is what makes it pass.
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity, pickAnchorCluster } from '@/domain/places/clusters';
import { buildAreas, type Area } from '@/ui/place/active-area';
import { summariseByCountry } from '@/ui/place/library-summary';
import {
  fallbackScope,
  resolveScopeOrFallback,
  scopeForAreaTap,
  scopeHeading,
  type ListScope,
  type ResolvedScope,
} from '@/ui/place/list-scope';

interface TestPlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
  readonly countryCode: string | null;
}

const projections = {
  toId: (place: TestPlace) => place.id,
  toPoint: (place: TestPlace) => ({ lat: place.lat, lng: place.lng }),
  toLocality: (place: TestPlace) => place.locality,
};

/** One saved place already in the library, and the most recent one — so it is the anchor cluster
 *  and therefore `preferredAreaId`, which is what `fallbackScope` reaches for. */
const HERZLIYA: TestPlace = {
  id: 'p-herzliya',
  lat: 32.1624,
  lng: 34.8447,
  locality: 'הרצליה',
  countryCode: 'IL',
};

/** The import. ~56 km from Herzliya, so the two are separate clusters on distance alone — the
 *  locality veto never even has to be consulted. */
const KING_DAVID: TestPlace = {
  id: 'p-king-david',
  lat: 31.7754,
  lng: 35.2223,
  locality: 'ירושלים',
  countryCode: 'IL',
};

/**
 * `MapPageClient`'s scope state, and only that: the same `useMemo` chain in the same order,
 * with the render-phase correction at the end of it.
 */
class PageModel {
  private scope: ListScope | null = null;

  constructor(private places: readonly TestPlace[]) {}

  /** `router.refresh()` landing: fresh props, `created_at desc`. */
  refresh(places: readonly TestPlace[]): void {
    this.places = places;
  }

  /** `ImportPageClient`'s `onSaved` — writer 3 (`map-page-client.tsx:947-954`). */
  onSaved(savedPlaceIds: readonly string[]): void {
    const first = savedPlaceIds[0];
    if (first) this.scope = scopeForAreaTap(first);
  }

  render(): ResolvedScope<TestPlace> {
    const clusters = clusterByProximity(this.places, projections.toPoint, {
      toLocality: projections.toLocality,
    });
    const areas: readonly Area<TestPlace>[] = buildAreas(clusters, projections);
    const countries = summariseByCountry(
      areas,
      (place: TestPlace) => place.countryCode,
      projections.toPoint,
    );
    const recentId = this.places[0]?.id;
    const anchorCluster = pickAnchorCluster(clusters, {
      ...(recentId ? { recentItemId: recentId } : {}),
      toId: projections.toId,
    });
    const seed = anchorCluster?.members[0]?.id;
    const preferredAreaId =
      seed === undefined ? null : (areas.find((area) => area.memberIds.has(seed))?.id ?? null);

    const storedScope = this.scope ?? fallbackScope(areas, preferredAreaId);
    // The fallback is derived, never written back — see the `listScope` docblock in
    // `map-page-client.tsx` for why persisting it here is what produced the wrong header.
    return resolveScopeOrFallback(areas, countries, storedScope, preferredAreaId);
  }
}

function headingText(resolved: ResolvedScope<TestPlace>): string {
  return scopeHeading({
    scope: resolved,
    countInScope: resolved.count,
    searchQuery: '',
    tagLabel: null,
    matchesAnywhere: resolved.count,
  }).text;
}

describe('the scope after an import confirms', () => {
  it('names the area the import landed in, not the one it was standing in', () => {
    const page = new PageModel([HERZLIYA]);

    // Steady state before the import: one place, one area, the header agrees with it.
    expect(headingText(page.render())).toBe('1 place in הרצליה');

    // `onSaved` fires synchronously, before `router.refresh()` — so this render still holds the
    // pre-import library. This is the render that destroys the anchor.
    page.onSaved([KING_DAVID.id]);
    page.render();

    // The refreshed rows arrive, Jerusalem now exists as an area of the library — and the header
    // is still describing Herzliya, which contains none of what the user just did.
    page.refresh([KING_DAVID, HERZLIYA]);
    expect(headingText(page.render())).toBe('1 place in ירושלים');
  });
});
