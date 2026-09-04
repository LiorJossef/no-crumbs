/**
 * `POST /api/imports/confirm` — the confirmation stamp, and the four ways it could become a lie.
 *
 * Task `r3-tags-ui`, finding 2 of `docs/product-review-2026-08-31-r3.md`. Migration `0036` split
 * `saved_places.tags` into a proposal (`tags_extracted`), a vocabulary (`tags`) and a record of
 * consent (`tags_confirmed_at`), and shipped with **no caller anywhere** — which the r3 review
 * calls a worse state than an unapplied migration, because the ledger then says it is done. This
 * route is the caller.
 *
 * **What is actually being asserted here is an ordering, not a value.** `tags_confirmed_at` means
 * "the user asserted these words". A stamp is therefore only true if the words were on screen
 * before the user pressed Save, and were the same words that reached the column. Two facts carry
 * that, and both are pinned below:
 *
 *  1. The stamp is the **last** RPC of the item, after `save_place` and after
 *     `apply_saved_place_extraction` — so it can never claim a confirmation of an array that the
 *     enrichment write had not yet put in the column.
 *  2. The array it stamps is `deriveSavedPlaceEnrichment(candidate).tags` — literally the call the
 *     review card renders from (`review/candidate-card.tsx`). Asserted against that function here
 *     rather than against a literal, so a second reading of `candidate.tags` on either side cannot
 *     drift without this going red.
 *
 * And the three refusals, each of which is a stamp that would be false:
 *
 *  - a place the user **already had** — the row keeps its own tags, the card showed this post's;
 *  - an enrichment write that **failed** — the column is empty, and a stamp on it would read as a
 *    deliberate deletion and bar every later import from ever tagging that place (`0036` §3b);
 *  - a caption that supported **no tags** — nothing was declined, so nothing is confirmed.
 *
 * The mock shape is `confirm.test.ts`'s, extended with a second recorder so *which client* made
 * each call is observable. That is not bookkeeping: `set_saved_place_tags` is `SECURITY DEFINER`
 * and bounded by `auth.uid()`, so calling it on the service-role client would raise `28000` in
 * production and the assertion below is what stops that being discovered there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { deriveSavedPlaceEnrichment } from '@/domain/import/saved-place-enrichment';
import { ConfirmImportRequestSchema } from '@/domain/import/confirm';
import type { PlaceCandidate } from '@/domain/types';

/** See `confirm.test.ts` for why neutralising this is safe: the bundler boundary it protects is
 *  enforced by `npm run check:layers`, not at runtime. */
vi.mock('server-only', () => ({}));

const USER_ID = 'user-under-test';
const EXTRACTION_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PLACE_ID = 'saved-place-1';

const V1_CANDIDATE = {
  rawName: 'Kohi',
  cityHint: 'Tel Aviv',
  countryHint: 'Israel',
  categoryHint: 'cafe',
  addressHint: null,
  evidence: 'Kohi',
  modelConfidence: 0.9,
  identifiedName: 'Kohi',
  nameVariants: [],
  coordinates: { lat: 32.0853, lng: 34.7818 },
};

/** The real shape a p16-s5 extraction stores, and the real tags the local database holds for this
 *  post — read off `extractions.candidates` rather than invented, so the array under test is one
 *  the pipeline actually produces. */
const V2_CANDIDATE = {
  ...V1_CANDIDATE,
  areaHint: null,
  tags: ['japanese', 'specialty coffee'],
  dishes: [],
  whyGo: null,
};

/** A v2 candidate the caption supported no tags for — the frequent, non-failure case. */
const V2_UNTAGGED = { ...V2_CANDIDATE, tags: [] };

interface RpcCall {
  readonly client: 'user' | 'service';
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

let rpcCalls: RpcCall[] = [];
let storedCandidates: unknown[] = [];
let alreadySaved = false;
let enrichmentError: { code: string } | null = null;
/** What `set_saved_place_tags` answers. `null` = success. */
let stampError: { code: string } | null = null;
/** When true the stamp RPC throws rather than answering — a transport failure, not a SQL one. */
let stampThrows = false;

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from: (table: string) => {
      if (table === 'imports') {
        const chain = {
          eq: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: { id: 'imp-1' }, error: null }),
        };
        return { select: () => chain };
      }
      if (table === 'saved_places') {
        // `place-store.ts` asks this before saving, because `save_place` is idempotent and cannot
        // distinguish a first save from a repeat afterwards. It is what `alreadySaved` comes from.
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({
            data: alreadySaved ? { id: SAVED_PLACE_ID } : null,
            error: null,
          }),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ client: 'user', fn, args });
      if (fn === 'save_place') return { data: SAVED_PLACE_ID, error: null };
      if (fn === 'set_saved_place_tags') {
        if (stampThrows) throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
        return { data: null, error: stampError };
      }
      throw new Error(`unexpected user-client rpc ${fn}`);
    },
  }),
}));

vi.mock('@/integrations/supabase/service-role-client', () => ({
  serviceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'extractions') {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({
            data: { id: EXTRACTION_ID, source_id: 'src-1', candidates: storedCandidates, status: 'ok' },
            error: null,
          }),
        };
        return { select: () => chain };
      }
      if (table === 'imports') {
        return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ client: 'service', fn, args });
      if (fn === 'resolve_place') return { data: 'place-1', error: null };
      if (fn === 'apply_saved_place_extraction') return { data: null, error: enrichmentError };
      throw new Error(`unexpected service-client rpc ${fn}`);
    },
  }),
}));

interface ConfirmResultBody {
  readonly results: readonly {
    readonly status: string;
    readonly enrichment?: string;
    readonly tagsConfirmed?: boolean;
  }[];
}

async function postConfirm(body?: Record<string, unknown>): Promise<ConfirmResultBody> {
  const req = new NextRequest('http://localhost/api/imports/confirm', {
    method: 'POST',
    body: JSON.stringify(
      body ?? { extractionId: EXTRACTION_ID, items: [{ candidateIndex: 0, note: null }] },
    ),
    headers: { 'Content-Type': 'application/json' },
  });
  const { POST } = await import('@/app/api/imports/confirm/route');
  return (await (await POST(req)).json()) as ConfirmResultBody;
}

const stamp = (): RpcCall | undefined => rpcCalls.find((c) => c.fn === 'set_saved_place_tags');

beforeEach(() => {
  rpcCalls = [];
  storedCandidates = [];
  alreadySaved = false;
  enrichmentError = null;
  stampError = null;
  stampThrows = false;
  vi.restoreAllMocks();
});

describe('confirm — the tags the user saw are the tags that get confirmed', () => {
  it('stamps last, after the words are in the column', async () => {
    storedCandidates = [V2_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.tagsConfirmed).toBe(true);
    // The whole assertion of this file. `set_saved_place_tags` records "the user asserted this
    // vocabulary"; it may only run once the vocabulary is actually there, which is after
    // `apply_saved_place_extraction`. Reordered, the stamp would be a claim about an empty column.
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'resolve_place',
      'save_place',
      'apply_saved_place_extraction',
      'set_saved_place_tags',
    ]);
  });

  it('confirms exactly the array the review card renders', async () => {
    storedCandidates = [V2_CANDIDATE];

    await postConfirm();

    // Not a literal. `candidate-card.tsx` renders `deriveSavedPlaceEnrichment(candidate)?.tags`,
    // and "the user saw these words" is only true while these two are the same call. A literal
    // here would stay green through a change that made the card show something else.
    const rendered = deriveSavedPlaceEnrichment(V2_CANDIDATE as unknown as PlaceCandidate)?.tags;
    expect(stamp()?.args.p_tags).toEqual(rendered);
    expect(stamp()?.args.p_saved_place_id).toBe(SAVED_PLACE_ID);
  });

  it('calls the stamp on the user’s client, never the service-role one', async () => {
    // `set_saved_place_tags` is `SECURITY DEFINER` with `where sp.user_id = (select auth.uid())`.
    // On a service-role client `auth.uid()` is NULL and the function raises `28000` — so this is
    // not style, it is the difference between the stamp working and the stamp never working. It is
    // also the reason the route does not simply UPDATE the two columns: `0036`'s ruling 4 made the
    // words and the record of who chose them one statement, and a server that writes them apart
    // re-creates the separability the migration removed.
    storedCandidates = [V2_CANDIDATE];

    await postConfirm();

    expect(stamp()?.client).toBe('user');
  });

  it('cannot be steered by the request — the confirmed array comes from the stored extraction', async () => {
    // The request contract is a reference plus the user's note (`domain/import/confirm.ts`). A body
    // that names tags is stripped by the schema before the route sees it, and the stamped value is
    // still the server's own. If a `tags` field is ever added to `ConfirmItemSchema`, this is what
    // says so out loud.
    storedCandidates = [V2_CANDIDATE];

    const hostile = {
      extractionId: EXTRACTION_ID,
      items: [{ candidateIndex: 0, note: null, tags: ['michelin star', 'free wifi'] }],
    };
    expect(ConfirmImportRequestSchema.parse(hostile).items[0]).not.toHaveProperty('tags');

    await postConfirm(hostile);

    expect(stamp()?.args.p_tags).toEqual(['japanese', 'specialty coffee']);
  });
});

describe('confirm — the three refusals', () => {
  it('does not stamp a place the user already had', async () => {
    // The row keeps its own tags (`apply_saved_place_extraction` is first-writer-wins) while the
    // card showed *this* post's, so the two can differ and the stamp would confirm words that are
    // not in the column. Writing them anyway would also overwrite an existing vocabulary with model
    // output through the user's own client — the one thing `0036` §5 stops the extractor doing.
    storedCandidates = [V2_CANDIDATE];
    alreadySaved = true;

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('already_saved');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
    expect(stamp()).toBeUndefined();
  });

  it('does not stamp when the enrichment write failed', async () => {
    // The place is saved and has no tags. A stamp here would read as "the user deleted every tag",
    // which `0036` §3(b) treats as an assertion no later import may undo — so a transient failure
    // would permanently bar that place from ever being tagged.
    storedCandidates = [V2_CANDIDATE];
    enrichmentError = { code: '23514' };

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.enrichment).toBe('failed');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
    expect(stamp()).toBeUndefined();
  });

  it('does not stamp a candidate the caption supported no tags for', async () => {
    // Nothing was shown and nothing was declined, so there is nothing to confirm — and a later post
    // about the same venue must still be allowed to tag it. "Confirmed empty" is an assertion, and
    // only a deliberate deletion may make it.
    storedCandidates = [V2_UNTAGGED];

    const body = await postConfirm();

    expect(body.results[0]?.enrichment).toBe('empty');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
    expect(stamp()).toBeUndefined();
  });

  it('does not stamp a v1 extraction, which has no tags to have shown', async () => {
    storedCandidates = [V1_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.enrichment).toBe('unavailable_v1');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
    expect(stamp()).toBeUndefined();
  });
});

describe('confirm — a failed stamp never retracts a save', () => {
  it('reports the place as saved when the stamp errors', async () => {
    storedCandidates = [V2_CANDIDATE];
    stampError = { code: '42501' };

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
  });

  it('reports the place as saved when the stamp throws', async () => {
    // `confirmOne`'s own `try` turns anything thrown into `status: 'failed'`, and by this point the
    // place is already in the library — so the user would be told a save did not happen that did.
    // `confirmTags` catches its own transport failures for exactly this reason.
    storedCandidates = [V2_CANDIDATE];
    stampThrows = true;

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.tagsConfirmed).toBe(false);
  });
});
