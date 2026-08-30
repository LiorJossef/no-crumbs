import { notFound, redirect } from "next/navigation";

import { createClient } from "@/app/_lib/supabase/server";
import { getSpots } from "@/app/map/_lib/get-spots";
import type { MapPlace } from "@/components/map/map-surface";
import type { Spot } from "@/domain/places/spot";
import {
  getCollection,
  getCollectionMemberships,
} from "../_lib/get-collections";
import { CollectionClient } from "./collection-client";

/** The same `Spot` → `MapPlace` mapping `/map` does, for the picker's rows. Duplicated rather than
 *  exported from `map/page.tsx`, which is a route module, not a library. */
function toMapPlace(spot: Spot): MapPlace {
  return {
    id: spot.id,
    name: spot.name,
    category: spot.category,
    lat: spot.lat,
    lng: spot.lng,
    note: spot.note ?? "",
    sourceUrl: spot.sourceUrl ?? spot.source?.canonicalUrl,
    visited: spot.visitState === "visited",
    detail: spot,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const collection = await getCollection(id);
  // `getCollection` returns null both for a collection that does not exist and for one the caller
  // is not a member of. Rendering the same 404 for both is deliberate: telling them apart would
  // make this route an existence oracle for other people's collections.
  if (!collection) notFound();

  // Read alongside the library for the same reason `/map` does (see its own note): the
  // "Add to a collection" row has to say which collections a place is already in *before* it is
  // tapped, so the answer must be in hand when the detail renders. Without it the row renders
  // nothing at all, and a place opened here would be missing a control it has on the map —
  // which `product-ruling-one-place-one-object.md` R1 forbids.
  const [library, collections] = await Promise.all([
    getSpots().then((spots) => spots.map(toMapPlace)),
    getCollectionMemberships(),
  ]);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CollectionClient
        collection={collection}
        library={library}
        collections={collections}
        currentUserId={user.id}
      />
    </main>
  );
}
