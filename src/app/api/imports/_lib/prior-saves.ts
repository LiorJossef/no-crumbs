/**
 * Reads what this user has already added from one source, for the review screen's "you've been
 * here before" notice (`domain/import/prior-saves.ts` carries the measurement and the reasoning).
 *
 * ## Why this is a route read and not a server action
 *
 * The fact is *about the source*, and the only thing that knows the `sources.id` is the request
 * that just fetched or cached the post. A server action would have to be handed a `sourceId` it
 * could not have obtained any other way, run as a second round trip after the probe answered, and
 * arrive **after** the review screen had already rendered and seeded its selection from the
 * candidates — which is the one moment this fact has to be in hand. So it rides the probe
 * response, alongside the candidates it is a statement about.
 *
 * ## Why the service-role client
 *
 * The probe route already holds one and every other write on that path goes through it. Doing this
 * read on the RLS client instead would mean embedding `saved_places` through `sps_owner_fk`, a
 * **composite** foreign key, and betting the screen on PostgREST's handling of it. The `user_id`
 * equality is written into every query here explicitly, which is the same guarantee RLS would have
 * given and is visible in the diff.
 *
 * ## Best-effort, always
 *
 * Every failure returns `[]`. A notice that cannot be read is not worth failing an import over —
 * the same contract as the extraction cache read on this route, and for the same reason: a helper
 * is never allowed to break the thing it helps.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PriorSave } from '@/domain/import/prior-saves';

export async function readPriorSaves(
  db: SupabaseClient,
  input: { readonly sourceId: string; readonly userId: string },
): Promise<readonly PriorSave[]> {
  try {
    return await read(db, input);
  } catch {
    // A *thrown* client failure, not just a returned `error`. Both end here, and neither is
    // allowed to be the reason an import that already has its places fails.
    return [];
  }
}

async function read(
  db: SupabaseClient,
  input: { readonly sourceId: string; readonly userId: string },
): Promise<readonly PriorSave[]> {
  const links = await db
    .from('saved_place_sources')
    .select('saved_place_id, added_at')
    .eq('source_id', input.sourceId)
    .eq('user_id', input.userId)
    .order('added_at', { ascending: true });

  if (links.error !== null || links.data === null || links.data.length === 0) return [];

  const ids = links.data.map((row) => row.saved_place_id as string);

  const saves = await db
    .from('saved_places')
    .select('id, display_name, places(name)')
    .eq('user_id', input.userId)
    .in('id', ids);

  if (saves.error !== null || saves.data === null) return [];

  // Keyed and then re-read in the link order, so the notice lists what was added first first. An
  // `in()` gives no ordering guarantee and the two queries would otherwise disagree about it.
  const byId = new Map<string, PriorSave>();
  for (const row of saves.data) {
    // `places(name)` embeds a to-one relation, but supabase-js types it as either; both shapes are
    // handled rather than asserted, because a wrong assertion here throws inside an import.
    const embedded = (row as { places?: unknown }).places;
    const place = Array.isArray(embedded) ? embedded[0] : embedded;
    const name = typeof (place as { name?: unknown } | undefined)?.name === 'string'
      ? ((place as { name: string }).name).trim()
      : '';
    if (name === '') continue;
    const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    byId.set(row.id as string, { placeName: name, label: displayName === '' ? name : displayName });
  }

  return ids.flatMap((id) => {
    const save = byId.get(id);
    return save === undefined ? [] : [save];
  });
}
