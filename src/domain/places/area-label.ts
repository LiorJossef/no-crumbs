/**
 * One area, one name — the spelling every place in a metropolitan cluster is displayed under.
 *
 * ## The defect this exists for
 *
 * Measured in the local library on 2026-08-28, `places.locality` held **six renderings of one
 * city** across twelve rows: `Tel Aviv-Yafo` (6), `תל אביב - יפו` (3), `Tel Aviv` (2),
 * `תל אביב-יפו` (1) and `ת״א` (1). Rendered straight into the list, that reads as five different
 * cities. It is the same defect the product category had before `product-category.ts`: a raw
 * upstream string shipped to a user as if it were ours. The strings come from three different
 * places — an Overture row, a Google `locality` component, and the model's own guess when nothing
 * resolved — and none of them was ever going to agree with the others.
 *
 * ## Why this is a display rule and not a write-time normalisation
 *
 * `places.locality` keeps whatever the provider said, untouched. Overwriting it would destroy
 * provenance to fix a presentation problem, and the working agreement is explicit that source and
 * provenance survive. So this is derived on read, once, exactly as `productCategoryFor` is.
 *
 * ## Why it needs no gazetteer, and asserts nothing new
 *
 * `clusterByProximity` already groups saved places into metropolitan areas at a 50 km single-link
 * radius, and `clusterLabel` already picks the most common spelling inside one — that pair is what
 * names the sheet header (`12 places in Tel Aviv-Yafo`). All this does is give every *row* in an
 * area the name the header already agreed on, so the two can no longer disagree in one screen.
 *
 * The claim is therefore weak on purpose: not "this venue is in Tel Aviv-Yafo" — which would need a
 * boundary dataset we do not have — but "this venue is in the same area as these others, and this
 * is what that area is called here". Two guards keep it that weak:
 *
 *  - A place with **no** locality of its own is left with none. Its cluster's name is very probably
 *    right, but "probably right" written into a field the user reads as fact is exactly the
 *    confidently-wrong answer this project refuses. An absent city reads as absent; a wrong one does
 *    not read as anything.
 *  - When a cluster's spellings **tie**, `clusterLabel` returns `null` and every member keeps its
 *    own. A coin-flip between two names is not an agreement.
 *
 * ## The one thing it does not fix
 *
 * `ת״א` and `Tel Aviv-Yafo` are the same city in two scripts, and which one a Hebrew-reading user
 * should see is a language question, not a plurality question. Plurality picks whichever the
 * library happens to hold more of. That is better than five names and worse than the right one;
 * `clusters.ts`'s `normaliseLocality` is where a script-aware rule would land when there is
 * evidence for one.
 */

import { clusterByProximity, clusterLabel, type ClusterOptions, type GeoPoint } from './clusters';

/** The minimum a place has to expose to be given an area name. Structural, so this module stays
 *  ignorant of `Spot`, `MapPlace` and every other shape a caller might hold. */
export interface Locatable {
  readonly lat: number;
  readonly lng: number;
  readonly locality?: string | undefined;
}

const toPoint = (item: Locatable): GeoPoint => ({ lat: item.lat, lng: item.lng });

/**
 * The same items, with `locality` replaced by their area's agreed spelling wherever one exists.
 *
 * Returns a new array in the input order — order is load-bearing for the list (`created_at desc`)
 * and this must not disturb it. Items whose coordinate is unusable are passed through untouched:
 * `clusterByProximity` drops them rather than inventing a cluster at Null Island, so they have no
 * area to take a name from.
 */
export function withCanonicalAreaLabels<T extends Locatable>(
  items: readonly T[],
  options: ClusterOptions = {},
): readonly T[] {
  const clusters = clusterByProximity(items, toPoint, options);

  // Identity, not id: this module has no id projection and does not need one. A member is the very
  // object the caller passed in, because `clusterByProximity` carries items through by reference.
  const label = new Map<T, string>();
  for (const cluster of clusters) {
    const agreed = clusterLabel(cluster, (item) => item.locality ?? null);
    if (agreed === null) continue;
    for (const member of cluster.members) label.set(member, agreed);
  }

  return items.map((item) => {
    const agreed = label.get(item);
    // Only a place that already claims a locality gets it rewritten — see the header.
    if (agreed === undefined || item.locality === undefined || item.locality.trim() === '') {
      return item;
    }
    return agreed === item.locality ? item : { ...item, locality: agreed };
  });
}
