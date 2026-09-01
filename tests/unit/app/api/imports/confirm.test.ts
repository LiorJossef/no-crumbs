/**
 * `POST /api/imports/confirm` — the enrichment wiring (RICH-EXT-T3) and the v1 compatibility it
 * has to keep.
 *
 * The **real** `supabasePlaceStore` is used here, with only the two Supabase clients faked, because
 * the things worth pinning all live in the adapter: which RPC gets which argument, in what order,
 * and what happens when the last one fails. Mocking the store would leave exactly the security
 * property this task is responsible for — that `p_user_id` and `p_saved_place_id` are both
 * server-derived — asserted by nothing.
 *
 * What this cannot cover, and the owner's manual pass does: the database actually accepting the
 * write. `0019`'s trigger, its CHECK bounds and `apply_saved_place_extraction`'s ownership clause
 * are all Postgres behaviour, and a fake `rpc` will happily "succeed" at a call the real function
 * would refuse.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * `place-store.ts` opens with `import 'server-only'`, which is a module that throws unless it is
 * resolved under React's `react-server` condition. Vitest resolves the browser/node entry, so the
 * real adapter cannot be imported into a test without this. Neutralising it is safe *here*
 * specifically: what `server-only` protects is the bundler boundary (this module must never reach a
 * client bundle), and `npm run check:layers` is what actually enforces that — it is not a runtime
 * behaviour this test could be papering over.
 */
vi.mock('server-only', () => ({}));

const USER_ID = 'user-under-test';
const EXTRACTION_ID = '11111111-2222-4333-8444-555555555555';

/** Genuinely v1-shaped: the four v2 keys are absent, not empty. */
const V1_CANDIDATE = {
  rawName: 'Ha Kosem',
  cityHint: 'Tel Aviv',
  countryHint: 'Israel',
  categoryHint: 'restaurant',
  addressHint: null,
  evidence: 'Ha Kosem',
  modelConfidence: 0.9,
  identifiedName: 'HaKosem',
  nameVariants: [],
  coordinates: { lat: 32.0708, lng: 34.7726 },
};

const V2_CANDIDATE = {
  ...V1_CANDIDATE,
  areaHint: 'Market Row',
  tags: ['falafel', 'street food'],
  dishes: ['the sabich'],
  whyGo: { text: 'A legendary falafel counter locals queue for.', groundedIn: 'Ha Kosem' },
};

/** A v2 candidate whose caption supported no enrichment at all — the `empty` outcome. */
const V2_BARE_CANDIDATE = { ...V1_CANDIDATE, areaHint: null, tags: [], dishes: [], whyGo: null };

/** Every RPC the route makes, in order, with its arguments. */
let rpcCalls: { readonly fn: string; readonly args: Record<string, unknown> }[] = [];
/** What `apply_saved_place_extraction` answers. `null` = success. */
let enrichmentError: { code: string } | null = null;
/** When true the enrichment RPC throws instead of answering — a transport failure, not a SQL one. */
let enrichmentThrows = false;
let storedCandidates: unknown[] = [];

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from: (table: string) => {
      if (table === 'imports') {
        // Ownership: RLS would filter this in production; the fake grants it.
        const chain = {
          eq: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: { id: 'imp-1' }, error: null }),
        };
        return { select: () => chain };
      }
      if (table === 'saved_places') {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'save_place') return { data: 'saved-place-1', error: null };
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
      rpcCalls.push({ fn, args });
      if (fn === 'resolve_place') return { data: 'place-1', error: null };
      if (fn === 'apply_saved_place_extraction') {
        if (enrichmentThrows) throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
        return { data: null, error: enrichmentError };
      }
      throw new Error(`unexpected service-client rpc ${fn}`);
    },
  }),
}));

interface ConfirmResultBody {
  readonly results: readonly {
    readonly status: string;
    readonly candidateIndex: number;
    readonly savedPlaceId?: string;
    readonly enrichment?: string;
    readonly provider?: string;
    readonly resolutionScore?: number | null;
    readonly reason?: string;
  }[];
}

async function postConfirm(item: Record<string, unknown> = {}): Promise<ConfirmResultBody> {
  const req = new NextRequest('http://localhost/api/imports/confirm', {
    method: 'POST',
    body: JSON.stringify({
      extractionId: EXTRACTION_ID,
      items: [{ candidateIndex: 0, note: null, ...item }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const { POST } = await import('@/app/api/imports/confirm/route');
  const res = await POST(req);
  return (await res.json()) as ConfirmResultBody;
}

function callTo(fn: string): Record<string, unknown> | undefined {
  return rpcCalls.find((c) => c.fn === fn)?.args;
}

beforeEach(() => {
  rpcCalls = [];
  enrichmentError = null;
  enrichmentThrows = false;
  storedCandidates = [];
  vi.restoreAllMocks();
});

describe('confirm — schema v2 enrichment', () => {
  it('writes tags, why_go and dishes from the stored extraction, and reports applied', async () => {
    storedCandidates = [V2_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.enrichment).toBe('applied');
    expect(callTo('apply_saved_place_extraction')).toMatchObject({
      p_tags: ['falafel', 'street food'],
      p_dishes: ['the sabich'],
      p_why_go: 'A legendary falafel counter locals queue for.',
    });
  });

  it('sends the session user id and save_place’s own returned id — never anything client-supplied', async () => {
    // The security property `apply_saved_place_extraction` defers entirely to this caller. It runs
    // as `service_role`, so it bypasses RLS and no policy filters the row `p_saved_place_id` names;
    // its `where sp.user_id = p_user_id` is only as good as these two arguments. `p_user_id` must
    // be the verified server-side session, and `p_saved_place_id` must be `save_place`'s return
    // value from this same request.
    storedCandidates = [V2_CANDIDATE];

    await postConfirm();

    expect(callTo('apply_saved_place_extraction')).toMatchObject({
      p_user_id: USER_ID,
      p_saved_place_id: 'saved-place-1',
    });
    // And the order that makes the second of those possible at all.
    //
    // `set_saved_place_tags` joined this list on 2026-09-01 (task `r3-tags-ui`): migration `0036`
    // added `saved_places.tags_confirmed_at`, and this route stamps it once the review card has
    // shown the user the tags the save is about to write. It is deliberately **last** — it records
    // that the user asserted a vocabulary, so it may only run after the vocabulary is in the
    // column. The stamp's own conditions, refusals and failure behaviour are
    // `confirm-tag-confirmation.test.ts`'s; this line exists so a change to the *order* cannot pass
    // unnoticed here.
    //
    // It is a call on the *user's* client, which this file's fake does not answer — so it throws,
    // `confirmTags` swallows it, and the save is still reported as a save. That is the behaviour
    // asserted deliberately in the other file, and it is why nothing else here moved.
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'resolve_place',
      'save_place',
      'apply_saved_place_extraction',
      'set_saved_place_tags',
    ]);
  });

  it('does not send whyGo.groundedIn to the database at all', async () => {
    // Reversed ruling, 2026-08-27: `groundedIn` is a gate at extraction time, not a stored column.
    // `extracted_reason` keeps its existing `evidence` semantics and its existing writer.
    storedCandidates = [V2_CANDIDATE];

    await postConfirm();

    expect(JSON.stringify(rpcCalls)).not.toContain('groundedIn');
    expect(callTo('save_place')?.p_extracted_reason).toBe('Ha Kosem');
  });

  it('reports empty — not applied — when the caption supported no enrichment', async () => {
    storedCandidates = [V2_BARE_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.enrichment).toBe('empty');
    // Three nulls would be a no-op UPDATE; not calling at all is the same result for less.
    expect(callTo('apply_saved_place_extraction')).toBeUndefined();
  });
});

describe('confirm — a pre-v2 extraction row', () => {
  it('still saves the place, and says the enrichment was unavailable rather than empty', async () => {
    // Four such rows exist on the local database (`prompt_version = 'p6'`), and a browser tab can
    // still be holding one of their ids. Before this, a v1 row failed `RawPlaceCandidateSchema` and
    // took the entire request down with a 500.
    storedCandidates = [V1_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.enrichment).toBe('unavailable_v1');
    expect(callTo('apply_saved_place_extraction')).toBeUndefined();
  });

  it('leaves the v1 place save byte-identical to what it was before v2', async () => {
    storedCandidates = [V1_CANDIDATE];

    await postConfirm();

    expect(callTo('resolve_place')).toMatchObject({ p_name: 'HaKosem', p_lat: 32.0708, p_lng: 34.7726 });
    expect(callTo('save_place')?.p_extracted_reason).toBe('Ha Kosem');
  });
});

describe('confirm — the enrichment write is never allowed to lose the save', () => {
  it('reports failed enrichment on a check_violation, and still reports the place as saved', async () => {
    // `23514` is the failure that will actually happen: the app bounds the raw model string, the
    // database bounds the NFKC-normalised one, and NFKC expands. A 59-character dish normalises to
    // 67 against a 64 bound. The place is in the user's library either way, and telling them the
    // save failed would be a lie they would act on.
    storedCandidates = [V2_CANDIDATE];
    enrichmentError = { code: '23514' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.savedPlaceId).toBe('saved-place-1');
    expect(body.results[0]?.enrichment).toBe('failed');
    // Swallowed is not silent: one structured line, carrying the SQLSTATE and nothing else.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"code":"23514"'));
  });

  it('logs no row values, tag text or caption text when the write fails', async () => {
    storedCandidates = [V2_CANDIDATE];
    enrichmentError = { code: '42501', ...{ details: 'row: Ha Kosem, falafel', hint: 'grant it' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await postConfirm();

    const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('42501');
    expect(line).not.toContain('falafel');
    expect(line).not.toContain('Ha Kosem');
  });

  it('survives a transport-level throw from the enrichment RPC', async () => {
    // `supabase-js` returns SQL errors on the `error` channel and throws only when the request
    // itself could not be made. An unhandled throw here would escape `confirmPlace`, be caught by
    // `confirmOne` as a generic failure, and report a saved place as failed.
    storedCandidates = [V2_CANDIDATE];
    enrichmentThrows = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.enrichment).toBe('failed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNRESET'));
  });
});

/**
 * TLV-RESOLVE-T3 — where the coordinate comes from.
 *
 * The measured gap this covers: for the caption mention "HaKosem" the Overture row is 11 m from the
 * real venue, while the model's own guess for the same caption was 555 m and 483 m out on two runs
 * and 541 m from itself. These tests pin which of the two ends up in `resolve_place`, and — the part
 * that is a security property rather than an accuracy one — that the deciding facts came off the
 * stored row and never off the request.
 */
describe('confirm — resolved vs guessed provenance', () => {
  function overtureResolution(band: 'preselect' | 'confirm', extra: readonly string[] = []) {
    const entry = (name: string, lat: number, lng: number, score: number) => ({
      place: {
        provider: 'overture',
        providerPlaceId: `gers-${name}`,
        sourceDataset: 'overture-places',
        regionId: 'tlv',
        name,
        altNames: [],
        providerCategory: 'falafel_shop',
        addressLine: '1 HaKosem Street',
        locality: 'Tel Aviv',
        lat,
        lng,
        datasetConfidence: 0.87,
      },
      score,
      nameScore: 0.95,
      tokenCoverage: 1,
      categoryScore: 1,
    });
    return {
      kind: 'answered',
      result: {
        shortlist: [
          entry('HaKosem Falafel', 32.07515, 34.77291, 0.93),
          ...extra.map((n, i) => entry(n, 32.06 + i / 1000, 34.76 + i / 1000, 0.9)),
        ],
        confidence: { band, score: 0.93, margin: band === 'preselect' ? 0.4 : 0.01 },
        regionsSearched: ['tlv'],
        candidatesPrefiltered: 21,
      },
    };
  }

  it('writes the Overture row’s own facts and a real resolution score for a preselect band', async () => {
    storedCandidates = [{ ...V2_CANDIDATE, resolution: overtureResolution('preselect') }];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(body.results[0]?.provider).toBe('overture');
    expect(callTo('resolve_place')).toMatchObject({
      p_provider: 'overture',
      p_source_dataset: 'overture-places',
      p_provider_place_id: 'gers-HaKosem Falafel',
      p_source_dataset_id: 'gers-HaKosem Falafel',
      p_name: 'HaKosem Falafel',
      p_lat: 32.07515,
      p_lng: 34.77291,
      p_provider_category: 'falafel_shop',
      p_address_line: '1 HaKosem Street',
      p_locality: 'Tel Aviv',
      // The real scorer output, not `modelConfidence` and not an invented default. This field was
      // deliberately null until a real `PlaceResolver` existed; it does now.
      p_resolution_score: 0.93,
    });
    // Our own taxonomy still comes from the extraction, never from Overture's category string.
    expect(callTo('resolve_place')?.p_category).toBe('restaurant');
    // Not the model's guess, which is 32.0708/34.7726 in this fixture and ~500 m away.
    expect(callTo('resolve_place')?.p_lat).not.toBe(32.0708);
  });

  it('does not auto-accept a confirm-band shortlist', async () => {
    // The band exists because the scorer cannot separate the entries. Taking the top one silently
    // is the uncertainty-into-certainty move this product cannot afford — so the save falls back to
    // the model's own point, honestly marked.
    storedCandidates = [{ ...V2_CANDIDATE, resolution: overtureResolution('confirm', ['HaKosem Jaffa']) }];

    const body = await postConfirm();

    expect(body.results[0]?.provider).toBe('llm_guess');
    expect(callTo('resolve_place')).toMatchObject({
      p_provider: 'llm_guess',
      p_source_dataset: 'llm-guess',
      p_lat: 32.0708,
      p_resolution_score: null,
    });
  });

  it('honours an explicit optionIndex into the stored shortlist', async () => {
    storedCandidates = [{ ...V2_CANDIDATE, resolution: overtureResolution('confirm', ['HaKosem Jaffa']) }];

    const body = await postConfirm({ optionIndex: 1 });

    expect(body.results[0]?.provider).toBe('overture');
    // The picked entry's facts, off the stored row — the request carried the number 1 and nothing
    // else. There is no field of this request through which a name or a coordinate can arrive.
    expect(callTo('resolve_place')).toMatchObject({
      p_provider_place_id: 'gers-HaKosem Jaffa',
      p_name: 'HaKosem Jaffa',
      p_lat: 32.06,
    });
  });

  it('fails just that item when optionIndex addresses no stored option', async () => {
    storedCandidates = [{ ...V2_CANDIDATE, resolution: overtureResolution('preselect') }];

    const body = await postConfirm({ optionIndex: 4 });

    expect(body.results[0]?.status).toBe('failed');
    // Never a clamp to the top entry: that would save a different place than the user picked.
    expect(callTo('resolve_place')).toBeUndefined();
  });

  it('keeps the llm_guess path byte-identical for a row with no resolution at all', async () => {
    // The six pre-resolver rows on the local database. "Never asked" is not "asked and found
    // nothing", and neither is a reason to lose the save.
    storedCandidates = [V2_CANDIDATE];

    const body = await postConfirm();

    expect(body.results[0]?.provider).toBe('llm_guess');
    expect(body.results[0]?.resolutionScore).toBeNull();
    expect(callTo('resolve_place')).toMatchObject({ p_name: 'HaKosem', p_lat: 32.0708 });
  });

  it('saves a resolved candidate the model gave no coordinate of its own', async () => {
    // Previously an automatic `skipped`. The resolver has a real coordinate for it, so the skip
    // would now be throwing away the better answer.
    storedCandidates = [
      { ...V2_CANDIDATE, coordinates: null, resolution: overtureResolution('preselect') },
    ];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('saved');
    expect(callTo('resolve_place')).toMatchObject({ p_lat: 32.07515, p_provider: 'overture' });
  });

  it('still skips a candidate neither the model nor the resolver could place', async () => {
    storedCandidates = [
      {
        ...V2_CANDIDATE,
        coordinates: null,
        resolution: {
          kind: 'answered',
          result: {
            shortlist: [],
            confidence: { band: 'no_match', score: 0, margin: null },
            regionsSearched: ['tlv'],
            candidatesPrefiltered: 4,
          },
        },
      },
    ];

    const body = await postConfirm();

    expect(body.results[0]?.status).toBe('skipped');
    expect(body.results[0]?.reason).toBe('no_coordinates');
    expect(callTo('resolve_place')).toBeUndefined();
  });

  it('ignores a request that tries to smuggle place facts alongside the index', async () => {
    // The confirmed 2026 exploit: `name`/`lat`/`lng` in the body reaching `resolve_place` on a
    // service-role client, renaming and relocating a place other users had saved. The contract is a
    // reference plus a note, and an unknown key is stripped rather than honoured.
    storedCandidates = [{ ...V2_CANDIDATE, resolution: overtureResolution('preselect') }];

    await postConfirm({ name: 'ATTACKER RENAMED THIS', lat: 48.8584, lng: 2.2945, provider: 'overture' });

    expect(callTo('resolve_place')).toMatchObject({ p_name: 'HaKosem Falafel', p_lat: 32.07515 });
    expect(JSON.stringify(rpcCalls)).not.toContain('ATTACKER');
  });
});
