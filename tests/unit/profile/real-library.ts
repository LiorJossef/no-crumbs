/**
 * The real local library, as `/profile` sees it, read off the local database on 2026-08-30:
 *
 *   select sp.id, p.lat, p.lng, p.locality, p.country_code, p.category, p.provider_category,
 *          sp.category_override, sp.visit_state, s.author_handle
 *   from saved_places sp join places p on p.id = sp.place_id
 *   left join lateral (...earliest saved_place_sources → sources...) s on true
 *   where sp.user_id = <demo user> order by sp.created_at desc;
 *
 * 32 saved places, 18 around London and 14 around Tel Aviv, two of which the resolver never gave a
 * country code, one marked visited, seven creators. Kept beside the test rather than inside it
 * because two test files assert against the same library shape and a transcription that drifts
 * between them is worse than no fixture at all.
 *
 * **The property this fixture exists for:** those 14 Tel Aviv rows carry *five* spellings of one
 * city (`תל אביב-יפו`, `תל אביב - יפו`, `ת״א`, `Tel Aviv`, `Tel Aviv-Yafo`). Counting the string
 * would tell someone with places in two cities that they have six.
 */

import { productCategoryFor } from '@/domain/places/product-category';
import type { ProfilePlace } from '@/app/profile/_lib/profile-stats';

function row(
  n: number,
  lat: number,
  lng: number,
  locality: string | null,
  countryCode: string | null,
  category: string | null,
  providerCategory: string | null,
  visitState: ProfilePlace['visitState'],
  handle: string | null,
): ProfilePlace {
  return {
    id: `saved-${n}`,
    lat,
    lng,
    locality,
    countryCode,
    // Resolved exactly as `getProfilePlaces` resolves it, so the fixture cannot encode a category
    // ranking the query does not actually produce.
    category: productCategoryFor({
      override: null,
      providerCategory,
      extractedHint: category,
    }),
    visitState,
    creator: handle === null ? null : { handle, name: null },
  };
}

export const REAL_LIBRARY: readonly ProfilePlace[] = [
  row(1, 32.08829, 34.77330, 'תל אביב-יפו', 'IL', 'cafe', 'coffee_shop', 'want_to_go', 'paz_farchi1'),
  row(2, 51.42760, -0.16520, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(3, 51.51470, -0.12190, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(4, 51.46820, -0.06910, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(5, 51.51410, -0.12350, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(6, 51.51130, -0.08580, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(7, 51.46160, -0.11470, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(8, 32.07803, 34.77785, 'תל אביב-יפו', 'IL', null, 'ice_cream_shop', 'want_to_go', 'thefoodnett'),
  row(9, 32.06450, 34.77350, 'ת״א', 'IL', 'restaurant', null, 'want_to_go', 'nadavbornstein'),
  row(10, 32.08828, 34.77330, 'תל אביב - יפו', 'IL', 'cafe', 'coffee_shop', 'want_to_go', 'paz_farchi1'),
  row(11, 32.07250, 34.78200, 'תל אביב - יפו', null, 'restaurant', 'mediterranean_restaurant', 'want_to_go', 'shirazooooo'),
  row(12, 32.07642, 34.77674, 'תל אביב - יפו', 'IL', 'restaurant', 'middle_eastern_restaurant', 'want_to_go', 'joelleuzyel'),
  row(13, 32.07360, 34.78160, 'Tel Aviv', 'IL', 'restaurant', null, 'want_to_go', 'joelleuzyel'),
  row(14, 51.51800, -0.15800, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(15, 51.46180, -0.11320, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(16, 51.42770, -0.17040, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(17, 51.51520, -0.12190, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(18, 51.49380, -0.14720, 'London', 'GB', 'restaurant', null, 'visited', 'exploringlondon'),
  row(19, 51.42780, -0.17060, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(20, 51.51730, -0.15850, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(21, 51.51540, -0.12210, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(22, 51.46970, -0.06820, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(23, 51.51420, -0.11860, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(24, 51.51110, -0.08640, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(25, 51.46190, -0.11450, 'London', 'GB', 'restaurant', null, 'want_to_go', 'exploringlondon'),
  row(26, 32.07220, 34.77580, 'Tel Aviv', null, 'restaurant', null, 'want_to_go', 'joelleuzyel'),
  row(27, 32.08700, 34.77490, 'Tel Aviv-Yafo', 'IL', 'cafe', 'cafe', 'want_to_go', 'tlv.eats'),
  row(28, 32.05870, 34.76250, 'Tel Aviv-Yafo', 'IL', 'cafe', 'cafe', 'want_to_go', 'tlv.eats'),
  row(29, 32.05240, 34.74980, 'Tel Aviv-Yafo', 'IL', 'bar', 'bar', 'want_to_go', 'tlv.eats'),
  row(30, 32.05540, 34.76860, 'Tel Aviv-Yafo', 'IL', 'cafe', 'cafe', 'want_to_go', 'tlv.eats'),
  row(31, 32.05960, 34.76540, 'Tel Aviv-Yafo', 'IL', 'cafe', 'bakery', 'want_to_go', 'tlv.eats'),
  row(32, 32.06680, 34.77490, 'Tel Aviv-Yafo', 'IL', 'cafe', 'cafe', 'want_to_go', 'tlv.eats'),
];
