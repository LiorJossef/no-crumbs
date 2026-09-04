/**
 * `getSpots` returns **every** TikTok link behind a saved place, not the first one (round 3 §5.1).
 *
 * The reported symptom was "saving the same place from two TikToks keeps only the latest". Nothing
 * is lost in the database: `saved_place_sources` is a many-to-many and `save_place` (`0034`)
 * inserts the second link with `on conflict do nothing`, so both rows persist and the read query
 * already selected both. The loss was in the mapping — `earliestSource()` took `linked[0]` and
 * dropped the rest — so the card showed the *earliest* source, the opposite of the report.
 *
 * These assertions therefore pin two things at once: that the list is complete, and that
 * `Spot.source` still means what every existing reader was written against.
 */
import { describe, expect, it, vi } from 'vitest';

// `get-spots.ts` opens with `import 'server-only'`, a module that throws unless it is resolved
// under React's server condition. Stubbing it is not weakening the guarantee: what `server-only`
// protects is the *bundler* boundary, and `npm run check:layers` is what enforces it. The same
// stub is in `confirm.test.ts`, `probe.test.ts` and `manual-add.test.ts`.
vi.mock('server-only', () => ({}));

interface Link {
  added_at: string;
  source: {
    id: string;
    platform: 'tiktok';
    canonical_url: string;
    author_handle: string | null;
    author_name: string | null;
    thumbnail_url: string | null;
  } | null;
}

let rows: unknown[] = [];

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  }),
}));

const { getSpots } = await import('@/app/map/_lib/get-spots');

function link(id: string, addedAt: string): Link {
  return {
    added_at: addedAt,
    source: {
      id,
      platform: 'tiktok',
      canonical_url: `https://www.tiktok.com/@creator/video/${id}`,
      author_handle: 'creator',
      author_name: null,
      thumbnail_url: null,
    },
  };
}

function row(links: Link[]) {
  return {
    id: 'saved-1',
    place_id: 'place-1',
    created_at: '2026-09-01T10:00:00Z',
    note: null,
    visit_state: 'want_to_go',
    visited_at: null,
    extracted_reason: null,
    display_name: null,
    category_override: null,
    source_url: null,
    source_thumbnail_url: null,
    tags: null,
    why_go: null,
    dishes: null,
    place: {
      name: 'Fugazi',
      category: null,
      provider_category: null,
      lat: 32.07,
      lng: 34.78,
      address_line: null,
      locality: 'Tel Aviv-Yafo',
      country_code: 'IL',
      source_dataset: null,
      resolution_score: null,
    },
    saved_place_sources: links,
  };
}

describe('a place saved from two TikTok links', () => {
  it('keeps both, earliest-linked first, whatever order the join returned', async () => {
    rows = [row([link('second', '2026-09-01T12:00:00Z'), link('first', '2026-09-01T09:00:00Z')])];

    const [spot] = await getSpots();

    expect(spot?.sources.map((source) => source.id)).toEqual(['first', 'second']);
    expect(spot?.sources.map((source) => source.canonicalUrl)).toEqual([
      'https://www.tiktok.com/@creator/video/first',
      'https://www.tiktok.com/@creator/video/second',
    ]);
  });

  it('leaves Spot.source meaning exactly what it always meant — the earliest', async () => {
    // Every existing reader (the detail card's `Open on TikTok`, `to-map-place.ts`) is written
    // against this field. Widening the read must not quietly change which post it names.
    rows = [row([link('second', '2026-09-01T12:00:00Z'), link('first', '2026-09-01T09:00:00Z')])];

    const [spot] = await getSpots();

    expect(spot?.source?.id).toBe('first');
    expect(spot?.source).toEqual(spot?.sources[0]);
  });
});

describe('a place with one source, and one with none', () => {
  it('gives a one-entry list', async () => {
    rows = [row([link('only', '2026-09-01T09:00:00Z')])];
    const [spot] = await getSpots();
    expect(spot?.sources).toHaveLength(1);
  });

  it('gives an empty list for a manual save, never an absent key', async () => {
    // `[]` is the honest answer. An absent key would make "no linked source" indistinguishable
    // from "this object came from somewhere that does not know about sources".
    rows = [row([])];
    const [spot] = await getSpots();
    expect(spot?.sources).toEqual([]);
    expect(spot?.source).toBeUndefined();
  });

  it('skips a link whose source row did not resolve rather than emitting a hole', async () => {
    rows = [row([{ added_at: '2026-09-01T09:00:00Z', source: null }, link('real', '2026-09-01T10:00:00Z')])];
    const [spot] = await getSpots();
    expect(spot?.sources.map((source) => source.id)).toEqual(['real']);
  });
});
