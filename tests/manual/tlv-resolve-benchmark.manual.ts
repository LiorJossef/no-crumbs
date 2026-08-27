/**
 * TLV-RESOLVE-T4 — the Tel Aviv subset of the 44-case benchmark, run through the **real** resolver
 * against the **real** local `poi_index`.
 *
 * NOT part of CI (`vitest.config.ts` includes only `tests/unit/**` and `src/**`). Run it with:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> \
 *     npx vitest run tests/manual/tlv-resolve-benchmark.manual.ts \
 *       --config tests/manual/vitest.manual.config.ts
 *
 * ## Why this exists
 *
 * `tests/unit/places/benchmark-golden.test.ts` replays the 44 cases against a *recorded* candidate
 * set, so it can only ever prove the scorer did not drift. It cannot see the two things that decide
 * whether the product resolves a real place: whether the SQL prefilter returns the winning row at
 * all, and whether a loaded region actually contains the venue. Those live in
 * `src/integrations/supabase/place-resolver.ts` and in `public.poi_index`, and until `poi_index`
 * was loaded (2026-08-27, 10 462 rows for `tlv`) there was nothing to run them against. `10` §5's
 * recall gate — *the eventual winner is inside the prefilter's output* — is checked here and
 * nowhere else.
 *
 * What runs is the shipped adapter: `overturePlaceResolver(supabasePoiIndexGateway(client))`. No
 * scoring, no prefiltering and no region logic is reimplemented in this file; if a number moves,
 * this file is not where it came from.
 *
 * ## Adjudication, and its limits
 *
 * A pass/fail needs a rule, and `benchmark-spec.json`'s `expected_name` is prose written for a
 * human ("any real Tel Aviv venue named Bar 51", "HaKosem / הקוסם"). `ACCEPT` below turns each of
 * the 15 cases into an explicit machine rule, derived from that case's `expected_name` /
 * `expected_area` and nothing else. Two rules about the rules:
 *
 *  - **Name acceptance is the default.** `benchmark-spec.json`'s own scoring key says that for a
 *    multi-branch case with no branch hint, *any* genuine branch counts (TLV-05 Miznon, TLV-10
 *    Anita, TLV-14 Bar 51), so those cases carry no address constraint.
 *  - **An address constraint is added only where the spec names a specific street AND the index
 *    genuinely holds several distinct venues of that name**, i.e. where "same business, same
 *    branch" is a real distinction the resolver can get wrong. That is TLV-06 and TLV-07: the
 *    index holds HaKosem at שלמה המלך 1 *and* a Sarona Market branch, and the spec pins the
 *    former. Without the constraint the Sarona row would score as a pass and a genuine
 *    wrong-branch failure would be invisible.
 *
 * Every case prints its top-1 name, address and coordinates regardless, so a human can re-adjudicate
 * any verdict from the run record without re-running anything.
 *
 * ## Skipping
 *
 * Skips — never fails — when the service key is unset, the Supabase URL is not local, the container
 * is down, or `poi_index` holds no `tlv` rows. It refuses outright to run against a non-local URL:
 * this harness reads with the service role, and pointing it at staging or production would be a
 * silent privilege escalation of a "test".
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `place-resolver.ts` opens with `import 'server-only'`, which throws outside a server bundle.
// Same mock, same reason, as `tests/unit/integrations/supabase/place-resolver.test.ts`.
vi.mock('server-only', () => ({}));

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  MAX_PREFILTER_ROWS,
  overturePlaceResolver,
  supabasePoiIndexGateway,
} from '@/integrations/supabase/place-resolver';
import { normalise } from '@/domain/places/normalise';
import type { OpCtx } from '@/domain/ports';
import type { CategoryHint, ResolveQuery } from '@/domain/types';

import benchmarkSpec from '../../docs/evidence/places/benchmark-spec.json' with { type: 'json' };
import ingestConfig from '../../scripts/poi-ingest.config.json' with { type: 'json' };

/* ------------------------------------------------------------------------------------------- *
 * The cases, straight from the spec file.
 * ------------------------------------------------------------------------------------------- */

interface SpecCase {
  readonly id: string;
  readonly query: string;
  readonly city_hint: string | null;
  readonly category_hint: string | null;
  readonly expected_name: string;
  readonly expected_area: string;
  readonly kind: string;
  readonly label_confidence: string;
}

const CASES: readonly SpecCase[] = (benchmarkSpec.cases as readonly SpecCase[]).filter(
  (c) => c.id.startsWith('TLV-') || c.id === 'NEG-03',
);

/** The regression floor. Measured 2026-08-27 on release 2026-07-22.0, `tlv` at 31.95–32.40 /
 *  34.70–35.00, 10 462 rows — see `docs/evidence/places/tlv-resolve-benchmark.md`. It is a floor,
 *  not a target: raise it when a change earns more, and never lower it to make a run pass. */
const BASELINE_TOP1_CORRECT = 7;

/* ------------------------------------------------------------------------------------------- *
 * Adjudication rules — see the header for how these were derived.
 * ------------------------------------------------------------------------------------------- */

interface Accept {
  /** Applied to `normalise(top1.name)`. `null` for the negative case. */
  readonly name: RegExp | null;
  /** Applied to the raw `address_line` + ' ' + `locality`. Only where a branch is pinned. */
  readonly address?: RegExp;
  /** NEG-*: correct means no confident resolution. */
  readonly expectNone?: true;
}

const ACCEPT: Readonly<Record<string, Accept>> = {
  'TLV-01': { name: /^port said/u },
  'TLV-02': { name: /levinsky 41|לוינסקי 41/u },
  'TLV-03': { name: /bellboy/u },
  'TLV-04': { name: /imperial craft cocktail bar/u },
  // Multi-branch, no branch hint: any genuine Miznon counts (spec `scoring.branch_ok`).
  'TLV-05': { name: /miznon|מזנון/u },
  // Branch pinned by the spec: "Shlomo HaMelech / King George".
  'TLV-06': { name: /hakosem|הקוסם/u, address: /שלמה המלך|king george/iu },
  'TLV-07': { name: /הקוסם|hakosem/u, address: /שלמה המלך|king george/iu },
  'TLV-08': { name: /אורנה ואלה|orna and ella|orna & ella/u },
  'TLV-09': { name: /xoho|זוהו/u },
  'TLV-10': { name: /^anita/u },
  'TLV-11': { name: /^port said/u },
  'TLV-12': { name: /bellboy/u },
  'TLV-13': { name: /(sabich|סביח).*(oved|עובד)|(oved|עובד).*(sabich|סביח)/u },
  'TLV-14': { name: /bar 51/u },
  'NEG-03': { name: null, expectNone: true },
};

/* ------------------------------------------------------------------------------------------- *
 * Environment probe. Everything here decides skip-or-run; nothing here asserts.
 * ------------------------------------------------------------------------------------------- */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

interface Probe {
  readonly ok: boolean;
  readonly reason: string;
  readonly client: SupabaseClient | null;
  readonly rows: number;
  readonly region: Record<string, unknown> | null;
}

async function probe(): Promise<Probe> {
  const none = { ok: false, client: null, rows: 0, region: null } as const;
  if (KEY === '') {
    return {
      ...none,
      reason:
        'SUPABASE_SERVICE_ROLE_KEY is not set. Get the local one from `npx supabase status` and ' +
        'pass it on the command line; this harness never reads .env files.',
    };
  }
  if (!isLocal(URL_)) {
    return {
      ...none,
      reason: `refusing to run against a non-local Supabase URL (${URL_}). Local only, by design.`,
    };
  }

  const client = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: regions, error: regionError } = await client
    .from('poi_regions')
    .select('id, is_loaded, norm_version, dataset_release, min_lat, max_lat, min_lng, max_lng, row_count')
    .eq('id', 'tlv')
    .maybeSingle();

  if (regionError !== null) {
    return { ...none, reason: `local Supabase not reachable or poi_regions unreadable: ${regionError.message}` };
  }
  if (regions === null || regions.is_loaded !== true) {
    return { ...none, reason: 'region `tlv` is not loaded (`poi_regions.is_loaded` is not true). Run the ingest first.' };
  }

  const { count, error: countError } = await client
    .from('poi_index')
    .select('dataset_place_id', { count: 'exact', head: true })
    .eq('region_id', 'tlv');

  if (countError !== null) {
    return { ...none, reason: `poi_index unreadable: ${countError.message}` };
  }
  if ((count ?? 0) === 0) {
    return { ...none, reason: 'poi_index holds no rows for region `tlv`.' };
  }

  return { ok: true, reason: 'ready', client, rows: count ?? 0, region: regions as Record<string, unknown> };
}

const env = await probe();
if (!env.ok) {
  // Printed once, loudly, because a silently skipped benchmark is worse than no benchmark.
  console.warn(`\n[tlv-resolve-benchmark] SKIPPED — ${env.reason}\n`);
}

/* ------------------------------------------------------------------------------------------- *
 * The run.
 * ------------------------------------------------------------------------------------------- */

interface CaseResult {
  readonly id: string;
  readonly query: string;
  readonly cityHint: string | null;
  readonly categoryHint: string | null;
  readonly expectedName: string;
  readonly expectedArea: string;
  readonly regionsSearched: readonly string[];
  readonly candidatesPrefiltered: number;
  readonly band: string;
  readonly score: number;
  readonly margin: number | null;
  readonly top1: {
    readonly name: string;
    readonly address: string | null;
    readonly locality: string | null;
    readonly lat: number;
    readonly lng: number;
    readonly providerCategory: string | null;
    readonly datasetConfidence: number;
    readonly nameScore: number;
    readonly tokenCoverage: number;
    readonly categoryScore: number;
  } | null;
  readonly top3: readonly string[];
  readonly pass: boolean;
  readonly falseAutoAccept: boolean;
  /** 1-based rank of the first candidate the case's rule accepts, over the **whole** ranking, or
   *  `null` if the prefilter never returned an acceptable row. This is `10` §5's recall gate made
   *  observable: `null` means the winner was not in the prefilter's output (absent from the index,
   *  or unreachable from these tokens), `> 1` means it was there and the scorer ranked it below
   *  something else. Those are two different defects with two different fixes, and a top-1 verdict
   *  alone cannot tell them apart. */
  readonly acceptedRank: number | null;
  /** `ok` | `ranking` | `not_in_prefilter` | `no_region_searched`. Derived, not hand-labelled. */
  readonly failureKind: string;
}

function ctx(): OpCtx {
  return {
    signal: new AbortController().signal,
    importId: null,
    log: { event: () => {} },
  };
}

/** The three the scorer can score (`domain/types.ts`); the spec only ever emits those three. */
function categoryHintOf(raw: string | null): CategoryHint | null {
  return raw === 'cafe' || raw === 'bar' || raw === 'restaurant' ? raw : null;
}

/** The rule, applied to one candidate. Used both for the top-1 verdict and for `acceptedRank`. */
function accepts(rule: Accept, name: string, address: string | null, locality: string | null): boolean {
  if (rule.name === null) return false;
  if (!rule.name.test(normalise(name))) return false;
  if (rule.address !== undefined && !rule.address.test(`${address ?? ''} ${locality ?? ''}`)) {
    return false;
  }
  return true;
}

function adjudicate(c: SpecCase, result: CaseResult['top1'], band: string): boolean {
  const rule = ACCEPT[c.id];
  if (rule === undefined) throw new Error(`no adjudication rule for ${c.id}`);
  if (rule.expectNone === true) {
    // Correct means the resolver did not confidently produce a venue. `06` §6.3's own standard for
    // the three no-name captions is the 0.92 preselect gate, so `confirm` counts as caught. The
    // stricter reading of `benchmark-spec.json` ("returns nothing") is reported separately in the
    // summary rather than silently folded into this number — see `negatives reaching confirm`.
    return band !== 'preselect';
  }
  if (result === null) return false;
  return accepts(rule, result.name, result.address, result.locality);
}

const results: CaseResult[] = [];

describe.skipIf(!env.ok)('TLV benchmark subset against the real poi_index', () => {
  const resolver = overturePlaceResolver(supabasePoiIndexGateway(env.client as SupabaseClient));

  for (const c of CASES) {
    it(`${c.id} — ${c.query}`, async () => {
      const query: ResolveQuery = {
        text: c.query,
        cityHint: c.city_hint,
        countryHint: null,
        categoryHint: categoryHintOf(c.category_hint),
        near: null,
        // The whole ranking, not the product's top 5, so `acceptedRank` can see where the right
        // row actually landed. `score.ts` divergence 2: `margin` and `band` are computed on the
        // full ranking before `maxResults` truncates it, so this cannot move a band.
        maxResults: MAX_PREFILTER_ROWS,
      };

      const res = await resolver.resolve(query, ctx());
      const top = res.shortlist[0] ?? null;
      const top1: CaseResult['top1'] =
        top === null
          ? null
          : {
              name: top.place.name,
              address: top.place.addressLine,
              locality: top.place.locality,
              lat: top.place.lat,
              lng: top.place.lng,
              providerCategory: top.place.providerCategory,
              datasetConfidence: top.place.datasetConfidence,
              nameScore: top.nameScore,
              tokenCoverage: top.tokenCoverage,
              categoryScore: top.categoryScore,
            };

      const pass = adjudicate(c, top1, res.confidence.band);
      const rule = ACCEPT[c.id] as Accept;
      const acceptedIndex =
        rule.expectNone === true
          ? -1
          : res.shortlist.findIndex((r) =>
              accepts(rule, r.place.name, r.place.addressLine, r.place.locality),
            );
      const acceptedRank = acceptedIndex >= 0 ? acceptedIndex + 1 : null;
      const failureKind = pass
        ? 'ok'
        : res.regionsSearched.length === 0
          ? 'no_region_searched'
          : acceptedRank === null
            ? 'not_in_prefilter'
            : 'ranking';

      const record: CaseResult = {
        id: c.id,
        query: c.query,
        cityHint: c.city_hint,
        categoryHint: c.category_hint,
        expectedName: c.expected_name,
        expectedArea: c.expected_area,
        regionsSearched: [...res.regionsSearched],
        candidatesPrefiltered: res.candidatesPrefiltered,
        band: res.confidence.band,
        score: res.confidence.score,
        margin: res.confidence.margin,
        top1,
        top3: res.shortlist.slice(0, 3).map((r) => `${r.place.name} (${r.score.toFixed(3)})`),
        pass,
        falseAutoAccept: res.confidence.band === 'preselect' && !pass,
        acceptedRank,
        failureKind,
      };
      results.push(record);

      // Per-case assertion, and only this one: a `preselect` that is wrong is the failure mode the
      // product cannot survive, because it never reaches a human. A wrong `confirm` is a ranking
      // problem the user can see and correct, so it is recorded and rolled into the summary rather
      // than failing the case — otherwise the harness would be red for known, accepted misses and
      // nobody would run it.
      expect(
        record.falseAutoAccept,
        `${c.id} auto-accepted the wrong venue: "${top1?.name}" @ ${top1?.address} ` +
          `(score ${record.score.toFixed(3)}, margin ${record.margin?.toFixed(3) ?? 'null'}); ` +
          `expected ${c.expected_name} in ${c.expected_area}`,
      ).toBe(false);
    });
  }

  it('summary: zero false auto-accepts, and top-1 accuracy has not regressed', () => {
    expect(results.length, 'every case ran').toBe(CASES.length);

    const falseAutoAccepts = results.filter((r) => r.falseAutoAccept);
    const correct = results.filter((r) => r.pass);
    const bands = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.band] = (acc[r.band] ?? 0) + 1;
      return acc;
    }, {});

    console.log(report(results, correct.length, bands));

    // THE assertion. Everything else in this file is diagnostics.
    expect(
      falseAutoAccepts.map((r) => `${r.id}→${r.top1?.name}`),
      'a preselect that is wrong is shown to the user as settled fact',
    ).toEqual([]);

    expect(
      correct.length,
      `top-1 accuracy regressed below the recorded floor of ${BASELINE_TOP1_CORRECT}/${CASES.length}`,
    ).toBeGreaterThanOrEqual(BASELINE_TOP1_CORRECT);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Reporting.
 * ------------------------------------------------------------------------------------------- */

function report(rows: readonly CaseResult[], correct: number, bands: Record<string, number>): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`TLV benchmark — ${URL_}, region tlv, ${env.rows} rows, release ${ingestConfig.overtureRelease}`);
  lines.push('');
  const widths = [8, 8, 5, 10, 7, 7, 30, 24, 20, 5, 18];
  lines.push(
    ['case', 'regions', 'pre', 'band', 'score', 'margin', 'top1', 'address', 'lat,lng', 'rank', 'verdict']
      .map((h, i) => h.padEnd(widths[i] as number))
      .join(' '),
  );
  for (const r of rows) {
    lines.push(
      [
        r.id.padEnd(8),
        (r.regionsSearched.join(',') || '—').padEnd(8),
        String(r.candidatesPrefiltered).padEnd(5),
        r.band.padEnd(10),
        r.score.toFixed(3).padEnd(7),
        (r.margin === null ? 'null' : r.margin.toFixed(3)).padEnd(7),
        (r.top1?.name ?? '—').slice(0, 29).padEnd(30),
        (r.top1?.address ?? '—').slice(0, 23).padEnd(24),
        (r.top1 === null ? '—' : `${r.top1.lat.toFixed(5)},${r.top1.lng.toFixed(5)}`).padEnd(20),
        String(r.acceptedRank ?? '—').padEnd(5),
        r.pass ? 'ok' : `FAIL ${r.failureKind}`,
      ].join(' '),
    );
  }
  lines.push('');
  lines.push(`top-1 correct: ${correct}/${rows.length}`);
  lines.push(`bands: ${Object.entries(bands).map(([b, n]) => `${b}=${n}`).join('  ')}`);
  lines.push(`false auto-accepts (preselect AND wrong): ${rows.filter((r) => r.falseAutoAccept).length}`);
  const failures = rows.filter((r) => !r.pass);
  lines.push(
    `failure kinds: ${
      Object.entries(
        failures.reduce<Record<string, string[]>>((acc, r) => {
          (acc[r.failureKind] ??= []).push(r.id);
          return acc;
        }, {}),
      )
        .map(([k, ids]) => `${k}=${ids.length} (${ids.join(' ')})`)
        .join('  ') || 'none'
    }`,
  );
  const negatives = rows.filter((r) => ACCEPT[r.id]?.expectNone === true);
  lines.push(
    `negatives (expect NONE): ${negatives.length}; reaching preselect: ${
      negatives.filter((r) => r.band === 'preselect').length
    }; reaching confirm, i.e. still shown as candidates: ${
      negatives.filter((r) => r.band === 'confirm').map((r) => r.id).join(',') || 'none'
    }`,
  );
  lines.push('');
  return lines.join('\n');
}

const OUT = fileURLToPath(new URL('../../docs/evidence/places/tlv-resolve-benchmark-run.json', import.meta.url));

afterAll(() => {
  if (!env.ok || results.length === 0) return;
  const payload = {
    _comment:
      'Machine record of a tests/manual/tlv-resolve-benchmark.manual.ts run. Regenerated by ' +
      're-running the harness; see tlv-resolve-benchmark.md for the human reading.',
    run_at: new Date().toISOString(),
    supabase_url: URL_,
    overture_release: ingestConfig.overtureRelease,
    region: env.region,
    poi_index_rows_tlv: env.rows,
    summary: {
      cases: results.length,
      top1_correct: results.filter((r) => r.pass).length,
      false_auto_accepts: results.filter((r) => r.falseAutoAccept).length,
      bands: results.reduce<Record<string, number>>((acc, r) => {
        acc[r.band] = (acc[r.band] ?? 0) + 1;
        return acc;
      }, {}),
    },
    cases: results,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[tlv-resolve-benchmark] wrote ${OUT}`);
});
