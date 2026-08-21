/**
 * Mock saved places for the pre-L1 vertical slice (`docs/execution-plan.md`, the deviation note
 * after `L0-F4`). This slice proves MapLibre rendering and the add/save/display loop before any
 * real persistence exists: **no database, no service-role writes, no delete action** — those land
 * with `L1-F1`/`L1-F5`/`L1-F7` when this slice is absorbed into them.
 *
 * `MockSavedPlace` is deliberately not `SavedRecommendation`: that type is still to come
 * (`domain/README.md`), and it will carry a real `PlaceId`, `UserId` and `Source` provenance this
 * fixture has no business inventing ahead of the feature that needs them. This shape borrows what
 * already exists — `LatLng` and `ExtractedCategoryHint` — rather than adding a parallel `lat`/`lng`
 * or category vocabulary, and it lives in `places/` rather than `types.ts` because it is not part
 * of the shared vocabulary other layers depend on; it is scaffolding for one UI slice.
 */

import type { LatLng } from '../types';
import type { ExtractedCategoryHint } from './category-hint';

/** One pin's worth of data for the vertical slice's map. Shaped like the eventual
 *  `SavedRecommendation` will be as far as the map needs: a stable id, a name, a category to pick
 *  a marker glyph, a point, the social source it came from, and the user's own note. */
export interface MockSavedPlace {
  /** Fixture-local, not a `PlaceId` — there is no `places` row behind this yet. */
  readonly id: string;
  readonly name: string;
  readonly category: ExtractedCategoryHint;
  readonly location: LatLng;
  /** A fake TikTok video URL — shape-only, never fetched. */
  readonly sourceUrl: string;
  readonly note: string;
}

/**
 * ~10 places across three cities, so the map's initial camera and marker-clustering questions
 * have more than one city's worth of data to answer. Coordinates are approximate, real-world
 * points (city-centre landmarks and neighbourhoods), not randomised.
 */
export const mockSavedPlaces: readonly MockSavedPlace[] = [
  {
    id: 'mock-tlv-1',
    name: 'Anita Gelato',
    category: 'other',
    location: { lat: 32.0809, lng: 34.7806 },
    sourceUrl: 'https://www.tiktok.com/@foodie.tlv/video/7000000000000000001',
    note: 'Pistachio gelato from the video was unreal, go before 6pm or it sells out.',
  },
  {
    id: 'mock-tlv-2',
    name: 'HaBasta',
    category: 'restaurant',
    location: { lat: 32.0679, lng: 34.7683 },
    sourceUrl: 'https://www.tiktok.com/@tlv.eats/video/7000000000000000002',
    note: 'Seafood spot inside Carmel Market, the video said ask for the daily catch.',
  },
  {
    id: 'mock-tlv-3',
    name: 'Cafe Xoho',
    category: 'cafe',
    location: { lat: 32.0665, lng: 34.7749 },
    sourceUrl: 'https://www.tiktok.com/@coffee.israel/video/7000000000000000003',
    note: 'Neighbourhood cafe, quiet in the mornings.',
  },
  {
    id: 'mock-tlv-4',
    name: 'Micro Bar',
    category: 'bar',
    location: { lat: 32.0623, lng: 34.7686 },
    sourceUrl: 'https://www.tiktok.com/@nightlife.tlv/video/7000000000000000004',
    note: 'Tiny natural wine bar, the one from the reel with the orange lighting.',
  },
  {
    id: 'mock-lon-1',
    name: 'Borough Market',
    category: 'attraction',
    location: { lat: 51.5055, lng: -0.0908 },
    sourceUrl: 'https://www.tiktok.com/@london.food/video/7000000000000000005',
    note: 'The stall from the video is near the Stoney Street entrance.',
  },
  {
    id: 'mock-lon-2',
    name: 'Monmouth Coffee',
    category: 'cafe',
    location: { lat: 51.5115, lng: -0.0912 },
    sourceUrl: 'https://www.tiktok.com/@london.coffee/video/7000000000000000006',
    note: 'Queue moves fast, worth it for the filter coffee.',
  },
  {
    id: 'mock-lon-3',
    name: 'Lyle’s',
    category: 'restaurant',
    location: { lat: 51.5273, lng: -0.0755 },
    sourceUrl: 'https://www.tiktok.com/@london.eats/video/7000000000000000007',
    note: 'Tasting menu place from the review, book weeks ahead.',
  },
  {
    id: 'mock-lon-4',
    name: 'Daunt Books Marylebone',
    category: 'shop',
    location: { lat: 51.5194, lng: -0.1518 },
    sourceUrl: 'https://www.tiktok.com/@london.bookshops/video/7000000000000000008',
    note: 'The travel-books-by-country shelving from the video.',
  },
  {
    id: 'mock-nyc-1',
    name: "Levain Bakery",
    category: 'bakery',
    location: { lat: 40.7794, lng: -73.9799 },
    sourceUrl: 'https://www.tiktok.com/@nyc.desserts/video/7000000000000000009',
    note: 'The cookie from the viral video, chocolate chip walnut.',
  },
  {
    id: 'mock-nyc-2',
    name: 'The High Line',
    category: 'attraction',
    location: { lat: 40.748, lng: -74.0048 },
    sourceUrl: 'https://www.tiktok.com/@nyc.walks/video/7000000000000000010',
    note: 'Enter near Chelsea Market, walk north at golden hour like the clip.',
  },
] as const;
