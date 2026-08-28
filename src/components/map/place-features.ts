/**
 * Saved places as GeoJSON, for the clustered map source.
 *
 * Pure and separate from the layer so the one property the renderer cannot recover from — a
 * category with no pin drawn for it — is testable without a WebGL context.
 */

import type { ProductCategory } from '@/domain/places/product-category';
import { DEFAULT_CATEGORY, isKnownCategory } from '@/ui/place/category-display';
import type { MapPlace } from './types';

export interface PlaceFeatureProperties {
  readonly id: string;
  readonly name: string;
  /** Always a category the palette has a pin for; see `normaliseCategory`. */
  readonly category: ProductCategory;
}

export type PlaceFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PlaceFeatureProperties
>;

/**
 * `MapPlace.category` is typed as a known hint, but it arrives from a database column that any
 * past or future extraction schema can write. An unknown value would build an `icon-image` id that
 * was never registered, and MapLibre drops the whole symbol rather than falling back — a place
 * that silently disappears from the map. Anything unrecognised becomes the house pin instead.
 */
export function normaliseCategory(category: string | null | undefined): ProductCategory {
  return isKnownCategory(category) ? category : DEFAULT_CATEGORY;
}

export function toPlaceFeatures(places: readonly MapPlace[]): PlaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        category: normaliseCategory(place.category),
      },
    })),
  };
}
